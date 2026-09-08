import { readFile, writeFile, lstat, mkdir } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Type } from "typebox";
import { Blocked, within, unreachable } from "../bump/types.js";
import { quote, requireSuccess } from "../bump/tools.js";
import {
  save,
  squashCommand, classifyScope, type Tree,
} from "../omnigent/tools.js";
import { snapshot, assertHealthy, oneId, ids, pathsIn } from "./vcs.js";
import {
  resolveSource as sharedResolveSource, type DeploymentSource,
} from "../omnigent/deployment.js";
import { capture, captureStreaming, readResponse, assertExternalEvidence, canonicalExternalEvidence } from "./process.js";
export { processCheckpoint, allocateEvidence } from "./process.js";
export { appTokenCleanup } from "./credentials.js";
import { s1Coverage, type S1Arm } from "./s1-observations.js";
import {
  parse, AdoptedS1, Ruleset, AppReply, type RulesetDraft, type VResult,
  type LinearState, type LinearOutcome, type VerifyCommentary,
} from "./types.js";
import {
  api, rulesetApi, aspect, dir, tasks, proposal, verify, domain, repository,
  varsAllowed, negativeControls, rollbackExpr, runtimeEnvironment, s1, postG1, s2, s4, docs, report, type Slice,
} from "./slices.js";
import { passedClaims, type GateEntry } from "./ledger.js";
import { renderVerify, renderRoborevRejection } from "./verify-report.js";
import {
  App, AppInstallation, InstallationPages, RepositoryPages, CollaboratorPages,
  CheckPages, Pull, EventPages, StatusPages, DnsPlan, DnsRecord, S1Configuration,
} from "./api-schemas.js";
export { capture, save, snapshot };
import { taskLedger, humanBoxes, assertHumanBoxes } from "./proposal-edits.js";
export { applyStageEdits, assertTaskScope, taskLedger, humanBoxes, assertHumanBoxes } from "./proposal-edits.js";
export const resolveSource = (cwd: string, tip: string, name: string, signal: AbortSignal) => sharedResolveSource(cwd, tip, name, signal, capture);
export const runStreaming = async (cwd: string, command: string, signal: AbortSignal) => requireSuccess(await captureStreaming(cwd, command, signal));
/** Only inputs owned by this slice (plus shared change/vars inputs) invalidate a proposal. */
export function assertScopedInputs(before: Tree, after: Tree, slice: Slice): { foreignDrift: string[] } {
  const allowed = [...slice.allowedPaths, dir, ...varsAllowed];
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((path) => before[path] !== after[path]).sort();
  const scoped = changed.filter((path) => allowed.some((prefix) => within(path, prefix)));
  if (scoped.length) throw new Blocked(`Scoped inputs changed: ${scoped.join(", ")}`);
  return { foreignDrift: changed };
}
export const run = async (cwd: string, command: string, signal: AbortSignal) =>
  requireSuccess(await capture(cwd, command, signal));
export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const proposalBases = (tree: Tree, slice: Slice): Record<string, string> => Object.fromEntries(Object.entries(tree).filter(([path]) => slice.allowedPaths.some((prefix) => within(path, prefix))).map(([path, value]) => [path, value.replace(/^\d{6}:/, "")]));
const json = async (cwd: string, command: string, signal: AbortSignal): Promise<unknown> =>
  JSON.parse(await run(cwd, command, signal));
const ssh = (command: string) =>
  `ssh -o BatchMode=yes -o ConnectTimeout=10 root@magnetite.zt ${quote(command)}`;
