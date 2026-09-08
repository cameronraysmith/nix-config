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
export type Revision = { changeId: string; commitId: string };
/** Explicit set resolution never lets jj's divergent-symbol shorthand throw. */
export function changeRef(id: string): string {
  if (!/^[k-z]+$/.test(id)) throw new Blocked(`Invalid change identity: ${id}`);
  return `change_id(${id})`;
}
/** Bare identities and their common unary forms are accepted at public seams.
 * Compound revsets must interpolate changeRef, never raw change IDs. */
export function identityRevset(revset: string): string {
  if (revset === "rollup-landing") return 'bookmarks(exact:"rollup-landing")';
  return revset.replace(/^(::)?([k-z]+)([-+])?$/, (_match, ancestors: string | undefined, id: string, relation: string | undefined) => `${ancestors ?? ""}${changeRef(id)}${relation ?? ""}`);
}
export const revisionRows = async (cwd: string, revset: string, signal: AbortSignal): Promise<Revision[]> => {
  const output = await run(cwd, `jj --ignore-working-copy log --no-graph -r ${quote(identityRevset(revset))} -T 'change_id ++ " " ++ commit_id ++ "\\n"'`, signal);
  return lines(output).map((line) => {
    const row = /^([k-z]+) ([a-f0-9]{40})$/.exec(line);
    if (!row) throw new Blocked(`Unparseable revision identity: ${line}`);
    return { changeId: row[1]!, commitId: row[2]! };
  });
};
/** Identity failures must not be downgraded to optional-evaluation NotRun. */
export class ProtectedIdentityBlocked extends Blocked {}
export function uniqueProtected(identity: string, candidates: Revision[]): Revision {
  if (candidates.length !== 1) throw new ProtectedIdentityBlocked(`Missing/divergent protected identity: ${identity}; candidates: [${candidates.map((row) => row.commitId).sort().join(", ")}]`);
  return candidates[0]!;
}
export async function oneRevision(cwd: string, revset: string, signal: AbortSignal): Promise<Revision> {
  const selected = uniqueProtected(revset, await revisionRows(cwd, revset, signal));
  // @, a bookmark or a graph intersection can hide a second visible version.
  const current = uniqueProtected(`${revset} (${selected.changeId})`, await revisionRows(cwd, changeRef(selected.changeId), signal));
  if (current.commitId !== selected.commitId) throw new ProtectedIdentityBlocked(`Protected identity changed during resolution: ${revset} (${selected.changeId}); candidates: [${selected.commitId}, ${current.commitId}]`);
  return current;
}
export const ids = async (cwd: string, revset: string, signal: AbortSignal) =>
  (await revisionRows(cwd, revset, signal)).map((row) => row.changeId);
export async function oneId(cwd: string, revset: string, signal: AbortSignal): Promise<string> {
  return (await oneRevision(cwd, revset, signal)).changeId;
}
export const pathsIn = async (cwd: string, revision: string, signal: AbortSignal) => {
  // Exact foreign commit IDs are intentionally not resolved back to a change.
  const commit = /^[a-f0-9]{40}$/.test(revision) ? revision : (await oneRevision(cwd, revision, signal)).commitId;
  return lines(await run(cwd, `jj --ignore-working-copy diff -r ${quote(commit)} --name-only`, signal));
};
export async function assertHealthy(cwd: string, workingCopy: string, signal: AbortSignal): Promise<void> {
  if (await oneId(cwd, "@", signal) !== workingCopy) throw new Blocked("Working copy change id moved");
  const log = await run(cwd, "jj --ignore-working-copy log --no-graph -r 'ancestors(@) & mutable()'", signal);
  // Foreign divergent ancestors are evidence, not a development-join failure.
  if (/wip\?\?/.test(log) || (await ids(cwd, "ancestors(@) & conflicts()", signal)).length) throw new Blocked("Conflicted development join");
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
