import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { gzipSync } from "node:zlib";
import { runtimeEnvironment } from "@li4chess/protocol/node";
import { checkCancellation } from "./lifecycle.js";
import { root, packageRoot, generated, assets, pages, require, verifyArtifact, fileMap,
  startRuntime, stopRuntime, freePort, runNode, handleSignals } from "../scripts/shared.js";

handleSignals();
const artifact = await verifyArtifact();
const output = resolve(process.env.M3_02_OUTPUT ?? resolve(root, "arena-results", `m3-02-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`));
await mkdir(dirname(output), { recursive: true }); await mkdir(output); // Never overwrite evidence.
const port = await freePort();
let runtime: Awaited<ReturnType<typeof startRuntime>> | undefined;
let log = "", tests = "", failure: unknown;
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const source: Record<string, string> = {};
for (const name of [...new Set(files)].sort()) source[name] = (await readFile(resolve(root, name))).toString("base64");
await writeFile(resolve(output, "source.json.gz"), gzipSync(JSON.stringify({ producer: artifact.producer, files: source })));
const bundle: Record<string, string> = {};
for (const name of Object.keys(artifact.assets)) bundle[name] = (await readFile(resolve(assets, name))).toString("base64");
await writeFile(resolve(output, "assets.json.gz"), gzipSync(JSON.stringify(bundle)));
await writeFile(resolve(output, "artifact.json"), await readFile(resolve(generated, "artifact.json")));
await writeFile(resolve(output, "configuration.json"), await readFile(resolve(packageRoot, "wrangler.jsonc")));
const pagesFiles = await fileMap(pages);
assert.match(await readFile(resolve(pages, "index.html"), "utf8"), /src="\/li4chess\/assets\//);
const wranglerPackage = require.resolve("wrangler/package.json");
const wranglerRequire = (await import("node:module")).createRequire(wranglerPackage);
const miniflareRequire = (await import("node:module")).createRequire(wranglerRequire.resolve("miniflare/package.json"));
await writeFile(resolve(output, "manifest.json"), JSON.stringify({ startedAt: new Date().toISOString(),
  environment: runtimeEnvironment(), producer: artifact.producer, port, pages: pagesFiles,
  pnpm: execFileSync(process.execPath, [process.env.npm_execpath!, "--version"], { encoding: "utf8", windowsHide: true }).trim(),
  wrangler: JSON.parse(await readFile(wranglerPackage, "utf8")).version,
  workerd: JSON.parse(await readFile(miniflareRequire.resolve("workerd/package.json"), "utf8")).version,
  playwright: JSON.parse(await readFile(require.resolve("@playwright/test/package.json"), "utf8")).version,
  command: "pnpm test:workers", hosted: false }, null, 2));
try {
  await writeFile(resolve(output, "lifecycle.json"), JSON.stringify(await checkCancellation(output, artifact.producer.buildFingerprint!), null, 2));
  runtime = await startRuntime(port, output, artifact.producer.buildFingerprint!, data => { log += data; });
  const cli = resolve(dirname(require.resolve("@playwright/test/package.json")), "cli.js");
  await runNode(cli, ["test", "--config", "test/playwright.config.ts"], packageRoot,
    { ...process.env, WORKER_BASE_URL: `http://127.0.0.1:${port}`, M3_02_OUTPUT: output },
    data => { tests += data; process.stdout.write(data); });
  await verifyArtifact(); assert.deepEqual(await fileMap(pages), pagesFiles);
} catch (error) { failure = error; }
finally {
  try { if (runtime) await stopRuntime(runtime.child); await freePort(port); }
  catch (error) { failure ??= error; }
  await writeFile(resolve(output, "runtime.log"), log);
  await writeFile(resolve(output, "tests.log"), tests);
  await writeFile(resolve(output, "summary.json"), JSON.stringify({ passed: !failure,
    error: failure instanceof Error ? failure.message : failure ?? null, finishedAt: new Date().toISOString(),
    runtimeStopped: !runtime || runtime.child.exitCode !== null || runtime.child.signalCode !== null }, null, 2));
}
if (failure) throw failure;
process.stdout.write(`Worker acceptance evidence: ${output}\n`);
