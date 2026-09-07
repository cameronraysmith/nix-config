import assert from "node:assert/strict";
import { writeFile, access } from "node:fs/promises";
import { join } from "node:path";

const observation = (stdout = "", exitCode = 0) => ({ command: "mock", stdout, stderr: "", exitCode, state: "exited", terminationSignal: null, logPath: "mock.log", tail: "" });

export async function runSandboxChecks({ tools, slices }) {
  const sha = "a".repeat(40);
  const source = { sha, source: `git+file:///primary?ref=omnigent-magnetite&rev=${sha}` };
  for (const failure of [false, true]) {
    const events = [];
    let sandbox;
    const execute = async (cwd, command, signal) => {
      events.push({ cwd, command });
      if (command.startsWith("git worktree add --detach")) {
        sandbox = command.match(/--detach '([^']+)'/)[1];
        assert.equal(cwd, "/primary");
        assert(command.endsWith(`'${sha}'`));
        await writeFile(join(sandbox, "slice.txt"), "committed");
      } else if (command.startsWith("git worktree remove --force")) {
        assert.equal(cwd, "/primary");
        assert(!signal.aborted);
      } else {
        assert.equal(cwd, sandbox);
        if (failure) throw Error("gate process failed");
      }
      return observation();
    };
    const run = () => tools.runGateSandbox("/primary", [
      { kind: "GrepAssert", file: "slice.txt", pattern: "^committed$" },
      { kind: "Command", argv: ["openspec", "validate", "deploy-omnigent-magnetite"], expectExitZero: true },
    ], source, new AbortController().signal, execute);
    if (failure) await assert.rejects(run, /gate process failed/);
    else {
      const result = await run();
      assert.equal(result.sha, sha);
      assert(result.passed);
      assert(result.observations.every((gate) => gate.sha === sha && gate.passed));
    }
    assert(events.at(-1).command.startsWith("git worktree remove --force"));
    await assert.rejects(access(sandbox), /ENOENT/);
  }
  const controller = new AbortController();
  const commands = [];
  await assert.rejects(() => tools.runGateSandbox("/primary", [{ kind: "Command", argv: ["abort-gate"], expectExitZero: true }], source, controller.signal, async (_cwd, command, signal) => {
    commands.push(command);
    if (command.includes("abort-gate")) {
      controller.abort();
      signal.throwIfAborted();
    }
    if (command.startsWith("git worktree remove")) assert(!signal.aborted);
    return observation();
  }), /abort/i);
  assert(commands.at(-1).startsWith("git worktree remove --force"));
  for (const slice of slices) for (const gate of slice.gates) {
    if (gate.kind === "GrepAssert") continue;
    const observed = [];
    await tools.runGate("/sandbox", gate, new AbortController().signal, async (cwd, command) => {
      assert.equal(cwd, "/sandbox");
      observed.push(command);
      return observation(gate.kind === "NixEval" ? JSON.stringify(gate.expect.kind === "Equal" ? gate.expect.value : "/nix/store/mock.drv") : "");
    }, { ...source, primary: "/primary" });
    const command = observed[0];
    assert(!command.includes("__OMNIGENT_SOURCE__") && !command.includes(".#") && !command.includes("toString ./.") && !command.includes("path:/sandbox"));
    const workflowOwned = slice.id === 9 && gate.kind === "Command" && gate.argv.at(-1)?.includes("--s9-deployment");
    const sharedRuntime = slice.id === 10 && gate.kind === "Command" && gate.argv[1]?.endsWith("/runtime-contract-checks.py");
    if (workflowOwned) assert.equal(command, `'bash' '-c' 'cd "/primary" && node .atomic/workflows/omnigent/check.mjs --s9-deployment'`);
    else if (slice.id > 0 && !sharedRuntime) assert(command.includes(source.source), command);
    if (gate.kind === "Command" && gate.argv[0] === "python3") {
      const expected = sharedRuntime
        ? "'python3' '/primary/.atomic/workflows/omnigent/runtime-contract-checks.py' '/sandbox'"
        : slice.id === 7
          ? `'python3' '/primary/.atomic/workflows/omnigent/darwin-artifacts.py' '/sandbox' '${source.source}#checks.aarch64-darwin.darwin-stibnite'`
          : slice.id === 10
            ? `'python3' '/primary/.atomic/workflows/omnigent/darwin-artifacts.py' '--runtime-environment' '/sandbox' '${source.source}#checks.aarch64-darwin.darwin-stibnite'`
            : "'python3' '/primary/.atomic/workflows/omnigent/linear-readback.py' '/sandbox'";
      assert.equal(command, expected);
    }
  }
  await assert.rejects(() => tools.runGate("/sandbox", slices[1].gates[0], new AbortController().signal, async () => observation()), /committed source/);
  const stable = await tools.assertChangeSha("/primary", "kkkk", sha, new AbortController().signal, async (_cwd, command) => {
    assert(command.includes("--ignore-working-copy") && command.includes("'kkkk'") && !command.includes("@"));
    return observation(sha);
  });
  assert.deepEqual(stable, { gateSha: sha, observedSha: sha, toolingOnlyDrift: [] });
  const drifted = (files) => async (_cwd, command) => observation(command.includes("git --no-pager diff") ? files : "b".repeat(40));
  await assert.rejects(() => tools.assertChangeSha("/primary", "kkkk", sha, new AbortController().signal, drifted("modules/nixos/omnigent.nix\n.atomic/workflows/omnigent/slices.ts")), /gate=.*observed=/);
  await assert.rejects(() => tools.assertChangeSha("/primary", "kkkk", sha, new AbortController().signal, drifted("")), /gate=.*observed=/);
  assert.deepEqual((await tools.assertChangeSha("/primary", "kkkk", sha, new AbortController().signal, drifted(".atomic/workflows/omnigent/slices.ts"))).toolingOnlyDrift, [".atomic/workflows/omnigent/slices.ts"]);
  console.log("PASS sandbox cleanup on failure/cancellation, committed cwd/files, all Nix source bindings, primary Linear script with sandbox root, and SHA stability receipts");
}
