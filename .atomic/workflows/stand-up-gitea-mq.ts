import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { workflow, type WorkflowSerializableValue, type WorkflowTaskOptions } from "@bastani/atomic/workflows";
import { Blocked, witness, unreachable, type Witness } from "./bump/types.js";
import { inputs, outputs, HIGH, MEDIUM, MAX, READ_ONLY, StageOutput, VerifyDraft, Diagnosis, Review, RulesetDraft, AppReply, parse, assertCatalog, catalogPort, validateModelPolicy, validateModelAttempts, nextBatch, completedRun, attemptsFor, normalizeToolOutcome, type Batch, type Validation } from "./gitea-mq/types.js";
import { Validation as ValidationSchema } from "./gitea-mq/types.js";
import { tasks, design, verify, reads, s1, postG1, s2, s4, docs, report, negativeControls, type Slice } from "./gitea-mq/slices.js";
import * as t from "./gitea-mq/tools.js";
import * as p from "./gitea-mq/prompts.js";
import { repairEffect, repairPaths, dnsChainLabel, dnsCandidateId, dnsRecovery, type DnsChainState, type RepairEffect, type GateEntry, type GateStatus } from "./gitea-mq/ledger.js";
import type { LinearState } from "./gitea-mq/types.js";
import { GateFailure, Stop, ProposalRejected, proposalValue, proposalLoop, rejectStructuredContract } from "./gitea-mq/control.js";
export default workflow({
  name: "stand-up-gitea-mq", description: "G1–G5 guarded gitea-mq implementation, pinned deployment, live validation and evidence-driven replanning.",
  autoAttach: true, inputs, outputs,
  run: async (ctx) => {
    const cwd = ctx.cwd ?? process.cwd(), input = ctx.inputs, timeout = input.build_timeout_minutes * 60_000;
    const root = await ctx.tool("allocate-evidence", { ...input }, async ({ signal }) => {
      signal.throwIfAborted();
      return t.allocateEvidence(cwd);
    }, { failureMode: "throw", timeoutMs: 120_000 }).catch((error: unknown) => ctx.exit({ status: "failed", resumable: true, reason: `Evidence allocation failed: ${String(error)}` }));
    const ledger: unknown[] = [], linearTransitions: LinearState[] = [], cleanupTokens = t.appTokenCleanup(cwd, root);
    let retainTokens = false;
    const index: { node: string; ok: boolean; evidence: string }[] = [];
    let lockedDeclaration: string | null = null;
    let humanBaseline = "";
    let dnsState: DnsChainState = { kind: "Absent" };
    const gateLedger: GateEntry[] = [];
    const passed = (gate: string, taskIds: string[], evidence: string, status: GateStatus = { kind: "Passed" }) => gateLedger.push({ gate, taskIds, evidence, status });
    const recordS1 = (gate: Awaited<ReturnType<typeof t.s1Gate>>, evidence: string) => { for (const row of gate.observations) passed("s1", [row.taskId], evidence, row.missing.length ? { kind: "Unverified", reason: row.missing.join(", ") } : { kind: "Passed" }); };
    let chain: t.Chain | null = null, tracked: Witness<string[]> | null = null, deployed: Witness<boolean> | null = null, written: Witness<boolean> | null = null;
    let validation: Validation = { v2: { kind: "NotRun", reason: "Not reached" }, v3: { kind: "NotRun", reason: "Not reached" }, v6: { kind: "NotRun", reason: "Not reached" }, v9: { kind: "NotRun", reason: "Not reached" } };
    const persist = async (name: string, data: unknown) => {
      await ctx.tool(`record-${name}`, { root, hash: t.sha256(JSON.stringify(data)) }, async ({ signal }) => {
        signal.throwIfAborted(); await t.save(cwd, `${root}/${name}.json`, data); await t.save(cwd, `${root}/ledger.json`, ledger); await t.save(cwd, `${root}/ledger-index.json`, index); return { file: `${root}/${name}.json` };
      }, { failureMode: "throw", timeoutMs: 120_000 }).catch((error: unknown) => { throw new Blocked(`Could not persist ${name}: ${String(error)}`); });
    };
    const recordDns = async (name: string, state: DnsChainState) => { dnsState = state; const entry = { chain_state: dnsChainLabel(state), recovery: dnsRecovery(state) }; ledger.push(entry); await persist(name, entry); };
    const observe = async <T extends WorkflowSerializableValue>(name: string, action: (signal: AbortSignal) => Promise<T>, timeoutMs = 120_000, readOnly = false, fatal = false) => {
      const args = { root, inputs: { ...input }, tip: chain?.tip ?? null }, retry = readOnly ? { retriesAllowed: true, maxAttempts: 3 } : {};
      const result = fatal
        ? { ok: true as const, cached: false, value: await ctx.tool(name, args, async ({ signal }) => t.processCheckpoint(root, name, () => action(signal)), { failureMode: "throw", timeoutMs, ...retry }).catch((error: unknown) => { throw new Blocked(`${name}: ${String(error)}`); }) }
        : await ctx.tool(name, args, async ({ signal }) => t.processCheckpoint(root, name, () => action(signal)), { failureMode: "return", timeoutMs, ...retry });
      const stable = normalizeToolOutcome(result); ledger.push({ node: name, kind: "tool", result: stable }); index.push({ node: name, ok: result.ok, evidence: `${root}/${name}.json` }); await persist(name, stable); return result;
    };
    const tool = async <T extends WorkflowSerializableValue>(name: string, action: (signal: AbortSignal) => Promise<T>, timeoutMs = 120_000, gate = false, readOnly = false) => {
      const result = await observe(name, action, timeoutMs, readOnly, !gate);
      if (!result.ok) {
        if (gate) throw new GateFailure(name, `${root}/${name}.json`, JSON.stringify(result.error));
        throw new Blocked(`${name}: ${JSON.stringify(result.error)}`);
      }
      return { value: result.value.evidence, outcome: result, evidence: `${root}/${name}.json` };
    };
    const stage = async (name: string, options: WorkflowTaskOptions) => {
      validateModelPolicy(options);
      const result = await ctx.task(name, { ...options, reads: [...new Set([...(options.reads || []), `${root}/ledger-index.json`])], context: "fresh", output: `${root}/${name}.md`, outputMode: "file-only", mcp: { allow: [] } }).catch(rejectStructuredContract);
      const actual = result.modelAttempts?.filter((attempt) => attempt.success).at(-1);
      ledger.push({ node: name, kind: "stage", model: actual?.model ?? result.model ?? null, thinking: actual?.reasoningLevel ?? null, attempts: result.modelAttempts ?? [] });
      index.push({ node: name, ok: !!actual, evidence: `${root}/metadata-${name}.json` });
      await persist(`metadata-${name}`, ledger.at(-1));
      if (!actual?.model || !actual.reasoningLevel) throw new Blocked(`${name}: actual model/thinking metadata unavailable`);
      validateModelAttempts(options.model, result.modelAttempts); return result;
    };
    const propose = <T>(name: string, execute: (id: string, feedback: string[]) => Promise<T>) => proposalLoop(name, input.max_repair_attempts, root, execute, persist, (question) => ctx.ui.input(question));
    const implement = (name: string, slice: Slice, instructions = "", replan = false, medium = false, artifacts: string[] = []) => propose(name, async (id, feedback) => {
      const before = await tool(`snapshot-${id}`, (signal) => t.snapshot(cwd, signal));
      await persist(`bases-${id}`, t.proposalBases(before.value, slice));
      const result = await stage(id, { ...(medium ? MEDIUM : HIGH), ...READ_ONLY, reads: [...reads, `${root}/contracts.json`, `${root}/ledger-index.json`, `${root}/bases-${id}.json`, ...artifacts, ...feedback], schema: StageOutput, prompt: replan ? p.replanPrompt(cwd, root, artifacts[0]!) : p.implementPrompt(cwd, root, slice, instructions) });
      const patch = proposalValue(StageOutput, result.structured);
      const scoped = await observe(`apply-${id}`, async (signal) => {
        const current = await t.snapshot(cwd, signal), { foreignDrift } = t.assertScopedInputs(before.value, current, slice); await t.topology(cwd, chain!, signal);
        await t.applyStageEdits(cwd, patch.edits, slice, signal, humanBaseline, replan); const tree = await t.snapshot(cwd, signal); return { tree, foreignDrift, effect: repairEffect(current, tree) };
      });
      if (!scoped.ok) throw new ProposalRejected(`apply-${id}: ${JSON.stringify(scoped.error)}; ${root}/apply-${id}.json`);
      await tool(`snapshot-wc-after-${id}`, (signal) => t.snapshotWorkingCopy(cwd, signal));
      return scoped.value.evidence.effect;
    });
    const land = async (name: string, slice: Slice, allowNoop = false, into: string | null = null): Promise<string | null> => {
      await tool(`snapshot-wc-${name}`, (signal) => t.snapshotWorkingCopy(cwd, signal));
      if (allowNoop && !(await tool(`pending-${name}`, (signal) => t.pendingPaths(cwd, slice, signal))).value.length) return null;
      const tree = (await tool(`reviewed-${name}`, (signal) => t.snapshot(cwd, signal))).value;
      const landed = await tool(name, (signal) => t.route(cwd, chain!, slice, tree, signal, into));
      chain = landed.value;
      tracked = witness(name, landed.outcome, (value) => ({ value: value.evidence.changes.map((c) => c.id), evidence: landed.evidence })); return chain.tip;
    };
    const transition = async (name: string, state: LinearState, body: string) => {
      const update = await observe(`${name}-update`, async (signal) => ({ result: await t.run(cwd, t.linearUpdate(state), signal) }));
      const readback = await observe(`${name}-readback`, (signal) => t.linearReadback(cwd, state, signal));
      const comment = await observe(`${name}-comment`, async (signal) => { const file = `${root}/${name}-comment.md`; await writeFile(join(cwd, file), body); return { result: await t.run(cwd, t.linearComment(join(cwd, file)), signal) }; });
      if (update.ok && readback.ok) linearTransitions.push(state);
      await tool(`${name}-proposal`, (signal) => t.syncProposal(cwd, state, t.linearOutcome(update.ok, readback.ok, comment.ok), signal));
    };
    const bounded = async <T>(name: string, slice: Slice, execute: (id: string) => Promise<T>, prepareRepair?: (id: string, effect: RepairEffect) => Promise<void>): Promise<T> => {
      let instructions = "", failure: GateFailure | null = null, pendingPaths: string[] = [], diagnosisArtifact: string[] = [];
      const runBatch = async (batch: Batch): Promise<T> => {
        attempts: for (const attempt of attemptsFor(input.max_repair_attempts)) {
          const id = `${name}-b${batch}-a${attempt}`;
          try {
            if (instructions) {
              pendingPaths.push(...repairPaths(await implement(`repair-${id}`, slice, instructions, false, false, diagnosisArtifact)));
            }
            if (slice.allowedPaths.includes("flake.nix")) {
              const lock = await tool(`relock-${id}`, (signal) => t.lockInput(cwd, lockedDeclaration, humanBaseline, signal), timeout, true);
              lockedDeclaration = lock.value.declaration;
            }
            if (instructions && prepareRepair) {
              const effect: RepairEffect = pendingPaths.length ? { kind: "Changed", paths: [...new Set(pendingPaths)] } : { kind: "Noop" };
              await persist(`repair-effect-${id}`, { kind: "Repair", effect });
              await prepareRepair(id, effect);
              pendingPaths = [];
            }
            const result = await execute(id);
            return result;
          } catch (error) {
            if (!(error instanceof GateFailure)) throw error;
            failure = error;
          }
          const invalidTasks = slice.name === "s4" ? [] : slice.taskIds;
          await tool(`invalidate-tasks-${id}`, (signal) => t.resetTasks(cwd, invalidTasks, signal, humanBaseline));
          for (const entry of gateLedger) if (entry.gate === name || entry.taskIds.some((task) => invalidTasks.includes(task))) entry.status = { kind: "Invalidated", reason: failure.receipt };
          passed(failure.gate, invalidTasks, failure.receipt, { kind: "Invalidated", reason: "Gate failed" });
          await persist(`gate-ledger-${id}`, gateLedger);
          const diagnosis = parse(Diagnosis, (await stage(`diagnose-${id}`, { ...HIGH, ...READ_ONLY, reads: [failure.receipt, design, tasks], schema: Diagnosis, prompt: p.diagnosePrompt(cwd, root, failure.gate, failure.receipt) })).structured);
          await persist(`diagnosis-${id}`, { batch, attempt, diagnosis, evidence: failure.receipt }); diagnosisArtifact = [`${root}/diagnosis-${id}.json`];
          switch (diagnosis.kind) {
            case "Repair": instructions = "Apply the diagnosis supplied via reads."; break;
            case "RevisePlan":
              pendingPaths.push(...repairPaths(await implement(`replan-${id}`, { ...slice, allowedPaths: [design, tasks] }, "", true, false, diagnosisArtifact)));
              instructions = "Apply the diagnosis supplied via reads."; break;
            case "Blocked": instructions = diagnosis.reason; break attempts;
            default: unreachable(diagnosis);
          }
        }
        const next = nextBatch(batch); if (next === null) throw new Stop("blocked", `${name} exhausted both bounded batches; ${failure?.receipt}; reconcile effects before a fresh run`);
        const answer = await ctx.ui.input(`G3 — ${name}: ${failure?.receipt}. Diagnosis: ${instructions}. Read the diagnosis artifact in ${root}. Supply repair instructions to authorize exactly one extra batch of ${input.max_repair_attempts} attempts, or cancel to block.`);
        if (!answer?.trim()) throw new Stop("blocked", `G3 declined: ${failure?.receipt}`);
        instructions = answer; await persist(`G3-${name}`, { batch: next, nextAttempt: `${name}-b${next}-a1`, instructions, evidence: failure?.receipt }); diagnosisArtifact = [`${root}/G3-${name}.json`]; instructions = "Apply the G3 instructions supplied via reads.";
        return runBatch(next); // A consumed authorization must enter the next batch, not fall through.
      };
      return runBatch(1);
    };
    try {
      const initial = await tool("preflight", async (signal) => {
        const models = catalogPort(ctx);
        const catalog = models ? await models.listModels() : null;
        await t.save(cwd, `${root}/model-catalog.json`, catalog ?? { note: "Model catalog port unavailable; native resolution and post-call model/thinking rejection apply. Implicit host fallback risk accepted by operator." });
        if (catalog !== null) assertCatalog(catalog);
        return t.preflight(cwd, input.splice_after, signal, input.adopt_working_copy ? { root } : null);
      }, timeout);
      chain = initial.value.chain;
      humanBaseline = initial.value.humanBoxes;
      passed("preflight-task-baseline", initial.value.taskIds, initial.evidence, { kind: "Unverified", reason: "No tool observation yet" });
      await persist("contracts", { s1, postG1, s2, s4, docs, report, negativeControls });
      const adoption = "adoption" in initial.value ? initial.value.adoption : null;
      if (adoption) { await tool("adopt-s1", (signal) => t.adoptS1(cwd, adoption.file, humanBaseline, signal)); await tool("adopt-s1-reset-tasks", (signal) => t.resetTasks(cwd, s1.taskIds, signal, humanBaseline)); } else await implement("implement", s1);
      // Locking and relocking are distinct controller nodes inside the bounded gate.
      const s1Result = await bounded("s1", s1, async (id) => {
        const gate = await tool(`gate-${id}`, (signal) => t.s1Gate(cwd, initial.value.lock, initial.value.baseline, signal), timeout, true);
        const diff = await tool(`diff-${id}`, (signal) => t.diffArtifact(cwd, root, id, signal, input.adopt_working_copy ? s1.allowedPaths : undefined));
        const tree = await tool(`tree-${id}`, (signal) => t.snapshot(cwd, signal));
        const review = parse(Review, (await stage(`review-s1-${id}`, { ...MAX, ...READ_ONLY, reads: [...reads, diff.value, gate.evidence, `${root}/contracts.json`], schema: Review, prompt: p.reviewPrompt(cwd, root) })).structured);
        await tool(`stable-${id}`, async (signal) => ({ stable: true, ...t.assertScopedInputs(tree.value, await t.snapshot(cwd, signal), s1) }), 120_000, true);
        switch (review.verdict) { case "Approve": return gate; case "Reject": await persist(`rejection-${id}`, { findings: review.findings, reviewer: `${root}/review-s1-${id}.md`, diff: diff.value, gate: gate.evidence }); throw new GateFailure(id, `${root}/rejection-${id}.json`, review.findings.join("\n")); default: return unreachable(review); }
      });
      recordS1(s1Result.value, s1Result.evidence);
      await tool("s1-ledger", (signal) => t.tick(cwd, s1Result.value.verifiedTasks, signal, humanBaseline));
      validation.v9 = { kind: "Pass", evidence: s1Result.evidence };
      await tool("first-task-witness", async (signal) => { signal.throwIfAborted(); if (!/^- \[x\] /m.test(await readFile(join(cwd, tasks), "utf8"))) throw new Blocked("No first completed task"); return { started: true }; });
      await transition("T2", "In Progress", `Implementation has started for CAM-56. Evidence is recorded in ${root}.`);
      await land("route-s1", s1);
      await tool("G1-material", async (signal) => { signal.throwIfAborted(); await writeFile(join(cwd, `${root}/G1.md`), p.registration); return { file: `${root}/G1.md` }; });
      const reply = await ctx.ui.input(`${p.registration}\nMaterial: ${root}/G1.md\nSuggested slug: ${input.app_slug_hint ?? "sciexp-gitea-mq"}`);
      if (!reply?.trim()) throw new Stop("declined", "G1 declined");
      const appReply = parse(AppReply, JSON.parse(reply)); await persist("G1", { kind: "operator", reply: appReply });
      humanBaseline = (await tool("G1-operator-task", (signal) => t.tickOperator(cwd, "G1", `${root}/G1.json`, humanBaseline, signal))).value.humanBaseline;
      passed("G1", ["1.1"], `${root}/G1.json`, { kind: "Operator", decision: "approved" });
      const credentials = await tool("generate-vars", (signal) => t.generateVars(cwd, chain!, signal), timeout);
      const g1Token = await tool("G1-mint-token", (signal) => t.mintAppToken(cwd, root, "G1", appReply.id, signal));
      const app = await tool("G1-witnesses", (signal) => t.observeApp(cwd, root, appReply, g1Token.value, signal));
      const leaks = await tool("positive-controlled-leak-scan", (signal) => t.leakScan(cwd, signal), timeout);
      await implement("patch-app-id", postG1, `Set services.gitea-mq.github.appId to tool-observed ${app.value.id}; remove the placeholder, change no other settings.`);
      const patched = await bounded("post-g1-s1-gate", postG1, (id) => tool(id, async (signal) => {
        const gate = await t.s1Gate(cwd, initial.value.lock, initial.value.baseline, signal, app.value.id);
        if (await t.run(cwd, "nix eval --raw --apply toString .#nixosConfigurations.magnetite.config.services.gitea-mq.github.appId", signal) !== String(app.value.id)) throw new Blocked("App-id patch mismatch"); return gate;
      }, timeout, true));
      await tool("G1-ledger", (signal) => t.tick(cwd, ["1.2", "1.3", "1.4", "3.2", "3.3"], signal, humanBaseline));
      passed("G1-registration", ["1.2", "1.3", "1.4"], app.evidence);
      passed("G1-credentials", ["3.2"], credentials.evidence); passed("G1-leaks", ["3.3"], leaks.evidence);
      recordS1(patched.value, patched.evidence);
      await tool("post-g1-s1-ledger", (signal) => t.tick(cwd, patched.value.verifiedTasks, signal, humanBaseline));
      validation.v9 = { kind: "Pass", evidence: patched.evidence };
      await land("route-post-g1", postG1);
      await implement("hostname", s2);
      let dnsApplyAttempted = false;
      const dnsGate = (name: string) => bounded(name, s2, async (id) => {
        await tool(`dns-unverified-${id}`, (signal) => t.resetTasks(cwd, ["6.1", "6.2"], signal, humanBaseline));
        const reviewed = await tool(`dns-reviewed-${id}`, (signal) => t.reviewDnsContent(cwd, signal));
        const routed = await land(`route-dns-source-${id}`, s2, true, dnsCandidateId(dnsState));
        const candidate = dnsCandidateId(dnsState) ?? routed;
        if (candidate === null) throw new GateFailure(`route-dns-source-${id}`, `${root}/pending-route-dns-source-${id}.json`, "No DNS source edit is pending for the candidate");
        await recordDns(`dns-quarantine-${id}`, { kind: "Quarantined", id: candidate });
        const source = await tool(`dns-source-${id}`, (signal) => t.resolveSource(cwd, chain!.tip, "rollup-landing", signal));
        await tool(`dns-content-${id}`, (signal) => t.verifyDnsSource(cwd, source.value, reviewed.value, signal), 120_000, true);
        const planned = await tool(`terraform-plan-${id}`, (signal) => t.planDns(cwd, root, id, source.value, signal, dnsApplyAttempted), timeout, true);
        switch (planned.value.decision.kind) {
          case "Reconciled": break;
          case "NeedsApply":
            if (!(await ctx.ui.confirm(`Apply exactly this fresh saved DNS plan? ${JSON.stringify(planned.value.decision.summary)}; sha256=${planned.value.sha256}`))) throw new Stop("declined", "DNS apply declined");
            dnsApplyAttempted = true;
            await tool(`terraform-apply-${id}`, (signal) => t.applyDns(cwd, root, id, planned.value, signal), timeout, true);
            break;
          default: unreachable(planned.value.decision);
        }
        const resolved = await tool(`dig-${id}`, async (signal) => ({ dns: await t.dnsWitness(cwd, signal), planReceipt: planned.evidence, planHash: planned.value.sha256 }), 120_000, true);
        await recordDns(`dns-accepted-${id}`, { kind: "Accepted", id: dnsCandidateId(dnsState)! }); return resolved;
      });
      const dns = await dnsGate("dns");
      await tool("dns-ledger", (signal) => t.tick(cwd, ["6.1", "6.2"], signal, humanBaseline));
      passed("dns", ["6.1", "6.2"], dns.evidence);
      await land("route-s2", s2, true, dnsCandidateId(dnsState));
      const beforeRules = await tool("read-rulesets", (signal) => t.readRules(cwd, root, signal), 120_000, false, true);
      const { draft, rendered } = await propose("render-ruleset-diff", async (id, feedback) => {
        const draft = proposalValue(RulesetDraft, (await stage(id, { ...MEDIUM, ...READ_ONLY, reads: [...reads, beforeRules.value.file, `${root}/app.json`, ...feedback], schema: RulesetDraft, prompt: p.rulesetPrompt(cwd, root) })).structured);
        const checked = await observe(`validate-${id}`, (signal) => t.approveDraft(cwd, root, draft, app.value.id, beforeRules.value.userId, signal));
        if (!checked.ok) throw new ProposalRejected(`validate-${id}: ${JSON.stringify(checked.error)}; ${root}/validate-${id}.json`);
        return { draft, rendered: { value: checked.value.evidence } };
      });
      const hashes = await tool("G2-approved-body-hashes", async (signal) => { signal.throwIfAborted(); return { withUser: t.sha256(await readFile(join(cwd, rendered.value.withUser))), adminOnly: t.sha256(await readFile(join(cwd, rendered.value.adminOnly))) }; });
      const g2 = await ctx.ui.select(`G2 — Read full before/after/reverse at ${rendered.value.file}. ${draft.question}\nClassic main protection unchanged; allow_auto_merge=true; no PR/workflows rule. Do not edit tasks.md until the run terminates; the controller records 8.2 under the Operator receipt.`, ["approve with User bypass", "approve admin role only", "decline"] as const);
      if (g2 === "decline") throw new Stop("declined", "G2 declined");
      const approved = g2 === "approve with User bypass" ? rendered.value.withUser : rendered.value.adminOnly;
      const approvedHash = g2 === "approve with User bypass" ? hashes.value.withUser : hashes.value.adminOnly;
      await persist("G2", { kind: "operator", choice: g2, approved, sha256: approvedHash });
      humanBaseline = (await tool("G2-operator-task", (signal) => t.tickOperator(cwd, "G2", `${root}/G2.json`, humanBaseline, signal))).value.humanBaseline;
      passed("G2", ["8.2"], `${root}/G2.json`, { kind: "Operator", decision: "approved" });
      const rules = await tool("apply-rulesets", (signal) => t.applyRules(cwd, approved, approvedHash, beforeRules.value.file, signal));
      const identityTokens: t.AppToken[] = [];
      for (const id of [4743700, app.value.id]) identityTokens.push((await tool(`identity-mint-token-${id}`, (signal) => t.mintAppToken(cwd, root, "identities", id, signal))).value);
      const identities = await tool("write-capable-identities", (signal) => t.identityWitness(cwd, app.value.id, app.value.slug, identityTokens, signal));
      await tool("ruleset-ledger", (signal) => t.tick(cwd, ["8.1", "8.3", "8.4"], signal, humanBaseline));
      passed("rulesets-before", ["8.1"], beforeRules.evidence); passed("rulesets", ["8.3"], rules.evidence); passed("identities", ["8.4"], identities.evidence);
      await land("route-s3", report);

      const repairDeployment = async (id: string, effect: RepairEffect) => {
        switch (effect.kind) {
          case "Noop": return;
          case "Changed": break;
          default: return unreachable(effect);
        }
        const nixChanged = effect.paths.some((path) => path.endsWith(".nix") || path === "flake.lock");
        if (nixChanged) {
          const dependent = gateLedger.filter((entry) => ["s1", "deployment", "rollback", "V2", "V3", "V6"].includes(entry.gate));
          for (const entry of dependent) entry.status = { kind: "Invalidated", reason: `Nix repair ${id}` };
          await tool(`dependent-tasks-${id}`, (signal) => t.resetTasks(cwd, [...new Set(dependent.flatMap((entry) => entry.taskIds))], signal, humanBaseline));
          validation = { v2: { kind: "NotRun", reason: `Invalidated by ${id}` }, v3: { kind: "NotRun", reason: `Invalidated by ${id}` }, v6: { kind: "NotRun", reason: `Invalidated by ${id}` }, v9: { kind: "NotRun", reason: `Invalidated by ${id}` } };
          deployed = null; await persist(`dependent-invalidation-${id}`, gateLedger);
        }
        const gate = await tool(`eval-repair-${id}`, (signal) => t.s1Gate(cwd, initial.value.lock, initial.value.baseline, signal, app.value.id), timeout, true);
        recordS1(gate.value, gate.evidence); validation.v9 = { kind: "Pass", evidence: gate.evidence };
        await tool(`s1-ledger-${id}`, (signal) => t.tick(cwd, gate.value.verifiedTasks, signal, humanBaseline));
        await land(`route-repair-${id}`, s4, true);
        if (input.deploy && nixChanged) {
          const source = await tool(`repair-source-${id}`, (signal) => t.resolveSource(cwd, chain!.tip, "rollup-landing", signal));
          await tool(`reactivate-${id}`, (signal) => t.ensureActivated(cwd, source.value, signal), timeout, true);
          const active = await tool(`reprobe-${id}`, (signal) => t.runtimeProbe(cwd, approved, beforeRules.value.file, app.value.id, signal), 120_000, true);
          deployed = witness(`reprobe-${id}`, active.outcome, (v) => ({ value: v.evidence.deployed, evidence: active.evidence }));
          await tool(`deployment-ledger-${id}`, (signal) => t.tick(cwd, ["9.1", "11.1", "11.3", "11.4", "11.6"], signal, humanBaseline));
          passed("deployment", ["9.1", "11.1", "11.3", "11.4", "11.6"], active.evidence);
        }
      };
      if (input.deploy) {
        const active = await bounded("deploy", s4, async (id) => {
          const source = await tool(`source-${id}`, (signal) => t.resolveSource(cwd, chain!.tip, "rollup-landing", signal));
          await tool(`update-machine-${id}`, (signal) => t.ensureActivated(cwd, source.value, signal), timeout, true);
          return tool(`probe-${id}`, (signal) => t.runtimeProbe(cwd, approved, beforeRules.value.file, app.value.id, signal), 120_000, true);
        }, repairDeployment);
        deployed = witness("deploy", active.outcome, (v) => ({ value: v.evidence.deployed, evidence: active.evidence }));
        await tool("deployment-ledger", (signal) => t.tick(cwd, ["9.1", "11.1", "11.3", "11.4", "11.6"], signal, humanBaseline));
        passed("deployment", ["9.1", "11.1", "11.3", "11.4", "11.6"], active.evidence);
      } else {
        const skipped = await tool("deployment-not-requested", async (signal) => { signal.throwIfAborted(); return { deployed: false, reason: "deploy=false" }; });
        deployed = witness("deployment-not-requested", skipped.outcome, (v) => ({ value: v.evidence.deployed, evidence: skipped.evidence }));
      }
      const rollback = await bounded("rollback-eval", s4, (id) => tool(id, (signal) => t.rollback(cwd, signal), timeout, true), repairDeployment);
      await tool("rollback-ledger", (signal) => t.tick(cwd, ["11.9"], signal, humanBaseline)); passed("rollback", ["11.9"], rollback.evidence);
      if (input.deploy) {
        const selected = await bounded("V3", s4, (id) => tool(id, (signal) => t.v3Witness(cwd, signal), 120_000, true), repairDeployment);
        validation.v3 = { kind: "Pass", evidence: selected.evidence };
        await tool("V3-ledger", (signal) => t.tick(cwd, ["11.5"], signal, humanBaseline));
        passed("V3", ["11.5"], selected.evidence);
        const v6 = await bounded("V6", report, async (id) => {
          const g5 = await ctx.ui.confirm(`${p.v6Question} Attempt: ${id}`); await persist(`G5-${id}`, { approved: g5 });
          passed("G5", [], `${root}/G5-${id}.json`, { kind: "Operator", decision: g5 ? "approved" : "declined" });
          if (!g5) throw new Stop("declined", "G5 declined");
          const created = await tool(`create-${id}`, (signal) => t.v6Create(cwd, root, id, signal), 120_000, true);
          return bounded(`V6-cleanup-${id}`, report, (retry) => tool(retry, (signal) => t.v6Finish(cwd, created.value, signal), 120_000, true));
        });
        validation.v6 = v6.value.result; await tool("V6-ledger", (signal) => t.tick(cwd, ["11.8"], signal, humanBaseline)); passed("V6", ["11.8"], v6.evidence);
        const g4 = await ctx.ui.confirm(p.landingQuestion(selected.value.pr, selected.value.sha, selected.evidence)); await persist("G4", { approved: g4, selected: selected.evidence });
        passed("G4", [], `${root}/G4.json`, { kind: "Operator", decision: g4 ? "approved" : "declined" });
        if (g4) {
          const v2 = await bounded("V2", s4, (id) => tool(id, (signal) => t.pollLanding(cwd, selected.value, signal), 21 * 60_000, true), repairDeployment);
          validation.v2 = { kind: "Pass", evidence: v2.evidence };
          await tool("V2-ledger", (signal) => t.tick(cwd, ["11.7"], signal, humanBaseline));
          passed("V2", ["11.7"], v2.evidence);
        } else throw new Stop("declined", "G4 declined");
      } else validation = { ...validation, v2: { kind: "NotRun", reason: "deploy=false" }, v3: { kind: "NotRun", reason: "deploy=false" }, v6: { kind: "NotRun", reason: "deploy=false; no G5 ref mutation" } };

      await implement("docs", docs, "", false, true);
      const builtDocs = await bounded("docs-build", docs, (id) => tool(id, async (signal) => { await t.runStreaming(cwd, "just docs-build\njust docs-linkcheck", signal); return { built: true }; }, timeout, true));
      await tool("docs-ledger", (signal) => t.tick(cwd, ["10.1"], signal, humanBaseline)); passed("docs", ["10.1"], builtDocs.evidence);
      await land("route-docs", docs);
      await persist("validation", validation);
      for (const [gate, result] of Object.entries(validation)) passed(`${gate}-result`, [], `${root}/validation.json`, { kind: "Observed", result });
      const structure = await bounded("verify-structural-input", { ...report, objective: "Repair change-scoped structural validation errors without weakening acceptance contracts or inventing task evidence." }, (id) => tool(id, async (signal) => { await t.run(cwd, `openspec validate ${input.change} --strict`, signal); return { valid: true }; }, 120_000, true));
      passed("structural-validation", [], structure.evidence);
      await persist("gate-ledger", gateLedger);
      const verification = await propose("write-verify", async (id, feedback) => proposalValue(VerifyDraft, (await stage(id, { ...MEDIUM, ...READ_ONLY, reads: [...reads.filter((path) => path !== tasks), `${root}/gate-ledger.json`, `${root}/ledger-index.json`, `${root}/validation.json`, "openspec/changes/stand-up-nixbot-on-magnetite/verify.md", ...feedback], schema: VerifyDraft, prompt: p.verifyPrompt(cwd, root) })).structured));
      const verified = await tool("write-verify-observation", (signal) => t.writeVerify(cwd, verification.commentary, gateLedger, root, signal));
      written = witness("write-verify", verified.outcome, (v) => ({ value: v.evidence.written, evidence: verified.evidence }));
      await transition("T3", "In Review", `Verification report has been written for CAM-56. Read ${verify} and ${root} for witnessed results and caveats.`);
      await land("route-verify", report);
      const finalReview = parse(Review, (await stage("roborev", { ...MAX, ...READ_ONLY, reads: [...reads, verify, `${root}/ledger-index.json`, `${root}/validation.json`], schema: Review, prompt: p.reviewPrompt(cwd, root, true) })).structured);
      switch (finalReview.verdict) {
        case "Approve": break;
        case "Reject": await tool("roborev-rejected", (signal) => t.markRejected(cwd, finalReview.findings, signal)); await land("route-roborev-fail", report); throw new Stop("needs_rework", `roborev rejected: ${root}/roborev.md`);
        default: unreachable(finalReview);
      }
      const final = await tool("final-observation", async (signal) => {
        const implemented = await t.topology(cwd, chain!, signal);
        if (!(await readFile(join(cwd, verify), "utf8")).length) throw new Blocked("verify.md disappeared");
        return { implemented, validation: parse(ValidationSchema, JSON.parse(await readFile(join(cwd, `${root}/validation.json`), "utf8"))) };
      });
      tracked = witness("final-observation", final.outcome, (v) => ({ value: v.evidence.implemented, evidence: final.evidence }));
      const validated = witness("final-observation", final.outcome, (v) => ({ value: v.evidence.validation, evidence: final.evidence }));
      if (!tracked || !deployed || !written || !validated) throw new Blocked("Completion requires all four tool witnesses");
      return completedRun(tracked, deployed, validated, written, linearTransitions, root);
    } catch (error) {
      const recovery = dnsRecovery(dnsState), status = recovery ? "blocked" : error instanceof Stop ? error.status : "blocked", summary = `${String(error)}; ${recovery ?? ""}; evidence: ${root}`;
      try { await persist("terminal", { status, summary, recovery, chain, chain_state: dnsChainLabel(dnsState), validation, linearTransitions }); }
      catch (recordError) { throw new AggregateError([error, recordError], summary); }
      if (!(error instanceof Blocked) && !(error instanceof GateFailure)) throw error;
      const exit = error instanceof Stop ? { status: error.status === "declined" ? "cancelled" as const : "blocked" as const } : { status: "failed" as const, resumable: true };
      if ("resumable" in exit && exit.resumable) retainTokens = true; else await cleanupTokens();
      return ctx.exit({ ...exit, reason: summary, outputs: { status, summary, evidence_root: root } });
    } finally { if (!retainTokens) await cleanupTokens(); }
  },
});
