import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const humanItems = ["pyrite appears online in the UI host list", "a session on pyrite completes a turn", "pyrite returns online automatically after suspend/resume"];

export async function runS8Checks({ contract, tools, types, prompts }) {
  const s = contract.slices[8];
  assert.equal(s.id, 8);
  assert.equal(s.title, "pyrite-host");
  assert.deepEqual(s.allowedPaths, ["modules/clan/inventory/services/omnigent.nix", "modules/clan/services/omnigent/flake-module.nix", "modules/nixos/omnigent-host.nix", "modules/clan/services/omnigent/README.md", contract.plan]);
  assert(s.reviewReads.includes(contract.pyriteResearch));
  assert(prompts.implementationReads("test", s).includes(contract.pyriteResearch));
  for (const item of humanItems) {
    assert(types.checklist.includes(item));
    const responses = types.checklist.map((i) => ({ kind: "human_attested", item: i, response: i === item ? "not tested" : "passed" }));
    assert.equal(types.acceptanceStatus(responses), "incomplete");
  }
  for (const expr of [contract.pyriteInventoryExpr, contract.pyriteUnitExpr, contract.pyritePathExpr, contract.pyriteUserFixtureExpr]) {
    assert(s.gates.some((g) => g.kind === "NixEval" && g.target.expr === expr));
    execFileSync("nix-instantiate", ["--parse", "--expr", expr], { stdio: "pipe" });
  }
  assert(s.gates.some((g) => g.kind === "NixEval" && g.target.expr.endsWith(contract.pyriteLifecycle)));
  for (const gate of s.gates.filter((g) => g.kind === "GrepAssert" && g.file !== contract.plan)) {
    const pattern = new RegExp(gate.pattern, "i");
    assert(pattern.test("user = settings.user;"));
    for (const text of ['user = "cameron";', 'default = "crs58";', '# CAMERON']) assert(!pattern.test(text));
  }
  for (const [item, pattern] of contract.pyriteAmendments) {
    assert(new RegExp(pattern, "i").test(item), item);
    assert(!new RegExp(pattern, "i").test("Pyrite rollout remains deferred."));
  }
  const build = s.gates.filter((g) => g.kind === "NixBuildRemote");
  assert.deepEqual(build, [{ kind: "NixBuildRemote", installable: "__OMNIGENT_SOURCE__#checks.x86_64-linux.nixos-pyrite" }]);
  const source = { source: "git+file:///test?rev=" + "a".repeat(40), primary: "/test" };
  let command;
  assert((await tools.runGate("/test", build[0], new AbortController().signal, async (_cwd, cmd) => {
    command = cmd;
    return { state: "exited", exitCode: 0, stdout: "", stderr: "" };
  }, source)).passed);
  assert(command.includes(source.source) && command.includes("ssh root@magnetite.zt") && !command.includes("root@pyrite"));
  assert(!s.gates.some((g) => g.kind === "Command" && g.argv.join(" ").includes("#checks.x86_64-linux.nixos-pyrite")), "No duplicate closure build");
  execFileSync("bash", ["-n"], { input: contract.pyriteConfigProbe });
  execFileSync("shellcheck", ["--shell=bash", "--exclude=SC2016", "-"], { input: contract.pyriteConfigProbe, stdio: ["pipe", "inherit", "inherit"] });
  execFileSync("nix-instantiate", ["--parse", "--expr", contract.pyriteDeclaredExpr], { stdio: "pipe" });
  console.log("PASS S8 scope, research routing, human attestations, account/amendment mutants, remote build routing, rendered-YAML probe syntax, Nix parse");
}

