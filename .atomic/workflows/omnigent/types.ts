import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { Blocked, type Witness } from "../bump/types.js";

export const inputs = {
  splice_after: Type.String(), chain_name: Type.String({ default: "omnigent-magnetite" }),
  start_at_slice: Type.Integer({ default: 0, minimum: 0, maximum: 11 }),
  verified_changes: Type.Array(Type.String(), { default: [] }),
  max_repair_attempts: Type.Integer({ default: 2, minimum: 0 }),
  build_timeout_minutes: Type.Integer({ default: 60, minimum: 1 }),
  deploy: Type.Boolean({ default: true }), linear_team: Type.String({ default: "CAM" }),
};
export const SliceChange = Type.Object({ slice: Type.Integer(), change_id: Type.String(), verified: Type.Boolean() });
export type SliceChange = Static<typeof SliceChange>;
export const outputs = {
  status: Type.String(), summary: Type.String(), chain_tip: Type.String(),
  slice_changes: Type.Array(SliceChange), resume_at_slice: Type.Integer(), deployed: Type.Boolean(),
  evidence_root: Type.String(), wizard_path: Type.String(),
  deployed_source: Type.Union([Type.Object({ source: Type.String(), sha: Type.String() }), Type.Null()]),
  acceptance: Type.Union([Type.Literal("not_requested"), Type.Literal("pending"), Type.Literal("human_attested"), Type.Literal("incomplete")]),
};
export type Outputs = Static<ReturnType<typeof outputSchema>>;
function outputSchema() { return Type.Object(outputs); }
export const completedRun = (deployment: Witness<boolean>, changes: Witness<SliceChange[]>, rest: Omit<Outputs, "deployed" | "slice_changes">): Outputs =>
  ({ ...rest, deployed: deployment.value, slice_changes: changes.value });

export const Review = Type.Union([
  Type.Object({ verdict: Type.Literal("approved") }),
  Type.Object({ verdict: Type.Literal("changes_requested"), findings: Type.Union([Type.Array(Type.String(), { minItems: 1 }), Type.String({ minLength: 1 })]) }),
  Type.Object({ verdict: Type.Literal("plan_invalidated"), reason: Type.String(), affected_decisions: Type.Array(Type.String(), { minItems: 1 }) }),
]);
export type Review = Static<typeof Review>;
export function validateReview(value: unknown): Review {
  if (!Value.Check(Review, value)) throw new Blocked("Invalid structured review verdict");
  if (value.verdict !== "changes_requested" || Array.isArray(value.findings)) return value;
  let parsed: unknown = null;
  try { parsed = JSON.parse(value.findings); } catch { parsed = null; }
  const findings = Array.isArray(parsed) && parsed.length && parsed.every((f) => typeof f === "string") ? parsed : [value.findings];
  return { verdict: "changes_requested", findings };
}
export const StageOutput = Type.Object({ summary: Type.String() });
export function validateStage(value: unknown): Static<typeof StageOutput> {
  if (!Value.Check(StageOutput, value)) throw new Blocked("Invalid structured stage output");
  return value;
}
const Expect = Type.Union([
  Type.Object({ kind: Type.Literal("Equal"), value: Type.Unknown() }),
  Type.Object({ kind: Type.Literal("Includes"), values: Type.Array(Type.String()) }),
  Type.Object({ kind: Type.Literal("Matches"), pattern: Type.String() }),
]);
export const Gate = Type.Union([
  Type.Object({ kind: Type.Literal("NixEval"), target: Type.Union([
    Type.Object({ kind: Type.Literal("Attr"), attr: Type.String() }),
    Type.Object({ kind: Type.Literal("Expr"), expr: Type.String() }),
  ]), expect: Expect }),
  Type.Object({ kind: Type.Literal("NixBuildRemote"), installable: Type.String() }),
  Type.Object({ kind: Type.Literal("Command"), argv: Type.Array(Type.String(), { minItems: 1 }), expectExitZero: Type.Boolean(), expectStdoutIncludes: Type.Optional(Type.Array(Type.String())), failureDiagnostic: Type.Optional(Type.String()) }),
  Type.Object({ kind: Type.Literal("GrepAssert"), file: Type.String(), pattern: Type.String() }),
]);
export type Gate = Static<typeof Gate>;
export const Model = Type.Object({ model: Type.String(), fallbackModels: Type.Optional(Type.Array(Type.String())) });
export const Slice = Type.Object({
  id: Type.Integer({ minimum: 0, maximum: 10 }), title: Type.String(), allowedPaths: Type.Array(Type.String(), { minItems: 1 }),
  objective: Type.String(), acceptance: Type.Array(Type.String(), { minItems: 1 }), gates: Type.Array(Gate, { minItems: 1 }), implModel: Model,
  reviewReads: Type.Optional(Type.Array(Type.String())),
});
export type Slice = Static<typeof Slice>;
export const MODEL = "openai-codex/gpt-6-astra";
export const IMPL = { model: `${MODEL}:high` };
export const DOCS = { model: `${MODEL}:high` };
export const IDENTITY = { model: `${MODEL}:max` };
export const REVIEW = { model: `${MODEL}:max` };
export const REPORT = { model: `${MODEL}:medium` };
export const READ_ONLY = { tools: ["read", "search", "find", "ls"], mcp: { allow: [] as string[] } };
export const modelPins = [IMPL.model, DOCS.model, IDENTITY.model, REVIEW.model, REPORT.model];
export function validateModelPolicy(options: { model?: unknown; fallbackModels?: readonly string[] }): void {
  if (typeof options.model !== "string" || !modelPins.includes(options.model) || (options.fallbackModels?.length ?? 0) !== 0) throw new Blocked("Stage violates Astra-only model policy");
}
export function validateModelAttempts(model: unknown, attempts: readonly { model?: string; reasoningLevel?: string; success: boolean }[] | undefined): void {
  if (typeof model !== "string" || !attempts?.length || attempts.some((attempt) => `${attempt.model}:${attempt.reasoningLevel}` !== model) || !attempts.at(-1)?.success) throw new Blocked("Actual model/thinking differs from the stage pin");
}
export const checklist = ["laptop passkey login", "/ui/apps tile", "Android app login", "Atomic appears in the UI harness dropdown", "one acp:atomic session", "Claude Code response renders in the structured web UI view (not only the terminal toggle)", "Files panel populated after Resume session", "Oh My Pi appears in the UI harness dropdown", "an acp:oh-my-pi session completes a turn", "the Omnigent tile shows its icon on the Kanidm apps page", "stibnite appears online in the UI host list", "a session on stibnite completes a turn with a native harness", "an acp:atomic or acp:oh-my-pi turn completes on stibnite", "stibnite returns online automatically after sleep/network change", "stibnite returns online automatically after logout or reboot", "pyrite appears online in the UI host list", "a session on pyrite completes a turn", "pyrite returns online automatically after suspend/resume", "an acp:atomic tool call such as ls succeeds on magnetite", "the same succeeds on pyrite", "an acp:oh-my-pi turn still works", "a session in a fresh worktree gets the project toolchain (e.g. just --version succeeds)"] as const;
export type Attestation = { kind: "human_attested"; item: string; response: "passed" | "failed" | "not tested" };
export function acceptanceStatus(responses: readonly Attestation[]): "human_attested" | "incomplete" {
  return responses.length === checklist.length && checklist.every((item) => responses.filter((r) => r.item === item && r.response === "passed").length === 1) ? "human_attested" : "incomplete";
}
