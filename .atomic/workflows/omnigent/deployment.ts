import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { Blocked } from "../bump/types.js";
import { capture, quote, requireSuccess, processReceipt } from "../bump/tools.js";
import { domain } from "./slices.js";

export type DeploymentSource = { source: string; sha: string };
export async function changeSha(cwd: string, change: string, signal: AbortSignal, execute = capture): Promise<string> {
  const sha = requireSuccess(await execute(cwd, `jj --ignore-working-copy log -r ${quote(change)} --no-graph -T commit_id`, signal));
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Blocked("Invalid change git commit id");
  return sha;
}
export function committedSource(cwd: string, sha: string, name: string): DeploymentSource {
  return { source: `git+${pathToFileURL(resolve(cwd)).href}?ref=${name}&rev=${sha}`, sha };
}
export async function resolveRevisionSource(cwd: string, change: string, name: string, signal: AbortSignal, execute = capture): Promise<DeploymentSource> {
  const sha = await changeSha(cwd, change, signal, execute);
  const command = `git cat-file -e ${quote(`${sha}^{commit}`)}`;
  if ((await execute(cwd, command, signal)).exitCode !== 0) {
    requireSuccess(await execute(cwd, "jj git export", signal));
    requireSuccess(await execute(cwd, command, signal));
  }
  return committedSource(cwd, sha, name);
}
export async function resolveSource(cwd: string, tip: string, name: string, signal: AbortSignal, execute = capture): Promise<DeploymentSource> {
  const source = await resolveRevisionSource(cwd, tip, name, signal, execute);
  const { sha } = source;
  const command = `git --no-pager show-ref --verify ${quote(`refs/heads/${name}`)}`;
  const matches = (result: Awaited<ReturnType<typeof capture>>) => result.exitCode === 0 && result.stdout.trim() === `${sha} refs/heads/${name}`;
  if (!matches(await execute(cwd, command, signal))) {
    requireSuccess(await execute(cwd, "jj git export", signal));
    if (!matches(await execute(cwd, command, signal))) throw new Blocked("Chain bookmark was not exported at the verified tip");
  }
  return source;
}
export type JoinDeploymentSource = DeploymentSource & { chainTipSha: string; parents: string[] };
export async function assertJoinRevision(cwd: string, sha: string, chainTipSha: string, signal: AbortSignal, execute = capture): Promise<string[]> {
  const ancestry = requireSuccess(await execute(cwd, `git rev-list --parents -n 1 ${quote(sha)}`, signal)).split(/\s+/);
  const parents = ancestry.slice(1);
  if (ancestry[0] !== sha || parents.length < 2 || parents.some((parent) => !/^[a-f0-9]{40}$/.test(parent))) throw new Blocked(`Development join is not a merge commit: join=${sha}; chain_tip=${chainTipSha}`);
  if ((await execute(cwd, `git merge-base --is-ancestor ${quote(chainTipSha)} ${quote(sha)}`, signal)).exitCode !== 0) throw new Blocked(`Chain tip is not an ancestor of development join: join=${sha}; chain_tip=${chainTipSha}`);
  return parents;
}
export async function resolveJoinSource(cwd: string, tip: string, name: string, signal: AbortSignal, execute = capture): Promise<JoinDeploymentSource> {
  const chain = await resolveSource(cwd, tip, name, signal, execute);
  const join = await resolveRevisionSource(cwd, "@-", name, signal, execute);
  const parents = await assertJoinRevision(cwd, join.sha, chain.sha, signal, execute);
  return { source: `git+${pathToFileURL(resolve(cwd)).href}?rev=${join.sha}`, sha: join.sha, chainTipSha: chain.sha, parents };
}

