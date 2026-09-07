import { describe, expect, it } from "vitest";
import { createInitialState, legalMoves } from "@li4chess/engine";
import { appendReplay, canonicalJson, createReplay, readReplay, sha256 } from "@li4chess/protocol";
import type { EngineBuildIdentityV1 } from "@li4chess/protocol";
import { assertSuccessor, type Snapshot } from "../src/persistence.js";
import { PROTOCOL } from "../src/command.js";

const producer: EngineBuildIdentityV1 = { format: "li4chess-engine-build-v1", sourceRevision: "a".repeat(40), packageVersions: { "@li4chess/engine": "0.0.0", "@li4chess/protocol": "0.0.0" }, workingTree: { status: "clean" } };
describe("cross-store canonical lineage", () => {
  it("rejects divergent valid restored histories instead of silently choosing one", async () => {
    const initial = createInitialState();
    const replay = await createReplay(initial,producer);
    const prior: Snapshot = { protocol: PROTOCOL, commandSequence: 0, replay, receipt: { id: "init", commandHash: "init" } };
    const candidate = legalMoves(initial)[0];
    const next: Snapshot = { ...prior, commandSequence: 1, replay: await appendReplay(replay, { type: "move", actor: 0, move: candidate },producer), receipt: { id: "one", commandHash: "fixture" } };
    const hash = await sha256(canonicalJson(prior));
    await expect(assertSuccessor(prior,next,hash)).resolves.toBeUndefined();
    const alternate = await createReplay({ ...initial, randomSeed: "00000002" }, producer);
    await readReplay(alternate);
    await expect(assertSuccessor({ ...prior, replay: alternate }, next, hash)).rejects.toThrow("predecessor");
    const fork = { ...next, replay: await appendReplay(alternate, { type: "move", actor: 0, move: candidate },producer) };
    await readReplay(fork.replay);
    await expect(assertSuccessor(prior,fork,hash)).rejects.toThrow("prefix");
    await expect(assertSuccessor(prior,{ ...next,commandSequence: 2 },hash)).rejects.toThrow("sequence");
  });
});
