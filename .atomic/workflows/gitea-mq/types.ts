import type { WorkflowModelCatalogPort, WorkflowModelInfo, WorkflowRunContext } from "@bastani/atomic/workflows";
import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";
import { Blocked, unreachable, type Witness } from "../bump/types.js";
export { validateModelAttempts, validateModelPolicy, READ_ONLY } from "../omnigent/types.js";

export const change = "stand-up-gitea-mq-on-magnetite";
export const MODEL = "openai-codex/gpt-6-astra";
export const HIGH = { model: `${MODEL}:high`, fallbackModels: [] };
export const MEDIUM = { model: `${MODEL}:medium`, fallbackModels: [] };
export const MAX = { model: `${MODEL}:max`, fallbackModels: [] };
export const inputs = {
  change: Type.Literal(change, { default: change }),
  splice_after: Type.String({
    pattern: "^[k-z]+$",
    description: "Current rollup-landing chain tip change id; never @ or the join.",
  }),
  deploy: Type.Boolean({ default: true }),
  max_repair_attempts: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)], {
    default: 3, description: "Attempts per bounded batch, including the first gate execution.",
  }),
  build_timeout_minutes: Type.Integer({ minimum: 1, maximum: 180, default: 45 }),
  app_slug_hint: Type.Optional(Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" })),
};
export const Batch = Type.Union([Type.Literal(1), Type.Literal(2)]);
export type Batch = Static<typeof Batch>;
export type BatchSchedule = readonly [1, 2];
export const batches: BatchSchedule = [1, 2];
export type AttemptSchedule = readonly [1] | readonly [1, 2] | readonly [1, 2, 3];
export function attemptsFor(count: 1 | 2 | 3): AttemptSchedule {
  switch (count) {
    case 1: return [1];
    case 2: return [1, 2];
    case 3: return [1, 2, 3];
    default: return unreachable(count);
  }
}
export function normalizeToolOutcome<T extends { cached?: boolean }>(outcome: T): Omit<T, "cached"> {
  const { cached: _replayMetadata, ...stable } = outcome;
  return stable;
}
export function nextBatch(batch: Batch): 2 | null {
  switch (batch) {
    case 1: return 2;
    case 2: return null;
    default: return unreachable(batch);
  }
}

const text = () => Type.String({ minLength: 1 });
export const VResult = Type.Union([
  Type.Object({ kind: Type.Literal("Pass"), evidence: text() }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("Fail"), evidence: text(), reason: text() }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("NotRun"), reason: text() }, { additionalProperties: false }),
]);
export type VResult = Static<typeof VResult>;
export const Validation = Type.Object({ v2: VResult, v3: VResult, v6: VResult, v9: VResult });
export type Validation = Static<typeof Validation>;
export const Review = Type.Union([
  Type.Object({ verdict: Type.Literal("Approve") }, { additionalProperties: false }),
  Type.Object({
    verdict: Type.Literal("Reject"),
    findings: Type.Array(text(), { minItems: 1 }),
  }, { additionalProperties: false }),
]);
export type Review = Static<typeof Review>;
export const Diagnosis = Type.Union([
  Type.Object({ kind: Type.Literal("Repair"), instructions: text() }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal("RevisePlan"),
    designDelta: text(),
    tasksDelta: text(),
    instructions: text(),
  }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal("Blocked"), reason: text() }, { additionalProperties: false }),
]);
export type Diagnosis = Static<typeof Diagnosis>;
export const ProposedEdit = Type.Object({
  path: text(), baseSha256: Type.Union([Type.String({ pattern: "^[0-9a-f]{64}$" }), Type.Null()]),
  after: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });
export type ProposedEdit = Static<typeof ProposedEdit>;
export const StageOutput = Type.Object({ summary: text(), edits: Type.Array(ProposedEdit) }, { additionalProperties: false });
export const VerifyClaim = Type.Object({
  taskId: Type.String({ pattern: "^\\d+\\.\\d+$" }),
  evidence: text(),
}, { additionalProperties: false });
export type VerifyClaim = Static<typeof VerifyClaim>;
export const VerifyCommentary = Type.Object({ analysis: text(), caveats: text() }, { additionalProperties: false });
export type VerifyCommentary = Static<typeof VerifyCommentary>;
export const VerifyDraft = Type.Object({
  commentary: VerifyCommentary,
}, { additionalProperties: false });
export const AppReply = Type.Object({
  slug: Type.String({ pattern: "^[a-z0-9][a-z0-9-]*$" }),
  id: Type.Integer({ minimum: 1 }),
}, { additionalProperties: false });
export type AppReply = Static<typeof AppReply>;

