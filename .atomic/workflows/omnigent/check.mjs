import assert from "node:assert/strict";
import { readFileSync, realpathSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { homedir } from "node:os";

import { runExecutionChecks } from "./execution-checks.mjs";
const require = createRequire(import.meta.url);
const atomicExecutable = realpathSync(execFileSync("bash", ["-c", "command -v atomic"], { encoding: "utf8" }).trim());
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const atomic = positional[1] ?? resolve(dirname(atomicExecutable), "../lib/node_modules/@bastani/atomic");
const compiler = positional[0] ?? execFileSync("bash", ["-c", "printf '%s\\n' /nix/store/*typescript*/lib/node_modules/typescript/lib/typescript.js | head -1"], { encoding: "utf8" }).trim();
assert(existsSync(compiler) && existsSync(atomic), "Pass TypeScript compiler and installed Atomic package paths");
const ts = require(compiler);
const entry = ".atomic/workflows/deploy-omnigent.ts";
const files = [entry, ...["types", "tools", "slices", "prompts", "deployment", "s9-s10"].map((name) => `.atomic/workflows/omnigent/${name}.ts`)];
const options = {
  noEmit: true, strict: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022, skipLibCheck: true,
  typeRoots: [resolve(atomic, "node_modules/@types")], types: ["node"],
  paths: {
    "@bastani/atomic/workflows": [resolve(atomic, "dist/builtin/workflows/src/authoring.d.ts")],
    typebox: [resolve(atomic, "node_modules/typebox/build/index.d.mts")],
    "typebox/value": [resolve(atomic, "node_modules/typebox/build/value/index.d.mts")],
  },
};
const format = (diagnostics) => ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" });
const program = ts.createProgram(files, options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) { console.error(format(diagnostics)); process.exit(1); }
console.log(`PASS strict typecheck: ${compiler}; installed Atomic declarations: ${atomic}`);
if (process.argv.includes("--typecheck-only")) process.exit(0);
const fixture = resolve(".atomic/workflows/omnigent/negative-fixture.ts");
const source = `import { completedRun, type SliceChange } from "./types.js";
import { witness, type Witness } from "../bump/types.js";
declare const observedDeployment: Witness<boolean>;
declare const observedChanges: Witness<SliceChange[]>;
const rest = { status: "completed", summary: "observed", chain_tip: "kkkk", resume_at_slice: 11, evidence_root: "runs/test", wizard_path: "", deployed_source: null, acceptance: "not_requested" as const };
completedRun(observedDeployment, observedChanges, rest);
// @ts-expect-error A Boolean is not a deployment witness.
completedRun(true, observedChanges, rest);
// @ts-expect-error A guessed change list is not a topology witness.
completedRun(observedDeployment, [], rest);
// @ts-expect-error Witness brand cannot be structurally forged.
const forged: Witness<boolean> = { value: true, source: "model", evidence: "said so" };
// @ts-expect-error A stage's prose is not a discriminated tool outcome.
witness("stage", { summary: "deployed" }, () => ({ value: true, evidence: "none" }));
`;
const host = ts.createCompilerHost(options);
const originalGetSourceFile = host.getSourceFile.bind(host);
host.getSourceFile = (name, languageVersion, onError, shouldCreate) => resolve(name) === fixture ? ts.createSourceFile(name, source, languageVersion, true) : originalGetSourceFile(name, languageVersion, onError, shouldCreate);
const negative = ts.createProgram([...files, fixture], options, host);
assert.equal(ts.getPreEmitDiagnostics(negative).length, 0, format(ts.getPreEmitDiagnostics(negative)));
console.log("PASS negative type fixtures: no completion without tool witnesses");
const texts = Object.fromEntries(files.map((file) => [file, readFileSync(file, "utf8")]));
const main = texts[entry];
assert(main.includes("inputs, outputs"));
assert(main.includes("result.modelAttempts") && main.includes("actual?.reasoningLevel") && main.includes("actual model/thinking metadata unavailable"));
assert(texts[files[1]].includes("Value.Check(Review, value)") && texts[files[1]].includes("Value.Check(StageOutput, value)"));
assert(!main.includes("launchBlockers"), "Accepted runtime/graph risks must not retain a prelaunch barrier");
assert(!Object.values(texts).some((text) => /\bBun\./.test(text)));
let toolCalls = 0, squashSites = 0;
for (const [file, text] of Object.entries(texts)) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const visit = (node) => {
    if (ts.isSwitchStatement(node)) {
      const clause = node.caseBlock.clauses.find(ts.isDefaultClause);
      assert(clause?.getText(ast).includes("unreachable("), `${file}: non-exhaustive constructor switch`);
    }
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "ctx.tool") {
      toolCalls++;
      assert(node.arguments[2].getText(ast).includes("signal") && node.arguments[3].getText(ast).includes('failureMode: "return"') && node.arguments[3].getText(ast).includes("timeoutMs"));
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && node.getText(ast).includes("jj squash")) {
      squashSites++;
      let parent = node.parent;
      while (parent && !ts.isFunctionDeclaration(parent)) parent = parent.parent;
      assert.equal(parent?.name?.text, "squashCommand", "Every squash must pass the guarded path constructor");
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}
assert.equal(toolCalls, 2);
assert.equal(squashSites, 1);
assert(main.indexOf('tool("preflight"') < main.indexOf('tool("seed-chain"'));
assert(main.indexOf('stage("bind-tracking"') < main.indexOf('`create-change-${slice.id}`'));
for (const marker of ["implement-${slice.id}", "land-${slice.id}", "gate-sandbox-${slice.id}", "review-${slice.id}", "repair-${slice.id}-${repair}", "land-${slice.id}-${repair}", "gate-sandbox-${slice.id}-${repair}", "review-${slice.id}-${repair}"]) assert(main.includes(marker));
assert(!main.includes("assertSameInputs") && !main.includes("gate-inputs-stable") && !main.includes("sourceTreeHash"));
assert(main.indexOf('await land(`land-${slice.id}`)') < main.indexOf('await gates(`gate-sandbox-${slice.id}`'));
assert(!main.includes("nix run .#terraform") && !main.includes("clan machines update"), "No broad shared-source deployment");
assert(!main.includes("branch --show-current"));
const deploymentNodes = ["generate-vars", "resolve-dns-source", "plan-dns", "apply-dns", "route-tfstate", "resolve-deployment-source", "update-machine", "probe-deployment", "probe-harness-catalog", "probe-claude-hook-env", "write-wizard", "probe-host-online"];
for (let i = 1; i < deploymentNodes.length; i++) assert(main.indexOf(`tool("${deploymentNodes[i - 1]}"`) < main.indexOf(`tool("${deploymentNodes[i]}"`));
assert(main.indexOf('tool("resolve-deployment-source"') < main.indexOf('await gates(`deploy-join-gate-${slice.id}-sandbox`'));
assert(main.indexOf('await gates(`deploy-join-gate-${slice.id}-sandbox`') < main.indexOf('tool("update-machine"'));
assert(main.includes('"concurrent-agent: continue", "worker-violation: block"'));
assert(main.includes("foreign_during_stage") && main.includes('kind: "human_attested"'));
console.log("PASS graph order, finite signal-forwarding tool boundary, metadata, scope attribution, exhaustive switches");

const urls = new Map();
function moduleUrl(file) {
  const absolute = resolve(file);
  if (urls.has(absolute)) return urls.get(absolute);
  let code = ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  code = code.replace(/from "([^"]+)"/g, (whole, name) => {
    if (name === "typebox" || name === "typebox/value") {
      const path = name === "typebox" ? "build/index.mjs" : "build/value/index.mjs";
      return `from ${JSON.stringify(pathToFileURL(join(atomic, "node_modules/typebox", path)).href)}`;
    }
    if (name.startsWith(".")) return `from ${JSON.stringify(moduleUrl(resolve(dirname(absolute), name.replace(/\.js$/, ".ts"))))}`;
    return whole;
  });
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  urls.set(absolute, url);
  return url;
}
const tools = await import(moduleUrl(".atomic/workflows/omnigent/tools.ts"));
const types = await import(moduleUrl(".atomic/workflows/omnigent/types.ts"));
const contract = await import(moduleUrl(".atomic/workflows/omnigent/slices.ts"));
const { slices, validateSlices, fixture: nixFixture, secondServerExpr, serverConfigProbe, mergeProbe, acpMarkers, serverConfigHomeExpr, runnerSettingsExpr } = contract;
const additions = await import(moduleUrl(".atomic/workflows/omnigent/s9-s10.ts"));
for (const item of additions.runtimeHumanItems) {
  assert.equal(types.checklist.filter((entry) => entry === item).length, 1, `Exactly one human attestation: ${item}`);
  assert(!slices[10].acceptance.includes(item), `Live outcome is not pre-deploy slice acceptance: ${item}`);
}
console.log("PASS S10 live outcomes excluded from slice acceptance and present exactly once in the human checklist");
if (process.argv.includes("--s10-binding-empirical")) {
  await (await import("./s9-s10-checks.mjs")).runBindingEmpirical({ contract, additions, tools });
  process.exit(0);
}
if (process.argv.includes("--s10-review-empirical")) {
  await (await import("./s9-s10-checks.mjs")).runReviewEmpirical({ contract, additions, tools, types });
  process.exit(0);
}
if (process.argv.includes("--join-empirical")) {
  await (await import("./join-checks.mjs")).runJoinEmpirical({ moduleUrl, tools, slices });
  process.exit(0);
}
if (process.argv.includes("--s9-deployment")) {
  await (await import("./deployment-checks.mjs")).runDeploymentChecks({ moduleUrl });
  process.exit(0);
}
if (process.argv.includes("--s9-s10-empirical")) {
  await (await import("./s9-s10-checks.mjs")).runEmpirical({ contract, additions, tools });
  process.exit(0);
}
const activationSource = process.argv.find((arg) => arg.startsWith("--activation-source-receipt="));
if (activationSource) {
  await (await import("./deployment-checks.mjs")).runLiveActivationCheck({ moduleUrl, sourceReceipt: activationSource.slice("--activation-source-receipt=".length) });
  process.exit(0);
}
await (await import("./s9-s10-checks.mjs")).runChecks({ contract, additions, tools, types });
if (process.argv.includes("--s6-empirical")) {
  await (await import("./s6-checks.mjs")).runS6Empirical({ contract, tools });
  process.exit(0);
}
if (process.argv.includes("--s7-empirical")) {
  await (await import("./s7-checks.mjs")).runS7Empirical({ contract, tools });
  process.exit(0);
}
if (process.argv.includes("--s8-empirical")) {
  await (await import("./s8-checks.mjs")).runS8Empirical({ contract, tools });
  process.exit(0);
}
await (await import("./s8-checks.mjs")).runS8Checks({ contract, tools, types, prompts: await import(moduleUrl(".atomic/workflows/omnigent/prompts.ts")) });
await (await import("./s7-checks.mjs")).runS7Checks({ contract, tools, types, prompts: await import(moduleUrl(".atomic/workflows/omnigent/prompts.ts")) });
validateSlices();
assert.equal(slices.length, 11);
assert.equal(slices[5].id, 5);
assert.equal(slices[5].title, "runtime-environment");
assert.deepEqual(slices[5].allowedPaths, ["modules/home/ai/claude-code", "modules/nixos/omnigent-host.nix", "docs/notes/development/omnigent/deployment-plan.md"]);
assert.equal(types.inputs.start_at_slice.maximum, 11);
assert.equal(types.Slice.properties.id.maximum, 10);
assert.equal(slices[6].id, 6);
assert.equal(slices[6].title, "omp-acp-and-tile");
assert.deepEqual(slices[6].allowedPaths, ["modules/home/ai/omnigent", "modules/nixos/omnigent-host.nix", "modules/nixos/kanidm.nix", "docs/notes/development/omnigent/deployment-plan.md"]);
for (const item of ["Oh My Pi appears in the UI harness dropdown", "an acp:oh-my-pi session completes a turn", "the Omnigent tile shows its icon on the Kanidm apps page"]) assert(types.checklist.includes(item));
assert.equal(slices[8].title, "pyrite-host");
for (const item of ["pyrite appears online in the UI host list", "a session on pyrite completes a turn", "pyrite returns online automatically after suspend/resume"]) assert(types.checklist.includes(item));
await (await import("./s6-checks.mjs")).runS6Checks({ contract, tools, prompts: await import(moduleUrl(".atomic/workflows/omnigent/prompts.ts")) });
assert(types.checklist.includes("Claude Code response renders in the structured web UI view (not only the terminal toggle)"));
assert(types.checklist.includes("Files panel populated after Resume session"));
const runtimeGates = slices[5].gates;
assert.equal(runtimeGates.filter((gate) => gate.kind === "NixEval").length, 6, "five settings/path gates plus the empty-extraPackages fixture proving python is unconditional");
assert(runtimeGates.some((gate) => gate.kind === "NixBuildRemote" && gate.installable === "__OMNIGENT_SOURCE__#checks.x86_64-linux.nixos-magnetite"));
for (const marker of ["2.1.45", "2.1.47", "service boundary", "direnv", "deferred to the operator", "pkgs.python3", "os and json"]) assert(slices[5].objective.includes(marker));
for (const home of ['homeConfigurations."crs58@aarch64-darwin"', 'home-manager.users.cameron']) {
  const settingsGates = runtimeGates.filter((gate) => gate.kind === "NixEval" && gate.target.expr.includes(home));
  assert.equal(settingsGates.length, 2);
  assert.equal(settingsGates.filter((gate) => gate.target.expr.includes("!(env ? TMPDIR) && !(env ? TMPPREFIX)")).length, 1);
  assert.equal(settingsGates.filter((gate) => gate.target.expr.includes('lib.hasInfix "/tmp/claude" (builtins.toJSON')).length, 1);
  const wrapperGates = runtimeGates.filter((gate) => gate.kind === "Command" && gate.argv.join(" ").includes(home));
  assert.equal(wrapperGates.length, 2);
  for (const [index, profile] of ["glm", "cerebras"].entries()) {
    const gate = wrapperGates[index];
    const script = gate.argv[2];
    assert.equal(gate.expectExitZero, true);
    assert(script.includes(profile === "glm" ? "claudeGlmMutableSettings" : "claudeCerebrasMutableSettings"));
    assert(script.includes(`c.xdg.configFile."claude-${profile}/settings.json".source`));
    assert(script.includes("nix build --no-link --print-out-paths") && !script.includes("builtins.readFile"));
    assert(script.includes('has("TMPDIR") or has("TMPPREFIX")') && script.includes("grep -q '/tmp/claude'"));
    execFileSync("bash", ["-n"], { input: script });
    execFileSync("shellcheck", ["--shell=bash", "--exclude=SC2016", "-"], { input: script, stdio: ["pipe", "inherit", "inherit"] });
    execFileSync("nix-instantiate", ["--parse", "--expr", script.match(/--expr '([^']+)'/)[1]], { stdio: "pipe" });
    for (const [contents, expectedPass, fault] of [
      ['{"env":{}}', true, ""],
      ['{"env":{"TMPDIR":""}}', false, ""],
      ['{"env":{"TMPPREFIX":"/other"}}', false, ""],
      ['{"other":"/tmp/claude"}', false, ""],
      ['invalid-json', false, ""],
      ['{}', false, "empty"],
      ['{}', false, "build"],
      ['{}', false, "missing"],
      ['{}', false, "grep"],
    ]) {
      const prelude = `set -euo pipefail
fixture=$(mktemp); trap 'rm -f "$fixture"' EXIT
printf '%s' '${contents}' > "$fixture"
${fault === "missing" ? 'rm -f "$fixture"' : ""}
nix() { ${fault === "build" ? "return 2" : fault === "empty" ? "return 0" : 'printf "%s\\n" "$fixture"'}; }
${fault === "grep" ? 'grep() { return 2; }' : ""}
`;
      const result = spawnSync("bash", ["-c", prelude + script], { encoding: "utf8", env: { ...process.env, BASH_ENV: "/dev/null" } });
      assert.equal(result.status === 0, expectedPass, `${home}/${profile}/${fault}/${contents}: exit ${result.status}: ${result.stderr}`);
    }
  }
}
for (const pattern of ["index === 3", "slice === 3", "next.id === 3", "index === 2", "slice === 2", "next.id === 2"]) assert(texts[files[2]].includes(pattern));
assert(main.includes("changes[3]!.change_id") && main.includes("changes[2]!.change_id") && main.includes("current = 11"));
assert(texts[files[2]].includes('slice === 5 ? `${title}\\n\\n${runtimeEnvironmentJustification}` : title'));
assert(nixFixture.includes("extendModules") && secondServerExpr.includes("machines.cinnabar"));
assert.equal(slices[4].title, "declarative-config");
for (const probe of [serverConfigProbe, mergeProbe]) execFileSync("bash", ["-n"], { input: probe });
assert(mergeProbe.includes("host_id: deadbeef") && mergeProbe.includes("__OMNIGENT_SANDBOX__/modules/home/ai/omnigent/merge-config.sh"));
assert(acpMarkers.includes("command=bunx pi-acp@0.0.33") && acpMarkers.includes("env_passthrough=PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR"));
assert(!slices[4].objective.includes("OMNIGENT_RUNNER_ENV_PASSTHROUGH=") && slices[4].allowedPaths.every((p) => !p.startsWith("modules/nixos/omnigent-host")));
const observed = tools.classifyScope({ "pkgs/a/file": "old", "foreign/quiet": "same", "foreign/edit": "old" }, { "pkgs/a/file": "new", "foreign/quiet": "same", "foreign/edit": "new" }, ["pkgs/a"], ["pkgs/a/file", "foreign/quiet", "foreign/edit"]);
assert.deepEqual(observed, { attributed: ["pkgs/a/file"], foreign: ["foreign/quiet"], foreignDuringStage: ["foreign/edit"] });
assert.deepEqual(tools.classifyScope({ "pkgs/a/deleted": "old" }, {}, ["pkgs/a"], []).attributed, ["pkgs/a/deleted"]);
assert.match(tools.squashCommand("kkkk", ["pkgs/a/file"], ["pkgs/a"]), /--use-destination-message --keep-emptied --/);
for (const paths of [["foreign/quiet"], ["pkgs/ab/file"], ["pkgs/a/../foreign"], ["/pkgs/a/file"], ["pkgs/a/file", "foreign/edit"], []]) {
  assert.throws(() => tools.squashCommand("kkkk", paths, ["pkgs/a"]), /Squash path/, `Must never squash outside allowed prefixes: ${paths}`);
}
assert.throws(() => types.validateReview({ verdict: "unknown" }));
assert.throws(() => types.validateReview({ verdict: "plan_invalidated", reason: "x", affected_decisions: [] }));
assert.throws(() => types.validateStage({ summary: false }));
assert.equal(types.validateReview({ verdict: "approved" }).verdict, "approved");
await (await import("./sandbox-checks.mjs")).runSandboxChecks({ tools, slices });
await runExecutionChecks({ ts, main, moduleUrl, tools, types, slices });
await (await import("./recovery-checks.mjs")).runRecoveryChecks({ moduleUrl });
execFileSync("python3", ["-B", ".atomic/workflows/omnigent/linear-checks.py"], { stdio: "inherit" });
console.log("PASS Linear stored-workspace authentication, unauthenticated CLI exit/diagnostic, sanitized binding readback, and timeout");
await (await import("./deployment-checks.mjs")).runDeploymentChecks({ ts, moduleUrl });
const template = readFileSync(join(homedir(), ".agents/skills/wizard/template.sh"), "utf8");
const rendered = tools.renderWizard(template);
assert(rendered.startsWith(template.slice(0, template.indexOf("# STAGES —"))));
execFileSync("bash", ["-n"], { input: rendered });
execFileSync("shellcheck", ["--exclude=SC2016", "-"], { input: rendered, stdio: ["pipe", "inherit", "inherit"] });
assert(tools.wizard.includes("chmod 600") && tools.wizard.includes("omnigent login") && !tools.wizard.includes("cat > ~/.omnigent/config.yaml"), "wizard copies credentials and never rewrites the declaratively-managed config");
assert(!tools.wizard.includes("set -x") && !tools.wizard.includes("omnigent login --server"));
for (const slice of slices) for (const gate of slice.gates) {
  if (gate.kind === "NixEval" && gate.target.kind === "Expr") execFileSync("nix-instantiate", ["--parse", "--expr", gate.target.expr], { stdio: "pipe" });
}
for (const expr of [secondServerExpr, serverConfigHomeExpr, runnerSettingsExpr]) execFileSync("nix-instantiate", ["--parse", "--expr", expr], { stdio: "pipe" });
console.log("PASS runtime contracts: three-way scope, deletion attribution, forbidden squash rejection, structured schemas");
console.log("PASS wizard bash syntax, ShellCheck (SC2016 excluded for intentional remote expansion), and Nix expression parsing only");
console.log("No workflow, production Nix evaluation/build, deployment, or jj mutation was executed; membership models use local Nix evaluation.");
