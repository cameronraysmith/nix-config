import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";

const humanItems = [
  "stibnite appears online in the UI host list",
  "a session on stibnite completes a turn with a native harness",
  "an acp:atomic or acp:oh-my-pi turn completes on stibnite",
  "stibnite returns online automatically after sleep/network change",
  "stibnite returns online automatically after logout or reboot",
];

export async function runS7Checks({ contract, tools, types, prompts }) {
  const s = contract.slices[7];
  assert.equal(s.id, 7);
  assert.equal(s.title, "darwin-host");
  assert.deepEqual(s.allowedPaths, ["modules/darwin/omnigent-host.nix", "modules/clan/services/omnigent/flake-module.nix", "modules/clan/inventory/services/omnigent.nix", "modules/clan/services/omnigent/README.md", contract.plan]);
  assert(s.reviewReads.includes(contract.darwinResearch));
  assert(prompts.implementationReads("test", s).includes(contract.darwinResearch));
  for (const item of humanItems) {
    assert(types.checklist.includes(item));
    const responses = types.checklist.map((i) => ({ kind: "human_attested", item: i, response: i === item ? "not tested" : "passed" }));
    assert.equal(types.acceptanceStatus(responses), "incomplete");
  }
  for (const expr of [contract.darwinInventoryExpr, contract.darwinAgentExistsExpr, contract.darwinPathExpr, contract.darwinHomeFixtureExpr]) {
    assert(s.gates.some((g) => g.kind === "NixEval" && g.target.expr === expr));
    execFileSync("nix-instantiate", ["--parse", "--expr", expr], { stdio: "pipe" });
  }
  for (const file of s.allowedPaths.slice(0, 2)) {
    const gate = s.gates.find((g) => g.kind === "GrepAssert" && g.file === file);
    assert(gate);
    assert(new RegExp(gate.pattern, "i").test('user = config.system.primaryUser;'));
    for (const text of ['user = "crs58";', '# CrS58\nuser = config.system.primaryUser;']) assert(!new RegExp(gate.pattern, "i").test(text));
  }
  for (const [item, pattern] of contract.darwinAmendments) {
    assert(new RegExp(pattern, "i").test(item), item);
    assert(!new RegExp(pattern, "i").test("Darwin support remains deferred."));
  }
  assert(!s.gates.some((g) => g.kind === "NixBuildRemote"));
  for (const check of ["package-omnigent", "darwin-stibnite"]) {
    const gate = s.gates.find((g) => g.kind === "Command" && g.argv.at(-1) === `__OMNIGENT_SOURCE__#checks.aarch64-darwin.${check}`);
    assert(gate);
    const source = { source: "git+file:///test?rev=" + "a".repeat(40), primary: "/test" };
    let command;
    const result = await tools.runGate("/test", gate, new AbortController().signal, async (_cwd, cmd) => {
      command = cmd;
      return { state: "exited", exitCode: 0, stdout: "", stderr: "" };
    }, source);
    assert(result.passed);
    assert(command.includes(source.source) && !command.includes("ssh"));
    if (check === "darwin-stibnite") {
      assert.deepEqual(gate.argv.slice(0, 3), ["python3", "__OMNIGENT_PRIMARY__/.atomic/workflows/omnigent/darwin-artifacts.py", "__OMNIGENT_SANDBOX__"]);
      assert(command.includes("/test/.atomic/workflows/omnigent/darwin-artifacts.py"));
      const failed = await tools.runGate("/test", gate, new AbortController().signal, async () => ({ state: "exited", exitCode: 1, stdout: "rendered assertion failed", stderr: "" }), source);
      assert(!failed.passed);
    } else assert(command.includes("build"));
  }
  execFileSync("python3", ["-B", ".atomic/workflows/omnigent/darwin-artifacts-checks.py"], { stdio: "inherit" });
  console.log("PASS S7 contract: scope, research routing, human attestations, negative account patterns, amendments, local build commands, Nix parse");
}

