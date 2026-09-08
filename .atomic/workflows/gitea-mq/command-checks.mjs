import assert from "node:assert/strict";
import { resolve, join } from "node:path";

const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const observed = (stdout = "", exitCode = 0, stderr = "") => ({
  command: "mock", stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout),
  stderr, exitCode, state: "exited", terminationSignal: null, logPath: "mock.log", tail: "",
});

/** Keep real helper implementations; replace only filesystem/process/deployment ports. */
export async function runCommandChecks({ ts, source, moduleUrl, tools, slices, typeboxUrl }) {
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
  const cwd = "/mock";
  const approved = tools.expectedRuleset(1234, 1);
  const before = { ...approved, name: "nixbot" };
  files.set("/mock/approved.json", JSON.stringify(approved));
  files.set("/mock/before.json", JSON.stringify({ ruleset: before, classic: { exitCode: 0, body: "{}" } }));
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
      const id = command.endsWith("4743700 installation") ? 4743700 : 1234;
      return observed({ app_id: id, installation_id: perAppMismatch ? 99 : id === 1234 ? 20 : 10, repositories: [slices.repository] });
    }
    throw Error(`Unmocked inventory command: ${command}`);
  };
  const identity = await actual.identityWitness(cwd, 1234, "queue", signal);
  assert.equal(identity.perApp.length, 2);
  assert.match(identity.trustBoundary, /token restrictions may hide/i);
  count = 3;
  await assert.rejects(() => actual.identityWitness(cwd, 1234, "queue", signal), /Incomplete App/);
  count = 2; extraHuman = true;
  await assert.rejects(() => actual.identityWitness(cwd, 1234, "queue", signal), /Sole write-capable/);
  extraHuman = false; perAppMismatch = true;
  await assert.rejects(() => actual.identityWitness(cwd, 1234, "queue", signal), /Per-App installation/);
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
  const reconciled = await actual.applyDns(cwd, "../root", "saved", savedPlan, signal);
  assert.equal(reconciled.reconciled, true);
  assert.equal(applies, 0, "Interrupted successful apply must not repeat the mutation");
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

  const taskPath = join(cwd, slices.tasks), operatorTasks = "- [ ] 1.1 G1\n- [ ] 8.2 G2\n- [ ] 2.1 input";
  files.set(taskPath, operatorTasks); files.set("/mock/flake.nix", "old");
  const valid = { path: "flake.nix", before: "old", after: "new" };
  const originalFiles = new Map(files);
  for (const bad of [
    { path: slices.tasks, before: operatorTasks, after: operatorTasks.replace("[ ] 1.1", "[x] 1.1") },
    { path: slices.tasks, before: operatorTasks, after: operatorTasks.replace("[ ] 8.2", "[x] 8.2") },
    { path: "modules/nixos/nixbot.nix", before: null, after: "forbidden" },
    { path: "packages/docs/../../flake.nix", before: null, after: "escape" },
    { path: "flake.nix", before: "old", after: "duplicate" },
  ]) {
    await assert.rejects(() => actual.applyStageEdits(cwd, [valid, bad], slices.s1, signal));
    assert.deepEqual(files, originalFiles, "Rejected proposal must apply NOTHING, even earlier valid edits");
  }
  await actual.applyStageEdits(cwd, [valid], slices.s1, signal);
  assert.equal(get("/mock/flake.nix"), "new"); assert.equal(get(taskPath), operatorTasks);
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
  delete globalThis.__mqCommandMock;
}
