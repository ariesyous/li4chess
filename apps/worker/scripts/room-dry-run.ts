import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { packageRoot, generated, verifyArtifact, runNode, wrangler, localEnv, handleSignals } from "./shared.js";

handleSignals();
await verifyArtifact();
const output = resolve(generated, "dry-run-room-local");
await mkdir(output, { recursive: true }); let log = "";
await runNode(wrangler, ["deploy", "--dry-run", "--config", resolve(packageRoot, "wrangler.room.local.jsonc"),
  "--outdir", output], packageRoot, localEnv, data => { log += data; process.stdout.write(data); });
await writeFile(resolve(output, "validation.log"), log);
const bundle = await readFile(resolve(output, "room-local.js"), "utf8");
assert(bundle.includes("GameRoom"));
for (const forbidden of ["TEST_KEY", "PLAYER_KEYS", "fixture-crash", "nonexistent_fault_table", "test/worker.ts"])
  assert(!bundle.includes(forbidden), `Test-only code in local application bundle: ${forbidden}`);
await verifyArtifact();
