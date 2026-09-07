import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { packageRoot, generated, verifyArtifact, runNode, wrangler, localEnv, handleSignals } from "./shared.js";

handleSignals();
await verifyArtifact();
for (const environment of ["staging", "production"]) {
  const output = resolve(generated, `dry-run-${environment}`);
  await mkdir(output, { recursive: true }); let log = "";
  await runNode(wrangler, ["deploy", "--dry-run", "--config", resolve(packageRoot, "wrangler.jsonc"),
    "--env", environment, "--outdir", output], packageRoot, localEnv, data => { log += data; process.stdout.write(data); });
  await writeFile(resolve(output, "validation.log"), log);
}
await verifyArtifact();