export async function runS7Empirical({ contract }) {
  const log = (text) => new Promise((resolve, reject) => process.stdout.write(text + "\n", (error) => error ? reject(error) : resolve()));
  const sha = execFileSync("jj", ["--ignore-working-copy", "log", "-r", "omnigent-magnetite", "--no-graph", "-T", "commit_id"], { encoding: "utf8" }).trim();
  const source = `git+file://${process.cwd()}?ref=omnigent-magnetite&rev=${sha}`;
  const pin = (text) => text.replaceAll("__OMNIGENT_SOURCE__", source);
  const quote = (text) => "'" + text.replaceAll("'", "'\\''") + "'";
  const run = async (label, argv) => {
    await log(`\n${label}\n$ ${argv.map(quote).join(" ")}`);
    const r = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
    await log(`stdout:\n${r.stdout ?? ""}\nstderr:\n${r.stderr ?? ""}\nexit=${r.status}; error=${r.error ?? "none"}`);
    return r;
  };
  const evaluate = (label, expr) => run(label, ["nix", "eval", "--no-write-lock-file", "--json", "--impure", "--expr", pin(expr)]);
  const outcomes = [];
  for (const [i, g] of contract.slices[7].gates.entries()) {
    if (g.kind === "NixEval") {
      const r = await evaluate(`BASELINE gate ${i}: expected ${JSON.stringify(g.expect.value)}`, g.target.expr);
      if (g.target.expr === contract.darwinInventoryExpr) {
        assert.equal(r.status, 0); assert.deepEqual(JSON.parse(r.stdout), ["magnetite"]);
      }
      if ([contract.darwinAgentExistsExpr, contract.darwinPathExpr].includes(g.target.expr)) {
        assert.equal(r.status, 1); assert.match(r.stderr, /attribute 'omnigent-host' missing/);
      }
      const passed = r.status === 0 && isDeepStrictEqual(JSON.parse(r.stdout), g.expect.value);
      outcomes.push({ gate: i, passed, exit: r.status });
      await log(`gatePassed=${passed}`);
    } else if (g.kind === "GrepAssert") {
      const r = await run(`BASELINE gate ${i}: /${g.pattern}/i`, ["git", "show", `${sha}:${g.file}`]);
      const passed = r.status === 0 && new RegExp(g.pattern, "i").test(r.stdout);
      outcomes.push({ gate: i, passed, exit: r.status });
      await log(`gatePassed=${passed}`);
    } else if (g.argv[1] === "build" || g.argv[1].endsWith("/darwin-artifacts.py")) {
      await log(`NOT RUN gate ${i}: ${g.argv.map(pin).map(quote).join(" ")} (no builds authorized in contract authoring)`);
      await run(`DRVPATH substitute for gate ${i}, not a build`, ["nix", "eval", "--raw", pin(g.argv.at(-1)) + ".drvPath"]);
    } else {
      const r = await run(`BASELINE gate ${i}: expected diagnostic ${g.failureDiagnostic}`, g.argv.map(pin));
      const passed = r.status > 0 && `${r.stdout}\n${r.stderr}`.includes(g.failureDiagnostic);
      outcomes.push({ gate: i, passed, exit: r.status });
      await log(`gatePassed=${passed}`);
    }
  }
  const flake = 'builtins.getFlake "__OMNIGENT_SOURCE__"';
  const inventory = contract.darwinInventoryExpr.replace(`(${flake}).clan.inventory.instances.omnigent.roles.host.machines`, '{ magnetite = {}; stibnite = {}; }');
  let r = await evaluate("SCRATCH inventory intended model: same attrNames gate", inventory);
  assert.equal(r.status, 0); assert.deepEqual(JSON.parse(r.stdout), ["magnetite", "stibnite"]);
  const agentModel = '{ services.omnigent-host.user = "fixture-user"; home-manager.users.fixture-user.launchd.agents.omnigent-host = { enable = true; domain = "user"; waitForNixStore = true; }; }';
  const agent = contract.darwinAgentExistsExpr.replace(contract.darwinConfig, agentModel);
  r = await evaluate("SCRATCH agent intended model: same enable/domain/wait predicate", agent);
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout), true);
  const packageList = "r.claude-code r.atomic h.codex h.pi h.omp p.bun p.nodejs_22 p.python3 p.tmux p.git p.uv";
  for (const index of [1, 5, 18, 19, 20, 21, 22]) assert.equal(outcomes.find((o) => o.gate === index).passed, true, `Baseline regression gate ${index}`);
  const pathModel = (packages) => contract.darwinPathExpr.replace("d = g.darwinConfigurations.stibnite;", `d = { pkgs = f.darwinConfigurations.stibnite.pkgs; config = {
    services.omnigent-host = { user = "fixture-user"; extraPackages = []; package = r.omnigent; };
    home-manager.users.fixture-user.launchd.agents.omnigent-host.config = {
      EnvironmentVariables.PATH = p.lib.makeBinPath [ ${packages} ] + ":/usr/bin:/bin:/usr/sbin:/sbin";
      ProgramArguments = [ (p.lib.getExe r.omnigent) "host" "--server" "https://${contract.domain}" ];
    };
  }; };`);
  r = await evaluate("SCRATCH hermetic PATH intended model: actual Darwin store packages, same predicate", pathModel(packageList));
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout), true);
  for (const missing of packageList.split(" ")) {
    r = await evaluate(`MUTANT PATH omits ${missing}`, pathModel(packageList.split(" ").filter((x) => x !== missing).join(" ")));
    assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout), false);
  }
  r = await evaluate("MUTANT agent disabled", agent.replace("enable = true", "enable = false"));
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout), false);
  for (const expr of [contract.darwinInventoryExpr, contract.darwinAgentExistsExpr, contract.darwinPathExpr]) {
    const index = contract.slices[7].gates.findIndex((g) => g.kind === "NixEval" && g.target.expr === expr);
    assert.equal(outcomes.find((o) => o.gate === index).passed, false);
  }
  await log(`\nBaseline outcomes: ${JSON.stringify(outcomes)}\nPASS baseline falsification plus scratch intended models and PATH omission mutants. Scratch attrsets are predicate tests, not an implementation or module-composition proof. No build, workflow, deployment, or jj mutation ran.`);
}
