import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { dirname } from "node:path";

export async function runS6Checks({ contract, tools, prompts }) {
  const { slices, s6Agents, s6ServerConfigProbe, s6MergeProbe, requiredOmpBinaryExpr, ompResearch } = contract;
  const gates = slices[6].gates;
  assert.deepEqual(s6Agents, [contract.acpAgent, { name: "Oh My Pi", command: "omp acp", omnigent_mcp: false, inject_system_prompt: false, env_passthrough: [] }]);
  assert.deepEqual(gates[0].expect, { kind: "Equal", value: s6Agents });
  assert.deepEqual(gates[1].expect, gates[0].expect);
  assert(requiredOmpBinaryExpr.includes("extraPackages = [ ]") && requiredOmpBinaryExpr.includes("assert builtins.elem omp c.config.systemd.services.omnigent-host.path"));
  assert(slices[6].reviewReads.includes(ompResearch));
  assert(prompts.implementationReads("runs/test", slices[6]).includes(ompResearch));
  assert.equal(gates.filter((gate) => gate.kind === "GrepAssert" && gate.file === contract.plan).length, 4);
  assert(gates.some((gate) => gate.kind === "NixBuildRemote" && gate.installable === "__OMNIGENT_SOURCE__#checks.x86_64-linux.nixos-magnetite"));
  for (const gate of gates.filter((gate) => gate.kind === "Command")) {
    execFileSync("bash", ["-n"], { input: gate.argv[2] });
    execFileSync("shellcheck", ["--shell=bash", "--exclude=SC2016", "-"], { input: gate.argv[2], stdio: ["pipe", "inherit", "inherit"] });
  }
  assert(s6MergeProbe.includes("host_id: deadbeef") && s6MergeProbe.includes("__OMNIGENT_SANDBOX__/modules/home/ai/omnigent/merge-config.sh"));
  const yqBinary = process.env.OMNIGENT_TEST_YQ ?? globSync("/nix/store/*-yq-go-*/bin/yq").find((path) => spawnSync(path, ["--version"]).status === 0);
  assert(yqBinary, "S6 YAML fixtures require a realized native yq-go; set OMNIGENT_TEST_YQ to its bin/yq");
  const yqStore = dirname(dirname(yqBinary));
  for (const [agents, passes] of [
    [s6Agents, true],
    [[contract.acpAgent], false],
    [[...s6Agents, contract.ompAgent], false],
    [[contract.acpAgent, { ...contract.ompAgent, env_passthrough: ["PI_CODING_AGENT_DIR"] }], false],
    [[contract.acpAgent, { ...contract.ompAgent, command: "omp acp --auto-approve" }], false],
    [[contract.acpAgent, { ...contract.ompAgent, inject_system_prompt: true }], false],
  ]) {
    for (const style of ["flow", "block"]) {
      const prelude = `set -euo pipefail
fixture=$(mktemp -d); trap 'rm -rf "$fixture"' EXIT
printf '%s' '${JSON.stringify({ acp: { agents } })}' | '${yqStore}/bin/yq' -p json -o yaml ${style === "flow" ? "'.. style=\"flow\"'" : "'.'"} > "$fixture/config.yaml"
nix() { if [ "$1" = build ]; then printf '%s' '${yqStore}'; else printf '%s' "$fixture"; fi; }
`;
      const result = spawnSync("bash", ["-c", prelude + s6ServerConfigProbe], { encoding: "utf8" });
      assert.equal(result.status === 0, passes, `${style}: ${JSON.stringify(agents)}: ${result.stderr}`);
    }
  }
  const source = { source: "git+file:///mock?rev=" + "a".repeat(40), sha: "a".repeat(40), primary: "/mock" };
  for (const [agents, passes] of [[s6Agents, true], [[contract.acpAgent], false], [[contract.acpAgent, { ...contract.ompAgent, env_passthrough: ["PI_CODING_AGENT_DIR"] }], false]]) {
    const result = await tools.runGate("/mock", gates[0], AbortSignal.timeout(10_000), async () => ({ state: "exited", exitCode: 0, stdout: JSON.stringify(agents), stderr: "" }), source);
    assert.equal(result.passed, passes);
  }
  console.log("PASS S6 exact ACP expectations, flow/block YAML and unsafe-passthrough/approval mutations, shell probes, required omp fixture, research reads and plan gates");
}