const Plan = Type.Object({ resource_changes: Type.Array(Type.Object({
  address: Type.String(), mode: Type.String(), type: Type.String(),
  change: Type.Object({ actions: Type.Array(Type.String()), after: Type.Unknown() }),
})) });
export function dnsPlanSummary(value: unknown): { address: string; action: "create" | "no-op"; type: "cloudflare_dns_record"; name: string } {
  if (!Value.Check(Plan, value)) throw new Blocked("Malformed Terraform plan");
  const changes = value.resource_changes.filter((resource) => !(resource.change.actions.length === 1 && resource.change.actions[0] === "no-op"));
  const ours = (resource: Static<typeof Plan>["resource_changes"][number]) =>
    resource.mode === "managed" && resource.type === "cloudflare_dns_record"
    && !!resource.change.after && typeof resource.change.after === "object"
    && ((resource.change.after as { name?: unknown }).name === domain || (resource.change.after as { name?: unknown }).name === domain.split(".")[0]);
  const existingOmni = value.resource_changes.find((resource) => ours(resource) && resource.change.actions.length === 1 && resource.change.actions[0] === "no-op");
  // Our record already exists and every remaining change belongs to someone
  // else's resource: skip rather than apply. Applying here would push another
  // agent's unreviewed infrastructure through this run's authorization.
  if (existingOmni && !changes.some(ours)) return { address: existingOmni.address, action: "no-op" as const, type: "cloudflare_dns_record" as const, name: domain };
  if (changes.length === 0) {
    const existing = value.resource_changes.find((resource) => resource.mode === "managed" && resource.type === "cloudflare_dns_record" && resource.change.after && typeof resource.change.after === "object" && (resource.change.after as { name?: unknown }).name === domain);
    if (!existing) throw new Blocked("Terraform plan has no changes and no existing omni record");
    return { address: existing.address, action: "no-op", type: "cloudflare_dns_record", name: domain };
  }
  const resource: Static<typeof Plan>["resource_changes"][number] | undefined = changes[0];
  const after = resource?.change.after;
  if (changes.length !== 1 || !resource || resource.mode !== "managed" || resource.type !== "cloudflare_dns_record" || resource.change.actions.length !== 1 || resource.change.actions[0] !== "create" || !after || typeof after !== "object" || !("name" in after) || after.name !== domain) throw new Blocked(`Terraform plan must contain exactly one create of cloudflare_dns_record named ${domain}, with no other changes`);
  return { address: resource.address, action: "create", type: "cloudflare_dns_record", name: domain };
}
const digest = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");
export async function planDns(cwd: string, root: string, source: DeploymentSource, signal: AbortSignal) {
  const plan = resolve(cwd, root, "dns.tfplan"), json = `${plan}.json`;
  const wrapper = `nix run ${quote(`${source.source}#terraform.terraform`)} --`;
  requireSuccess(await capture(cwd, `umask 077
config=$(nix build --no-link --print-out-paths ${quote(`${source.source}#terraform.config`)})
mkdir -p terraform
ln -sf "$config" terraform/config.tf.json
${wrapper} init -input=false
${wrapper} plan -input=false -out=${quote(plan)}
${wrapper} show -json ${quote(plan)} > ${quote(json)}
chmod 600 ${quote(plan)} ${quote(json)}`, signal));
  const summary = dnsPlanSummary(JSON.parse(await readFile(json, "utf8")));
  return { ...source, plan, sha256: await digest(plan), summary, execution: "Pinned terraform.config and terraform.terraform passthrough (OpenTofu); shared terraform/ state directory and configured clan passphrase/TF_ENCRYPTION environment. Default terraform app does not forward arguments." };
}
export async function applyDns(cwd: string, plan: Awaited<ReturnType<typeof planDns>>, signal: AbortSignal) {
  if (await digest(plan.plan) !== plan.sha256) throw new Blocked("Saved Terraform plan changed after review");
  requireSuccess(await capture(cwd, `nix run ${quote(`${plan.source}#terraform.terraform`)} -- apply -input=false ${quote(plan.plan)}`, signal));
  return { source: plan.source, sha: plan.sha, plan: plan.plan, sha256: plan.sha256, applied: plan.summary, execution: plan.execution };
}
export async function probeCrossChain(cwd: string, signal: AbortSignal, execute = capture) {
  const observe = async <T>(command: string, project: (output: string) => T) => {
    try {
      const result = await execute(cwd, command, signal);
      return { value: result.exitCode === 0 ? project(result.stdout.trim()) : null, receipt: processReceipt(result), error: null };
    } catch (error) {
      signal.throwIfAborted();
      return { value: null, receipt: null, error: String(error).slice(0, 1024) };
    }
  };
  const unit = await observe("ssh root@magnetite.zt systemctl show gitea-mq.service -p ActiveState -p SubState -p UnitFileState", (output) => {
    const fields = Object.fromEntries(output.split("\n").map((line) => line.split("=")));
    const state = (key: string) => /^[a-z-]{1,64}$/.test(fields[key] ?? "") ? fields[key]! : null;
    return { activeState: state("ActiveState"), subState: state("SubState"), unitFileState: state("UnitFileState") };
  });
  const nginxVhostCount = await observe(`ssh root@magnetite.zt ${quote(`cfg=$(systemctl show nginx -p ExecStart --value | grep -o '/nix/store/[a-z0-9]*-nginx.conf')
test -n "$cfg" || exit 1
grep -Ec '^[[:space:]]*server_name[[:space:]]+mq[.]scientistexperience[.]net[[:space:]]*;' "$cfg"
status=$?
test "$status" -le 1`)}`, (output) => /^\d+$/.test(output) && Number.isSafeInteger(Number(output)) ? Number(output) : null);
  const httpsStatus = await observe("curl -s -o /dev/null -w '%{http_code}\\n' --max-time 30 https://mq.scientistexperience.net", (output) => /^[1-5]\d{2}$/.test(output) ? Number(output) : null);
  return { unit, nginxVhostCount, httpsStatus };
}
export async function observeActivation(cwd: string, source: DeploymentSource, signal: AbortSignal, execute = capture) {
  const expected = requireSuccess(await execute(cwd, `nix eval --no-write-lock-file --raw ${quote(`${source.source}#nixosConfigurations.magnetite.config.system.build.toplevel.outPath`)}`, signal));
  const current = requireSuccess(await execute(cwd, "ssh root@magnetite.zt readlink /run/current-system", signal));
  const systemPath = /^\/nix\/store\/[a-z0-9]{32}-nixos-system-magnetite-[^\s/]+$/;
  if (!systemPath.test(expected) || !systemPath.test(current)) throw new Blocked("Invalid intended or observed magnetite system path; activation not attempted");
  return { expected, current, alreadyActivated: current === expected };
}
const DumpReceipt = Type.Object({ path: Type.String({ pattern: "^/var/backups/omnigent/omnigent-.+\\.sql$" }), bytes: Type.Integer({ minimum: 1 }) });
export async function updateMachine(cwd: string, source: JoinDeploymentSource, signal: AbortSignal, execute = capture) {
  const run = async (command: string) => requireSuccess(await execute(cwd, command, signal));
  const activation = await observeActivation(cwd, source, signal, execute);
  const before = activation.current;
  const identity = { source: source.source, sha: source.sha, chainTipSha: source.chainTipSha, parents: source.parents };
  if (activation.alreadyActivated) return {
    ...identity, activation, outcome: "already-activated" as const, before, after: before, log: null, dump: null,
    crossChain: await probeCrossChain(cwd, signal, execute), invocation: null,
  };
  const dumpOutput = await run(`ssh root@magnetite.zt ${quote(`set -eu
umask 077
mkdir -p /var/backups/omnigent
dump=$(mktemp "/var/backups/omnigent/omnigent-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX.sql")
runuser -u postgres -- pg_dump --dbname=omnigent > "$dump"
test -s "$dump"
bytes=$(wc -c < "$dump")
printf '{"path":"%s","bytes":%s}\\n' "$dump" "$bytes" > "$dump.receipt.json"
cat "$dump.receipt.json"`)}`);
  const dump: unknown = JSON.parse(dumpOutput);
  if (!Value.Check(DumpReceipt, dump)) throw new Blocked("Missing or empty pre-deploy Omnigent dump receipt");
  const log = `logs/magnetite-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
  await run(`SOURCE=${quote(source.source)}\nclan machines update magnetite --flake "$SOURCE" 2>&1 | tee ${quote(log)}`);
  const after = await run("ssh root@magnetite.zt readlink /run/current-system");
  if (after !== activation.expected) throw new Blocked(`Magnetite current-system does not match intended source: expected=${activation.expected}; before=${before}; after=${after}`);
  const crossChain = await probeCrossChain(cwd, signal, execute);
  return { ...identity, activation, outcome: "activated" as const, before, after, log, dump: { path: dump.path, bytes: dump.bytes }, crossChain, invocation: 'clan machines update magnetite --flake "$SOURCE" (git+file URL; installed --flake help permits remote or local flakes)' };
}