const BypassActor = Type.Object({
  actor_id: Type.Integer(),
  actor_type: Type.Union([
    Type.Literal("Integration"),
    Type.Literal("User"),
    Type.Literal("RepositoryRole"),
  ]),
  bypass_mode: Type.Literal("always"),
});
const BranchRule = Type.Union([
  Type.Object({
    type: Type.Union([
      Type.Literal("deletion"),
      Type.Literal("non_fast_forward"),
      Type.Literal("required_linear_history"),
    ]),
  }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal("required_status_checks"),
    parameters: Type.Object({
      required_status_checks: Type.Array(Type.Object({
        context: text(),
        integration_id: Type.Integer(),
      })),
      strict_required_status_checks_policy: Type.Boolean(),
      do_not_enforce_on_create: Type.Boolean(),
    }),
  }, { additionalProperties: false }),
]);
export const Ruleset = Type.Object({
  name: text(),
  target: Type.Literal("branch"),
  enforcement: Type.Literal("active"),
  conditions: Type.Object({
    ref_name: Type.Object({ include: Type.Array(text()), exclude: Type.Array(text()) }),
  }),
  bypass_actors: Type.Array(BypassActor),
  rules: Type.Array(BranchRule),
}, { additionalProperties: false });
export type Ruleset = Static<typeof Ruleset>;
export const RulesetDraft = Type.Object({
  before: Ruleset,
  after: Ruleset,
  reverse: Ruleset,
  question: text(),
}, { additionalProperties: false });
export type RulesetDraft = Static<typeof RulesetDraft>;

export type LinearState = "In Progress" | "In Review";
export type LinearOutcome =
  | { kind: "TransitionFailed" }
  | { kind: "ReadbackFailed"; comment: "Posted" | "Failed" }
  | { kind: "TransitionObserved"; comment: "Posted" | "Failed" };

const ValidationStatus = Type.Union([
  Type.Literal("pass"), Type.Literal("fail"), Type.Literal("not_run"),
]);
export const outputs = {
  status: Type.Union([
    Type.Literal("completed"), Type.Literal("completed-with-caveat"),
    Type.Literal("blocked"), Type.Literal("declined"), Type.Literal("needs_rework"),
  ]),
  summary: Type.String(),
  implemented: Type.Array(Type.String()),
  deployed: Type.Boolean(),
  validated: Type.Object({
    v2: ValidationStatus, v3: ValidationStatus, v6: ValidationStatus, v9: ValidationStatus,
  }),
  verify_md_written: Type.Boolean(),
  linear_transitions: Type.Array(Type.Union([Type.Literal("In Progress"), Type.Literal("In Review")])),
  evidence_root: Type.String(),
};
export function resultStatus(result: VResult): "pass" | "fail" | "not_run" {
  switch (result.kind) {
    case "Pass": return "pass";
    case "Fail": return "fail";
    case "NotRun": return "not_run";
    default: return unreachable(result);
  }
}
export const completedRun = (
  implemented: Witness<string[]>, deployed: Witness<boolean>,
  validated: Witness<Validation>, written: Witness<boolean>,
  transitions: LinearState[], root: string,
) => ({
  status: Object.values(validated.value).some((v) => v.kind !== "Pass")
    ? "completed-with-caveat" as const : "completed" as const,
  summary: "Chain and report observed. See evidence for live validation and explicit not_run/fail results; human gates are not technical proof.",
  implemented: implemented.value,
  deployed: deployed.value,
  validated: {
    v2: resultStatus(validated.value.v2),
    v3: resultStatus(validated.value.v3),
    v6: resultStatus(validated.value.v6),
    v9: resultStatus(validated.value.v9),
  },
  verify_md_written: written.value,
  linear_transitions: transitions,
  evidence_root: root,
});
export function parse<T extends TSchema>(schema: T, value: unknown): Static<T> {
  if (!Value.Check(schema, value)) throw new Blocked("Malformed structured value");
  return value;
}
// Atomic 0.9.18 exposes this runtime port but omits it from WorkflowRunContext.
export function catalogPort(ctx: WorkflowRunContext): WorkflowModelCatalogPort | undefined {
  const models = (ctx as { models?: unknown }).models;
  if (typeof models !== "object" || models === null || !("listModels" in models) || typeof models.listModels !== "function") return undefined;
  return models as WorkflowModelCatalogPort;
}
export function assertCatalog(catalog: readonly WorkflowModelInfo[]): void {
  const schema = Type.Array(Type.Object({
    provider: Type.String(),
    id: Type.String(),
    fullId: Type.String(),
  }, { additionalProperties: true }));
  const rows = parse(schema, catalog);
  if (!rows.some((row) => row.fullId === MODEL)) {
    throw new Blocked("Astra absent from configured catalog; no substitution permitted");
  }
}
