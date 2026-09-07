import { describe, expect, it } from "vitest";
import { createInitialState, PlayerColor } from "@li4chess/engine";
import { projectState, type ActionRequest } from "@li4chess/protocol";
import { validateAdmissionTiming } from "@li4chess/persistence";
import { account, activate, admissionTiming, earliestDeadline, increment, initialTiming, suspend, validateTiming } from "../src/timing.js";

const policy = { initialMs: 10_000, incrementMs: 500, increment: "after-move" } as const;
const position = () => projectState(createInitialState()).position;
function running(initialMs: number = policy.initialMs) {
  return activate(initialTiming({ ...policy, initialMs }, 1000), position(), 1000, 0, "creation");
}
const move: ActionRequest = { type: "move", actor: PlayerColor.Red, move: { from: 0, to: 1 } };

describe("durable room timing arithmetic", () => {
  it("starts suspended with bounded balances and activates without spending or incrementing", () => {
    const initial = initialTiming(policy, 1000);
    expect(initial.remainingMs).toEqual([10000, 10000, 10000, 10000]);
    expect(initial.disconnectRemainingMs).toEqual([60000, 60000, 60000, 60000]);
    expect(earliestDeadline(initial, position())).toBeNull();
    const active = activate(initial, position(), 5000, 0, "creation");
    expect(active).toMatchObject({ phase: "running", activatedAt: 5000, accountedAt: 5000, deadline: 15000,
      revision: 0, previousResume: { revision: 0, at: 5000, reason: "creation" } });
    expect(active.remainingMs).toEqual(initial.remainingMs);
    expect(active.disconnectRemainingMs).toEqual(initial.disconnectRemainingMs);
    expect(initial.phase).toBe("suspended");
    validateTiming(active);
  });

  it("debits only the moving main clock and all disconnected active banks once", () => {
    const initial = running(); initial.connected = [true, false, true, false];
    const first = account(initial, position(), 3500);
    expect(first.remainingMs).toEqual([7500, 10000, 10000, 10000]);
    expect(first.disconnectRemainingMs).toEqual([60000, 57500, 60000, 57500]);
    expect(account(first, position(), 3500)).toEqual(first);
    const second = account(first, position(), 4500);
    expect(second.remainingMs).toEqual([6500, 10000, 10000, 10000]);
    expect(second.disconnectRemainingMs).toEqual([60000, 56500, 60000, 56500]);
    expect(initial.remainingMs[0]).toBe(10000);
    expect(initial.disconnectRemainingMs[1]).toBe(60000);
    expect(second.deadline).toBe(11000);
  });

  it("preserves cumulative disconnect use across connected intervals", () => {
    const initial = running(); initial.connected = [true, false, true, true];
    const connected = account(initial, position(), 4000); connected.connected[1] = true;
    const disconnected = account(connected, position(), 5000); disconnected.connected[1] = false;
    const final = account(disconnected, position(), 7000);
    expect(final.disconnectRemainingMs).toEqual([60000, 55000, 60000, 60000]);
    expect(final.remainingMs[0]).toBe(4000);
  });

  it("does not run a walking King's main clock or bank, or charge eliminated banks", () => {
    const base = position();
    const walking = { ...base, players: { ...base.players,
      0: { ...base.players[0], status: "resigned" as const, kingStatus: "walking" as const },
      1: { ...base.players[1], status: "checkmated" as const } } };
    const active = activate(initialTiming(policy, 1000), walking, 1000, 0, "creation");
    expect(active.deadline).toBeNull();
    expect(account(active, walking, 2000).remainingMs).toEqual([10000, 10000, 10000, 10000]);
    expect(account(active, walking, 2000).disconnectRemainingMs).toEqual([60000, 60000, 59000, 59000]);
    expect(earliestDeadline(active, walking)).toEqual({ at: 1000, seat: 0, kind: "randomKingMove" });
  });

  it("clamps exhausted balances and preserves the original main expiration", () => {
    const initial = running();
    expect(earliestDeadline(initial, position())).toEqual({ at: 11000, seat: 0, kind: "timeout" });
    const late = account(initial, position(), 100000);
    expect(late.remainingMs).toEqual([0, 10000, 10000, 10000]);
    expect(late.disconnectRemainingMs).toEqual([0, 0, 0, 0]);
    expect(late.deadline).toBe(11000);
  });

  it("clamps backwards wall time at the durable floor without charging the interval twice", () => {
    const first = account(running(), position(), 3000);
    const backwards = account(first, position(), 2000);
    expect(backwards).toEqual({ ...first, backwards: true });
    expect(account(backwards, position(), 3500).remainingMs[0]).toBe(7500);
    const paused = suspend(backwards, position(), 2500);
    expect(paused.suspendedAt).toBe(3000);
    const resumed = activate(paused, position(), 2000, 1, "recovery");
    expect(resumed.accountedAt).toBe(3000);
    expect(resumed.deadline).toBe(11000);
    expect(resumed.backwards).toBe(true);
  });

  it("freezes preparation and cold restart gaps without resetting or repeating increment", () => {
    const prepared = suspend(running(), position(), 3000);
    const admission = admissionTiming(prepared);
    validateAdmissionTiming(admission);
    expect(admission).toMatchObject({ revision: 1, suspendedAt: 3000, remainingMs: [8000, 10000, 10000, 10000] });
    const finalized = increment(prepared, move);
    const persisted = JSON.parse(JSON.stringify(finalized));
    validateTiming(persisted);
    expect(account(persisted, position(), 99999)).toEqual(persisted);
    const next = { ...position(), turn: PlayerColor.Blue };
    const recovered = activate(persisted, next, 100000, 1, "recovery");
    expect(recovered.remainingMs).toEqual([8500, 10000, 10000, 10000]);
    expect(recovered.disconnectRemainingMs).toEqual([58000, 58000, 58000, 58000]);
    expect(recovered).toMatchObject({ revision: 1, command: 1, deadline: 110000,
      previousResume: { revision: 1, at: 100000, reason: "recovery" } });
    expect(account(recovered, next, 101000).remainingMs).toEqual([8500, 9000, 10000, 10000]);
    expect(admission.remainingMs[0]).toBe(8000);
    expect(prepared.remainingMs[0]).toBe(8000);
  });

  it("increments only ordinary moves, including their terminal outcome", () => {
    const initial = suspend(running(), position(), 1500);
    const requests: ActionRequest[] = [{ type: "randomKingMove", actor: 0 }, { type: "resign", actor: 0 },
      { type: "claimWin", actor: 0 }, { type: "timeout", actor: 0, clock: { remainingMs: 0 } },
      { type: "disconnectForfeit", actor: 0, disconnect: { bankMs: 60000, cumulativeDisconnectedMs: 60000, remainingMs: 0 } }];
    for (const request of requests) expect(increment(initial, request)).toEqual(initial);
    const terminalPosition = { ...position(), result: { placements: [], winner: null, reason: "repetition" as const } };
    const terminal = activate(increment(initial, move), terminalPosition, 2000, 1, "commit");
    expect(terminal.remainingMs).toEqual([10000, 10000, 10000, 10000]);
    expect(terminal).toMatchObject({ phase: "terminal", activeSeat: null, activatedAt: null, deadline: null });
    expect(earliestDeadline(terminal, terminalPosition)).toBeNull();
    expect(account(terminal, terminalPosition, 99999)).toEqual(terminal);
    validateTiming(terminal);
  });
});

