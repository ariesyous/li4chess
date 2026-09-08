import { expect, it } from "vitest";
import { applyMove, legalMoves, PieceType } from "@li4chess/engine";
import { chooseBoundedCpuMove } from "@li4chess/bot";
import { chooseBoundedCpuMove as baseline } from "../src/endgame-baseline/bounded.js";
import { scoreMovesExactly } from "../src/endgame-baseline/search.js";
import { evaluateFull } from "../src/endgame-baseline/evaluate.js";
import { reconstructEndgameReplay } from "../src/endgame-replay.js";

it("reconstructs the original 240 moves and reproduces Yellow's depth-3 preference", async () => {
  const { snapshots, sourceReplayHash } = await reconstructEndgameReplay();
  expect(sourceReplayHash).toBe("sha256:aea47bafac8c4c55c981b117f7474fa6bac9cd2b1457cacac17d188175b1efd7");
  const state = snapshots[238];
  const scores = scoreMovesExactly(state, state.turn, legalMoves(state), { maxDepth: 3, evaluate: evaluateFull });
  expect(scores[0].move.from).toBe(90); // g7
  expect(scores[0].move.to).toBe(104); // g8
  expect(scores[0].value).toBeCloseTo(-249.78, 8);
  expect(scores.find(s => s.move.from === 130 && s.move.to === 116)?.value).toBeCloseTo(-249.89333333333335, 8);
});

it("replay continuation prepares a pawn exchange instead of another 32 quiet king moves", async () => {
  const { state: initial } = await reconstructEndgameReplay();
  const progress: number[] = [];
  for (const choose of [baseline, chooseBoundedCpuMove]) {
    let state = initial, count = 0;
    for (let ply = 0; ply < 32 && !state.result; ply++) {
      // Red is modeled by the baseline, not a prediction of human choices.
      const reply = (state.turn === 0 ? baseline : choose)(state, 3,
        { maxDepth: 3, nodeBudget: 2048, timeMs: null }, () => .99);
      if (reply.move.piece.type === PieceType.Pawn || reply.move.captured) count++;
      state = applyMove(state, reply.move);
    }
    progress.push(count);
  }
  expect(progress[0]).toBe(0);
  expect(progress[1]).toBeGreaterThanOrEqual(3);
}, 30000);
