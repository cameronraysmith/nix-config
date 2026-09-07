import assert from "node:assert/strict";

const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const observation = (stdout = "") => ({ command: "mock", stdout, stderr: "", exitCode: 0, state: "exited", terminationSignal: null, logPath: "mock.log", tail: "" });

export async function runRecoveryChecks({ moduleUrl }) {
  const bumpUrl = moduleUrl(".atomic/workflows/bump/tools.ts");
  const bump = await import(bumpUrl);
  const mockBump = dataUrl(Object.keys(bump).map((key) => key === "capture"
    ? "export const capture = (...args) => globalThis.__omnigentRecovery.capture(...args);"
    : `export const ${key} = globalThis.__omnigentRecovery.bump.${key};`).join("\n"));
  const code = Buffer.from(moduleUrl(".atomic/workflows/omnigent/tools.ts").split(",")[1], "base64").toString().replaceAll(JSON.stringify(bumpUrl), JSON.stringify(mockBump));
  const proposal = "openspec/changes/deploy-omnigent-magnetite/proposal.md";
  const signal = new AbortController().signal;

  async function recover({ child = false, paths = [], proposalExists = false, bookmarkAtChild = false, verified = [], mutate = () => {} } = {}) {
    const nodes = {
      ssss: { description: "wip(omnigent-magnetite): seed chain", parents: ["pppp"], children: [child ? "kkkk" : "vvvv"] },
      kkkk: { description: "docs(omnigent): amend-plan", parents: ["ssss"], children: ["vvvv"] },
    };
    mutate(nodes);
    const commands = [];
    globalThis.__omnigentRecovery = { bump, capture: async (_cwd, command) => {
      commands.push(command);
      assert(command.startsWith("jj --ignore-working-copy "), `Recovery must be read-only: ${command}`);
      if (command.includes("file list")) return observation(proposalExists ? proposal : "");
      if (command.includes("--name-only")) return observation(paths.join("\n"));
      if (command.includes("bookmarks(")) return observation(bookmarkAtChild ? "kkkk" : "ssss");
      const rev = command.match(/-r '([^']+)'/)[1];
      if (rev.includes("ancestors(@)")) return observation();
      if (rev === "@") return observation("wwww");
      if (rev === "@-" || rev === "wwww-") return observation("vvvv");
      const id = rev.replace(/[-+]$/, "");
      assert(nodes[id], `Unknown mocked revision ${rev}`);
      return observation(rev.endsWith("-") ? nodes[id].parents.join("\n") : rev.endsWith("+") ? nodes[id].children.join("\n") : nodes[id].description);
    } };
    const tools = await import(dataUrl(code + `\n// Mock isolation ${Math.random()}`));
    return { value: await tools.seedChain("/mock", "pppp", "omnigent-magnetite", 0, verified, "wwww", signal), commands };
  }

  for (const child of [false, true]) for (const proposalExists of [false, true]) {
    const { value, commands } = await recover({ child, proposalExists });
    assert.deepEqual(value, { topology: { workingCopy: "wwww", join: "vvvv", seed: "ssss", tip: "ssss" }, changes: [], recovered: true, reused_change: child ? "kkkk" : null, proposal_exists: proposalExists });
    assert.equal(commands.some((command) => command.includes("--name-only")), child);
  }
  for (const bookmarkAtChild of [false, true]) {
    const { value } = await recover({ child: true, bookmarkAtChild, paths: [proposal, "openspec/linear.yaml", "docs/notes/development/omnigent/deployment-plan.md"] });
    assert.equal(value.reused_change, "kkkk");
    assert.deepEqual(value.changes, [], "An unlanded S0 is not a verified slice");
  }
  await assert.rejects(() => recover({ verified: ["kkkk"] }), /exactly the preceding slices/);
  for (const mutate of [
    (nodes) => { nodes.ssss.parents = ["zzzz"]; },
    (nodes) => { nodes.ssss.children.push("zzzz"); },
    (nodes) => { nodes.kkkk.description = "feat(omnigent): package"; },
    (nodes) => { nodes.kkkk.parents.push("zzzz"); },
    (nodes) => { nodes.kkkk.children = ["zzzz"]; },
    (nodes) => { nodes.kkkk.children.push("zzzz"); },
  ]) {
    await assert.rejects(() => recover({ child: true, mutate }), /S0 recovery topology differs: .*"seed".*"child"/);
  }
  await assert.rejects(() => recover({ child: true, paths: ["pkgs/by-name/omnigent/package.nix"] }), /topology differs: .*pkgs\/by-name\/omnigent/);
  for (const reuse of [false, true]) {
    let created = reuse;
    const commands = [];
    globalThis.__omnigentRecovery = { bump, capture: async (_cwd, command) => {
      commands.push(command);
      if (command.startsWith("jj new --no-edit -A 'qqqq' -m ")) {
        assert(!reuse);
        for (const marker of ["feat(omnigent): runtime-environment", "2e71149d3", "2.1.45", "2.1.47", "TMPPREFIX", "auxiliary"]) assert(command.includes(marker));
        created = true;
        return observation();
      }
      assert(command.startsWith("jj --ignore-working-copy "));
      const rev = command.match(/-r '([^']+)'/)[1];
      if (rev.includes("ancestors(@)")) return observation();
      if (rev === "@") return observation("wwww");
      if (rev === "qqqq+") return observation(created ? "rrrr" : "vvvv");
      if (rev === "rrrr+") return observation("vvvv");
      if (rev === "rrrr" && command.includes("--name-only")) return observation("modules/home/ai/claude-code/default.nix");
      if (rev === "rrrr" && command.includes("description.first_line()")) return observation("feat(omnigent): runtime-environment");
      throw Error(`Unexpected S5 command: ${command}`);
    } };
    const tools = await import(dataUrl(code + `\n// Mock isolation ${Math.random()}`));
    const change = await tools.createChange("/mock", { workingCopy: "wwww", join: "vvvv", seed: "ssss", tip: "qqqq" }, 5, signal);
    assert.equal(change, "rrrr");
    assert.equal(commands.filter((command) => command.startsWith("jj new")).length, reuse ? 0 : 1);
  }
  console.log("PASS mocked S5 creation carries deletion justification and existing S5 reuse remains read-only");
  delete globalThis.__omnigentRecovery;
  console.log("PASS read-only S0 recovery: seed-only, empty/nonempty allowed S0, proposal observation, verified list and topology/path rejection");
}
