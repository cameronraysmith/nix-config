import { AsyncLocalStorage } from "node:async_hooks";
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile, open, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, relative, join } from "node:path";
import { Blocked } from "../bump/types.js";
import { assertCompactCheckpoint, processReceipt, save, type Observation, type ProcessReceipt } from "../bump/tools.js";

export const responseLimit = 1024 * 1024;
export const tailLimit = 8192;
type Context = { root: string; node: string; next: number; receipts: (ProcessReceipt & { cwd: string })[] };
const context = new AsyncLocalStorage<Context>();

export function assertExternalEvidence(cwd: string, root: string): void {
  const path = relative(resolve(cwd), resolve(cwd, root));
  if (path !== ".." && !path.startsWith(`../`)) throw new Blocked("Evidence must be outside the source tree");
}
/** Both roots must exist. Return the physical destination so minting does not
 * subsequently follow a lexically external evidence ancestor into the repo. */
export async function canonicalExternalEvidence(cwd: string, root: string): Promise<string> {
  assertExternalEvidence(cwd, root);
  const [repository, evidence] = await Promise.all([realpath(cwd), realpath(resolve(cwd, root))]);
  assertExternalEvidence(repository, evidence);
  return evidence;
}
export async function allocateEvidence(cwd: string): Promise<string> {
  const base = resolve(process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"), "atomic/gitea-mq");
  assertExternalEvidence(cwd, base);
  await mkdir(base, { recursive: true, mode: 0o700 });
  return relative(cwd, await canonicalExternalEvidence(cwd, await mkdtemp(join(base, "run-"))));
}
export async function processCheckpoint<T>(root: string, node: string, action: () => Promise<T>) {
  const state: Context = { root, node, next: 0, receipts: [] };
  return context.run(state, async () => {
    const checkpoint = { receipt: state.receipts, evidence: await action() };
    assertCompactCheckpoint(checkpoint);
    return checkpoint;
  });
}

/** Bounds parsed responses; streaming mode retains only the diagnostic tail. */
export class OutputBuffer {
  stdout = "";
  stderr = "";
  tail = "";
  private bytes = 0;
  constructor(readonly streaming: boolean, readonly limit = responseLimit) {}
  append(stream: "stdout" | "stderr", data: string): void {
    this.tail = Buffer.from(this.tail + data).subarray(-tailLimit).toString("utf8").replace(/^\uFFFD/, "");
    if (this.streaming) return;
    this.bytes += Buffer.byteLength(data);
    if (this.bytes > this.limit) throw new Blocked(`Parsed process response exceeded ${this.limit} bytes; see disk log`);
    this[stream] += data;
  }
}
type OutputRedactor = (stream: "stdout" | "stderr", output: string) => string;
/** Redact complete lines before disk/tail capture, including split chunks. Keep
 * only a bounded pending line; an oversized line is withheld, not truncated. */
export class RedactedLines {
  private pending = "";
  private oversized = false;
  constructor(private readonly redact: (line: string) => string, private readonly emit: (text: string) => void) {}
  append(data: string): void {
    const parts = data.split("\n");
    for (const [index, part] of parts.entries()) {
      if (!this.oversized) {
        if (Buffer.byteLength(this.pending) + Buffer.byteLength(part) > tailLimit) { this.pending = ""; this.oversized = true; }
        else this.pending += part;
      }
      if (index < parts.length - 1) this.flush(true);
    }
  }
  flush(newline = false): void {
    if (newline || this.pending || this.oversized) this.emit((this.oversized ? "[overlong output line withheld]" : this.redact(this.pending)) + (newline ? "\n" : ""));
    this.pending = ""; this.oversized = false;
  }
}
async function execute(cwd: string, command: string, signal: AbortSignal, streaming: boolean, redact?: OutputRedactor): Promise<Observation> {
  signal.throwIfAborted();
  const state = context.getStore();
  if (!state) throw new Blocked("Process capture requires a durable process checkpoint");
  const receiptPath = `${state.root}/${state.node}-${state.next++}.json`;
  const logPath = receiptPath.replace(/\.json$/, ".log");
  const buffer = new OutputBuffer(streaming);
  const observation: Observation = { command, stdout: "", stderr: "", tail: "", exitCode: -1, state: "running", terminationSignal: null, logPath };
  // Shared save uses join(), which does not preserve an absolute second path.
  // Resolve the artifact separately; never change subprocess cwd to compensate.
  await save(cwd, relative(cwd, resolve(cwd, receiptPath)), { ...processReceipt(observation), cwd: resolve(cwd) });
  await writeFile(resolve(cwd, logPath), "", { mode: 0o600 });
  let failure: Error | undefined;
  const streamingRedactors = streaming && redact ? Object.fromEntries((["stdout", "stderr"] as const).map((stream) => [stream,
    new RedactedLines((line) => redact(stream, line), (text) => {
      appendFileSync(resolve(cwd, logPath), text);
      buffer.append(stream, text);
    }),
  ])) as Record<"stdout" | "stderr", RedactedLines> : undefined;
  await new Promise<void>((done) => {
    // CLAN_NO_COMMIT also reaches clan calls nested in Python and Terraform wrappers.
    const child = spawn("bash", ["-c", `set -euo pipefail\n${command}`], {
      cwd, signal, detached: true, env: { ...process.env, CLAN_NO_COMMIT: "1" },
    });
    const terminate = () => {
      if (child.pid) try { process.kill(-child.pid, "SIGKILL"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") failure ??= error as Error; }
    };
    signal.addEventListener("abort", terminate, { once: true });
    if (signal.aborted) terminate();
    for (const stream of ["stdout", "stderr"] as const) child[stream].setEncoding("utf8").on("data", (data: string) => {
      try {
        if (streamingRedactors) streamingRedactors[stream].append(data);
        else {
          // Parsed sensitive responses remain bounded in memory until projection.
          if (!redact) appendFileSync(resolve(cwd, logPath), data);
          if (!failure) buffer.append(stream, data);
        }
      } catch (error) { failure ??= error as Error; terminate(); }
    });
    child.on("error", (error) => { failure ??= error; terminate(); });
    child.on("close", (code, terminationSignal) => {
      signal.removeEventListener("abort", terminate);
      observation.exitCode = code ?? -1;
      observation.terminationSignal = terminationSignal;
      done();
    });
  });
  if (streamingRedactors) {
    try { for (const redactor of Object.values(streamingRedactors)) redactor.flush(); }
    catch (error) { failure ??= error as Error; }
  } else if (redact) {
    // On interruption/overflow discard partial rows rather than minting a
    // populated status from a truncated value. Also never retain a raw tail.
    const stdout = failure || signal.aborted ? "" : redact("stdout", buffer.stdout);
    const stderr = failure || signal.aborted ? "[vars list output withheld]" : redact("stderr", buffer.stderr);
    buffer.stdout = stdout; buffer.stderr = stderr;
    buffer.tail = Buffer.from(`${stdout}\n${stderr}`).subarray(-tailLimit).toString("utf8");
    appendFileSync(resolve(cwd, logPath), `${stdout}\n${stderr}`);
  }
  Object.assign(observation, { stdout: buffer.stdout, stderr: buffer.stderr, tail: buffer.tail });
  observation.state = signal.aborted ? "interrupted" : failure ? "failed" : "exited";
  const receipt = { ...processReceipt(observation), cwd: resolve(cwd) };
  state.receipts.push(receipt);
  await save(cwd, relative(cwd, resolve(cwd, receiptPath)), receipt);
  if (signal.aborted || failure) {
    const error = failure ?? new Error("Process interrupted");
    error.message += `\n${logPath}\n${buffer.tail}`;
    throw Object.assign(error, { receipt });
  }
  return observation;
}
export const capture = (cwd: string, command: string, signal: AbortSignal, redact?: OutputRedactor) => execute(cwd, command, signal, false, redact);
export const captureStreaming = (cwd: string, command: string, signal: AbortSignal, redact?: OutputRedactor) => execute(cwd, command, signal, true, redact);
export async function readResponse(path: string): Promise<string> {
  const file = await open(path, "r");
  try {
    const buffer = Buffer.alloc(responseLimit + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > responseLimit) throw new Blocked("Parsed artifact response exceeded byte limit");
    return buffer.subarray(0, length).toString("utf8");
  } finally { await file.close(); }
}
