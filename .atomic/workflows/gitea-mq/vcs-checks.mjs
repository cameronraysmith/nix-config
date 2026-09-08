import assert from "node:assert/strict";

/** Real VCS resolvers; only the bounded process port is replaced. */
export async function runVcsChecks({ vcs, actual, mock, signal, setHandler }) {
  const sha = (digit) => digit.repeat(40);
  let divergent = false, absent = false;
  const start = mock.commands.length;
  setHandler((command) => {
    if (command.includes(" diff ")) return observed("docs/foreign.md");
    if (command.includes("'ancestors(@) & mutable()'")) return observed("kkkk (divergent) foreign ancestor");
    if (command.includes("'ancestors(@) & conflicts()'")) return observed("");
    const rev = /-r '([^']+)'/.exec(command)?.[1];
    if (rev === "change_id(kkkk)") return observed(`kkkk ${sha("6")}\nkkkk ${sha("7")}`);
    if (rev === 'bookmarks(exact:"rollup-landing")') return observed(absent ? "" : `ssss ${sha("1")}`);
    if (["@", "change_id(rrrr)-", "change_id(rrrr)+ & change_id(ssss)"].includes(rev)) return observed(`ssss ${sha("1")}`);
    if (rev === "change_id(ssss)") return observed(absent ? "" : `ssss ${sha("1")}${divergent ? `\nssss ${sha("2")}` : ""}`);
    throw Error(`Unexpected/unsafe revision command: ${command}`);
  });
  function observed(stdout) { return { command: "mock", stdout, stderr: "", exitCode: 0, state: "exited", terminationSignal: null, logPath: "mock.log", tail: "" }; }
  assert.deepEqual(await vcs.ids("/mock", "kkkk", signal), ["kkkk", "kkkk"], "Foreign multi-revision sets remain explicit");
  assert.equal(await vcs.oneId("/mock", "ssss", signal), "ssss");
  assert.equal(await vcs.oneId("/mock", "rrrr-", signal), "ssss");
  assert.equal(await vcs.oneId("/mock", `${vcs.changeRef("rrrr")}+ & ${vcs.changeRef("ssss")}`, signal), "ssss");
  await vcs.assertHealthy("/mock", "ssss", signal);
  divergent = true;
  for (const revision of ["ssss", "@", "rollup-landing", "rrrr-"]) {
    await assert.rejects(() => vcs.oneId("/mock", revision, signal), (error) => /protected identity/.test(String(error)) && String(error).includes("ssss") && String(error).includes(sha("1")) && String(error).includes(sha("2")));
  }
  const beforePaths = mock.commands.length;
  assert.deepEqual(await vcs.pathsIn("/mock", sha("6"), signal), ["docs/foreign.md"]);
  assert.equal(mock.commands.length - beforePaths, 1, "Foreign commit diff must not resolve a divergent change");
  for (const resolve of [() => actual.resolveSource("/mock", "ssss", "rollup-landing", signal), () => actual.forgeBaseline("/mock", true, signal), () => actual.committedForgePre("/mock", "ssss", [], signal)]) {
    await assert.rejects(resolve, /protected identity.*ssss/);
  }
  divergent = false; absent = true;
  await assert.rejects(() => vcs.oneId("/mock", "ssss", signal), /protected identity: ssss; candidates: \[\]/);
  await assert.rejects(() => vcs.oneId("/mock", "rollup-landing", signal), /protected identity: rollup-landing; candidates: \[\]/);
  assert(!mock.commands.slice(start).some((command) => /-r '(?:ssss|kkkk|rrrr[-+])'/.test(command)));
  console.log("PASS VCS identity resolution: change_id sets, singleton unchanged, protected alias divergence/absence names candidates, foreign divergence does not poison health or exact-commit diffs");
}
