import { isDeepStrictEqual } from "node:util";
import { Blocked, unreachable } from "../bump/types.js";
import type { Tree } from "../omnigent/tools.js";
import type { VResult, VerifyClaim } from "./types.js";
export type { VerifyClaim } from "./types.js";

export type RepairEffect =
  | { kind: "Noop" }
  | { kind: "Changed"; paths: string[] };

export function repairEffect(before: Tree, after: Tree): RepairEffect {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((path) => before[path] !== after[path]);
  return paths.length ? { kind: "Changed", paths } : { kind: "Noop" };
}

export function repairPaths(effect: RepairEffect): string[] {
  switch (effect.kind) {
    case "Noop": return [];
    case "Changed": return effect.paths;
    default: return unreachable(effect);
  }
}

export type GateStatus =
  | { kind: "Passed" }
  | { kind: "Observed"; result: VResult }
  | { kind: "Invalidated"; reason: string }
  | { kind: "Operator"; decision: "approved" | "declined" };

export type GateEntry = {
  gate: string;
  taskIds: string[];
  evidence: string;
  status: GateStatus;
};


/** Only current controller receipts authorize a report's task verification claims. */
export function passedClaims(ledger: readonly GateEntry[]): VerifyClaim[] {
  const latest = new Map<string, VerifyClaim>();
  for (const entry of ledger) {
    switch (entry.status.kind) {
      case "Passed":
        for (const taskId of entry.taskIds) {
          latest.set(taskId, { taskId, evidence: entry.evidence });
        }
        break;
      case "Invalidated":
        for (const taskId of entry.taskIds) latest.delete(taskId);
        break;
      case "Observed": break;
      case "Operator": break;
      default: unreachable(entry.status);
    }
  }
  return [...latest.values()].sort((a, b) => a.taskId.localeCompare(b.taskId));
}

export function assertVerifyClaims(claims: readonly VerifyClaim[], ledger: readonly GateEntry[]): void {
  const sorted = [...claims].sort((a, b) => a.taskId.localeCompare(b.taskId));
  if (!isDeepStrictEqual(sorted, passedClaims(ledger))) {
    throw new Blocked("Verify task claims differ from current gate receipts (missing, stale, duplicate or invented witness)");
  }
}

export function renderGateLedger(ledger: readonly GateEntry[]): string {
  return "\n## Controller-bound gate receipts\n\n" + ledger.map((entry) => {
    const identity = `${entry.gate}; tasks ${entry.taskIds.join(", ") || "none"}; ${entry.evidence}`;
    switch (entry.status.kind) {
      case "Passed": return `- [verified here] ${identity}; passed`;
      case "Invalidated": return `- ${identity}; invalidated: ${entry.status.reason}`;
      case "Observed": return `- ${identity}; ${JSON.stringify(entry.status.result)}`;
      case "Operator": return `- [operator] ${identity}; ${entry.status.decision}`;
      default: return unreachable(entry.status);
    }
  }).join("\n") + "\n";
}
