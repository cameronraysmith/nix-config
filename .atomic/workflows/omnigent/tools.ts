import { readFile, writeFile, chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { isDeepStrictEqual } from "node:util";
import { Blocked, relativePath, unreachable, within } from "../bump/types.js";
import { capture, changed, lines, quote, requireSuccess, scopeGate, type ProcessReceipt, processReceipt } from "../bump/tools.js";
import { type Gate, type SliceChange } from "./types.js";
import { slices, issuer, hostEnvironment, domain, acpAgent, runtimeEnvironmentJustification } from "./slices.js";
import { changeSha, type DeploymentSource } from "./deployment.js";

export { capture, save, snapshot, processCheckpoint } from "../bump/tools.js";
export type { ProcessReceipt } from "../bump/tools.js";
export type Tree = Record<string, string>;
export function classifyScope(before: Tree, after: Tree, allowed: readonly string[], workingPaths: string[]) {
  const isAllowed = (p: string) => allowed.some((prefix) => within(p, prefix));
  const filtered = (tree: Tree) => Object.fromEntries(Object.entries(tree).filter(([p]) => isAllowed(p)));
  const attributed = scopeGate(filtered(before), filtered(after), [...allowed]);
  const foreignDuringStage = changed(before, after).filter((p) => !isAllowed(p));
  const foreign = workingPaths.filter((p) => !isAllowed(p) && !foreignDuringStage.includes(p));
  return { attributed, foreign, foreignDuringStage };
}
export const tfstatePaths = ["terraform/terraform.tfstate", "terraform/terraform.tfstate.backup"] as const;
export const varsPaths = ["vars/per-machine/magnetite/kanidm-oauth2-omnigent", "vars/per-machine/magnetite/omnigent-cookie-secret-omnigent"];
export function assertNoPreexisting(workingPaths: readonly string[], allowed: readonly string[]): void {
  const overlaps = workingPaths.filter((p) => allowed.some((prefix) => within(p, prefix)));
  if (overlaps.length) throw new Blocked(`Preexisting slice changes require ownership reconciliation: ${overlaps.join(", ")}`);
}
export function assertScopeInputs(expected: Tree, current: Tree, allowed: readonly string[]): void {
  const drift = changed(expected, current).filter((p) => allowed.some((prefix) => within(p, prefix)));
  if (drift.length) throw new Blocked(`Slice content changed before writer; ownership reconciliation required: ${drift.join(", ")}`);
}
export function reviewedPaths(baseline: Tree, reviewed: Tree, current: Tree, allowed: readonly string[], workingPaths: string[]): string[] {
  const owned = changed(baseline, reviewed).filter((p) => allowed.some((prefix) => within(p, prefix)));
  const unexpected = workingPaths.filter((p) => allowed.some((prefix) => within(p, prefix)) && !owned.includes(p));
  const drift = changed(reviewed, current).filter((p) => allowed.some((prefix) => within(p, prefix)));
  if (unexpected.length || drift.length) throw new Blocked(`Unreviewed slice content requires reconciliation: ${[...new Set([...unexpected, ...drift])].join(", ")}`);
  if (owned.some((p) => !workingPaths.includes(p))) throw new Blocked("Reviewed paths no longer belong to @");
  return owned;
}
export async function assertChangeSha(cwd: string, change: string, gateSha: string, signal: AbortSignal, execute = capture) {
  const observedSha = await changeSha(cwd, change, signal, execute);
  if (gateSha === observedSha) return { gateSha, observedSha, toolingOnlyDrift: [] as string[] };
  const differing = lines(requireSuccess(await execute(cwd, `git --no-pager diff --name-only ${quote(gateSha)} ${quote(observedSha)}`, signal)));
  if (!differing.length || differing.some((p) => !p.startsWith(".atomic/"))) throw new Blocked(`Change commit changed: gate=${gateSha}; observed=${observedSha}`);
  return { gateSha, observedSha, toolingOnlyDrift: differing };
}
export function squashCommand(change: string, paths: readonly string[], allowed: readonly string[], from = "@"): string {
  if (from !== "@" && !/^[k-z]+$/.test(from)) throw new Blocked("Squash source must be @ or a jj change id");
  if (!/^[k-z]+$/.test(change) || !paths.length || paths.some((p) => !relativePath(p) || !allowed.some((prefix) => within(p, prefix)))) throw new Blocked("Squash path outside allowed prefixes or empty path set");
  return `jj squash --from ${from === "@" ? "@" : quote(from)} --into ${quote(change)} --use-destination-message${from === "@" ? " --keep-emptied" : ""} -- ${paths.map(quote).join(" ")}`;
}
const jj = (cwd: string, signal: AbortSignal) => async (command: string) => requireSuccess(await capture(cwd, command, signal));
export async function ids(cwd: string, revset: string, signal: AbortSignal): Promise<string[]> {
  return lines(await jj(cwd, signal)(`jj --ignore-working-copy log --no-graph -r ${quote(revset)} -T 'change_id ++ "\\n"'`));
}
export async function oneId(cwd: string, revset: string, signal: AbortSignal): Promise<string> {
  const result = await ids(cwd, revset, signal);
  if (result.length !== 1 || !/^[k-z]+$/.test(result[0]!)) throw new Blocked(`Expected exactly one change: ${revset}`);
  return result[0]!;
}
export async function pathsIn(cwd: string, revision: string, signal: AbortSignal): Promise<string[]> {
  return lines(await jj(cwd, signal)(`jj --ignore-working-copy diff -r ${quote(revision)} --name-only`));
}
export async function assertHealthy(cwd: string, workingCopy: string, signal: AbortSignal): Promise<void> {
  if (await oneId(cwd, "@", signal) !== workingCopy) throw new Blocked("Working copy change id moved");
  const log = await jj(cwd, signal)("jj --ignore-working-copy log --no-graph -r 'ancestors(@) & mutable()'");
  if (/\(divergent\)|wip\?\?/.test(log) || (await ids(cwd, "ancestors(@) & conflicts()", signal)).length) throw new Blocked("Conflicted/divergent development join");
}
export type Topology = { workingCopy: string; join: string; seed: string; tip: string };
export async function verifyTopology(cwd: string, topology: Topology, changes: SliceChange[], signal: AbortSignal): Promise<SliceChange[]> {
  await assertHealthy(cwd, topology.workingCopy, signal);
  if (await oneId(cwd, `${topology.workingCopy}-`, signal) !== topology.join) throw new Blocked("Working copy no longer attached to join");
  let parent = topology.seed;
  for (const [index, change] of changes.entries()) {
    if (change.slice !== index || await oneId(cwd, `${parent}+`, signal) !== change.change_id || await oneId(cwd, `${change.change_id}-`, signal) !== parent) throw new Blocked("Changes do not form a single-child line from seed");
    const allowed: readonly string[] = index === 3 ? [...slices[index]!.allowedPaths, ...varsPaths] : index === 2 ? [...slices[index]!.allowedPaths, ...tfstatePaths] : slices[index]!.allowedPaths;
    const paths = await pathsIn(cwd, change.change_id, signal);
    if (!paths.length || paths.some((p) => !allowed.some((prefix) => within(p, prefix)))) throw new Blocked(`Invalid paths in slice ${index}`);
    parent = change.change_id;
  }
  if (parent !== topology.tip) throw new Blocked("Tip's sole child must be the join");
  let cursor = parent;
  let index = changes.length;
  while (true) {
    const child = await oneId(cwd, `${cursor}+`, signal);
    if (child === topology.join) break;
    const next = slices[index];
    const description = next ? (await jj(cwd, signal)(`jj --ignore-working-copy log --no-graph -r ${quote(child)} -T 'description.first_line()'`)).trim() : "";
    const pending = next && description === `${next.id === 0 ? "docs" : "feat"}(omnigent): ${next.title}`
      && (await pathsIn(cwd, child, signal)).every((p) => [...next.allowedPaths, ...(next.id === 3 ? ["vars/per-machine/magnetite"] : next.id === 2 ? tfstatePaths : [])].some((prefix) => within(p, prefix)));
    if (!pending) throw new Blocked("Tip's sole child must be the join");
    cursor = child;
    index += 1;
  }
  return changes;
}
export async function seedChain(cwd: string, splice: string, name: string, start: number, verified: string[], workingCopy: string, signal: AbortSignal): Promise<{ topology: Topology; changes: SliceChange[]; recovered: boolean; reused_change: string | null; proposal_exists: boolean }> {
  const run = jj(cwd, signal);
  const joinId = await oneId(cwd, "@-", signal);
  await assertHealthy(cwd, workingCopy, signal);
  if (verified.length !== start) throw new Blocked("verified_changes must name exactly the preceding slices in order");
  if (start > 0) {
    const tip = await oneId(cwd, name, signal);
    if (tip !== verified.at(-1)) throw new Blocked("Resume bookmark does not match the last supplied slice");
    const seed = await oneId(cwd, `${verified[0]}-`, signal);
    if (await oneId(cwd, `${seed}-`, signal) !== splice) throw new Blocked("Resume seed parent differs from splice_after");
    const topology = { workingCopy, join: joinId, seed, tip };
    const changes = verified.map((change_id, slice) => ({ slice, change_id, verified: false }));
    await verifyTopology(cwd, topology, changes, signal);
    return { topology, changes, recovered: false, reused_change: null, proposal_exists: false };
  }
  const bookmarked = await ids(cwd, `bookmarks(${quote(name)})`, signal);
  if (bookmarked.length) {
    const describe = async (id: string) => ({
      id, description: await run(`jj --ignore-working-copy log --no-graph -r ${quote(id)} -T 'description.first_line()'`),
      parents: await ids(cwd, `${id}-`, signal), children: await ids(cwd, `${id}+`, signal),
    });
    if (bookmarked.length !== 1) throw new Blocked(`S0 recovery: ambiguous bookmark ${JSON.stringify(bookmarked)}`);
    const anchor = await describe(bookmarked[0]!);
    const s0Description = `docs(omnigent): ${slices[0].title}`;
    const seed = anchor.description === s0Description && anchor.parents.length === 1 ? await describe(anchor.parents[0]!) : anchor;
    const child = seed.children.length === 1 && seed.children[0] !== joinId ? await describe(seed.children[0]!) : null;
    const paths = child ? await pathsIn(cwd, child.id, signal) : [];
    const shape = { bookmark: anchor, seed, child, paths, join: joinId };
    if (seed.parents.length !== 1 || seed.parents[0] !== splice
      || seed.children.length !== 1
      || (child && (child.description !== s0Description || child.parents.length !== 1 || child.parents[0] !== seed.id
        || child.children.length !== 1 || child.children[0] !== joinId
        || paths.some((path) => !slices[0].allowedPaths.some((prefix) => within(path, prefix)))))
      || (!child && seed.children[0] !== joinId)) throw new Blocked(`S0 recovery topology differs: ${JSON.stringify(shape)}`);
    await assertHealthy(cwd, workingCopy, signal);
    if (await oneId(cwd, `${workingCopy}-`, signal) !== joinId) throw new Blocked(`S0 recovery join changed: ${JSON.stringify(shape)}`);
    const proposal = "openspec/changes/deploy-omnigent-magnetite/proposal.md";
    const proposal_exists = lines(await run(`jj --ignore-working-copy file list -r @ ${quote(proposal)}`)).includes(proposal);
    return { topology: { workingCopy, join: joinId, seed: seed.id, tip: seed.id }, changes: [], recovered: true, reused_change: child?.id ?? null, proposal_exists };
  }
  const parents = await ids(cwd, `${joinId}-`, signal);
  if (parents.length < 2) throw new Blocked("Expected an existing development join with multiple parents");
  const before = await ids(cwd, `${splice}+`, signal);
  await run(`jj new --no-edit ${quote(splice)} -m 'wip(omnigent-magnetite): seed chain'`);
  const added = (await ids(cwd, `${splice}+`, signal)).filter((id) => !before.includes(id));
  if (added.length !== 1) throw new Blocked("Seed creation raced another writer");
  const seed = added[0]!;
  await run(`jj bookmark create ${quote(name)} -r ${quote(seed)}`);
  await run(`jj rebase -r ${quote(joinId)} ${[...parents, seed].map((p) => `-d ${quote(p)}`).join(" ")}\njj rebase -s ${quote(workingCopy)} -d ${quote(joinId)}`);
  const bookmarks = lines(await run(`jj --ignore-working-copy log --no-graph -r ${quote(`${joinId}-`)} -T 'local_bookmarks ++ "\\n"'`)).join(" ").split(/\s+/).filter(Boolean).sort();
  await run(`jj describe ${quote(joinId)} -m ${quote(`join N=${parents.length + 1}: ${bookmarks.join(" ")}`)}`);
  const topology = { workingCopy, join: joinId, seed, tip: seed };
  await verifyTopology(cwd, topology, [], signal);
  return { topology, changes: [], recovered: false, reused_change: null, proposal_exists: false };
}
export async function createChange(cwd: string, topology: Topology, slice: number, signal: AbortSignal): Promise<string> {
  await assertHealthy(cwd, topology.workingCopy, signal);
  const title = `${slice === 0 ? "docs" : "feat"}(omnigent): ${slices[slice]!.title}`;
  const message = slice === 5 ? `${title}\n\n${runtimeEnvironmentJustification}` : title;
  const child = await oneId(cwd, `${topology.tip}+`, signal);
  if (child !== topology.join) {
    const description = (await jj(cwd, signal)(`jj --ignore-working-copy log --no-graph -r ${quote(child)} -T 'description.first_line()'`)).trim();
    const paths = await pathsIn(cwd, child, signal);
    const allowed: readonly string[] = slice === 3 ? [...slices[slice]!.allowedPaths, "vars/per-machine/magnetite"] : slice === 2 ? [...slices[slice]!.allowedPaths, ...tfstatePaths] : slices[slice]!.allowedPaths;
    if (description !== title || paths.some((p) => !allowed.some((prefix) => within(p, prefix)))) throw new Blocked("Cannot splice: tip's sole child is neither the join nor this slice's change");
    let cursor = child;
    for (let index = slice + 1; ; index++) {
      const next = await oneId(cwd, `${cursor}+`, signal);
      if (next === topology.join) break;
      const pendingSlice = slices[index];
      const pendingDescription = pendingSlice ? (await jj(cwd, signal)(`jj --ignore-working-copy log --no-graph -r ${quote(next)} -T 'description.first_line()'`)).trim() : "";
      if (!pendingSlice || pendingDescription !== `feat(omnigent): ${pendingSlice.title}`) throw new Blocked("Cannot splice: tip's sole child is neither the join nor this slice's change");
      cursor = next;
    }
    return child;
  }
  await jj(cwd, signal)(`jj new --no-edit -A ${quote(topology.tip)} -m ${quote(message)}`);
  const change = await oneId(cwd, `${topology.tip}+`, signal);
  if (await oneId(cwd, `${change}+`, signal) !== topology.join) throw new Blocked("Unexpected child after splice");
  await assertHealthy(cwd, topology.workingCopy, signal);
  return change;
}
export async function runGateSandbox(cwd: string, gates: readonly Gate[], source: DeploymentSource, signal: AbortSignal, execute = capture) {
  const sandbox = await mkdtemp(join(tmpdir(), "omnigent-gate-"));
  try {
    requireSuccess(await execute(cwd, `git worktree add --detach ${quote(sandbox)} ${quote(source.sha)}`, signal));
    const observations = [];
    for (const [index, gate] of gates.entries()) {
      try {
        observations.push({ ...await runGate(sandbox, gate, signal, execute, { ...source, primary: cwd }), sha: source.sha });
      } catch (error) {
        throw new Blocked(`Gate ${index} (${gate.kind}) at ${source.sha}: ${String(error)}`);
      }
    }
    return { ...source, passed: observations.every((gate) => gate.passed), observations };
  } finally {
    // Cancellation of a gate must not cancel removal of its detached worktree.
    const cleanup = AbortSignal.timeout(60_000);
    try {
      requireSuccess(await execute(cwd, `git worktree remove --force ${quote(sandbox)}`, cleanup));
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  }
}
export async function runGate(cwd: string, gate: Gate, signal: AbortSignal, execute = capture, source?: DeploymentSource & { primary: string }): Promise<{ passed: boolean; receipt: ProcessReceipt | null; detail: string }> {
  const placeholders = ["__OMNIGENT_SOURCE__", "__OMNIGENT_PRIMARY__", "__OMNIGENT_SANDBOX__"] as const;
  const pin = (value: string) => {
    if (!source && placeholders.some((p) => value.includes(p))) throw new Blocked("Gate requires a committed source");
    return source ? value.replaceAll("__OMNIGENT_SOURCE__", source.source).replaceAll("__OMNIGENT_PRIMARY__", source.primary).replaceAll("__OMNIGENT_SANDBOX__", cwd) : value;
  };
  switch (gate.kind) {
    case "GrepAssert": {
      const passed = new RegExp(gate.pattern, "i").test(await readFile(join(cwd, gate.file), "utf8"));
      return { passed, receipt: null, detail: `${gate.file}: /${gate.pattern}/` };
    }
    case "NixBuildRemote": {
      const installable = pin(gate.installable);
      const result = await execute(cwd, `set -o pipefail; drv=$(nix eval --raw ${quote(`${installable}.drvPath`)}) && nix copy --derivation --to ssh-ng://root@magnetite.zt "$drv" && ssh root@magnetite.zt "nix build --no-link --print-out-paths '$drv^*'"`, signal);
      return { passed: result.exitCode === 0, receipt: processReceipt(result), detail: installable };
    }
    case "Command": {
      if (!gate.expectExitZero && !gate.failureDiagnostic) throw new Blocked("Negative gate requires its exact assertion diagnostic");
      const argv = gate.argv.map((arg) => pin(arg));
      const result = await execute(cwd, argv.map(quote).join(" "), signal);
      const diagnostic = `${result.stdout}\n${result.stderr}`.split("\n").some((line) => line.trim().replace(/^[-*] /, "").replace(/^error: /, "") === gate.failureDiagnostic);
      return { passed: (gate.expectExitZero ? result.exitCode === 0 : result.state === "exited" && result.exitCode > 0 && diagnostic) && (gate.expectStdoutIncludes ?? []).every((s) => result.stdout.includes(s)), receipt: processReceipt(result), detail: gate.argv[0]! };
    }
    case "NixEval": {
      let target: string;
      switch (gate.target.kind) {
        case "Attr": target = quote(pin(gate.target.attr)); break;
        case "Expr": target = `--impure --expr ${quote(pin(gate.target.expr))}`; break;
        default: return unreachable(gate.target);
      }
      const result = await execute(cwd, `nix eval --no-write-lock-file --json ${target}`, signal);
      if (result.exitCode !== 0) return { passed: false, receipt: processReceipt(result), detail: "nix eval failed" };
      const value: unknown = JSON.parse(result.stdout);
      let passed: boolean;
      switch (gate.expect.kind) {
        case "Equal": passed = isDeepStrictEqual(value, gate.expect.value); break;
        case "Includes": passed = gate.expect.values.every((s) => typeof value === "string" ? value.includes(s) : Array.isArray(value) && value.includes(s)); break;
        case "Matches": passed = typeof value === "string" && new RegExp(gate.expect.pattern).test(value); break;
        default: return unreachable(gate.expect);
      }
      return { passed, receipt: processReceipt(result), detail: "JSON expectation checked" };
    }
    default: return unreachable(gate);
  }
}
export const wizard = `
[[ -t 0 && -t 1 ]] || { printf '%s%s%s\\n' "$RED" 'Run interactively on your workstation, not through a workflow logger.' "$RESET" >&2; exit 1; }
TOTAL_STAGES=5
banner 'Omnigent operator setup'
stage 'Grant existing person access'
say 'The idm_admin password is copied to your local clipboard, never to workflow logs. Paste it only into the Kanidm login prompt.'
open_url 'https://accounts.scientistexperience.net/ui/apps'
if confirm 'Copy the idm_admin password to clipboard and grant cameron access?'; then
  clan vars get magnetite kanidm-idm-admin-password/password | cb copy
  KANIDM_URL=https://accounts.scientistexperience.net nix develop -c kanidm login --name idm_admin
  KANIDM_URL=https://accounts.scientistexperience.net nix develop -c kanidm group add-members omnigent_users cameron --name idm_admin
fi
stage 'Copy Atomic credentials'
if confirm 'Copy workstation Atomic auth.json and settings.json to cameron on magnetite (overwrites these two files)?'; then
  ssh cameron@magnetite.zt 'umask 077; mkdir -p ~/.atomic/agent; chmod 700 ~/.atomic/agent'
  scp ~/.atomic/agent/{auth.json,settings.json} cameron@magnetite.zt:~/.atomic/agent/
  ssh cameron@magnetite.zt 'chmod 600 ~/.atomic/agent/auth.json ~/.atomic/agent/settings.json'
fi
stage 'Verify declarative ACP config'
say 'The acp block and host name are delivered declaratively by home-manager (modules/home/ai/omnigent); this stage only reads the result. host_id is minted by omnigent at runtime and must survive activation.'
if confirm 'Show the effective ACP configuration on magnetite?'; then
  ssh cameron@magnetite.zt 'grep -E "^(name:|  *(- )?(name|command|omnigent_mcp|inject_system_prompt):)" ~/.omnigent/config.yaml; echo "host_id present: $(grep -c host_id ~/.omnigent/config.yaml)"'
fi
stage 'Log in to Omnigent'
say 'Open the URL printed by the remote CLI in this workstation browser and authenticate with your Kanidm passkey.'
if confirm 'Log in to Omnigent as cameron on magnetite?'; then
  ssh -t cameron@magnetite.zt 'omnigent login https://omni.scientistexperience.net'
fi
stage 'Optional additional harness credentials'
if confirm 'Also authenticate Claude Code?'; then ssh -t cameron@magnetite.zt 'claude auth login'; fi
if confirm 'Also authenticate Codex?'; then ssh -t cameron@magnetite.zt 'codex login'; fi
say 'Return to Atomic and confirm only after the selected steps have succeeded.'
pause 'Ready to return to Atomic?'
`;
export function renderWizard(template: string): string {
  const marker = template.indexOf("# STAGES —");
  if (marker < 0) throw new Blocked("Wizard template has no STAGES marker");
  return template.slice(0, marker) + "# STAGES — Omnigent operator setup\n" + wizard;
}
export async function writeWizard(cwd: string, root: string): Promise<string> {
  const path = `${root}/omnigent-operator-wizard.sh`;
  const template = await readFile(join(homedir(), ".agents/skills/wizard/template.sh"), "utf8");
  await mkdir(join(cwd, root), { recursive: true });
  await writeFile(join(cwd, path), renderWizard(template), { mode: 0o700 });
  await chmod(join(cwd, path), 0o700);
  return path;
}
export async function probeDeployment(cwd: string, signal: AbortSignal, execute = capture): Promise<{ deployed: true; evidence: string }> {
  const run = async (command: string) => requireSuccess(await execute(cwd, command, signal));
  const active = await run("ssh root@magnetite.zt systemctl is-active omnigent kanidm nginx");
  if (lines(active).length !== 3 || lines(active).some((line) => line !== "active")) throw new Blocked("Required server units are not all active");
  const discovery: unknown = JSON.parse(await run(`ssh root@magnetite.zt curl -fsS ${quote(`${issuer}/.well-known/openid-configuration`)}`));
  if (!discovery || typeof discovery !== "object" || !("issuer" in discovery) || discovery.issuer !== issuer) throw new Blocked("Discovery issuer mismatch");
  const nginxCount = async (pattern: string) => Number(await run(`ssh root@magnetite.zt ${quote(`cfg=$(systemctl show nginx -p ExecStart --value | grep -o '/nix/store/[a-z0-9]*-nginx.conf'); test -n "$cfg" || exit 1; grep -c ${JSON.stringify(pattern)} "$cfg" || true`)}`));
  const buffering = await nginxCount("proxy_buffering off;");
  const vhost = await nginxCount(`server_name ${domain};`);
  if (!Number.isSafeInteger(buffering) || buffering < 1 || !Number.isSafeInteger(vhost) || vhost < 1) throw new Blocked("Live nginx buffering/vhost counts are missing");
  return { deployed: true, evidence: `Server units and discovery issuer observed; nginx proxy_buffering_off_count=${buffering}, omni_vhost_count=${vhost}. Runner login is checked after the wizard.` };
}
export async function probeRunner(cwd: string, signal: AbortSignal, execute = capture) {
  const script = `set -eu
environment=$(systemctl show omnigent-host -p Environment --value)
command=$(systemctl show omnigent-host -p ExecStart --value)
${hostEnvironment.map((value, index) => `case " $environment " in *' ${value} '*|*'"${value}"'*) printf 'env_${index}=true\\n';; *) exit 1;; esac`).join("\n")}
case "$command" in *'--server https://omni.scientistexperience.net'*) printf 'server=true\\n';; *) exit 1;; esac
case "$command" in *'--background'*) exit 1;; esac`;
  const markers = requireSuccess(await execute(cwd, `ssh root@magnetite.zt ${quote(script)}`, signal));
  if (markers !== "env_0=true\nenv_1=true\nenv_2=true\nserver=true") throw new Blocked("Runner settings presence checks failed");
  return { configured: true, environment: hostEnvironment.map((value) => ({ variable: value.split("=")[0]!, present: true })), server: true };
}
export async function probeHarnessCatalog(cwd: string, signal: AbortSignal, execute = capture) {
  const script = `set -eu
environment=$(systemctl show omnigent -p Environment --value)
home=/var/lib/omnigent
config_home=
for entry in $environment; do case "$entry" in HOME=*) home=\${entry#HOME=};; OMNIGENT_CONFIG_HOME=*) config_home=\${entry#OMNIGENT_CONFIG_HOME=};; esac; done
file="\${config_home:-$home/.omnigent}/config.yaml"
test -r "$file" || exit 1
tr ',{}[]' '\n\n\n\n\n' < "$file" | sed -e 's/^[[:space:]-]*//' -e 's/"//g' -e "s/'//g" | grep -E '^(name|command):' | sed -e 's/:[[:space:]]*/: /'`;
  const fields = lines(requireSuccess(await execute(cwd, `ssh root@magnetite.zt ${quote(script)}`, signal)));
  if (!fields.includes(`name: ${acpAgent.name}`) || !fields.includes(`command: ${acpAgent.command}`)) throw new Blocked("Server-side ACP agent fields not observed in the serving process's config");
  return { server_config_observed: true, agent: { name: acpAgent.name, command: acpAgent.command }, http_row: "GET /v1/harnesses requires a session JWT (cookie or Bearer, omnigent/server/auth.py _check_cookie); the acp:atomic row itself is human-attested through the checklist, not tool-verified." };
}
export async function probeClaudeHookEnv(cwd: string, signal: AbortSignal, execute = capture) {
  const script = `set -eu
file=~cameron/.claude/settings.json
test -r "$file" || exit 1
status=0
grep -qF '/tmp/claude' "$file" || status=$?
test "$status" -eq 1 || exit 1
printf 'claude-hook-env=clean\\n'`;
  const marker = requireSuccess(await execute(cwd, `ssh root@magnetite.zt ${quote(script)}`, signal));
  if (marker !== "claude-hook-env=clean") throw new Blocked("Deployed Claude hook environment check missing");
  return { settings_observed: true, tmp_claude_absent: true };
}
