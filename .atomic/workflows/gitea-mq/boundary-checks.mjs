import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { resolve, join } from "node:path";

/** Exercise proposal rejection on the checkout's real filesystem, including APFS aliases. */
export async function runBoundaryChecks({ tools, slices }) {
  const cwd = await fs.realpath(await fs.mkdtemp(resolve(".atomic/workflows/gitea-mq/.boundary-")));
  const signal = new AbortController().signal;
  const tasks = "- [ ] 1.1 G1\n- [ ] 8.2 G2\n- [ ] 2.1 input\n- [ ] 9.1 deploy";
  const human = tools.humanBoxes(tasks);
  const edit = (path, before, after) => ({ path, baseSha256: before === null ? null : tools.sha256(before), after });
  try {
    await fs.mkdir(join(cwd, slices.dir), { recursive: true });
    for (const [path, text] of [[slices.tasks, tasks], [slices.proposal, "proposal"], [slices.design, "design"], ["flake.nix", "old"]]) await fs.writeFile(join(cwd, path), text);
    await fs.symlink(cwd, join(cwd, slices.dir, "parent"));
    await fs.symlink(join(cwd, slices.tasks), join(cwd, slices.dir, "leaf.md"));
    await fs.link(join(cwd, slices.tasks), join(cwd, slices.dir, "hard.md"));
    await fs.link(join(cwd, "flake.nix"), join(cwd, slices.dir, "hard-flake.nix"));
    await fs.link(join(cwd, slices.proposal), join(cwd, slices.dir, "hard-proposal.md"));
    const alias = `${slices.dir}/Tasks.md`;
    const canonical = await fs.lstat(join(cwd, slices.tasks)), aliased = await fs.lstat(join(cwd, alias));
    assert.equal(`${canonical.dev}:${canonical.ino}`, `${aliased.dev}:${aliased.ino}`, "This regression requires the case-insensitive checkout filesystem");
    const valid = edit("flake.nix", "old", "new");
    for (const [name, bad] of [
      ["exact operator G1", edit(slices.tasks, tasks, tasks.replace("[ ] 1.1", "[x] 1.1"))],
      ["exact operator G2", edit(slices.tasks, tasks, tasks.replace("[ ] 8.2", "[x] 8.2"))],
      ["duplicate path", edit("flake.nix", "old", "bad")],
      ["case alias operator tick", edit(alias, tasks, tasks.replace("[ ] 1.1", "[x] 1.1"))],
      ["non-protected design case alias", edit(`${slices.dir}/Design.md`, "design", "bad")],
      ["symlink parent", edit(`${slices.dir}/parent/flake.nix`, "old", "bad")],
      ["symlink leaf", edit(`${slices.dir}/leaf.md`, tasks, "bad")],
      ["protected hardlink", edit(`${slices.dir}/hard.md`, tasks, "bad")],
      ["proposal hardlink", edit(`${slices.dir}/hard-proposal.md`, "proposal", "bad")],
      ["duplicate inode", edit(`${slices.dir}/hard-flake.nix`, "old", "bad")],
      ["traversal", edit(`${slices.dir}/../tasks.md`, null, "bad")],
      ["absolute", edit(join(cwd, slices.tasks), tasks, "bad")],
      ["foreign", edit("foreign.nix", null, "bad")],
      ["stale hash", edit(slices.design, "stale", "bad")],
    ]) {
      await assert.rejects(() => tools.applyStageEdits(cwd, [valid, bad], slices.s1, signal, human), undefined, name);
      assert.equal(await fs.readFile(join(cwd, "flake.nix"), "utf8"), "old", `${name}: earlier valid edit was written`);
      assert.equal(await fs.readFile(join(cwd, slices.tasks), "utf8"), tasks, name);
      assert.equal(await fs.readFile(join(cwd, slices.design), "utf8"), "design", name);
    }
    await assert.rejects(() => tools.applyStageEdits(cwd, [valid, edit(slices.tasks, tasks, tasks), edit(alias, tasks, tasks)], slices.s1, signal, human));
    for (const paths of [[`${slices.dir}/new.md`, `${slices.dir}/New.md`], [`${slices.dir}/new-parent/a.md`, `${slices.dir}/New-Parent/b.md`]]) {
      await assert.rejects(() => tools.applyStageEdits(cwd, [valid, ...paths.map((path) => edit(path, null, "new"))], slices.s1, signal, human));
      assert.equal(await fs.readFile(join(cwd, "flake.nix"), "utf8"), "old");
      for (const path of paths) await assert.rejects(() => fs.lstat(join(cwd, path)), { code: "ENOENT" });
    }
    console.log("PASS R1: real APFS Tasks.md/Design.md aliases, protected/duplicate inodes, symlink parent/leaf and path escapes reject before all writes");
    for (const replan of [false, true]) for (const after of [
      `- [x] 9.1 invented\n${tasks}`, `${tasks}\n- [ ] 9.1 duplicate`,
      tasks.replace("- [ ] 9.1 deploy", "- [X] 9.1 deploy"), tasks.replace("- [ ] 9.1 deploy", "- [ ] 9.x deploy"),
      tasks.replace("9.1 deploy", "9.1 weakened"), tasks.replace("- [ ] 9.1 deploy", ""),
    ]) {
      await assert.rejects(() => tools.applyStageEdits(cwd, [valid, edit(slices.tasks, tasks, after)], slices.s1, signal, human, replan));
      assert.equal(await fs.readFile(join(cwd, "flake.nix"), "utf8"), "old");
    }
    const corrupted = tasks.replace("[ ] 1.1", "[x] 1.1");
    await fs.writeFile(join(cwd, slices.tasks), corrupted);
    await assert.rejects(() => tools.applyStageEdits(cwd, [valid, edit(slices.tasks, corrupted, corrupted.replace("[ ] 2.1", "[x] 2.1"))], slices.s1, signal, human));
    await assert.rejects(() => tools.tick(cwd, ["2.1"], signal, human));
    await assert.rejects(() => tools.resetTasks(cwd, ["2.1"], signal, human));
    await fs.writeFile(join(cwd, slices.tasks), tasks);
    const created = `${slices.dir}/created.md`;
    await tools.applyStageEdits(cwd, [valid, edit(created, null, "created"), edit(slices.tasks, tasks, tasks.replace("[ ] 2.1", "[x] 2.1"))], slices.s1, signal, human);
    assert.equal(await fs.readFile(join(cwd, "flake.nix"), "utf8"), "new");
    assert.equal(await fs.readFile(join(cwd, created), "utf8"), "created");
    await tools.applyStageEdits(cwd, [edit(created, "created", null)], slices.s1, signal, human);
    await assert.rejects(() => fs.lstat(join(cwd, created)), { code: "ENOENT" });
    console.log("PASS 3.1: controller compares baseSha256 with disk; stale hashes reject atomically, matching hashes/new files/deletions apply");
    await fs.writeFile(join(cwd, slices.tasks), `- [x] 9.1 duplicate\n${tasks}`);
    await assert.rejects(() => tools.tick(cwd, ["2.1"], signal, human));
    await assert.rejects(() => tools.resetTasks(cwd, ["2.1"], signal, human));
    assert.throws(() => tools.taskLedger(tasks.replace("[ ] 9.1", "[X] 9.1")));
    console.log("PASS R3: duplicate/malformed/foreign task rows reject in implementation and replan; stage human baseline is immutable");
    await fs.writeFile(join(cwd, slices.tasks), tasks);
    let baseline = human;
    for (const [gate, id, decision] of [["G1", "1.1", { kind: "operator", reply: { slug: "queue", id: 1234 } }], ["G2", "8.2", { kind: "operator", choice: "approve admin role only" }]]) {
      const receipt = `${slices.dir}/${gate}.json`;
      await fs.writeFile(join(cwd, receipt), JSON.stringify({ kind: "operator", choice: "decline" }));
      await assert.rejects(() => tools.tickOperator(cwd, gate, receipt, baseline, signal));
      await fs.writeFile(join(cwd, receipt), JSON.stringify(decision));
      const result = await tools.tickOperator(cwd, gate, receipt, baseline, signal);
      assert.deepEqual(await tools.tickOperator(cwd, gate, receipt, baseline, signal), result, "Interrupted tick resumes idempotently against the original baseline");
      baseline = result.humanBaseline;
      assert.match(await fs.readFile(join(cwd, slices.tasks), "utf8"), new RegExp(`- \\[x\\] ${id}`));
      await tools.tick(cwd, ["2.1"], signal, baseline);
      await tools.resetTasks(cwd, ["2.1"], signal, baseline);
    }
    console.log("PASS 2.5: real controller G1/G2 ticks require affirmative Operator receipts and refresh baseline for subsequent ticks/resets");
  } finally { await fs.rm(cwd, { recursive: true, force: true }); }
}
