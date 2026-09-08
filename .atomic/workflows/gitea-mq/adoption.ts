import type { WorkflowSerializableValue } from "@bastani/atomic/workflows";
import { Blocked } from "../bump/types.js";
import type * as Tools from "./tools.js";
import type { GateStatus } from "./ledger.js";

type Observation<T> = { value: T; evidence: string };
/** The controller owns every adoption effect; these ports keep them in named durable nodes. */
export type AdoptionPorts = {
  tool<T extends WorkflowSerializableValue>(name: string, action: (signal: AbortSignal) => Promise<T>): Promise<Observation<T>>;
  passed(gate: string, taskIds: string[], evidence: string, status?: GateStatus): unknown;
  effects: Pick<typeof Tools, "adoptS1" | "adoptRoutedS1" | "adoptRoutedSlice" | "resetTasks">;
};
/** Partial S1 evidence bound to the revision the committed forge comparison must use. */
export type S1Partial = {
  revision: string;
  observations: Parameters<typeof Tools.recordCommittedForgePre>[2]["observations"];
  evidence: string;
};
/** Routed adoption replaces the S1 implementation, gate, review and route; its ticks are already committed. */
export async function adoptRouted(cwd: string, file: string, baseline: string, ports: AdoptionPorts, successors: readonly Tools.RoutedSlice[] = []): Promise<S1Partial> {
  const adopted = await ports.tool("adopt-routed-s1", (signal) => ports.effects.adoptRoutedS1(cwd, file, baseline, signal, successors));
  ports.passed("adopt-routed-s1", [], adopted.evidence, { kind: "Unverified", reason: `S1 adopted from routed change ${adopted.value.changeId} (${adopted.value.commit}); no S1 implementation, gate, review or routing ran in this run, and its committed task ledger is left as routed` });
  return { revision: adopted.value.changeId, observations: adopted.value.observations, evidence: adopted.evidence };
}
export async function adoptSuccessors(cwd: string, slices: readonly Tools.RoutedSlice[], baseline: string, ports: AdoptionPorts) {
  const adopted = new Map<Tools.RoutedSlice, Awaited<ReturnType<typeof Tools.adoptRoutedSlice>>>();
  for (const slice of slices) if (slice !== "s1") {
    const receipt = await ports.tool(`adopt-routed-${slice}`, (signal) => ports.effects.adoptRoutedSlice(cwd, slice, baseline, signal));
    adopted.set(slice, receipt.value);
    ports.passed(`adopt-routed-${slice}`, [], receipt.evidence, { kind: "Unverified", reason: `Content adopted from ${receipt.value.changeId} (${receipt.value.commit}); prior run ledger not inherited; tasks left unchanged` });
  }
  return adopted;
}
export async function appIdWitness(expected: number, found: number | null, ports: AdoptionPorts) {
  return ports.tool("adopted-app-id-witness", async (signal) => {
    signal.throwIfAborted();
    if (expected !== found) throw new Blocked(`Adopted app-id mismatch: expected observed ${expected}; found ${found}`);
    return { appId: expected };
  });
}
/** Working-copy adoption replaces only the initial proposal; every S1 gate still runs. */
export async function adoptWorkingCopy(cwd: string, file: string, baseline: string, taskIds: readonly string[], ports: AdoptionPorts): Promise<null> {
  await ports.tool("adopt-s1", (signal) => ports.effects.adoptS1(cwd, file, baseline, signal));
  await ports.tool("adopt-s1-reset-tasks", (signal) => ports.effects.resetTasks(cwd, taskIds, signal, baseline));
  return null;
}