describe("deadline arbitration", () => {
  it("orders earliest timestamp, then main clock before banks, then seat order", () => {
    const tied = running(60000);
    expect(earliestDeadline(tied, position())).toEqual({ at: 61000, kind: "timeout", seat: 0 });
    tied.disconnectRemainingMs[3] = 100;
    expect(earliestDeadline(tied, position())).toEqual({ at: 1100, kind: "disconnectForfeit", seat: 3 });
    tied.disconnectRemainingMs = [200, 100, 100, 100];
    expect(earliestDeadline(tied, position())).toEqual({ at: 1100, kind: "disconnectForfeit", seat: 1 });
    tied.connected[1] = true;
    expect(earliestDeadline(tied, position())).toEqual({ at: 1100, kind: "disconnectForfeit", seat: 2 });
  });
  it("resolves an exhausted bank before tied walking work and ignores suspended alarms", () => {
    const base = position();
    const walking = { ...base, players: { ...base.players, 0: { ...base.players[0], status: "resigned" as const, kingStatus: "walking" as const } } };
    const t = activate(initialTiming(policy, 1000), walking, 1000, 0, "creation");
    t.disconnectRemainingMs[2] = 0;
    expect(earliestDeadline(t, walking)).toEqual({ at: 1000, kind: "disconnectForfeit", seat: 2 });
    expect(earliestDeadline(suspend(t, walking, 1000), walking)).toBeNull();
  });
});

describe("restored clock validation", () => {
  it("rejects unsupported formats, unknown fields, bad tuples, policies, balances and unsafe times", () => {
    const base = running();
    const malformed: unknown[] = [null, [], { ...base, format: "old" }, { ...base, surprise: true },
      { ...base, remainingMs: [1, 2, 3] }, { ...base, connected: [false, false, false, 1] },
      { ...base, remainingMs: [NaN, 0, 0, 0] }, { ...base, disconnectRemainingMs: [60001, 0, 0, 0] },
      { ...base, policy: { ...policy, initialMs: 86400001 } }, { ...base, policy: { ...policy, incrementMs: -1 } },
      { ...base, policy: { ...policy, extra: 1 } }, { ...base, accountedAt: Number.MAX_SAFE_INTEGER + 1 },
      { ...base, suspendedAt: 1 }, { ...base, activatedAt: 2000 }, { ...base, command: 2049 },
      { ...base, previousResume: { revision: 1, at: 1000, reason: "recovery" } },
      { ...base, incident: { reason: "", firstAt: 0, attempts: 1, retryAt: null } }];
    for (const value of malformed) expect(() => validateTiming(value)).toThrow();
    expect(() => admissionTiming(base)).toThrow(/suspended/);
    expect(() => initialTiming(policy, -1)).toThrow();
    expect(() => activate(initialTiming(policy, 0), position(), Number.MAX_SAFE_INTEGER, 0, "creation")).toThrow(/overflow/);
  });
  it("accepts zero-duration policy and caps balances at the bounded command horizon", () => {
    const zero = initialTiming({ ...policy, initialMs: 0, incrementMs: 0 }, 0);
    expect(earliestDeadline(activate(zero, position(), 0, 0, "creation"), position()))
      .toEqual({ at: 0, kind: "timeout", seat: 0 });
    const capped = initialTiming(policy, 0); capped.remainingMs[0] = policy.initialMs + 2048 * policy.incrementMs;
    validateTiming(capped);
    expect(increment(capped, move).remainingMs[0]).toBe(capped.remainingMs[0]);
    capped.remainingMs[0]++;
    expect(() => validateTiming(capped)).toThrow(/balance/);
  });
});
