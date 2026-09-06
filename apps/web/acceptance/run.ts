import { readBuildIdentity, runtimeEnvironment, createRunDirectory, assertBuildUnchanged } from "@li4chess/protocol/node";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
export let producer: ReturnType<typeof readBuildIdentity>;
export let directory: string;
export const environment = runtimeEnvironment();
export function beginEvidence(name: string) {
  producer = readBuildIdentity();
  directory = resolve(process.env.M2_OUTPUT ?? `../../arena-results/m2-${new Date().toISOString().replace(/[:.]/g, "-")}`, name);
  createRunDirectory(directory);
  const bundles = Object.fromEntries(readdirSync("dist/assets").map(file => [file, createHash("sha256").update(readFileSync(`dist/assets/${file}`)).digest("hex")]));
  saveEvidence("environment.json", { producer, environment, bundles, measuredAt: new Date().toISOString() });
  const git = (...args:string[]) => execFileSync("git", args, { encoding:"utf8", windowsHide:true });
  const root = git("rev-parse", "--show-toplevel").trim();
  const untracked = git("-C", root, "ls-files", "--others", "--exclude-standard", "--full-name", "-z").split("\0").filter(Boolean);
  saveEvidence("dirty-source.json", { trackedDiff:git("diff", "HEAD", "--binary"),
    untrackedBase64:Object.fromEntries(untracked.map(file => [file, readFileSync(resolve(root,file)).toString("base64")])) });
}
export function saveEvidence(name: string, value: unknown) {
  assertBuildUnchanged(producer);
  writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2) + "\n");
}
