import assert from "node:assert/strict";

export async function runJoinEmpirical({ moduleUrl, tools }) {
  const deployment = await import(moduleUrl(".atomic/workflows/omnigent/deployment.ts"));
  const { quote } = await import(moduleUrl(".atomic/workflows/bump/tools.ts"));
  const { joinGateManifest, joinGateSupersessions } = await import(moduleUrl(".atomic/workflows/omnigent/slices.ts"));
  const cwd = process.cwd(), signal = AbortSignal.timeout(60 * 60_000);
  let sequence = 0;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const execute = async (directory, command, gateSignal) => {
    const result = await tools.capture(cwd, directory === cwd ? command : `cd ${quote(directory)}\n${command}`, gateSignal, `logs/omnigent-join-${stamp}-${sequence++}.json`);
    console.log(JSON.stringify({ cwd: directory, command, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, logPath: result.logPath }));
    return result;
  };
  const source = await deployment.resolveJoinSource(cwd, "omnigent-magnetite", "omnigent-magnetite", signal, execute);
  console.log("JOIN", JSON.stringify(source));
  await assert.rejects(() => deployment.assertJoinRevision(cwd, source.chainTipSha, source.chainTipSha, signal, execute), (error) => {
    console.log("EXPECTED REJECTION", String(error));
    return /not a merge commit/.test(String(error));
  });
  const descendant = await deployment.changeSha(cwd, "@", signal, execute);
  await assert.rejects(() => deployment.assertJoinRevision(cwd, source.sha, descendant, signal, execute), (error) => {
    console.log("EXPECTED REJECTION", String(error));
    return /not an ancestor/.test(String(error));
  });
  console.log("JOIN GATE MANIFEST (all declared slices; deploy reaches this set only after all slices land)");
  for (const entry of joinGateManifest) console.log("MANIFEST", JSON.stringify(entry));
  const observeGate = async (gate) => {
    try {
      const result = await tools.runGateSandbox(cwd, [gate], source, signal, execute);
      return result.observations[0];
    } catch (error) {
      signal.throwIfAborted();
      return { sha: source.sha, passed: false, receipt: null, detail: String(error) };
    }
  };
  const observations = [];
  for (const { slice, index, gate, supersession } of joinGateManifest) {
    if (supersession) continue;
    const observation = { slice, index, gate, ...await observeGate(gate) };
    observations.push(observation);
    console.log("JOIN GATE", JSON.stringify(observation));
  }
  const supersessions = [];
  for (const entry of joinGateSupersessions) {
    const old = await observeGate(entry.superseded.gate);
    const replacement = observations.find(({ slice, index }) => slice === entry.superseding.slice && index === entry.superseding.index);
    const observation = { ...entry, old, replacement, witnessed: !old.passed && replacement?.passed === true };
    supersessions.push(observation);
    console.log("SUPERSESSION WITNESS", JSON.stringify(observation));
  }
  const result = { ...source, passed: observations.every((gate) => gate.passed), observations, supersessions };
  console.log("JOIN GATE RESULT", JSON.stringify({ ...source, passed: result.passed, included: observations.length, failed: observations.filter((gate) => !gate.passed).map(({ slice, index }) => ({ slice, index })), supersessionsWitnessed: supersessions.every((entry) => entry.witnessed) }));
  assert(supersessions.every((entry) => entry.witnessed), "Some supersessions lack an old-fail/new-pass witness; inspect observations for execution errors");
  assert(result.passed, "Union gates failed at the current join; unimplemented S10 is not a supersession and must land before deploy; no deployment attempted");
}
