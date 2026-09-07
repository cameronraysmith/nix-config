import { homedir } from "node:os";
import { join } from "node:path";
import { type Slice } from "./types.js";
import { identityDoc, plan, ompResearch, darwinResearch, pyriteResearch } from "./slices.js";

const artifacts = join(homedir(), ".atomic/agent/sessions/--Users-crs58-projects-vanixiets--/subagent-artifacts");
export const research = [
  "56c195b5_codebase-analyzer_0_output.md", "56c195b5_codebase-analyzer_1_output.md",
  "69c674ea_codebase-analyzer_0_output.md", "69c674ea_codebase-analyzer_1_output.md",
  "69c674ea_codebase-analyzer_2_output.md", "69c674ea_codebase-analyzer_3_output.md",
  "04d1f94f_codebase-analyzer_0_output.md",
].map((file) => join(artifacts, file));
export const implementationReads = (root: string, slice: Slice): string[] => [
  `${root}/slice-${slice.id}.json`, plan, identityDoc, ...research, ...(slice.id === 6 ? [ompResearch] : []), ...(slice.id === 7 ? [darwinResearch] : []), ...(slice.id === 8 ? [pyriteResearch] : []),
];
const keep = (role: string, cwd: string, root: string, slice?: Slice, tracking = false) => `<keepContext>
Role: ${role}. Repository: ${cwd}. Evidence root: ${root}.${slice ? ` Slice: S${slice.id} ${slice.title}. Allowed paths: ${slice.allowedPaths.join(", ")}.` : ""}
No jj mutations, git mutations, remote infrastructure operations, machine-closure builds, edits outside allowed paths, or touching foreign changes. ${tracking ? "Linear API operations for the specified story/project binding are permitted." : "No remote infrastructure mutations; read-only network reads such as PyPI metadata and nix store prefetch-file for hashes are permitted."} Never weaken gates or invent hashes. No nested workflow or subagents.
All authored model stages request openai-codex/gpt-6-astra only, with no explicit provider/model fallback; do not dispatch any subagents. Review uses max, implementation/repair/tracking use high, and reporting uses medium. The controller checks actual model/thinking metadata after each call.
</keepContext>`;
export function implementPrompt(cwd: string, root: string, slice: Slice, repair = false): string {
  return `${keep(repair ? "Scoped implementation repair writer" : "Scoped implementation writer", cwd, root, slice)}
${repair ? "Repair the findings in the preceding review and gate receipts." : "Implement the objective in the slice contract."}
The contract artifact contains the literal acceptance list and deterministic gates; preserve its interfaces.
Read the nearest README before editing and load the relevant skills.
Use file:line citations and verify using the Nix ladder from nix eval upward; controller-owned remote builds and independent gate nodes perform effectful checks, not you.
A fresh reviewer will falsify your work against every acceptance item.
Return a structured summary and cite changed files, verification evidence, and any plan decision contradicted by a concrete fact.
Do not turn a contradiction into a silent plan change.
For S0, fold the amendments into the existing plan rather than appending conflicting decisions; retain /nix/store read_paths caveats and use the locally pinned Kanidm fork instead of fork URL citations.
For S3, give the exactly-one-server assertion the exact message 'Omnigent requires exactly one server'.`;
}
export function reviewPrompt(cwd: string, root: string, slice: Slice): string {
  return `${keep("READ_ONLY grumpy-but-fair independent falsification reviewer", cwd, root, slice)}
Do not edit anything or run commands. Read the supplied slice contract, SHA-pinned gate receipts, the slice change's own diff artifact, and every other path in your reads list (the deployment plan and identity runbook, when listed, are the authorized frozen contract text for section references such as §3 and D1–D8); do not read other repository files in the shared working copy and do not rely on the implementer's self-attestation.
Falsify against every literal acceptance item in the slice contract using file:line citations and named receipts.
Return the schema verdict: approved only when all deterministic gates passed and no acceptance defect remains; changes_requested with concrete findings otherwise.
Use plan_invalidated only when a gate or observed fact contradicts a plan decision; name its reason and affected_decisions.
Do not claim builds or deployment from prose. Missing evidence is a finding, not permission to assume success.`;
}
export function trackingPrompt(cwd: string, root: string, slice: Slice, team: string): string {
  return `${keep("OpenSpec and Linear tracking writer in HIL mode", cwd, root, slice, true)}
Use openspec-new-change, openspec-ff-change, openspec-linear-sync and the HIL mode of agentic-planning-development-workflow.
Create openspec/changes/deploy-omnigent-magnetite/proposal.md and tasks.md mirroring S0–S10 from the contract artifacts.
Bind a Linear story in team ${JSON.stringify(team)}, new project omnigent-magnetite, and update openspec/linear.yaml.
Do not perform implementation or deployment here. Return a structured summary with identifiers and paths.`;
}
export function reportPrompt(cwd: string, root: string): string {
  return `${keep("READ_ONLY evidence reporter", cwd, root)}
Read the ledger and final-state artifact. Write the report through the stage output only.
Report verified slice changes, blocked/resume state, actual model/thinking metadata, receipts, deployed_source URL/SHA, activation path observations, and remaining risks with file:line citations.
Separate human_attested checklist responses verbatim from tool observations. Never promote them into witnesses or positive claims.
Do not claim this specification guarantees a successful login or ACP session end to end.`;
}