export async function runS8Empirical({ contract }) {
  const log = (text) => new Promise((resolve, reject) => process.stdout.write(text + "\n", (error) => error ? reject(error) : resolve()));
  const sha = execFileSync("jj", ["--ignore-working-copy", "log", "-r", "omnigent-magnetite", "--no-graph", "-T", "commit_id"], { encoding: "utf8" }).trim();
  const source = { source: `git+file://${process.cwd()}?ref=omnigent-magnetite&rev=${sha}`, primary: process.cwd() };
  const quote = (text) => "'" + text.replaceAll("'", "'\\''") + "'";
  assert.equal(readFileSync(contract.mergeScript, "utf8"), execFileSync("git", ["show", `${sha}:${contract.mergeScript}`], { encoding: "utf8" }), "Scratch merge script must equal the pinned source");
  const run = async (label, argv) => {
    await log(`\n${label}\n$ ${argv.map(quote).join(" ")}`);
    const r = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", timeout: 240_000, maxBuffer: 32 * 1024 * 1024 });
    await log(`stdout:\n${r.stdout ?? ""}\nstderr:\n${r.stderr ?? ""}\nexit=${r.status}; error=${r.error ?? "none"}`);
    return r;
  };
  const pin = (text) => text.replaceAll("__OMNIGENT_SOURCE__", source.source).replaceAll("__OMNIGENT_SANDBOX__", process.cwd()).replaceAll("__OMNIGENT_PRIMARY__", process.cwd());
  const evaluate = (label, expr) => run(label, ["nix", "eval", "--no-write-lock-file", "--json", "--impure", "--expr", pin(expr)]);
  const outcomes = [];
  for (const [i, g] of contract.slices[8].gates.entries()) {
    if (g.kind === "NixEval") {
      const r = await evaluate(`BASELINE gate ${i}: expected ${JSON.stringify(g.expect.value)}`, g.target.expr);
      const passed = r.status === 0 && isDeepStrictEqual(JSON.parse(r.stdout), g.expect.value);
      outcomes.push({ gate: i, passed, exit: r.status });
      await log(`gatePassed=${passed}`);
    } else if (g.kind === "GrepAssert") {
      const r = await run(`BASELINE gate ${i}: /${g.pattern}/i`, ["git", "show", `${sha}:${g.file}`]);
      const passed = r.status === 0 && new RegExp(g.pattern, "i").test(r.stdout);
      outcomes.push({ gate: i, passed, exit: r.status });
      await log(`gatePassed=${passed}`);
    } else if (g.kind === "NixBuildRemote") {
      await log(`NOT BUILT gate ${i}: ${pin(g.installable)} (remote closure build reserved for the workflow controller)`);
      await run("DRVPATH only, not a build", ["nix", "eval", "--raw", pin(g.installable) + ".drvPath"]);
    } else {
      const r = await run(`BASELINE gate ${i}`, g.argv.map(pin));
      outcomes.push({ gate: i, passed: r.status === 0, exit: r.status });
    }
  }
  const f = 'builtins.getFlake "__OMNIGENT_SOURCE__"';
  const intended = `let f = ${f}; g = f.inputs.flake-parts.lib.mkFlake { inputs = f.inputs // { self = f; }; } {
    imports = [ (f.inputs.import-tree (f.outPath + "/modules")) ];
    clan.inventory.instances.omnigent.roles.host.machines.pyrite.settings.environment = {
      PI_ACP_PI_COMMAND = "atomic";
      OMNIGENT_RUNNER_ENV_PASSTHROUGH = "PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR";
    };
  }; in g.nixosConfigurations.pyrite.config`;
  for (const [label, expr, value] of [
    ["inventory intended attrset", contract.pyriteInventoryExpr.replace(`(${f}).clan.inventory.instances.omnigent.roles.host.machines`, "{ magnetite = {}; pyrite = {}; stibnite = {}; }"), ["magnetite", "pyrite", "stibnite"]],
    ["unit via existing NixOS module and scratch inventory membership", contract.pyriteUnitExpr.replace(contract.pyriteConfig, `(${intended})`), true],
  ]) {
    const r = await evaluate(`SCRATCH ${label}`, expr);
    assert.equal(r.status, 0); assert.deepEqual(JSON.parse(r.stdout), value);
  }
  const pathModel = (packages) => contract.pyritePathExpr.replace("d = g.nixosConfigurations.pyrite;", `d = { pkgs = f.nixosConfigurations.pyrite.pkgs; config = {
    services.omnigent-host.extraPackages = [];
    systemd.services.omnigent-host = { path = [ ${packages} ]; environment.PATH = p.lib.makeBinPath [ ${packages} ]; };
  }; };`);
  let r = await evaluate("SCRATCH hermetic PATH intended model, actual store packages", pathModel(contract.pyritePackages));
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout), true);
  for (const missing of contract.pyritePackages.split(" ")) {
    r = await evaluate(`MUTANT PATH omits ${missing}`, pathModel(contract.pyritePackages.split(" ").filter((x) => x !== missing).join(" ")));
    assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout), false);
  }
  const lifecycle = contract.slices[8].gates.find((g) => g.kind === "NixEval" && g.target.expr.endsWith(contract.pyriteLifecycle)).target.expr;
  r = await evaluate("SCRATCH actual reused unit lifecycle", lifecycle.replace(contract.pyriteConfig, `(${intended})`));
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout), true);
  const probe = contract.pyriteConfigProbe.replaceAll(contract.pyriteConfig, `(${intended})`);
  r = await run("SCRATCH actual rendered HM YAML and merge (small artifact build, no machine closure)", ["bash", "-c", pin(probe)]);
  assert.equal(r.status, 0);
  r = await evaluate("FACTS machine check, configured admins, HM harnesses and shared settings", `let f = ${f}; lib = f.inputs.nixpkgs.lib; in {
    checks = builtins.filter (n: builtins.match "nixos-.*" n != null) (builtins.attrNames f.checks.x86_64-linux);
    machines = builtins.listToAttrs (map (name: let c = f.nixosConfigurations.\${name}.config; h = c.home-manager.users.cameron; in { inherit name; value = {
      admins = builtins.attrNames (lib.filterAttrs (u: _: c.users.users.\${u}.isNormalUser && builtins.elem "wheel" c.users.users.\${u}.extraGroups) c.home-manager.users);
      harnesses = map (n: h.programs.\${n}.enable) [ "atomic" "claude-code" "codex" "pi-coding-agent" "omp" "bun" ];
      settings = h.programs.omnigent.settings;
    }; }) [ "magnetite" "pyrite" ]);
    manager = f.nixosConfigurations.pyrite.config.systemd.settings.Manager;
  }`);
  assert.equal(r.status, 0);
  for (const expr of [contract.pyriteInventoryExpr, contract.pyriteUnitExpr, contract.pyritePathExpr]) {
    const index = contract.slices[8].gates.findIndex((g) => g.kind === "NixEval" && g.target.expr === expr);
    assert.equal(outcomes.find((o) => o.gate === index).passed, false);
  }
  await log(`Baseline outcomes: ${JSON.stringify(outcomes)}\nPASS real missing-implementation gates, scratch inventory/module/PATH/lifecycle/rendered YAML, PATH omission mutants. Scratch is not S8 implementation proof. No workflow, deployment, machine closure build, or jj mutation ran.`);
}
