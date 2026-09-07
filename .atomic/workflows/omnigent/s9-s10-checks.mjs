import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const quote = (text) => "'" + text.replaceAll("'", "'\\''") + "'";
const log = (text) => writeSync(1, text + "\n");

export async function runChecks({ contract, additions, types, tools }) {
  assert.equal(contract.slices[9].title, "upgrade-0-13-0");
  assert.equal(contract.slices[10].title, "acp-runtime-environment");
  for (const item of additions.runtimeHumanItems) {
    assert(types.checklist.includes(item));
    for (const response of ["not tested", "failed"]) {
      assert.equal(types.acceptanceStatus(types.checklist.map((i) => ({ kind: "human_attested", item: i, response: i === item ? response : "passed" }))), "incomplete");
    }
  }
  const rendered = contract.slices[10].gates.find((g) => g.kind === "Command" && g.argv.includes("__OMNIGENT_PRIMARY__/.atomic/workflows/omnigent/darwin-artifacts.py"));
  assert(rendered?.expectExitZero && rendered.argv.includes("--runtime-environment"), "S10 must inspect its rendered Darwin runtime PATH");
  const secondServer = contract.slices[10].gates.find((g) => g.kind === "Command" && g.argv.at(-1) === contract.secondServerExpr);
  assert(secondServer, "S10 must retain the second-server negative fixture");
  assert.deepEqual(secondServer, contract.slices[3].gates.find((g) => g.kind === "Command" && g.argv.at(-1) === contract.secondServerExpr));
  const signal = new AbortController().signal;
  for (const [exitCode, stderr, passed] of [[1, "error: Omnigent requires exactly one server", true], [1, "error: unrelated failure", false], [0, "Omnigent requires exactly one server", false], [1, "error: Omnigent requires exactly one server plus extra text", false]]) {
    const result = await tools.runGate(process.cwd(), secondServer, signal, async (_, command) => ({ state: "exited", exitCode, stdout: "", stderr, command, logPath: "fixture", tail: stderr, terminationSignal: null }), { source: "git+file:///fixture?rev=fixture", sha: "fixture", primary: process.cwd() });
    assert.equal(result.passed, passed);
    log(`SECOND-SERVER exit=${exitCode}, diagnostic=${JSON.stringify(stderr)}, gatePassed=${result.passed}`);
  }
  await assert.rejects(() => tools.runGate(process.cwd(), { ...secondServer, failureDiagnostic: undefined }, signal, async () => { throw new Error("must not execute"); }), /Negative gate requires its exact assertion diagnostic/);
  bashBindingFixtures(additions);
  darwinRuntimePathFixtures(additions);
  for (const slice of contract.slices.slice(9)) {
    assert(slice.reviewReads.length > 0);
    for (const gate of slice.gates) {
      if (gate.kind === "NixEval" && gate.target.kind === "Expr") execFileSync("nix-instantiate", ["--parse", "--expr", gate.target.expr], { stdio: "pipe" });
      if (gate.kind === "Command" && gate.argv[0] === "bash") {
        execFileSync("bash", ["-n"], { input: gate.argv[2] });
        execFileSync("shellcheck", ["--shell=bash", "--exclude=SC2016", "-"], { input: gate.argv[2], stdio: ["pipe", "inherit", "inherit"] });
      }
    }
    assert.deepEqual(slice.gates.filter((g) => g.kind === "NixBuildRemote" && g.installable.includes("#checks.")).map((g) => g.installable), ["__OMNIGENT_SOURCE__#checks.x86_64-linux.nixos-magnetite", "__OMNIGENT_SOURCE__#checks.x86_64-linux.nixos-pyrite"]);
  }
  for (const name of additions.runtimeHosts) {
    for (const expr of [additions.runtimePathExpr(name), additions.direnvTomlExpr(name), additions.direnvHomeExpr(name), additions.runtimeRegressionExpr(name, contract.domain, contract.s6Agents)]) {
      assert(contract.slices[10].gates.some((g) => g.kind === "NixEval" && g.target.expr === expr));
    }
  }
  for (const [, pattern] of additions.upgradeAmendments) {
    assert(new RegExp(pattern, "i").test(readFileSync(contract.plan, "utf8")), pattern);
    assert(!new RegExp(pattern, "i").test("Upgrade done."));
  }
  for (const [item, pattern] of additions.environmentAmendments) {
    assert(new RegExp(pattern, "i").test(item), pattern);
    assert(!new RegExp(pattern, "i").test("Direnv is safe and all runners work."));
  }
  for (const g of contract.slices[10].gates.filter((g) => g.kind === "GrepAssert" && g.file !== contract.plan)) {
    assert(new RegExp(g.pattern, "i").test('userHome = config.users.users.${cfg.user}.home;'));
    assert(!new RegExp(g.pattern, "i").test('userHome = "/home/cameron";'));
  }
  structuralFixtures();
  log("PASS S9/S10 slice identities, scope, platform builds, Nix parsing, shell syntax/ShellCheck, amendments, shared-set mutants and human-attestation discrimination");
}

