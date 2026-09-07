import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
export const root = resolve(import.meta.dirname, "../../..");
export const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
export const localEnv = { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false", CLOUDFLARE_API_TOKEN: "",
  CLOUDFLARE_API_KEY: "", CLOUDFLARE_EMAIL: "", CLOUDFLARE_ACCOUNT_ID: "" };
const owned = new Set<ChildProcess>();
const childPorts = new Map<ChildProcess, number[]>();
const stopping = new WeakMap<ChildProcess, Promise<void>>();
export function signals(): void {
  let stopped = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
    if (stopped) return; stopped = true;
    void Promise.allSettled([...owned].map(child => stop(child))).then(() => process.exit(130));
  });
}
export async function freePort(port = 0): Promise<number> {
  const server = createServer();
  await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", done); });
  const address = server.address(); assert(address && typeof address !== "string");
  await new Promise<void>((done, fail) => server.close(error => error ? fail(error) : done())); return address.port;
}
export function child(args: string[], log: (data: string) => void): ChildProcess {
  const proc = spawn(process.execPath, [wrangler, ...args], { cwd: root, env: localEnv,
    windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  owned.add(proc); proc.stdout!.on("data", data => log(data.toString())); proc.stderr!.on("data", data => log(data.toString()));
  return proc;
}
export async function run(args: string[], log: (data: string) => void): Promise<void> {
  const proc = child(args, log);
  await new Promise<void>((done, fail) => {
    proc.once("error", fail); proc.once("exit", code => { owned.delete(proc); code === 0 ? done() : fail(new Error(`Wrangler exited ${code}`)); });
  });
}
export function stop(proc: ChildProcess, ports: number[] = childPorts.get(proc) ?? []): Promise<void> {
  const previous = stopping.get(proc); if (previous) return previous;
  const promise = (async () => {
    if (proc.pid && proc.exitCode === null && proc.signalCode === null) {
      const exited = new Promise<void>(done => proc.once("exit", () => done()));
      if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { windowsHide: true, stdio: "pipe" });
      else process.kill(-proc.pid, "SIGKILL");
      await Promise.race([exited, sleep(5000, undefined, { ref: false }).then(() => { throw new Error("Cleanup timeout"); })]);
    }
    for (const port of ports) {
      const deadline = Date.now() + 5000;
      for (;;) {
        try { await freePort(port); break; }
        catch (error) { if (Date.now() >= deadline || (error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error; await sleep(50); }
      }
    }
    owned.delete(proc); childPorts.delete(proc);
  })(); stopping.set(proc, promise); return promise;
}
export async function start(config: string, persistence: string, key: string, fingerprint: string, log: (data: string) => void) {
  const port = await freePort(); const inspector = await freePort();
  const proc = child(["dev", "--local", "--config", config, "--ip", "127.0.0.1", "--port", String(port),
    "--inspector-port", String(inspector), "--persist-to", persistence], log);
  childPorts.set(proc, [port, inspector]);
  let error: Error | undefined; proc.once("error", value => { error = value; });
  const url = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (error) throw error; if (proc.exitCode !== null) throw new Error(`Runtime exited ${proc.exitCode}`);
      try {
        const response = await fetch(url, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(500) });
        if (response.ok && (await response.json() as { fingerprint: string }).fingerprint === fingerprint)
          return { url, stop: () => stop(proc, [port, inspector]), ports: [port, inspector] };
      } catch { /* Readiness only. Assertions are not retried. */ }
      await sleep(150);
    }
    throw new Error("Readiness deadline exceeded");
  } catch (error) { await stop(proc, [port, inspector]); throw error; }
}