export async function runS6Empirical({ contract, tools }) {
  const cwd = process.cwd();
  const sha = execFileSync("jj", ["--ignore-working-copy", "log", "-r", "omnigent-magnetite", "--no-graph", "-T", "commit_id"], { encoding: "utf8" }).trim();
  const source = { source: `git+file://${cwd}?ref=omnigent-magnetite&rev=${sha}`, sha, primary: cwd };
  console.log(`CHAIN_TIP=${sha}`);
  const observe = async (_cwd, command) => {
    console.log(`$ ${command}`);
    const result = spawnSync("bash", ["-c", command], { cwd, encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
    console.log(`stdout:\n${result.stdout}\nstderr:\n${result.stderr}\nEXIT=${result.status}`);
    if (result.error) throw result.error;
    return { state: "exited", exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  const gates = contract.slices[6].gates;
  for (const index of [0, 1, 2, 4, 7, 8]) {
    console.log(`BASELINE gate ${index}`);
    const result = await tools.runGate(cwd, gates[index], AbortSignal.timeout(180_000), observe, source);
    console.log(`GATE_PASSED=${result.passed}; ${result.detail}`);
    assert.equal(result.passed, false, `S6 gate ${index} must reject the pre-S6 revision`);
  }
  const flake = `builtins.getFlake "${source.source}"`;
  const proposedAgent = ' { name = "Oh My Pi"; command = "omp acp"; omnigent_mcp = false; inject_system_prompt = false; env_passthrough = [ ]; } ';
  const models = [
    [0, { ...gates[0], target: { kind: "Expr", expr: `${contract.s6AgentsExpr} ++ [${proposedAgent}]` } }],
    [4, { ...gates[4], target: { kind: "Expr", expr: contract.requiredOmpBinaryExpr.replace("clan.inventory.instances.omnigent.roles.host.settings.extraPackages = [ ];", "clan.inventory.instances.omnigent.roles.host.settings.extraPackages = [ ];\n  flake.modules.nixos.omnigent-host = { systemd.services.omnigent-host.path = [ f.inputs.llm-agents.packages.x86_64-linux.omp ]; };") } }],
    ...[7, 8].map((index) => [index, { ...gates[index], target: { kind: "Expr", expr: gates[index].target.expr.replace(contract.tileImageExpr, `(${flake}).inputs.nixpkgs.legacyPackages.\${builtins.currentSystem}.fetchurl { url = "${contract.tileUrl}"; hash = "${contract.tileHash}"; }`) } }]),
  ];
  for (const [index, gate] of models) {
    console.log(`SCRATCH_MODEL gate ${index}: append the proposed shared row / required package, or supply the pinned fetchurl; no repository module edits`);
    const result = await tools.runGate(cwd, gate, AbortSignal.timeout(180_000), observe, source);
    console.log(`GATE_PASSED=${result.passed}; ${result.detail}`);
    assert.equal(result.passed, true, `S6 scratch gate ${index} must pass`);
  }
  for (const [index, gate] of gates.entries()) {
    if (gate.kind !== "GrepAssert") continue;
    const text = execFileSync("git", ["show", `${sha}:${gate.file}`], { encoding: "utf8" });
    const passed = new RegExp(gate.pattern, "i").test(text);
    console.log(`BASELINE gate ${index}: git show ${sha}:${gate.file}; RegExp(${JSON.stringify(gate.pattern)}, "i").test(stdout)=${passed}; git EXIT=0`);
  }
  console.log("NOT RUN: runner merge against the primary's files, remote closure build, remote executable probe, or human attestations. All S6 gate contracts follow:");
  for (const [index, gate] of gates.entries()) console.log(`GATE ${index} ${JSON.stringify(gate)}`);
}
