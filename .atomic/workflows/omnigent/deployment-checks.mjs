import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const observation = (stdout = "", exitCode = 0) => ({ command: "mock", stdout, stderr: "", exitCode, state: "exited", terminationSignal: null, logPath: "mock.log", tail: "" });

export async function runDeploymentChecks({ moduleUrl }) {
  const signal = new AbortController().signal;
  const deployment = await import(moduleUrl(".atomic/workflows/omnigent/deployment.ts"));
  const tools = await import(moduleUrl(".atomic/workflows/omnigent/tools.ts"));
  const { hostEnvironment } = await import(moduleUrl(".atomic/workflows/omnigent/slices.ts"));
  const checkpoint = async (node, action) => {
    const result = await tools.processCheckpoint("unused-mock-root", node, action);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    return result.evidence;
  };
  await assert.rejects(() => checkpoint("raw-regression", async () => ({ nested: [observation("side effect succeeded")] })), /Raw process output cannot enter a checkpoint/);
  await checkpoint("cross-chain-projection", () => deployment.probeCrossChain("/mock", signal, async () => observation("active")));
  const sha = "a".repeat(40), name = "omnigent-magnetite";
  for (const needsExport of [false, true]) {
    const commands = [];
    let exported = !needsExport;
    const source = await deployment.resolveSource("/mock", "nnnn", name, signal, async (_cwd, command) => {
      commands.push(command);
      if (command.includes("-T commit_id")) return observation(sha);
      if (command === "jj git export") { exported = true; return observation(); }
      return observation(exported ? `${sha} refs/heads/${name}` : "", exported ? 0 : 1);
    });
    assert.deepEqual(source, { sha, source: `git+file:///mock?ref=${name}&rev=${sha}` });
    assert.equal(commands.filter((command) => command === "jj git export").length, Number(needsExport));
    assert(commands[0].includes("--ignore-working-copy") && !commands[0].includes("@"));
  }
  let exports = 0;
  await assert.rejects(() => deployment.resolveSource("/mock", "nnnn", name, signal, async (_cwd, command) => {
    if (command === "jj git export") exports++;
    return observation(command.includes("-T commit_id") ? sha : "wrong-ref");
  }), /not exported/);
  assert.equal(exports, 1);
  const revisionCommands = [];
  const prior = await deployment.resolveRevisionSource("/mock", "kkkk", name, signal, async (_cwd, command) => {
    revisionCommands.push(command);
    return observation(command.includes("-T commit_id") ? sha : "");
  });
  assert.deepEqual(prior, deployment.committedSource("/mock", sha, name));
  assert(!revisionCommands.some((command) => command.includes("show-ref")), "Resume pins preceding changes without requiring the tip bookmark to equal them");
  assert(revisionCommands.some((command) => command.includes(`git cat-file -e '${sha}^{commit}'`)));
  await assert.rejects(() => deployment.changeSha("/mock", "kkkk", signal, async () => observation("not-a-sha")), /Invalid change git commit/);
  const joinSha = "b".repeat(40), otherParent = "c".repeat(40);
  for (const needsExport of [false, true]) {
    const commands = [];
    let exported = !needsExport;
    const joined = await deployment.resolveJoinSource("/mock", "nnnn", name, signal, async (_cwd, command) => {
      commands.push(command);
      if (command.includes("-T commit_id")) return observation(command.includes("'@-'") ? joinSha : sha);
      if (command === "jj git export") { exported = true; return observation(); }
      if (command.includes("show-ref")) return observation(`${sha} refs/heads/${name}`);
      if (command.includes("cat-file") && command.includes(joinSha)) return observation("", exported ? 0 : 1);
      if (command.includes("rev-list")) return observation(`${joinSha} ${sha} ${otherParent}`);
      return observation();
    });
    assert.deepEqual(joined, { sha: joinSha, chainTipSha: sha, parents: [sha, otherParent], source: `git+file:///mock?rev=${joinSha}` });
    assert.equal(commands.filter((command) => command === "jj git export").length, Number(needsExport));
    assert(commands.includes("jj --ignore-working-copy log -r '@-' --no-graph -T commit_id"));
    assert(commands.some((command) => command.includes(`merge-base --is-ancestor '${sha}' '${joinSha}'`)));
  }
  for (const [parents, ancestor, message] of [[[], true, /not a merge commit/], [[sha], true, /not a merge commit/], [[sha, otherParent], false, /not an ancestor/]]) {
    await assert.rejects(() => deployment.assertJoinRevision("/mock", joinSha, sha, signal, async (_cwd, command) => observation(command.includes("rev-list") ? [joinSha, ...parents].join(" ") : "", command.includes("merge-base") && !ancestor ? 1 : 0)), (error) => message.test(String(error)) && String(error).includes(joinSha) && String(error).includes(sha));
  }
  console.log("PASS join revision URL, one export retry, merge-parent and chain-ancestor guards (mocked git/jj)");

  const dns = { address: "cloudflare_dns_record.omni", mode: "managed", type: "cloudflare_dns_record", change: { actions: ["create"], after: { name: "omni.scientistexperience.net" } } };
  const summary = deployment.dnsPlanSummary({ resource_changes: [dns] });
  assert.equal(summary.action, "create");
  assert.deepEqual(deployment.dnsPlanSummary({ resource_changes: [dns, { ...dns, change: { actions: ["no-op"], after: {} } }] }), summary);
  assert.throws(() => deployment.dnsPlanSummary({ resource_changes: [] }), /no existing omni record/);
  assert.equal(deployment.dnsPlanSummary({ resource_changes: [{ ...dns, change: { actions: ["no-op"], after: { name: "omni.scientistexperience.net" } } }] }).action, "no-op");
  for (const resources of [[dns, dns], [{ ...dns, type: "hcloud_server" }], [{ ...dns, mode: "data" }], [{ ...dns, change: { ...dns.change, after: { name: "foreign.example" } } }], ...[["update"], ["delete"], ["delete", "create"], ["read"]].map((actions) => [{ ...dns, change: { ...dns.change, actions } }])]) {
    assert.throws(() => deployment.dnsPlanSummary({ resource_changes: resources }), /exactly one create/);
  }
  assert.throws(() => deployment.dnsPlanSummary({}), /Malformed/);
  const source = { sha: joinSha, chainTipSha: sha, parents: [sha, otherParent], source: `git+file:///mock?rev=${joinSha}` };
  const dump = { path: "/var/backups/omnigent/omnigent-20260909T120000Z-123.sql", bytes: 4096 };
  const expected = `/nix/store/${"1".repeat(32)}-nixos-system-magnetite-new`;
  const previous = `/nix/store/${"2".repeat(32)}-nixos-system-magnetite-old`;
  const skipCommands = [];
  const skipped = await checkpoint("update-machine-already-activated", () => deployment.updateMachine("/mock", source, signal, async (_cwd, command) => {
    skipCommands.push(command);
    if (command.startsWith("nix eval") || command.includes("readlink")) return observation(expected);
    assert(!/pg_dump|clan machines update/.test(command), "Already activated generation must not repeat dump or activation");
    return observation();
  }));
  assert.equal(skipped.activation.alreadyActivated, true);
  assert.equal(skipped.outcome, "already-activated");
  assert.equal(skipped.before, expected);
  assert.equal(skipped.after, expected);
  assert.equal(skipped.dump, null);
  assert.equal(skipped.log, null);
  assert.equal(skipCommands.filter((command) => command.startsWith("nix eval")).length, 1);
  let installed = previous, updates = 0, dumps = 0;
  const interruptedExecute = async (_cwd, command) => {
    if (command.startsWith("nix eval")) return observation(expected);
    if (command.includes("readlink")) return observation(installed);
    if (command.includes("pg_dump")) { dumps++; return observation(JSON.stringify(dump)); }
    if (command.includes("clan machines update")) { updates++; installed = expected; }
    return observation();
  };
  await assert.rejects(() => checkpoint("interrupted-update", async () => {
    await deployment.updateMachine("/mock", source, signal, interruptedExecute);
    throw Error("simulated checkpoint interruption after activation");
  }), /simulated checkpoint interruption/);
  const resumed = await checkpoint("resumed-update", () => deployment.updateMachine("/mock", source, signal, interruptedExecute));
  assert.equal(resumed.outcome, "already-activated");
  assert.equal(updates, 1);
  assert.equal(dumps, 1);
  console.log("PASS interrupted post-activation checkpoint re-entry: exactly one dump and one clan update across both attempts");
  let dumpScript = "";
  for (const after of [expected, previous, `/nix/store/${"3".repeat(32)}-nixos-system-magnetite-foreign`]) {
    let reads = 0;
    const commands = [];
    const run = () => checkpoint("update-machine", () => deployment.updateMachine("/mock", source, signal, async (_cwd, command) => {
      commands.push(command);
      if (command.startsWith("nix eval")) return observation(expected);
      if (command.includes("readlink")) return observation(++reads === 1 ? previous : after);
      if (command.includes("pg_dump")) return observation(JSON.stringify({ ...dump, stdout: "must not escape parsed receipt" }));
      return observation();
    }));
    if (after === expected) {
      const receipt = await run();
      assert.equal(receipt.before, previous);
      assert.equal(receipt.after, expected);
      assert.deepEqual(receipt.activation, { expected, current: previous, alreadyActivated: false });
      assert.equal(receipt.outcome, "activated");
      console.log("RECEIPT update-machine " + JSON.stringify(receipt));
      assert.equal(receipt.source, source.source);
      assert.deepEqual(receipt.dump, dump);
      assert.equal(receipt.sha, joinSha);
      assert.equal(receipt.chainTipSha, sha);
      assert.deepEqual(receipt.parents, [sha, otherParent]);
      assert(receipt.crossChain.unit && receipt.crossChain.nginxVhostCount && receipt.crossChain.httpsStatus);
      assert(commands[5].includes("systemctl show gitea-mq.service"));
      assert(commands[6].includes("nginx.conf"));
      assert(commands[7].includes("https://mq.scientistexperience.net"));
    } else await assert.rejects(run, /does not match intended source/);
    assert(commands[2].includes("ssh root@magnetite.zt") && commands[2].includes("pg_dump"));
    dumpScript = execFileSync("bash", ["-c", `ssh() { printf '%s' "$2"; }; ${commands[2]}`], { encoding: "utf8" });
    assert(commands[3].includes(source.source) && commands[3].includes('clan machines update magnetite --flake "$SOURCE" 2>&1 | tee'));
    for (const command of commands) execFileSync("shellcheck", ["-s", "bash", "-"], { input: command, stdio: ["pipe", "inherit", "inherit"] });
  }
  for (const result of [observation("", 1), observation(""), observation(JSON.stringify({ ...dump, bytes: 0 })), observation(JSON.stringify({ bytes: 4096 }))]) {
    const commands = [];
    await assert.rejects(() => deployment.updateMachine("/mock", source, signal, async (_cwd, command) => {
      commands.push(command);
      if (command.startsWith("nix eval")) return observation(expected);
      return command.includes("readlink") ? observation(previous) : result;
    }));
    assert(!commands.some((command) => command.includes("clan machines update")), "Missing, empty or failed dump must block activation");
  }
  for (const [intended, current] of [[observation(""), observation(previous)], [observation(expected, 1), observation(previous)], [observation(expected), observation("not-a-store-path")], [observation(expected), observation(previous, 255)]]) {
    const commands = [];
    await assert.rejects(() => deployment.updateMachine("/mock", source, signal, async (_cwd, command) => {
      commands.push(command);
      assert(command.startsWith("nix eval") || command.includes("readlink"));
      return command.startsWith("nix eval") ? intended : current;
    }));
    assert(!commands.some((command) => /pg_dump|clan machines update/.test(command)));
  }
  console.log("PASS checkpoint JSON round trips and activation reconciliation: already activated skips effects; differing source dumps then updates; unchanged/wrong generation and unavailable evidence fail closed");
  execFileSync("shellcheck", ["-s", "sh", "-"], { input: dumpScript, stdio: ["pipe", "inherit", "inherit"] });
  let mqScript = "", httpsScript = "";
  for (const [unit, count, status, exitCode] of [["ActiveState=active\nSubState=running\nUnitFileState=enabled", "1", "200", 0], ["ActiveState=inactive\nSubState=dead\nUnitFileState=disabled", "0", "503", 0], ["", "", "000", 255]]) {
    const observed = await checkpoint("cross-chain", () => deployment.probeCrossChain("/mock", signal, async (_cwd, command) => {
      if (command.includes("nginx.conf")) {
        mqScript = execFileSync("bash", ["-c", `ssh() { printf '%s' "$2"; }; ${command}`], { encoding: "utf8" });
        return observation(count, exitCode);
      }
      if (command.includes("https://mq.scientistexperience.net")) {
        httpsScript = command;
        return observation(status, exitCode);
      }
      assert.equal(command, "ssh root@magnetite.zt systemctl show gitea-mq.service -p ActiveState -p SubState -p UnitFileState");
      execFileSync("shellcheck", ["-s", "sh", "-"], { input: command, stdio: ["pipe", "inherit", "inherit"] });
      return observation(unit, exitCode);
    }));
    assert.deepEqual(observed.unit.value, exitCode ? null : Object.fromEntries(unit.split("\n").map((line) => { const [key, value] = line.split("="); return [key[0].toLowerCase() + key.slice(1), value]; })));
    assert.equal(observed.nginxVhostCount.value, exitCode ? null : Number(count));
    assert.equal(observed.httpsStatus.value, exitCode ? null : Number(status));
    for (const field of ["unit", "nginxVhostCount", "httpsStatus"]) assert.equal(observed[field].receipt.exitCode, exitCode);
  }
  const unavailable = await deployment.probeCrossChain("/mock", signal, async () => { throw Error("ssh unavailable"); });
  assert.equal(unavailable.unit.error, "Error: ssh unavailable");
  assert.equal(unavailable.nginxVhostCount.error, "Error: ssh unavailable");
  assert.equal(unavailable.httpsStatus.error, "Error: ssh unavailable");
  execFileSync("shellcheck", ["-s", "sh", "-"], { input: httpsScript, stdio: ["pipe", "inherit", "inherit"] });
  const statusScript = `curl() { test "$*" = '-s -o /dev/null -w %{http_code}\\n --max-time 30 https://mq.scientistexperience.net' || return 99; printf '503\\n'; }; ${httpsScript}`;
  execFileSync("shellcheck", ["-s", "sh", "-"], { input: statusScript, stdio: ["pipe", "inherit", "inherit"] });
  const statusOnly = spawnSync("sh", ["-c", statusScript], { encoding: "utf8" });
  assert.equal(statusOnly.status, 0, statusOnly.stderr);
  assert.equal(statusOnly.stdout, "503\n");
  execFileSync("shellcheck", ["-s", "sh", "-"], { input: mqScript, stdio: ["pipe", "inherit", "inherit"] });
  for (const [contents, expected] of [["server_name mq.scientistexperience.net;", "1\n"], ["  server_name mq.scientistexperience.net ;", "1\n"], ["server_name omni.scientistexperience.net;", "0\n"]]) {
    const directory = mkdtempSync(join(tmpdir(), "omnigent-mq-count-"));
    try {
      const script = `cfg=$(mktemp)
trap 'rm -f "$cfg"' EXIT
printf '%s\\n' '${contents}' > "$cfg"
${mqScript.slice(mqScript.indexOf('test -n "$cfg"'))}`;
      execFileSync("shellcheck", ["-s", "sh", "-"], { input: script, stdio: ["pipe", "inherit", "inherit"] });
      const result = spawnSync("sh", ["-c", script], { cwd: directory, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, expected);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  console.log("PASS cross-chain ActiveState/SubState/UnitFileState, nginx count and HTTPS status-only receipts; inactive, HTTP error, SSH and spawn failures do not gate deployment; probe ShellCheck");
  for (const fault of ["none", "failed", "empty", "missing"]) {
    const directory = mkdtempSync(join(tmpdir(), "omnigent-dump-"));
    try {
      const script = `runuser() {
  test "$*" = '-u postgres -- pg_dump --dbname=omnigent' || return 99
  ${fault === "failed" ? 'printf partial; return 1' : fault === "empty" ? ':' : fault === "missing" ? 'rm -f "$dump"' : "printf 'database dump'"}
}
${dumpScript.replaceAll("/var/backups/omnigent", directory)}`;
      const result = spawnSync("sh", ["-c", script], { encoding: "utf8" });
      assert.equal(result.status === 0, fault === "none", `${fault}: ${result.stderr}`);
      if (fault === "none") {
        const receipt = JSON.parse(result.stdout);
        assert.match(receipt.path, /omnigent-\d{8}T\d{6}Z-.+\.sql$/);
        assert.equal(receipt.bytes, Buffer.byteLength("database dump"));
        assert.equal(readFileSync(receipt.path, "utf8"), "database dump");
        assert.deepEqual(JSON.parse(readFileSync(`${receipt.path}.receipt.json`, "utf8")), receipt);
        for (const path of [receipt.path, `${receipt.path}.receipt.json`]) assert.equal(statSync(path).mode & 0o777, 0o600);
      } else assert.equal(result.stdout, "", "Failed dump must not publish a receipt");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  const bumpUrl = moduleUrl(".atomic/workflows/bump/tools.ts"), bump = await import(bumpUrl);
  const realRoot = `logs/omnigent-checkpoint-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const realProcess = () => bump.capture(process.cwd(), "printf 'side effect succeeded\\n'", signal);
  await assert.rejects(() => tools.processCheckpoint(realRoot, "raw", realProcess), /Raw process output cannot enter a checkpoint/);
  const projected = await tools.processCheckpoint(realRoot, "projected", async () => bump.processReceipt(await realProcess()));
  assert.deepEqual(JSON.parse(JSON.stringify(projected)), projected);
  assert.equal(projected.evidence.exitCode, 0);
  assert.equal(projected.evidence.tail, "side effect succeeded\n");
  console.log("PASS real printf process exits 0: raw callback rejected, selected ProcessReceipt accepted and JSON-round-tripped");
  const mockBump = dataUrl(Object.keys(bump).map((key) => key === "capture" ? "export const capture = (...args) => globalThis.__omnigentEffects.capture(...args);" : `export const ${key} = globalThis.__omnigentEffects.bump.${key};`).join("\n"));
  const mockFs = dataUrl("export const readFile = async (path, encoding) => { const value = globalThis.__omnigentEffects.files.get(path); if (value === undefined) throw Error('Missing mocked file: ' + path); return encoding ? value : Buffer.from(value); };");
  const files = new Map([["/mock/evidence/dns.tfplan", "saved-plan"], ["/mock/evidence/dns.tfplan.json", JSON.stringify({ resource_changes: [dns] })]]);
  const commands = [];
  globalThis.__omnigentEffects = { bump, files, capture: async (_cwd, command) => { commands.push(command); return observation(); } };
  const mocked = async (path, replaceFs = false) => {
    let code = Buffer.from(moduleUrl(path).split(",")[1], "base64").toString();
    code = code.replaceAll(JSON.stringify(bumpUrl), JSON.stringify(mockBump));
    if (replaceFs) code = code.replace('from "node:fs/promises"', `from "${mockFs}"`);
    return import(dataUrl(code));
  };
  const planTools = await mocked(".atomic/workflows/omnigent/deployment.ts", true);
  const plan = await checkpoint("plan-dns", () => planTools.planDns("/mock", "evidence", source, signal));
  console.log("RECEIPT plan-dns " + JSON.stringify(plan));
  assert.equal(plan.plan, "/mock/evidence/dns.tfplan");
  assert.deepEqual(plan.summary, summary);
  assert(commands[0].includes(`${source.source}#terraform.config`) && commands[0].includes(`${source.source}#terraform.terraform`));
  assert(commands[0].includes("init -input=false") && commands[0].includes("plan -input=false -out='/mock/evidence/dns.tfplan'"));
  assert(commands[0].includes("show -json '/mock/evidence/dns.tfplan' > '/mock/evidence/dns.tfplan.json'"));
  assert(commands[0].includes("umask 077") && commands[0].includes("chmod 600"));
  const applied = await checkpoint("apply-dns", () => planTools.applyDns("/mock", plan, signal));
  console.log("RECEIPT apply-dns " + JSON.stringify(applied));
  assert(commands[1].includes("apply -input=false '/mock/evidence/dns.tfplan'"));
  files.set(plan.plan, "concurrently-replaced-plan");
  await assert.rejects(() => planTools.applyDns("/mock", plan, signal), /changed after review/);
  assert.equal(commands.length, 2, "Changed plans must not reach apply");

  const resumeTools = await mocked(".atomic/workflows/omnigent/tools.ts");
  const revisions = { "@-": "rrrr", "@": "wwww", "omnigent-magnetite": "kkkk", "kkkk-": "ssss", "ssss-": "pppp", "wwww-": "rrrr", "ssss+": "kkkk", "kkkk+": "rrrr" };
  const observed = [];
  globalThis.__omnigentEffects.capture = async (_cwd, command) => {
    observed.push(command);
    assert(command.startsWith("jj --ignore-working-copy"), "Resume must not mutate topology");
    if (command.includes("diff")) return observation("docs/notes/development/omnigent/deployment-plan.md");
    if (command.includes("description.first_line()")) { const m = command.match(/-r '([^']+)'/); return observation(m && m[1] === "tttt" ? "unrelated change" : "wip(omnigent-magnetite): seed chain"); }
    const rev = command.match(/-r '([^']+)'/)[1];
    if (rev.includes("ancestors")) return observation();
    if (rev === "tttt+") return observation("rrrr");
    assert(revisions[rev], `Unexpected revset ${rev}`);
    return observation(revisions[rev]);
  };
  const recovered = await resumeTools.seedChain("/mock", "pppp", name, 1, ["kkkk"], "wwww", signal);
  assert.deepEqual(recovered.topology, { workingCopy: "wwww", join: "rrrr", seed: "ssss", tip: "kkkk" });
  assert.equal(recovered.changes[0].verified, false, "Topology recovery alone is not gate verification");
  revisions["kkkk+"] = "tttt";
  await assert.rejects(() => resumeTools.seedChain("/mock", "pppp", name, 1, ["kkkk"], "wwww", signal), /sole child/);
  revisions["kkkk+"] = "rrrr";
  revisions[name] = "llll";
  await assert.rejects(() => resumeTools.seedChain("/mock", "pppp", name, 1, ["kkkk"], "wwww", signal), /bookmark/);
  delete globalThis.__omnigentEffects;

  let runnerScript = "";
  await tools.probeRunner("/mock", signal, async (_cwd, command) => {
    runnerScript = execFileSync("bash", ["-c", `ssh() { printf '%s' "$2"; }; ${command}`], { encoding: "utf8" });
    return observation("env_0=true\nenv_1=true\nenv_2=true\nserver=true");
  });
  execFileSync("shellcheck", ["-s", "sh", "-"], { input: runnerScript, stdio: ["pipe", "inherit", "inherit"] });
  for (const environment of [hostEnvironment.join(" "), hostEnvironment.map((value) => `"${value}"`).join(" "), hostEnvironment.slice(1).join(" ")]) {
    const script = `systemctl() { case "$4" in Environment) printf '%s' '${environment}';; ExecStart) printf '%s' '--server https://omni.scientistexperience.net';; esac; }\n${runnerScript}`;
    const result = spawnSync("sh", ["-c", script], { encoding: "utf8" });
    assert.equal(result.status, environment.includes(hostEnvironment[0]) ? 0 : 1);
    assert(!result.stdout.includes("PI_") && !result.stdout.includes("https://"), "Probe logs must contain only booleans");
  }
  console.log("PASS pinned git export/source, DNS-only saved plan and hash guard, fail-closed pre-update dump with durable private receipt (success/failed/empty/missing shell fixtures), changed activation path, fail-closed topology recovery, POSIX probes and ShellCheck (mocked remote effects)");
}

export async function runLiveActivationCheck({ moduleUrl, sourceReceipt }) {
  const deployment = await import(moduleUrl(".atomic/workflows/omnigent/deployment.ts"));
  const bump = await import(moduleUrl(".atomic/workflows/bump/tools.ts"));
  const source = JSON.parse(readFileSync(sourceReceipt, "utf8")).value.evidence;
  assert.match(source.sha, /^[a-f0-9]{40}$/);
  assert.equal(source.source, `git+file://${process.cwd()}?rev=${source.sha}`);
  const signal = AbortSignal.timeout(600_000);
  const commands = [];
  const allowed = new Set([
    `nix eval --no-write-lock-file --raw ${bump.quote(`${source.source}#nixosConfigurations.magnetite.config.system.build.toplevel.outPath`)}`,
    "ssh root@magnetite.zt readlink /run/current-system",
    "ssh root@magnetite.zt systemctl show gitea-mq.service -p ActiveState -p SubState -p UnitFileState",
    `ssh root@magnetite.zt ${bump.quote(`cfg=$(systemctl show nginx -p ExecStart --value | grep -o '/nix/store/[a-z0-9]*-nginx.conf')
test -n "$cfg" || exit 1
grep -Ec '^[[:space:]]*server_name[[:space:]]+mq[.]scientistexperience[.]net[[:space:]]*;' "$cfg"
status=$?
test "$status" -le 1`)}`,
    "curl -s -o /dev/null -w '%{http_code}\\n' --max-time 30 https://mq.scientistexperience.net",
  ]);
  const root = `logs/omnigent-live-activation-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const receipt = await bump.processCheckpoint(root, "update-machine", () => deployment.updateMachine(process.cwd(), source, signal, async (cwd, command, signal) => {
    commands.push(command);
    assert(allowed.has(command), `Live check refuses command: ${command}`);
    execFileSync("shellcheck", ["-s", "bash", "-"], { input: command, stdio: ["pipe", "inherit", "inherit"] });
    console.log("COMMAND " + command);
    const result = await bump.capture(cwd, command, signal);
    console.log("RESULT " + JSON.stringify(bump.processReceipt(result)));
    return result;
  }));
  assert.deepEqual(JSON.parse(JSON.stringify(receipt)), receipt);
  assert.equal(receipt.evidence.outcome, "already-activated");
  assert.equal(receipt.evidence.activation.alreadyActivated, true);
  assert(commands.every((command) => allowed.has(command)));
  assert(!commands.some((command) => /clan machines update|pg_dump/.test(command)));
  console.log("RECEIPT live update-machine " + JSON.stringify(receipt));
  console.log("PASS already activated at pinned source toplevel; zero clan updates and zero dumps; live read-only checkpoint JSON round trip");
}
