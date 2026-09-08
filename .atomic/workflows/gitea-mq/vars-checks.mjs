import assert from "node:assert/strict";
import { join } from "node:path";

/** Real generateVars controller, closed filesystem/process/VCS observation ports. */
export async function runVarsChecks({ actual, mock, files, cwd, signal, setHandler, varsAllowed }) {
  const original = { ids: mock.ids, oneId: mock.oneId, pathsIn: mock.pathsIn, snapshot: mock.snapshot };
  const app = "gitea-mq-github-app-secret-key/key.pem", webhook = "gitea-mq-github-webhook-secret/secret";
  const envelope = '{"sops":{},"secret":"ENC[operator-supplied]"}';
  const secretFile = join(cwd, varsAllowed[1], "secret/secret");
  for (const path of [join(cwd, varsAllowed[0], "key.pem/secret"), secretFile]) files.set(path, envelope);
  const sha = (digit) => digit.repeat(40);
  const chain = { workingCopy: "wwww", join: "rrrr", seed: "ssss", tip: "ssss", changes: [] };
  async function fixture({ listing = `${app}: ********\n${webhook}: ********`, drift = "", fails = false } = {}) {
    let after = false, lists = 0, generated = 0;
    const start = mock.commands.length;
    mock.oneId = async (_cwd, rev) => {
      if (after && drift === "foreign" && rev.endsWith("+")) throw Error("Foreign sibling makes the global sole-child query ambiguous");
      return rev === "@" ? (after && drift === "identity" ? "xxxx" : "wwww")
        : rev === "@-" || rev.endsWith("+") || rev.includes("+ & ") ? "rrrr"
        : rev === "rollup-landing" && after && drift === "landing" ? "kkkk" : "ssss";
    };
    mock.ids = async (_cwd, rev) => rev === "::rrrr" || rev === "::change_id(rrrr)" ? ["rrrr", "ssss", ...(["foreign-divergent", "foreign-new-divergent"].includes(drift) ? ["kkkk"] : [])]
      : after && ["foreign", "vars", "rewrite"].includes(drift) ? ["wwww", "rrrr", "ssss", "kkkk"] : ["wwww", "rrrr", "ssss"];
    mock.pathsIn = async (_cwd, rev) => {
      assert.equal(rev, sha(drift === "foreign-new-divergent" ? "7" : "4"), "Inspect the exact new commit, not a mutable change id");
      return [drift === "vars" || drift === "rewrite" ? "vars/per-machine/magnetite/another-generator/secret/secret" : "docs/foreign.md"];
    };
    mock.snapshot = async () => after && drift === "foreign" ? { "docs/foreign.md": "100644:new" } : {};
    setHandler((command) => {
      if (command === "git symbolic-ref -q HEAD") return { ...observation(), exitCode: 1 };
      // Old controller commands are supported so regressions fail on behavior, not absent stubs.
      if (command === "git rev-parse HEAD" || command === "git rev-list --all | sort") return observation("unchanged");
      if (command.startsWith("jj --ignore-working-copy log") && command.includes("all()")) {
        const rows = [`ssss ${sha(after && drift === "ancestry" ? "9" : "1")}`, `rrrr ${sha("2")}`, `wwww ${sha(after ? "5" : "3")}`];
        if (after && ["foreign", "vars", "rewrite"].includes(drift)) rows.push(`${drift === "rewrite" ? "ssss" : "kkkk"} ${sha("4")}`);
        if (drift === "foreign-divergent") rows.push(`kkkk ${sha("6")}`, `kkkk ${sha("7")}`);
        if (drift === "foreign-new-divergent") rows.push(`kkkk ${sha("6")}`, ...(after ? [`kkkk ${sha("7")}`] : []));
        if (drift === "protected-divergent") rows.push(`ssss ${sha("8")}`);
        if (drift === "protected-absent") rows.splice(0, 1);
        return observation(rows.join("\n") + "\n");
      }
      if (command.startsWith("jj --ignore-working-copy log") && command.includes("parents.map")) return observation(after && drift === "parentage" ? `${sha("2")},${sha("1")}` : sha("2"));
      if (command === "CLAN_NO_COMMIT=1 clan vars list magnetite") {
        lists++; after = true;
        return observation(generated ? `${app}: ********\n${webhook}: ********` : listing, "vars-list.log");
      }
      if (command.startsWith("CLAN_NO_COMMIT=1 clan vars generate magnetite --generator gitea-mq-github-webhook-secret")) {
        generated++; after = true;
        return { ...observation(), exitCode: fails ? 1 : 0 };
      }
      throw Error(`Unexpected vars command: ${command}`);
    });
    const result = actual.generateVars(cwd, chain, signal);
    return { result, stats: () => ({ lists, generated, commands: mock.commands.slice(start) }) };
  }
  function observation(stdout = "", logPath = "mock.log") {
    return { command: "mock", stdout, stderr: "", exitCode: 0, state: "exited", terminationSignal: null, logPath, tail: "" };
  }
  try {
    let run = await fixture();
    const present = await run.result;
    assert.equal(run.stats().generated, 0, "Existing operator credential must never be regenerated");
    assert.equal(present.generated, false);
    assert.equal(present.webhookSecret.status, "already-present");
    assert.equal(present.webhookSecret.observation.receipt, "vars-list.json");
    assert.equal(present.webhookSecret.observation.value, "already-present");
    assert.equal(files.get(secretFile), envelope);
    assert.equal(present.noCommitEnvironment, "CLAN_NO_COMMIT=1");
    console.log("PASS vars existing: no generation; already-present observable binds the list receipt; operator envelope retained");

    run = await fixture({ drift: "foreign-divergent" });
    const divergent = await run.result;
    assert.deepEqual(divergent.foreignDivergent, [{ changeId: "kkkk", candidates: [sha("6"), sha("7")] }]);
    assert.deepEqual(divergent.topology.before, divergent.topology.after);
    run = await fixture({ drift: "foreign-new-divergent" });
    const newlyDivergent = await run.result;
    assert.deepEqual(newlyDivergent.foreignDivergent, divergent.foreignDivergent);
    assert.deepEqual(newlyDivergent.foreignChanges, [{ changeId: "kkkk", commitId: sha("7"), paths: ["docs/foreign.md"] }]);
    assert.deepEqual(newlyDivergent.topology.before, newlyDivergent.topology.after);
    run = await fixture({ drift: "protected-divergent" });
    await assert.rejects(() => run.result, (error) => /protected.*ssss/i.test(String(error)) && String(error).includes(sha("1")) && String(error).includes(sha("8")));
    run = await fixture({ drift: "protected-absent" });
    await assert.rejects(() => run.result, /protected.*ssss.*candidates: \[\]/i);
    console.log("PASS divergence regressions: foreign ancestor divergence is evidence; protected divergent/absent identities block with candidate commit ids; singleton unchanged");

    run = await fixture({ listing: `${app}: ********\n${webhook}: <not set>` });
    const missing = await run.result;
    assert.equal(run.stats().generated, 1); assert.equal(run.stats().lists, 2);
    assert.equal(missing.generated, true); assert.equal(missing.webhookSecret.status, "generated");
    const commands = run.stats().commands.filter((command) => command.includes("clan "));
    assert(commands[0].includes("vars list")); assert(commands[1].includes("--no-regenerate"));
    assert(!commands.some((command) => /vars (set|get)/.test(command) || command.includes("--generator gitea-mq-github-app-secret-key")));
    console.log("PASS vars missing: explicit <not set> generates webhook only with --no-regenerate, then verifies a fresh listing");

    for (const listing of ["", "garbled output", `${app}: ********`, `${app}: ********\n${webhook} ********`, `${app}: ********\n${webhook}: false`, `${app}: ********\n${webhook}: ********\n${webhook}: <not set>`, `${app}: ********\n${webhook}: <not set>\nunknown`, `${app}: <not set>\n${webhook}: <not set>`]) {
      run = await fixture({ listing });
      await assert.rejects(() => run.result, /[Vv]ars list|App PEM/);
      assert.equal(run.stats().generated, 0);
    }
    console.log("PASS vars parsing: malformed, empty, omitted, ambiguous and duplicate target rows block before generation; absent App PEM blocks");

    run = await fixture({ drift: "foreign" });
    const foreign = await run.result;
    assert.deepEqual(foreign.foreignChanges, [{ changeId: "kkkk", commitId: sha("4"), paths: ["docs/foreign.md"] }]);
    assert.deepEqual(foreign.foreignDrift, ["docs/foreign.md"]);
    assert.deepEqual(foreign.topology.before, foreign.topology.after);
    assert.equal(foreign.topology.after.ancestors.count, 2);
    assert.match(foreign.topology.after.ancestors.sha256, /^[a-f0-9]{64}$/);
    console.log("PASS Clan guard foreign: unrelated new commit and shared-disk drift are recorded without blocking; @ content rewrite is tolerated");

    for (const drift of ["vars", "rewrite", "landing", "identity", "parentage", "ancestry"]) {
      run = await fixture({ drift });
      await assert.rejects(() => run.result, /[Tt]opology|ancestr|rollup-landing|magnetite|identity|parent/);
    }
    run = await fixture({ listing: `${app}: ********\n${webhook}: <not set>`, fails: true });
    await assert.rejects(() => run.result, /exit 1/);
    assert.equal(run.stats().commands.filter((command) => command.includes("all()")).length, 2, "Failed generation must still execute the post-Clan snapshot");
    console.log("PASS Clan guard scoped: new magnetite-vars change, rewritten ancestor, moved landing, changed @ identity/parents/ancestry block; failed Clan still checks topology");
  } finally { Object.assign(mock, original); }
}
