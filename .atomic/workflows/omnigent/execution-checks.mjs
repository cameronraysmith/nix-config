import assert from "node:assert/strict";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const observation = (stdout = "", exitCode = 0, stderr = "") => ({ command: "mock", stdout, stderr, exitCode, state: "exited", terminationSignal: null, logPath: "mock.log", tail: "" });

export async function runExecutionChecks({ ts, main, moduleUrl, tools, types, slices }) {
  const signal = new AbortController().signal;
  const membership = slices[9].gates[22];
  assert.equal(membership?.kind, "NixEval", "S9 must assert installed current-version membership in both homes");
  assert.equal(membership.target.kind, "Expr");
  assert.deepEqual(membership.expect, { kind: "Equal", value: [true, true] });
  for (const [linux, darwin, expected] of [
    ["0.13.0", "0.13.0", [true, true]],
    ["0.12.0", "0.13.0", [false, true]],
    ["0.13.0", "0.12.0", [true, false]],
    ["0.12.0", "0.12.0", [false, false]],
  ]) {
    const model = {
      nixosConfigurations: { magnetite: { config: { "home-manager": { users: { cameron: { home: { packages: [{ name: `omnigent-${linux}` }] } } } } } } },
      homeConfigurations: { "crs58@aarch64-darwin": { config: { home: { packages: [{ name: `omnigent-${darwin}` }] } } } },
    };
    const expr = membership.target.expr.replaceAll('builtins.getFlake "__OMNIGENT_SOURCE__"', `(builtins.fromJSON ${JSON.stringify(JSON.stringify(model))})`);
    const stdout = execFileSync("nix", ["eval", "--json", "--expr", expr], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(stdout), expected);
    assert.equal(JSON.stringify(expected) === JSON.stringify(membership.expect.value), linux === "0.13.0" && darwin === "0.13.0");
    console.log(`PASS S9:22 membership model linux=${linux} darwin=${darwin}: stdout=${stdout.trim()}; exit=0; gate=${linux === "0.13.0" && darwin === "0.13.0" ? "pass" : "fail"}`);
    console.log(JSON.stringify({ command: ["nix", "eval", "--json", "--expr", expr], stdout, exitCode: 0 }));
  }
  const serverPairs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const excluded = new Set(["1:0", ...serverPairs.map((index) => `2:${index}`), "2:25", "3:34", "4:0", "4:1", "4:2", "4:3", "4:4", "4:5", "7:0", "7:10", "8:22"]);
  const expectedJoinSlices = slices.map((slice) => ({ ...slice, gates: slice.gates.filter((_, index) => !excluded.has(`${slice.id}:${index}`)) }));
  const { joinGateManifest, joinGateSupersessions, joinSlices } = await import(moduleUrl(".atomic/workflows/omnigent/slices.ts"));
  assert.deepEqual(joinSlices, expectedJoinSlices);
  assert.deepEqual(joinGateManifest.filter((entry) => entry.supersession).map((entry) => `${entry.slice}:${entry.index}`).sort(), [...excluded].sort());
  for (const entry of joinGateSupersessions) {
    for (const ref of [entry.superseded, entry.superseding]) {
      assert(ref.identity && slices[ref.slice].gates[ref.index] === ref.gate);
    }
    assert(entry.property && entry.falseAtJoin);
    assert(entry.superseding.slice > entry.superseded.slice);
    assert(!excluded.has(`${entry.superseding.slice}:${entry.superseding.index}`));
  }
  const { fixture } = await import(moduleUrl(".atomic/workflows/omnigent/slices.ts"));
  for (const index of serverPairs) {
    const entry = joinGateSupersessions.find(({ superseded }) => superseded.slice === 2 && superseded.index === index);
    assert.deepEqual([entry.superseding.slice, entry.superseding.index], [3, index]);
    assert.deepEqual({ ...entry.superseded.gate, target: { kind: "Expr", expr: entry.superseded.gate.target.expr.replace(fixture, '(builtins.getFlake "__OMNIGENT_SOURCE__").nixosConfigurations.magnetite.config') } }, entry.superseding.gate);
  }
  const toplevel = joinGateSupersessions.find(({ superseded }) => superseded.slice === 2 && superseded.index === 25);
  assert.deepEqual([toplevel.superseding.slice, toplevel.superseding.index], [3, 37]);
  assert.deepEqual(toplevel.superseding.gate, { kind: "NixBuildRemote", installable: "__OMNIGENT_SOURCE__#checks.x86_64-linux.nixos-magnetite" });
  for (const [slice, index] of [[7, 10], [8, 22]]) {
    const entry = joinGateSupersessions.find(({ superseded }) => superseded.slice === slice && superseded.index === index);
    assert.deepEqual([entry.superseding.slice, entry.superseding.index], [10, 8]);
    assert.deepEqual(entry.superseded.gate, slices[7].gates[10]);
  }
  for (const index of [10, 11, 21, 22, 23, 24]) assert(joinGateManifest.some((entry) => entry.slice === 2 && entry.index === index && !entry.supersession));
  assert(joinGateManifest.filter((entry) => entry.slice === 10).every((entry) => !entry.supersession));
  assert(joinGateManifest.filter((entry) => entry.gate.kind === "NixBuildRemote").every((entry) => !entry.supersession));
  for (const gate of slices[8].gates.filter((gate) => gate.kind === "GrepAssert")) assert(joinSlices[8].gates.includes(gate));
  const pinned = { primary: "/primary", sha: "a".repeat(40), source: `git+file:///primary?ref=omnigent-magnetite&rev=${"a".repeat(40)}` };
  const response = (item, value = "passed") => ({ kind: "human_attested", item, response: value });
  assert.equal(types.acceptanceStatus(types.checklist.map((item) => response(item))), "human_attested");
  for (const value of ["failed", "not tested"]) {
    assert.equal(types.acceptanceStatus(types.checklist.map((item, i) => response(item, i ? "passed" : value))), "incomplete");
  }
  assert.equal(types.acceptanceStatus([]), "incomplete");
  for (const policy of [types.IMPL, types.DOCS, types.IDENTITY, types.REVIEW, types.REPORT]) types.validateModelPolicy(policy);
  assert.equal(types.IDENTITY.model, `${types.MODEL}:max`);
  assert.equal(types.REVIEW.model, `${types.MODEL}:max`);
  assert.equal(types.REPORT.model, `${types.MODEL}:medium`);
  assert.throws(() => types.validateModelPolicy({ model: "other/model:high" }), /Astra-only/);
  assert.throws(() => types.validateModelPolicy({ ...types.IMPL, fallbackModels: ["other/model:high"] }), /Astra-only/);
  assert.throws(() => types.validateModelAttempts(types.IMPL.model, [{ model: "other/model", reasoningLevel: "high", success: true }]), /differs/);
  assert.throws(() => types.validateModelAttempts(types.IMPL.model, [{ model: types.MODEL, reasoningLevel: "medium", success: true }]), /differs/);
  assert.throws(() => types.validateModelAttempts(types.IMPL.model, [{ model: "other/model", reasoningLevel: "high", success: false }, { model: types.MODEL, reasoningLevel: "high", success: true }]), /differs/);

  const baseline = { "pkgs/a/own": "old", "pkgs/a/foreign": "untouched", "elsewhere/file": "foreign" };
  const reviewed = { ...baseline, "pkgs/a/own": "reviewed" };
  assert.throws(() => tools.assertNoPreexisting(["pkgs/a/foreign"], ["pkgs/a"]), /reconciliation/);
  assert.deepEqual(tools.reviewedPaths(baseline, reviewed, reviewed, ["pkgs/a"], ["pkgs/a/own", "elsewhere/file"]), ["pkgs/a/own"]);
  assert.throws(() => tools.assertScopeInputs(baseline, { ...baseline, "pkgs/a/foreign": "concurrent" }, ["pkgs/a"]), /before writer/);
  assert.throws(() => tools.reviewedPaths(baseline, reviewed, reviewed, ["pkgs/a"], ["pkgs/a/own", "pkgs/a/foreign"]), /Unreviewed/);
  assert.throws(() => tools.reviewedPaths(baseline, reviewed, { ...reviewed, "pkgs/a/own": "raced" }, ["pkgs/a"], ["pkgs/a/own"]), /Unreviewed/);
  assert.throws(() => tools.reviewedPaths(baseline, reviewed, reviewed, ["pkgs/a"], []), /no longer belong/);
  assert.throws(() => tools.squashCommand("kkkk", ["vars/per-machine/magnetite/foreign/value"], tools.varsPaths), /Squash path/);

  const negative = slices[3].gates.find((gate) => gate.kind === "Command" && !gate.expectExitZero);
  for (const stderr of ["network unavailable", `syntax error near '${negative.failureDiagnostic}'`, `error: unrelated: ${negative.failureDiagnostic}`]) {
    assert.equal((await tools.runGate("unused", negative, signal, async () => observation("", 1, stderr), pinned)).passed, false);
  }
  assert.equal((await tools.runGate("unused", negative, signal, async () => observation("", 1, `error: ${negative.failureDiagnostic}`), pinned)).passed, true);
  assert.equal((await tools.runGate("unused", negative, signal, async () => observation("", 0, `error: ${negative.failureDiagnostic}`), pinned)).passed, false);
  assert.equal((await tools.runGate("unused", negative, signal, async () => ({ ...observation("", 1, `error: ${negative.failureDiagnostic}`), state: "interrupted" }), pinned)).passed, false);
  const serverCommands = [];
  const firstBoot = await tools.probeDeployment("unused", signal, async (_cwd, command) => {
    serverCommands.push(command);
    assert(!command.includes("omnigent-host"), "Unauthenticated runner must not prevent first login");
    return observation(command.includes("is-active") ? "active\nactive\nactive\n" : command.includes("nginx.conf") ? "1\n" : JSON.stringify({ issuer: "https://accounts.scientistexperience.net/oauth2/openid/omnigent" }));
  });
  assert.equal(firstBoot.deployed, true);
  assert.equal(serverCommands.filter((command) => command.includes("nginx.conf") && command.includes("grep -c")).length, 2);
  const runnerCommands = [];
  await tools.probeRunner("unused", signal, async (_cwd, command) => { runnerCommands.push(command); return observation("env_0=true\nenv_1=true\nenv_2=true\nserver=true\n"); });
  assert(!runnerCommands[0].includes("python3"));
  assert(runnerCommands[0].includes("-p Environment --value") && runnerCommands[0].includes("-p ExecStart --value"));
  assert(!runnerCommands[0].includes('printf "$environment"') && !runnerCommands[0].includes('printf "$command"'));
  await assert.rejects(() => tools.probeRunner("unused", signal, async () => observation("env_0=true\n")), /presence checks/);
  const catalogCommands = [];
  const catalog = await tools.probeHarnessCatalog("unused", signal, async (_cwd, command) => { catalogCommands.push(command); return observation("name: magnetite\nname: Atomic\ncommand: bunx pi-acp@0.0.33\n"); });
  assert.equal(catalog.server_config_observed, true);
  assert(catalogCommands[0].includes("systemctl show omnigent -p Environment --value") && catalogCommands[0].includes("OMNIGENT_CONFIG_HOME=") && !catalogCommands[0].includes("curl") && !catalogCommands[0].includes("cat "));
  assert(!catalogCommands[0].includes("python3") && catalogCommands[0].includes("(name|command):"));
  assert(catalog.http_row.includes("human-attested"));
  await assert.rejects(() => tools.probeHarnessCatalog("unused", signal, async () => observation("name: magnetite\n")), /ACP agent fields not observed/);
  await assert.rejects(() => tools.probeHarnessCatalog("unused", signal, async () => observation("", 1)), /exit 1/);
  const hookCommands = [];
  const hookEnv = await tools.probeClaudeHookEnv("unused", signal, async (_cwd, command) => { hookCommands.push(command); return observation("claude-hook-env=clean\n"); });
  assert.deepEqual(hookEnv, { settings_observed: true, tmp_claude_absent: true });
  assert(hookCommands[0].startsWith("ssh root@magnetite.zt ") && hookCommands[0].includes("file=~cameron/.claude/settings.json"));
  const hookScript = execFileSync("bash", ["-c", `ssh() { printf '%s' "$2"; }\n${hookCommands[0]}`], { encoding: "utf8" });
  execFileSync("bash", ["-n"], { input: hookScript });
  execFileSync("shellcheck", ["--shell=bash", "-"], { input: hookScript, stdio: ["pipe", "inherit", "inherit"] });
  for (const result of [observation(""), observation("", 1), observation("", 2)]) await assert.rejects(() => tools.probeClaudeHookEnv("unused", signal, async () => result));
  for (const [contents, expected, grepError = false] of [['{"env":{}}', 0], ['{"env":{"TMPDIR":"/tmp/claude"}}', 1], ['{"env":{"TMPPREFIX":"/tmp/claude/zsh"}}', 1], [null, 1], ['{"env":{}}', 1, true]]) {
    const script = `set -eu\nfile=$(mktemp); trap 'rm -f "$file"' EXIT\n${contents === null ? 'rm -f "$file"' : `printf '%s' '${contents}' > "$file"`}\n${grepError ? 'grep() { return 2; }' : ''}\n${hookScript.replace("file=~cameron/.claude/settings.json", 'file="$file"')}`;
    const result = spawnSync("bash", ["-c", script], { encoding: "utf8", env: { ...process.env, BASH_ENV: "/dev/null" } });
    assert.equal(result.status, expected, result.stderr);
  }
  console.log("PASS acceptance, Astra-only policy, ownership/hash checks, exact negative diagnostic, first-boot and sanitized runner probe contracts");

  const toolNames = ["capture", "save", "snapshot", "processCheckpoint", "classifyScope", "squashCommand", "ids", "oneId", "tfstatePaths", "pathsIn", "assertHealthy", "assertNoPreexisting", "assertScopeInputs", "reviewedPaths", "assertChangeSha", "varsPaths", "seedChain", "createChange", "verifyTopology", "runGateSandbox", "writeWizard", "probeDeployment", "probeRunner", "probeHarnessCatalog", "probeClaudeHookEnv"];
  const toolModule = dataUrl(toolNames.map((name) => `export const ${name} = globalThis.__omnigentMock.tools.${name};`).join("\n"));
  const bumpModule = dataUrl("export const quote = (s) => `'${s}'`; export const requireSuccess = (r) => { if (r.exitCode) throw Error('mock failure'); return r.stdout.trimEnd(); };");
  const fsModule = dataUrl("export const writeFile = async (p, v) => globalThis.__omnigentMock.files.set(p, v); export const mkdir = async () => {}; ");
  const atomicModule = dataUrl("export const workflow = (spec) => spec;");
  const deploymentModule = dataUrl(["resolveSource", "resolveRevisionSource", "resolveJoinSource", "planDns", "applyDns", "updateMachine"].map((name) => `export const ${name} = globalThis.__omnigentMock.tools.${name};`).join("\n"));

  async function execute({ stopSlice, checklistValue = "passed", foreignAtStart = false, foreignDuringEarlierStage = false, driftAtReview = false, foreignAtReview = false, driftAtGate = false, driftBeforeRepairLand = false, driftBeforeLand = false, repairWithChanges = false, repairWithoutChanges = false, repairSlice = 0, maxRepairs = 2, persistentReview = false, failedFileGate = false, wrongModel = false, missingThinking = false, deploy = false, joinGateFailure = false, joinGateError = false, invalidJoin = false, start = 0, resumeFailure = false, invalidPlan = false, declinePlan = false, recovered = false, reuseS0 = false, proposalExists = false, s0Unchanged = false } = {}) {
    const events = [], files = new Map(), tree = { "foreign/quiet": "preserved" };
    let working = ["foreign/quiet"], bookmark = "ssss", allocated = "";
    const topology = { workingCopy: "wwww", join: "jjjj", seed: "ssss", tip: "ssss" };
    const changeIds = ["kkkk", "llll", "mmmm", "nnnn", "oooo", "qqqq", "rrrr", "tttt", "uuuu", "vvvv", "xxxx"];
    if (foreignAtStart) { working.push("pkgs/by-name/omnigent/foreign.nix"); tree[working.at(-1)] = "preexisting"; }
    const shas = Object.fromEntries(changeIds.map((id) => [id, "a".repeat(40)]));
    const populated = new Set([...changeIds.slice(0, start), ...(reuseS0 ? [changeIds[0]] : [])]);
    const sourceFor = (change) => ({ source: `git+file:///mock?ref=omnigent-magnetite&rev=${shas[change]}`, sha: shas[change] });
    const joinSource = { sha: "e".repeat(40), chainTipSha: "a".repeat(40), parents: ["a".repeat(40), "f".repeat(40)], source: `git+file:///mock?rev=${"e".repeat(40)}` };
    const mockedTools = {
      ...tools,
      save: async (_cwd, file, value) => { files.set(file, structuredClone(value)); },
      snapshot: async () => ({ ...tree }),
      capture: async (_cwd, command) => {
        events.push(command);
        if (command.includes("rev-parse --verify")) {
          const hash = command.includes("omnigent-ai") ? main.match(/omnigent-ai\/omnigent", "([a-f0-9]+)"/)[1] : command.includes("pi-acp") ? "d1cffc04" : command.includes("kanidm") ? "8d4465fa" : "abcd1234";
          return observation(hash.padEnd(40, "0"));
        }
        if (command.includes("mock sandbox command")) {
          assert.equal(_cwd, "/mock");
          assert(command.startsWith("cd '/sandbox'\n"), "Commands change cwd without relocating their durable evidence logs");
        }
        if (command.includes("show HEAD:package.json")) return observation('{"version":"0.0.33"}');
        if (command.startsWith("jj squash")) {
          const change = command.match(/--into '([^']+)'/)[1];
          if (populated.has(change)) shas[change] = String.fromCharCode(shas[change].charCodeAt(0) + 1).repeat(40);
          populated.add(change);
          working = working.filter((path) => !command.includes(`'${path}'`));
        }
        if (command.startsWith("jj bookmark set")) bookmark = command.match(/-r '([^']+)'/)[1];
        return observation("mock-observed");
      },
      ids: async () => [],
      tfstatePaths: ["terraform/terraform.tfstate", "terraform/terraform.tfstate.backup"],
      oneId: async (_cwd, rev) => rev === "@" ? "wwww" : rev === "omnigent-magnetite" ? bookmark : rev,
      pathsIn: async () => [...working],
      assertHealthy: async () => {},
      seedChain: async () => ({ topology: { ...topology, tip: start ? changeIds[start - 1] : topology.tip }, changes: changeIds.slice(0, start).map((change_id, slice) => ({ slice, change_id, verified: false })), recovered, reused_change: reuseS0 ? changeIds[0] : null, proposal_exists: proposalExists }),
      createChange: async (_cwd, _topology, slice) => changeIds[slice],
      verifyTopology: async (_cwd, _topology, changes) => {
        if (changes.some((change) => !populated.has(change.change_id))) throw Error("Invalid paths in slice");
        return changes;
      },
      assertChangeSha: async (_cwd, change, sha) => tools.assertChangeSha(_cwd, change, sha, signal, async () => observation(shas[change])),
      runGateSandbox: async (_cwd, gates, source, gateSignal, run) => {
        await run("/sandbox", "mock sandbox command", gateSignal);
        const atJoin = source.sha === joinSource.sha;
        if (atJoin) assert(expectedJoinSlices.some((slice) => JSON.stringify(slice.gates) === JSON.stringify(gates)), "Join batches must preserve every gate except the authorized explicit supersessions");
        if (atJoin && joinGateError) throw Error("Gate 0 (Command): process failed");
        const observations = gates.map((gate) => ({ sha: source.sha, passed: !(atJoin && joinGateFailure) && !resumeFailure && !(failedFileGate && gate.kind === "GrepAssert"), receipt: null, detail: "mock gate" }));
        if (driftAtGate) shas.kkkk = "c".repeat(40);
        return { ...source, observations, passed: observations.every((gate) => gate.passed) };
      },
      writeWizard: async (_cwd, root) => `${root}/omnigent-operator-wizard.sh`,
      probeDeployment: async () => ({ deployed: true, evidence: "mock server probes" }),
      probeRunner: async () => { events.push("runner-settings"); return { configured: true }; },
      probeHarnessCatalog: async () => { events.push("harness-config"); return { server_config_observed: true }; },
      probeClaudeHookEnv: async () => ({ settings_observed: true, tmp_claude_absent: true }),
      resolveSource: async (_cwd, change) => sourceFor(change),
      resolveRevisionSource: async (_cwd, change) => sourceFor(change),
      resolveJoinSource: async () => {
        assert(events.includes("route-tfstate"), "Resolve the join at deploy time, after DNS state routing");
        assert.equal(events.filter((event) => event === "resolve-deployment-source").length, 1);
        if (invalidJoin) throw Error("Chain tip is not an ancestor of development join");
        return joinSource;
      },
      planDns: async (_cwd, _root, source) => { if (invalidPlan) throw Error("Terraform plan contains other changes"); return { ...source, plan: "mock.tfplan", sha256: "plan-hash", summary: { action: "create", type: "cloudflare_dns_record", name: "omni.scientistexperience.net" } }; },
      applyDns: async () => ({ applied: true }),
      updateMachine: async (_cwd, source) => {
        assert.deepEqual(source, joinSource, "Activation must receive the exact gated join, not a chain source");
        return { ...source, before: "/nix/store/old", after: "/nix/store/new" };
      },
    };
    globalThis.__omnigentMock = { tools: mockedTools, files };
    let code = ts.transpileModule(main, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    code = code.replace(/from "([^"]+)"/g, (whole, name) => {
      if (name === "@bastani/atomic/workflows") return `from "${atomicModule}"`;
      if (name === "node:fs/promises") return `from "${fsModule}"`;
      if (name === "./omnigent/tools.js") return `from "${toolModule}#${Math.random()}"`;
      if (name === "./omnigent/deployment.js") return `from "${deploymentModule}#${Math.random()}"`;
      if (name === "./bump/tools.js") return `from "${bumpModule}"`;
      if (name.startsWith(".")) return `from "${moduleUrl(resolve(".atomic/workflows", name.replace(/\.js$/, ".ts")))}"`;
      return whole;
    });
    const definition = (await import(dataUrl(code + `\n// Mock isolation ${Math.random()}`))).default;
    const result = await definition.run({
      cwd: "/mock",
      inputs: { splice_after: "pppp", chain_name: "omnigent-magnetite", start_at_slice: start, verified_changes: changeIds.slice(0, start), max_repair_attempts: maxRepairs, build_timeout_minutes: 1, deploy, linear_team: "CAM" },
      tool: async (name, args, action, options) => {
        events.push(name);
        assert.equal(options.failureMode, "return");
        assert(options.timeoutMs > 0);
        if (name.startsWith("land-")) assert(args.identity.change);
        if (name.startsWith("gate-sandbox-") || name.startsWith("resume-gate-") || name.startsWith("deploy-join-gate-")) assert(args.identity.gatesHash && args.identity.sha && args.identity.source);
        if (driftBeforeRepairLand && name === "land-0-1") shas.kkkk = "c".repeat(40);
        if (driftBeforeLand && name === "land-0") tree[working.at(-1)] = "unowned-race";
        try {
          const value = await action({ signal });
          assert.deepEqual(JSON.parse(JSON.stringify(value)), value, `${name}: checkpoint must round-trip through JSON`);
          if (name === "allocate-evidence") allocated = value;
          return { ok: true, value };
        } catch (error) { return { ok: false, error: { message: String(error) } }; }
      },
      task: async (name, options) => {
        events.push(name);
        types.validateModelPolicy(options);
        const expectedLevel = name === "report" ? "medium" : name.startsWith("review-") ? "max" : "high";
        assert.equal(options.model, `${types.MODEL}:${expectedLevel}`);
        if (name.startsWith("review-")) {
          const declared = new Set(slices.flatMap((slice) => (slice.reviewReads ?? []).map((path) => path.replaceAll("__OMNIGENT_PRIMARY__", "/mock"))));
          assert(options.reads.every((path) => path.startsWith(allocated) || declared.has(path)));
          assert(options.reads.some((path) => path.endsWith(".diff")));
          assert(options.reads.some((path) => path.includes("gate-sandbox-")));
        }
        if (foreignDuringEarlierStage && name === "bind-tracking") {
          tree["pkgs/by-name/omnigent/foreign.nix"] = "concurrent";
          working.push("pkgs/by-name/omnigent/foreign.nix");
        }
        if (name.startsWith("implement-") && !(s0Unchanged && name === "implement-0")) {
          const slice = Number(name.split("-")[1]);
          const path = `${slices[slice].allowedPaths[0]}/owned-file`;
          tree[path] = `slice-${slice}`; working.push(path);
        }
        if (name === "review-0") {
          if (driftAtReview) shas.kkkk = "c".repeat(40);
          if (foreignAtReview) tree["foreign/quiet"] = "concurrent-write";
        }
        if (repairWithChanges && name.startsWith(`repair-${repairSlice}-`)) {
          const path = `${slices[repairSlice].allowedPaths[0]}/owned-file`;
          tree[path] = name; working.push(path);
        }
        const structured = name === `review-${stopSlice}` ? { verdict: "plan_invalidated", reason: "contradicted", affected_decisions: ["D1"] }
          : (repairWithoutChanges || repairWithChanges) && (name === `review-${repairSlice}` || persistentReview && name.startsWith(`review-${repairSlice}-`)) ? { verdict: "changes_requested", findings: ["repair"] }
          : name.startsWith("review-") ? { verdict: "approved" } : { summary: "mock" };
        const [model, reasoningLevel] = options.model.split(":");
        return { structured, modelAttempts: [{ model: wrongModel ? "other/model" : model, reasoningLevel: missingThinking ? undefined : reasoningLevel, success: true }] };
      },
      ui: {
        select: async (item) => { events.push(`select:${item}`); return item.startsWith("S") ? "stop-for-replan" : item.startsWith("Paths changed") ? "concurrent-agent: continue" : checklistValue; },
        confirm: async (item) => { events.push(`confirm:${item}`); return !(declinePlan && item.startsWith("Apply saved Terraform plan")); },
      },
      exit: (result) => result,
    });
    return { result: result.outputs ?? result, events, tree, working, files, allocated };
  }

  const fresh = await execute();
  assert.equal(fresh.result.status, "completed");
  for (const slice of slices) {
    const names = [`create-change-${slice.id}`, `implement-${slice.id}`, `scope-implement-${slice.id}`, `land-${slice.id}`, `gate-sandbox-${slice.id}`, `diff-${slice.id}`, `review-${slice.id}`, `review-sha-${slice.id}`, `verified-${slice.id}`];
    for (let i = 1; i < names.length; i++) assert(fresh.events.indexOf(names[i - 1]) < fresh.events.indexOf(names[i]), names.join(", "));
  }
  assert(!fresh.events.some((event) => event.includes("gate-inputs-stable") || event.includes("diff -r @")));
  const second = await execute();
  assert.notEqual(fresh.allocated, second.allocated, "Fresh runs cannot overwrite prior evidence");
  const resumed = await execute({ start: 11 });
  assert.equal(resumed.result.status, "completed");
  for (const slice of slices) {
    assert.equal(resumed.events.filter((event) => event.startsWith(`resume-gate-${slice.id}-`)).length, 1);
    const receipt = resumed.files.get(`${resumed.allocated}/resume-gate-${slice.id}-sandbox.json`).value.evidence;
    assert.equal(receipt.observations.length, slice.gates.length);
    assert(receipt.observations.every((gate) => gate.sha === receipt.sha));
  }
  assert(resumed.result.slice_changes.every((change) => change.verified));
  assert(!resumed.events.includes("bind-tracking") && !resumed.events.includes("create-change-0"));
  assert.equal(resumed.result.resume_at_slice, 11);
  const runtimeResume = await execute({ start: 5 });
  assert.equal(runtimeResume.result.status, "completed");
  assert(runtimeResume.events.includes("implement-5") && runtimeResume.events.includes("verified-5"));
  assert(!runtimeResume.events.includes("implement-4"));
  const runtimeStopped = await execute({ start: 5, stopSlice: 5, deploy: true });
  assert.equal(runtimeStopped.result.status, "blocked");
  assert.equal(runtimeStopped.result.resume_at_slice, 5);
  assert(!runtimeStopped.events.includes("generate-vars"));
  const ompResume = await execute({ start: 6 });
  assert.equal(ompResume.result.status, "completed");
  assert(ompResume.events.includes("implement-6") && ompResume.events.includes("verified-6"));
  assert(!ompResume.events.includes("implement-5"));
  const ompStopped = await execute({ start: 6, stopSlice: 6, deploy: true });
  assert.equal(ompStopped.result.status, "blocked");
  assert.equal(ompStopped.result.resume_at_slice, 6);
  const darwinResume = await execute({ start: 7 });
  assert.equal(darwinResume.result.status, "completed");
  assert(darwinResume.events.includes("implement-7") && darwinResume.events.includes("verified-7"));
  assert(!darwinResume.events.includes("implement-6"));
  const darwinStopped = await execute({ start: 7, stopSlice: 7, deploy: true });
  assert.equal(darwinStopped.result.status, "blocked");
  assert.equal(darwinStopped.result.resume_at_slice, 7);
  assert(!darwinStopped.events.includes("generate-vars"));
  const pyriteResume = await execute({ start: 8 });
  assert.equal(pyriteResume.result.status, "completed");
  assert(pyriteResume.events.includes("implement-8") && pyriteResume.events.includes("verified-8"));
  assert(!pyriteResume.events.includes("implement-7"));
  const pyriteStopped = await execute({ start: 8, stopSlice: 8, deploy: true });
  assert.equal(pyriteStopped.result.status, "blocked");
  assert.equal(pyriteStopped.result.resume_at_slice, 8);
  assert(!pyriteStopped.events.includes("generate-vars"));
  for (const start of [9, 10]) {
    const resumedSlice = await execute({ start });
    assert.equal(resumedSlice.result.status, "completed");
    assert(resumedSlice.events.includes(`implement-${start}`) && resumedSlice.events.includes(`verified-${start}`));
    assert(!resumedSlice.events.includes(`implement-${start - 1}`));
    const stoppedSlice = await execute({ start, stopSlice: start, deploy: true });
    assert.equal(stoppedSlice.result.status, "blocked");
    assert.equal(stoppedSlice.result.resume_at_slice, start);
    assert(!stoppedSlice.events.includes("generate-vars"));
  }
  assert(!ompStopped.events.includes("generate-vars"));
  for (const reuseS0 of [false, true]) for (const proposalExists of [false, true]) {
    const recovery = await execute({ recovered: true, reuseS0, proposalExists, s0Unchanged: reuseS0 });
    assert.equal(recovery.result.status, "completed");
    assert.equal(recovery.events.includes("bind-tracking"), !proposalExists);
    assert.equal(recovery.events.includes("create-change-0"), !reuseS0);
    assert(recovery.events.includes("implement-0") && recovery.events.includes("review-0"));
    const seedReceipt = recovery.files.get(`${recovery.allocated}/seed-chain.json`);
    assert.equal(seedReceipt.value.evidence.reused_change, reuseS0 ? "kkkk" : null);
    if (reuseS0) {
      assert(recovery.events.some((event) => event.startsWith("jj --ignore-working-copy diff -r 'kkkk'")));
      assert(!recovery.events.some((event) => event.startsWith("jj squash") && event.includes("'kkkk'")));
    }
  }
  const resumeBlocked = await execute({ start: 1, resumeFailure: true });
  assert.equal(resumeBlocked.result.status, "blocked");
  assert.match(resumeBlocked.result.summary, /Resume S0/);
  assert(!resumeBlocked.events.includes("create-change-1"));
  const foreign = await execute({ foreignAtStart: true });
  assert.equal(foreign.result.status, "blocked");
  assert(foreign.result.summary.includes("ownership reconciliation"));
  assert(!foreign.events.includes("seed-chain"));
  assert.equal(foreign.tree["pkgs/by-name/omnigent/foreign.nix"], "preexisting");
  const earlier = await execute({ foreignDuringEarlierStage: true });
  assert.equal(earlier.result.status, "blocked");
  assert(earlier.result.summary.includes("before writer"));
  assert(!earlier.events.includes("implement-1"));
  assert(earlier.working.includes("pkgs/by-name/omnigent/foreign.nix"));
  assert.equal(earlier.tree["pkgs/by-name/omnigent/foreign.nix"], "concurrent");
  for (const fault of [{ driftAtReview: true }, { driftAtGate: true }, { driftBeforeRepairLand: true, repairWithoutChanges: true }]) {
    const drift = await execute(fault);
    assert.equal(drift.result.status, "blocked");
    assert.match(drift.result.summary, /Change commit changed: gate=.*observed=/);
    assert(!drift.events.includes("verified-0"));
  }
  const beforeLand = await execute({ driftBeforeLand: true });
  assert.equal(beforeLand.result.status, "blocked");
  const resumeDrift = await execute({ start: 1, driftAtGate: true });
  assert.equal(resumeDrift.result.status, "blocked");
  assert.match(resumeDrift.result.summary, /Change commit changed/);
  assert(!resumeDrift.events.includes("create-change-1"));
  assert(!beforeLand.events.some((event) => event.startsWith("jj squash")));
  const unrelated = await execute({ foreignAtReview: true });
  assert.equal(unrelated.result.status, "completed");
  assert.equal(unrelated.tree["foreign/quiet"], "concurrent-write");
  const stopped = await execute({ stopSlice: 1 });
  assert.equal(stopped.result.status, "blocked");
  assert.equal(stopped.result.resume_at_slice, 1);
  assert.deepEqual(stopped.result.slice_changes, [{ slice: 0, change_id: "kkkk", verified: true }, { slice: 1, change_id: "llll", verified: false }]);
  assert(stopped.events.includes("land-1") && !stopped.events.includes("verified-1"));
  assert.equal(stopped.tree["foreign/quiet"], "preserved");
  assert(!stopped.working.includes("pkgs/by-name/omnigent/owned-file"), "Replan preserves landed but unverified slice content");
  for (const repairSlice of [0, 1]) for (const repairWithChanges of [false, true]) {
    const repaired = await execute({ repairWithoutChanges: !repairWithChanges, repairWithChanges, repairSlice });
    assert.equal(repaired.result.status, "completed", repaired.result.summary);
    const names = [`repair-${repairSlice}-1`, `land-${repairSlice}-1`, `gate-sandbox-${repairSlice}-1`, `diff-${repairSlice}-1`, `review-${repairSlice}-1`, `verified-${repairSlice}`];
    for (let i = 1; i < names.length; i++) assert(repaired.events.indexOf(names[i - 1]) < repaired.events.indexOf(names[i]));
    const receipt = repaired.files.get(`${repaired.allocated}/gate-sandbox-${repairSlice}-1.json`).value.evidence;
    assert.equal(receipt.observations.length, slices[repairSlice].gates.length);
    assert.equal(receipt.sha, (repairWithChanges ? "b" : "a").repeat(40));
    const squashes = repaired.events.filter((event) => event.startsWith("jj squash") && event.includes(`'${["kkkk", "llll"][repairSlice]}'`));
    assert.equal(squashes.length, repairWithChanges ? 2 : 1);
  }
  const bounded = await execute({ repairWithChanges: true, persistentReview: true, maxRepairs: 1 });
  assert.equal(bounded.result.status, "blocked");
  assert.match(bounded.result.summary, /repair bound/);
  assert(bounded.events.includes("review-0-1") && !bounded.events.includes("repair-0-2"));
  for (const failure of [{ persistentReview: true }, { failedFileGate: true }]) {
    const blocked = await execute({ repairWithoutChanges: true, ...failure });
    assert.equal(blocked.result.status, "blocked");
    assert(blocked.events.includes("review-0-1"));
    assert(!blocked.events.includes("repair-0-2") && !blocked.events.includes("verified-0"));
    assert.match(blocked.result.summary, /refreshed once/);
  }
  const modelDrift = await execute({ wrongModel: true });
  assert.equal(modelDrift.result.status, "blocked");
  assert(!modelDrift.events.includes("create-change-0"));
  const metadataMissing = await execute({ missingThinking: true });
  assert.equal(metadataMissing.result.status, "blocked");
  assert.match(metadataMissing.result.summary, /metadata unavailable/);
  for (const failure of [{ invalidPlan: true }, { declinePlan: true }]) {
    const isolated = await execute({ deploy: true, ...failure });
    assert.equal(isolated.result.status, "blocked");
    assert(!isolated.events.includes("apply-dns") && !isolated.events.includes("update-machine"));
  }
  for (const failure of [{ joinGateFailure: true }, { joinGateError: true }, { invalidJoin: true }]) {
    const blocked = await execute({ deploy: true, ...failure });
    assert.equal(blocked.result.status, "blocked");
    assert(!blocked.events.includes("update-machine"), "No chain fallback after failed join verification");
    if (!failure.invalidJoin) {
      assert.match(blocked.result.summary, /Development-join union gate failure S0/);
      assert(blocked.result.summary.includes(`join=${"e".repeat(40)}`));
      assert(blocked.result.summary.includes(`chain_tip=${"a".repeat(40)}`));
      assert.match(blocked.result.summary, /index|Gate 0/);
    }
  }
  for (const checklistValue of ["passed", "failed", "not tested"]) {
    const deployed = await execute({ deploy: true, checklistValue });
    const beforeLogin = deployed.events.indexOf("probe-deployment");
    const harness = deployed.events.indexOf("harness-config");
    const login = deployed.events.findIndex((event) => event.startsWith("confirm:Operator completed wizard"));
    const runner = deployed.events.indexOf("runner-settings");
    assert(beforeLogin >= 0 && beforeLogin < harness && harness < login && login < runner);
    assert.equal(deployed.result.deployed, true);
    assert.equal(deployed.result.acceptance, checklistValue === "passed" ? "human_attested" : "incomplete");
    assert.equal(deployed.result.status, checklistValue === "passed" ? "completed" : checklistValue === "failed" ? "blocked" : "completed-with-caveat");
    assert.equal(deployed.result.deployed_source.sha, "e".repeat(40));
    const joinNodes = expectedJoinSlices.map((slice) => `deploy-join-gate-${slice.id}-sandbox`);
    assert.deepEqual(deployed.events.filter((event) => event.startsWith("deploy-join-gate-")), joinNodes);
    const nodes = ["generate-vars", "resolve-dns-source", "plan-dns", "apply-dns", "route-tfstate", "resolve-deployment-source", ...joinNodes, "update-machine", "probe-deployment", "probe-harness-catalog", "probe-claude-hook-env", "write-wizard", "probe-host-online"];
    for (let i = 1; i < nodes.length; i++) assert(deployed.events.indexOf(nodes[i - 1]) < deployed.events.indexOf(nodes[i]));
    assert(deployed.events.some((event) => event.startsWith("confirm:Apply saved Terraform plan plan-hash:") && event.includes("cloudflare_dns_record") && event.includes("omni.scientistexperience.net")));
    const ledger = deployed.files.get(`${deployed.allocated}/ledger.json`);
    assert.deepEqual(ledger.filter((row) => row.kind === "human_attested").map((row) => row.response), types.checklist.map(() => checklistValue));
    assert.equal(deployed.result.resume_at_slice, 11);
    for (const slice of [3, 4, 5, 6, 7, 8, 9, 10]) assert.equal(deployed.files.get(`${deployed.allocated}/gate-sandbox-${slice}.json`).value.evidence.observations.length, slices[slice].gates.length);
    for (const slice of expectedJoinSlices) {
      const receipt = deployed.files.get(`${deployed.allocated}/deploy-join-gate-${slice.id}-sandbox.json`).value.evidence;
      assert.equal(receipt.observations.length, slice.gates.length);
      assert(receipt.observations.every((gate) => gate.passed && gate.sha === "e".repeat(40)));
    }
    const activation = deployed.files.get(`${deployed.allocated}/update-machine.json`).value.evidence;
    assert.equal(activation.chainTipSha, "a".repeat(40));
    assert.deepEqual(activation.parents, ["a".repeat(40), "f".repeat(40)]);
  }
  delete globalThis.__omnigentMock;
  console.log("PASS mocked graph: land-before-gate, committed repairs/resume, SHA stability, unrelated edit tolerance, ownership protection, model/metadata rejection, union-minus-authorized-supersessions at the deploy-time join, failed/throwing join gate and ancestry rejection without fallback, join provenance receipts, and human attestations");
  console.log("Atomic, filesystem writes, jj, network, and build effects are mocked; no barriers are bypassed.");
}
