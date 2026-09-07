import { writeFile, mkdir } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import process from "node:process";
import { workflow, type WorkflowSerializableValue, type WorkflowTaskOptions } from "@bastani/atomic/workflows";
import { Blocked, unreachable, witness, within, type Witness } from "./bump/types.js";
import { quote, requireSuccess } from "./bump/tools.js";
import { IMPL, DOCS, REPORT, REVIEW, READ_ONLY, Review, StageOutput, completedRun, inputs, outputs, modelPins, validateReview, validateStage, validateModelPolicy, validateModelAttempts, acceptanceStatus, checklist, type Attestation, type Outputs, type Slice, type SliceChange } from "./omnigent/types.js";
import { slices, joinSlices, validateSlices } from "./omnigent/slices.js";
import { capture, save, snapshot, processCheckpoint, classifyScope, squashCommand, ids, oneId, pathsIn, tfstatePaths, assertHealthy, assertNoPreexisting, assertScopeInputs, reviewedPaths, assertChangeSha, varsPaths, seedChain, createChange, verifyTopology, runGateSandbox, writeWizard, probeDeployment, probeRunner, probeHarnessCatalog, probeClaudeHookEnv, type Topology, type Tree } from "./omnigent/tools.js";
import { implementationReads, implementPrompt, reviewPrompt, trackingPrompt, reportPrompt, research } from "./omnigent/prompts.js";
import { resolveSource, resolveRevisionSource, resolveJoinSource, planDns, applyDns, updateMachine, type DeploymentSource } from "./omnigent/deployment.js";

