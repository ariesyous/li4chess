import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { readBuildIdentity, assertBuildUnchanged } from "@li4chess/protocol/node";
import { root, generated, pages, assets, fileMap, runNode, sha, handleSignals } from "./shared.js";

handleSignals();
const producer = readBuildIdentity(root);
assert(Number(process.versions.node.split(".")[0]) >= 24, "Node 24+ required");
const beforePages = await fileMap(pages).catch(error => {
  if (error.code === "ENOENT") return null; throw error;
});
await mkdir(generated, { recursive: true });
const build = JSON.stringify({ target: "workers", basePath: "/", producer }, null, 2) + "\n";
await writeFile(resolve(generated, "build.json"), build);
const webRequire = createRequire(resolve(root, "apps/web/package.json"));
await runNode(resolve(dirname(webRequire.resolve("vite/package.json")), "bin/vite.js"), ["build", "--mode", "workers"], resolve(root, "apps/web"));
assertBuildUnchanged(producer, root);
if (beforePages) assert.deepEqual(await fileMap(pages), beforePages, "Workers build must preserve Pages output");
const html = await readFile(resolve(assets, "index.html"), "utf8");
assert.match(html, /src="\/assets\//); assert(!html.includes("/li4chess/"));
const hashes = await fileMap(assets);
assert(Object.keys(hashes).some(name => /^assets\/cpu\.worker-.*\.js$/.test(name)), "Bundled CPU Worker required");
await writeFile(resolve(generated, "artifact.json"), JSON.stringify({ producer, target: "workers", basePath: "/",
  buildModuleHash: sha(build), assets: hashes, pagesPreserved: beforePages }, null, 2) + "\n");
process.stdout.write(`Workers artifact ${producer.buildFingerprint}\n`);
