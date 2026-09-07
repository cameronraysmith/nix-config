import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { runExecutionChecks } from "./execution-checks.mjs";
import { runCommandChecks } from "./command-checks.mjs";

const require = createRequire(import.meta.url);
const executable = realpathSync(execFileSync("bash", ["-c", "command -v atomic"], { encoding: "utf8" }).trim());
const atomic = resolve(dirname(executable), "../lib/node_modules/@bastani/atomic");
const compiler = execFileSync("bash", ["-c", "printf '%s\\n' /nix/store/*typescript*/lib/node_modules/typescript/lib/typescript.js | head -1"], { encoding: "utf8" }).trim();
const ts = require(compiler);
const entry = ".atomic/workflows/stand-up-gitea-mq.ts";
const files = [entry, ...["types", "tools", "prompts", "slices", "ledger", "api-schemas"].map((n) => `.atomic/workflows/gitea-mq/${n}.ts`)];
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
const format = (ds) => ts.formatDiagnosticsWithColorAndContext(ds, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" });
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options));
if (diagnostics.length) { console.error(format(diagnostics)); process.exit(1); }
console.log("PASS strict TypeScript against installed Atomic declarations");
if (process.argv.includes("--typecheck-only")) process.exit(0);
const fixture = resolve(".atomic/workflows/gitea-mq/negative-fixture.ts");
const source = `import { completedRun, nextBatch, type Batch, type Validation } from "./types.js";
import { type Witness } from "../bump/types.js";
declare const changes: Witness<string[]>;
declare const deployed: Witness<boolean>;
declare const validation: Witness<Validation>;
declare const written: Witness<boolean>;
completedRun(changes, deployed, validation, written, [], "runs/test");
// @ts-expect-error A bare Boolean is not observed deployment.
completedRun(changes, true, validation, written, [], "runs/test");
// @ts-expect-error A guessed list is not observed topology.
completedRun([], deployed, validation, written, [], "runs/test");
// @ts-expect-error No third bounded batch exists.
const third: Batch = 3;
// @ts-expect-error A stage report cannot forge the witness brand.
const forged: Witness<boolean> = { value: true, source: "model", evidence: "prose" };
nextBatch(2);
`;
const host = ts.createCompilerHost(options), original = host.getSourceFile.bind(host);
host.getSourceFile = (name, version, onError, create) => resolve(name) === fixture ? ts.createSourceFile(name, source, version, true) : original(name, version, onError, create);
const negatives = ts.getPreEmitDiagnostics(ts.createProgram([...files, fixture], options, host));
assert.equal(negatives.length, 0, format(negatives));
console.log("PASS negative type fixtures: four witnesses and at most two batches");
const urls = new Map();
function moduleUrl(file) {
  const absolute = resolve(file);
  if (urls.has(absolute)) return urls.get(absolute);
  let code = ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  code = code.replace(/from "([^"]+)"/g, (whole, name) => {
    if (name === "@bastani/atomic/workflows") return 'from "data:text/javascript,export const workflow = x => x"';
    if (name === "typebox" || name === "typebox/value") return `from ${JSON.stringify(pathToFileURL(join(atomic, "node_modules/typebox", name === "typebox" ? "build/index.mjs" : "build/value/index.mjs")).href)}`;
    if (name.startsWith(".")) return `from ${JSON.stringify(moduleUrl(resolve(dirname(absolute), name.replace(/\.js$/, ".ts"))))}`;
    return whole;
  });
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  urls.set(absolute, url); return url;
}
const types = await import(moduleUrl(files[1]));
const tools = await import(moduleUrl(files[2]));
const slices = await import(moduleUrl(files[4]));
assert.equal(types.nextBatch(1), 2); assert.equal(types.nextBatch(2), null);
assert.throws(() => types.parse(types.Diagnosis, { kind: "RetryForever" }));
assert.throws(() => types.parse(types.VResult, { kind: "Pass" }));
assert.throws(() => types.parse(types.Review, { verdict: "Reject", findings: [] }));
assert.throws(() => types.assertCatalog([]));
types.validateModelAttempts(`${types.MODEL}:high`, [{ model: types.MODEL, reasoningLevel: "high", success: true }]);
assert.throws(() => types.validateModelAttempts(`${types.MODEL}:high`, [{ model: "other-provider/model", reasoningLevel: "high", success: true }]));
assert.throws(() => types.validateModelAttempts(`${types.MODEL}:high`, [{ model: types.MODEL, reasoningLevel: "medium", success: true }]));
assert.throws(() => types.validateModelAttempts(`${types.MODEL}:high`, [{ model: types.MODEL, reasoningLevel: "high", success: true }, { model: "other-provider/model", reasoningLevel: "high", success: true }]));
assert.throws(() => types.validateModelAttempts(`${types.MODEL}:high`, undefined));
assert.throws(() => types.assertCatalog([{ fullId: types.MODEL, availableThinkingLevels: ["high", "medium"] }]));
types.assertCatalog([{ fullId: types.MODEL, availableThinkingLevels: ["high", "medium", "max"] }]);
assert.equal(slices.varsAllowed.length, 2);
const plan = { resource_changes: [{ mode: "managed", type: "cloudflare_dns_record", address: "cloudflare_dns_record.mq", change: { actions: ["create"], after: { name: "mq.scientistexperience.net", type: "CNAME", content: "magnetite.scientistexperience.net", proxied: false } } }] };
assert.equal(tools.dnsSummary(plan).name, "mq.scientistexperience.net");
assert.throws(() => tools.dnsSummary({ resource_changes: [...plan.resource_changes, ...plan.resource_changes] }));
assert.throws(() => tools.dnsSummary({ resource_changes: [{ ...plan.resource_changes[0], change: { ...plan.resource_changes[0].change, actions: ["update"] } }] }));
assert.throws(() => tools.dnsSummary({ resource_changes: [{ ...plan.resource_changes[0], change: { ...plan.resource_changes[0].change, after: { ...plan.resource_changes[0].change.after, proxied: true } } }] }));
assert.throws(() => tools.assertHumanBoxes("- [ ] 1.1 G1\n- [ ] 8.2 G2", "- [x] 1.1 G1\n- [ ] 8.2 G2"));
assert.throws(() => tools.assertHumanBoxes("- [ ] 1.1 G1\n- [ ] 8.2 G2", "- [ ] 1.1 G1"));
assert.deepEqual(tools.resolveRequiredChecks(["gitea-mq", "gitea-mq/batch"], [], ["nixbot/nix-eval", "nixbot/nix-build"]).effective, ["nixbot/nix-eval", "nixbot/nix-build"]);
assert.deepEqual(tools.resolveRequiredChecks(["gitea-mq"], ["nixbot/nix-build"], ["nixbot/nix-eval", "nixbot/nix-build"]).effective, ["nixbot/nix-build"]);
assert.deepEqual(tools.resolveRequiredChecks(["gitea-mq-other", "ci"], ["ci"], []).effective, ["gitea-mq-other", "ci"]);
assert.throws(() => tools.assertTaskScope("- [ ] 8.4 apps", "- [x] 8.4 apps", slices.s1.taskIds));
tools.assertTaskScope("- [ ] 2.1 input", "- [x] 2.1 input", slices.s1.taskIds);
assert.equal(tools.resetTaskText("- [x] 2.1 input\n- [x] 8.4 apps", slices.s1.taskIds), "- [ ] 2.1 input\n- [x] 8.4 apps");
assert.deepEqual(tools.linearOutcome(true, true, false), { kind: "TransitionObserved", comment: "Failed" });
assert.deepEqual(tools.linearOutcome(true, false, true), { kind: "ReadbackFailed", comment: "Posted" });
assert.deepEqual(tools.linearOutcome(false, true, true), { kind: "TransitionFailed" });
assert.equal(tools.dnsDecision({ resource_changes: [] }, true).kind, "Reconciled");
assert.throws(() => tools.dnsDecision({ resource_changes: [] }, false));
assert.equal(tools.dnsDecision(plan, true).kind, "NeedsApply");
assert.throws(() => tools.dnsDecision({}, true));
assert.throws(() => tools.dnsDecision({ resource_changes: [], output_changes: { secret: { actions: ["update"] } } }, true));
assert.deepEqual(tools.classicContexts({ contexts: ["ci"], checks: [{ context: "build" }, { context: "ci" }] }), ["ci", "build"]);
assert.throws(() => tools.classicContexts({ checks: [{ context: 4 }] }));
tools.assertDnsIntent({ plan: "saved", sha256: "hash" }, { plan: "saved", sha256: "hash" });
assert.throws(() => tools.assertDnsIntent({ plan: "foreign", sha256: "hash" }, { plan: "saved", sha256: "hash" }));
const ledgerTools = await import(moduleUrl(".atomic/workflows/gitea-mq/ledger.ts"));
const receipt = { gate: "s1", taskIds: ["4.1"], evidence: "gate.json", status: { kind: "Passed" } };
ledgerTools.assertVerifyClaims([{ taskId: "4.1", evidence: "gate.json" }], [receipt]);
assert.throws(() => ledgerTools.assertVerifyClaims([{ taskId: "4.1", evidence: "model.md" }], [receipt]));
assert.throws(() => ledgerTools.assertVerifyClaims([{ taskId: "4.1", evidence: "gate.json" }], [{ ...receipt, status: { kind: "Invalidated", reason: "repair" } }]));
assert.deepEqual(ledgerTools.repairEffect({ a: "same" }, { a: "same" }), { kind: "Noop" });
assert.deepEqual(ledgerTools.repairPaths(ledgerTools.repairEffect({ a: "old" }, { a: "new" })), ["a"]);
tools.assertMigratedTables("public|queue|table|gitea-mq");
for (const tables of ["", "public|queue|table|postgres", "private|queue|table|gitea-mq"]) assert.throws(() => tools.assertMigratedTables(tables));
const acme = "LoadState=loaded\nResult=success\nExecMainStatus=0\nExecMainStartTimestampMonotonic=42";
tools.assertAcmeSuccess(acme);
for (const bad of [acme.replace("=42", "=0"), acme.replace("=success", "=failed"), acme.replace("Status=0", "Status=1"), ""]) assert.throws(() => tools.assertAcmeSuccess(bad));
const texts = files.map((f) => readFileSync(f, "utf8"));
for (const [i, text] of texts.entries()) {
  const ast = ts.createSourceFile(files[i], text, ts.ScriptTarget.ES2022, true);
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) assert.fail(`${files[i]}: any`);
    if (ts.isSwitchStatement(node)) assert(node.caseBlock.clauses.find(ts.isDefaultClause)?.getText(ast).includes("unreachable("));
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "ctx.tool") {
      assert(node.arguments[2].getText(ast).includes("signal"));
      assert(node.arguments[3].getText(ast).includes("timeoutMs"));
      assert(node.arguments[3].getText(ast).includes('failureMode: "return"'));
    }
    ts.forEachChild(node, visit);
  }; visit(ast);
}
for (const expression of [...slices.negativeControls.map((control) => control.expr), slices.rollbackExpr]) {
  execFileSync("nix-instantiate", ["--parse", "--expr", expression], { stdio: "pipe" });
}
for (const script of [tools.appScript, tools.leakScript]) execFileSync("python3", ["-c", "import ast,sys; ast.parse(sys.stdin.read())"], { input: script });
console.log("PASS schemas, model policy, task ownership, DNS identity/reconciliation, C6 classic checks, ledger binding, repair effects, Linear outcomes, exhaustive switches, finite tools, Nix/Python parsing");
const { assertCompactCheckpoint } = await import(moduleUrl(".atomic/workflows/bump/tools.ts"));
await runExecutionChecks({ ts, main: readFileSync(entry, "utf8"), moduleUrl, tools, types, slices, ledgerTools, assertCompactCheckpoint });
try {
  await runCommandChecks({ ts, source: readFileSync(files[2], "utf8"), moduleUrl, tools, slices, typeboxUrl: pathToFileURL(join(atomic, "node_modules/typebox/build/index.mjs")).href });
} catch (error) {
  console.error(String(error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g, "<in-memory-module>"));
  console.error(globalThis.__mqCommandMock?.commands?.slice(-3));
  process.exit(1);
}
console.log("No workflow launch, Nix evaluation/build, host, GitHub, Linear, Terraform, clan, or jj/git mutation was executed.");
