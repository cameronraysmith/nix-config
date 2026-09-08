import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

/** Exercise the actual capture implementation with fake child streams and disk ports. */
export async function runProcessChecks({ ts, moduleUrl }) {
  const processTools = await import(moduleUrl(".atomic/workflows/gitea-mq/process.ts"));
  const streaming = new processTools.OutputBuffer(true);
  const chunk = "x".repeat(65536);
  for (let i = 0; i < 1024; i++) streaming.append(i % 2 ? "stdout" : "stderr", chunk);
  assert.equal(streaming.stdout.length + streaming.stderr.length, 0);
  assert(Buffer.byteLength(streaming.tail) <= 8192);
  const bounded = new processTools.OutputBuffer(false, 16);
  bounded.append("stdout", "12345678");
  assert.throws(() => bounded.append("stderr", "123456789"), /exceeded/);
  assert.equal(bounded.stdout, "12345678"); assert.equal(bounded.stderr, "");
  const signal = new AbortController().signal;
  let diskBytes = 0, calls = 0, response = "small response";
  const receipts = [];
  globalThis.__mqProcessMock = {
    appendFileSync: (_path, data) => { diskBytes += Buffer.byteLength(data); },
    writeFile: async () => {}, mkdir: async () => {}, mkdtemp: async () => "/outside/run",
    open: async () => {
      let offset = 0;
      return { close: async () => {}, read: async (buffer, start, length) => {
        const bytesRead = Buffer.from(response).copy(buffer, start, offset, offset + length);
        offset += bytesRead; return { bytesRead };
      } };
    },
    save: async (_cwd, path, value) => { receipts.push({ path, value: structuredClone(value) }); },
    spawn: (_exe, args, options) => {
      calls++;
      assert.equal(options.signal, signal);
      assert.equal(options.env.CLAN_NO_COMMIT, "1");
      assert.equal(options.detached, true);
      const child = new EventEmitter();
      for (const stream of ["stdout", "stderr"]) { child[stream] = new EventEmitter(); child[stream].setEncoding = () => child[stream]; }
      queueMicrotask(() => {
        for (let i = 0; i < 128; i++) child[i % 2 ? "stdout" : "stderr"].emit("data", chunk);
        child.emit("close", 0, null);
      });
      return child;
    },
  };
  const port = (name) => `export const ${name} = (...args) => globalThis.__mqProcessMock.${name}(...args);`;
  const bumpModule = dataUrl(`export * from "${moduleUrl(".atomic/workflows/bump/tools.ts")}";\n${port("save")}`);
  const fsModule = dataUrl(["writeFile", "mkdir", "mkdtemp", "open"].map(port).join("\n"));
  let code = ts.transpileModule(readFileSync(".atomic/workflows/gitea-mq/process.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  code = code.replace(/from "([^"]+)"/g, (whole, name) => {
    if (name === "node:child_process") return `from "${dataUrl(port("spawn"))}"`;
    if (name === "node:fs") return `from "${dataUrl(port("appendFileSync"))}"`;
    if (name === "node:fs/promises") return `from "${fsModule}"`;
    if (name === "../bump/tools.js") return `from "${bumpModule}"`;
    if (name.startsWith(".")) return `from "${moduleUrl(resolve(".atomic/workflows/gitea-mq", name.replace(/\.js$/, ".ts")))}"`;
    return whole;
  });
  const actual = await import(dataUrl(code));
  const streamed = await actual.processCheckpoint("../evidence", "build", () => actual.captureStreaming("/mock", "build", signal).then((result) => {
    assert.equal(result.stdout, ""); assert.equal(result.stderr, "");
    assert(Buffer.byteLength(result.tail) <= 8192);
    return { exitCode: result.exitCode };
  }));
  assert.equal(streamed.receipt.length, 1);
  assert.equal(diskBytes, 128 * 65536);
  assert.equal(receipts.at(-1).value.state, "exited");
  await assert.rejects(() => actual.processCheckpoint("../evidence", "json", () => actual.capture("/mock", "json-response", signal)), /exceeded/);
  assert.equal(receipts.at(-1).value.state, "failed");
  assert.equal(calls, 2);
  assert.equal(await actual.readResponse("/response"), response);
  response = "x".repeat(processTools.responseLimit + 1);
  await assert.rejects(() => actual.readResponse("/response"), /byte limit/);
  console.log("PASS F8/F3: disk-only streaming, bounded failing responses, finite tails and inherited Clan no-commit environment");
  delete globalThis.__mqProcessMock;
}