export type Chain = {
  workingCopy: string;
  join: string;
  seed: string;
  tip: string;
  changes: { id: string; paths: string[] }[];
};
export async function detached(cwd: string, signal: AbortSignal): Promise<void> {
  const result = await capture(cwd, "git symbolic-ref -q HEAD", signal);
  if (result.exitCode !== 1 || result.stdout.trim()) throw new Blocked("HEAD must remain detached");
}
export async function topology(cwd: string, chain: Chain, signal: AbortSignal): Promise<string[]> {
  await assertHealthy(cwd, chain.workingCopy, signal);
  await detached(cwd, signal);
  if (await oneId(cwd, "@-", signal) !== chain.join) throw new Blocked("@ no longer child of the join");
  let parent = chain.seed;
  for (const change of chain.changes) {
    if (await oneId(cwd, `${parent}+`, signal) !== change.id ||
        await oneId(cwd, `${change.id}-`, signal) !== parent) {
      throw new Blocked("Chain order changed");
    }
    const actual = await pathsIn(cwd, change.id, signal);
    if (!actual.length || actual.some((path) => !change.paths.includes(path))) {
      throw new Blocked("Routed change path set changed");
    }
    parent = change.id;
  }
  if (parent !== chain.tip || await oneId(cwd, `${parent}+`, signal) !== chain.join ||
      await oneId(cwd, "rollup-landing", signal) !== chain.tip) {
    throw new Blocked("rollup-landing tip/join mismatch");
  }
  return chain.changes.map((c) => c.id);
}
export async function preflight(cwd: string, splice: string, signal: AbortSignal, adoption: { root: string } | null = null) {
  if (resolve(cwd) !== "/Users/crs58/projects/vanixiets") throw new Blocked("Wrong repository cwd");
  await run(cwd, `openspec validate ${quote(dir.split("/").at(-1)!)} --strict`, signal);
  await run(cwd, "jj debug snapshot", signal);
  const allowed = [...new Set([s1, postG1, s2, s4, docs, report].flatMap((slice) => slice.allowedPaths))];
  const workingPaths = await pathsIn(cwd, "@", signal);
  const owned = workingPaths.filter((path) => allowed.some((prefix) => within(path, prefix)));
  if (adoption) {
    const outside = owned.filter((path) => !s1.allowedPaths.some((prefix) => within(path, prefix)));
    if (outside.length) throw new Blocked(`Adoption has pending workflow paths outside S1: ${outside.join(", ")}`);
  } else if (owned.length) throw new Blocked(`Preexisting workflow changes require ownership reconciliation: ${owned.join(", ")}`);
  // Retain unrelated edits in the working tree and subsequent full-tree stage baselines.
  const foreign = workingPaths.filter((path) => !allowed.some((prefix) => within(path, prefix)));
  if (!adoption) try {
    await lstat(join(cwd, aspect));
    throw new Blocked("gitea-mq aspect already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const workingCopy = await oneId(cwd, "@", signal);
  const joinId = await oneId(cwd, "@-", signal);
  const seed = await oneId(cwd, splice, signal);
  if ((await ids(cwd, `${joinId}-`, signal)).length < 2) throw new Blocked("@ parent is not a development join");
  const chain: Chain = { workingCopy, join: joinId, seed, tip: seed, changes: [] };
  await topology(cwd, chain, signal);
  await run(cwd, "gh auth status\nclan vars --help", signal);
  await run(cwd, ssh("true"), signal);
  const nodes = parse(Type.Object({ nodes: Type.Record(Type.String(), Type.Unknown()) }),
    JSON.parse(adoption ? await run(cwd, "jj --ignore-working-copy file show -r @- flake.lock", signal) : await readFile(join(cwd, "flake.lock"), "utf8"))).nodes;
  const lock = JSON.stringify({ nodes: { nixbot: nodes.nixbot, "buildbot-nix": nodes["buildbot-nix"] } });
  const baselineSchema = Type.Object({
    pre: Type.Union([Type.String(), Type.Array(Type.String()), Type.Null()]),
  });
  const baseline = parse(baselineSchema, await json(cwd,
    `nix eval --no-write-lock-file --json .#nixosConfigurations.magnetite.config --apply ${quote('c: { pre = c.systemd.services.gitea.serviceConfig.ExecStartPre or null; }')}`, signal));
  const taskText = await readFile(join(cwd, tasks), "utf8");
  const baselineResult = { chain, lock, baseline, foreign, taskIds: [...taskLedger(taskText).keys()], humanBoxes: humanBoxes(taskText) };
  if (!adoption) return baselineResult;
  assertHumanBoxes(baselineResult.humanBoxes, taskText);
  const tree = scopedS1Tree(await snapshot(cwd, signal));
  const evidence: AdoptedS1 = { adopted: true, paths: owned, tree,
    sha256: Object.fromEntries(owned.map((path) => [path, tree[path]?.replace(/^\d{6}:/, "") ?? null])),
    stat: owned.length ? await run(cwd, `jj --ignore-working-copy diff -r @ --stat -- ${owned.map(quote).join(" ")}`, signal) : "",
  };
  const file = `${adoption.root}/adopted-s1.json`; await save(cwd, file, evidence);
  return { ...baselineResult, adoption: { adopted: true as const, file } };
}
const scopedS1Tree = (tree: Tree): Tree => Object.fromEntries(Object.entries(tree).filter(([path]) => s1.allowedPaths.some((prefix) => within(path, prefix))));
export async function adoptS1(cwd: string, file: string, humanBaseline: string, signal: AbortSignal) {
  const evidence = parse(AdoptedS1, JSON.parse(await readFile(join(cwd, file), "utf8")));
  assertScopedInputs(evidence.tree, scopedS1Tree(await snapshot(cwd, signal)), s1);
  assertHumanBoxes(humanBaseline, await readFile(join(cwd, tasks), "utf8"));
  return { adopted: true as const, file, paths: evidence.paths };
}
export function resetTaskText(text: string, ids: readonly string[]): string {
  return text.split("\n").map((line) =>
    ids.some((id) => line.startsWith(`- [x] ${id} `))
      ? line.replace("- [x]", "- [ ]") : line).join("\n");
}
export async function resetTasks(cwd: string, ids: readonly string[], signal: AbortSignal, humanBaseline: string) {
  signal.throwIfAborted();
  const before = await readFile(join(cwd, tasks), "utf8");
  const after = resetTaskText(before, ids);
  assertHumanBoxes(humanBaseline, after);
  await writeFile(join(cwd, tasks), after);
  return { invalidated: [...ids] };
}
export async function lockInput(cwd: string, lockedDeclaration: string | null, human: string, signal: AbortSignal) {
  const declaration = sha256(await readFile(join(cwd, "flake.nix")));
  if (declaration === lockedDeclaration) return { declaration, relocked: false };
  const before = await snapshot(cwd, signal);
  let scoped: Awaited<ReturnType<typeof scope>>;
  try {
    await run(cwd, "nix flake lock --update-input gitea-mq", signal);
  } finally {
    scoped = await scope(cwd, before, ["flake.lock"], human, signal);
  }
  return { declaration, relocked: true, foreignDrift: scoped.foreignDrift };
}
export async function ensureActivated(cwd: string, source: DeploymentSource, signal: AbortSignal) {
  const expected = await run(cwd, `nix eval --raw --no-write-lock-file ${quote(`${source.source}#nixosConfigurations.magnetite.config.system.build.toplevel.outPath`)}`, signal);
  if (!/^\/nix\/store\/[^/\s]+$/.test(expected)) throw new Blocked("Invalid expected system path");
  const before = await run(cwd, ssh("readlink /run/current-system"), signal);
  const activation = before === expected ? null : await runStreaming(cwd, `CLAN_NO_COMMIT=1 clan machines update magnetite --flake ${quote(source.source)}`, signal);
  const after = await run(cwd, ssh("readlink /run/current-system"), signal);
  if (after !== expected) throw new Blocked("Activated system does not match routed source");
  return { source, expected, before, after, activation, reconciled: activation === null };
}
export async function scope(cwd: string, before: Tree, allowed: readonly string[], humanBefore: string, signal: AbortSignal) {
  const after = await snapshot(cwd, signal);
  // Relocking intentionally changes allowed outputs; all other S1 inputs stay pinned.
  const inputs = (tree: Tree): Tree => Object.fromEntries(Object.entries(tree).filter(([path]) => !allowed.some((prefix) => within(path, prefix))));
  const { foreignDrift } = assertScopedInputs(inputs(before), inputs(after), s1);
  assertHumanBoxes(humanBefore, await readFile(join(cwd, tasks), "utf8"));
  return { tree: after, foreignDrift };
}
export async function snapshotWorkingCopy(cwd: string, signal: AbortSignal) {
  await run(cwd, "jj debug snapshot", signal);
  return { snapshotted: true };
}
const dnsPath = "modules/terranix/cloudflare.nix";
export async function reviewDnsContent(cwd: string, signal: AbortSignal) {
  signal.throwIfAborted();
  return { sha256: sha256(await readFile(join(cwd, dnsPath))) };
}
export async function verifyDnsSource(cwd: string, source: DeploymentSource, reviewed: { sha256: string }, signal: AbortSignal) {
  if (!source.source.startsWith("git+file://") || new URL(source.source).searchParams.get("rev") !== source.sha || !/^[0-9a-f]{40}$/.test(source.sha)) throw new Blocked("DNS source must be revision-pinned git+file");
  const content = await capture(cwd, `git show ${quote(`${source.sha}:${dnsPath}`)}`, signal);
  requireSuccess(content);
  if (sha256(content.stdout) !== reviewed.sha256) throw new Blocked("Routed DNS source differs from reviewed hostname content");
  const record = await run(cwd, `git grep -n -E ${quote('name[[:space:]]*=[[:space:]]*"(mq|mq\\.scientistexperience\\.net)"')} ${quote(source.sha)} -- ${quote(dnsPath)}`, signal);
  return { sha: source.sha, sha256: reviewed.sha256, record };
}
export async function pendingPaths(cwd: string, slice: Slice, signal: AbortSignal): Promise<string[]> {
  return (await pathsIn(cwd, "@", signal))
    .filter((path) => slice.allowedPaths.some((prefix) => within(path, prefix)));
}
export async function route(cwd: string, chain: Chain, slice: Slice, reviewed: Tree, signal: AbortSignal, into: string | null = null): Promise<Chain & { foreignDrift: string[] }> {
  await topology(cwd, chain, signal);
  const { foreignDrift } = assertScopedInputs(reviewed, await snapshot(cwd, signal), slice);
  await run(cwd, "jj debug snapshot", signal);
  const paths = await pendingPaths(cwd, slice, signal);
  if (!paths.length) throw new Blocked("Cannot route empty change");
  if (into !== null && !chain.changes.some((change) => change.id === into)) throw new Blocked("Amendment target is not on the owned chain");
  if (into === null) await run(cwd, `jj new --no-edit -A ${quote(chain.tip)} -m ${quote(`feat(gitea-mq): ${slice.name}`)}`, signal);
  const id = into ?? await oneId(cwd, `${chain.tip}+`, signal);
  await run(cwd, squashCommand(id, paths, slice.allowedPaths), signal);
  if (into === null) await run(cwd, `jj bookmark set rollup-landing -r ${quote(id)}`, signal);
  const next = { ...chain, tip: into === null ? id : chain.tip, changes: into === null ? [...chain.changes, { id, paths }] : chain.changes.map((change) => change.id === id ? { id, paths: [...new Set([...change.paths, ...paths])] } : change) };
  await topology(cwd, next, signal);
  if ((await pendingPaths(cwd, slice, signal)).length) throw new Blocked("Routed paths remain in @");
  return { ...next, foreignDrift };
}
export async function diffArtifact(cwd: string, root: string, name: string, signal: AbortSignal, paths?: readonly string[]) {
  await run(cwd, "jj debug snapshot", signal);
  const file = `${root}/${name}.diff`;
  await writeFile(join(cwd, file), await run(cwd, `jj --ignore-working-copy diff -r @${paths ? ` -- ${paths.map(quote).join(" ")}` : ""}`, signal));
  return file;
}
export async function s1Gate(cwd: string, baselineLock: string, baseline: unknown, signal: AbortSignal, expectedAppId: number | null = null) {
  await run(cwd, "jj debug snapshot", signal);
  const drv = await run(cwd, "nix eval --raw --no-write-lock-file .#checks.x86_64-linux.nixos-magnetite.drvPath", signal);
  if (!drv.startsWith("/nix/store/") || !drv.endsWith(".drv")) throw new Blocked("No host derivation path");
  for (const control of negativeControls) {
    const result = await capture(cwd, `nix eval --impure --no-write-lock-file --expr ${quote(control.expr)}`, signal);
    if (result.state !== "exited" || result.exitCode <= 0 || !`${result.stdout}\n${result.stderr}`.includes(control.message)) throw new Blocked(`Negative control did not fire: ${control.setting}`);
  }
  const locks = Type.Object({ nodes: Type.Record(Type.String(), Type.Unknown()) });
  const old = parse(locks, JSON.parse(baselineLock));
  const current = parse(locks, JSON.parse(await readFile(join(cwd, "flake.lock"), "utf8")));
  for (const node of ["nixbot", "buildbot-nix"]) if (!isDeepStrictEqual(old.nodes[node], current.nodes[node]) || !current.nodes[node]) throw new Blocked(`${node} lock changed`);
  const metadata = parse(Type.Object({ locks }), await json(cwd, "nix flake metadata --json --no-write-lock-file", signal));
  for (const node of ["nixbot", "buildbot-nix"]) if (!isDeepStrictEqual(old.nodes[node], metadata.locks.nodes[node])) throw new Blocked(`${node} metadata changed`);
  if (await run(cwd, "git diff --stat HEAD -- modules/nixos/nixbot.nix modules/nixos/buildbot.nix", signal)) throw new Blocked("Build service aspect changed");
  const expression = `c: let s = c.services.gitea-mq; e = c.systemd.services.gitea-mq.environment; g = c.clan.core.vars.generators; in {
    values = s.batchMax == 0 && s.skipQueueIfUpToDate && s.requiredChecks == [ "nixbot/nix-eval" "nixbot/nix-build" ] && !(e ? GITEA_MQ_MERGE_LABEL);
    service = s.enable && s.externalUrl == "https://${domain}" && s.listenAddr == "127.0.0.1:8092" && !s.hideRefFromClients && s.databaseUrl == "postgres:///gitea-mq?host=/run/postgresql" && s.github.repos == [ "${repository}" ];
    resources = c.systemd.services.gitea-mq.serviceConfig.DynamicUser && c.systemd.services.gitea-mq.serviceConfig.CacheDirectory == "gitea-mq" && !(c.users.users ? gitea-mq) && builtins.elem "gitea-mq" c.services.postgresql.ensureDatabases;
    credentials = builtins.all (f: f.owner == "root" && f.restartUnits == [ "gitea-mq.service" ]) [ g.gitea-mq-github-app-secret-key.files."key.pem" g.gitea-mq-github-webhook-secret.files.secret ];
    bindings = s.github.privateKeyFile == g.gitea-mq-github-app-secret-key.files."key.pem".path && s.github.webhookSecretFile == g.gitea-mq-github-webhook-secret.files.secret.path;
    ownership = builtins.any (u: u.name == "gitea-mq" && u.ensureDBOwnership) c.services.postgresql.ensureUsers;
    appId = s.github.appId;
    environment = e.GITEA_MQ_BATCH_MAX == "0" && e.GITEA_MQ_SKIP_QUEUE_IF_UP_TO_DATE == "true" && e.GITEA_MQ_REQUIRED_CHECKS == "nixbot/nix-eval,nixbot/nix-build" && !(e ? GITEA_MQ_MERGE_LABEL);
    vhost = c.services.nginx.virtualHosts."${domain}".forceSSL && c.services.nginx.virtualHosts."${domain}".enableACME && c.services.nginx.virtualHosts."${domain}".locations."/".proxyPass == "http://127.0.0.1:8092";
    nixbot = c.services.nixbot.domain == "nixbot.scientistexperience.net";
    pre = c.systemd.services.gitea.serviceConfig.ExecStartPre or null;
  }`;
  const config = parse(S1Configuration, await json(cwd,
    `nix eval --json --no-write-lock-file .#nixosConfigurations.magnetite.config --apply ${quote(expression)}`, signal));
  if (![config.values, config.service, config.resources, config.credentials, config.bindings, config.ownership, config.environment, config.vhost, config.nixbot].every(Boolean) || !isDeepStrictEqual({ pre: config.pre }, baseline)) throw new Blocked("S1 evaluated configuration differs from pinned contract");
  if (expectedAppId !== null && config.appId !== expectedAppId) throw new Blocked("App-id differs from tool observation");
  const observed: S1Arm[] = ["host-derivation", "four-negative-controls", "build-locks-unchanged", "build-metadata-unchanged", "build-aspects-unchanged", "landing-settings", "landing-environment", "service-settings", "database-declaration", "credential-root-restart", "credential-bindings", "ensure-users-ownership", "vhost", "nixbot-domain", "dynamic-user", "cache-directory", "no-static-user", "loopback-listener", "forge-pre-unchanged"];
  if (expectedAppId !== null) observed.push("observed-app-id");
  return { drv, negativeControls: negativeControls.map((c) => c.setting), ...s1Coverage(observed) };
}
export async function generateVars(cwd: string, chain: Chain, signal: AbortSignal) {
  await topology(cwd, chain, signal);
  const before = await snapshot(cwd, signal);
  const head = await run(cwd, "git rev-parse HEAD", signal);
  const gitCommits = await run(cwd, "git rev-list --all | sort", signal);
  const changes = await ids(cwd, "all()", signal);
  try { await runStreaming(cwd, "CLAN_NO_COMMIT=1 clan vars generate magnetite --generator gitea-mq-github-webhook-secret", signal); }
  finally {
    await topology(cwd, chain, signal);
    if (head !== await run(cwd, "git rev-parse HEAD", signal) || gitCommits !== await run(cwd, "git rev-list --all | sort", signal) || !isDeepStrictEqual(changes, await ids(cwd, "all()", signal))) throw new Blocked("Clan created a commit or jj change; stop for topology reconciliation");
    if (classifyScope(before, await snapshot(cwd, signal), varsAllowed, []).foreignDuringStage.length) throw new Blocked("Clan changed paths outside the two generator directories");
  }
  const listing = await run(cwd, "CLAN_NO_COMMIT=1 clan vars list magnetite", signal);
  for (const name of ["gitea-mq-github-app-secret-key", "gitea-mq-github-webhook-secret"]) {
    if (!listing.split("\n").some((line) => line.includes(name) && !/not.set|missing|false|unset/i.test(line))) throw new Blocked(`Vars list missing populated ${name}`);
  }
  for (const file of [`${varsAllowed[0]}/key.pem/secret`, `${varsAllowed[1]}/secret/secret`]) {
    const envelope = await readFile(join(cwd, file), "utf8");
    if (!envelope.includes('"sops"') || !envelope.includes("ENC[") || envelope.includes("PRIVATE KEY")) throw new Blocked("Expected sops envelope, not plaintext");
  }
  return { generated: true, noCommitEnvironment: "CLAN_NO_COMMIT=1", generators: varsAllowed };
}

const appAuthScript = `import base64,json,os,subprocess,sys,time,tempfile

def call(argv, **kw):
    p=subprocess.run(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False,**kw)
    if p.returncode: raise RuntimeError('secret-bearing subprocess failed (output withheld)')
    return p.stdout

def b64(data): return base64.urlsafe_b64encode(data).rstrip(b'=')
def app_identity(app_id):
    generator='nixbot-github-app-secret-key' if app_id==4743700 else 'gitea-mq-github-app-secret-key'
    pem=call(['clan','vars','get','magnetite',generator+'/key.pem'])
    data=b64(b'{"alg":"RS256","typ":"JWT"}')+b'.'+b64(json.dumps({'iat':int(time.time())-60,'exp':int(time.time())+540,'iss':app_id}).encode())
    with tempfile.TemporaryFile() as key:
        key.write(pem); key.flush(); key.seek(0)
        signature=call(['openssl','dgst','-sha256','-sign','/dev/fd/'+str(key.fileno())],input=data,pass_fds=(key.fileno(),))
    return (data+b'.'+b64(signature)).decode()
def gh(path,token,method='GET'):
    env=dict(os.environ,GH_TOKEN=token,GH_HOST='github.com')
    return json.loads(call(['gh','api','--method',method,path],env=env))
`;
// Hook inspection remains non-retrying and never mints an installation token.
export const appScript = appAuthScript + `try:
    hook=gh('/app/hook/config',app_identity(int(sys.argv[1])))
    print(json.dumps({'url':hook.get('url')}))
except Exception:
    print('App hook probe failed; credential/API bodies withheld',file=sys.stderr);sys.exit(1)
`;
// Reserve the private file BEFORE POST. An interrupted mint leaves a sentinel;
// it cannot silently create another token when manually resumed.
export const mintAppScript = appAuthScript + `import stat
try:
    app_id=int(sys.argv[1]); path=sys.argv[2]
    if os.path.lexists(path):
        with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW)) as file:
            assert stat.S_IMODE(os.fstat(file.fileno()).st_mode)==0o600
            saved=json.load(file)
        assert saved['app_id']==app_id and saved['token']
    else:
        with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as file:
            file.write('{}'); file.flush(); os.fsync(file.fileno())
            token=app_identity(app_id)
            install=gh('/repos/cameronraysmith/vanixiets/installation',token)
            assert install['app_id']==app_id and install['repository_selection']=='selected'
            access=gh('/app/installations/'+str(install['id'])+'/access_tokens',token,'POST')
            file.seek(0); file.truncate()
            json.dump({'app_id':app_id,'installation_id':install['id'],'token':access['token'],'expires_at':access['expires_at']},file)
            file.flush(); os.fsync(file.fileno())
except Exception:
    print('App token mint incomplete; reconcile private token artifact before resume; credential/API bodies withheld',file=sys.stderr);sys.exit(1)
`;
export const installationScript = `import datetime,json,os,stat,subprocess,sys
try:
    with os.fdopen(os.open(sys.argv[1],os.O_RDONLY|os.O_NOFOLLOW)) as file:
        assert stat.S_IMODE(os.fstat(file.fileno()).st_mode)==0o600
        access=json.load(file)
    app_id=int(sys.argv[2]); assert access['app_id']==app_id
    assert datetime.datetime.fromisoformat(access['expires_at'].replace('Z','+00:00')) > datetime.datetime.now(datetime.timezone.utc)
    env=dict(os.environ,GH_TOKEN=access['token'],GH_HOST='github.com')
    response=subprocess.run(['gh','api','--method','GET','/installation/repositories?per_page=100'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
    assert response.returncode==0
    repos=json.loads(response.stdout); names=[r['full_name'] for r in repos['repositories']]
    assert repos['total_count']==1 and names==['cameronraysmith/vanixiets']
    print(json.dumps({'app_id':app_id,'installation_id':access['installation_id'],'repositories':names}))
except Exception:
    print('Installation GET failed or token expired/incomplete; reconcile token artifact; credential/API bodies withheld',file=sys.stderr);sys.exit(1)
`;
export type AppToken = { appId: number; file: string };
export async function mintAppToken(cwd: string, root: string, label: string, appId: number, signal: AbortSignal): Promise<AppToken> {
  const evidence = await canonicalExternalEvidence(cwd, root);
  if (!/^[A-Za-z0-9-]+$/.test(label) || !Number.isSafeInteger(appId) || appId <= 0) throw new Blocked("Invalid App token identity");
  const file = join(evidence, `${label}-${appId}.token.json`);
  await run(cwd, `python3 -c ${quote(mintAppScript)} ${appId} ${quote(file)}`, signal);
  return { appId, file }; // Opaque reference only; never checkpoint the secret.
}
export async function readInstallation(cwd: string, token: AppToken, signal: AbortSignal) {
  return parse(AppInstallation, await json(cwd, `python3 -c ${quote(installationScript)} ${quote(token.file)} ${token.appId}`, signal));
}
export async function observeApp(cwd: string, root: string, reply: AppReply, token: AppToken, signal: AbortSignal) {
  const app = parse(App, await json(cwd, `gh api ${quote(`/apps/${reply.slug}`)}`, signal));
  const nixbot = parse(App, await json(cwd, "gh api /apps/sciexp-nixbot", signal));
  const permissions = { administration: "write", checks: "write", contents: "write", metadata: "read", pull_requests: "write", statuses: "read" };
  if (app.id !== reply.id || app.id === 4743700 || app.slug !== reply.slug || !isDeepStrictEqual(app.permissions, permissions) || !isDeepStrictEqual([...app.events].sort(), ["pull_request", "check_run", "status", "installation", "installation_repositories"].sort())) throw new Blocked("Queue App differs from G1 contract");
  if (nixbot.id !== 4743700 || !isDeepStrictEqual(nixbot.permissions, { checks: "write", contents: "read", members: "read", metadata: "read", pull_requests: "read" }) || !isDeepStrictEqual([...nixbot.events].sort(), ["check_run", "check_suite", "pull_request", "push"].sort())) throw new Blocked("sciexp-nixbot registration changed");
  if (token.appId !== reply.id) throw new Blocked("G1 token identity differs");
  const installation = await readInstallation(cwd, token, signal);
  await save(cwd, `${root}/app.json`, { app, nixbot, installation });
  return { id: app.id, slug: app.slug, owner: app.owner.login, installation, evidence: `${root}/app.json` };
}
export const leakScript = `import os,json,subprocess,sys

def run(args):
    p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if p.returncode: raise RuntimeError('scan subprocess failed')
    return p.stdout
try:
    pem=run(['clan','vars','get','magnetite','gitea-mq-github-app-secret-key/key.pem']).splitlines()
    interior=[p for p in pem if p and not p.startswith(b'-----')]
    assert interior
    hook=run(['clan','vars','get','magnetite','gitea-mq-github-webhook-secret/secret']).strip()
    assert len(hook)>=32
    needles=[interior[len(interior)//2],hook,b'mq.scientistexperience.net']
    tree=[0,0,0]; head=[0,0,0]; history=[0,0,0]
    for parent,dirs,files in os.walk('.',followlinks=False):
        dirs[:]=[d for d in dirs if d not in ['.git','.jj']]
        for f in files:
            p=os.path.join(parent,f)
            if os.path.islink(p) or not os.path.isfile(p): continue
            with open(p,'rb') as file:
                tail=b''
                while True:
                    block=file.read(1048576)
                    if not block: break
                    data=tail+block
                    for i,n in enumerate(needles): tree[i]+=data.count(n)
                    tail=data[-max(map(len,needles))+1:]
    for p in run(['git','ls-tree','-r','--name-only','-z','HEAD']).split(b'\\0'):
        if not p: continue
        data=run(['git','show','HEAD:'+os.fsdecode(p)])
        for i,n in enumerate(needles): head[i]+=data.count(n)
    for i,n in enumerate(needles):
        history[i]=len(run(['git','log','--all','--format=%H','--no-patch','-S'+n.decode(),'--pickaxe-all']).splitlines())
    result={'working_including_ignored':tree,'HEAD':head,'history':history}
    print(json.dumps(result))
    assert all(counts[0]==0 and counts[1]==0 and counts[2]>0 for counts in result.values())
except Exception:
    print('Positive-controlled leak scan failed (counts only; values withheld)',file=sys.stderr);sys.exit(1)
`;
export async function leakScan(cwd: string, signal: AbortSignal) {
  const counts = parse(Type.Record(Type.String(), Type.Array(Type.Integer())), await json(cwd, `python3 -c ${quote(leakScript)}`, signal));
  return { counts, control: domain, valuesPrinted: false };
}

export function dnsSummary(value: unknown) {
  const plan = parse(DnsPlan, value);
  const changes = plan.resource_changes.filter((r) => !isDeepStrictEqual(r.change.actions, ["no-op"]));
  const resource = changes[0];
  const after = resource?.change.after;
  if (changes.length !== 1 || !resource || resource.mode !== "managed" ||
      resource.type !== "cloudflare_dns_record" || !isDeepStrictEqual(resource.change.actions, ["create"])) {
    throw new Blocked("DNS plan must add exactly one record, no other changes");
  }
  const record = parse(DnsRecord, after);
  return {
    address: resource.address,
    action: "create" as const,
    type: "cloudflare_dns_record" as const,
    name: record.name,
  };
}
export function dnsDecision(value: unknown, reconciling: boolean) {
  const action = Type.Object({ actions: Type.Array(Type.String()) });
  const plan = parse(Type.Object({
    resource_changes: Type.Optional(Type.Array(Type.Object({ change: action }))),
    output_changes: Type.Optional(Type.Record(Type.String(), action)),
    format_version: Type.Optional(Type.String({ minLength: 1 })),
    planned_values: Type.Optional(Type.Object({})),
  }), value);
  if (!plan.resource_changes && (!plan.format_version || !plan.planned_values)) {
    throw new Blocked("Malformed empty DNS plan; no successful refresh identity");
  }
  const outputChanged = Object.values(plan.output_changes ?? {})
    .some((output) => !isDeepStrictEqual(output.actions, ["no-op"]));
  if (outputChanged) throw new Blocked("DNS plan includes output changes");
  const zero = (plan.resource_changes ?? [])
    .every((resource) => isDeepStrictEqual(resource.change.actions, ["no-op"]));
  if (zero && reconciling) return { kind: "Reconciled" as const, changes: 0 as const };
  return { kind: "NeedsApply" as const, summary: dnsSummary(value) };
}

export function assertDnsIntent(value: unknown, plan: { plan: string; sha256: string }): void {
  const intent = parse(Type.Object({ plan: Type.String(), sha256: Type.String() }, { additionalProperties: false }), value);
  if (intent.plan !== plan.plan || intent.sha256 !== plan.sha256) {
    throw new Blocked("DNS apply intent differs from the approved saved-plan identity");
  }
}
export async function planDns(cwd: string, root: string, name: string, source: DeploymentSource, signal: AbortSignal, reconciling = false) {
  assertExternalEvidence(cwd, root);
  if (!source.source.startsWith("git+file:") || !/^[a-f0-9]{40}$/.test(source.sha) || !source.source.endsWith(`&rev=${source.sha}`)) throw new Blocked("DNS requires the committed git+file source from resolveSource");
  const plan = resolve(cwd, root, `${name}.tfplan`), file = `${plan}.json`;
  const tree = await snapshot(cwd, signal);
  await runStreaming(cwd, `umask 077
config=$(nix build --no-link --print-out-paths ${quote(`${source.source}#terraform.config`)})
mkdir -p terraform
ln -sf "$config" terraform/config.tf.json
nix run ${quote(`${source.source}#terraform.terraform`)} -- init -input=false
nix run ${quote(`${source.source}#terraform.terraform`)} -- plan -input=false -out=${quote(plan)}
nix run ${quote(`${source.source}#terraform.terraform`)} -- show -json ${quote(plan)} > ${quote(file)}
chmod 600 ${quote(plan)} ${quote(file)}`, signal);
  const { foreignDrift } = assertScopedInputs(tree, await snapshot(cwd, signal), s2);
  return {
    ...source, tree, plan, foreignDrift,
    sha256: sha256(await readFile(plan)), decision: dnsDecision(JSON.parse(await readResponse(file)), reconciling),
    execution: "Saved OpenTofu plan from committed git+file source; external evidence, terraform.terraform wrapper, shared state and secrets environment",
  };
}
export async function applyDns(cwd: string, root: string, name: string, plan: Awaited<ReturnType<typeof planDns>>, signal: AbortSignal) {
  const { foreignDrift } = assertScopedInputs(plan.tree, await snapshot(cwd, signal), s2);
  if (plan.decision.kind !== "NeedsApply") throw new Blocked("No resource creation approved");
  const intent = join(cwd, root, `${name}.apply-intent.json`);
  let interrupted = false;
  try {
    const saved = JSON.parse(await readFile(intent, "utf8"));
    assertDnsIntent(saved, plan);
    if (sha256(await readFile(plan.plan)) !== plan.sha256) throw new Blocked("Saved DNS plan changed");
    interrupted = true;
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (interrupted) {
    const fresh = await planDns(cwd, root, `${name}-reconcile`, plan, signal, true);
    if (fresh.decision.kind !== "Reconciled") throw new Blocked("Interrupted apply still has changes: invalidate approval, repair and obtain a fresh saved-plan confirmation");
    return { applied: true, reconciled: true, plan: fresh.plan, sha256: fresh.sha256, foreignDrift: [...new Set([...foreignDrift, ...fresh.foreignDrift])].sort() };
  }
  await writeFile(intent, JSON.stringify({ plan: plan.plan, sha256: plan.sha256 }), { flag: "wx", mode: 0o600 });
  if (sha256(await readFile(plan.plan)) !== plan.sha256) throw new Blocked("Saved Terraform plan changed after review");
  await runStreaming(cwd, `nix run ${quote(`${plan.source}#terraform.terraform`)} -- apply -input=false ${quote(plan.plan)}`, signal);
  return { applied: true, reconciled: false, plan: plan.plan, sha256: plan.sha256, foreignDrift };
}
export async function dnsWitness(cwd: string, signal: AbortSignal) {
  const cname = await run(cwd, `dig +short CNAME ${domain}`, signal);
  const address = await run(cwd, "dig +short A magnetite.scientistexperience.net", signal);
  if (cname.trim() !== "magnetite.scientistexperience.net." || address.trim() !== "49.12.12.74") throw new Blocked("Public DNS is not the unproxied magnetite CNAME/A pair");
  return { cname, address };
}
export async function readRules(cwd: string, root: string, signal: AbortSignal) {
  const rulesets = await json(cwd, `gh api ${api}/rulesets --paginate --slurp`, signal);
  const ruleset = await json(cwd, `gh api ${rulesetApi}`, signal);
  const classic = await capture(cwd, `gh api ${api}/branches/main/protection`, signal);
  if (classic.exitCode !== 0 && !classic.stderr.includes("HTTP 404")) throw new Blocked("Classic protection read failed (not 404)");
  const settings = await json(cwd, `gh api ${api} --jq '{allow_auto_merge,allow_merge_commit,allow_squash_merge,allow_rebase_merge}'`, signal);
  const collaborators = await json(cwd, `gh api ${api}/collaborators --paginate --slurp`, signal);
  const user = parse(Type.Object({ id: Type.Integer(), login: Type.Literal("cameronraysmith") }), await json(cwd, "gh api /users/cameronraysmith", signal));
  const file = `${root}/rulesets-before.json`;
  await save(cwd, file, { rulesets, ruleset, classic: { exitCode: classic.exitCode, body: classic.stdout, diagnostic: classic.stderr }, settings, collaborators, user });
  return { file, userId: user.id };
}
const writableRuleset = (value: unknown): Ruleset => {
  const data = parse(Type.Object({
    name: Type.String(), target: Type.String(), enforcement: Type.String(),
    conditions: Type.Unknown(), bypass_actors: Type.Unknown(), rules: Type.Unknown(),
  }), value);
  return parse(Ruleset, {
    name: data.name,
    target: data.target,
    enforcement: data.enforcement,
    conditions: data.conditions,
    bypass_actors: data.bypass_actors,
    rules: data.rules,
  });
};
export function expectedRuleset(appId: number, userId: number, explicitUser = true): Ruleset {
  const user: Ruleset["bypass_actors"] = explicitUser
    ? [{ actor_id: userId, actor_type: "User", bypass_mode: "always" }] : [];
  return {
    name: "gitea-mq",
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
    bypass_actors: [
      { actor_id: appId, actor_type: "Integration", bypass_mode: "always" },
      ...user,
      { actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" },
    ],
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "required_linear_history" },
      {
        type: "required_status_checks",
        parameters: {
          required_status_checks: [{ context: "gitea-mq", integration_id: appId }],
          strict_required_status_checks_policy: false,
          do_not_enforce_on_create: true,
        },
      },
    ],
  };
}
const canonical = (ruleset: Ruleset) => ({
  ...ruleset,
  rules: [...ruleset.rules].sort((a, b) => a.type.localeCompare(b.type)),
  bypass_actors: [...ruleset.bypass_actors].sort((a, b) =>
    `${a.actor_type}:${a.actor_id}`.localeCompare(`${b.actor_type}:${b.actor_id}`)),
});
export async function approveDraft(cwd: string, root: string, draft: RulesetDraft, appId: number, userId: number, signal: AbortSignal) {
  signal.throwIfAborted();
  const before = parse(Type.Object({ ruleset: Type.Unknown() }), JSON.parse(await readFile(join(cwd, `${root}/rulesets-before.json`), "utf8")));
  if (!isDeepStrictEqual(canonical(draft.before), canonical(writableRuleset(before.ruleset))) ||
      !isDeepStrictEqual(draft.reverse, draft.before) ||
      !isDeepStrictEqual(canonical(draft.after), canonical(expectedRuleset(appId, userId)))) {
    throw new Blocked("Rendered ruleset diff differs from tool-observed before or D7/D8 target");
  }
  await save(cwd, `${root}/ruleset-diff.json`, draft);
  await save(cwd, `${root}/ruleset-with-user.json`, draft.after);
  await save(cwd, `${root}/ruleset-admin-only.json`, expectedRuleset(appId, userId, false));
  return { file: `${root}/ruleset-diff.json`, withUser: `${root}/ruleset-with-user.json`, adminOnly: `${root}/ruleset-admin-only.json` };
}
export async function applyRules(cwd: string, file: string, hash: string, beforeFile: string, signal: AbortSignal) {
  const content = await readFile(join(cwd, file), "utf8");
  if (sha256(content) !== hash) throw new Blocked("Approved ruleset JSON changed");
  const expected = parse(Ruleset, JSON.parse(content));
  await classicWitness(cwd, beforeFile, signal);
  const before = parse(Type.Object({ ruleset: Type.Unknown() }), JSON.parse(await readFile(join(cwd, beforeFile), "utf8")));
  const current = writableRuleset(await json(cwd, `gh api ${rulesetApi}`, signal));
  if (!isDeepStrictEqual(canonical(current), canonical(expected))) {
    if (!isDeepStrictEqual(canonical(current), canonical(writableRuleset(before.ruleset)))) throw new Blocked("Ruleset changed after G2; approval no longer applies");
    await run(cwd, `gh api --method PUT ${rulesetApi} --input ${quote(file)}`, signal);
  }
  return rulesWitness(cwd, file, beforeFile, signal);
}
export async function rulesWitness(cwd: string, approved: string, beforeFile: string, signal: AbortSignal) {
  const expected = parse(Ruleset, JSON.parse(await readFile(join(cwd, approved), "utf8")));
  const actual = writableRuleset(await json(cwd, `gh api ${rulesetApi}`, signal));
  if (!isDeepStrictEqual(canonical(expected), canonical(actual))) throw new Blocked("Ruleset readback differs from approved JSON");
  const classic = await classicWitness(cwd, beforeFile, signal);
  const listing = parse(Type.Array(Type.Array(Type.Object({ id: Type.Integer(), name: Type.String(), target: Type.String() }))), await json(cwd, `gh api ${api}/rulesets --paginate --slurp`, signal)).flat().filter((r) => r.target === "branch");
  if (listing.length !== 1 || listing[0].id !== 16212553 || listing[0].name !== "gitea-mq") throw new Blocked("Expected exactly one branch ruleset named gitea-mq");
  const collaborators = parse(Type.Array(Type.Array(Type.Object({ login: Type.String() }))), await json(cwd, `gh api ${api}/collaborators --paginate --slurp`, signal)).flat().map((u) => u.login);
  if (!isDeepStrictEqual(collaborators, ["cameronraysmith"])) throw new Blocked("Sole human collaborator condition failed");
  if (await run(cwd, `gh api ${api} --jq .allow_auto_merge`, signal) !== "true") throw new Blocked("allow_auto_merge is not true");
  return { ruleset: actual, classic: { exitCode: classic.exitCode, body: classic.stdout }, collaborators, allow_auto_merge: true };
}
export async function runtimeProbe(cwd: string, approved: string, beforeFile: string, appId: number, signal: AbortSignal) {
  if (await run(cwd, ssh("systemctl is-active gitea-mq.service"), signal) !== "active") throw new Blocked("gitea-mq inactive");
  for (const hostname of [domain, "nixbot.scientistexperience.net"]) {
    const status = await run(cwd, `curl --max-time 30 -sS -o /dev/null -w '%{http_code} ssl_verify=%{ssl_verify_result}' ${quote(`https://${hostname}/`)}`, signal);
    if (status !== "200 ssl_verify=0") throw new Blocked(`TLS/HTTP failed: ${hostname}: ${status}`);
  }
  const environment = await run(cwd, ssh("systemctl show gitea-mq.service -p Environment --value"), signal);
  if (!runtimeEnvironment.every((v) => environment.split(/\s+/).some((entry) => entry.replace(/^"|"$/g, "") === v)) || environment.includes("GITEA_MQ_MERGE_LABEL=")) throw new Blocked("Runtime landing settings drift");
  const db = await run(cwd, ssh("sudo -u postgres psql -At -c \"SELECT d.datname,r.rolname,r.rolsuper,r.rolcreatedb FROM pg_database d JOIN pg_roles r ON d.datdba=r.oid WHERE d.datname='gitea-mq'\""), signal);
  await run(cwd, ssh("sudo -u postgres psql -c '\\l'"), signal);
  if (db !== "gitea-mq|gitea-mq|f|f") throw new Blocked("Database ownership/role privilege mismatch");
  const tables = await run(cwd, ssh("sudo -u postgres psql -d gitea-mq -At -c '\\dt public.*'"), signal);
  assertMigratedTables(tables);
  const user = await run(cwd, ssh("systemctl show gitea-mq.service -p User -p DynamicUser"), signal);
  if (!user.includes("User=gitea-mq") || !user.includes("DynamicUser=yes")) throw new Blocked("Dynamic user mismatch");
  const journal = await run(cwd, ssh('invocation=$(systemctl show gitea-mq.service -p InvocationID --value); test -n "$invocation"; journalctl -u gitea-mq.service _SYSTEMD_INVOCATION_ID="$invocation" --no-pager -o cat'), signal);
  if (/authentication (?:failed|error)|cannot enable allow_auto_merge|creat(?:ed|ing).*ruleset/i.test(journal)) throw new Blocked("Startup authentication/setup failure");
  const acme = await run(cwd, ssh("systemctl show acme-mq.scientistexperience.net.service -p LoadState -p Result -p ExecMainStartTimestampMonotonic -p ExecMainStatus"), signal);
  assertAcmeSuccess(acme);
  const unsigned = await run(cwd, `curl --max-time 30 -sS -o /dev/null -w '%{http_code}' -X POST https://${domain}/webhook/github -d '{}'`, signal);
  if (!["401", "403"].includes(unsigned)) throw new Blocked("Unsigned webhook was not rejected");
  const hook = await capture(cwd, `python3 -c ${quote(appScript)} ${appId} hook`, signal);
  let hookResult: VResult = { kind: "NotRun", reason: "App-JWT hook-config read unavailable; operator settings-page/redelivery evidence still needed" };
  if (hook.exitCode === 0) {
    const observed = parse(Type.Object({ url: Type.String() }), JSON.parse(hook.stdout));
    if (observed.url !== `https://${domain}/webhook/github`) throw new Blocked("App hook URL mismatch");
    hookResult = { kind: "Pass", evidence: hook.logPath };
  }
  await rulesWitness(cwd, approved, beforeFile, signal);
  return { deployed: true, settings: runtimeEnvironment, tables, acme, hook: hookResult, redelivery: { kind: "NotRun" as const, reason: "Operator App-settings redelivery and matched journal evidence not performed by workflow" }, unsigned, database: db };
}
export async function candidate(cwd: string, signal: AbortSignal) {
  const pulls = parse(Type.Array(Type.Array(Pull)), await json(cwd, `gh api '${api}/pulls?state=open&per_page=100' --paginate --slurp`, signal)).flat();
  if (pulls.some((p) => p.labels.some((l) => l.name.toLowerCase() === "merge-queue") || p.auto_merge !== null)) throw new Blocked("Existing enqueued/auto-merge PR prevents single-entry V2 test");
  const main = await run(cwd, `gh api ${api}/git/ref/heads/main --jq .object.sha`, signal);
  if (!/^[a-f0-9]{40}$/.test(main)) throw new Blocked("Invalid main SHA");
  for (const pr of pulls.filter((p) => p.base.ref === "main").slice(0, 30)) {
    if (!/^[a-f0-9]{40}$/.test(pr.head.sha)) throw new Blocked("Invalid PR SHA");
    const checks = parse(CheckPages,
      await json(cwd, `gh api '${api}/commits/${pr.head.sha}/check-runs?per_page=100' --paginate --slurp`, signal))
      .flatMap((page) => page.check_runs);
    const required = ["nixbot/nix-eval", "nixbot/nix-build"].map((name) => checks.filter((r) => r.name === name && r.app.id === 4743700).sort((a, b) => b.id - a.id)[0]);
    if (!required.every((r) => r && r.status === "completed" && r.conclusion === "success" && r.completed_at)) continue;
    const compare = parse(Type.Object({ behind_by: Type.Integer() }), await json(cwd, `gh api ${api}/compare/${main}...${pr.head.sha}`, signal));
    if (compare.behind_by !== 0 || main === pr.head.sha) continue;
    return { pr: pr.number, sha: pr.head.sha, main, checks: required.map((r) => ({ id: r!.id, name: r!.name, completed_at: r!.completed_at! })), observedAt: new Date().toISOString() };
  }
  throw new Blocked("No unqueued up-to-date PR with both successful nixbot contexts in first 30 main-target PRs");
}
export async function rollback(cwd: string, signal: AbortSignal) {
  const normal = await run(cwd, "nix eval --raw --no-write-lock-file .#checks.x86_64-linux.nixos-magnetite.drvPath", signal);
  const removed = await run(cwd, `nix eval --raw --impure --no-write-lock-file --expr ${quote(rollbackExpr)}`, signal);
  if (!removed.startsWith("/nix/store/") || !removed.endsWith(".drv") || normal === removed) throw new Blocked("Rollback did not produce a different valid derivation");
  return { normal, removed, trackedEdits: false };
}
const v6Remote = "git@github.com:cameronraysmith/vanixiets.git", v6Ref = "refs/landings/v6-probe";
export async function v6Create(cwd: string, root: string, id: string, signal: AbortSignal) {
  if (await run(cwd, "gh api /user --jq .login", signal) !== "cameronraysmith") throw new Blocked("V6 requires orchestrator identity");
  if ((await run(cwd, `git ls-remote ${quote(v6Remote)} ${quote(v6Ref)}`, signal)).trim()) throw new Blocked("V6 probe ref already exists; will not overwrite or delete it");
  const sha = await run(cwd, "git rev-parse HEAD", signal);
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Blocked("Invalid V6 probe SHA");
  // A resumed incomplete create must reconcile, never spend the same authorization twice.
  await writeFile(join(cwd, root, `${id}.create-intent.json`), JSON.stringify({ sha, authorization: `${root}/G5-${id}.json` }), { flag: "wx", mode: 0o600 });
  const pushed = await capture(cwd, `git push --porcelain --force-with-lease=${v6Ref}: ${quote(v6Remote)} ${sha}:${v6Ref}`, signal);
  return { sha, accepted: pushed.exitCode === 0, logPath: pushed.logPath };
}
export async function v6Finish(cwd: string, created: Awaited<ReturnType<typeof v6Create>>, signal: AbortSignal) {
  const { sha } = created;
  const observed = (await run(cwd, `git ls-remote ${quote(v6Remote)} ${quote(v6Ref)}`, signal)).trim();
  if (observed) {
    if (observed !== `${sha}\t${v6Ref}`) throw new Blocked("V6 ref moved; not deleting foreign ref");
    await run(cwd, `git push --porcelain --force-with-lease=${v6Ref}:${sha} ${quote(v6Remote)} :${v6Ref}`, signal);
    if (await run(cwd, `git ls-remote ${quote(v6Remote)} ${quote(v6Ref)}`, signal)) throw new Blocked("V6 cleanup failed");
  }
  return { accepted: created.accepted, observed, cleaned: true, result: { kind: "Fail" as const, evidence: created.logPath, reason: "V6 as written includes deletion protection. Rulesets target branches, tags, pushes, or the repository and cannot protect refs/landings/* from deletion; push accept/refuse is recorded separately." } };
}
export async function pollLanding(cwd: string, selected: Awaited<ReturnType<typeof candidate>>, signal: AbortSignal) {
  const start = Date.now();
  while (Date.now() - start < 20 * 60_000) {
    signal.throwIfAborted();
    const branches = parse(Type.Array(Type.Array(Type.Object({ name: Type.String() }))), await json(cwd, `gh api '${api}/branches?per_page=100' --paginate --slurp`, signal)).flat();
    if (branches.some((b) => b.name.startsWith("gitea-mq/batch/"))) throw new Blocked("V2 observed a batch branch");
    const pr = parse(Pull, await json(cwd, `gh api ${api}/pulls/${selected.pr}`, signal));
    if (pr.head.sha !== selected.sha) throw new Blocked("V2 PR head changed after G4");
    const events = parse(EventPages,
      await json(cwd, `gh api '${api}/issues/${selected.pr}/events?per_page=100' --paginate --slurp`, signal)).flat();
    const label = events.filter((e) => e.event === "labeled" && e.label?.name === "merge-queue" && Date.parse(e.created_at) >= Date.parse(selected.observedAt)).at(-1);
    if (label && (label.actor.login !== "cameronraysmith" || selected.checks.some((r) => Date.parse(r.completed_at) >= Date.parse(label.created_at)))) throw new Blocked("V2 label identity or pre-label checks invalid");
    const main = await run(cwd, `gh api ${api}/git/ref/heads/main --jq .object.sha`, signal);
    if (main !== selected.main && main !== selected.sha) throw new Blocked("Main moved to another SHA during V2");
    const statuses = parse(StatusPages,
      await json(cwd, `gh api '${api}/commits/${selected.sha}/statuses?per_page=100' --paginate --slurp`, signal))
      .flat().filter((status) => status.context === "gitea-mq").sort((a, b) => b.id - a.id);
    if (label && main === selected.sha && pr.merged_at && statuses[0]?.state === "success") {
      const commit = parse(Type.Object({ parents: Type.Array(Type.Object({ sha: Type.String() })) }), await json(cwd, `gh api ${api}/git/commits/${selected.sha}`, signal));
      if (commit.parents.length !== 1) throw new Blocked("V2 landed a merge commit");
      const checks = parse(CheckPages,
        await json(cwd, `gh api '${api}/commits/${selected.sha}/check-runs?per_page=100' --paginate --slurp`, signal))
        .flatMap((page) => page.check_runs);
      if (selected.checks.some((original) => checks.filter((r) => r.name === original.name).some((r) => r.id > original.id))) throw new Blocked("V2 observed additional nixbot runs after label");
      return { main, head: pr.head.sha, merged_at: pr.merged_at, parent: commit.parents[0].sha, status: statuses[0], label, elapsedMs: Date.parse(pr.merged_at) - Date.parse(label.created_at), batchBranchesObserved: [] as string[], samplingCaveat: "Branch polling cannot exclude a transient ref between observations" };
    }
    await run(cwd, "sleep 10", signal);
  }
  throw new Blocked("V2 did not fast-forward/merge with successful gitea-mq status within 20 minutes");
}
export async function tick(cwd: string, completed: readonly string[], signal: AbortSignal, humanBaseline: string) {
  signal.throwIfAborted();
  if (completed.some((id) => ["1.1", "8.2"].includes(id))) throw new Blocked("Cannot tick operator gate");
  const before = await readFile(join(cwd, tasks), "utf8");
  const after = before.split("\n").map((line) => completed.some((id) => line.startsWith(`- [ ] ${id} `)) ? line.replace("- [ ]", "- [x]") : line).join("\n");
  assertHumanBoxes(humanBaseline, after); await writeFile(join(cwd, tasks), after);
  return { completed: [...completed] };
}
export async function tickOperator(cwd: string, gate: "G1" | "G2", receipt: string, humanBaseline: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const decision: unknown = JSON.parse(await readFile(join(cwd, receipt), "utf8"));
  if (gate === "G1") parse(Type.Object({ kind: Type.Literal("operator"), reply: AppReply }), decision);
  else parse(Type.Object({ kind: Type.Literal("operator"), choice: Type.Union([Type.Literal("approve with User bypass"), Type.Literal("approve admin role only")]) }), decision);
  const before = await readFile(join(cwd, tasks), "utf8"), id = gate === "G1" ? "1.1" : "8.2";
  const tick = (text: string) => text.replace(new RegExp(`^- \\[ \\] ${id.replace(".", "\\.")} `, "m"), `- [x] ${id} `);
  const expected = tick(humanBaseline), after = tick(before);
  assertHumanBoxes(expected, after);
  await writeFile(join(cwd, tasks), after);
  return { humanBaseline: humanBoxes(after), taskId: id, receipt };
}
export async function syncProposal(cwd: string, state: LinearState, outcome: LinearOutcome, signal: AbortSignal) {
  signal.throwIfAborted();
  const before = await readFile(join(cwd, proposal), "utf8");
  const now = new Date().toISOString();
  if (!before.startsWith("---\n") || !before.includes("\nattempt_log:\n")) {
    throw new Blocked("Missing proposal sync frontmatter");
  }
  let after = before.replace("\nattempt_log:\n", `\nattempt_log:\n  - ${JSON.stringify({ at: now, transition: state, outcome })}\n`);
  switch (outcome.kind) {
    case "TransitionObserved":
      after = after.replace(/^last_synced_state:.*$/m, `last_synced_state: ${state}`)
        .replace(/^last_synced_at:.*$/m, `last_synced_at: ${now}`);
      break;
    case "TransitionFailed":
    case "ReadbackFailed": break;
    default: unreachable(outcome);
  }
  await writeFile(join(cwd, proposal), after);
  return { state, outcome, at: now };
}
export async function writeVerify(cwd: string, commentary: VerifyCommentary, ledger: readonly GateEntry[], root: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const markdown = renderVerify(commentary, ledger, { root, verifiedAt: new Date().toISOString() });
  await writeFile(join(cwd, verify), markdown);
  await run(cwd, `openspec validate ${quote(dir.split("/").at(-1)!)} --strict`, signal);
  const actual = await readFile(join(cwd, verify), "utf8");
  return { written: actual === markdown, sha256: sha256(actual), claims: passedClaims(ledger) };
}
export async function markRejected(cwd: string, findings: readonly string[], signal: AbortSignal) {
  signal.throwIfAborted();
  const before = await readFile(join(cwd, verify), "utf8");
  await writeFile(join(cwd, verify), renderRoborevRejection(before, findings));
  return { rejected: true };
}

export async function classicWitness(cwd: string, beforeFile: string, signal: AbortSignal) {
  const before = parse(Type.Object({
    classic: Type.Object({ exitCode: Type.Integer(), body: Type.String() }),
  }), JSON.parse(await readFile(join(cwd, beforeFile), "utf8")));
  const current = await capture(cwd, `gh api ${api}/branches/main/protection`, signal);
  assertClassicUnchanged(before.classic, current);
  return current;
}

export function classicContexts(value: unknown): string[] {
  const checks = parse(Type.Object({
    contexts: Type.Optional(Type.Array(Type.String())),
    checks: Type.Optional(Type.Array(Type.Object({ context: Type.String() }))),
  }), value);
  if (!checks.contexts && !checks.checks) throw new Blocked("Classic status checks lack contexts/checks");
  return [...new Set([...(checks.contexts ?? []), ...(checks.checks ?? []).map((check) => check.context)])];
}

export function assertClassicUnchanged(before: { exitCode: number; body: string }, current: { exitCode: number; stdout: string; stderr: string }): void {
  if (current.exitCode !== 0 && !current.stderr.includes("HTTP 404")) throw new Blocked("Classic protection read failed (not 404)");
  if (before.exitCode !== current.exitCode || (current.exitCode === 0 && !isDeepStrictEqual(JSON.parse(before.body), JSON.parse(current.stdout)))) throw new Blocked("Classic protection changed from before-artifact");
}
export function assertMigratedTables(text: string): void {
  if (!text.split("\n").some((row) => /^public\|[^|]+\|table\|gitea-mq$/.test(row))) {
    throw new Blocked("No migrated tables observed in gitea-mq database");
  }
}
export function assertAcmeSuccess(text: string): void {
  const properties = Object.fromEntries(text.split("\n").map((row) => row.split("=")));
  if (properties.LoadState !== "loaded" || properties.Result !== "success" ||
      properties.ExecMainStatus !== "0" || !/^[1-9]\d*$/.test(properties.ExecMainStartTimestampMonotonic ?? "")) {
    throw new Blocked("ACME certificate unit has not run successfully");
  }
}

export function resolveRequiredChecks(rulesets: readonly string[], classic: readonly string[], fallback: readonly string[]) {
  // C6 / forge.IsOwnContext excludes exact gitea-mq and gitea-mq/, not gitea-mq-other.
  const forge = [...new Set([...rulesets, ...classic])]
    .filter((name) => name !== "gitea-mq" && !name.startsWith("gitea-mq/"));
  const sources = { rulesets: [...rulesets], classic: [...classic], fallback: [...fallback], forge };
  return forge.length
    ? { ...sources, kind: "Forge" as const, effective: forge }
    : { ...sources, kind: "RuntimeFallback" as const, effective: [...fallback] };
}
export async function resolvedRequiredChecks(cwd: string, signal: AbortSignal) {
  const Rule = Type.Object({ type: Type.String(), parameters: Type.Optional(Type.Unknown()) });
  const rules = parse(Type.Array(Type.Array(Rule)), await json(cwd, `gh api ${api}/rules/branches/main --paginate --slurp`, signal)).flat();
  const Required = Type.Object({
    required_status_checks: Type.Array(Type.Object({ context: Type.String() })),
  });
  const rulesets = rules.filter((rule) => rule.type === "required_status_checks")
    .flatMap((rule) => parse(Required, rule.parameters).required_status_checks.map((check) => check.context));
  const protection = await capture(cwd, `gh api ${api}/branches/main/protection/required_status_checks`, signal);
  if (protection.exitCode !== 0 && !protection.stderr.includes("HTTP 404")) throw new Blocked("Cannot resolve classic required checks");
  const classic = protection.exitCode === 0 ? classicContexts(JSON.parse(protection.stdout)) : [];
  // Read only this non-secret key from the actual service process; never print its full environment.
  const command = `pid=$(systemctl show gitea-mq.service -p MainPID --value)
test "$pid" -gt 0
tr '\\0' '\\n' < "/proc/$pid/environ" | grep '^GITEA_MQ_REQUIRED_CHECKS='`;
  const environment = await run(cwd, ssh(command), signal);
  if (!environment.startsWith("GITEA_MQ_REQUIRED_CHECKS=") || environment.includes("\n")) throw new Blocked("No unambiguous running-process required-check fallback");
  const fallback = environment.slice("GITEA_MQ_REQUIRED_CHECKS=".length).split(",").map((name) => name.trim()).filter(Boolean);
  const resolved = resolveRequiredChecks(rulesets, classic, fallback);
  switch (resolved.kind) {
    case "Forge": throw new Blocked(`Forge overrides runtime fallback: ${JSON.stringify(resolved)}`);
    case "RuntimeFallback":
      if (!isDeepStrictEqual(resolved.effective, ["nixbot/nix-eval", "nixbot/nix-build"])) {
        throw new Blocked(`Resolved checks differ from the configured pair: ${JSON.stringify(resolved)}`);
      }
      break;
    default: unreachable(resolved);
  }
  return { ...resolved, method: "C6 resolution recomputed from live effective branch rules, classic protection and running MainPID environment; not a dashboard or journal claim" };
}
export async function v3Witness(cwd: string, signal: AbortSignal) {
  const selected = await candidate(cwd, signal);
  const resolved = await resolvedRequiredChecks(cwd, signal);
  return { ...selected, resolved };
}

export async function identityWitness(cwd: string, appId: number, appSlug: string, tokens: AppToken[], signal: AbortSignal) {
  if (await run(cwd, "gh api /user --jq .login", signal) !== "cameronraysmith") throw new Blocked("App inventory requires repository owner identity");
  const collaborators = parse(CollaboratorPages,
    await json(cwd, `gh api ${api}/collaborators --paginate --slurp`, signal)).flat();
  const humans = collaborators.filter((user) => user.type === "User" &&
    (user.permissions.admin || user.permissions.push || user.permissions.maintain));
  if (humans.length !== 1 || humans[0].login !== "cameronraysmith" || !humans[0].permissions.admin) {
    throw new Blocked("Sole write-capable human admin condition failed");
  }
  const pages = parse(InstallationPages,
    await json(cwd, "gh api '/user/installations?per_page=100' --paginate --slurp", signal));
  const installations = pages.flatMap((page) => page.installations);
  if (!pages.length || pages.some((page) => page.total_count !== installations.length) ||
      new Set(installations.map((item) => item.id)).size !== installations.length) {
    throw new Blocked("Incomplete App installation inventory");
  }
  const repositoryInstallations = [];
  for (const installation of installations.filter((item) => item.account.login === "cameronraysmith")) {
    const pages = parse(RepositoryPages,
      await json(cwd, `gh api '/user/installations/${installation.id}/repositories?per_page=100' --paginate --slurp`, signal));
    const names = pages.flatMap((page) => page.repositories.map((repo) => repo.full_name));
    if (!pages.length || pages.some((page) => page.total_count !== names.length) || new Set(names).size !== names.length) {
      throw new Blocked("Incomplete installation repository inventory");
    }
    if (names.includes(repository)) repositoryInstallations.push(installation);
  }
  const writable = repositoryInstallations.filter((item) =>
    Object.values(item.permissions).some((level) => level === "write" || level === "admin"));
  const identities = writable.map((item) => `${item.app_id}:${item.app_slug}`).sort();
  if (!isDeepStrictEqual(identities, [`4743700:sciexp-nixbot`, `${appId}:${appSlug}`].sort())) {
    throw new Blocked("Write-capable Apps differ from nixbot and the queue App");
  }
  const perApp = [];
  for (const id of [4743700, appId]) {
    const token = tokens.find((token) => token.appId === id);
    if (!token) throw new Blocked("Missing per-App token reference");
    const observed = await readInstallation(cwd, token, signal);
    if (observed.app_id !== id || !observed.repositories.includes(repository) ||
        !repositoryInstallations.some((item) => item.app_id === id && item.id === observed.installation_id)) {
      throw new Blocked("Per-App installation check differs from owner-visible inventory");
    }
    perApp.push(observed);
  }
  return {
    collaborators, installations: repositoryInstallations, writeCapable: writable, perApp,
    trustBoundary: "Owner-authenticated token-visible paginated inventory plus per-App installation checks; token restrictions may hide other installations. This accepted set witness is not an unrestricted-universe proof or a guarantee about future enqueue behavior.",
  };
}

// Linear 2.6.0: checked against all three installed --help pages and linear-cli/references/issue.md.
export const linearUpdate = (state: LinearState) => `linear issue update CAM-56 --state ${quote(state)} --workspace cameronraysmith`;
export const linearComment = (artifact: string) => `linear issue comment add CAM-56 --body-file ${quote(artifact)} --workspace cameronraysmith`;
export const linearView = "linear issue view CAM-56 --json --no-comments --no-download --no-pager --workspace cameronraysmith";
export async function linearReadback(cwd: string, expected: LinearState, signal: AbortSignal) {
  const issue = parse(Type.Object({ state: Type.Object({ name: Type.String() }) }), await json(cwd, linearView, signal));
  if (issue.state.name !== expected) throw new Blocked(`Linear state readback differs: ${issue.state.name}`);
  return { state: issue.state.name };
}
export function linearOutcome(updated: boolean, observed: boolean, commented: boolean): LinearOutcome {
  if (!updated) return { kind: "TransitionFailed" };
  const comment = commented ? "Posted" as const : "Failed" as const;
  return observed ? { kind: "TransitionObserved", comment } : { kind: "ReadbackFailed", comment };
}
