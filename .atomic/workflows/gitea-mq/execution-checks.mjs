import assert from "node:assert/strict";
import { resolve, join, relative } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp, writeFile, readdir, rm, mkdir, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { assertRetryableCallbacks } from "./credential-checks.mjs";

const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

/** Execute the authored run function, not a second graph, with all effects in memory. */
export async function runExecutionChecks({ ts, main, moduleUrl, tools, types, slices, ledgerTools, assertCompactCheckpoint }) {
  const { s1Coverage } = await import(moduleUrl(".atomic/workflows/gitea-mq/s1-observations.ts"));
  const report = await import(moduleUrl(".atomic/workflows/gitea-mq/verify-report.ts"));
  async function execute({ changeProposal = false, proposalValidateFailure = false, adoptWorkingCopy = false, g3Recovery = "", blockedDiagnosis = false, declineG2 = false, decline = "", rejectS1 = false, revisePlan = false, createFailure = false, cleanupFailure = false, exhaust = false, replay = false, probeFailure = false, repairNix = false, v3Failure = false, repairEvalFailure = false, dnsReject = false, dnsRejectOnce = false, rejectRoborev = false, throwExit = false, noHostnameEdit = false, proposalFailure = "", extraClaims = false, transientFailure = false, resumeFailure = false, unexpected = "", wrongRules = "", drift = "", structuralFailure = "", nativeFailure = "", nativeMessage = "", tokenDirectory = "", terminalRecordFailure = false, postMintFailure = false, catalog, proposalDrift = "" } = {}) {
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
    let failProposal = !!proposalFailure, failClaims = extraClaims, failTransient = transientFailure, changeValidations = 0;
    let gateExhausted = exhaust || g3Recovery === "gate", proposalExhausted = g3Recovery === "proposal";
    let failRules = !!wrongRules, failDrift = !!drift, failStructure = !!structuralFailure;
    const toolOptions = new Map();
    const nativeError = Object.assign(Error(nativeMessage || "provider structured_output transport failure"), { name: nativeFailure === "abort" ? "AbortError" : "Error" });
    let callbacks = 0, stages = 0, prompts = 0, promptIndex = 0;
    const initialTasks = [...new Set(["1.1", "8.2", ...slices.s1.taskIds, "1.2", "1.3", "1.4", "3.2", "3.3", "6.1", "6.2", "8.1", "8.3", "8.4", "9.1", "10.1", ...Array.from({ length: 9 }, (_, i) => `11.${i + 1}`)])].map((id) => `- [ ] ${id} ${"task details ".repeat(30)}`).join("\n");
    assert(initialTasks.length > 8192);
    assert.throws(() => assertCompactCheckpoint({ evidence: { taskText: initialTasks } }), /8 KB/);
    files.set(join(cwd, slices.tasks), initialTasks);
    if (adoptWorkingCopy) { tree["flake.nix"] = "adopted input"; tree[slices.aspect] = "adopted aspect"; files.set(join(cwd, slices.tasks), initialTasks.replace("[ ] 2.1", "[x] 2.1")); }
    const get = (path) => {
      if (!files.has(path)) throw Object.assign(new Error(`Missing mock file: ${path}`), { code: "ENOENT" });
      return files.get(path);
    };
    const tick = async (_cwd, ids, _signal, baseline) => {
      if (baseline !== undefined) tools.assertHumanBoxes(baseline, get(join(cwd, slices.tasks)));
      const path = join(cwd, slices.tasks);
      files.set(path, get(path).split("\n").map((line) => ids.some((id) => line.startsWith(`- [ ] ${id} `)) ? line.replace("[ ]", "[x]") : line).join("\n"));
      return { completed: ids };
    };
    const snapshot = async () => {
      if (proposalDrift && events.at(-1) === "apply-implement-b1-a1") tree[proposalDrift] = "concurrent change";
      if (failDrift && events.at(-1)?.startsWith("stable-")) { failDrift = drift === "always"; tree[drift === "foreign" ? ".atomic/workflows/stand-up-gitea-mq.ts" : "flake.nix"] += " drift"; }
      return { ...tree, [slices.tasks]: tools.sha256(get(join(cwd, slices.tasks))), ...(files.has(join(cwd, slices.verify)) ? { [slices.verify]: tools.sha256(get(join(cwd, slices.verify))) } : {}) };
    };
    const mocked = {
      allocateEvidence: async () => tokenDirectory ? relative(cwd, tokenDirectory) : "../evidence/run",
      appTokenCleanup: (_cwd, evidence) => {
        const cleanup = tokenDirectory ? tools.appTokenCleanup(_cwd, evidence) : async () => {};
        return () => { events.push("delete-app-tokens"); return cleanup(); };
      },
      processCheckpoint: async (_root, _name, action) => { const result = { receipt: [], evidence: await action() }; assertCompactCheckpoint(result); return result; },
      applyStageEdits: async (_cwd, edits, _slice, _signal, baseline) => {
        tools.assertHumanBoxes(baseline, get(join(cwd, slices.tasks)));
        if (proposalExhausted && events.at(-1).startsWith("apply-implement")) throw Error("awaiting G3 proposal instructions");
        if (failProposal && events.at(-1).startsWith("apply-implement")) { failProposal = proposalFailure === "always"; throw Error("rejected proposal: stale hash or forbidden task"); }
        for (const edit of edits) {
          files.set(join(cwd, edit.path), edit.after);
          tree[edit.path] = edit.after;
          if (repairNix && events.at(-1).startsWith("apply-repair-")) live = false;
          if (events.at(-1).startsWith("apply-repair-verify-structural-input") && edit.path === slices.design) failStructure = structuralFailure === "always";
        }
        return { applied: edits.map((edit) => edit.path) };
      },
      sha256: tools.sha256,
      humanBoxes: tools.humanBoxes,
      proposalBases: tools.proposalBases,
      assertTaskScope: tools.assertTaskScope,
      assertScopedInputs: tools.assertScopedInputs,
      save: async (_cwd, file, value) => {
        if (terminalRecordFailure && file.endsWith("/terminal.json")) throw Error("terminal record failed");
        return files.set(join(cwd, file), JSON.stringify(value));
      },
      snapshot,
      snapshotWorkingCopy: async (_cwd, actualSignal) => { assert.equal(actualSignal, signal); snapshotted = await snapshot(); return { snapshotted: true }; },
      scope: snapshot,
      topology: async (_cwd, chain) => chain.changes.map((change) => change.id),
      preflight: async (_cwd, _splice, _signal, adoption) => {
        assert.equal(!!adoption, adoptWorkingCopy);
        const baseline = { chain: { workingCopy: "wwww", join: "jjjj", seed: "ssss", tip: "ssss", changes: [] }, lock: "baseline", baseline: {}, taskIds: [...tools.taskLedger(initialTasks).keys()], humanBoxes: tools.humanBoxes(initialTasks) };
        if (!adoption) return baseline;
        const file = `${adoption.root}/adopted-s1.json`;
        files.set(join(cwd, file), JSON.stringify({ adopted: true, paths: Object.keys(tree) }));
        return { ...baseline, adoption: { adopted: true, file } };
      },
      adoptS1: async (_cwd, file) => ({ ...JSON.parse(get(join(cwd, file))), file }),
      lockInput: async () => ({ declaration: tree["flake.nix"] ?? "declaration", relocked: true }),
      validateChange: async (_cwd, proposals, actualSignal) => {
        assert.equal(actualSignal, signal);
        changeValidations++;
        if (proposalValidateFailure === true || proposalValidateFailure === "after-first" && changeValidations > 1) throw Error("fresh strict change validation failed");
        return { valid: true, proposals, command: `openspec validate '${types.change}' --strict`, receipt: "fresh-validate.json" };
      },
      s1Gate: async () => {
        if (gateExhausted || failRepairEval && events.at(-1)?.startsWith("eval-repair-")) {
          failRepairEval = false;
          throw Error("mock assertion/eval failed");
        }
        return { drv: "/nix/store/mock.drv", ...s1Coverage(["host-derivation", "four-negative-controls", "build-locks-unchanged", "build-metadata-unchanged", "build-aspects-unchanged", "nixbot-domain"]) };
      },
      diffArtifact: async (_cwd, evidence, name, _signal, paths) => {
        assert.deepEqual(paths, adoptWorkingCopy ? slices.s1.allowedPaths : undefined);
        const file = `${evidence}/${name}.diff`; files.set(join(cwd, file), adoptWorkingCopy ? "adopted input diff" : "proposal diff"); return file;
      },
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
      run: async (_cwd, command) => {
        if (failStructure && command.startsWith("openspec validate")) throw Error("structural input invalid");
        return command.includes("github.appId") ? "1234" : "";
      },
      runStreaming: async () => "",
      generateVars: async () => { if (failTransient) { failTransient = false; throw Error("transient connection failure"); } return { generated: true }; },
      mintAppToken: async (_cwd, evidence, label, appId) => {
        const file = resolve(_cwd, evidence, `${label}-${appId}.token.json`);
        if (tokenDirectory) await writeFile(file, "SECRET-SENTINEL", { mode: 0o600 });
        events.push(`minted:${label}-${appId}`); return { appId, file };
      },
      observeApp: async (_cwd, _root, reply, token) => { if (postMintFailure) throw Error("post-mint transient failure"); assert.equal(token.appId, reply.id); return { id: 1234, slug: "queue" }; },
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
      approveDraft: async (_cwd, evidence, draft) => {
        assert.deepEqual(draft.after, tools.expectedRuleset(1234, 1), "wrong integration_id");
        files.set(join(cwd, evidence, "with-user.json"), "approved");
        files.set(join(cwd, evidence, "admin-only.json"), "approved-admin");
        return { file: `${evidence}/ruleset-diff.json`, withUser: `${evidence}/with-user.json`, adminOnly: `${evidence}/admin-only.json` };
      },
      applyRules: async () => ({ applied: true }),
      identityWitness: async (_cwd, appId, _slug, tokens) => { assert.deepEqual(tokens.map((token) => token.appId), [4743700, appId]); return { identities: ["nixbot", "queue"] }; },
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
      tickOperator: async (_cwd, gate, receipt, baseline, actualSignal) => {
        assert.equal(actualSignal, signal);
        tools.assertHumanBoxes(baseline, get(join(cwd, slices.tasks)));
        assert.equal(JSON.parse(get(join(cwd, receipt))).kind, "operator");
        const taskId = gate === "G1" ? "1.1" : "8.2";
        await tick(_cwd, [taskId]);
        return { taskId, receipt, humanBaseline: tools.humanBoxes(get(join(cwd, slices.tasks))) };
      },
      resetTasks: async (_cwd, ids) => {
        const path = join(cwd, slices.tasks);
        files.set(path, tools.resetTaskText(get(path), ids));
        return { invalidated: ids };
      },
      writeVerify: async (_cwd, commentary, ledger, evidence) => {
        files.set(join(cwd, slices.verify), report.renderVerify(commentary, ledger, { root: evidence, verifiedAt: "2026-09-07T00:00:00.000Z" }));
        return { written: true, claims: ledgerTools.passedClaims(ledger) };
      },
      markRejected: async (_cwd, findings) => { files.set(join(cwd, slices.verify), report.renderRoborevRejection(get(join(cwd, slices.verify)), findings)); return { rejected: true }; },
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
        return key.startsWith("tool:") && value && typeof value === "object" && "ok" in value ? { ...value, cached: true } : value;
      }
      const value = await action();
      cache.set(key, { args: structuredClone(args), value: structuredClone(value) });
      return value;
    };
    const context = {
      cwd,
      models: catalog === undefined ? undefined : { listModels() { return catalog; } },
      inputs: { change: types.change, splice_after: "ssss", deploy: true, max_repair_attempts: 2, build_timeout_minutes: 1, ...(adoptWorkingCopy ? { adopt_working_copy: true } : {}) },
      tool: (name, args, action, options) => durable(`tool:${name}`, args, async () => {
        callbacks++; events.push(name);
        assert(options.timeoutMs > 0 && ["return", "throw"].includes(options.failureMode));
        toolOptions.set(name, options);
        try {
          const value = await action({ signal });
          if (name === "allocate-evidence") root = value;
          return options.failureMode === "throw" ? value : { ok: true, value, attempts: 1, cached: false };
        } catch (error) { if (options.failureMode === "throw") throw error; return { ok: false, error: { name: "Error", message: String(error) }, attempts: 1, cached: false }; }
      }),
      task: (name, options) => durable(`stage:${name}`, { model: options.model, prompt: options.prompt, reads: options.reads }, async () => {
        stages++; events.push(name);
        if (unexpected && name.startsWith("diagnose-dns")) throw unexpected === "abort" ? Object.assign(new Error("Atomic aborted stage"), { name: "AbortError" }) : new TypeError("unexpected controller error");
        assert(!options.reads?.some((path) => path.endsWith("/ledger.json")), "3.5: stages must read compact index, not full ledger");
        types.validateModelPolicy(options);
        assert(!options.tools.includes("edit") && !options.tools.includes("write") && !options.tools.includes("bash"), "Every stage is read-only; only controller applies patches");
        const edits = [];
        const propose = (path, after) => edits.push({ path, baseSha256: files.has(join(cwd, path)) ? tools.sha256(get(join(cwd, path))) : null, after });
        if (name.startsWith("implement")) propose("flake.nix", "input");
        if (changeProposal && name.startsWith("implement")) propose(slices.design, "edited acceptance design");
        if (changeProposal && (name.startsWith("repair-") || name.startsWith("replan-"))) propose(slices.design, `change repair ${name}`);
        if (name.startsWith("patch-app-id")) propose(slices.aspect, "app 1234");
        if (name.startsWith("hostname") && !noHostnameEdit) { propose(dnsPath, dnsContent); propose(slices.tasks, get(join(cwd, slices.tasks)).replace("[ ] 6.1", "[x] 6.1")); }
        if (name.startsWith("repair-dns")) propose(dnsPath, `${dnsContent}\n# ${name}`);
        if (name.startsWith("docs")) propose("packages/docs/topology.md", "docs");
        if (structuralFailure && name.startsWith("repair-verify-structural-input")) propose(slices.design, `Structural report repair ${name}`);
        if (repairNix && name.startsWith("repair-")) propose(slices.aspect, name);
        let structured = { summary: "mock implementation", edits };
        if (name.startsWith("review-") || name === "roborev") {
          if (adoptWorkingCopy && name.startsWith("review-s1")) assert(options.reads.some((path) => files.get(join(cwd, path)) === "adopted input diff"));
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
          if (blockedDiagnosis) structured = { kind: "Blocked", reason: "Operator instructions needed" };
        }
        if (name.startsWith("repair-") || name.startsWith("replan-")) {
          assert(options.reads.some((path) => /(?:diagnosis-|G3-).*\.json$/.test(path)));
          assert(!options.prompt.includes("unique design delta") && !options.prompt.includes("unique repair payload"));
        }
        if (name.startsWith("render-ruleset-diff")) {
          const rule = tools.expectedRuleset(1234, 1);
          structured = { before: rule, after: failRules ? tools.expectedRuleset(9999, 1) : rule, reverse: rule, question: "Approve?" };
          failRules = wrongRules === "always";
        }
        if (name.startsWith("write-verify")) {
          structured = { commentary: { analysis: "Model analysis", caveats: "Model caveats" } };
          if (failClaims) { failClaims = false; structured.claims = [{ taskId: "4.4", evidence: "invented" }]; }
        }
        if (name === "implement-b1-a2" && proposalFailure || name === "write-verify-b1-a2" && extraClaims || name === "render-ruleset-diff-b1-a2" && wrongRules) {
          const path = options.reads.find((path) => path.includes("proposal-rejection-"));
          assert(path, "Retry needs rejection via reads");
          assert(JSON.parse(get(join(cwd, path))).reason);
        }
        // Atomic validates initial structured_output plus up to three corrective turns
        // per candidate; an exhausted stage throws, never caches invalid success.
        const validStructured = structured;
        if (nativeFailure && name.startsWith("implement")) {
          if (["provider", "abort"].includes(nativeFailure)) throw nativeError;
          if (nativeFailure === "always" || name === "implement-b1-a1") structured = null;
        }
        for (let correction = 0; ; correction++) {
          try { types.parse(options.schema, structured); break; }
          catch {
            events.push(`structured-invalid:${name}:${correction}`);
            if (correction === 3) throw Error(nativeMessage || 'Validation failed for tool "structured_output":\nmock contract validation error');
            if (nativeFailure === "corrected") structured = validStructured;
          }
        }
        const [model, reasoningLevel] = options.model.split(":");
        return { structured, modelAttempts: [{ model, reasoningLevel, success: true }] };
      }),
      ui: Object.fromEntries(["input", "confirm", "select"].map((method) => [method, (question) => durable(`prompt:${promptIndex++}`, question, async () => {
        prompts++; events.push(`${method}:${question}`);
        if (question.startsWith("G3") && g3Recovery) { gateExhausted = false; proposalExhausted = false; }
        if (method === "input") return question.startsWith("G3") ? decline === "G3" ? null : "One more bounded batch" : decline === "G1" ? null : JSON.stringify({ slug: "queue", id: 1234 });
        if (method === "select") return declineG2 || decline === "G2" ? "decline" : "approve with User bypass";
        return !decline || !question.startsWith(decline);
      })])),
      exit: (result) => {
        if (tokenDirectory && !result.resumable) assert.deepEqual(readdirSync(tokenDirectory).filter((name) => name.endsWith(".token.json")), [], "Delete before ctx.exit, including throwing Atomic exit");
        if (throwExit) throw Object.assign(new Error("Atomic terminal exit"), { exitResult: result }); return result;
      },
    };
    const run = async () => { try { return await definition.run(context); } catch (error) { if (error.exitResult) return error.exitResult; if (unexpected || ["provider", "abort"].includes(nativeFailure)) return { unexpected: error }; throw error; } };
    const first = await run();
    if (replay) {
      const counts = { callbacks, stages, prompts };
      promptIndex = 0;
      const second = await run();
      assert.deepEqual(second, first);
      assert.deepEqual({ callbacks, stages, prompts }, counts, "Completed nodes must not repeat any callback, model call or human prompt");
    }
    if (resumeFailure) {
      assert.equal(first.status, "failed"); assert.equal(first.resumable, true);
      promptIndex = 0;
      const resumed = await run();
      assert.equal(resumed.status, "completed-with-caveat");
      assert.equal(events.filter((event) => event === "generate-vars").length, 2);
      assert.equal(events.filter((event) => event === "route-s1").length, 1);
    }
    return { result: first.outputs ?? first, exit: first, events, files, root, cwd, revisions, committedTasks, toolOptions, nativeError };
  }
  const missingValidation = await execute({ changeProposal: true, proposalValidateFailure: true });
  assert.equal(missingValidation.result.status, "blocked", "A change-directory proposal without successful fresh validation must fail its gate");
  assert(!missingValidation.events.includes("gate-s1-b1-a1"));
  assert(!missingValidation.events.includes("route-s1"));
  assert(missingValidation.events.includes("diagnose-s1-b1-a1"));
  const freshValidation = await execute({ changeProposal: true, replay: true });
  assert.equal(freshValidation.result.status, "completed-with-caveat");
  assert(freshValidation.events.indexOf("validate-change-s1-b1-a1") > freshValidation.events.indexOf("apply-implement-b1-a1"));
  assert(freshValidation.events.indexOf("validate-change-s1-b1-a1") < freshValidation.events.indexOf("gate-s1-b1-a1"));
  const changeLedger = JSON.parse(freshValidation.files.get(join(freshValidation.cwd, freshValidation.root, "gate-ledger-openspec-s1-b1-a1.json")));
  assert(changeLedger.some((entry) => entry.gate === "s1-openspec" && entry.status.kind === "Passed" && entry.evidence.endsWith("validate-change-s1-b1-a1.json")));
  const validateReceipt = JSON.parse(freshValidation.files.get(join(freshValidation.cwd, freshValidation.root, "validate-change-s1-b1-a1.json"))).value.evidence;
  assert.deepEqual(validateReceipt.proposals, [`${freshValidation.root}/apply-implement-b1-a1.json`]);
  const staleValidation = await execute({ changeProposal: true, proposalValidateFailure: "after-first", rejectS1: true });
  assert.equal(staleValidation.result.status, "blocked");
  assert(staleValidation.events.includes("validate-change-s1-b1-a2"));
  assert(!staleValidation.events.includes("gate-s1-b1-a2"), "Old strict validation cannot authorize a newly edited proposal");
  assert(!staleValidation.events.includes("route-s1"));
  const repairedChange = await execute({ changeProposal: true, rejectS1: true, revisePlan: true, replay: true });
  assert.equal(repairedChange.result.status, "completed-with-caveat");
  const repairValidation = JSON.parse(repairedChange.files.get(join(repairedChange.cwd, repairedChange.root, "validate-change-s1-b1-a2.json"))).value.evidence;
  assert.deepEqual(repairValidation.proposals, [`${repairedChange.root}/apply-replan-s1-b1-a1-b1-a1.json`, `${repairedChange.root}/apply-repair-s1-b1-a2-b1-a1.json`]);
  console.log("PASS change proposal gate: fresh strict validation required before S1; failure blocks routing; receipt/proposal binding and replay retained");
  assert.equal(types.inputs.adopt_working_copy.default, false);
  const adoptedRun = await execute({ adoptWorkingCopy: true, replay: true });
  assert.equal(adoptedRun.result.status, "completed-with-caveat");
  assert(adoptedRun.events.includes("adopt-s1"));
  assert(!adoptedRun.events.some((event) => /^implement-b/.test(event)));
  const adoptionLedger = JSON.parse(adoptedRun.files.get(join(adoptedRun.cwd, adoptedRun.root, "ledger.json")));
  assert.equal(adoptionLedger.find((row) => row.node === "adopt-s1").result.value.evidence.adopted, true);
  assert(adoptedRun.events.indexOf("s1-ledger") > adoptedRun.events.indexOf("review-s1-s1-b1-a1"));
  assert(adoptedRun.events.indexOf("adopt-s1-reset-tasks") < adoptedRun.events.indexOf("gate-s1-b1-a1"));
  assert(adoptedRun.committedTasks.get("change-0").includes("[ ] 2.1"), "Unobserved imported implementation tick must not land as completed");
  const adoptedRepair = await execute({ adoptWorkingCopy: true, rejectS1: true });
  assert(adoptedRepair.events.includes("repair-s1-b1-a2-b1-a1"));
  assert(adoptedRepair.events.includes("route-s1"));
  console.log("PASS adoption graph: no initial implement stage; adopted tool ledger/review diff, gate-only ticks, proposal repair and replay retained");
  for (const [g3Recovery, blockedDiagnosis] of [["proposal", false], ["gate", false], ["gate", true]]) {
    const recovered = await execute({ g3Recovery, blockedDiagnosis, replay: true });
    const nextStage = g3Recovery === "proposal" ? "implement-b2-a1" : "repair-s1-b2-a1-b1-a1";
    const prompt = recovered.events.findIndex((event) => event.startsWith("input:G3"));
    assert(prompt >= 0 && recovered.events.indexOf(nextStage) > prompt, "G3 answer must schedule the next batch's first stage");
    assert.equal(recovered.result.status, "completed-with-caveat");
    assert.equal(recovered.events.filter((event) => event.startsWith("input:G3")).length, 1);
    const authorization = JSON.parse(recovered.files.get(join(recovered.cwd, recovered.root, g3Recovery === "proposal" ? "G3-proposal-implement.json" : "G3-s1.json")));
    assert.equal(authorization.nextAttempt, g3Recovery === "proposal" ? "implement-b2-a1" : "s1-b2-a1");
  }
  console.log("PASS G3 continuation graph: answered proposal/exhausted gate/Blocked diagnosis runs batch-2 first stage successfully; replay consumes no second prompt");
  for (const path of [".atomic/workflows/stand-up-gitea-mq.ts", "modules/terranix/cloudflare.nix", "flake.nix"]) {
    const run = await execute({ proposalDrift: path });
    const evidence = JSON.parse(run.files.get(join(run.cwd, run.root, "apply-implement-b1-a1.json")));
    if (path === "flake.nix") {
      assert.equal(evidence.ok, false);
      assert(run.events.includes("implement-b1-a2"), "Scoped drift rejects the initial proposal");
    } else {
      assert.equal(evidence.ok, true);
      assert.deepEqual(evidence.value.evidence.foreignDrift, [path]);
      assert(!ledgerTools.repairPaths(evidence.value.evidence.effect).includes(path));
      assert(!run.events.includes("implement-b1-a2"), "Foreign drift does not retry proposal application");
    }
  }
  console.log("PASS apply graph: scoped drift rejects/retries; foreign and other-slice drift is recorded without blocking or contaminating repair effects");
  const stableForeign = await execute({ drift: "foreign" });
  const stableEvidence = JSON.parse(stableForeign.files.get(join(stableForeign.cwd, stableForeign.root, "stable-s1-b1-a1.json")));
  assert.equal(stableEvidence.ok, true);
  assert.deepEqual(stableEvidence.value.evidence.foreignDrift, [".atomic/workflows/stand-up-gitea-mq.ts"]);
  assert(!stableForeign.events.includes("diagnose-s1-b1-a1"));
  assert.equal(stableForeign.result.status, "completed-with-caveat");
  console.log("PASS stability graph: foreign edit after review passes and is recorded; scoped drift remains covered by F3 repair/retry checks");

  async function findingChecks(finding) {
    if (finding === "F2") {
      const fixed = await execute({ wrongRules: "once" });
      assert.equal(fixed.result.status, "completed-with-caveat", fixed.result.summary);
      assert(fixed.events.includes("render-ruleset-diff-b1-a2"), "F2: semantic rejection must re-render");
      assert.equal(fixed.toolOptions.get("validate-render-ruleset-diff-b1-a1").failureMode, "return");
      const exhausted = await execute({ wrongRules: "always" });
      assert.equal(exhausted.result.status, "blocked");
      assert.equal(exhausted.events.filter((e) => /^render-ruleset-diff-b[12]-a[12]$/.test(e)).length, 4);
      assert.equal(exhausted.events.filter((e) => e.startsWith("input:G3")).length, 1);
      assert(!exhausted.events.some((e) => e.startsWith("select:G2") || e === "apply-rulesets"));
      console.log("PASS F2: schema-valid wrong integration_id re-renders with feedback; four rejected proposals reach one G3 and never G2");
    }
    if (finding === "F3") for (const [option, gate, repair, next] of [
      ["drift", "stable-s1-b1-a1", "diagnose-s1-b1-a1", "review-s1-s1-b1-a2"],
      ["structuralFailure", "verify-structural-input-b1-a1", "diagnose-verify-structural-input-b1-a1", "verify-structural-input-b1-a2"],
    ]) {
      const fixed = await execute({ [option]: "once" });
      assert.equal(fixed.result.status, "completed-with-caveat", fixed.result.summary);
      assert.equal(fixed.toolOptions.get(gate).failureMode, "return");
      assert(fixed.events.indexOf(repair) > fixed.events.indexOf(gate));
      assert(fixed.events.indexOf(next) > fixed.events.indexOf(repair));
      assert(fixed.events.some((e) => e.startsWith(`repair-${repair.slice(9).replace(/a1$/, "a2")}`)), "Diagnosis must invoke bounded repair");
      const exhausted = await execute({ [option]: "always" });
      assert.equal(exhausted.result.status, "blocked");
      assert.equal(exhausted.events.filter((e) => e.startsWith("input:G3")).length, 1);
      assert(!exhausted.events.includes("write-verify-observation"));
      console.log(`PASS F3: ${option} returns gate failure, diagnoses/repairs and rechecks; repeated failures exhaust bounded batches`);
    }
    if (finding === "F4") {
      const corrected = await execute({ nativeFailure: "corrected" });
      assert.equal(corrected.result.status, "completed-with-caveat");
      assert(!corrected.events.includes("implement-b1-a2"), "Native correction success must not consume a second proposal attempt");
      assert.equal(corrected.events.filter((e) => e.startsWith("structured-invalid:")).length, 1);
      const fixed = await execute({ nativeFailure: "once" });
      assert.equal(fixed.result.status, "completed-with-caveat", fixed.result.summary);
      assert.equal(fixed.events.filter((e) => e.startsWith("structured-invalid:implement-b1-a1:")).length, 4);
      assert(fixed.events.includes("implement-b1-a2") && !fixed.events.includes("apply-implement-b1-a1"));
      const exhausted = await execute({ nativeFailure: "always" });
      assert.equal(exhausted.result.status, "blocked");
      assert.equal(exhausted.events.filter((e) => e.startsWith("structured-invalid:")).length, 16);
      assert.equal(exhausted.events.filter((e) => e.startsWith("input:G3")).length, 1);
      for (const detail of ["The model produced assistant text but never called structured_output", "The model produced an assistant message with empty text", "The model produced no assistant message after the prompt"]) {
        const nativeMessage = `atomic-workflows: stage configured with schema must finish by calling structured_output. ${detail}`;
        const missing = await execute({ nativeFailure: "always", nativeMessage });
        assert.equal(missing.result.status, "blocked", detail);
        assert.equal(missing.events.filter((e) => e.startsWith("structured-invalid:")).length, 16, detail);
        assert.equal(missing.events.filter((e) => e.startsWith("input:G3")).length, 1, detail);
        assert(!missing.events.some((e) => e.startsWith("apply-implement")), detail);
        for (const nativeFailure of ["provider", "abort"]) {
          const fault = await execute({ nativeFailure, nativeMessage: nativeFailure === "abort" ? nativeMessage : `${nativeMessage} (provider transport failure)` });
          assert.equal(fault.exit.unexpected, fault.nativeError, "Unrecognized/provider/abort error identity must survive ctx.task");
          assert(!fault.events.some((e) => e.startsWith("input:G3")));
        }
      }
      for (const nativeFailure of ["provider", "abort"]) {
        const fault = await execute({ nativeFailure });
        assert(fault.exit.unexpected, "Provider/abort faults must propagate unchanged");
        assert.equal(fault.exit.unexpected.name, nativeFailure === "abort" ? "AbortError" : "Error");
        assert(!fault.events.includes("implement-b1-a2") && !fault.events.some((e) => e.startsWith("input:G3")));
      }
      console.log("PASS F4: native initial+three correction rejection consumes one proposal attempt; exhaustion reaches G3; provider/abort faults escape");
      console.log("PASS F4 native missing-output: all three exact combined diagnostics exhaust throwing ctx.task through four proposals/one G3; provider/abort identity preserved");
    }
  }
  async function tokenLifecycleChecks() {
    for (const options of [{}, { replay: true }, { decline: "G2", throwExit: true }, { wrongRules: "always", throwExit: true }, { rejectRoborev: true }, { unexpected: "abort", dnsReject: true }, { terminalRecordFailure: true, decline: "G2" }, { postMintFailure: true }]) {
      const tokenDirectory = await mkdtemp(join(tmpdir(), "gitea-mq-lifecycle-"));
      try {
        await writeFile(join(tokenDirectory, "receipt.json"), "keep");
        let result;
        try { result = await execute({ ...options, tokenDirectory }); }
        catch (error) { if (!options.terminalRecordFailure) throw error; assert(error instanceof AggregateError); assert(error.errors.some((cause) => /terminal record failed/.test(String(cause)))); }
        const artifacts = (await readdir(tokenDirectory)).filter((name) => name.endsWith(".token.json"));
        if (options.postMintFailure) {
          assert.equal(result.exit.resumable, true); assert.deepEqual(artifacts, ["G1-1234.token.json"]);
          assert(!result.events.includes("delete-app-tokens"));
        } else {
          assert.deepEqual(artifacts, [], `Plaintext tokens remain on ${JSON.stringify(options)}`);
          if (result) assert(result.events.some((event) => event.startsWith("minted:")), "Exercise minted artifacts, not vacuous no-token exits");
        }
        if (!Object.keys(options).length) {
          assert.equal(result.result.status, "completed-with-caveat");
          assert.equal(result.events.filter((event) => event.startsWith("minted:")).length, 3);
        }
        assert((await readdir(tokenDirectory)).includes("receipt.json"));
      } finally { await rm(tokenDirectory, { recursive: true, force: true }); }
    }
    const tokenDirectory = await mkdtemp(join(tmpdir(), "gitea-mq-deletion-error-"));
    try {
      await mkdir(join(tokenDirectory, "bad.token.json"));
      await assert.rejects(() => execute({ tokenDirectory }), /App token deletion failed/);
      assert.deepEqual(await readdir(tokenDirectory), ["bad.token.json"], "Every deletable artifact must be removed even when another deletion fails");
    } finally { await rm(tokenDirectory, { recursive: true, force: true }); }
    const local = await mkdtemp(join(tmpdir(), "gitea-mq-finalizer-"));
    try {
      await writeFile(join(local, "keep.json"), "do not follow");
      await symlink(join(local, "keep.json"), join(local, "leaf.token.json"));
      await writeFile(join(local, "incomplete.token.json"), "{}");
      const cleanup = tools.appTokenCleanup(local, "."), first = cleanup();
      assert.equal(cleanup(), first, "Repeated finalization must share the same promise"); await first;
      assert.deepEqual(await readdir(local), ["keep.json"]);
      assert.equal(await readFile(join(local, "keep.json"), "utf8"), "do not follow");
      await tools.appTokenCleanup(local, ".")(); // Fresh-run idempotence after deletion.
      await mkdir(join(local, "bad.token.json"));
      const failing = tools.appTokenCleanup(local, "."), failure = failing();
      assert.equal(failing(), failure); await assert.rejects(failure, /App token deletion failed/);
      await rm(join(local, "bad.token.json"), { recursive: true });
      await writeFile(join(local, "not-retried.token.json"), "{}");
      assert.equal(failing(), failure); await assert.rejects(failing(), /App token deletion failed/);
      assert((await readdir(local)).includes("not-retried.token.json"), "A rejected cleanup must not start a second deletion pass");
      await assert.rejects(tools.appTokenCleanup(local, "keep.json")(), /App token deletion failed: cannot enumerate/);
    } finally { await rm(local, { recursive: true, force: true }); }
    console.log("PASS R1 finalizer: incomplete sentinels and leaf symlinks removed without following targets; idempotence, shared success/rejection promise, no retry after deletion error, enumeration errors loud");
    console.log("PASS R1 token lifecycle: real files absent after completion/replay, declined/blocked/needs_rework, abort and terminal-record failure; only explicit resumable failure retains; deletion errors fail loudly after attempting all artifacts");
  }
  const onlyFinding = process.argv.find((arg) => /^--F[234]-only$/.test(arg));
  if (onlyFinding) { await findingChecks(onlyFinding.slice(2, 4)); return; }
  if (process.argv.includes("--tokens-only")) { await tokenLifecycleChecks(); return; }
  await tokenLifecycleChecks();
  for (const finding of ["F2", "F3", "F4"]) await findingChecks(finding);

  const astra = { provider: "openai-codex", id: "gpt-6-astra", fullId: types.MODEL };
  for (const catalog of [[astra], [{ ...astra, availableThinkingLevels: [] }], [{ ...astra, fullId: "openai-codex/other" }]]) {
    const run = await execute({ catalog });
    assert.deepEqual(JSON.parse(run.files.get(join(run.cwd, run.root, "model-catalog.json"))), catalog);
    if (catalog[0].fullId === types.MODEL) assert.equal(run.result.status, "completed-with-caveat", run.result.summary);
    else {
      assert.equal(run.result.status, "blocked");
      assert.match(run.result.summary, /Astra absent from configured catalog/);
      assert(!run.events.includes("route-s1"));
    }
  }
  console.log("PASS preflight catalog evidence: real and legacy shapes pass; missing Astra records then blocks");
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
  assert(success.events.indexOf("snapshot-wc-after-hostname-b1-a1") < success.events.indexOf("route-dns-source-dns-b1-a1"));
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
  assert(rejected.events.includes("record-rejection-s1-b1-a1") && rejected.events.includes("replan-s1-b1-a1-b1-a1"));
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
  for (const [gate, id] of [["G1", "1.1"], ["G2", "8.2"]]) {
    assert.match(success.files.get(join(success.cwd, slices.tasks)), new RegExp(`- \\[x\\] ${id}`));
    assert(ledger.some((row) => row.gate === gate && row.taskIds.includes(id) && row.status.kind === "Operator"));
    assert(success.events.some((event) => event.includes(`${gate} —`) && /do not edit tasks\.md.*until the run terminates/i.test(event)));
  }
  console.log("PASS 2.5 graph: G1/G2 Operator receipts own controller ticks; refreshed baselines allow all subsequent stages");
  const proposalRetry = await execute({ proposalFailure: "once" });
  assert.equal(proposalRetry.result.status, "completed-with-caveat");
  assert(proposalRetry.events.includes("implement-b1-a2"));
  assert.equal(proposalRetry.events.filter((event) => event === "route-s1").length, 1);
  const proposalExhaustion = await execute({ proposalFailure: "always" });
  assert.equal(proposalExhaustion.result.status, "blocked");
  assert.equal(proposalExhaustion.events.filter((event) => /^implement-b[12]-a[12]$/.test(event)).length, 4);
  assert.equal(proposalExhaustion.events.filter((event) => event.startsWith("input:G3")).length, 1);
  assert(!proposalExhaustion.events.includes("route-s1"));
  console.log("PASS 3.1 graph: rejected apply re-invokes stage with fresh id/rejection reads; two bounded batches, one G3, no premature route");
  const claimRetry = await execute({ extraClaims: true });
  assert.equal(claimRetry.result.status, "completed-with-caveat");
  assert(claimRetry.events.includes("write-verify-b1-a2"));
  assert.equal(claimRetry.events.filter((event) => event === "write-verify-observation").length, 1);
  console.log("PASS 3.2 graph: commentary-only draft succeeds; extra invented claims retry inside bounded proposal loop");
  const interrupted = await execute({ transientFailure: true, resumeFailure: true });
  assert.equal(interrupted.exit.status, "failed"); assert.equal(interrupted.exit.resumable, true);
  assert.deepEqual([success.toolOptions.get("read-rulesets").retriesAllowed, success.toolOptions.get("read-rulesets").maxAttempts], [true, 3]);
  for (const name of ["G1-witnesses", "write-capable-identities", "G1-mint-token", "identity-mint-token-4743700", "identity-mint-token-1234"]) {
    assert.equal(success.toolOptions.get(name).retriesAllowed, undefined, `F1: ${name} must not retry`);
    assert.equal(success.toolOptions.get(name).failureMode, "throw");
  }
  for (const [name, options] of success.toolOptions) if (options.retriesAllowed) assert.equal(name, "read-rulesets", `Retry on effect: ${name}`);
  const toolSource = readFileSync(".atomic/workflows/gitea-mq/tools.ts", "utf8");
  assertRetryableCallbacks(ts, main, toolSource, success.toolOptions);
  // A helper's embedded Python is inspected, even if the outer callback looks like a probe.
  const retry = new Map([["nested", { retriesAllowed: true }]]);
  for (const command of ["gh api --method POST /tokens", "gh api --method PUT /rules", "gh api --method DELETE /ref", "jj log", "git push", "clan vars get", "terraform plan", "ssh host systemctl status queue"]) {
    const nested = `const script = ${JSON.stringify(command)}; export const wrapper = () => run(script);`;
    assert.throws(() => assertRetryableCallbacks(ts, 'tool("nested", () => t.wrapper())', nested, retry), /Retryable callback contains effect/);
  }
  assert.throws(() => assertRetryableCallbacks(ts, 'tool("nested", () => t.mintAppToken())', toolSource, retry), /Retryable callback contains effect/);
  console.log("PASS F1 graph: App witnesses and isolated mint nodes never retry; transitive nested-command scan rejects retryable effects");
  for (const decline of ["G1", "G2", "G4", "G5"]) assert.equal((await execute({ decline })).exit.status, "cancelled");
  console.log("PASS 3.3: transient fatal tool exits failed/resumable and re-executes on resume; completed effects replay; only read probes retry; declines cancel");
  const index = JSON.parse(success.files.get(join(success.cwd, success.root, "ledger-index.json")));
  assert(index.length > 20);
  for (const row of index) { assert.deepEqual(Object.keys(row).sort(), ["evidence", "node", "ok"]); assert(success.files.has(join(success.cwd, row.evidence))); }
  assert(success.files.has(join(success.cwd, success.root, "ledger.json")));
  console.log("PASS 3.5: persisted stage index contains only node/ok/evidence; full payload ledger remains on disk, never in stage reads");
  for (const unexpected of ["type", "abort"]) {
    const crashed = await execute({ unexpected, dnsReject: true });
    assert(crashed.exit.unexpected);
    const terminal = JSON.parse(crashed.files.get(join(crashed.cwd, crashed.root, "terminal.json")));
    assert.match(terminal.chain_state, /^quarantined\(/); assert.match(terminal.recovery, /jj abandon/);
    assert.match(terminal.summary, unexpected === "type" ? /TypeError/ : /AbortError/);
  }
  console.log("PASS 3.6: unexpected TypeError and Atomic-style abort persist terminal plus quarantined DNS recovery before rethrow");
  delete globalThis.__mqMock;
}