function darwinRuntimePathFixtures(additions) {
  const names = ["claude-code", "atomic", "codex", "pi", "omp", "bun", "nodejs_22", "python3", "tmux", "git", "uv", "bash", "which", "direnv", "nix"];
  const bins = names.map((name) => `/fixture/${name}/bin`);
  const suffix = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];
  for (const [label, paths, executable, extras, pass] of [
    ["complete ordered runtime PATH", [...bins, ...suffix], "/fixture/omnigent/bin/omnigent", [], true],
    ["missing legacy harness", [...bins.slice(1), ...suffix], "/fixture/omnigent/bin/omnigent", [], false],
    ["missing runtime addition", [...bins.filter((bin) => !bin.includes("/which/")), ...suffix], "/fixture/omnigent/bin/omnigent", [], false],
    ["unreviewed extra PATH entry", [...bins, "/fixture/curl/bin", ...suffix], "/fixture/omnigent/bin/omnigent", [], false],
    ["reordered harness PATH", [...bins].reverse().concat(suffix), "/fixture/omnigent/bin/omnigent", [], false],
    ["missing system suffix", bins, "/fixture/omnigent/bin/omnigent", [], false],
    ["wrong foreground executable", [...bins, ...suffix], "/fixture/wrong/bin/omnigent", [], false],
    ["nonempty extras", [...bins, ...suffix], "/fixture/omnigent/bin/omnigent", ["/fixture/extra"], false],
  ]) {
    const packages = Object.fromEntries(names.map((name) => [name, `/fixture/${name}`]));
    const model = { packages: { "aarch64-darwin": packages }, inputs: { "llm-agents": { packages: { "aarch64-darwin": packages } } } };
    const prefix = `let f = builtins.fromJSON ${JSON.stringify(JSON.stringify(model))};
      p = (builtins.fromJSON ${JSON.stringify(JSON.stringify(packages))}) // { lib = {
        getBin = x: x; getExe = x: x + "/bin/omnigent";
        makeBinPath = xs: builtins.concatStringsSep ":" (map (x: x + "/bin") xs);
        splitString = sep: value: builtins.filter builtins.isString (builtins.split sep value);
      }; };
      c.services.omnigent-host = { extraPackages = builtins.fromJSON ${JSON.stringify(JSON.stringify(extras))}; package = "/fixture/omnigent"; };
      h.launchd.agents.omnigent-host.config.ProgramArguments = [ ${JSON.stringify(executable)} "host" "--server" "https://omni.scientistexperience.net" ];
      path = ${JSON.stringify(paths.join(":"))};`;
    const expr = additions.runtimePathExpr("stibnite").replace(`${additions.runtimeFixture} ${additions.hostBinding("stibnite")}`, prefix);
    const result = spawnSync("nix", ["eval", "--json", "--expr", expr], { encoding: "utf8" });
    log(JSON.stringify({ check: "Darwin runtime PATH", label, command: ["nix", "eval", "--json", "--expr", expr], stdout: result.stdout, stderr: result.stderr, exitCode: result.status, expected: pass }));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout), pass, label);
  }
}

