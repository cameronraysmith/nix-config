import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, readdir, mkdir, rm, symlink, readlink, realpath } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, relative, isAbsolute } from "node:path";
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

export async function runPlanSecurityChecks({ ts, moduleUrl, tools }) {
  const security = await import(moduleUrl(".atomic/workflows/gitea-mq/plan-security.ts"));
  const processPort = await import(moduleUrl(".atomic/workflows/gitea-mq/process.ts"));
  const prompts = await import(moduleUrl(".atomic/workflows/gitea-mq/prompts.ts"));
  const report = await import(moduleUrl(".atomic/workflows/gitea-mq/verify-report.ts"));
  for (const sensitive of ["A".repeat(80), "-----BEGIN OPENSSH PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----", "ENC[AES256_GCM,data:secret]", '"encrypted_data": "secret"']) {
    assert.equal(tools.redactPlanOutput("stderr", `before\n${sensitive}\nafter`), "before\n[sensitive OpenTofu diagnostic line withheld]\nafter");
  }
  const sanitized = [];
  const lines = new processPort.RedactedLines((line) => tools.redactPlanOutput("stderr", line), (text) => sanitized.push(text));
  for (const chunk of ["mkdir: permission denied\nencr", "ypted_data=secret\n", "A".repeat(8192), "A".repeat(8192), "\nchmod: permission denied"]) lines.append(chunk);
  lines.flush();
  assert.equal(sanitized.join(""), "mkdir: permission denied\n[sensitive OpenTofu diagnostic line withheld]\n[overlong output line withheld]\nchmod: permission denied");
  const sandbox = await realpath(await mkdtemp(join(tmpdir(), "mq-private-plan-")));
  const cwd = join(sandbox, "repository"), root = join(sandbox, "evidence"), bin = join(sandbox, "bin");
  for (const path of [cwd, root, bin]) await mkdir(path);
  const secret = "SYNTHETIC-STATE-PRIVATE-MARKER", config = join(sandbox, "config.tf.json");
  const raw = { prior_state: { tls_private_key: secret }, resource_changes: [
    { address: "tls_private_key.example", mode: "managed", type: "tls_private_key", change: { actions: ["no-op"], before: { private_key_pem: secret }, after: { private_key_pem: secret } } },
    { address: "cloudflare_dns_record.mq", mode: "managed", type: "cloudflare_dns_record", change: { actions: ["create"], after: { name: "mq", type: "CNAME", content: "magnetite.scientistexperience.net", proxied: false, extra: secret } } },
  ] };
  await writeFile(config, "{}");
  await writeFile(join(sandbox, "raw.json"), JSON.stringify(raw), { mode: 0o600 });
  // Execute production shell scripts, replacing ONLY Nix with a local fake. All
  // fixtures, including the fake repository/config symlink, stay under tmpdir().
  await writeFile(join(bin, "nix"), `#!/usr/bin/env python3
import os,pathlib,sys,time
base=pathlib.Path(${JSON.stringify(sandbox)})
args=sys.argv[1:]
assert os.getcwd()==str(base/'repository'), os.getcwd()
assert os.environ['CLAN_NO_COMMIT']=='1'
verb='build' if args[0]=='build' else args[args.index('--')+1]
with (base/'invocations').open('a') as f: f.write(verb+'\\n')
print('diagnostic before '+verb,file=sys.stderr,flush=True)
sys.stderr.write('encr');sys.stderr.flush();time.sleep(.01)
sys.stderr.write('ypted_data=${secret}\\n');sys.stderr.flush()
print('diagnostic after '+verb,file=sys.stderr,flush=True)
if (base/'fail').exists() and (base/'fail').read_text()==verb:
    print('simulated '+verb+' failure',file=sys.stderr);sys.exit(23)
if verb=='build': print(base/'config.tf.json')
elif verb=='plan':
    path=pathlib.Path(next(a[5:] for a in args if a.startswith('-out=')))
    assert path.is_absolute() and path.parent==base/'evidence'
    assert path.stat().st_mode & 0o777 == 0o600
    assert pathlib.Path(str(path)+'.json').stat().st_mode & 0o777 == 0o600
    path.write_text('${secret}')
    print('${secret}')
elif verb=='show':
    print('{broken:${secret}' if (base/'malformed').exists() else (base/'raw.json').read_text())
elif verb=='apply':
    assert pathlib.Path(args[-1]).read_text()=='${secret}'
    print('${secret}')
`, { mode: 0o700 });
  let planPath, refCommit = "a".repeat(40), applyCount = 0;
  const commands = [];
  globalThis.__mqPrivatePlan = {
    snapshot: async () => ({}),
    capture: async (actualCwd, command) => {
      assert.equal(actualCwd, cwd);
      commands.push(command);
      assert(command.startsWith("git rev-parse"));
      return { stdout: refCommit, stderr: "", exitCode: 0, state: "exited", terminationSignal: null };
    },
    captureStreaming: async (actualCwd, command, signal, redact) => {
      assert.equal(actualCwd, cwd, "Every Terraform subprocess must use repository cwd, not '/' or terraform/");
      commands.push(command);
      if (command.includes("-- plan -input=false")) planPath = command.match(/-out='([^']+)'/)[1];
      if (command.includes("-- apply -input=false")) applyCount++;
      return processPort.captureStreaming(actualCwd, `export PATH='${bin}':"$PATH"\n${command}`, signal, redact);
    },
  };
  let source = ts.transpileModule(readFileSync(".atomic/workflows/gitea-mq/tools.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  source = source.replace(/from "([^"]+)"/g, (whole, name) => {
    if (name === "./process.js" || name === "./vcs.js") {
      const symbols = name === "./process.js" ? ["captureStreaming", "capture"] : ["snapshot"];
      return `from "${dataUrl(`export * from "${moduleUrl(resolve(".atomic/workflows/gitea-mq", name.replace(/\.js$/, ".ts")))}"; ${symbols.map((symbol) => `export const ${symbol} = (...args) => globalThis.__mqPrivatePlan.${symbol}(...args);`).join("\n")}`)}"`;
    }
    if (name.startsWith(".")) return `from "${moduleUrl(resolve(".atomic/workflows/gitea-mq", name.replace(/\.js$/, ".ts")))}"`;
    return whole;
  });
  const typesUrl = moduleUrl(".atomic/workflows/gitea-mq/api-schemas.ts");
  const decoded = Buffer.from(typesUrl.split(",")[1], "base64").toString();
  source = source.replace('from "typebox"', `from ${decoded.match(/from ("[^"]+typebox[^\"]+")/)[1]}`);
  const actual = await import(dataUrl(source));
  const signal = new AbortController().signal;
  const deployment = await actual.resolveTerraformSource(cwd, "unused", actual.terraformSourceInputs({ terraform_source_ref: "dns-apply-source" }), signal);
  try {
    const planned = await processPort.processCheckpoint(root, "plan", () => actual.planDns(cwd, root, "adopted-s2", deployment, signal));
    assert.equal(planned.receipt.length, 6);
    for (const receipt of planned.receipt) assert.equal(receipt.cwd, cwd);
    assert(!JSON.stringify(planned).includes(secret), "Actual checkpoint must contain only public plan fields");
    assert.match(JSON.stringify(planned.receipt), /diagnostic before plan/, "Preserve stderr while withholding stdout");
    assert.match(JSON.stringify(planned.receipt), /diagnostic after plan/);
    assert.match(JSON.stringify(planned.receipt), /sensitive OpenTofu diagnostic line withheld/);
    assert.match(JSON.stringify(planned.receipt), /OpenTofu stdout withheld/);
    assert.deepEqual(planned.evidence.projection, tools.dnsProjection(raw));
    await stat(join(root, "plan-0.json")); // Absolute receipt paths must not be joined beneath cwd.
    assert.equal(await readlink(join(cwd, "terraform/config.tf.json")), config);
    assert(isAbsolute(planPath));
    assert(relative(cwd, planPath).startsWith("../"));
    assert.equal(planned.evidence.sha, refCommit);
    assert.deepEqual(planned.evidence.terraformRef, { ref: "dns-apply-source", commit: refCommit });
    assert.equal((await stat(planPath)).mode & 0o777, 0o600);
    assert.equal((await stat(`${planPath}.json`)).mode & 0o777, 0o600);
    const applied = await processPort.processCheckpoint(root, "apply", () => actual.applyDns(cwd, root, "adopted-s2", planned.evidence, signal));
    for (const receipt of applied.receipt) assert.equal(receipt.cwd, cwd);
    assert.deepEqual(applied.evidence.deletion.failed, []);
    assert.equal(applyCount, 1);
    assert.equal(commands.filter((command) => command.startsWith("git rev-parse")).length, 2);
    for (const command of commands.filter((command) => command.includes("nix run"))) assert(command.includes(deployment.source));
    for (const path of [planPath, `${planPath}.json`]) await assert.rejects(stat(path), { code: "ENOENT" });
    for (const name of await readdir(root)) assert(!(await readFile(join(root, name), "utf8")).includes(secret), `Raw plan leaked in ${name}`);
    const serialized = JSON.stringify({ ledger: [planned, applied], index: [{ node: "plan", ok: true, evidence: `${root}/plan.json` }],
      prompt: prompts.diagnosePrompt(cwd, root, "plan", `${root}/plan.json`), reads: [JSON.stringify(planned)], output: applied,
      report: report.renderVerify({ analysis: JSON.stringify(planned), caveats: "" }, [], { root, verifiedAt: "2026-09-08" }) });
    assert(!serialized.includes(secret));
    const stale = (await processPort.processCheckpoint(root, "moving-plan", () => actual.planDns(cwd, root, "moving", deployment, signal))).evidence;
    refCommit = "b".repeat(40);
    await assert.rejects(actual.applyDns(cwd, root, "moving", stale, signal), /Terraform source ref moved/);
    await assert.rejects(actual.applyDns(cwd, root, "moving", stale, signal), /Terraform source ref moved/);
    assert.equal(applyCount, 1, "Moving refs block apply and replay");
    await security.deletePlans(cwd, root);
    console.log("PASS Terraform ref-only saved plan: resolved commit recorded; plan/apply share immutable source; ref movement blocks apply and replay");
    for (const mode of ["build-failure", "failure", "malformed"]) {
      const failing = mode !== "malformed", verb = mode === "build-failure" ? "build" : "plan";
      const failedStep = verb === "build" ? 2 : 4;
      const label = new RegExp(`Terraform step ${failedStep}/6: ${verb}`);
      await writeFile(join(sandbox, failing ? "fail" : "malformed"), verb);
      await writeFile(join(sandbox, "invocations"), "");
      await assert.rejects(processPort.processCheckpoint(root, mode, () => actual.planDns(cwd, root, mode, deployment, signal)), (error) => {
        assert(!String(error).includes(secret));
        if (failing) { assert.match(String(error), label); assert.match(String(error), /exit 23/); }
        return true;
      });
      if (failing) {
        const receipts = await Promise.all((await readdir(root)).filter((name) => new RegExp(`^${mode}-\\d+\\.json$`).test(name)).sort().map(async (name) => JSON.parse(await readFile(join(root, name), "utf8"))));
        assert.equal(receipts.length, failedStep, "Stop at the failed step; preserve each completed step");
        assert.equal(receipts.at(-1).exitCode, 23);
        assert.equal(receipts.at(-1).cwd, cwd);
        assert.match(receipts.at(-1).command, label);
        assert.match(receipts.at(-1).tail, new RegExp(`simulated ${verb} failure`));
        assert.match(receipts.at(-1).tail, /line \d+: exit 23/);
        assert.equal(await readFile(join(sandbox, "invocations"), "utf8"), verb === "build" ? "build\n" : "build\ninit\nplan\n");
      }
      await rm(join(sandbox, failing ? "fail" : "malformed"));
      await security.deletePlans(cwd, root);
      for (const name of await readdir(root)) assert(!(await readFile(join(root, name), "utf8")).includes(secret), `Raw failed-plan output leaked in ${name}`);
    }
    console.log("PASS Terraform diagnostics: stdout withheld; split sensitive stderr line redacted individually; surrounding diagnostics retained; failing step/line/exit recorded; repository cwd/config symlink and external 0600 plans exercised by real shell");
    await mkdir(join(root, "bad.tfplan"));
    await writeFile(join(root, "deletable.tfplan.json"), secret);
    await assert.rejects(security.deletePlans(cwd, root), /Plan artifact deletion failed: bad.tfplan/);
    assert.deepEqual(JSON.parse(await readFile(join(root, "plan-artifact-deletion.json"), "utf8")).failed, ["bad.tfplan"]);
    await assert.rejects(stat(join(root, "deletable.tfplan.json")), { code: "ENOENT" });
    await symlink(join(root, "plan-artifact-deletion.json"), join(root, "link.tfplan"));
    await assert.rejects(security.preparePlan(cwd, root, "link"));
    await writeFile(join(root, "legacy.tfplan"), "synthetic", { mode: 0o644 });
    await writeFile(join(root, "legacy.tfplan.json"), "synthetic", { mode: 0o644 });
    await security.preparePlan(cwd, root, "legacy");
    for (const name of ["legacy.tfplan", "legacy.tfplan.json"]) assert.equal((await stat(join(root, name))).mode & 0o777, 0o600);
    console.log("PASS private plans: actual serialized checkpoints/logs/prompts/reads/ledger/index/output/report are redacted; files 0600; saved binary survives until apply, then both deleted; malformed/failing output withheld; deletion failures observed and surfaced");
    return { planned, applied, secret };
  } finally { delete globalThis.__mqPrivatePlan; await rm(sandbox, { recursive: true, force: true }); }
}
