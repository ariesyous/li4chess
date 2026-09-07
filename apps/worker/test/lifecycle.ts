import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { packageRoot, require, freePort, stopRuntime, trackChild } from "../scripts/shared.js";

export async function checkCancellation(output: string, fingerprint: string) {
  const observations = [];
  for (const boundary of ["starting", "ready"]) {
    const port = await freePort(); let log = "";
    const child = spawn(process.execPath, ["--import", pathToFileURL(require.resolve("tsx/esm")).href,
      resolve(packageRoot, "test/cancellation-fixture.ts")], {
      cwd: packageRoot, windowsHide: true,
      detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: { ...process.env, TEST_PORT: String(port), TEST_OUTPUT: resolve(output, `cancel-${boundary}`), TEST_FINGERPRINT: fingerprint },
    });
    child.stdout!.on("data", data => { log += data; }); child.stderr!.on("data", data => { log += data; });
    const exited = new Promise<number | null>((done, fail) => { child.once("error", fail); child.once("exit", code => done(code)); });
    let interruption: Promise<number | null> | undefined;
    const interrupt = () => interruption ??= (async () => {
      if (child.exitCode === null && child.signalCode === null) {
        if (process.platform === "win32") child.send("interrupt"); else child.kill("SIGTERM");
      }
      return await Promise.race([exited, sleep(10000, undefined, { ref: false }).then(() => { throw new Error("Cancellation cleanup timed out"); })]);
    })();
    // The fixture owns a separate Wrangler process group: let its registered
    // handler clean that group before stopping the fixture itself.
    trackChild(child, async () => { try { await interrupt(); } finally { await stopRuntime(child); } });
    try {
      await Promise.race([
        new Promise<void>(done => child.on("message", message => { if (message === boundary) done(); })),
        exited.then(code => { throw new Error(`Cancellation fixture exited early (${code}): ${log}`); }),
        sleep(45000, undefined, { ref: false }).then(() => { throw new Error(`Cancellation fixture readiness timeout: ${log}`); }),
      ]);
      const code = await interrupt();
      assert.equal(code, 130, log); await freePort(port);
      observations.push({ boundary, port, exitCode: code, portReleased: true,
        signal: process.platform === "win32" ? "IPC invokes registered SIGTERM handler" : "OS SIGTERM" });
    } finally { try { await interrupt(); } finally { await stopRuntime(child); } }
  }
  return observations;
}
