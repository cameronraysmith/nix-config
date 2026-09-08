import assert from "node:assert/strict";
import { resolve, join } from "node:path";

const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

/** Execute the authored run function, not a second graph, with all effects in memory. */
export async function runExecutionChecks({ ts, main, moduleUrl, tools, types, slices, ledgerTools, assertCompactCheckpoint }) {
  const { s1Coverage } = await import(moduleUrl(".atomic/workflows/gitea-mq/s1-observations.ts"));
  async function execute({ declineG2 = false, decline = "", rejectS1 = false, revisePlan = false, createFailure = false, cleanupFailure = false, exhaust = false, replay = false, probeFailure = false, repairNix = false, v3Failure = false, repairEvalFailure = false, dnsReject = false, dnsRejectOnce = false, rejectRoborev = false, throwExit = false, noHostnameEdit = false } = {}) {
    const files = new Map();
    const events = [];
    const cache = new Map();
    const signal = new AbortController().signal;
    const cwd = "/mock";
    const tree = {};
    let snapshotted = {}, routed = {}, failDns = dnsRejectOnce;
    const revisions = new Map(), committedTasks = new Map();
    const dnsPath = "modules/terranix/cloudflare.nix", dnsContent = 'resource.cloudflare_dns_record.mq = { name = "mq"; type = "CNAME"; content = "magnetite.scientistexperience.net"; proxied = false; };';
    let root = "", live = false, failProbe = probeFailure, failV3 = v3Failure, failRepairEval = repairEvalFailure, rejectReview = rejectS1, failCreate = createFailure, failCleanup = cleanupFailure;
    let callbacks = 0, stages = 0, prompts = 0, promptIndex = 0;
    const initialTasks = [...new Set(["1.1", "8.2", ...slices.s1.taskIds, "1.2", "1.3", "1.4", "3.2", "3.3", "6.1", "6.2", "8.1", "8.3", "8.4", "9.1", "10.1", ...Array.from({ length: 9 }, (_, i) => `11.${i + 1}`)])].map((id) => `- [ ] ${id} ${"task details ".repeat(30)}`).join("\n");
    assert(initialTasks.length > 8192);
    assert.throws(() => assertCompactCheckpoint({ evidence: { taskText: initialTasks } }), /8 KB/);
    files.set(join(cwd, slices.tasks), initialTasks);
    const get = (path) => {
      if (!files.has(path)) throw Object.assign(new Error(`Missing mock file: ${path}`), { code: "ENOENT" });
      return files.get(path);
    };
    const tick = async (_cwd, ids) => {
      const path = join(cwd, slices.tasks);
      files.set(path, get(path).split("\n").map((line) => ids.some((id) => line.startsWith(`- [ ] ${id} `)) ? line.replace("[ ]", "[x]") : line).join("\n"));
      return { completed: ids };
    };
    const snapshot = async () => ({ ...tree, [slices.tasks]: tools.sha256(get(join(cwd, slices.tasks))), ...(files.has(join(cwd, slices.verify)) ? { [slices.verify]: tools.sha256(get(join(cwd, slices.verify))) } : {}) });
    const mocked = {
      allocateEvidence: async () => "../evidence/run",
      processCheckpoint: async (_root, _name, action) => { const result = { receipt: [], evidence: await action() }; assertCompactCheckpoint(result); return result; },
      applyStageEdits: async (_cwd, edits) => {
        for (const edit of edits) {
          files.set(join(cwd, edit.path), edit.after);
          tree[edit.path] = edit.after;
          if (repairNix && events.at(-1).startsWith("apply-repair-")) live = false;
        }
        return { applied: edits.map((edit) => edit.path) };
      },
      sha256: tools.sha256,
      humanBoxes: tools.humanBoxes,
      assertTaskScope: tools.assertTaskScope,
      assertSameInputs: tools.assertSameInputs,
      save: async (_cwd, file, value) => files.set(join(cwd, file), JSON.stringify(value)),
      snapshot,
      snapshotWorkingCopy: async (_cwd, actualSignal) => { assert.equal(actualSignal, signal); snapshotted = await snapshot(); return { snapshotted: true }; },
      scope: snapshot,
      topology: async (_cwd, chain) => chain.changes.map((change) => change.id),
      preflight: async () => ({ chain: { workingCopy: "wwww", join: "jjjj", seed: "ssss", tip: "ssss", changes: [] }, lock: "baseline", baseline: {}, taskIds: [...tools.taskLedger(initialTasks).keys()], humanBoxes: tools.humanBoxes(initialTasks) }),
      lockInput: async () => ({ declaration: tree["flake.nix"] ?? "declaration", relocked: true }),
      s1Gate: async () => {
        if (exhaust || failRepairEval && events.at(-1)?.startsWith("eval-repair-")) {
          failRepairEval = false;
          throw Error("mock assertion/eval failed");
        }
        return { drv: "/nix/store/mock.drv", ...s1Coverage(["host-derivation", "four-negative-controls", "build-locks-unchanged", "build-metadata-unchanged", "build-aspects-unchanged", "nixbot-domain"]) };
      },
      diffArtifact: async (_cwd, evidence, name) => `${evidence}/${name}.diff`,
      route: async (_cwd, chain, slice, _reviewed, actualSignal, into = null) => {
        assert.equal(actualSignal, signal);
        snapshotted = await snapshot();
        const paths = Object.keys(snapshotted).filter((path) => snapshotted[path] !== routed[path] && slice.allowedPaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)));
        assert(paths.length, "Cannot route empty change");
        const id = into ?? `change-${chain.changes.length}`;
        if (into) events.push(`amend:${into}`);
        for (const path of paths) routed[path] = snapshotted[path];
        const sha = tools.sha256(JSON.stringify(routed));
        const next = { ...chain, tip: into ? chain.tip : id, changes: into ? chain.changes.map((change) => change.id === into ? { id, paths: [...new Set([...change.paths, ...paths])] } : change) : [...chain.changes, { id, paths }] };
        revisions.set(next.tip, { sha, tree: { ...routed } });
        committedTasks.set(id, get(join(cwd, slices.tasks)));
        return next;
      },
      linearUpdate: tools.linearUpdate,
      linearComment: tools.linearComment,
      linearOutcome: tools.linearOutcome,
      linearReadback: async (_cwd, state) => ({ state }),
      pendingPaths: async (_cwd, slice) => Object.keys(snapshotted).filter((path) => snapshotted[path] !== routed[path] && slice.allowedPaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))),
      syncProposal: async () => ({ synced: true }),
      run: async (_cwd, command) => command.includes("github.appId") ? "1234" : "",
      runStreaming: async () => "",
      generateVars: async () => ({ generated: true }),
      observeApp: async () => ({ id: 1234, slug: "queue" }),
      leakScan: async () => ({ leaked: false }),
      reviewDnsContent: async () => ({ sha256: tools.sha256(tree[dnsPath] ?? "") }),
      verifyDnsSource: async (_cwd, source, reviewed) => {
        const revision = [...revisions.values()].find((rev) => rev.sha === source.sha);
        assert.equal(tools.sha256(revision.tree[dnsPath] ?? ""), reviewed.sha256, "Pinned DNS source must contain the reviewed disk edit");
        return { sha: source.sha, sha256: reviewed.sha256 };
      },
      planDns: async (_cwd, _root, _id, source) => {
        assert([...revisions.values()].find((rev) => rev.sha === source.sha)?.tree[dnsPath]?.startsWith(dnsContent), "DNS plan pinned a stale source");
        if (dnsReject || failDns) { failDns = false; throw Error("Rejected DNS delta"); }
        return { plan: "mock.tfplan", sha256: "plan-hash", decision: { kind: "NeedsApply", summary: { name: slices.domain } } };
      },
      applyDns: async () => ({ applied: true }),
      dnsWitness: async () => ({ cname: "magnetite.scientistexperience.net." }),
      readRules: async (_cwd, evidence) => ({ file: `${evidence}/rulesets-before.json`, userId: 1 }),
      approveDraft: async (_cwd, evidence) => {
        files.set(join(cwd, evidence, "with-user.json"), "approved");
        files.set(join(cwd, evidence, "admin-only.json"), "approved-admin");
        return { file: `${evidence}/ruleset-diff.json`, withUser: `${evidence}/with-user.json`, adminOnly: `${evidence}/admin-only.json` };
      },
      applyRules: async () => ({ applied: true }),
      identityWitness: async () => ({ identities: ["nixbot", "queue"] }),
      resolveSource: async (_cwd, tip) => ({ source: `git+file:///mock?ref=rollup-landing&rev=${revisions.get(tip)?.sha}`, sha: revisions.get(tip)?.sha }),
      ensureActivated: async () => { live = true; return { reconciled: true }; },
      runtimeProbe: async () => {
        assert(live, "Probe must follow activation");
        if (failProbe) { failProbe = false; throw Error("mock post-activation probe failure"); }
        return { deployed: true };
      },
      rollback: async () => ({ normal: "normal.drv", removed: "removed.drv" }),
      v3Witness: async () => {
        if (failV3) { failV3 = false; throw Error("mock V3 failure"); }
        return { pr: 4, sha: "a".repeat(40), resolved: { method: "recomputation" } };
      },
      v6Create: async () => { if (failCreate) { failCreate = false; throw Error("create failed"); } return { sha: "a".repeat(40), accepted: true, logPath: "push.log" }; },
      v6Finish: async () => { if (failCleanup) { failCleanup = false; throw Error("readback failed"); } return { result: { kind: "Fail", evidence: "push.log", reason: "Namespace has no deletion protection" } }; },
      pollLanding: async () => ({ main: "a".repeat(40) }),
      tick,
      resetTasks: async (_cwd, ids) => {
        const path = join(cwd, slices.tasks);
        files.set(path, tools.resetTaskText(get(path), ids));
        return { invalidated: ids };
      },
      writeVerify: async (_cwd, commentary, claims, ledger) => {
        ledgerTools.assertVerifyClaims(claims, ledger);
        files.set(join(cwd, slices.verify), JSON.stringify(commentary) + ledgerTools.renderGateLedger(ledger));
        return { written: true };
      },
      markRejected: async () => { files.set(join(cwd, slices.verify), get(join(cwd, slices.verify)) + "\n- [x] (fail) FAIL"); return { rejected: true }; },
    };
    // Every export is a trampoline; an unmocked external effect fails before any process can run.
    globalThis.__mqMock = { files, get, tools: mocked, assertCompactCheckpoint };
    const toolModule = dataUrl(Object.keys(tools).map((name) => `export const ${name} = (...args) => { const fn = globalThis.__mqMock.tools.${name}; if (!fn) throw Error('Unmocked tool ${name}'); return fn(...args); };`).join("\n"));
    const fsModule = dataUrl("export const mkdir = async () => {}; export const readFile = async (p) => globalThis.__mqMock.get(p); export const writeFile = async (p, v) => globalThis.__mqMock.files.set(p, v);");
    const bumpModule = dataUrl("export const quote = x => x; export const processCheckpoint = async (_root, _name, action) => { const result = { receipt: [], evidence: await action() }; globalThis.__mqMock.assertCompactCheckpoint(result); return result; };");
    let code = ts.transpileModule(main, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    code = code.replace(/from "([^"]+)"/g, (whole, name) => {
      if (name === "@bastani/atomic/workflows") return `from "${dataUrl("export const workflow = x => x;")}"`;
      if (name === "node:fs/promises") return `from "${fsModule}"`;
      if (name === "./bump/tools.js") return `from "${bumpModule}"`;
      if (name === "./gitea-mq/tools.js") return `from "${toolModule}"`;
      if (name.startsWith(".")) return `from "${moduleUrl(resolve(".atomic/workflows", name.replace(/\.js$/, ".ts")))}"`;
      return whole;
    });
    const definition = (await import(dataUrl(code))).default;
    const durable = async (key, args, action) => {
      if (cache.has(key)) {
        const saved = cache.get(key);
        assert.deepEqual(args, saved.args, `Replay identity changed: ${key}`);
        events.push(`replay:${key}`);
        const value = structuredClone(saved.value);
        return key.startsWith("tool:") ? { ...value, cached: true } : value;
      }
      const value = await action();
      cache.set(key, { args: structuredClone(args), value: structuredClone(value) });
      return value;
    };
    const context = {
      cwd,
      inputs: { change: types.change, splice_after: "ssss", deploy: true, max_repair_attempts: 2, build_timeout_minutes: 1 },
      tool: (name, args, action, options) => durable(`tool:${name}`, args, async () => {
        callbacks++; events.push(name);
        assert(options.timeoutMs > 0 && options.failureMode === "return");
        try {
          const value = await action({ signal });
          if (name === "allocate-evidence") root = value;
          return { ok: true, value, attempts: 1, cached: false };
        } catch (error) { return { ok: false, error: { name: "Error", message: String(error) }, attempts: 1, cached: false }; }
      }),
      task: (name, options) => durable(`stage:${name}`, { model: options.model, prompt: options.prompt, reads: options.reads }, async () => {
        stages++; events.push(name);
        types.validateModelPolicy(options);
        assert(!options.tools.includes("edit") && !options.tools.includes("write") && !options.tools.includes("bash"), "Every stage is read-only; only controller applies patches");
        const edits = [];
        const propose = (path, after) => edits.push({ path, before: files.get(join(cwd, path)) ?? null, after });
        if (name === "implement") propose("flake.nix", "input");
        if (name === "patch-app-id") propose(slices.aspect, "app 1234");
        if (name === "hostname" && !noHostnameEdit) { propose(dnsPath, dnsContent); propose(slices.tasks, get(join(cwd, slices.tasks)).replace("[ ] 6.1", "[x] 6.1")); }
        if (name.startsWith("repair-dns")) propose(dnsPath, `${dnsContent}\n# ${name}`);
        if (name === "docs") propose("packages/docs/topology.md", "docs");
        if (repairNix && name.startsWith("repair-")) propose(slices.aspect, name);
        let structured = { summary: "mock implementation", edits };
        if (name.startsWith("review-") || name === "roborev") {
          structured = rejectReview || name === "roborev" && rejectRoborev ? { verdict: "Reject", findings: ["unique reviewer defect"] } : { verdict: "Approve" };
          rejectReview = false;
        }
        if (name.startsWith("diagnose-")) {
          if (rejectS1 && name === "diagnose-s1-b1-a1") {
            const rejection = JSON.parse(get(join(cwd, options.reads[0])));
            assert.deepEqual(rejection.findings, ["unique reviewer defect"]);
            assert.match(rejection.reviewer, /review-s1.*\.md$/); assert.match(rejection.diff, /\.diff$/);
          }
          structured = revisePlan ? { kind: "RevisePlan", designDelta: "unique design delta", tasksDelta: "unique tasks delta", instructions: "unique repair payload" } : { kind: "Repair", instructions: "Re-probe or repair the witnessed failure" };
        }
        if (name.startsWith("repair-") || name.startsWith("replan-")) {
          assert(options.reads.some((path) => /(?:diagnosis-|G3-).*\.json$/.test(path)));
          assert(!options.prompt.includes("unique design delta") && !options.prompt.includes("unique repair payload"));
        }
        if (name === "render-ruleset-diff") {
          const rule = tools.expectedRuleset(1234, 1);
          structured = { before: rule, after: rule, reverse: rule, question: "Approve?" };
        }
        if (name === "write-verify") {
          const ledger = JSON.parse(get(join(cwd, root, "gate-ledger.json")));
          structured = { commentary: { analysis: "Model analysis", caveats: "Model caveats" }, claims: ledgerTools.passedClaims(ledger) };
        }
        const [model, reasoningLevel] = options.model.split(":");
        return { structured, modelAttempts: [{ model, reasoningLevel, success: true }] };
      }),
      ui: Object.fromEntries(["input", "confirm", "select"].map((method) => [method, (question) => durable(`prompt:${promptIndex++}`, question, async () => {
        prompts++; events.push(`${method}:${question}`);
        if (method === "input") return question.startsWith("G3") ? decline === "G3" ? null : "One more bounded batch" : decline === "G1" ? null : JSON.stringify({ slug: "queue", id: 1234 });
        if (method === "select") return declineG2 || decline === "G2" ? "decline" : "approve with User bypass";
        return !decline || !question.startsWith(decline);
      })])),
      exit: (result) => { if (throwExit) throw Object.assign(new Error("Atomic terminal exit"), { exitResult: result }); return result; },
    };
    const run = async () => { try { return await definition.run(context); } catch (error) { if (error.exitResult) return error.exitResult; throw error; } };
    const first = await run();
    if (replay) {
      const counts = { callbacks, stages, prompts };
      promptIndex = 0;
      const second = await run();
      assert.deepEqual(second, first);
      assert.deepEqual({ callbacks, stages, prompts }, counts, "Completed nodes must not repeat any callback, model call or human prompt");
    }
    return { result: first.outputs ?? first, events, files, root, cwd, revisions, committedTasks };
  }

  const success = await execute();
  assert.equal(success.result.status, "completed-with-caveat", success.result.summary);
  assert.equal(success.result.deployed, true);
  assert.deepEqual(success.result.validated, { v2: "pass", v3: "pass", v6: "fail", v9: "pass" });
  const ledger = JSON.parse(success.files.get(join(success.cwd, success.root, "gate-ledger.json")));
  const claims = ledgerTools.passedClaims(ledger);
  for (const task of ["1.2", "1.3", "1.4", "3.2", "3.3", "8.4", "10.1", "11.5", "11.7", "11.8", "11.9"]) {
    const claim = claims.find((item) => item.taskId === task);
    assert(claim, `Unbound task ${task}`);
    assert(success.files.has(join(success.cwd, claim.evidence)), `Missing receipt ${claim.evidence}`);
  }
  assert(!claims.some((item) => ["1.1", "8.2", "4.4"].includes(item.taskId)));
  for (const task of ["2.1", "3.1", "4.1", "4.2", "5.1"]) {
    assert(!claims.some((claim) => claim.taskId === task), `Unobserved S1 task overclaimed: ${task}`);
    assert(ledger.some((row) => row.taskIds.includes(task) && row.status.kind === "Unverified"));
  }
  assert(success.events.indexOf("apply-rulesets") < success.events.indexOf("update-machine-deploy-b1-a1"));
  console.log("PASS mocked graph: success (V6 fail caveat), G1/rollback/docs/V2/V6 receipt binding");
  assert(success.events.indexOf("snapshot-wc-route-dns-source-dns-b1-a1") < success.events.indexOf("pending-route-dns-source-dns-b1-a1"));
  assert(success.events.indexOf("snapshot-wc-after-hostname") < success.events.indexOf("route-dns-source-dns-b1-a1"));
  assert(success.events.indexOf("dns-content-dns-b1-a1") < success.events.indexOf("terraform-plan-dns-b1-a1"));
  console.log("PASS R2: disk edits require durable jj snapshot before pending decisions; routed DNS rev contains reviewed hostname content");
  const noPositiveOutputs = (run) => { for (const output of ["implemented", "deployed", "validated", "verify_md_written"]) assert(!(output in run.result), output); };
  for (const options of [{ dnsReject: true, decline: "G3" }, { decline: "Apply exactly" }, { dnsReject: true }]) {
    const stopped = await execute({ ...options, throwExit: true });
    assert.equal(stopped.result.status, "blocked", stopped.result.summary);
    noPositiveOutputs(stopped);
    const terminal = JSON.parse(stopped.files.get(join(stopped.cwd, stopped.root, "terminal.json")));
    assert.match(terminal.chain_state, /^quarantined\(change-\d+\)$/);
    const id = terminal.chain_state.slice(12, -1);
    assert(stopped.result.summary.includes(`jj abandon '${id}'`));
    const chainLedger = JSON.parse(stopped.files.get(join(stopped.cwd, stopped.root, "ledger.json")));
    assert(chainLedger.some((row) => row.chain_state === terminal.chain_state));
    assert(!stopped.committedTasks.get(id).includes("[x] 6.1") && !stopped.committedTasks.get(id).includes("[x] 6.2"));
    assert.equal(terminal.chain.changes.filter((change) => change.paths.includes("modules/terranix/cloudflare.nix")).length, 1, "Repairs must not append DNS changes");
  }
  const dnsRepair = await execute({ dnsRejectOnce: true });
  assert.equal(dnsRepair.result.status, "completed-with-caveat", dnsRepair.result.summary);
  assert(dnsRepair.events.some((event) => event.startsWith("amend:")), "Repair must amend the same candidate");
  console.log("PASS R4: DNS rejection, decline and exhaustion persist quarantine with unchecked committed tasks and exact recovery; repair amends candidate");
  const lateHostname = await execute({ noHostnameEdit: true });
  assert.equal(lateHostname.result.status, "completed-with-caveat", lateHostname.result.summary);
  assert(lateHostname.events.includes("diagnose-dns-b1-a1") && !lateHostname.events.includes("record-dns-quarantine-dns-b1-a1"));
  assert.equal(JSON.parse(lateHostname.files.get(join(lateHostname.cwd, lateHostname.root, "terminal.json")) ?? "null"), null);
  assert(lateHostname.events.includes("record-dns-quarantine-dns-b1-a2"), "Quarantine must name the actually routed candidate, never a prior change");
  for (const options of [{ rejectRoborev: true }, { exhaust: true, decline: "G3" }, { exhaust: true }]) {
    const stopped = await execute({ ...options, throwExit: true });
    assert.equal(stopped.result.status, options.rejectRoborev ? "needs_rework" : "blocked");
    noPositiveOutputs(stopped);
  }
  console.log("PASS negative exits: roborev rejection, G3 cancellation, DNS decline and exhaustion omit all four positive outputs with throwing ctx.exit");

  const declined = await execute({ declineG2: true });
  assert.equal(declined.result.status, "declined");
  assert(!declined.events.includes("apply-rulesets"));
  assert(!("implemented" in declined.result) && !("deployed" in declined.result));
  for (const decline of ["G1", "G2", "G4", "G5"]) {
    const stopped = await execute({ decline });
    assert.equal(stopped.result.status, "declined", stopped.result.summary);
    for (const output of ["implemented", "deployed", "validated", "verify_md_written"]) assert(!(output in stopped.result));
    assert(!stopped.events.includes("write-verify"));
  }
  console.log("PASS P1/P3: stages propose only; G1/G2/G4/G5 declines terminate without positive outputs");
  const rejected = await execute({ rejectS1: true, revisePlan: true });
  assert.equal(rejected.result.status, "completed-with-caveat", rejected.result.summary);
  assert(rejected.events.includes("record-rejection-s1-b1-a1") && rejected.events.includes("replan-s1-b1-a1"));
  console.log("PASS F6/P12: persisted reviewer rejection reaches diagnosis; replan and repair use artifact reads");
  const recreated = await execute({ createFailure: true });
  assert.equal(recreated.result.status, "completed-with-caveat", recreated.result.summary);
  assert.equal(recreated.events.filter((event) => event.startsWith("confirm:G5")).length, 2);
  assert.equal(recreated.events.filter((event) => /^create-V6-b/.test(event)).length, 2);
  const recleaned = await execute({ cleanupFailure: true });
  assert.equal(recleaned.result.status, "completed-with-caveat", recleaned.result.summary);
  assert.equal(recleaned.events.filter((event) => event.startsWith("confirm:G5")).length, 1);
  assert.equal(recleaned.events.filter((event) => /^create-V6-b/.test(event)).length, 1);
  assert.equal(recleaned.events.filter((event) => /^V6-cleanup-.*-b1-a[12]$/.test(event)).length, 2);
  console.log("PASS F5: every create retry gets fresh G5; cleanup retries never create");
  console.log("PASS mocked graph: G2 decline has no ruleset PUT, activation or positive outputs");

  const exhausted = await execute({ exhaust: true });
  assert.equal(exhausted.result.status, "blocked");
  assert.equal(exhausted.events.filter((event) => /^gate-s1-b[12]-a[12]$/.test(event)).length, 4);
  assert.equal(exhausted.events.filter((event) => event.startsWith("input:G3")).length, 1);
  assert(!exhausted.events.some((event) => event.includes("-b3-") || event === "route-s1"));
  console.log("PASS mocked graph: two-batch G3 exhaustion (four attempts, one extra authorization)");

  const resumed = await execute({ replay: true });
  assert.equal(resumed.result.status, "completed-with-caveat");
  assert(resumed.events.includes("replay:tool:preflight"));
  assert(resumed.events.includes("replay:tool:apply-rulesets"));
  console.log("PASS mocked graph: completed-node replay repeats zero effects, stages or human prompts");

  const noop = await execute({ probeFailure: true });
  assert.equal(noop.result.status, "completed-with-caveat", noop.result.summary);
  assert(noop.events.includes("probe-deploy-b1-a2"));
  assert(!noop.events.some((event) => event.startsWith("route-repair-")));
  const changed = await execute({ v3Failure: true, repairNix: true });
  assert.equal(changed.result.status, "completed-with-caveat", changed.result.summary);
  const order = ["dependent-tasks-V3-b1-a2", "eval-repair-V3-b1-a2", "route-repair-V3-b1-a2", "reactivate-V3-b1-a2", "reprobe-V3-b1-a2", "V3-b1-a2"];
  for (let i = 1; i < order.length; i++) assert(changed.events.indexOf(order[i - 1]) < changed.events.indexOf(order[i]), order.join(" -> "));
  const failedEval = await execute({ v3Failure: true, repairNix: true, repairEvalFailure: true });
  assert.equal(failedEval.result.status, "completed-with-caveat", failedEval.result.summary);
  assert(failedEval.events.includes("diagnose-V3-b1-a2"));
  assert.equal(failedEval.events.filter((event) => event.startsWith("input:G3")).length, 1);
  console.log("PASS mocked repairs: activation-success/probe-failure no-op, Nix invalidation/reactivation before validation, repair-eval failure reaches G3");
  delete globalThis.__mqMock;
}
