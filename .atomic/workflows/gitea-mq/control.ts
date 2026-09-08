import type { Static, TSchema } from "typebox";
import { Blocked } from "../bump/types.js";
import { attemptsFor, batches, nextBatch, parse } from "./types.js";

export class GateFailure extends Error { constructor(readonly gate: string, readonly receipt: string, reason: string) { super(reason); } }
export class Stop extends Blocked { constructor(readonly status: "blocked" | "declined" | "needs_rework", message: string) { super(message); } }
export class ProposalRejected extends Blocked {}
export function proposalValue<T extends TSchema>(schema: T, value: unknown): Static<T> {
  try { return parse(schema, value); }
  catch (error) { if (error instanceof Blocked) throw new ProposalRejected(String(error)); throw error; }
}

const missingOutput = "atomic-workflows: stage configured with schema must finish by calling structured_output.";
const missingOutputDetails = [
  "The model produced assistant text but never called structured_output",
  "The model produced an assistant message with empty text",
  "The model produced no assistant message after the prompt",
];
/** Atomic 0.9.18 rejects ctx.task with an ordinary Error after its per-candidate
 * initial turn + three corrections. Match only native contract diagnostics;
 * provider, cancellation, policy and runtime faults must retain their identity. */
export function rejectStructuredContract(error: unknown): never {
  if (error instanceof Error && error.name === "Error" && (
    /^Validation failed for tool "structured_output":\n/.test(error.message) ||
    /^atomic-workflows: structured_output returned a non-serializable value: /.test(error.message) ||
    error.message === "structured_output tool call failed schema validation." || error.message === missingOutput ||
    missingOutputDetails.some((detail) => error.message === detail || error.message === `${missingOutput} ${detail}`)
  )) throw new ProposalRejected(error.message);
  throw error;
}

/** Proposal validation retries do not replay accepted edits or any external effect. */
export async function proposalLoop<T>(
  name: string, count: 1 | 2 | 3, root: string,
  execute: (id: string, feedback: string[]) => Promise<T>,
  persist: (name: string, data: unknown) => Promise<void>,
  input: (question: string) => Promise<string | null | undefined>,
): Promise<T> {
  let feedback: string[] = [], authorization: string[] = [];
  for (const batch of batches) {
    for (const attempt of attemptsFor(count)) {
      const id = `${name}-b${batch}-a${attempt}`;
      try { return await execute(id, feedback); }
      catch (error) {
        if (!(error instanceof ProposalRejected)) throw error;
        await persist(`proposal-rejection-${id}`, { batch, attempt, reason: String(error) });
        feedback = [...authorization, `${root}/proposal-rejection-${id}.json`];
      }
    }
    if (nextBatch(batch) === null) throw new Stop("blocked", `${name} proposals exhausted both bounded batches; ${feedback.join(", ")}`);
    const answer = await input(`G3 — ${name}: rejected proposals; read ${feedback.join(", ")}. Supply instructions for exactly one additional batch of ${count} attempts, or cancel.`);
    if (!answer?.trim()) throw new Stop("blocked", `G3 declined: ${feedback.join(", ")}`);
    await persist(`G3-proposal-${name}`, { batch: 2, instructions: answer });
    authorization = [`${root}/G3-proposal-${name}.json`]; feedback.push(...authorization);
  }
  throw new Blocked("Unreachable proposal batch state");
}
