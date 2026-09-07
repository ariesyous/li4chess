import { describe, expect, it } from "vitest";
import { createInitialState } from "@li4chess/engine";
import { canonicalJson, createReplay, readReplay, readReplayEvents, recordReplayAction } from "@li4chess/protocol";
import type { EngineBuildIdentityV1 } from "@li4chess/protocol";
import { creationBoundary, exactReader, prepareCommand, receiptFor, verifyPrepared, validateRecord } from "../src/index.js";
const producer: EngineBuildIdentityV1 = { format: "li4chess-engine-build-v1", sourceRevision: "1".repeat(40),
  workingTree: { status: "clean" }, packageVersions: { "@li4chess/engine": "0.0.0", "@li4chess/protocol": "0.0.0" } };
describe("incremental canonical preparation", () => {
  it("preserves replay-v2 including an effect page split and rejects tampering", async () => {
    const replay = await createReplay(createInitialState(), producer);
    const action = { type: "resign", actor: 0 } as const;
    const next = await recordReplayAction(replay.initialState, action);
    expect(next.events.map(e => e.type)).toEqual(["resign", "abort"]);
    const partial = await readReplayEvents(replay.initialState, next.events.slice(0, 1));
    expect(partial.pendingEffects.length).toBe(1);
    expect(await readReplayEvents(partial, next.events.slice(1))).toEqual(next.state);
    expect((await readReplay({ ...replay, events: next.events, result: next.result, finalStateHash: next.events.at(-1)!.stateHashAfter })).state).toEqual(next.state);
    await expect(recordReplayAction(partial, action)).rejects.toThrow(/pending/);
    await expect(readReplayEvents(replay.initialState, [{ ...next.events[0], sequence: 2 }])).rejects.toThrow();
  });
  it("binds exact caller, producer, request, events and complete result in durable bytes", async () => {
    const boundary = await creationBoundary({ format: "li4chess-d1-game-v1", gameId: "unit",
      replay: await createReplay(createInitialState(), producer) }, exactReader(producer));
    const owner = { namespace: "unit", generation: 1 };
    const input = { id: "command", caller: { kind: "seat", principal: "user", seat: 0, generation: 1 },
      action: { type: "resign", actor: 0 }, admittedAt: 10, expectedCommand: 0 } as const;
    const { prepared } = await prepareCommand(boundary, owner, input, producer);
    await verifyPrepared(JSON.parse(canonicalJson(prepared)));
    await expect(verifyPrepared({ ...prepared, events: prepared.events.slice(0, 1) })).rejects.toThrow();
    const truncatedEvents = prepared.events.slice(0, 1);
    const truncatedRecord = { ...prepared.record, lastEvent: 1, afterHash: truncatedEvents[0].stateHashAfter, checkpointHash: null, resultHash: null };
    await expect(verifyPrepared({ ...prepared, record: truncatedRecord, events: truncatedEvents,
      receipt: await receiptFor(truncatedRecord, truncatedEvents), checkpoint: null, result: null })).rejects.toThrow(/successor/);
    expect(() => validateRecord({ ...prepared.record, format: "li4chess-d1-command-v2" } as never)).toThrow(/format/);
    await expect(prepareCommand(boundary, owner, { ...input, caller: { ...input.caller, seat: 1 } }, producer)).rejects.toThrow();
    await expect(prepareCommand(boundary, owner, input, { ...producer, sourceRevision: "2".repeat(40) })).rejects.toThrow(/producer/);
    await expect(creationBoundary(boundary.header, { accepts: () => false })).rejects.toThrow(/producer/);
  });
});
