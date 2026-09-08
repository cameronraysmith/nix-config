import { lstat, realpath, readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join, dirname, posix } from "node:path";
import { Blocked, within } from "../bump/types.js";
import { tasks, proposal, type Slice } from "./slices.js";
import type { ProposedEdit } from "./types.js";

/** Task rows have unique canonical numeric IDs; unrecognized checkbox rows are never ignored. */
export function taskLedger(text: string): ReadonlyMap<string, string> {
  const rows = new Map<string, string>();
  for (const row of text.split("\n")) {
    if (!/^\s*(?:[-*+]\s*\[|[-*+]\s+\d+\.)/.test(row)) continue;
    const match = /^- \[[ x]\] ([1-9]\d*\.[1-9]\d*) (\S.*)$/.exec(row);
    if (!match) throw new Blocked(`Malformed task row: ${row}`);
    const id = match[1];
    if (rows.has(id)) throw new Blocked(`Duplicate task id: ${id}`);
    rows.set(id, row);
  }
  return rows;
}
export const humanBoxes = (text: string) => [...taskLedger(text)]
  .filter(([id]) => id === "1.1" || id === "8.2").map(([, row]) => row).join("\n");
export function assertHumanBoxes(baseline: string, after: string): void {
  const initial = taskLedger(baseline), current = taskLedger(after);
  for (const id of ["1.1", "8.2"]) {
    if (!initial.has(id) || initial.get(id) !== current.get(id)) throw new Blocked(`Operator-owned task ${id} changed from preflight baseline`);
  }
}
export function assertTaskScope(before: string, after: string, allowed: readonly string[], replan = false): void {
  const initial = taskLedger(before), current = taskLedger(after);
  if (initial.size !== current.size || [...current.keys()].some((id) => !initial.has(id))) throw new Blocked("Task id set changed");
  for (const [id, row] of initial) {
    const next = current.get(id)!;
    if (!allowed.includes(id) && row !== next) throw new Blocked(`Stage changed foreign task: ${id}`);
    if (replan && row[3] !== next[3]) throw new Blocked(`Replan changed task state: ${id}`);
  }
}

type PathIdentity = { path: string; inode: string | null };
/** Resolve every existing component before applying spelling, ownership or duplicate checks. */
async function identify(cwd: string, path: string): Promise<PathIdentity> {
  if (posix.normalize(path) !== path || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => ["", ".", "..", ".git", ".jj"].includes(part))) throw new Blocked(`Noncanonical proposed path: ${path}`);
  let component = cwd, inode: string | null = null;
  for (const segment of path.split("/")) {
    component = join(component, segment);
    try {
      const stat = await lstat(component);
      if (stat.isSymbolicLink()) throw new Blocked(`Symlink in proposed path: ${path}`);
      if (await realpath(component) !== component) throw new Blocked(`Filesystem spelling alias: ${path}`);
      if (!stat.isDirectory() && component !== join(cwd, path)) throw new Blocked(`Non-directory parent: ${path}`);
      if (component === join(cwd, path) && !stat.isFile()) throw new Blocked(`Not a regular proposal file: ${path}`);
      inode = `${stat.dev}:${stat.ino}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      inode = null;
    }
  }
  return { path, inode };
}

/** No writes occur until the entire proposal passes filesystem identity and task-ledger checks. */
export async function applyStageEdits(cwd: string, edits: readonly ProposedEdit[], slice: Slice, signal: AbortSignal, humanBaseline: string, replan = false) {
  cwd = await realpath(cwd);
  const protectedPaths = await Promise.all([tasks, proposal].map((path) => identify(cwd, path)));
  const identities: PathIdentity[] = [];
  for (const edit of edits) { signal.throwIfAborted(); identities.push(await identify(cwd, edit.path)); }
  const spellings = new Map<string, string>();
  for (const { path } of identities) {
    const parts = path.split("/");
    for (let length = 1; length <= parts.length; length++) {
      const prefix = parts.slice(0, length).join("/");
      const folded = prefix.normalize("NFC").toUpperCase().toLowerCase();
      const spelling = spellings.get(folded);
      if (spelling !== undefined && spelling !== prefix) throw new Blocked(`Proposal component spelling alias: ${prefix}`);
      spellings.set(folded, prefix);
    }
    if (identities.some((other) => other.path !== path && other.path.startsWith(`${path}/`))) throw new Blocked(`Proposal file is another proposal's parent: ${path}`);
  }
  const seenPaths = new Set<string>(), seenInodes = new Set<string>();
  for (const identity of identities) {
    if (seenPaths.has(identity.path) || identity.inode !== null && seenInodes.has(identity.inode)) throw new Blocked(`Duplicate proposal identity: ${identity.path}`);
    if (protectedPaths.some((protectedPath) => identity.inode !== null && identity.inode === protectedPath.inode && identity.path !== protectedPath.path)) throw new Blocked(`Protected file alias: ${identity.path}`);
    if (!slice.allowedPaths.some((prefix) => within(identity.path, prefix))) throw new Blocked(`Proposed path outside allowlist: ${identity.path}`);
    seenPaths.add(identity.path);
    if (identity.inode !== null) seenInodes.add(identity.inode);
  }
  assertHumanBoxes(humanBaseline, await readFile(join(cwd, tasks), "utf8"));
  for (const edit of edits) {
    let current: string | null = null;
    try { current = await readFile(join(cwd, edit.path), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (current !== edit.before) throw new Blocked(`Proposed edit baseline changed: ${edit.path}`);
    if (edit.path === tasks) {
      assertHumanBoxes(humanBaseline, edit.after ?? "");
      assertTaskScope(current ?? "", edit.after ?? "", slice.taskIds, replan);
    }
  }
  signal.throwIfAborted();
  for (const edit of edits) {
    if (edit.before === edit.after) continue;
    if (edit.after === null) await unlink(join(cwd, edit.path));
    else { await mkdir(dirname(join(cwd, edit.path)), { recursive: true }); await writeFile(join(cwd, edit.path), edit.after); }
  }
  return { applied: edits.filter((edit) => edit.before !== edit.after).map((edit) => edit.path) };
}