function bashBindingFixtures(additions) {
  for (const [label, mismatch, missing, passed] of [
    ["configured output", false, "", true],
    ["different realized output", true, "", false],
    ["configured output missing sh", false, "sh", false],
    ["configured output missing bash", false, "bash", false],
  ]) {
    const prelude = `set -euo pipefail
fixture=$(mktemp -d); trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/configured/bin" "$fixture/other/bin"
touch "$fixture/configured/bin/sh" "$fixture/configured/bin/bash" "$fixture/other/bin/sh" "$fixture/other/bin/bash"
chmod +x "$fixture"/*/bin/*
${missing ? `rm "$fixture/configured/bin/${missing}"` : ""}
nix() {
  case "$1" in
    eval)
      if [[ "$*" == *--json* ]]; then
        jq -n --arg out "$fixture/configured" '{drv: "/nix/store/fixture-bash.drv", outputName: "out", pathOutput: $out}'
      else
        printf '/nix/store/fixture-bash.drv\\n'
      fi ;;
    build) printf '%s\\n' "$fixture/${mismatch ? "other" : "configured"}" ;;
    *) return 2 ;;
  esac
}
`;
    execFileSync("shellcheck", ["--shell=bash", "--exclude=SC2016", "-"], { input: prelude, stdio: ["pipe", "inherit", "inherit"] });
    const result = spawnSync("bash", ["-c", prelude + additions.bashProbe("aarch64-darwin")], { encoding: "utf8", env: { ...process.env, BASH_ENV: "/dev/null" } });
    log(`BASH-BINDING ${label}: exit=${result.status}, expectedPass=${passed}\n${result.stdout}${result.stderr}`);
    assert.equal(result.status === 0, passed, label);
  }
}

function structuralFixtures() {
  const common = ["inputs.self.packages.${system}.claude-code", "inputs.self.packages.${system}.atomic", ...["codex", "pi", "omp"].map((p) => `inputs.llm-agents.packages.\${system}.${p}`), ...["bun", "nodejs_22", "python3", "tmux", "git", "uv", "bash", "which", "direnv", "nix"].map((p) => `pkgs.${p}`)].join(" ");
  const shared = `flake.lib.omnigentRuntimePackages = pkgs: [ ${common} ] ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.bubblewrap ];`;
  const linux = "path = (inputs.self.lib.omnigentRuntimePackages pkgs) ++ cfg.extraPackages;";
  const darwin = 'explicitPath = lib.makeBinPath ((inputs.self.lib.omnigentRuntimePackages pkgs) ++ cfg.extraPackages) + ":/usr/bin:/bin:/usr/sbin:/sbin";';
  for (const [label, s, n, d, pass] of [
    ["shared intended shape", shared, linux, darwin, true],
    ["missing which", shared.replace("pkgs.which", ""), linux, darwin, false],
    ["unreviewed curl", shared.replace("pkgs.which", "pkgs.which pkgs.curl"), linux, darwin, false],
    ["bubblewrap not Linux-only", shared.replace("pkgs.stdenv.hostPlatform.isLinux", "true"), linux, darwin, false],
    ["duplicated Linux list", shared, "path = [ pkgs.bash ] ++ cfg.extraPackages;", darwin, false],
    ["missing Darwin suffix", shared, linux, darwin.replace(":/usr/bin:/bin:/usr/sbin:/sbin", ""), false],
  ]) {
    const input = JSON.stringify({ "modules/home/ai/omnigent/runtime-packages.nix": s, "modules/nixos/omnigent-host.nix": n, "modules/darwin/omnigent-host.nix": d });
    const script = `import json, runpy, sys\nfiles=json.loads(sys.stdin.read())\nclass Root:\n def __truediv__(self, key):\n  class File:\n   def read_text(self): return files[key]\n  return File()\nrunpy.run_path('.atomic/workflows/omnigent/runtime-contract-checks.py')['check'](Root())`;
    const r = spawnSync("python3", ["-c", script], { input, encoding: "utf8" });
    assert.equal(r.status === 0, pass, `${label}: ${r.stderr}`);
    log(`STRUCTURAL ${label}: exit=${r.status}, expectedPass=${pass}`);
  }
}

