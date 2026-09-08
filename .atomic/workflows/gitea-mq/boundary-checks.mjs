import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { resolve, join } from "node:path";

/** Exercise proposal rejection on the checkout's real filesystem, including APFS aliases. */
export async function runBoundaryChecks({ tools, slices }) {
  const cwd = await fs.realpath(await fs.mkdtemp(resolve(".atomic/workflows/gitea-mq/.boundary-")));
  const signal = new AbortController().signal;
  const tasks = "- [ ] 1.1 G1\n- [ ] 8.2 G2\n- [ ] 2.1 input\n- [ ] 9.1 deploy";
  const human = tools.humanBoxes(tasks);
  try {
    await fs.mkdir(join(cwd, slices.dir), { recursive: true });
    await fs.writeFile(join(cwd, slices.tasks), tasks);
    await fs.writeFile(join(cwd, slices.proposal), "proposal");
    await fs.writeFile(join(cwd, "flake.nix"), "old");
    await fs.symlink(cwd, join(cwd, slices.dir, "parent"));
    await fs.symlink(join(cwd, slices.tasks), join(cwd, slices.dir, "leaf.md"));
    await fs.link(join(cwd, slices.tasks), join(cwd, slices.dir, "hard.md"));
    await fs.link(join(cwd, "flake.nix"), join(cwd, slices.dir, "hard-flake.nix"));
    await fs.link(join(cwd, slices.proposal), join(cwd, slices.dir, "hard-proposal.md"));
    const alias = `${slices.dir}/Tasks.md`;
    const canonical = await fs.lstat(join(cwd, slices.tasks)), aliased = await fs.lstat(join(cwd, alias));
    assert.equal(`${canonical.dev}:${canonical.ino}`, `${aliased.dev}:${aliased.ino}`, "This regression requires the case-insensitive checkout filesystem");
    const valid = { path: "flake.nix", before: "old", after: "new" };
    for (const [name, bad] of [
      ["exact operator G1", { path: slices.tasks, before: tasks, after: tasks.replace("[ ] 1.1", "[x] 1.1") }],
      ["exact operator G2", { path: slices.tasks, before: tasks, after: tasks.replace("[ ] 8.2", "[x] 8.2") }],
      ["duplicate path", { path: "flake.nix", before: "old", after: "bad" }],
      ["case alias operator tick", { path: alias, before: tasks, after: tasks.replace("[ ] 1.1", "[x] 1.1") }],
      ["symlink parent", { path: `${slices.dir}/parent/flake.nix`, before: "old", after: "bad" }],
      ["symlink leaf", { path: `${slices.dir}/leaf.md`, before: tasks, after: "bad" }],
      ["protected hardlink", { path: `${slices.dir}/hard.md`, before: tasks, after: "bad" }],
      ["proposal hardlink", { path: `${slices.dir}/hard-proposal.md`, before: "proposal", after: "bad" }],
      ["duplicate inode", { path: `${slices.dir}/hard-flake.nix`, before: "old", after: "bad" }],
      ["traversal", { path: `${slices.dir}/../tasks.md`, before: null, after: "bad" }],
      ["absolute", { path: join(cwd, slices.tasks), before: tasks, after: "bad" }],
      ["foreign", { path: "foreign.nix", before: null, after: "bad" }],
    ]) {
      await assert.rejects(() => tools.applyStageEdits(cwd, [valid, bad], slices.s1, signal, human), undefined, name);
      assert.equal(await fs.readFile(join(cwd, "flake.nix"), "utf8"), "old", `${name}: earlier valid edit was written`);
      assert.equal(await fs.readFile(join(cwd, slices.tasks), "utf8"), tasks, name);
      assert.equal(await fs.readFile(join(cwd, slices.proposal), "utf8"), "proposal", name);
    }
    await assert.rejects(() => tools.applyStageEdits(cwd, [valid, { path: slices.tasks, before: tasks, after: tasks }, { path: alias, before: tasks, after: tasks }], slices.s1, signal, human));
    for (const paths of [[`${slices.dir}/new.md`, `${slices.dir}/New.md`], [`${slices.dir}/new-parent/a.md`, `${slices.dir}/New-Parent/b.md`]]) {
      await assert.rejects(() => tools.applyStageEdits(cwd, [valid, ...paths.map((path) => ({ path, before: null, after: "new" }))], slices.s1, signal, human));
      assert.equal(await fs.readFile(join(cwd, "flake.nix"), "utf8"), "old");
      for (const path of paths) await assert.rejects(() => fs.lstat(join(cwd, path)), { code: "ENOENT" });
    }
    console.log("PASS R1: real APFS case aliases, protected/duplicate inodes, symlink parent/leaf and path escapes reject before all writes");
    for (const slice of [slices.s1, { ...slices.s1, replan: true }]) {
      for (const after of [
        `- [x] 9.1 invented\n${tasks}`, `${tasks}\n- [ ] 9.1 duplicate`,
        tasks.replace("- [ ] 9.1 deploy", "- [X] 9.1 deploy"),
        tasks.replace("- [ ] 9.1 deploy", "- [ ] 9.x deploy"),
        tasks.replace("9.1 deploy", "9.1 weakened"),
        tasks.replace("- [ ] 9.1 deploy", ""),
      ]) {
        await assert.rejects(() => tools.applyStageEdits(cwd, [valid, { path: slices.tasks, before: tasks, after }], slice, signal, human, slice.replan ?? false));
        assert.equal(await fs.readFile(join(cwd, "flake.nix"), "utf8"), "old");
        assert.equal(await fs.readFile(join(cwd, slices.tasks), "utf8"), tasks);
      }
    }
    const corrupted = tasks.replace("[ ] 1.1", "[x] 1.1");
    await fs.writeFile(join(cwd, slices.tasks), corrupted);
    await assert.rejects(() => tools.applyStageEdits(cwd, [valid, { path: slices.tasks, before: corrupted, after: corrupted.replace("[ ] 2.1", "[x] 2.1") }], slices.s1, signal, human));
    await assert.rejects(() => tools.tick(cwd, ["2.1"], signal, human));
    await assert.rejects(() => tools.resetTasks(cwd, ["2.1"], signal, human));
    assert.equal(await fs.readFile(join(cwd, slices.tasks), "utf8"), corrupted);
    assert.equal(await fs.readFile(join(cwd, "flake.nix"), "utf8"), "old");
    await fs.writeFile(join(cwd, slices.tasks), tasks);
    await tools.applyStageEdits(cwd, [valid, { path: slices.tasks, before: tasks, after: tasks.replace("[ ] 2.1", "[x] 2.1") }], slices.s1, signal, human);
    assert.equal(await fs.readFile(join(cwd, "flake.nix"), "utf8"), "new");
    await fs.writeFile(join(cwd, slices.tasks), `- [x] 9.1 duplicate\n${tasks}`);
    await assert.rejects(() => tools.tick(cwd, ["2.1"], signal, human));
    await assert.rejects(() => tools.resetTasks(cwd, ["2.1"], signal, human));
    assert.throws(() => tools.taskLedger(`- [x] 9.1 duplicate\n${tasks}`));
    assert.throws(() => tools.taskLedger(tasks.replace("[ ] 9.1", "[X] 9.1")));
    console.log("PASS R3: duplicate/malformed/foreign task rows reject in implementation and replan; preflight human baseline is immutable");
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
}
