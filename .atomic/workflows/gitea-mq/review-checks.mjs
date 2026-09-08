import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export async function runReviewChecks({ types, tools, slices, moduleUrl }) {
  assert.deepEqual(types.normalizeToolOutcome({ ok: true, value: { x: 1 }, cached: false }), types.normalizeToolOutcome({ ok: true, value: { x: 1 }, cached: true }));
  assert.deepEqual(types.normalizeToolOutcome({ ok: false, error: { message: "failed" }, cached: false }), { ok: false, error: { message: "failed" } });
  assert.deepEqual(types.batches, [1, 2]);
  for (const count of [1, 2, 3]) assert.deepEqual(types.attemptsFor(count), [1, 2, 3].slice(0, count));
  assert.throws(() => types.attemptsFor(4));
  console.log("PASS F1/P7: replay-neutral outcomes and exact bounded schedules");

  const prompts = await import(moduleUrl(".atomic/workflows/gitea-mq/prompts.ts"));
  const protectedText = (text) => [...text.matchAll(/<keepContext>([\s\S]*?)<\/keepContext>/g)].map((m) => m[1]).join("\n");
  assert.match(protectedText(prompts.diagnosePrompt("cwd", "root", "failed-gate-unique", "receipt-unique")), /failed-gate-unique[\s\S]*receipt-unique/);
  assert.match(protectedText(prompts.reviewPrompt("cwd", "root")), /Return Approve only/);
  assert.match(protectedText(prompts.rulesetPrompt("cwd", "root")), /16212553[\s\S]*required_linear_history/);
  assert.match(prompts.registration, /CLAN_NO_COMMIT=1 clan vars set magnetite gitea-mq-github-app-secret-key\/key.pem/);
  assert(!prompts.registration.includes("--no-commit"));
  assert.match(tools.linearComment("/evidence/body.md"), /--body-file '\/evidence\/body.md' --workspace cameronraysmith$/);
  console.log("PASS P10/P12/F3: body-file comments, protected acceptance contracts and no-commit operator commands");

  assert(!slices.rollbackExpr.includes("builtins.toFile"));
  assert.match(slices.rollbackExpr, /import-tree[\s\S]*f.outPath[\s\S]*mkForce/);
  assert.match(readFileSync("modules/machines/nixos/magnetite/default.nix", "utf8"), /\.\/omnigraph\/dev.policy.yaml/);
  assert.match(slices.rollbackExpr, /services.gitea-mq.enable/);
  console.log("PASS F4: rollback retains original module paths and asserts queue removal (syntax only)");
  const { s1TaskArms, s1Coverage } = await import(moduleUrl(".atomic/workflows/gitea-mq/s1-observations.ts"));
  const all = [...new Set(Object.values(s1TaskArms).flat())];
  assert.deepEqual(s1Coverage(all).verifiedTasks.sort(), Object.keys(s1TaskArms).sort());
  for (const [task, arms] of Object.entries(s1TaskArms)) for (const missing of arms) {
    const coverage = s1Coverage(all.filter((arm) => arm !== missing));
    assert(!coverage.verifiedTasks.includes(task));
    assert(coverage.observations.find((row) => row.taskId === task).missing.includes(missing));
  }
  console.log("PASS F7: omitting any required S1 arm prevents that task's verification claim");
}
