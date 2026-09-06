import { expect, it } from "vitest";
import { createInitialState, legalMoves } from "@li4chess/engine";
import { canonicalJson, recordReplay, replayCheckpoint, resolveAction, sha256 } from "@li4chess/protocol";
import type { ActionRequest, EngineBuildIdentityV1 } from "@li4chess/protocol";
import { LOCAL_SAVE_KEY, resumeLocalGame, saveLocalGame } from "../src/game/localSave.js";

const producer: EngineBuildIdentityV1 = { format: "li4chess-engine-build-v1", sourceRevision: "0".repeat(40),
  packageVersions: { "@li4chess/engine": "0.0.0", "@li4chess/protocol": "0.0.0" },
  workingTree: { status: "unreproducible", reason: "Local persistence acceptance fixture" } };
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
it("synchronously saves exact rules state, seat settings and saved producer lineage", async () => {
  const disk = storage();
  const initial = createInitialState({ isCPU: { 0: false, 1: true, 2: true, 3: false }, cpuDifficulty: { 0: 5, 1: 2, 2: 4, 3: 1 } });
  const request: ActionRequest = { type: "move", actor: 0, move: legalMoves(initial)[0] };
  saveLocalGame(disk, { initial, requests: [request] }, producer);
  expect(disk.getItem(LOCAL_SAVE_KEY)).not.toBeNull();
  const recovered = await resumeLocalGame(disk);
  expect(recovered.state).toEqual(resolveAction(initial, request).after);
  const replay = await recordReplay(initial, [request], producer);
  expect(recovered.sourceReplayHash).toBe(await sha256(canonicalJson(replay)));
  saveLocalGame(disk, { initial: recovered.state, requests: [], sourceReplayHash: recovered.sourceReplayHash }, producer);
  expect((await resumeLocalGame(disk)).state).toEqual(recovered.state);
});
it("recovers abort journals without inventing awards", async () => {
  const disk = storage(), initial = createInitialState();
  saveLocalGame(disk, { initial, requests: [{ type: "resign", actor: 0 }] }, producer);
  const recovered = await resumeLocalGame(disk);
  expect(recovered.state.result?.reason).toBe("abort");
  expect(recovered.state.result?.placements).toEqual([]);
  saveLocalGame(disk, { initial: recovered.state, requests: [], sourceReplayHash: recovered.sourceReplayHash }, producer);
  expect((await resumeLocalGame(disk)).state).toEqual(recovered.state);
});
it("retains recovered replay randomness, awards and source lineage", async () => {
  const base = createInitialState();
  const initial = { ...base, completedMoves: { 0: 3, 1: 3, 2: 3, 3: 3 }, board: base.board.map(p => p?.type === "K" || p?.type === "R" ? p : null) };
  const replay = await recordReplay(initial, [{ type: "resign", actor: 0 }, { type: "randomKingMove", actor: 0 }], producer);
  const source = await replayCheckpoint(replay), disk = storage();
  saveLocalGame(disk, { initial: source.state, requests: [], sourceReplayHash: source.sourceReplayHash }, producer);
  const recovered = await resumeLocalGame(disk);
  expect(recovered.state).toEqual(source.state);
  expect(recovered.state.randomDrawIndex).toBe(1);
  expect(JSON.parse(disk.getItem(LOCAL_SAVE_KEY)!).sourceReplayHash).toBe(source.sourceReplayHash);
});
it("rejects missing, corrupt, incompatible, forged state, producer and illegal journal actions", async () => {
  const disk = storage();
  await expect(resumeLocalGame(disk)).rejects.toThrow("No saved game");
  for (const text of ["broken", "{}", '{"format":"legacy-arena-v1"}']) {
    disk.setItem(LOCAL_SAVE_KEY, text); await expect(resumeLocalGame(disk)).rejects.toThrow();
  }
  saveLocalGame(disk, { initial: createInitialState(), requests: [] }, producer);
  const valid = JSON.parse(disk.getItem(LOCAL_SAVE_KEY)!);
  for (const value of [{ ...valid, initialState: createInitialState() }, { ...valid, producer: {} },
    { ...valid, requests: [{ type: "move", actor: 0, move: { from: 0, to: 1 } }] },
    { ...valid, requests: [{ type: "resign", actor: 0, forged: true }] },
    { ...valid, requests: [{ type: "move", actor: 0, move: { from: 20, to: 48, captured: {} } }] },
    { ...valid, sourceReplayHash: "forged" }, { ...valid, extra: true }]) {
    disk.setItem(LOCAL_SAVE_KEY, JSON.stringify(value)); await expect(resumeLocalGame(disk)).rejects.toThrow();
  }
});
it("surfaces unavailable storage without overwriting the previous atomic value", async () => {
  const disk = storage(); saveLocalGame(disk, { initial: createInitialState(), requests: [] }, producer);
  const previous = disk.getItem(LOCAL_SAVE_KEY);
  expect(() => saveLocalGame({ ...disk, setItem: () => { throw new Error("quota"); } },
    { initial: createInitialState(), requests: [{ type: "resign", actor: 0 }] }, producer)).toThrow("quota");
  expect(disk.getItem(LOCAL_SAVE_KEY)).toBe(previous);
  await expect(resumeLocalGame({ ...disk, getItem: () => { throw new Error("blocked"); } })).rejects.toThrow("blocked");
});
