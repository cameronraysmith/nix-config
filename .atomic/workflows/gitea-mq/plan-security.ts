import { constants } from "node:fs";
import { open, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { canonicalExternalEvidence } from "./process.js";

/** Pre-create private, non-symlink artifacts before OpenTofu can write anything. */
export async function preparePlan(cwd: string, root: string, name: string): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("Invalid plan artifact name");
  const plan = join(await canonicalExternalEvidence(cwd, root), `${name}.tfplan`);
  for (const path of [plan, `${plan}.json`]) {
    const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    try { await file.chmod(0o600); } finally { await file.close(); }
  }
  return plan;
}

/** Uncached, signal-independent cleanup. Record attempts even if deletion fails;
 * never recursively remove directories or follow a leaf symlink. */
export async function deletePlans(cwd: string, root: string) {
  const directory = resolve(cwd, root);
  const deleted: string[] = [], failed: string[] = [];
  try {
    const names = await readdir(directory);
    await Promise.all(names.filter((name) => /\.tfplan(?:\.json)?$/.test(name)).map(async (name) => {
      try { await unlink(join(directory, name)); deleted.push(name); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") failed.push(name); }
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") failed.push("evidence enumeration");
  }
  const observation = { kind: "PlanArtifactDeletion", deleted: deleted.sort(), failed: failed.sort() };
  // This local observation must survive aborted ctx.tool calls and terminal-record failures.
  try { await writeFile(join(directory, "plan-artifact-deletion.json"), JSON.stringify(observation), { mode: 0o600 }); }
  catch (error) { throw new AggregateError([error], "Plan artifact deletion observation failed"); }
  if (failed.length) throw new Error(`Plan artifact deletion failed: ${failed.join(", ")}`);
  return observation;
}
export function planCleanup(cwd: string, root: string): () => Promise<Awaited<ReturnType<typeof deletePlans>>> {
  let pending: ReturnType<typeof deletePlans> | undefined;
  return () => pending ??= deletePlans(cwd, root);
}
/** Attempt every finalizer even when another rejects; preserve a single error. */
export async function finalizeArtifacts(actions: (() => Promise<unknown>)[]): Promise<void> {
  const results = await Promise.allSettled(actions.map((action) => Promise.resolve().then(action)));
  const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason as unknown] : []);
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors, "Private artifact cleanup failed");
}
