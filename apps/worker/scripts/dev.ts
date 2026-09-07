import { mkdir, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { root, verifyArtifact, startRuntime, stopRuntime, freePort, handleSignals } from "./shared.js";

handleSignals();
const artifact = await verifyArtifact();
const port = Number(process.env.WORKER_PORT ?? 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("WORKER_PORT must be 1024..65535");
const output = resolve(root, "arena-results", `worker-dev-${Date.now()}`);
await mkdir(output, { recursive: true });
const runtime = await startRuntime(port, output, artifact.producer.buildFingerprint!, data => {
  process.stdout.write(data); void appendFile(resolve(output, "runtime.log"), data);
});
process.stdout.write(`Local application: http://127.0.0.1:${port}/ (Ctrl+C to stop; rebuild after source edits)\n`);
await new Promise<void>(done => {
  runtime.child.once("exit", done);
});
await stopRuntime(runtime.child);
await freePort(port);