export default workflow({
  name: "deploy-omnigent", description: "S0–S10 gated implementation, pinned magnetite deployment, and human-attested Omnigent acceptance.",
  autoAttach: true, inputs, outputs,
  run: async (ctx) => {
    const cwd = ctx.cwd ?? process.cwd();
    const input = ctx.inputs;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(input.chain_name)) return ctx.exit({ status: "blocked", reason: "Invalid chain name" });
    const allocated = await ctx.tool("allocate-evidence", { ...input }, async ({ signal }) => {
      signal.throwIfAborted();
      const path = `.atomic/workflows/runs/deploy-omnigent/${input.chain_name}/${randomUUID()}`;
      await mkdir(join(cwd, path), { recursive: true });
      return path;
    }, { failureMode: "return", timeoutMs: 120_000 });
    if (!allocated.ok) return ctx.exit({ status: "blocked", reason: "Could not allocate run evidence" });
    const root = allocated.value;
    const ledgerFile = `${root}/ledger.json`;
    const ledger: unknown[] = [];
    const timeout = input.build_timeout_minutes * 60_000;
    let current = input.start_at_slice, status = "completed", summary = "S0–S10 verified; deployment not requested.";
    let topology: Topology | undefined;
    let changes: SliceChange[] = [], wizardPath = "";
    let reusedChange: string | null = null;
    let acceptance: Outputs["acceptance"] = input.deploy ? "pending" : "not_requested";
    let deployedSource: DeploymentSource | null = null;
    let ownershipExpected: Tree = {};
    let deployed: Witness<boolean> | null = null, verified: Witness<SliceChange[]> | null = null;
    const flush = () => save(cwd, ledgerFile, ledger);
    const tool = async <T extends WorkflowSerializableValue>(name: string, action: (signal: AbortSignal) => Promise<T>, timeoutMs = 120_000, identity: WorkflowSerializableValue = {}) => {
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Blocked("Invalid tool deadline");
      const result = await ctx.tool(name, { inputs: { ...input }, root, slice: current, topology: topology ?? null, changes, identity }, async ({ signal }) => processCheckpoint(root, name, () => action(signal)), { failureMode: "return", timeoutMs });
      ledger.push({ node: name, kind: "tool", result }); await flush();
      await save(cwd, `${root}/${name}.json`, result);
      if (!result.ok) throw new Blocked(`${name}: ${JSON.stringify(result.error)}`);
      return { value: result.value.evidence, outcome: result };
    };
    const stage = async (name: string, options: WorkflowTaskOptions) => {
      validateModelPolicy(options);
      const result = await ctx.task(name, options).catch(async (error: unknown) => {
        ledger.push({ node: name, kind: "stage", model: null, thinking: null, metadataMissing: true, error: String(error) });
        await flush();
        throw error;
      });
      const actual = result.modelAttempts?.filter((attempt) => attempt.success).at(-1);
      ledger.push({ node: name, kind: "stage", model: actual?.model ?? result.model ?? null, thinking: actual?.reasoningLevel ?? null, attempts: result.modelAttempts ?? [], metadataMissing: !actual?.model || !actual.reasoningLevel });
      await flush();
      if (!actual?.model || !actual.reasoningLevel) throw new Blocked(`${name}: actual model/thinking metadata unavailable`);
      validateModelAttempts(options.model, result.modelAttempts);
      return result;
    };
    const scope = async (name: string, before: Tree, slice: Slice) => {
      const result = await tool(`scope-${name}`, async (signal) => {
        const after = await snapshot(cwd, signal);
        return { ...classifyScope(before, after, slice.allowedPaths, await pathsIn(cwd, "@", signal)), after };
      });
      const { attributed, foreign, foreignDuringStage } = result.value;
      for (const path of new Set([...Object.keys(ownershipExpected), ...Object.keys(result.value.after)])) {
        if (!slice.allowedPaths.some((prefix) => within(path, prefix))) continue;
        if (path in result.value.after) ownershipExpected[path] = result.value.after[path]!;
        else delete ownershipExpected[path];
      }
      ledger.push({ node: name, attributed, foreign }); await flush();
      if (foreignDuringStage.length) {
        const decision = await ctx.ui.select(`Paths changed during ${name} outside S${slice.id}:\n${foreignDuringStage.join("\n")}`, ["concurrent-agent: continue", "worker-violation: block"] as const);
        ledger.push({ node: name, decision, foreign_during_stage: foreignDuringStage }); await flush();
        if (decision === "worker-violation: block") throw new Blocked(`Worker scope violation at S${slice.id}`);
      }
    };
    const implement = async (name: string, slice: Slice, reads: string[], repair = false) => {
      const before = (await tool(`snapshot-${name}`, (signal) => snapshot(cwd, signal))).value;
      assertScopeInputs(ownershipExpected, before, slice.allowedPaths);
      const result = await stage(name, { ...(repair ? IMPL : slice.implModel), context: "fresh", tools: ["read", "search", "find", "ls", "bash", "edit", "write"], mcp: { allow: [] }, reads, schema: StageOutput, output: `${root}/${name}.md`, outputMode: "file-only", prompt: implementPrompt(cwd, root, slice, repair) }).finally(() => scope(name, before, slice));
      validateStage(result.structured);
    };
    const gates = async (name: string, slice: Slice, source: DeploymentSource) => {
      // The shell changes directory, but capture keeps durable logs in the primary evidence tree.
      const result = await tool(name, (signal) => runGateSandbox(cwd, slice.gates, source, signal, (directory, command, gateSignal) =>
        capture(cwd, directory === cwd ? command : `cd ${quote(directory)}\n${command}`, gateSignal)), timeout * slice.gates.length + 60_000,
      { gatesHash: createHash("sha256").update(JSON.stringify(slice.gates)).digest("hex"), ...source });
      return { ...result.value, receipts: [`${root}/${name}.json`] };
    };
    const diff = async (name: string, change: string, gateSha: string) => (await tool(name, async (signal) => {
      await assertChangeSha(cwd, change, gateSha, signal);
      const result = requireSuccess(await capture(cwd, `jj --ignore-working-copy diff -r ${quote(change)}`, signal));
      const stability = await assertChangeSha(cwd, change, gateSha, signal);
      const artifact = `${root}/${name}.diff`;
      await writeFile(join(cwd, artifact), result);
      return { artifact, ...stability };
    })).value.artifact;
    const state = () => ({ status, summary, chain_tip: topology?.tip ?? "", slice_changes: changes, resume_at_slice: current, deployed: deployed?.value ?? false, deployed_source: deployedSource, acceptance, evidence_root: root, wizard_path: wizardPath });
    try {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(input.chain_name) || !/^[k-z]+$/.test(input.splice_after) || input.verified_changes.some((id) => !/^[k-z]+$/.test(id))) throw new Blocked("Invalid chain name or jj change id");
      if (!Number.isFinite(timeout) || !Number.isSafeInteger(input.max_repair_attempts)) throw new Blocked("Invalid bounded inputs");
      validateSlices();
      const preflight = await tool("preflight", async (signal) => {
        const workingCopy = await oneId(cwd, "@", signal);
        const splice = await oneId(cwd, input.splice_after, signal);
        await assertHealthy(cwd, workingCopy, signal);
        const head = requireSuccess(await capture(cwd, "git rev-parse HEAD", signal));
        const pins: { path: string; commit: string; ref: string }[] = [];
        for (const [path, pin, branch] of [
          ["/Users/crs58/ghq/github.com/omnigent-ai/omnigent", "29db91b0", ""],
          ["/Users/crs58/ghq/github.com/svkozak/pi-acp", "d1cffc04", ""],
          ["/Users/crs58/ghq/github.com/kanidm/kanidm", "8d4465fa", ""],
          ["/Users/crs58/ghq/github.com/cameronraysmith/atomic", "", "docs/acp-integration-research"],
        ]) {
          const ref = branch || "HEAD";
          const observed = requireSuccess(await capture(cwd, `git -C ${quote(path!)} rev-parse --verify ${quote(`${ref}^{commit}`)}`, signal));
          if (pin && !observed.startsWith(pin)) throw new Blocked(`Local source pin drift: ${path}`);
          pins.push({ path: path!, commit: observed, ref });
        }
        const piAcpVersion: unknown = JSON.parse(requireSuccess(await capture(cwd, "git -C /Users/crs58/ghq/github.com/svkozak/pi-acp show HEAD:package.json", signal)));
        if (!piAcpVersion || typeof piAcpVersion !== "object" || !("version" in piAcpVersion) || piAcpVersion.version !== "0.0.33") throw new Blocked("pi-acp version is not 0.0.33");
        const models = (ctx as typeof ctx & { models?: { listModels(): unknown | Promise<unknown> } }).models;
        const catalog = models ? await models.listModels() : null;
        if (catalog !== null) {
          if (!Array.isArray(catalog)) throw new Blocked("Malformed model catalog");
          const available = catalog.map((model: unknown) => model && typeof model === "object" && "fullId" in model ? model.fullId : null);
          for (const pin of modelPins) if (!available.includes(pin.split(":")[0]!)) throw new Blocked(`Model absent from catalog: ${pin}`);
        }
        const catalogPath = `${root}/model-catalog.json`;
        await save(cwd, catalogPath, catalog ?? { note: "ctx.models.listModels unavailable in installed host" });
        for (const slice of slices) await save(cwd, `${root}/slice-${slice.id}.json`, slice);
        requireSuccess(await capture(cwd, "jj debug snapshot", signal));
        assertNoPreexisting(await pathsIn(cwd, "@", signal), slices.flatMap((slice) => [...slice.allowedPaths]));
        return { workingCopy, splice, head, pins, catalogPath, piAcpVersion: "0.0.33" };
      });
      const seeded = await tool("seed-chain", (signal) => seedChain(cwd, preflight.value.splice, input.chain_name, input.start_at_slice, input.verified_changes, preflight.value.workingCopy, signal));
      topology = seeded.value.topology; changes = seeded.value.changes;
      reusedChange = seeded.value.reused_change;
      verified = witness("seed-chain", seeded.outcome, (value) => ({ value: value.evidence.changes, evidence: `${root}/seed-chain.json` }));
      for (const slice of slices) {
        if (slice.id >= input.start_at_slice) break;
        current = slice.id;
        const change = changes[slice.id]!.change_id;
        const source = (await tool(`resume-source-${slice.id}`, (signal) => resolveRevisionSource(cwd, change, input.chain_name, signal))).value;
        const observed = await gates(`resume-gate-${slice.id}-sandbox`, slice, source);
        if (!observed.passed) throw new Blocked(`Resume S${slice.id}: deterministic gates failed`);
        const reverified = await tool(`resume-verified-${slice.id}`, async (signal) => {
          const stability = await assertChangeSha(cwd, change, observed.sha, signal);
          ledger.push({ node: `resume-sha-${slice.id}`, ...stability }); await flush();
          return verifyTopology(cwd, topology!, changes.map((change) => change.slice === slice.id ? { ...change, verified: true } : change), signal);
        }, 120_000, { receipts: observed.receipts, sha: observed.sha });
        changes = reverified.value;
        verified = witness(`resume-verified-${slice.id}`, reverified.outcome, (value) => ({ value: value.evidence, evidence: `${root}/resume-verified-${slice.id}.json` }));
      }
      current = input.start_at_slice;
      const ownershipBaseline = (await tool("ownership-baseline", (signal) => snapshot(cwd, signal))).value;
      let landingBaseline = { ...ownershipBaseline };
      ownershipExpected = { ...ownershipBaseline };
      if (input.start_at_slice === 0 && !(seeded.value.recovered && seeded.value.proposal_exists)) {
        const before = (await tool("snapshot-bind-tracking", (signal) => snapshot(cwd, signal))).value;
        assertScopeInputs(ownershipExpected, before, slices[0].allowedPaths);
        const bound = await stage("bind-tracking", { ...DOCS, context: "fresh", tools: ["read", "search", "find", "ls", "bash", "edit", "write"], mcp: { allow: [] }, reads: [...slices.map((s) => `${root}/slice-${s.id}.json`), ...research], schema: StageOutput, output: `${root}/bind-tracking.md`, outputMode: "file-only", prompt: trackingPrompt(cwd, root, slices[0], input.linear_team) }).finally(() => scope("bind-tracking", before, slices[0]));
        validateStage(bound.structured);
      }
      for (const slice of slices) {
        if (slice.id < input.start_at_slice) continue;
        current = slice.id;
        const change = slice.id === 0 && reusedChange ? reusedChange : (await tool(`create-change-${slice.id}`, (signal) => createChange(cwd, topology!, slice.id, signal))).value;
        await implement(`implement-${slice.id}`, slice, implementationReads(root, slice));
        const land = async (name: string, gateSha?: string) => {
          const landed = await tool(name, async (signal) => {
            const stability = gateSha ? await assertChangeSha(cwd, change, gateSha, signal) : null;
            await assertHealthy(cwd, topology!.workingCopy, signal);
            requireSuccess(await capture(cwd, "jj debug snapshot", signal));
            const currentTree = await snapshot(cwd, signal);
            const workingPaths = await pathsIn(cwd, "@", signal);
            const allowed = reviewedPaths(landingBaseline, ownershipExpected, currentTree, slice.allowedPaths, workingPaths);
            const foreign = workingPaths.filter((p) => !allowed.includes(p));
            if (allowed.length) requireSuccess(await capture(cwd, squashCommand(change, allowed, slice.allowedPaths), signal));
            const next = { ...topology!, tip: change };
            const observed = await verifyTopology(cwd, next, [...changes.filter((item) => item.slice !== slice.id), { slice: slice.id, change_id: change, verified: false }], signal);
            requireSuccess(await capture(cwd, `jj bookmark set ${quote(input.chain_name)} -r ${quote(change)}`, signal));
            if (await oneId(cwd, input.chain_name, signal) !== change) throw new Blocked("Bookmark did not advance");
            const source = await resolveSource(cwd, change, input.chain_name, signal);
            return { topology: next, changes: observed, foreign, source, stability, currentTree };
          }, 120_000, { change, gateSha: gateSha ?? null });
          topology = landed.value.topology; changes = landed.value.changes;
          landingBaseline = landed.value.currentTree;
          verified = witness(name, landed.outcome, (value) => ({ value: value.evidence.changes, evidence: `${root}/${name}.json` }));
          return landed.value.source;
        };
        let source = await land(`land-${slice.id}`);
        let regated = await gates(`gate-sandbox-${slice.id}`, slice, source);
        let diffPath = await diff(`diff-${slice.id}`, change, regated.sha);
        let result = await stage(`review-${slice.id}`, { ...REVIEW, ...READ_ONLY, context: "fresh", reads: [`${root}/slice-${slice.id}.json`, ...regated.receipts, diffPath, ...((slice as Slice).reviewReads ?? []).map((p: string) => p.replaceAll("__OMNIGENT_PRIMARY__", cwd))], schema: Review, output: `${root}/review-${slice.id}.md`, outputMode: "file-only", prompt: reviewPrompt(cwd, root, slice) });
        await tool(`review-sha-${slice.id}`, (signal) => assertChangeSha(cwd, change, regated.sha, signal));
        let review = validateReview(result.structured);
        let approved = false;
        for (let round = 0; round <= input.max_repair_attempts; round++) {
          switch (review.verdict) {
            case "approved": approved = regated.passed; break;
            case "changes_requested": break;
            case "plan_invalidated": {
              const decision = await ctx.ui.select(`S${slice.id}: ${review.reason}; affected: ${review.affected_decisions.join(", ")}`, ["continue", "stop-for-replan"] as const);
              ledger.push({ node: `replan-${slice.id}-${round}`, decision, review }); await flush();
              if (decision === "stop-for-replan") throw new Blocked(`S${slice.id} stopped for replan`);
              break;
            }
            default: unreachable(review);
          }
          if (approved) break;
          if (round === input.max_repair_attempts) throw new Blocked(`S${slice.id} did not converge within repair bound`);
          const repair = round + 1;
          const previousSha = regated.sha;
          await implement(`repair-${slice.id}-${repair}`, slice, [...implementationReads(root, slice), `${root}/review-${slice.id}${round ? `-${round}` : ""}.md`, ...regated.receipts], true);
          source = await land(`land-${slice.id}-${repair}`, previousSha);
          const unchanged = source.sha === previousSha;
          if (unchanged && review.verdict !== "changes_requested") throw new Blocked("Repair changed no gate inputs");
          regated = await gates(`gate-sandbox-${slice.id}-${repair}`, slice, source);
          diffPath = await diff(`diff-${slice.id}-${repair}`, change, regated.sha);
          result = await stage(`review-${slice.id}-${repair}`, { ...REVIEW, ...READ_ONLY, context: "fresh", reads: [`${root}/slice-${slice.id}.json`, ...regated.receipts, diffPath, ...((slice as Slice).reviewReads ?? []).map((p: string) => p.replaceAll("__OMNIGENT_PRIMARY__", cwd))], schema: Review, output: `${root}/review-${slice.id}-${repair}.md`, outputMode: "file-only", prompt: reviewPrompt(cwd, root, slice) });
          await tool(`review-sha-${slice.id}-${repair}`, (signal) => assertChangeSha(cwd, change, regated.sha, signal));
          review = validateReview(result.structured);
          if (unchanged && (review.verdict !== "approved" || !regated.passed)) throw new Blocked("External observations refreshed once; unchanged-input review still not approved or gates failed");
        }
        const accepted = await tool(`verified-${slice.id}`, async (signal) => {
          const stability = await assertChangeSha(cwd, change, regated.sha, signal);
          const observed = await verifyTopology(cwd, topology!, changes.map((item) => item.slice === slice.id ? { ...item, verified: regated.passed && approved } : item), signal);
          return { changes: observed, ...stability };
        }, 120_000, { change, sha: regated.sha, receipts: regated.receipts, review });
        changes = accepted.value.changes;
        verified = witness(`verified-${slice.id}`, accepted.outcome, (value) => ({ value: value.evidence.changes, evidence: `${root}/verified-${slice.id}.json` }));
        current = slice.id + 1;
      }
      if (input.deploy) {
        current = 11;
        if (!(await ctx.ui.confirm("Generate magnetite's two Omnigent secret generators and squash vars into S3?"))) throw new Blocked("Secret generation declined");
        const generated = await tool("generate-vars", async (signal) => {
          const before = await snapshot(cwd, signal);
          const allowed = varsPaths;
          requireSuccess(await capture(cwd, "jj debug snapshot", signal));
          assertNoPreexisting(await pathsIn(cwd, "@", signal), allowed);
          const existing = await pathsIn(cwd, changes[3]!.change_id, signal);
          const generators = ["kanidm-oauth2-omnigent", "omnigent-cookie-secret-omnigent"];
          const present = generators.filter((g) => existing.some((p) => p.startsWith(`vars/per-machine/magnetite/${g}/`)));
          if (present.length !== generators.length) {
            requireSuccess(await capture(cwd, generators.filter((g) => !present.includes(g)).map((g) => `clan vars generate magnetite --generator ${g}`).join("\n"), signal));
            requireSuccess(await capture(cwd, "jj debug snapshot", signal));
            const interposed = await ids(cwd, `(${topology!.join}::@) ~ ${topology!.join} ~ @`, signal);
            for (const id of interposed) {
              const paths = await pathsIn(cwd, id, signal);
              if (!paths.length || paths.some((p) => !allowed.some((prefix) => within(p, prefix)))) throw new Blocked(`Unexpected commit between join and @ during vars generation: ${id}`);
              requireSuccess(await capture(cwd, squashCommand(changes[3]!.change_id, paths, allowed, id), signal));
            }
          }
          const after = await snapshot(cwd, signal);
          requireSuccess(await capture(cwd, "jj debug snapshot", signal));
          const workingPaths = await pathsIn(cwd, "@", signal);
          const scope = classifyScope(before, after, allowed, workingPaths);
          if (scope.foreignDuringStage.length) throw new Blocked(`Vars generation changed foreign paths: ${scope.foreignDuringStage.join(", ")}`);
          const paths = reviewedPaths(before, after, await snapshot(cwd, signal), allowed, workingPaths);
          if (paths.length) requireSuccess(await capture(cwd, squashCommand(changes[3]!.change_id, paths, allowed), signal));
          return { changes: await verifyTopology(cwd, topology!, changes, signal), foreign: scope.foreign, foreign_during_stage: scope.foreignDuringStage };
        }, timeout);
        changes = generated.value.changes;
        verified = witness("generate-vars", generated.outcome, (value) => ({ value: value.evidence.changes, evidence: `${root}/generate-vars.json` }));
        const dnsSource = (await tool("resolve-dns-source", (signal) => resolveSource(cwd, topology!.tip, input.chain_name, signal))).value;
        const plan = (await tool("plan-dns", (signal) => planDns(cwd, root, dnsSource, signal), timeout, dnsSource)).value;
        if (plan.summary.action === "no-op") {
          ledger.push({ node: "apply-dns", skipped: true, reason: "omni record already present; plan has no changes" }); await flush();
        } else {
          if (!(await ctx.ui.confirm(`Apply saved Terraform plan ${plan.sha256}: ${JSON.stringify(plan.summary)}; no other resource changes?`))) throw new Blocked("DNS plan declined");
          await tool("apply-dns", (signal) => applyDns(cwd, plan, signal), timeout, plan);
        }
        await tool("route-tfstate", async (signal) => {
          requireSuccess(await capture(cwd, "jj debug snapshot", signal));
          const changed = (await pathsIn(cwd, "@", signal)).filter((p) => (tfstatePaths as readonly string[]).includes(p));
          if (changed.length) requireSuccess(await capture(cwd, squashCommand(changes[2]!.change_id, changed, tfstatePaths), signal));
          return { routed: changed, changes: await verifyTopology(cwd, topology!, changes, signal) };
        });
        const source = (await tool("resolve-deployment-source", (signal) => resolveJoinSource(cwd, topology!.tip, input.chain_name, signal))).value;
        for (const slice of joinSlices) {
          try {
            const observed = await gates(`deploy-join-gate-${slice.id}-sandbox`, slice, source);
            if (!observed.passed) {
              const failed = observed.observations.flatMap((gate, index) => gate.passed ? [] : [{ index, gate: slice.gates[index], detail: gate.detail }]);
              throw new Blocked(`Failed gates: ${JSON.stringify(failed)}`);
            }
          } catch (error) {
            throw new Blocked(`Development-join union gate failure S${slice.id}: join=${source.sha}; chain_tip=${source.chainTipSha}; ${String(error)}; activation blocked, no source fallback`);
          }
        }
        const updated = await tool("update-machine", (signal) => updateMachine(cwd, source, signal), timeout, source);
        deployedSource = { source: updated.value.source, sha: updated.value.sha };
        const probed = await tool("probe-deployment", (signal) => probeDeployment(cwd, signal));
        deployed = witness("probe-deployment", probed.outcome, (value) => ({ value: value.evidence.deployed, evidence: `${root}/probe-deployment.json` }));
        await tool("probe-harness-catalog", (signal) => probeHarnessCatalog(cwd, signal));
        await tool("probe-claude-hook-env", (signal) => probeClaudeHookEnv(cwd, signal));
        wizardPath = (await tool("write-wizard", async (signal) => { signal.throwIfAborted(); return writeWizard(cwd, root); })).value;
        if (!(await ctx.ui.confirm(`Operator completed wizard steps in ${wizardPath}?`))) throw new Blocked("Operator wizard not completed");
        const confirmed = Date.now();
        await tool("probe-host-online", async (signal) => {
          const remaining = 90_000 - (Date.now() - confirmed);
          if (remaining <= 0) throw new Blocked("Host-online observation deadline expired");
          await probeRunner(cwd, signal);
          const remote = 'systemctl is-active --quiet omnigent-host && invocation=$(systemctl show omnigent-host -p InvocationID --value) && test -n "$invocation" && journalctl -u omnigent-host _SYSTEMD_INVOCATION_ID="$invocation" --no-pager -o cat';
          const command = `end=$((SECONDS + ${Math.floor(remaining / 1000)})); while (( SECONDS < end )); do if ssh -o ConnectTimeout=5 root@magnetite.zt ${quote(remote)} | grep -E 'Connected as|Host tunnel disconnected' | tail -1 | grep -qF "Connected as 'magnetite'"; then printf 'host-online\\n'; exit 0; fi; sleep 2; done; exit 1`;
          requireSuccess(await capture(cwd, command, signal));
          return { online: true, since: confirmed };
        }, Math.max(1, 90_000 - (Date.now() - confirmed)));
        const responses: Attestation[] = [];
        for (const item of checklist) {
          const response = await ctx.ui.select(item, ["passed", "failed", "not tested"] as const);
          const attestation: Attestation = { kind: "human_attested", item, response };
          responses.push(attestation); ledger.push(attestation); await flush();
        }
        acceptance = acceptanceStatus(responses);
        if (responses.some((response) => response.response === "failed")) throw new Blocked("Deployment observed, but operator acceptance failed");
        if (acceptance === "incomplete") {
          status = "completed-with-caveat";
          summary = "S0–S10 verified; deployment probes observed. Operator acceptance includes not tested items; acceptance is incomplete, not verified.";
        } else summary = "S0–S10 verified; deployment probes observed. Acceptance is human_attested, not independently verified.";
      } else {
        const skipped = await tool("observe-no-deploy", async (signal) => { signal.throwIfAborted(); return { deployed: false }; });
        deployed = witness("observe-no-deploy", skipped.outcome, (value) => ({ value: value.evidence.deployed, evidence: `${root}/observe-no-deploy.json` }));
      }
    } catch (error) {
      status = "blocked"; summary = String(error);
      ledger.push({ node: "blocked", slice: current, reason: summary });
      if (/^[a-z0-9][a-z0-9-]*$/.test(input.chain_name)) await flush();
    }
    if (/^[a-z0-9][a-z0-9-]*$/.test(input.chain_name)) {
      await save(cwd, `${root}/final-state.json`, state());
      try {
        const report = await stage("report", { ...REPORT, ...READ_ONLY, context: "fresh", reads: [ledgerFile, `${root}/final-state.json`], schema: StageOutput, output: `${root}/report.md`, outputMode: "file-only", prompt: reportPrompt(cwd, root) });
        validateStage(report.structured);
      } catch (error) { status = "blocked"; summary = `${summary}; report: ${String(error)}`; }
      await save(cwd, `${root}/final-state.json`, state());
    }
    if (status === "blocked" || !deployed || !verified) return ctx.exit({ status: "blocked", reason: summary, outputs: state() });
    const { deployed: _deployed, slice_changes: _changes, ...rest } = state();
    return completedRun(deployed, verified, rest);
  },
});
