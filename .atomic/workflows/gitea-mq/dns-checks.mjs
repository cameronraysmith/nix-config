import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source: ~/.local/state/atomic/gitea-mq/run-SLwgvT/adopted-s2.tfplan.json
// SHA-256: f707be5bc1e6c4ebf8733e8f96d649fdf89697fb2af57a900ae68aadec020f69
// The raw artifact contains private keys and external result.secret values.
// Keep only resource identity/actions and the created record's four public fields.
// All no-op after values are null; all other plan/state/configuration is omitted.
function publicProjection(plan) {
  return { resource_changes: plan.resource_changes.map(({ mode, type, address, change }) => ({
    mode, type, address,
    change: { actions: change.actions, after: change.actions[0] === "create"
      ? Object.fromEntries(["name", "type", "content", "proxied"].map((key) => [key, change.after[key]])) : null },
  })) };
}

export function runDnsChecks(tools) {
  const raw = { existingWitness: { resolvers: [{ resolver: "8.8.8.8", queries: [{ command: "dig", stdout: "49.12.12.74", stderr: "" }] }] } };
  assert.throws(() => tools.assertNoRawOutput(raw), /Raw process output.*stdout/);
  assert.throws(() => tools.assertNoRawOutput({ one: { two: { three: { stderr: "" } } } }), /Raw process output.*stderr/);
  assert.doesNotThrow(() => tools.assertNoRawOutput({ note: "stdout is a word, not a key", empty: null }));
  const fixture = JSON.parse(readFileSync(new URL("./adopted-s2.redacted.json", import.meta.url), "utf8"));
  const flag = process.argv.indexOf("--dns-plan");
  const plans = [fixture];
  if (flag !== -1) {
    assert(process.argv[flag + 1], "--dns-plan requires the original artifact path");
    const bytes = readFileSync(process.argv[flag + 1]);
    assert.equal(tools.sha256(bytes), "f707be5bc1e6c4ebf8733e8f96d649fdf89697fb2af57a900ae68aadec020f69", "Expected the exact original plan artifact");
    const original = JSON.parse(bytes.toString("utf8"));
    // Compare only the public projection: never print raw secret-bearing objects.
    assert.deepEqual(publicProjection(original), fixture);
    plans.push(original);
  }
  for (const plan of plans) {
    assert.equal(plan.resource_changes.length, 26);
    assert.equal(plan.resource_changes.filter((r) => r.change.actions.join() === "no-op").length, 25);
    const index = plan.resource_changes.findIndex((r) => r.change.actions.join() === "create");
    assert.equal(plan.resource_changes[index].address, "cloudflare_dns_record.mq");
    assert.equal(plan.resource_changes[index].change.after.name, "mq");
    const expected = { address: "cloudflare_dns_record.mq", action: "create", type: "cloudflare_dns_record", name: "mq.scientistexperience.net" };
    assert.deepEqual(tools.dnsSummary(plan), expected);
    for (const reconciling of [false, true]) {
      assert.deepEqual(tools.dnsDecision(plan, reconciling), { kind: "NeedsApply", summary: expected });
    }
    const fqdn = structuredClone(plan);
    fqdn.resource_changes[index].change.after.name = expected.name;
    assert.deepEqual(tools.dnsSummary(fqdn), expected);
    const blocked = (bad) => {
      assert.throws(() => tools.dnsSummary(bad));
      for (const reconciling of [false, true]) assert.throws(() => tools.dnsDecision(bad, reconciling));
    };
    for (const patch of [
      { name: "other" }, { name: "other.scientistexperience.net" },
      { proxied: true }, { content: "other.scientistexperience.net" }, { type: "A" },
    ]) {
      const bad = structuredClone(plan);
      Object.assign(bad.resource_changes[index].change.after, patch);
      blocked(bad);
    }
    for (const actions of [["create"], ["update"], ["delete"], ["delete", "create"], ["create", "delete"], ["read"], []]) {
      const extra = structuredClone(plan);
      extra.resource_changes.find((r, i) => i !== index).change.actions = actions;
      blocked(extra);
    }
    for (const actions of [["update"], ["delete"], ["delete", "create"], ["create", "delete"]]) {
      const replaced = structuredClone(plan);
      replaced.resource_changes[index].change.actions = actions;
      blocked(replaced);
    }
    const wrongAddress = structuredClone(plan);
    wrongAddress.resource_changes[index].address = "cloudflare_dns_record.other";
    blocked(wrongAddress);
    const record = { address: expected.address, mode: "managed", type: expected.type,
      values: { ...plan.resource_changes[index].change.after } };
    const empty = { resource_changes: [], planned_values: { root_module: { resources: [record] } } };
    for (const reconciling of [false, true]) {
      const decision = tools.dnsDecision(empty, reconciling);
      assert.equal(decision.kind, "Reconciled"); // Existing stage skips apply for this branch.
      assert.equal(decision.outcome, "already-applied");
      assert.equal(decision.record.content, "magnetite.scientistexperience.net");
      assert.equal(tools.dnsDecision({ prior_state: { values: empty.planned_values }, resource_changes: [] }, reconciling).outcome, "already-applied");
      assert.equal(tools.dnsDecision({ format_version: "1.2", planned_values: empty.planned_values }, reconciling).outcome, "already-applied");
      assert.equal(tools.dnsDecision({ ...empty, resource_changes: plan.resource_changes.map((r) => ({ ...r, change: { actions: ["no-op"] } })) }, reconciling).outcome, "already-applied");
      for (const absent of [{ resource_changes: [] }, { resource_changes: [], planned_values: { root_module: {} } }]) {
        assert.throws(() => tools.dnsDecision(absent, reconciling), /record/);
      }
      for (const patch of [{ proxied: true }, { content: "elsewhere" }, { type: "A" }, { name: "other" }]) {
        const bad = structuredClone(empty);
        Object.assign(bad.planned_values.root_module.resources[0].values, patch);
        assert.throws(() => tools.dnsDecision(bad, reconciling));
      }
      const conflict = structuredClone(empty);
      conflict.prior_state = { values: { root_module: { resources: [] } } };
      assert.throws(() => tools.dnsDecision(conflict, reconciling), /record/);
    }
    const output = structuredClone(plan);
    output.output_changes = { unexpected: { actions: ["update"] } };
    for (const reconciling of [false, true]) assert.throws(() => tools.dnsDecision(output, reconciling), /output changes/);
  }
  console.log(`PASS DNS regression: ${flag === -1 ? "redacted real-plan projection" : "exact SHA-256-bound real artifact + redacted projection"}; 1 create/25 no-op, normalized FQDN, strict negative controls`);
}
