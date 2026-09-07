import { describe, expect, it } from "vitest";
import { createInitialState } from "@li4chess/engine";
import { canonicalJson, createReplay, readReplay, readReplayEvents, recordReplayAction } from "@li4chess/protocol";
import type { EngineBuildIdentityV1 } from "@li4chess/protocol";
import { creationBoundary, exactReader, prepareCommand, receiptFor, verifyPrepared, validateRecord, validateAdmissionTiming } from "../src/index.js";
import type { AdmissionTiming } from "../src/index.js";
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
    expect(() => validateRecord({ ...prepared.record, format: "li4chess-d1-command-v99" } as never)).toThrow(/format/);
    await expect(prepareCommand(boundary, owner, { ...input, caller: { ...input.caller, seat: 1 } }, producer)).rejects.toThrow();
    await expect(prepareCommand(boundary, owner, input, { ...producer, sourceRevision: "2".repeat(40) })).rejects.toThrow(/producer/);
    await expect(creationBoundary(boundary.header, { accepts: () => false })).rejects.toThrow(/producer/);
  });
  it("keeps default v1 bytes and input stable while v2 commits strict timing metadata", async () => {
    const boundary = await creationBoundary({ format: "li4chess-d1-game-v1", gameId: "timing",
      replay: await createReplay(createInitialState(), producer) }, exactReader(producer));
    const owner = { namespace: "unit", generation: 1 };
    const input = { id: "command", caller: { kind: "seat", principal: "user", seat: 0, generation: 1 },
      action: { type: "resign", actor: 0 }, admittedAt: 10, expectedCommand: 0 } as const;
    const timing: AdmissionTiming = { format: "li4chess-room-admission-v1", revision: 1, accountedAt: 10,
      activeSeat: 0, activatedAt: 0, deadline: 100, remainingMs: [90, 100, 100, 100],
      disconnectRemainingMs: [60000, 60000, 60000, 60000], connected: [true, false, false, false],
      policy: { initialMs: 100, incrementMs: 1, increment: "after-move" },
      previousResume: { revision: 0, at: 0, reason: "creation" }, suspendedAt: 10, backwards: false };
    const v1 = (await prepareCommand(boundary, owner, input, producer)).prepared;
    const v2 = (await prepareCommand(boundary, owner, input, producer, timing)).prepared;
    const { format: _format, timing: _timing, ...fields } = v2.record as typeof v2.record & { timing: AdmissionTiming };
    expect(v1.record).toEqual({ format: "li4chess-d1-command-v1", ...fields });
    expect(v2.record.input).toEqual(v1.record.input);
    expect(v2.record.commandHash).toBe(v1.record.commandHash);
    expect(v2.receipt.commitHash).not.toBe(v1.receipt.commitHash);
    expect(v2.events).toEqual(v1.events);
    await verifyPrepared(JSON.parse(canonicalJson(v2)));
    const oldReader = { commandFormats: ["li4chess-d1-command-v1"] as const };
    await verifyPrepared(v1, oldReader);
    await expect(verifyPrepared(v2, oldReader)).rejects.toThrow(/unsupported: command format/);
    await expect(verifyPrepared({ ...v2, record: { ...v2.record, timing: { ...timing, suspendedAt: 11 } } } as never)).rejects.toThrow(/timing boundary/);
    await expect(verifyPrepared({ ...v2, record: { ...v2.record, timing: { ...timing, accountedAt: 11 } } } as never)).rejects.toThrow(/timing boundary/);
    expect(() => validateRecord({ ...v1.record, timing } as never)).toThrow(/fields/);
    expect(() => validateRecord({ ...v2.record, timing: undefined } as never)).toThrow(/fields/);
    const malformed: unknown[] = [null, { ...timing, extra: 0 }, { ...timing, format: "future" },
      { ...timing, policy: { ...timing.policy, extra: 0 } }, { ...timing, policy: { ...timing.policy, increment: "before-move" } },
      { ...timing, previousResume: { revision: 0, at: 0, reason: "unknown" } }, { ...timing, previousResume: { ...timing.previousResume, extra: 0 } },
      { ...timing, remainingMs: [0, 0, 0] }, { ...timing, disconnectRemainingMs: [0, 0, 0, -1] },
      { ...timing, connected: [true, true, true, 1] }, { ...timing, backwards: 0 }, { ...timing, activeSeat: 4 }];
    for (const field of ["revision", "accountedAt", "suspendedAt", "activatedAt", "deadline"])
      for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, "1"])
        malformed.push({ ...timing, [field]: value });
    for (const value of malformed) expect(() => validateAdmissionTiming(value as AdmissionTiming)).toThrow();
    validateAdmissionTiming({ ...timing, activeSeat: null, activatedAt: null, deadline: null, previousResume: null });
    timing.remainingMs[0] = 0;
    expect((v2.record as { timing: AdmissionTiming }).timing.remainingMs[0]).toBe(90);
  });
});