export async function runBindingEmpirical({ contract, additions, tools }) {
  const cwd = process.cwd();
  const sha = process.env.OMNIGENT_S10_SHA;
  assert.match(sha ?? "", /^[0-9a-f]{40}$/, "Set OMNIGENT_S10_SHA to the resolved S10 delivery commit");
  const source = `git+file://${cwd}?ref=omnigent-magnetite&rev=${sha}`;
  const signal = new AbortController().signal;
  const execute = async (directory, command) => {
    log(`cwd=${directory}\n$ ${command}`);
    const r = spawnSync("bash", ["-c", command], { cwd: directory, encoding: "utf8", timeout: 3_600_000, maxBuffer: 32 * 1024 * 1024 });
    log(`stdout:\n${r.stdout ?? ""}\nstderr:\n${r.stderr ?? ""}\nexit=${r.status}; error=${r.error ?? "none"}`);
    assert.equal(r.error, undefined);
    return { state: "exited", exitCode: r.status, stdout: r.stdout, stderr: r.stderr, command, logPath: "empirical-stdout", tail: "", terminationSignal: null };
  };
  log(`Pinned S10 configured-Bash evidence: ${source}`);
  const result = await tools.runGateSandbox(cwd, contract.slices[10].gates, { source, sha }, signal, execute);
  for (const [index, observation] of result.observations.entries()) log(`S10 gate ${index}: ${JSON.stringify(observation)}`);
  assert(result.passed, "Every S10 gate must pass at the pinned delivery commit");
  for (const system of ["x86_64-linux", "aarch64-darwin"]) {
    const gate = { kind: "Command", argv: ["bash", "-c", additions.bashProbe(system).replaceAll("b = p.lib.getBin p.bash;", "b = p.lib.getBin p.which;")], expectExitZero: true, expectStdoutIncludes: ["bash-and-sh-ok"] };
    const rejected = await tools.runGate(cwd, gate, signal, execute, { source, sha, primary: cwd });
    log(`BASH-LESS MUTANT ${system}: gatePassed=${rejected.passed}; exit=${rejected.receipt.exitCode}`);
    assert.equal(rejected.passed, false);
    assert(rejected.receipt.exitCode > 0);
  }
  log(`PASS all ${result.observations.length} S10 gates and both realized bash-less mutants; no workflow, deployment or jj mutation executed.`);
}

export async function runReviewEmpirical({ contract, additions, tools, types }) {
  const cwd = process.cwd();
  const sha = execFileSync("jj", ["--ignore-working-copy", "log", "-r", "omnigent-magnetite", "--no-graph", "-T", "commit_id"], { encoding: "utf8" }).trim();
  const source = `git+file://${cwd}?ref=omnigent-magnetite&rev=${sha}`;
  const signal = new AbortController().signal;
  const execute = async (_, command) => {
    log(`$ ${command}`);
    const started = Date.now();
    const r = spawnSync("bash", ["-c", command], { cwd, encoding: "utf8", timeout: 3_600_000, maxBuffer: 32 * 1024 * 1024 });
    log(`stdout:\n${r.stdout ?? ""}\nstderr:\n${r.stderr ?? ""}\nexit=${r.status}; wallSeconds=${(Date.now() - started) / 1000}; error=${r.error ?? "none"}`);
    assert.equal(r.error, undefined);
    return { state: "exited", exitCode: r.status, stdout: r.stdout, stderr: r.stderr, command, logPath: "empirical-stdout", tail: "", terminationSignal: null };
  };
  log(`Pinned S10 review evidence: ${source}`);
  for (const item of additions.runtimeHumanItems) {
    const count = types.checklist.filter((entry) => entry === item).length;
    assert.equal(count, 1);
    assert(!contract.slices[10].acceptance.includes(item));
    log(`HUMAN-ONLY count=${count}: ${item}`);
  }
  const gates = contract.slices[10].gates;
  const rendered = gates.find((g) => g.kind === "Command" && g.argv.includes("--runtime-environment"));
  const secondServer = gates.find((g) => g.kind === "Command" && g.argv.at(-1) === contract.secondServerExpr);
  for (const [label, gate] of [["rendered Darwin artifacts", rendered], ["second server", secondServer]]) {
    assert(gate);
    const result = await tools.runGate(cwd, gate, signal, execute, { source, sha, primary: cwd });
    log(`${label}: gatePassed=${result.passed}; exit=${result.receipt.exitCode}`);
    assert(result.passed);
  }
  const unrelated = { ...secondServer, argv: [...secondServer.argv.slice(0, -1), 'builtins.throw "unrelated evaluation failure"'] };
  const rejected = await tools.runGate(cwd, unrelated, signal, execute, { source, sha, primary: cwd });
  assert.equal(rejected.passed, false);
  assert(rejected.receipt.exitCode > 0);
  log(`UNRELATED FAILURE: nonzero-only would pass; exact-diagnostic gatePassed=${rejected.passed}`);
  await assert.rejects(() => tools.runGate(cwd, { ...secondServer, failureDiagnostic: undefined }, signal, execute, { source, sha, primary: cwd }), /Negative gate requires its exact assertion diagnostic/);
  log("NONZERO-ONLY GATE: rejected before command execution (missing exact diagnostic)");
}

