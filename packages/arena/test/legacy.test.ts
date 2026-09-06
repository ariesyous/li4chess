import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import manifest from "../../../docs/legacy-replay-manifest.json";
import { aggregate, replay } from "../src/index.js";
import { readReplay } from "@li4chess/protocol";

describe("REPLAY-09: frozen historical bytes and default rejection",()=>{
  it("verifies every quarantined artifact without applying the new reducer",async()=>{
    let logs=0;
    for (const artifact of manifest.artifacts) {
      const bytes=readFileSync(fileURLToPath(new URL(`../../../${artifact.path}`,import.meta.url)));
      expect(bytes.length,artifact.path).toBe(artifact.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"),artifact.path).toBe(artifact.sha256);
      if (artifact.format !== "legacy-arena-v1") continue;
      logs++;
      expect(artifact.classification).toBe("unclassified");
      expect(artifact.producingRevision).toBeNull();
      const first=JSON.parse(gunzipSync(bytes).toString("utf8").split("\n")[0]);
      expect(first.version).toBe(1);
      await expect(readReplay(first)).rejects.toThrow(/migration/);
      await expect(replay(first)).rejects.toThrow(/legacy-arena-v1/);
      await expect(aggregate([first])).rejects.toThrow(/legacy-arena-v1/);
    }
    expect(logs).toBe(14);
  });
});
