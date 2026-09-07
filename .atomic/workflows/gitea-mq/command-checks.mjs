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
    lstat: async (path) => { get(path); return {}; },
    pathsIn: async () => [],
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
  const port = (name) => `export const ${name} = (...args) => globalThis.__mqCommandMock.${name}(...args);`;
  const fsModule = dataUrl(["readFile", "writeFile", "mkdir", "lstat"].map(port).join("\n"));
  const sharedModule = dataUrl(`export * from "${moduleUrl(".atomic/workflows/omnigent/tools.ts")}";\n` + ["capture", "save", "snapshot", "pathsIn"].map(port).join("\n"));
  const deployModule = dataUrl(`export * from "${moduleUrl(".atomic/workflows/omnigent/deployment.ts")}";\n` + ["applyDns", "updateMachine"].map(port).join("\n"));
  let code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  code = code.replace(/from "([^"]+)"/g, (whole, name) => {
    if (name === "node:fs/promises") return `from "${fsModule}"`;
    if (name === "../omnigent/tools.js") return `from "${sharedModule}"`;
    if (name === "../omnigent/deployment.js") return `from "${deployModule}"`;
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
    throw Error(`Unmocked activation command: ${command}`);
  };
  await actual.ensureActivated(cwd, { source: "pinned" }, signal);
  await actual.ensureActivated(cwd, { source: "pinned" }, signal);
  assert.equal(updates, 1, "Already-active generation must re-probe, not activate again");

  const savedPlan = { plan: "/mock/root/saved.tfplan", sha256: tools.sha256("saved plan"), tree: {}, source: "path:/mock", sha: "tree", decision: { kind: "NeedsApply", summary: {} } };
  files.set(savedPlan.plan, "saved plan");
  files.set("/mock/root/saved.apply-intent.json", JSON.stringify({ plan: savedPlan.plan, sha256: savedPlan.sha256 }));
  files.set("/mock/root/saved-reconcile.tfplan", "refreshed plan");
  files.set("/mock/root/saved-reconcile.tfplan.json", JSON.stringify({ resource_changes: [] }));
  files.set("/mock/modules/terranix/cloudflare.nix", "dns");
  handler = (command) => {
    assert(command.includes("-- plan -input=false"));
    return observed();
  };
  const reconciled = await actual.applyDns(cwd, "root", "saved", savedPlan, signal);
  assert.equal(reconciled.reconciled, true);
  assert.equal(applies, 0, "Interrupted successful apply must not repeat the mutation");
  files.set("/mock/root/saved.apply-intent.json", JSON.stringify({ plan: "/foreign", sha256: savedPlan.sha256 }));
  await assert.rejects(() => actual.applyDns(cwd, "root", "saved", savedPlan, signal), /intent differs/);
  files.set("/mock/root/saved.apply-intent.json", JSON.stringify({ plan: savedPlan.plan, sha256: savedPlan.sha256 }));
  files.set("/mock/root/saved-reconcile.tfplan.json", "{}");
  await assert.rejects(() => actual.applyDns(cwd, "root", "saved", savedPlan, signal), /Malformed empty/);
  files.set("/mock/root/saved-reconcile.tfplan.json", JSON.stringify({ resource_changes: [{
    mode: "managed", type: "cloudflare_dns_record", address: "cloudflare_dns_record.mq",
    change: { actions: ["create"], after: { name: slices.domain, type: "CNAME", content: "magnetite.scientistexperience.net", proxied: false } },
  }] }));
  await assert.rejects(() => actual.applyDns(cwd, "root", "saved", savedPlan, signal), /Interrupted apply still has changes/);
  assert.equal(applies, 0);
  console.log("PASS mocked commands: exact-system activation reconciliation and interrupted DNS intent/zero-change recovery");

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
