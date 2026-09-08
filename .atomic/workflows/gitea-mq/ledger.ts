import { unreachable } from "../bump/types.js";
import type { Tree } from "../omnigent/tools.js";
import type { VResult, VerifyClaim } from "./types.js";
export type { VerifyClaim } from "./types.js";
export type DnsChainState = { kind: "Absent" } | { kind: "Quarantined"; id: string } | { kind: "Accepted"; id: string };
export function dnsChainLabel(state: DnsChainState): string {
  switch (state.kind) {
    case "Absent": return "no-dns-candidate";
    case "Quarantined": return `quarantined(${state.id})`;
    case "Accepted": return `accepted(${state.id})`;
    default: return unreachable(state);
  }
}
export function dnsCandidateId(state: DnsChainState): string | null {
  switch (state.kind) {
    case "Absent": return null;
    case "Quarantined": case "Accepted": return state.id;
    default: return unreachable(state);
  }
}
export function dnsRecovery(state: DnsChainState): string | null {
  switch (state.kind) {
    case "Absent": case "Accepted": return null;
    case "Quarantined": return `DNS change ${state.id} is quarantined and NOT landable; orchestrator may run: jj abandon '${state.id}' (workflow never abandons)`;
    default: return unreachable(state);
  }
}

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
  | { kind: "Unverified"; reason: string }
  | { kind: "Operator"; decision: "approved" | "declined" };

export type GateEntry = {
  gate: string;
  taskIds: string[];
  evidence: string;
  status: GateStatus;
};
/** Deferred working-copy gates cannot supersede committed evidence, including invalidation. */
export function recordS1(ledger: GateEntry[], gate: { observations: { taskId: string; missing: readonly string[] }[]; forgePre: { reason: string } }, evidence: string) {
  for (const row of gate.observations) {
    if (row.taskId === "5.3" && ledger.some((entry) => entry.gate === "s1-committed-forge-pre")) continue;
    const status: GateStatus = row.taskId === "5.3" ? { kind: "Unverified", reason: `Deferred: ${gate.forgePre.reason}` } : row.missing.length ? { kind: "Unverified", reason: row.missing.join(", ") } : { kind: "Passed" };
    ledger.push({ gate: "s1", taskIds: [row.taskId], evidence, status });
  }
}

export function committedForgeStatus(result: { ok: true; value: { evidence: { kind: string; verifiedTasks: string[]; reason?: string } } } | { ok: false; error: unknown }): GateStatus {
  if (!result.ok) return { kind: "Unverified", reason: `NotRun: ${JSON.stringify(result.error)}` };
  const value = result.value.evidence;
  if (value.kind === "Passed" && value.verifiedTasks.includes("5.3")) return { kind: "Passed" };
  return { kind: "Unverified", reason: value.kind === "NotRun" ? `NotRun: ${value.reason}` : `${value.kind}: immutable comparison or remaining task 5.3 arms not passed` };
}


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
      case "Unverified":
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


export function renderGateLedger(ledger: readonly GateEntry[]): string {
  return "\n## Controller-bound gate receipts\n\n" + ledger.map((entry) => {
    const identity = `${entry.gate}; tasks ${entry.taskIds.join(", ") || "none"}; ${entry.evidence}`;
    switch (entry.status.kind) {
      case "Passed": return `- [verified here] ${identity}; passed`;
      case "Unverified": return `- ${identity}; unverified: ${entry.status.reason}`;
      case "Invalidated": return `- ${identity}; invalidated: ${entry.status.reason}`;
      case "Observed": return `- ${identity}; ${JSON.stringify(entry.status.result)}`;
      case "Operator": return `- [operator] ${identity}; ${entry.status.decision}`;
      default: return unreachable(entry.status);
    }
  }).join("\n") + "\n";
}
