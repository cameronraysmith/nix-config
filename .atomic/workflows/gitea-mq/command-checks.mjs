import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { mkdtemp, mkdir, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";

const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const observed = (stdout = "", exitCode = 0, stderr = "") => ({
  command: "mock", stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout),
  stderr, exitCode, state: "exited", terminationSignal: null, logPath: "mock.log", tail: "",
});

/** Keep real helper implementations; replace only filesystem/process/deployment ports. */
export async function runCommandChecks({ ts, source, moduleUrl, tools, slices, typeboxUrl }) {
  const evaluations = source.split("\n").filter((line) => line.includes("nix eval "));
  assert.equal(evaluations.length, 7, "Cover baseline, activation, three S1 sites and two rollback sites");
  for (const command of evaluations) {
    assert(!command.includes("allow-import-from-derivation"), "Flake evaluation must not override IFD");
    assert(command.includes("--no-write-lock-file"), "Flake evaluation must retain lock-file protection");
  }
  console.log("PASS Nix evaluation commands retain lock-file protection without overriding IFD");
  const signal = new AbortController().signal;
  const files = new Map();
  const commands = [];
  let handler = () => { throw Error("No command fixture"); };
  let applies = 0, updates = 0, currentSystem = "/nix/store/old";
  const get = (path) => {
    if (!files.has(path)) throw Object.assign(Error("missing"), { code: "ENOENT" });
    return files.get(path);
  };
  globalThis.__mqCommandMock = {
    commands,
    readFile: async (path) => get(path),
    writeFile: async (path, value, options) => {
      if (options?.flag === "wx" && files.has(path)) throw Object.assign(Error("exists"), { code: "EEXIST" });
      files.set(path, value);
    },
    mkdir: async () => {},
    lstat: async (path) => { get(path); return { isSymbolicLink: () => false }; },
    unlink: async (path) => { get(path); files.delete(path); },
    readResponse: async (path) => get(path),
    pathsIn: async () => [],
    assertHealthy: async () => {},
    oneId: async (_cwd, revset) => revset === "@-" || revset.endsWith("+") ? "jjjj" : "ssss",
    ids: async () => ["ssss"],
    capture: async (_cwd, command, actualSignal) => {
      assert.equal(actualSignal, signal, "Every command forwards the cancellation signal");
      commands.push(command);
      return handler(command);
    },
    snapshot: async () => ({}),
    save: async (_cwd, path, value) => files.set(join(_cwd, path), JSON.stringify(value)),
    applyDns: async (_cwd, _plan, actualSignal) => { assert.equal(actualSignal, signal); applies++; return { applied: true }; },
    updateMachine: async (_cwd, _source, actualSignal) => { assert.equal(actualSignal, signal); updates++; currentSystem = "/nix/store/expected"; return { updated: true }; },
  };
  globalThis.__mqCommandMock.captureStreaming = globalThis.__mqCommandMock.capture;
  const port = (name) => `export const ${name} = (...args) => globalThis.__mqCommandMock.${name}(...args);`;
  const fsModule = dataUrl(["readFile", "writeFile", "mkdir", "lstat", "unlink"].map(port).join("\n"));
  const sharedModule = dataUrl(`export * from "${moduleUrl(".atomic/workflows/omnigent/tools.ts")}";\n` + ["capture", "save", "snapshot", "pathsIn"].map(port).join("\n"));
  const deployModule = dataUrl(`export * from "${moduleUrl(".atomic/workflows/omnigent/deployment.ts")}";\n` + ["applyDns", "updateMachine"].map(port).join("\n"));
  const processModule = dataUrl(`export * from "${moduleUrl(".atomic/workflows/gitea-mq/process.ts")}";\n` + ["capture", "captureStreaming", "readResponse"].map(port).join("\n"));
  const vcsModule = dataUrl(`export * from "${moduleUrl(".atomic/workflows/gitea-mq/vcs.ts")}";\n` + ["snapshot", "pathsIn", "assertHealthy", "oneId", "ids"].map(port).join("\n"));
  let code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  code = code.replace(/from "([^"]+)"/g, (whole, name) => {
    if (name === "node:fs/promises") return `from "${fsModule}"`;
    if (name === "../omnigent/tools.js") return `from "${sharedModule}"`;
    if (name === "../omnigent/deployment.js") return `from "${deployModule}"`;
    if (name === "./process.js") return `from "${processModule}"`;
    if (name === "./vcs.js") return `from "${vcsModule}"`;
    if (name === "typebox") return whole;
    if (name.startsWith(".")) return `from "${moduleUrl(resolve(".atomic/workflows/gitea-mq", name.replace(/\.js$/, ".ts")))}"`;
    return whole;
  });
  code = code.replace('from "typebox"', `from "${typeboxUrl}"`);
  const actual = await import(dataUrl(code));
  // Shared @ may contain unrelated edits; all commands below remain mocked.
  {
    const repo = "/Users/crs58/projects/vanixiets", mock = globalThis.__mqCommandMock;
    const original = { pathsIn: mock.pathsIn, ids: mock.ids, snapshot: mock.snapshot, oneId: mock.oneId };
    const foreign = [".atomic/workflows/deploy-omnigent.ts", ".atomic/todos/x.md"];
    let pending = [...foreign];
    mock.pathsIn = async () => pending;
    mock.ids = async () => ["ssss", "kkkk"];
    files.set(join(repo, "flake.lock"), JSON.stringify({ nodes: {} }));
    const taskText = "- [ ] 1.1 G1\n- [ ] 8.2 G2\n- [ ] 2.1 input";
    files.set(join(repo, slices.tasks), taskText);
    handler = (command) => command === "git symbolic-ref -q HEAD" ? observed("", 1)
      : command.startsWith("nix eval ") ? observed({ pre: null }) : observed();
    const result = await actual.preflight(repo, "ssss", signal);
    assert(commands.includes("gh auth status\nclan vars --help"), "Preflight probes Clan with its supported vars help command");
    assert(!commands.some((command) => command.includes("clan --version")), "Preflight must not use the unsupported Clan version flag");
    await actual.save(repo, "preflight.json", result);
    assert.deepEqual(JSON.parse(files.get(join(repo, "preflight.json"))).foreign, foreign);
    const baseline = Object.fromEntries(foreign.map((path) => [path, "100644:preexisting"]));
    mock.snapshot = async () => ({ ...baseline, [slices.aspect]: "100644:owned" });
    await actual.scope(repo, baseline, slices.s1.allowedPaths, tools.humanBoxes(taskText), signal);
    mock.snapshot = async () => ({ ...baseline, [foreign[0]]: "100644:drift" });
    assert.deepEqual((await actual.scope(repo, baseline, ["flake.lock"], tools.humanBoxes(taskText), signal)).foreignDrift, [foreign[0]]);
    mock.snapshot = async () => ({ ...baseline, "flake.nix": "100644:drift" });
    await assert.rejects(() => actual.scope(repo, baseline, ["flake.lock"], tools.humanBoxes(taskText), signal), /Scoped inputs changed: flake.nix/);
    const owned = [...new Set([slices.s1, slices.postG1, slices.s2, slices.s4, slices.docs, slices.report].flatMap((slice) => slice.allowedPaths))];
    for (const path of [...owned, `${slices.dir}/tasks.md`, ...slices.varsAllowed.map((path) => `${path}/secret`)]) {
      pending = [...foreign, path];
      await assert.rejects(() => actual.preflight(repo, "ssss", signal), (error) => error.message.includes(path));
    }
    const evidenceRoot = "../external/evidence";
    const adoptedPaths = ["flake.nix", "flake.lock", slices.aspect, slices.machine, slices.tasks];
    const adoptedTree = Object.fromEntries(adoptedPaths.map((path) => [path, `100644:${tools.sha256(path)}`]));
    mock.snapshot = async () => adoptedTree;
    pending = [...foreign, ...adoptedPaths];
    files.set(join(repo, slices.aspect), "existing implementation");
    const preflightHandler = handler;
    handler = (command) => command.includes("diff -r @ --stat --") ? observed("adopted scoped diff stat") : command === "jj --ignore-working-copy file show -r @- flake.lock" ? observed({ nodes: { nixbot: { locked: "parent" } } }) : preflightHandler(command);
    const adopted = await actual.preflight(repo, "ssss", signal, { root: evidenceRoot });
    const receipt = JSON.parse(files.get(join(repo, evidenceRoot, "adopted-s1.json")));
    assert.equal(receipt.adopted, true);
    assert.deepEqual(receipt.paths, adoptedPaths);
    assert.equal(receipt.sha256[slices.aspect], tools.sha256(slices.aspect));
    assert.equal(receipt.stat, "adopted scoped diff stat");
    assert.equal(JSON.parse(adopted.lock).nodes.nixbot.locked, "parent", "Adoption must not bless edited build-service locks as its baseline");
    assert(commands.some((command) => command.includes("diff -r @ --stat --") && adoptedPaths.every((path) => command.includes(`'${path}'`))));
    assert.deepEqual(adopted.foreign, foreign);
    await assert.rejects(() => actual.preflight(repo, "ssss", signal), /Preexisting workflow changes/);
    for (const path of ["modules/terranix/cloudflare.nix", "packages/docs/test.md", ...slices.varsAllowed.map((path) => `${path}/secret`)]) {
      pending = [...adoptedPaths, path];
      await assert.rejects(() => actual.preflight(repo, "ssss", signal, { root: evidenceRoot }), /outside S1/);
    }
    pending = adoptedPaths;
    for (const revset of ["rollup-landing", "ssss+", "@-"]) {
      mock.oneId = async (cwd, rev, signal) => rev === revset ? "kkkk" : original.oneId(cwd, rev, signal);
      await assert.rejects(() => actual.preflight(repo, "ssss", signal, { root: evidenceRoot }), /tip\/join mismatch|child of the join/);
    }
    mock.oneId = original.oneId;
    files.set(join(repo, slices.tasks), taskText.replace("[ ] 2.1", "[x] 2.1"));
    await actual.adoptS1(repo, adopted.adoption.file, tools.humanBoxes(taskText), signal);
    assert(files.get(join(repo, slices.tasks)).includes("[x] 2.1"), "adopt-s1 itself is observation-only");
    await actual.resetTasks(repo, slices.s1.taskIds, signal, tools.humanBoxes(taskText));
    assert.equal(files.get(join(repo, slices.tasks)), taskText, "Adoption clears stale implementation ticks without ticking any task");
    files.set(join(repo, slices.tasks), taskText.replace("[ ] 1.1", "[x] 1.1"));
    await assert.rejects(() => actual.adoptS1(repo, adopted.adoption.file, tools.humanBoxes(taskText), signal), /Operator-owned task/);
    files.set(join(repo, slices.tasks), taskText);
    mock.snapshot = async () => ({ ...adoptedTree, "flake.nix": `100644:${tools.sha256("drift")}` });
    await assert.rejects(() => actual.adoptS1(repo, adopted.adoption.file, tools.humanBoxes(taskText), signal), /Scoped inputs changed/);
    files.delete(join(repo, slices.aspect));
    console.log("PASS adoption preflight: existing S1 accepted with scoped sha256/stat evidence; default and non-S1 scope reject; adoption drift blocks");
    Object.assign(mock, original);
    console.log("PASS preflight shared @: foreign paths recorded and baseline-preserved; preexisting workflow scope blocks; relock allows foreign drift as evidence but rejects other S1 input drift");
  }
  // Real physical paths, closed process port: even old code cannot execute POST.
  const physical = await mkdtemp(join(tmpdir(), "gitea-mq-confinement-"));
  try {
    const repo = join(physical, "repo"), external = join(physical, "external"), alias = join(physical, "outside-parent");
    await mkdir(join(repo, "evidence"), { recursive: true }); await mkdir(external);
    await symlink(repo, alias); await symlink(repo, join(physical, "repo-alias"));
    handler = () => observed();
    const start = commands.length;
    for (const cwd of [repo, join(physical, "repo-alias")]) {
      await assert.rejects(() => actual.mintAppToken(cwd, join(alias, "evidence"), "G1", 1234, signal), /Evidence must be outside the source tree/);
      assert.equal(commands.length, start, "External-parent symlink must reject before any command/POST");
    }
    await symlink(external, join(physical, "external-alias"));
    const token = await actual.mintAppToken(repo, join(physical, "external-alias"), "G1", 1234, signal);
    assert.equal(token.file, join(await realpath(external), "G1-1234.token.json"), "Accepted token path must use canonical evidence root");
    assert.equal(commands.length, start + 1);
  } finally { await rm(physical, { recursive: true, force: true }); }
  console.log("PASS R2 token confinement: external-parent symlink into repo rejects before any POST (including repo alias); external alias mints at canonical path");
  const cwd = "/mock";
  const approved = tools.expectedRuleset(1234, 1);
  const before = { ...approved, name: "nixbot" };
  files.set("/mock/approved.json", JSON.stringify(approved));
  files.set("/mock/before.json", JSON.stringify({ ruleset: before, classic: { exitCode: 0, body: "{}" } }));
  files.set("/mock/evidence/rulesets-before.json", JSON.stringify({ ruleset: before }));
  const wrongDraft = { before, after: tools.expectedRuleset(9999, 1), reverse: before, question: "Approve?" };
  await assert.rejects(() => actual.approveDraft(cwd, "evidence", wrongDraft, 1234, 1, signal), /Rendered ruleset diff differs/);
  assert(!files.has("/mock/evidence/ruleset-diff.json"), "Rejected semantic draft must not become G2 material");
  await actual.approveDraft(cwd, "evidence", { ...wrongDraft, after: approved }, 1234, 1, signal);
  assert.deepEqual(JSON.parse(files.get("/mock/evidence/ruleset-with-user.json")), approved);
  console.log("PASS F2 commands: real approveDraft rejects wrong integration_id before writes and accepts corrected target");
  let didPut = false, classicReads = 0;
  handler = (command) => {
    if (command.endsWith("/branches/main/protection")) { classicReads++; return observed({}); }
    if (command.includes("--method PUT")) { didPut = true; return observed(approved); }
    if (command.endsWith("/rulesets/16212553")) return observed(didPut ? approved : before);
    if (command.includes("/rulesets --paginate")) return observed([[{ id: 16212553, name: "gitea-mq", target: "branch" }]]);
    if (command.includes("/collaborators")) return observed([[{ login: "cameronraysmith" }]]);
    if (command.includes(".allow_auto_merge")) return observed("true");
    throw Error(`Unmocked rules command: ${command}`);
  };
  await actual.applyRules(cwd, "approved.json", tools.sha256(JSON.stringify(approved)), "before.json", signal);
  assert.equal(classicReads, 2);
  assert(commands.findIndex((command) => command.endsWith("/branches/main/protection")) < commands.findIndex((command) => command.includes("--method PUT")));
  const savedHandler = handler;
  handler = (command) => command.endsWith("/branches/main/protection") ? observed({ changed: true }) : savedHandler(command);
  const previousPuts = commands.filter((command) => command.includes("--method PUT")).length;
  await assert.rejects(() => actual.applyRules(cwd, "approved.json", tools.sha256(JSON.stringify(approved)), "before.json", signal), /Classic protection changed/);
  assert.equal(commands.filter((command) => command.includes("--method PUT")).length, previousPuts);

  const installations = [
    { id: 10, app_id: 4743700, app_slug: "sciexp-nixbot", account: { login: "cameronraysmith" }, permissions: { checks: "write" } },
    { id: 20, app_id: 1234, app_slug: "queue", account: { login: "cameronraysmith" }, permissions: { contents: "write" } },
  ];
  let count = 2, extraHuman = false, perAppMismatch = false;
  handler = (command) => {
    if (command === "gh api /user --jq .login") return observed("cameronraysmith");
    if (command.includes("/collaborators")) return observed([[{ login: "cameronraysmith", type: "User", permissions: { admin: true } }, ...(extraHuman ? [{ login: "extra", type: "User", permissions: { push: true } }] : [])]]);
    if (command.includes("'/user/installations?")) return observed([{ total_count: count, installations: [installations[0]] }, { total_count: count, installations: [installations[1]] }]);
    if (command.startsWith("gh api") && command.includes("/repositories?")) return observed([{ total_count: 1, repositories: [{ full_name: slices.repository }] }]);
    if (command.startsWith("python3 -c")) {
      const id = command.endsWith(" 4743700") ? 4743700 : 1234;
      return observed({ app_id: id, installation_id: perAppMismatch ? 99 : id === 1234 ? 20 : 10, repositories: [slices.repository] });
    }
    throw Error(`Unmocked inventory command: ${command}`);
  };
  const tokens = [4743700, 1234].map((appId) => ({ appId, file: `/private/${appId}.json` }));
  const identity = await actual.identityWitness(cwd, 1234, "queue", tokens, signal);
  assert.equal(identity.perApp.length, 2);
  assert.match(identity.trustBoundary, /token restrictions may hide/i);
  count = 3;
  await assert.rejects(() => actual.identityWitness(cwd, 1234, "queue", tokens, signal), /Incomplete App/);
  count = 2; extraHuman = true;
  await assert.rejects(() => actual.identityWitness(cwd, 1234, "queue", tokens, signal), /Sole write-capable/);
  extraHuman = false; perAppMismatch = true;
  await assert.rejects(() => actual.identityWitness(cwd, 1234, "queue", tokens, signal), /Per-App installation/);
  console.log("PASS mocked commands: classic protection before/after PUT, inventory pagination, per-App identity, human-write and count negative controls");

  handler = (command) => {
    if (command.startsWith("nix eval")) return observed("/nix/store/expected");
    if (command.includes("readlink /run/current-system")) return observed(currentSystem);
    if (command.startsWith("CLAN_NO_COMMIT=1 clan machines update")) { updates++; currentSystem = "/nix/store/expected"; return observed(); }
    throw Error(`Unmocked activation command: ${command}`);
  };
  await actual.ensureActivated(cwd, { source: "pinned" }, signal);
  await actual.ensureActivated(cwd, { source: "pinned" }, signal);
  assert.equal(updates, 1, "Already-active generation must re-probe, not activate again");

  const savedPlan = { plan: "/root/saved.tfplan", sha256: tools.sha256("saved plan"), tree: {}, source: `git+file:///mock?ref=rollup-landing&rev=${"a".repeat(40)}`, sha: "a".repeat(40), decision: { kind: "NeedsApply", summary: {} } };
  files.set(savedPlan.plan, "saved plan");
  files.set("/root/saved.apply-intent.json", JSON.stringify({ plan: savedPlan.plan, sha256: savedPlan.sha256 }));
  files.set("/root/saved-reconcile.tfplan", "refreshed plan");
  files.set("/root/saved-reconcile.tfplan.json", JSON.stringify({ resource_changes: [] }));
  files.set("/mock/modules/terranix/cloudflare.nix", "dns");
  handler = (command) => {
    assert(command.includes("-- plan -input=false"));
    assert(!command.includes("path:/mock")); assert(command.includes(savedPlan.source));
    return observed();
  };
  const dnsSnapshot = globalThis.__mqCommandMock.snapshot;
  let dnsSnapshots = 0;
  const foreignDns = ".atomic/workflows/deploy-omnigent.ts";
  globalThis.__mqCommandMock.snapshot = async () => ({ [foreignDns]: `foreign-${dnsSnapshots++}` });
  const reconciled = await actual.applyDns(cwd, "../root", "saved", savedPlan, signal);
  assert.equal(reconciled.reconciled, true);
  assert.equal(applies, 0, "Interrupted successful apply must not repeat the mutation");
  assert.deepEqual(reconciled.foreignDrift, [foreignDns]);
  globalThis.__mqCommandMock.snapshot = async () => ({ "modules/terranix/cloudflare.nix": "changed" });
  await assert.rejects(() => actual.applyDns(cwd, "../root", "saved", savedPlan, signal), /Scoped inputs changed/);
  globalThis.__mqCommandMock.snapshot = dnsSnapshot;
  files.set("/root/saved.apply-intent.json", JSON.stringify({ plan: "/foreign", sha256: savedPlan.sha256 }));
  await assert.rejects(() => actual.applyDns(cwd, "../root", "saved", savedPlan, signal), /intent differs/);
  files.set("/root/saved.apply-intent.json", JSON.stringify({ plan: savedPlan.plan, sha256: savedPlan.sha256 }));
  files.set("/root/saved-reconcile.tfplan.json", "{}");
  await assert.rejects(() => actual.applyDns(cwd, "../root", "saved", savedPlan, signal), /Malformed empty/);
  files.set("/root/saved-reconcile.tfplan.json", JSON.stringify({ resource_changes: [{
    mode: "managed", type: "cloudflare_dns_record", address: "cloudflare_dns_record.mq",
    change: { actions: ["create"], after: { name: slices.domain, type: "CNAME", content: "magnetite.scientistexperience.net", proxied: false } },
  }] }));
  await assert.rejects(() => actual.applyDns(cwd, "../root", "saved", savedPlan, signal), /Interrupted apply still has changes/);
  assert.equal(applies, 0);
  console.log("PASS mocked commands: exact-system activation reconciliation and interrupted DNS intent/zero-change recovery");
  await assert.rejects(() => actual.planDns(cwd, "root", "saved", savedPlan, signal), /outside the source tree/);
  await assert.rejects(() => actual.planDns(cwd, "../root", "saved", { source: "path:/mock", sha: savedPlan.sha }, signal), /committed git\+file/);
  handler = (command) => {
    if (command.includes("-T commit_id")) return observed(savedPlan.sha);
    if (command.startsWith("git cat-file")) return observed();
    if (command.includes("show-ref --verify")) return observed(`${savedPlan.sha} refs/heads/rollup-landing`);
    throw Error(`Unexpected source command ${command}`);
  };
  assert.equal((await actual.resolveSource(cwd, "tip", "rollup-landing", signal)).source, savedPlan.source);
  console.log("PASS F2: DNS reuses omnigent git+file resolution and rejects in-tree evidence/path sources");
  const dnsPath = "modules/terranix/cloudflare.nix", dnsContent = 'name = "mq";\n';
  const reviewedDns = { sha256: tools.sha256(dnsContent) };
  let staleDns = false, missingRecord = false;
  handler = (command) => {
    if (command === "jj debug snapshot") return observed();
    if (command.startsWith("git show")) { assert(command.includes(`${savedPlan.sha}:${dnsPath}`)); return observed(staleDns ? "old" : dnsContent); }
    if (command.startsWith("git grep")) { assert(command.includes(savedPlan.sha) && command.includes(dnsPath)); return observed("record", missingRecord ? 1 : 0); }
    throw Error(`Unexpected DNS content command: ${command}`);
  };
  await actual.snapshotWorkingCopy(cwd, signal);
  assert.equal((await actual.verifyDnsSource(cwd, savedPlan, reviewedDns, signal)).sha256, reviewedDns.sha256);
  staleDns = true;
  await assert.rejects(() => actual.verifyDnsSource(cwd, savedPlan, reviewedDns, signal), /differs from reviewed/);
  staleDns = false; missingRecord = true;
  await assert.rejects(() => actual.verifyDnsSource(cwd, savedPlan, reviewedDns, signal));
  await assert.rejects(() => actual.verifyDnsSource(cwd, { ...savedPlan, source: "path:/mock" }, reviewedDns, signal), /revision-pinned/);
  console.log("PASS R2 commands: snapshot forwards signal; git show hash and record grep bind the resolved DNS rev before planning");
  const oldPathsIn = globalThis.__mqCommandMock.pathsIn, oldOneId = globalThis.__mqCommandMock.oneId;
  let pending = true;
  const owned = { workingCopy: "wwww", join: "jjjj", seed: "ssss", tip: "kkkk", changes: [{ id: "kkkk", paths: [dnsPath, slices.tasks] }] };
  globalThis.__mqCommandMock.pathsIn = async (_cwd, rev) => rev === "@" ? pending ? [dnsPath, slices.tasks] : [] : [dnsPath, slices.tasks];
  globalThis.__mqCommandMock.oneId = async (_cwd, rev) => ({ "@-": "jjjj", "ssss+": "kkkk", "kkkk-": "ssss", "kkkk+": "jjjj", "rollup-landing": "kkkk" })[rev];
  const amendmentStart = commands.length;
  handler = (command) => {
    if (command === "git symbolic-ref -q HEAD") return observed("", 1);
    if (command === "jj debug snapshot") return observed();
    if (command.startsWith("jj squash")) { assert(command.includes("--into 'kkkk'")); pending = false; return observed(); }
    throw Error(`Unexpected candidate mutation: ${command}`);
  };
  const routeSnapshot = globalThis.__mqCommandMock.snapshot;
  globalThis.__mqCommandMock.snapshot = async () => ({ "modules/terranix/cloudflare.nix": "changed" });
  await assert.rejects(() => actual.route(cwd, owned, slices.s2, {}, signal, "kkkk"), /Scoped inputs changed/);
  globalThis.__mqCommandMock.snapshot = async () => ({ [foreignDns]: "changed" });
  const amended = await actual.route(cwd, owned, slices.s2, {}, signal, "kkkk");
  assert.equal(amended.changes.length, 1); assert.equal(amended.tip, "kkkk");
  assert.deepEqual(amended.foreignDrift, [foreignDns]);
  globalThis.__mqCommandMock.snapshot = routeSnapshot;
  assert(!commands.slice(amendmentStart).some((command) => command.startsWith("jj new") || command.includes("abandon")));
  globalThis.__mqCommandMock.pathsIn = oldPathsIn; globalThis.__mqCommandMock.oneId = oldOneId;
  console.log("PASS R4 commands: candidate repair squashes --into the same owned change without appending or abandoning");

  const taskPath = join(cwd, slices.tasks), operatorTasks = "- [ ] 1.1 G1\n- [ ] 8.2 G2\n- [ ] 2.1 input";
  files.set(taskPath, operatorTasks); files.set("/mock/flake.nix", "old");
  const lock = { nodes: { nixbot: { locked: { rev: "nixbot" } }, "buildbot-nix": { locked: { rev: "buildbot" } } } };
  files.set("/mock/flake.lock", JSON.stringify(lock));
  let badArm = "";
  handler = (command) => {
    if (command.includes("--expr")) {
      const control = slices.negativeControls.find((control) => command.includes(control.override));
      assert(control); return observed("", 1, control.message);
    }
    if (command.includes("#checks.")) return observed("/nix/store/mock.drv");
    if (command.startsWith("nix flake metadata")) return observed({ locks: lock });
    if (command.includes("--apply")) {
      for (const required of ["privateKeyFile ==", "webhookSecretFile ==", "ensureDBOwnership", "GITEA_MQ_BATCH_MAX"]) assert(command.includes(required));
      return observed({ values: true, service: true, resources: true, credentials: true, bindings: true, ownership: true, environment: true, appId: 1234, vhost: true, nixbot: true, pre: null, ...(badArm ? { [badArm]: false } : {}) });
    }
    if (command === "jj debug snapshot" || command.startsWith("git diff --stat")) return observed();
    throw Error(`Unexpected S1 command ${command}`);
  };
  const firstGate = await actual.s1Gate(cwd, JSON.stringify(lock), { pre: null }, signal);
  assert(!firstGate.verifiedTasks.includes("4.1"));
  const completeApp = await actual.s1Gate(cwd, JSON.stringify(lock), { pre: null }, signal, 1234);
  assert(completeApp.verifiedTasks.includes("4.1"));
  for (const task of ["2.1", "3.1", "4.2", "4.4", "5.1"]) {
    assert(!completeApp.verifiedTasks.includes(task));
    assert(completeApp.observations.find((row) => row.taskId === task).missing.length);
  }
  for (const arm of ["bindings", "ownership", "environment"]) { badArm = arm; await assert.rejects(() => actual.s1Gate(cwd, JSON.stringify(lock), { pre: null }, signal, 1234), /pinned contract/); }
  badArm = "";
  await assert.rejects(() => actual.s1Gate(cwd, JSON.stringify(lock), { pre: null }, signal, 999), /App-id/);
  console.log("PASS F7: task-arm receipts, unobserved tasks unverified, credential/ownership/environment negative controls");

  for (const path of [slices.varsAllowed[0] + "/key.pem/secret", slices.varsAllowed[1] + "/secret/secret"]) files.set(join(cwd, path), '{"sops":{},"secret":"ENC[opaque]"}');
  handler = (command) => {
    assert(!command.includes("--no-commit") && !command.includes("--help"));
    if (command.includes("clan ")) {
      assert(command.startsWith("CLAN_NO_COMMIT=1 clan vars "));
      return observed("gitea-mq-github-app-secret-key set\ngitea-mq-github-webhook-secret set");
    }
    if (command === "git symbolic-ref -q HEAD") return observed("", 1);
    if (command === "git rev-parse HEAD" || command === "git rev-list --all | sort") return observed("unchanged");
    throw Error(`Unexpected vars command ${command}`);
  };
  const generated = await actual.generateVars(cwd, { workingCopy: "wwww", join: "jjjj", seed: "ssss", tip: "ssss", changes: [] }, signal);
  assert.equal(generated.noCommitEnvironment, "CLAN_NO_COMMIT=1");
  console.log("PASS F3: Clan generation/list explicitly disable commits and retain topology backstop");
  let probeRef = "", creates = 0, deletes = 0, failReadback = false;
  handler = (command) => {
    if (command === "gh api /user --jq .login") return observed("cameronraysmith");
    if (command === "git rev-parse HEAD") return observed("a".repeat(40));
    if (command.startsWith("git ls-remote")) {
      if (failReadback) { failReadback = false; throw Error("readback interrupted"); }
      return observed(probeRef);
    }
    if (command.startsWith("git push")) {
      if (command.endsWith(" :refs/landings/v6-probe")) { deletes++; probeRef = ""; }
      else { creates++; probeRef = `${"a".repeat(40)}\trefs/landings/v6-probe`; }
      return observed();
    }
    throw Error(`Unexpected V6 command ${command}`);
  };
  const created = await actual.v6Create(cwd, "../root", "authorized", signal);
  failReadback = true;
  await assert.rejects(() => actual.v6Finish(cwd, created, signal), /interrupted/);
  await actual.v6Finish(cwd, created, signal);
  await actual.v6Finish(cwd, created, signal);
  await assert.rejects(() => actual.v6Create(cwd, "../root", "authorized", signal), /exists/);
  assert.equal(creates, 1); assert.equal(deletes, 1);
  console.log("PASS F5: consumed create intent blocks replay; readback/cleanup retry never repeats create");

  console.log("PASS P1: complete-proposal allowlist/operator-box validation precedes all writes");

  files.set("/mock/flake.nix", "declaration");
  files.set(join(cwd, slices.tasks), "- [ ] 1.1 G1\n- [ ] 8.2 G2");
  const human = tools.humanBoxes(get(join(cwd, slices.tasks)));
  let lockCalls = 0;
  handler = (command) => {
    assert.equal(command, "nix flake lock --update-input gitea-mq");
    lockCalls++;
    if (lockCalls === 1) throw Error("Interrupted lock");
    return observed();
  };
  await assert.rejects(() => actual.lockInput(cwd, null, human, signal), /Interrupted lock/);
  const relocked = await actual.lockInput(cwd, null, human, signal);
  await actual.lockInput(cwd, relocked.declaration, human, signal);
  assert.equal(lockCalls, 2, "A successful declaration is reused; an interrupted lock is retried");
  console.log("PASS mocked relock: interrupted declaration retries and completed declaration is reused");

  let tables = "public|queue|table|gitea-mq";
  let acme = "LoadState=loaded\nResult=success\nExecMainStatus=0\nExecMainStartTimestampMonotonic=42";
  handler = (command) => {
    if (command.startsWith("python3 -c")) return observed({ url: `https://${slices.domain}/webhook/github` });
    if (command.includes("is-active")) return observed("active");
    if (command.startsWith("curl")) return observed(command.includes("-X POST") ? "401" : "200 ssl_verify=0");
    if (command.includes("-p Environment")) return observed(slices.runtimeEnvironment.join(" "));
    if (command.includes("SELECT d.datname")) return observed("gitea-mq|gitea-mq|f|f");
    if (command.includes("\\dt public")) return observed(tables);
    if (command.includes("psql")) return observed();
    if (command.includes("-p User -p DynamicUser")) return observed("User=gitea-mq\nDynamicUser=yes");
    if (command.includes("journalctl")) return observed("started");
    if (command.includes("acme-mq")) return observed(acme);
    return savedHandler(command);
  };
  const runtime = await actual.runtimeProbe(cwd, "approved.json", "before.json", 1234, signal);
  assert.equal(runtime.deployed, true);
  assert.equal(runtime.redelivery.kind, "NotRun");
  tables = "public|queue|table|postgres";
  await assert.rejects(() => actual.runtimeProbe(cwd, "approved.json", "before.json", 1234, signal), /No migrated tables/);
  tables = "public|queue|table|gitea-mq";
  acme = acme.replace("=42", "=0");
  await assert.rejects(() => actual.runtimeProbe(cwd, "approved.json", "before.json", 1234, signal), /has not run successfully/);
  console.log("PASS mocked runtime: table ownership, certificate execution, webhook redelivery remains not_run");

  handler = (command) => {
    assert.equal(command, tools.linearView);
    return observed({ state: { name: "In Review" } });
  };
  await actual.linearReadback(cwd, "In Review", signal);
  await assert.rejects(() => actual.linearReadback(cwd, "In Progress", signal), /readback differs/);
  files.set(join(cwd, slices.proposal), "---\nlast_synced_state: Backlog\nlast_synced_at: old\nattempt_log:\n---\n");
  await actual.syncProposal(cwd, "In Review", tools.linearOutcome(true, true, false), signal);
  assert.match(get(join(cwd, slices.proposal)), /last_synced_state: In Review/);
  assert.match(get(join(cwd, slices.proposal)), /"comment":"Failed"/);
  console.log("PASS mocked commands: Linear readback and witnessed transition with failed comment");
  const gateLedger = [
    { gate: "preflight", taskIds: ["4.1", "11.2"], evidence: "preflight.json", status: { kind: "Unverified", reason: "No observation" } },
    { gate: "s1", taskIds: ["4.1"], evidence: "s1.json", status: { kind: "Passed" } },
    { gate: "G1", taskIds: [], evidence: "G1.json", status: { kind: "Operator", decision: "approved" } },
  ];
  const invented = "FABRICATED_PASS_11_2";
  const malicious = Array.from({ length: 8 }, (_, i) => `## ${i + 1}. model verdict\n- [x] [verified here] 11.2 ${invented}\n[operator] invented`).join("\n");
  handler = (command) => { assert(command.startsWith("openspec validate")); return observed(); };
  await actual.writeVerify(cwd, { analysis: malicious, caveats: malicious }, gateLedger, "../root", signal);
  const verification = get(join(cwd, slices.verify));
  const verdicts = verification.split("## Non-verdict model commentary")[0];
  assert(!verdicts.includes(invented), "Model pass not present in ledger leaked into verdict sections");
  assert.match(verdicts, /11\.2.*unverified/);
  assert.match(verdicts.replace(/\\/g, ""), /\[verified here\].*4\.1.*s1\.json/);
  await actual.writeVerify(cwd, { analysis: "Different prose", caveats: "Different caveats" }, gateLedger, "../root", signal);
  const withoutTime = (text) => text.replace(/^\*\*Verified at\*\*:.*$/m, "");
  assert.equal(withoutTime(get(join(cwd, slices.verify)).split("## Non-verdict model commentary")[0]), withoutTime(verdicts), "Verdicts and attributions must be independent of model text");
  console.log("PASS P11: model-invented pass and attribution cannot enter deterministic task verdict sections");
  delete globalThis.__mqCommandMock;
}
