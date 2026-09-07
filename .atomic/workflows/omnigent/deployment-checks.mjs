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
  let dumpScript = "";
  for (const changed of [true, false]) {
    let reads = 0;
    const commands = [];
    const run = () => deployment.updateMachine("/mock", source, signal, async (_cwd, command) => {
      commands.push(command);
      if (command.includes("readlink")) return observation(`/nix/store/${++reads === 1 || !changed ? "old" : "new"}`);
      if (command.includes("pg_dump")) return observation(JSON.stringify(dump));
      return observation();
    });
    if (changed) {
      const receipt = await run();
      assert.equal(receipt.before, "/nix/store/old");
      assert.equal(receipt.after, "/nix/store/new");
      assert.equal(receipt.source, source.source);
      assert.deepEqual(receipt.dump, dump);
      assert.equal(receipt.sha, joinSha);
      assert.equal(receipt.chainTipSha, sha);
      assert.deepEqual(receipt.parents, [sha, otherParent]);
      assert(receipt.crossChain.unit && receipt.crossChain.nginxVhostCount && receipt.crossChain.httpsStatus);
      assert(commands[4].includes("systemctl show gitea-mq.service"));
      assert(commands[5].includes("nginx.conf"));
      assert(commands[6].includes("https://mq.scientistexperience.net"));
    } else await assert.rejects(run, /did not change/);
    assert(commands[1].includes("ssh root@magnetite.zt") && commands[1].includes("pg_dump"));
    dumpScript = execFileSync("bash", ["-c", `ssh() { printf '%s' "$2"; }; ${commands[1]}`], { encoding: "utf8" });
    assert(commands[2].includes(source.source) && commands[2].includes('clan machines update magnetite --flake "$SOURCE" 2>&1 | tee'));
  }
  for (const result of [observation("", 1), observation(""), observation(JSON.stringify({ ...dump, bytes: 0 })), observation(JSON.stringify({ bytes: 4096 }))]) {
    const commands = [];
    await assert.rejects(() => deployment.updateMachine("/mock", source, signal, async (_cwd, command) => {
      commands.push(command);
      return command.includes("readlink") ? observation("/nix/store/old") : result;
    }));
    assert(!commands.some((command) => command.includes("clan machines update")), "Missing, empty or failed dump must block activation");
  }
  execFileSync("shellcheck", ["-s", "sh", "-"], { input: dumpScript, stdio: ["pipe", "inherit", "inherit"] });
  let mqScript = "", httpsScript = "";
  for (const [unit, count, status, exitCode] of [["active\nrunning\nenabled", "1", "200", 0], ["inactive\ndead\ndisabled", "0", "503", 0], ["", "", "000", 255]]) {
    const observed = await deployment.probeCrossChain("/mock", signal, async (_cwd, command) => {
      if (command.includes("nginx.conf")) {
        mqScript = execFileSync("bash", ["-c", `ssh() { printf '%s' "$2"; }; ${command}`], { encoding: "utf8" });
        return observation(count, exitCode);
      }
      if (command.includes("https://mq.scientistexperience.net")) {
        httpsScript = command;
        return observation(status, exitCode);
      }
      assert.equal(command, "ssh root@magnetite.zt systemctl show gitea-mq.service -p ActiveState -p SubState -p UnitFileState --value");
      execFileSync("shellcheck", ["-s", "sh", "-"], { input: command, stdio: ["pipe", "inherit", "inherit"] });
      return observation(unit, exitCode);
    });
    assert.equal(observed.unit.stdout, unit);
    assert.equal(observed.nginxVhostCount.stdout, count);
    assert.equal(observed.httpsStatus.stdout, status);
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
  const plan = await planTools.planDns("/mock", "evidence", source, signal);
  assert.equal(plan.plan, "/mock/evidence/dns.tfplan");
  assert.deepEqual(plan.summary, summary);
  assert(commands[0].includes(`${source.source}#terraform.config`) && commands[0].includes(`${source.source}#terraform.terraform`));
  assert(commands[0].includes("init -input=false") && commands[0].includes("plan -input=false -out='/mock/evidence/dns.tfplan'"));
  assert(commands[0].includes("show -json '/mock/evidence/dns.tfplan' > '/mock/evidence/dns.tfplan.json'"));
  assert(commands[0].includes("umask 077") && commands[0].includes("chmod 600"));
  await planTools.applyDns("/mock", plan, signal);
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
