import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import manifest from "../src/classic/manifest.json";

it("keeps classic sources byte-equivalent to the recorded main baseline (ignoring CRLF)", () => {
  for (const [file,hash] of Object.entries(manifest.files)) {
    const source=readFileSync(new URL(`../src/classic/${file}`,import.meta.url),"utf8").replace(/\r\n/g,"\n");
    expect(createHash("sha256").update(source).digest("hex")).toBe(hash);
  }
});
