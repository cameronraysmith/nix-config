import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readlink } from "node:fs/promises";
import { join } from "node:path";
import { quote, requireSuccess, lines } from "../bump/tools.js";
import { Blocked } from "../bump/types.js";
import type { Tree } from "../omnigent/tools.js";
import { capture } from "./process.js";

// The shared helpers close over unbounded capture; these adapters use the bounded process port.
const run = async (cwd: string, command: string, signal: AbortSignal) => requireSuccess(await capture(cwd, command, signal));
export const ids = async (cwd: string, revset: string, signal: AbortSignal) =>
  lines(await run(cwd, `jj --ignore-working-copy log --no-graph -r ${quote(revset)} -T 'change_id ++ "\\n"'`, signal));
export async function oneId(cwd: string, revset: string, signal: AbortSignal): Promise<string> {
  const result = await ids(cwd, revset, signal);
  if (result.length !== 1 || !/^[k-z]+$/.test(result[0]!)) throw new Blocked(`Expected exactly one change: ${revset}`);
  return result[0]!;
}
export const pathsIn = async (cwd: string, revision: string, signal: AbortSignal) =>
  lines(await run(cwd, `jj --ignore-working-copy diff -r ${quote(revision)} --name-only`, signal));
export async function assertHealthy(cwd: string, workingCopy: string, signal: AbortSignal): Promise<void> {
  if (await oneId(cwd, "@", signal) !== workingCopy) throw new Blocked("Working copy change id moved");
  const log = await run(cwd, "jj --ignore-working-copy log --no-graph -r 'ancestors(@) & mutable()'", signal);
  if (/\(divergent\)|wip\?\?/.test(log) || (await ids(cwd, "ancestors(@) & conflicts()", signal)).length) throw new Blocked("Conflicted/divergent development join");
}
export async function snapshot(cwd: string, signal: AbortSignal): Promise<Tree> {
  const paths = (await run(cwd, "git ls-files --cached --others --exclude-standard -z", signal)).split("\0").filter(Boolean);
  const tree: Tree = {};
  for (const file of paths) {
    signal.throwIfAborted();
    const path = join(cwd, file);
    try {
      const info = await lstat(path), hash = createHash("sha256");
      const mode = info.isSymbolicLink() ? "120000" : info.isFile() ? (info.mode & 0o100 ? "100755" : "100644") : null;
      if (!mode) throw new Blocked(`Unclassifiable tracked file mode: ${file}`);
      if (info.isSymbolicLink()) hash.update(await readlink(path));
      else for await (const chunk of createReadStream(path, { signal })) hash.update(chunk);
      tree[file] = `${mode}:${hash.digest("hex")}`;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return tree;
}
