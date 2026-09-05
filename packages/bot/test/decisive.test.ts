import { PieceType, PlayerColor, applyMove, legalMoves } from "@li4chess/engine";
import { describe, expect, it } from "vitest";
import { MATE_THRESHOLD, evaluateFull } from "../src/evaluate.js";
import { rankMoves } from "../src/search.js";
import { describeSquare, place, position } from "./helpers.js";

const evaluate = (s: Parameters<typeof evaluateFull>[0], c: PlayerColor) => evaluateFull(s, c);
const TWO_PLAYER = [PlayerColor.Red, PlayerColor.Yellow];

describe("decisive outcomes outweigh material", () => {
  it("declines a free queen that hands the opponent mate in one", () => {
    // Red's queen can take Yellow's undefended queen on (9,6), but the moment it
    // leaves (4,11) Yellow mates. Plenty of quiet moves keep Red alive.
    const state = position(
      [
        place(PieceType.King, PlayerColor.Red, 1, 3),
        place(PieceType.Queen, PlayerColor.Red, 4, 11),
        place(PieceType.King, PlayerColor.Yellow, 7, 2),
        place(PieceType.Queen, PlayerColor.Yellow, 9, 6),
        place(PieceType.Rook, PlayerColor.Yellow, 9, 4),
        place(PieceType.Rook, PlayerColor.Yellow, 4, 13),
      ],
      PlayerColor.Red,
      TWO_PLAYER
    );

    const grab = legalMoves(state, PlayerColor.Red).find((m) => m.captured?.type === PieceType.Queen);
    expect(grab, "expected a queen capture to be available").toBeDefined();

    const ranked = rankMoves(state, PlayerColor.Red, { maxDepth: 2, evaluate });
    const chosen = ranked[0].move;
    expect(
      chosen.to,
      `bot played ${chosen.piece.type}${describeSquare(chosen.from)}->${describeSquare(chosen.to)}`
    ).not.toBe(grab!.to);

    // And it is not a near miss: taking the queen is scored as the loss it is.
    const grabScore = ranked.find((r) => r.move.from === grab!.from && r.move.to === grab!.to)!;
    expect(grabScore.value).toBeLessThanOrEqual(-MATE_THRESHOLD);
    expect(ranked[0].value).toBeGreaterThan(-MATE_THRESHOLD);
  });

  it("plays the move that ends a won game instead of shuffling on", () => {
    // Yellow is down to a bare king boxed into the top-left corner of the board's
    // upper arm. Several Red moves finish the game on the spot; the rest leave a
    // position whose material, center and threat terms are all identical, which
    // is exactly the plateau the bot used to wander around on for hundreds of moves.
    const state = position(
      [
        place(PieceType.King, PlayerColor.Red, 6, 3),
        place(PieceType.Queen, PlayerColor.Red, 10, 5),
        place(PieceType.Rook, PlayerColor.Red, 9, 12),
        place(PieceType.King, PlayerColor.Yellow, 3, 13),
      ],
      PlayerColor.Red,
      TWO_PLAYER
    );

    const finishers = legalMoves(state, PlayerColor.Red).filter(
      (m) => applyMove(state, m).result?.winner === PlayerColor.Red
    );
    expect(finishers.length, "position should offer an immediate win").toBeGreaterThan(0);

    const chosen = rankMoves(state, PlayerColor.Red, { maxDepth: 2, evaluate })[0].move;
    expect(
      applyMove(state, chosen).result?.winner,
      `bot played ${chosen.piece.type}${describeSquare(chosen.from)}->${describeSquare(chosen.to)} ` +
        `with ${finishers.length} game-ending moves available`
    ).toBe(PlayerColor.Red);
  });

  it("prefers a win available now over the same win a move later", () => {
    const state = position(
      [
        place(PieceType.King, PlayerColor.Red, 6, 3),
        place(PieceType.Queen, PlayerColor.Red, 10, 5),
        place(PieceType.Rook, PlayerColor.Red, 9, 12),
        place(PieceType.King, PlayerColor.Yellow, 3, 13),
      ],
      PlayerColor.Red,
      TWO_PLAYER
    );

    // Deeper search sees wins further down every branch too; the ply discount is
    // what keeps the immediate one on top rather than tied with all of them.
    const ranked = rankMoves(state, PlayerColor.Red, { maxDepth: 4, evaluate });
    const immediate = ranked.filter((r) => applyMove(state, r.move).result?.winner === PlayerColor.Red);
    const delayed = ranked.filter((r) => applyMove(state, r.move).result === null);
    expect(immediate.length).toBeGreaterThan(0);
    expect(delayed.length).toBeGreaterThan(0);
    expect(Math.min(...immediate.map((r) => r.value))).toBeGreaterThan(
      Math.max(...delayed.map((r) => r.value))
    );
  });
});
