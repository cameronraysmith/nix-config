import type { WorkflowSerializableValue } from "@bastani/atomic/workflows";
import type * as Tools from "./tools.js";
import type { GateStatus } from "./ledger.js";

type Observation<T> = { value: T; evidence: string };
/** The controller owns every adoption effect; these ports keep them in named durable nodes. */
export type AdoptionPorts = {
  tool<T extends WorkflowSerializableValue>(name: string, action: (signal: AbortSignal) => Promise<T>): Promise<Observation<T>>;
  passed(gate: string, taskIds: string[], evidence: string, status?: GateStatus): unknown;
  effects: Pick<typeof Tools, "adoptS1" | "adoptRoutedS1" | "resetTasks">;
};
/** Partial S1 evidence bound to the revision the committed forge comparison must use. */
export type S1Partial = {
  revision: string;
  observations: Parameters<typeof Tools.recordCommittedForgePre>[2]["observations"];
  evidence: string;
};
/** Routed adoption replaces the S1 implementation, gate, review and route; its ticks are already committed. */
export async function adoptRouted(cwd: string, file: string, baseline: string, ports: AdoptionPorts): Promise<S1Partial> {
  const adopted = await ports.tool("adopt-routed-s1", (signal) => ports.effects.adoptRoutedS1(cwd, file, baseline, signal));
  ports.passed("adopt-routed-s1", [], adopted.evidence, { kind: "Unverified", reason: `S1 adopted from routed change ${adopted.value.changeId} (${adopted.value.commit}); no S1 implementation, gate, review or routing ran in this run, and its committed task ledger is left as routed` });
  return { revision: adopted.value.changeId, observations: adopted.value.observations, evidence: adopted.evidence };
}
/** Working-copy adoption replaces only the initial proposal; every S1 gate still runs. */
export async function adoptWorkingCopy(cwd: string, file: string, baseline: string, taskIds: readonly string[], ports: AdoptionPorts): Promise<null> {
  await ports.tool("adopt-s1", (signal) => ports.effects.adoptS1(cwd, file, baseline, signal));
  await ports.tool("adopt-s1-reset-tasks", (signal) => ports.effects.resetTasks(cwd, taskIds, signal, baseline));
  return null;
}
