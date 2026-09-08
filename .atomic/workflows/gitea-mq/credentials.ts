import { readdir, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";

/** Uncached local finalizer: runs even when Atomic is aborting. Do not put this
 * behind ctx.tool (which can replay/skip or reject on an aborted signal).
 * Memoize even rejection: catch + finally must never retry a deletion error. */
export function appTokenCleanup(cwd: string, root: string): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => pending ??= deleteAppTokens(resolve(cwd, root));
}
async function deleteAppTokens(root: string): Promise<void> {
  let files: string[];
  try { files = await readdir(root); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new AggregateError([error], "App token deletion failed: cannot enumerate evidence root");
  }
  // Include incomplete mint sentinels and tokens from replay, not just returned
  // AppToken references. unlink removes a leaf symlink, never its target.
  const results = await Promise.allSettled(files.filter((file) => file.endsWith(".token.json")).map(async (file) => {
    try { await unlink(join(root, file)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }));
  const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason as unknown] : []);
  if (errors.length) throw new AggregateError(errors, "App token deletion failed: reconcile remaining private artifacts");
}
