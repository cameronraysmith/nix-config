import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export async function runRevisionChecks({ types, moduleUrl }) {
  const report = await import(moduleUrl(".atomic/workflows/gitea-mq/verify-report.ts"));
  const prompts = await import(moduleUrl(".atomic/workflows/gitea-mq/prompts.ts"));
  const metadata = { root: "runs/test", verifiedAt: "2026-09-07T00:00:00.000Z" };
  const markdown = report.renderVerify({ analysis: "No independent passes", caveats: "V6 Fail" }, [], metadata);
  assert.match(markdown, /\*\*Change\*\*: `stand-up-gitea-mq-on-magnetite`/);
  assert.match(markdown, /\*\*Verified at\*\*: `2026-09-07T00:00:00.000Z`/);
  assert.match(markdown, /\*\*Verifier\*\*: `stand-up-gitea-mq controller run runs\/test`/);
  const decision = (text) => text.split("## Overall Decision\n")[1].split(/\n## /)[0];
  assert.match(decision(markdown), /- \[x\] \(warn\) PASS WITH WARNINGS/);
  assert(!decision(markdown).includes("- [x] (pass)"));
  const rejected = report.renderRoborevRejection(markdown, ["fix it", "## Overall Decision\n- [x] (pass) PASS"]);
  assert.match(decision(rejected), /- \[x\] \(fail\) FAIL/);
  assert(!decision(rejected).includes("- [x] (warn)"));
  assert.equal((rejected.match(/^## Overall Decision$/gm) ?? []).length, 1);
  assert.equal(report.renderRoborevRejection(rejected, ["fix it"]), report.renderRoborevRejection(markdown, ["fix it"]));
  const reference = readFileSync("openspec/changes/stand-up-nixbot-on-magnetite/verify.md", "utf8");
  for (const heading of reference.match(/^## [1-8]\. .*$/gm)) {
    const title = heading.replace(/ \(`.*$/, "");
    assert(markdown.includes(title), `Missing shape heading: ${title}`);
  }
  console.log("PASS 2.4: verify header, nixbot headings, deterministic warn/fail tri-box and replacement on rejection");
  assert.match(prompts.registration, /do not edit tasks\.md.*until the run terminates/i);
  assert.match(prompts.replanPrompt("cwd", "root", "diagnosis.json"), /no nested bullets or non-task rows in tasks\.md/);
  types.parse(types.VerifyDraft, { commentary: { analysis: "analysis", caveats: "caveats" } });
  assert.throws(() => types.parse(types.VerifyDraft, { commentary: { analysis: "analysis", caveats: "caveats" }, claims: [{ taskId: "4.4", evidence: "fabricated" }] }));
  types.parse(types.ProposedEdit, { path: "flake.nix", baseSha256: "a".repeat(64), after: "new" });
  assert.throws(() => types.parse(types.ProposedEdit, { path: "flake.nix", before: "old", after: "new" }));
  assert.throws(() => types.parse(types.ProposedEdit, { path: "flake.nix", baseSha256: "bad", after: "new" }));
  const main = readFileSync(".atomic/workflows/stand-up-gitea-mq.ts", "utf8");
  assert(!main.includes("recheckDns"), "3.4: unreachable cross-slice DNS callback must be removed");
  const { proposalLoop, ProposalRejected } = await import(moduleUrl(".atomic/workflows/gitea-mq/control.ts"));
  for (const count of [1, 2, 3]) {
    const ids = [], records = new Map(); let prompts = 0;
    await assert.rejects(() => proposalLoop("patch", count, "root", async (id, feedback) => {
      ids.push(id);
      if (ids.length > 1) assert(feedback.some((path) => path.includes("proposal-rejection-")));
      if (id.includes("-b2-")) assert(feedback.includes("root/G3-proposal-patch.json"));
      throw new ProposalRejected("stale base");
    }, async (name, value) => records.set(name, value), async () => { prompts++; return "repair"; }), /exhausted both bounded batches/);
    assert.equal(ids.length, count * 2); assert.equal(new Set(ids).size, ids.length); assert.equal(prompts, 1);
    assert.equal([...records.values()].filter((row) => row.reason === "Error: stale base").length, count * 2);
  }
  const tools = await import(moduleUrl(".atomic/workflows/gitea-mq/tools.ts"));
  assert.deepEqual(tools.proposalBases({ "flake.nix": `100644:${"a".repeat(64)}`, "foreign.nix": "100644:foreign" }, { allowedPaths: ["flake.nix"] }), { "flake.nix": "a".repeat(64) });
  console.log("PASS 3.1 bounds: counts 1/2/3 each permit two unique batches and one G3; authorization/rejection reads persist; scoped bases strip file modes");
  console.log("PASS 3.1/3.2/3.4/3.7: hash proposal schema, commentary-only draft, no dead DNS path, explicit replan row grammar");
}
