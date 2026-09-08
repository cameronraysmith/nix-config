import { unreachable } from "../bump/types.js";
import { renderGateLedger, type GateEntry } from "./ledger.js";
import type { VerifyCommentary } from "./types.js";

const literal = (value: string): string => value.replace(/[\\`*_\[\]<>#|~]/g, "\\$&").replace(/[\r\n]+/g, " ");
const quoted = (value: string): string => value.split(/\r?\n/).map((line) => `> ${literal(line)}`).join("\n");

/** Only ledger entries render verdicts; model text occupies escaped, explicitly non-verdict slots. */
export function renderVerify(commentary: VerifyCommentary, ledger: readonly GateEntry[]): string {
  const latest = new Map<string, GateEntry>();
  for (const entry of ledger) for (const taskId of entry.taskIds) latest.set(taskId, entry);
  const taskRows = [...latest].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })).map(([id, entry]) => {
    const evidence = literal(entry.evidence);
    switch (entry.status.kind) {
      case "Passed": return `- [verified here] task ${id}; passed; ${evidence}`;
      case "Unverified": return `- task ${id}; unverified; ${evidence}; ${literal(entry.status.reason)}`;
      case "Invalidated": return `- task ${id}; invalidated; ${evidence}; ${literal(entry.status.reason)}`;
      case "Operator": return `- [operator] task ${id}; ${entry.status.decision}; ${evidence}; not a technical pass`;
      case "Observed": return `- task ${id}; observed ${literal(JSON.stringify(entry.status.result))}; ${evidence}`;
      default: return unreachable(entry.status);
    }
  }).join("\n");
  const receipt = (gate: string) => {
    const entry = ledger.filter((row) => row.gate === gate).at(-1);
    return entry?.status.kind === "Passed" ? `[verified here] ${gate}; passed; ${literal(entry.evidence)}` : `${gate}; unverified (no current passed receipt)`;
  };
  return `# Verification report

Sections 1–8 and the controller receipt ledger are deterministic tool-ledger renderings.
[verified here] means a controller-observed gate; [operator] means a recorded human decision, not a technical pass.
Implementation ticks do not authorize verification claims.

## 1. Structural validation

${receipt("structural-validation")}

## 2. Task verification verdicts

${taskRows}

## 3. Delta spec sync state

Unverified: no delta-sync gate is recorded by this workflow.

## 4. Design / specs coherence

Unverified: model commentary below is not a coherence verdict.

## 5. Implementation signal

The task verdicts above and receipts below describe observed gates only.
No claim that changes were pushed to main is made; chain topology is checked separately by the controller.

## 6. Front-door leak scan

${receipt("G1-leaks")}

## 7. Deferred dogfood

Authenticated webhook redelivery remains not_run without its required observation.
Task 11.5 uses deterministic C6 recomputation, not queue dashboard/journal output.
Task 8.4 is a token-visible inventory with per-App installation checks, not an unrestricted installation universe.
V6 cannot establish deletion protection for refs/landings/*.

## 8. Designation / discharge coherence

Unverified: no independent designation-coherence tool gate is recorded.
The V2/V3/V6/V9 outcomes and operator decisions are rendered verbatim from controller receipts below.
${renderGateLedger(ledger)}
## Non-verdict model commentary

The following quoted text is model commentary, never task verdicts, observations or attributions.

### Analysis (non-verdict)

${quoted(commentary.analysis)}

### Caveats (non-verdict)

${quoted(commentary.caveats)}
`;
}

export function renderRoborevRejection(findings: readonly string[]): string {
  return `\n## roborev disposition\n\n- [x] (fail) FAIL\n\n### Reviewer findings (non-verdict commentary)\n\n${findings.map(quoted).join("\n\n")}\n`;
}
