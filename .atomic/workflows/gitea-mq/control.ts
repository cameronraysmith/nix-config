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
