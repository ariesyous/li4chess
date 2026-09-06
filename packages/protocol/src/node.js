/** Node-only bootstrap for Vite/arena, loadable directly before TypeScript
 * compilation. Checked with TypeScript/JSDoc; never import into a browser. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, platform, release, totalmem } from "node:os";
import { isDeepStrictEqual } from "node:util";

/** @typedef {import('./types.js').EngineBuildIdentityV1} EngineBuildIdentityV1 */
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
/** @returns {EngineBuildIdentityV1} */
export function readBuildIdentity(root = repositoryRoot, development = false) {
  /** @param {...string} args */
  const git = (...args) => execFileSync("git", args, { cwd:root,encoding:"utf8",windowsHide:true });
  const sourceRevision = git("rev-parse","HEAD").trim();
  const dirty = git("status","--porcelain","--untracked-files=all").length > 0;
  const files = [...new Set(git("ls-files","-z","--cached","--others","--exclude-standard").split("\0").filter(Boolean))].sort();
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file).update("\0");
    const path = resolve(root,file);
    if (existsSync(path)) { const bytes = readFileSync(path); digest.update(String(bytes.length)).update("\0").update(bytes); }
    else digest.update("deleted\0");
  }
  const contentHash = `sha256:${digest.digest("hex")}`;
  /** @type {Record<string,string>} */
  const packageVersions = {};
  for (const file of files.filter(file => /^(?:packages|apps)\/[^/]+\/package\.json$/.test(file))) {
    const pkg = JSON.parse(readFileSync(resolve(root,file),"utf8"));
    packageVersions[pkg.name] = pkg.version;
  }
  return { format:"li4chess-engine-build-v1",sourceRevision,packageVersions,buildFingerprint:contentHash,
    workingTree:development ? { status:"unreproducible",reason:"Vite development/HMR session; code may change after the recorded startup fingerprint" } :
      dirty ? { status:"dirty",contentHash } : { status:"clean" } };
}

export function runtimeEnvironment() {
  return { node:process.version,platform:platform(),release:release(),architecture:process.arch,
    cpu:cpus()[0]?.model ?? "unknown",logicalCpus:cpus().length,totalMemoryBytes:totalmem() };
}

/** @param {string} path */
export function createRunDirectory(path) {
  if (existsSync(path) && readdirSync(path).length) throw new Error("New evidence requires an empty output directory");
  mkdirSync(path,{ recursive:true });
}

/** @param {EngineBuildIdentityV1} producer */
export function assertBuildUnchanged(producer, root = repositoryRoot) {
  if (!isDeepStrictEqual(producer,readBuildIdentity(root))) throw new Error("Source/build identity changed during this run; restart before producing evidence");
}

/** @param {unknown} value */
export function validateEnvironment(value) {
  if (!value || typeof value !== "object") throw new Error("Missing arena runtime/hardware environment");
  const env = /** @type {ReturnType<typeof runtimeEnvironment>} */ (value);
  if (![env.node,env.platform,env.release,env.architecture,env.cpu].every(item=>typeof item === "string" && item.trim()) ||
    !/^v\d+\.\d+\.\d+/.test(env.node) || !Number.isSafeInteger(env.logicalCpus) || env.logicalCpus<1 ||
    !Number.isSafeInteger(env.totalMemoryBytes) || env.totalMemoryBytes<1) throw new Error("Invalid arena runtime/hardware environment");
}
