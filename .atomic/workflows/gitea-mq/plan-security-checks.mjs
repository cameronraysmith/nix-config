import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, readdir, mkdir, rm, symlink } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

export async function runPlanSecurityChecks({ ts, moduleUrl, tools }) {
  const security = await import(moduleUrl(".atomic/workflows/gitea-mq/plan-security.ts"));
  const processPort = await import(moduleUrl(".atomic/workflows/gitea-mq/process.ts"));
  const prompts = await import(moduleUrl(".atomic/workflows/gitea-mq/prompts.ts"));
  const report = await import(moduleUrl(".atomic/workflows/gitea-mq/verify-report.ts"));
  const cwd = process.cwd(), root = await mkdtemp(join(tmpdir(), "mq-private-plan-"));
  const secret = "SYNTHETIC-STATE-PRIVATE-MARKER";
  const raw = { prior_state: { tls_private_key: secret }, resource_changes: [
    { address: "tls_private_key.example", mode: "managed", type: "tls_private_key", change: { actions: ["no-op"], before: { private_key_pem: secret }, after: { private_key_pem: secret } } },
    { address: "cloudflare_dns_record.mq", mode: "managed", type: "cloudflare_dns_record", change: { actions: ["create"], after: { name: "mq", type: "CNAME", content: "magnetite.scientistexperience.net", proxied: false, extra: secret } } },
  ] };
  let planPath, failCommand = false, malformed = false;
  globalThis.__mqPrivatePlan = {
    snapshot: async () => ({}),
    captureStreaming: async (actualCwd, command, signal, redact) => {
      if (command.includes("-- plan -input=false")) {
        planPath = command.match(/-out='([^']+)'/)[1];
        for (const path of [planPath, `${planPath}.json`]) assert.equal((await stat(path)).mode & 0o777, 0o600);
        await writeFile(planPath, secret);
        await writeFile(`${planPath}.json`, malformed ? `{\"broken\":${secret}` : JSON.stringify(raw));
      } else {
        assert(command.includes("-- apply -input=false"));
        assert.equal(await readFile(planPath, "utf8"), secret, "Saved binary survives until apply");
      }
      // Exercise the actual process log/tail/error persistence with private output
      // on BOTH streams. No OpenTofu, Nix, VCS or host command is executed.
      return processPort.captureStreaming(actualCwd, `cat '${planPath}'; cat '${planPath}' >&2; ${failCommand ? "exit 1" : "true"}`, signal, redact);
    },
  };
  let source = ts.transpileModule(readFileSync(".atomic/workflows/gitea-mq/tools.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  source = source.replace(/from "([^"]+)"/g, (whole, name) => {
    if (name === "./process.js" || name === "./vcs.js") {
      const symbol = name === "./process.js" ? "captureStreaming" : "snapshot";
      return `from "${dataUrl(`export * from "${moduleUrl(resolve(".atomic/workflows/gitea-mq", name.replace(/\.js$/, ".ts")))}"; export const ${symbol} = (...args) => globalThis.__mqPrivatePlan.${symbol}(...args);`)}"`;
    }
    if (name.startsWith(".")) return `from "${moduleUrl(resolve(".atomic/workflows/gitea-mq", name.replace(/\.js$/, ".ts")))}"`;
    if (name === "typebox") return whole;
    return whole;
  });
  // Reuse moduleUrl's resolved typebox dependency without requiring a local install.
  const typesUrl = moduleUrl(".atomic/workflows/gitea-mq/api-schemas.ts");
  const decoded = Buffer.from(typesUrl.split(",")[1], "base64").toString();
  source = source.replace('from "typebox"', `from ${decoded.match(/from ("[^"]+typebox[^\"]+")/)[1]}`);
  const actual = await import(dataUrl(source));
  const deployment = { source: `git+file://${cwd}?ref=rollup-landing&rev=${"a".repeat(40)}`, sha: "a".repeat(40) };
  const signal = new AbortController().signal;
  try {
    const planned = await processPort.processCheckpoint(root, "plan", () => actual.planDns(cwd, root, "adopted-s2", deployment, signal));
    assert(!JSON.stringify(planned).includes(secret), "Actual checkpoint must contain only public plan fields");
    assert.deepEqual(planned.evidence.projection, tools.dnsProjection(raw));
    assert.equal((await stat(planPath)).mode & 0o777, 0o600);
    assert.equal((await stat(`${planPath}.json`)).mode & 0o777, 0o600);
    const applied = await processPort.processCheckpoint(root, "apply", () => actual.applyDns(cwd, root, "adopted-s2", planned.evidence, signal));
    assert.deepEqual(applied.evidence.deletion.failed, []);
    for (const path of [planPath, `${planPath}.json`]) await assert.rejects(stat(path), { code: "ENOENT" });
    for (const name of await readdir(root)) assert(!(await readFile(join(root, name), "utf8")).includes(secret), `Raw plan leaked in ${name}`);
    const serialized = JSON.stringify({ ledger: [planned, applied], index: [{ node: "plan", ok: true, evidence: `${root}/plan.json` }],
      prompt: prompts.diagnosePrompt(cwd, root, "plan", `${root}/plan.json`), reads: [JSON.stringify(planned)], output: applied,
      report: report.renderVerify({ analysis: JSON.stringify(planned), caveats: "" }, [], { root, verifiedAt: "2026-09-08" }) });
    assert(!serialized.includes(secret));
    for (const mode of ["failure", "malformed"]) {
      failCommand = mode === "failure"; malformed = mode === "malformed";
      await assert.rejects(processPort.processCheckpoint(root, mode, () => actual.planDns(cwd, root, mode, deployment, signal)), (error) => !String(error).includes(secret));
      await security.deletePlans(cwd, root);
      for (const name of await readdir(root)) assert(!(await readFile(join(root, name), "utf8")).includes(secret), `Raw failed-plan output leaked in ${name}`);
    }
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
  } finally { delete globalThis.__mqPrivatePlan; await rm(root, { recursive: true, force: true }); }
}
