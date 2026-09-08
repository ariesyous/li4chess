import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";
import { createInitialState, legalMoves, applyMove, PieceType } from "@li4chess/engine";
import { replayCheckpoint, equalCanonical } from "@li4chess/protocol";

/** Checkpoint envelopes do not re-execute embedded history. Rebuild it here. */
export async function reconstructEndgameReplay() {
  const input = JSON.parse(readFileSync(fileURLToPath(new URL(
    "../fixtures/endgame/user-replay-v2.json", import.meta.url)), "utf8"));
  const { state: final, sourceReplayHash } = await replayCheckpoint(input);
  let state = createInitialState({ isCPU: { 0: false, 1: true, 2: true, 3: true },
    cpuDifficulty: { 0: 3, 1: 3, 2: 3, 3: 3 } });
  const snapshots = [state];
  for (const record of final.moveHistory) {
    const move = legalMoves(state).find(m => m.from === record.from && m.to === record.to && m.promotion === record.promotion);
    assert(move, `Illegal historical move ${snapshots.length}`);
    state = applyMove(state, move); snapshots.push(state);
  }
  for (const field of ["board", "turn", "turnNumber", "reversibleMoves", "positionCounts", "awardLedger", "moveHistory", "result", "players"] as const)
    assert(equalCanonical(state[field], final[field]), `Reconstruction mismatch: ${field}`);
  assert.equal(final.moveHistory.length, 240);
  assert.equal(final.reversibleMoves, 77);
  assert.equal(Math.max(...Object.values(final.positionCounts)), 2);
  assert(final.moveHistory.slice(-77).every(m => m.piece.type === PieceType.King && !m.captured));
  return { state: final, snapshots, sourceReplayHash, producer: input.engineBuild };
}