export async function runEmpirical({ contract, additions, tools }) {
  const cwd = process.cwd();
  const sha = execFileSync("jj", ["--ignore-working-copy", "log", "-r", "omnigent-magnetite", "--no-graph", "-T", "commit_id"], { encoding: "utf8" }).trim();
  const tip = `git+file://${cwd}?ref=omnigent-magnetite&rev=${sha}`;
  const workingTree = `path:${cwd}`;
  log(`S9 dirty tree input: ${workingTree}\nS10 immutable tip: ${tip}`);
  const pin = (text, source) => text.replaceAll("__OMNIGENT_SOURCE__", source).replaceAll("__OMNIGENT_PRIMARY__", cwd).replaceAll("__OMNIGENT_SANDBOX__", cwd);
  const run = (label, argv) => {
    log(`\n${label}\n$ ${argv.map(quote).join(" ")}`);
    const r = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", timeout: 600_000, maxBuffer: 32 * 1024 * 1024 });
    log(`stdout:\n${r.stdout ?? ""}\nstderr:\n${r.stderr ?? ""}\nexit=${r.status}; error=${r.error ?? "none"}`);
    return r;
  };
  const snapshot = run("Capture dirty path: tree once; reuse its immutable store snapshot", ["nix", "eval", "--impure", "--raw", "--expr", `(builtins.getFlake "${workingTree}").outPath`]);
  assert.equal(snapshot.status, 0);
  const dirty = `path:${snapshot.stdout.trim()}`;
  log(`S9 dirty-tree snapshot: ${dirty}`);
  const evaluate = (label, expr, source = tip) => run(label, ["nix", "eval", "--no-write-lock-file", "--json", "--impure", "--expr", pin(expr, source)]);
  const results = [];
  const only = process.argv.find((arg) => arg.startsWith("--only-slice="))?.slice("--only-slice=".length);
  const bashProbesOnly = only === "10-bash";
  for (const slice of contract.slices.slice(9)) {
    if (only && String(slice.id) !== only && !(bashProbesOnly && slice.id === 10)) { log(`SKIPPED S${slice.id} baseline gates in this run (--only-slice=${only})`); continue; }
    const source = slice.id === 9 ? dirty : tip;
    for (const [i, gate] of slice.gates.entries()) {
      if (bashProbesOnly && !(gate.kind === "Command" && gate.argv[2]?.includes("bash-and-sh-ok"))) continue;
      const label = `S${slice.id} gate ${i} ${gate.kind}`;
      const closure = gate.kind === "NixBuildRemote" && gate.installable.includes("#checks.") ? gate.installable : gate.kind === "Command" && gate.argv.some((s) => s.includes("#checks.aarch64-darwin.darwin-stibnite")) ? gate.argv.at(-1) : null;
      if (closure) {
        const r = run(`${label}: DRVPATH ONLY; closure NOT built`, ["nix", "eval", "--raw", pin(closure, source) + ".drvPath"]);
        results.push({ slice: slice.id, gate: i, drvPathExit: r.status, built: false });
        continue;
      }
      if (gate.kind === "GrepAssert") {
        const read = slice.id === 9 ? `readFileSync(${JSON.stringify(gate.file)}, "utf8")` : `execFileSync("git", ["show", ${JSON.stringify(`${sha}:${gate.file}`)}], { encoding: "utf8" })`;
        const script = `import { readFileSync } from "node:fs"; import { execFileSync } from "node:child_process"; const passed = new RegExp(${JSON.stringify(gate.pattern)}, "i").test(${read}); console.log(JSON.stringify({passed})); process.exitCode = passed ? 0 : 1;`;
        const r = run(label, ["node", "--input-type=module", "-e", script]);
        const passed = r.status === 0;
        log(`gatePassed=${passed}`);
        results.push({ slice: slice.id, gate: i, passed, exit: r.status });
        continue;
      }
      const outcome = await tools.runGate(cwd, gate, new AbortController().signal, async (_cwd, command) => {
        const r = run(label, ["bash", "-c", command]);
        return { state: "exited", exitCode: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "", command, logPath: "empirical-stdout", tail: "", terminationSignal: null };
      }, { source, sha, primary: cwd });
      log(`gatePassed=${outcome.passed}`);
      results.push({ slice: slice.id, gate: i, passed: outcome.passed, exit: outcome.receipt?.exitCode });
    }
  }
  log(`BASELINE RESULTS ${JSON.stringify(results)}`);
  assert(results.filter((r) => r.slice === 9 && "passed" in r).every((r) => r.passed), "Every executed S9 gate must pass the dirty tree");
  if (only === "9") return log("S9-only empirical run complete; no S10 red/green comparison in this run.");
  if (bashProbesOnly) { assert(results.every((r) => r.passed)); return log("Bash/sh realization probes pass on both platforms against the tip; they are platform facts, not S10 implementation proof."); }
  for (const name of additions.runtimeHosts) {
    for (const expr of [additions.runtimePathExpr(name), additions.direnvTomlExpr(name)]) {
      const i = contract.slices[10].gates.findIndex((g) => g.kind === "NixEval" && g.target.expr === expr);
      assert.equal(results.find((r) => r.slice === 10 && r.gate === i).passed, false);
    }
  }
  const model = (expr, packages = "pkgs.bash pkgs.which pkgs.direnv pkgs.nix", prefix = '"${config.home.homeDirectory}/projects"') => expr.replace(
    "clan.inventory.instances.omnigent.roles.host.settings.extraPackages = [ ];",
    `clan.inventory.instances.omnigent.roles.host.settings.extraPackages = [ ];
    flake.modules.homeManager.ai = { config, lib, osConfig ? null, ... }: {
      programs.direnv.config.whitelist.prefix = lib.mkIf (osConfig != null && (osConfig.services.omnigent-host.enable or false) && osConfig.services.omnigent-host.user == config.home.username) [ ${prefix} ];
    };
    flake.modules.nixos.omnigent-host = { config, lib, pkgs, ... }: {
      config = lib.mkIf config.services.omnigent-host.enable { systemd.services.omnigent-host.path = [ ${packages} ]; };
    };
    flake.modules.darwin.omnigent-host = { config, lib, pkgs, ... }: let cfg = config.services.omnigent-host;
      original = f.darwinConfigurations.stibnite.config.home-manager.users.\${cfg.user}.launchd.agents.omnigent-host.config.EnvironmentVariables.PATH;
    in { config = lib.mkIf cfg.enable {
      home-manager.users.\${cfg.user}.launchd.agents.omnigent-host.config.EnvironmentVariables.PATH = lib.mkForce (lib.makeBinPath [ ${packages} ] + ":" + original);
    }; };`
  );
  const recursion = evaluate("NEGATIVE: whitelist defined under home-manager.users.\${cfg.user} in the NixOS module recurses", additions.direnvTomlExpr("magnetite").replace(
    "clan.inventory.instances.omnigent.roles.host.settings.extraPackages = [ ];",
    `clan.inventory.instances.omnigent.roles.host.settings.extraPackages = [ ];
    flake.modules.nixos.omnigent-host = { config, lib, ... }: let cfg = config.services.omnigent-host; in {
      config = lib.mkIf cfg.enable { home-manager.users.\${cfg.user}.programs.direnv.config.whitelist.prefix = [ "\${config.users.users.\${cfg.user}.home}/projects" ]; };
    };`));
  assert.notEqual(recursion.status, 0); assert.match(recursion.stderr, /infinite recursion/);
  for (const name of additions.runtimeHosts) {
    for (const [label, expr] of [["PATH", additions.runtimePathExpr(name)], ["rendered TOML", additions.direnvTomlExpr(name)], ["changed-home TOML", additions.direnvHomeExpr(name)], ["regression", additions.runtimeRegressionExpr(name, contract.domain, contract.s6Agents)]]) {
      const r = evaluate(`SCRATCH ${name} ${label}`, model(expr));
      assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout), true);
    }
    for (const missing of ["bash", "which", "direnv", "nix"]) {
      const r = evaluate(`MUTANT ${name} omits ${missing}`, model(additions.runtimePathExpr(name), ["bash", "which", "direnv", "nix"].filter((x) => x !== missing).map((x) => "pkgs." + x).join(" ")));
      assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout), false);
    }
    const wrong = evaluate(`MUTANT ${name} wrong whitelist home`, model(additions.direnvTomlExpr(name), undefined, '"/wrong/projects"'));
    assert.equal(wrong.status, 0); assert.equal(JSON.parse(wrong.stdout), false);
  }
  const old = run("S9 MUTANT version gate against 0.12.0 tip", ["nix", "eval", "--json", tip + "#packages.aarch64-darwin.omnigent.version"]);
  assert.equal(old.status, 0); assert(!isDeepStrictEqual(JSON.parse(old.stdout), "0.13.0"));
  structuralFixtures();
  log("PASS empirical S9 dirty-tree gates, S10 missing-implementation red gates, real module/rendered-TOML scratch green, per-package and wrong-home mutants; no workflow, deployment, machine-closure build or jj mutation executed.");
}
