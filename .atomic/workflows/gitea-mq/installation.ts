import type { WorkflowSerializableValue } from "@bastani/atomic/workflows";
import type { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type * as Tools from "./tools.js";
import { DEFERRED_INSTALLATION_REASON, type AppReply, type Validation } from "./types.js";
import type { GateEntry, GateStatus } from "./ledger.js";
import { installationQuestion } from "./prompts.js";
import { Stop } from "./control.js";

type Observation<T> = { value: T; evidence: string };
/** Controller ports keep all effects in named durable nodes, including on replay. */
export type InstallationPorts = {
  tool<T extends WorkflowSerializableValue>(name: string, action: (signal: AbortSignal) => Promise<T>): Promise<Observation<T>>;
  persist(name: string, data: unknown): Promise<void>;
  passed(gate: string, taskIds: string[], evidence: string, status?: GateStatus): unknown;
  confirm(question: string): Promise<boolean>;
  writeFile: typeof writeFile;
  effects: Pick<typeof Tools, "resetTasks" | "tick" | "mintAppToken" | "observeApp" | "hookWitness" | "identityWitness">;
};
export async function recordDeferredInstallation(cwd: string, root: string, baseline: string, ports: InstallationPorts) {
  await ports.tool("installation-deferred-reset-tasks", (signal) => ports.effects.resetTasks(cwd, ["1.3", "11.2", "8.4"], signal, baseline));
  const result = { kind: "NotRun" as const, reason: DEFERRED_INSTALLATION_REASON };
  for (const [node, task] of [["G1-installation", "1.3"], ["webhook-config", "11.2"], ["write-capable-identities", "8.4"]] as const) {
    await ports.persist(`${node}-deferred`, result);
    ports.passed(node, [task], `${root}/${node}-deferred.json`, { kind: "Observed", result });
  }
  return { v2: result, v3: result, v6: result };
}
export async function recordRegistration(cwd: string, evidence: string, baseline: string, deferred: boolean, ports: InstallationPorts) {
  const tasks = deferred ? ["1.2", "1.4"] : ["1.2", "1.3", "1.4"];
  await ports.tool("G1-ledger", (signal) => ports.effects.tick(cwd, [...tasks, "3.2", "3.3"], signal, baseline));
  ports.passed("G1-registration", tasks, evidence);
}
export async function observeIdentities(cwd: string, root: string, app: AppReply, ports: InstallationPorts, prefix = "") {
  const tokens: Tools.AppToken[] = [];
  for (const id of [4743700, app.id]) tokens.push((await ports.tool(`${prefix}identity-mint-token-${id}`, (signal) => ports.effects.mintAppToken(cwd, root, prefix ? "G6-identities" : "identities", id, signal))).value);
  return ports.tool(`${prefix}write-capable-identities`, (signal) => ports.effects.identityWitness(cwd, app.id, app.slug, tokens, signal));
}
export async function confirmInstallation(cwd: string, root: string, app: AppReply, baseline: string, gates: GateEntry[], validation: Validation, ports: InstallationPorts) {
  const completed = gates.filter((entry) => entry.status.kind === "Passed").map((entry) => `- ${entry.gate}: tasks ${entry.taskIds.join(", ") || "none"}; ${entry.evidence}`);
  const notRun = ["1.3 installation", "11.2 App-JWT webhook-config", "8.4 write-capable identities"].map((item) => `- ${item}: NotRun — ${DEFERRED_INSTALLATION_REASON}`);
  for (const entry of gates) if (entry.status.kind === "Unverified" && entry.status.reason.includes("NotRun")) notRun.push(`- ${entry.gate}: tasks ${entry.taskIds.join(", ")}; ${entry.status.reason}; ${entry.evidence}`);
  notRun.push("- V2/V3/V6: NotRun — awaiting G6 and S5", "- 11.2 authenticated redelivery: NotRun — operator redelivery and matched journal evidence not performed");
  const question = installationQuestion(app.slug, app.id, root, completed, notRun);
  await ports.persist("gate-ledger-G6", gates);
  await ports.tool("G6-material", async (signal) => { signal.throwIfAborted(); await ports.writeFile(join(cwd, `${root}/G6.md`), question); return { file: `${root}/G6.md` }; });
  await ports.persist("G6-pending", { kind: "AwaitingInstallation", prompt: `${root}/G6.md`, validation });
  const approved = await ports.confirm(question);
  await ports.persist("G6", { kind: "operator", approved, prompt: `${root}/G6.md` });
  ports.passed("G6", [], `${root}/G6.json`, { kind: "Operator", decision: approved ? "approved" : "declined" });
  if (!approved) throw new Stop("declined", "G6 installation declined");
  const token = await ports.tool("G6-mint-token", (signal) => ports.effects.mintAppToken(cwd, root, "G6", app.id, signal));
  const installed = await ports.tool("G6-witnesses", (signal) => ports.effects.observeApp(cwd, root, app, token.value, signal));
  await ports.tool("G6-installation-ledger", (signal) => ports.effects.tick(cwd, ["1.3"], signal, baseline));
  ports.passed("G6-installation", ["1.3"], installed.evidence);
  const hook = await ports.tool("G6-webhook-config", (signal) => ports.effects.hookWitness(cwd, app.id, signal));
  ports.passed("G6-webhook-config", [], hook.evidence, { kind: "Observed", result: hook.value });
  // Hook URL proof is only one arm of 11.2: authenticated redelivery is still absent.
  ports.passed("G6-webhook-authentication", ["11.2"], hook.evidence, { kind: "Observed", result: { kind: "NotRun", reason: "Authenticated redelivery and matched journal evidence not performed by workflow" } });
  const identities = await observeIdentities(cwd, root, app, ports, "G6-");
  await ports.tool("G6-identities-ledger", (signal) => ports.effects.tick(cwd, ["8.4"], signal, baseline));
  ports.passed("G6-identities", ["8.4"], identities.evidence);
  await ports.persist("G6-confirmed", { installation: installed.evidence, hook: hook.evidence, identities: identities.evidence });
}
