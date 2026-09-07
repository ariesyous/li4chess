import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { assertBuildUnchanged } from "@li4chess/protocol/node";
import type { EngineBuildIdentityV1 } from "@li4chess/protocol";

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const root = resolve(packageRoot, "../..");
export const generated = resolve(packageRoot, ".generated");
export const assets = resolve(root, "apps/web/dist-workers");
export const pages = resolve(root, "apps/web/dist");
export const require = createRequire(import.meta.url);
export const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
export const sha = (bytes: string | Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export const localEnv = { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false",
  CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_API_KEY: "", CLOUDFLARE_EMAIL: "", CLOUDFLARE_ACCOUNT_ID: "" };
const owned = new Map<ChildProcess, () => Promise<void>>();
const runtimePorts = new Map<ChildProcess, number[]>();
const stops = new WeakMap<ChildProcess, Promise<void>>();
export function trackChild(child: ChildProcess, cleanup = () => stopRuntime(child)): void {
  owned.set(child, cleanup);
}
let stopping = false;
// Registered before any spawn, including readiness and browser-runner startup.
export function handleSignals(): void {
  const stop = () => {
    if (stopping) return; stopping = true;
    void Promise.allSettled([...owned.values()].map(cleanup => cleanup())).then(results => {
      for (const result of results) if (result.status === "rejected") process.stderr.write(`${result.reason}\n`);
      process.exit(130);
    });
  };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}

export async function fileMap(directory: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function walk(current: string, prefix = "") {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await walk(resolve(current, entry.name), `${name}/`);
      else { assert(entry.isFile(), "Artifact must contain only regular files"); result[name] = sha(await readFile(resolve(current, entry.name))); }
    }
  }
  await walk(directory); return result;
}

export async function verifyArtifact() {
  const artifact = JSON.parse(await readFile(resolve(generated, "artifact.json"), "utf8")) as {
    producer: EngineBuildIdentityV1; assets: Record<string, string>; buildModuleHash: string;
  };
  assertBuildUnchanged(artifact.producer, root);
  assert.deepEqual(await fileMap(assets), artifact.assets, "Workers assets changed after build");
  assert.equal(sha(await readFile(resolve(generated, "build.json"))), artifact.buildModuleHash);
  return artifact;
}

/** Node entry paths avoid cmd.exe/pnpm wrapper quoting on Windows. */
export async function runNode(script: string, args: string[], cwd = root,
  env: NodeJS.ProcessEnv = process.env, onOutput: (data: string) => void = data => process.stdout.write(data)): Promise<void> {
  const child = spawn(process.execPath, [script, ...args], { cwd, env, windowsHide: true,
    detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  trackChild(child);
  child.stdout!.on("data", data => onOutput(data.toString()));
  child.stderr!.on("data", data => onOutput(data.toString()));
  await new Promise<void>((done, fail) => {
    child.once("error", fail);
    child.once("exit", (code, signal) => { owned.delete(child); code === 0 ? done() : fail(new Error(`${script} exited ${code ?? signal}`)); });
  });
}

export async function freePort(preferred = 0): Promise<number> {
  const server = createServer();
  await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(preferred, "127.0.0.1", done); });
  const address = server.address(); assert(address && typeof address !== "string");
  await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done()));
  return address.port;
}

export async function startRuntime(port: number, output: string, fingerprint: string, log: (data: string) => void) {
  // Check before spawn; readiness also verifies the artifact to reject wrong servers.
  await freePort(port);
  const inspectorPort = await freePort();
  const child = spawn(process.execPath, [wrangler, "dev", "--local", "--config", resolve(packageRoot, "wrangler.jsonc"),
    "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", String(inspectorPort),
    "--persist-to", resolve(output, "runtime")], { cwd: packageRoot, env: localEnv, windowsHide: true,
    detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  trackChild(child);
  runtimePorts.set(child, [port, inspectorPort]);
  child.stdout!.on("data", data => log(data.toString())); child.stderr!.on("data", data => log(data.toString()));
  let startupError: Error | undefined;
  child.once("error", error => { startupError = error; });
  try {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (startupError) throw startupError;
      if (child.exitCode !== null) throw new Error(`Wrangler startup exited ${child.exitCode}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/build`, { signal: AbortSignal.timeout(500) });
        if (response.ok && (await response.json() as { buildFingerprint?: string }).buildFingerprint === fingerprint) {
          return { child, port, inspectorPort };
        }
      } catch { /* Readiness only; test assertions are never retried. */ }
      await sleep(150);
    }
    throw new Error("Wrangler readiness timeout");
  } catch (error) { await stopRuntime(child); throw error; }
}

export function stopRuntime(child: ChildProcess): Promise<void> {
  const existing = stops.get(child); if (existing) return existing;
  const pending = stopOwnedTree(child); stops.set(child, pending); return pending;
}
async function stopOwnedTree(child: ChildProcess): Promise<void> {
  owned.delete(child);
  if (!child.pid) return;
  const exited = child.exitCode !== null || child.signalCode !== null;
  const wait = exited ? Promise.resolve() : new Promise<void>(done => child.once("exit", () => done()));
  try {
    if (process.platform === "win32") {
      if (!exited) execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "pipe" });
    } else process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
  await Promise.race([wait, sleep(5000, undefined, { ref: false }).then(() => { throw new Error("Owned runtime did not stop"); })]);
  // taskkill's parent exit can precede descendant socket release. Await actual
  // teardown readiness with a bound; this does not retry any behavior assertion.
  for (const port of runtimePorts.get(child) ?? []) {
    const deadline = Date.now() + 5000;
    for (;;) {
      try { await freePort(port); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE" || Date.now() >= deadline) throw error;
        await sleep(50);
      }
    }
  }
  runtimePorts.delete(child);
}
