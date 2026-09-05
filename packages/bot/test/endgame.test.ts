import { GameState, PieceType, PlayerColor, applyMove } from "@li4chess/engine";
import { describe, expect, it } from "vitest";
import { chooseCpuMove } from "../src/index.js";
import { FULL_EVAL_WEIGHTS, evaluateFull } from "../src/evaluate.js";
import { Placement, place, position, seededRandom } from "./helpers.js";

const TWO_PLAYER = [PlayerColor.Red, PlayerColor.Yellow];

/** Red with the listed material against a lone Yellow king in the middle of the board. */
function bareKingEndgame(red: readonly Placement[]): GameState {
  return position(
    [...red, place(PieceType.King, PlayerColor.Yellow, 6, 10)],
    PlayerColor.Red,
    TWO_PLAYER
  );
}

/** Plays both sides at the given difficulty until the game ends or `cap` plies pass. */
function playOut(start: GameState, level: 1 | 2 | 3 | 4 | 5, cap: number, seed: number) {
  const random = seededRandom(seed);
  let state = start;
  let plies = 0;
  while (state.result === null && plies < cap) {
    state = applyMove(state, chooseCpuMove(state, state.turn, level, random));
    plies++;
  }
  return { state, plies };
}

/**
 * The behaviour these cover is the one from the reported 548-move game: two bots
 * with overwhelming material against a bare king, shuffling indefinitely because
 * nothing in the evaluation could tell a move that made progress from one that
 * did not. Before the king-hunt term and the decisive win/loss scores, every one
 * of these positions ran past the ply cap without finishing.
 */
describe("won endgames actually get finished", () => {
  const cases = [
    {
      name: "king, queen and rook",
      red: [
        place(PieceType.King, PlayerColor.Red, 6, 3),
        place(PieceType.Queen, PlayerColor.Red, 4, 6),
        place(PieceType.Rook, PlayerColor.Red, 9, 6),
      ],
      cap: 60,
    },
    {
      name: "king and queen",
      red: [
        place(PieceType.King, PlayerColor.Red, 6, 3),
        place(PieceType.Queen, PlayerColor.Red, 4, 6),
      ],
      cap: 70,
    },
    {
      name: "king and rook",
      red: [
        place(PieceType.King, PlayerColor.Red, 6, 3),
        place(PieceType.Rook, PlayerColor.Red, 4, 6),
      ],
      cap: 90,
    },
  ];

  for (const { name, red, cap } of cases) {
    it(`converts ${name} against a lone king`, () => {
      const { state, plies } = playOut(bareKingEndgame(red), 3, cap, 20260905);
      expect(state.result, `still unfinished after ${plies} plies`).not.toBeNull();
      expect(state.result!.winner).toBe(PlayerColor.Red);
    }, 120000);
  }
});

describe("king-hunt evaluation", () => {
  const withTargetAt = (file: number, rank: number): GameState =>
    position(
      [
        place(PieceType.King, PlayerColor.Red, 6, 6),
        place(PieceType.Queen, PlayerColor.Red, 7, 7),
        place(PieceType.King, PlayerColor.Yellow, file, rank),
      ],
      PlayerColor.Red,
      TWO_PLAYER
    );

  it("prefers a bare enemy king cornered over one in open space", () => {
    const cornered = evaluateFull(withTargetAt(3, 13), PlayerColor.Red);
    const central = evaluateFull(withTargetAt(6, 9), PlayerColor.Red);
    expect(cornered).toBeGreaterThan(central);
  });

  it("stays silent while the opponent still has material to defend with", () => {
    // Same two king placements, but now the opponent owns a rook, so the hunt
    // term is switched off entirely and only the ordinary terms separate them.
    const withRook = (file: number, rank: number): GameState =>
      position(
        [
          place(PieceType.King, PlayerColor.Red, 6, 6),
          place(PieceType.Queen, PlayerColor.Red, 7, 7),
          place(PieceType.King, PlayerColor.Yellow, file, rank),
          place(PieceType.Rook, PlayerColor.Yellow, 10, 10),
        ],
        PlayerColor.Red,
        TWO_PLAYER
      );

    const huntWeightOnly = (file: number, rank: number): number =>
      evaluateFull(withRook(file, rank), PlayerColor.Red) -
      evaluateFull(withRook(file, rank), PlayerColor.Red, { ...FULL_EVAL_WEIGHTS, kingHunt: 0 });

    expect(huntWeightOnly(3, 13)).toBe(0);
    expect(huntWeightOnly(6, 9)).toBe(0);
  });

  it("stays silent when the bot has nothing to mate with", () => {
    const lonely = (file: number, rank: number): GameState =>
      position(
        [
          place(PieceType.King, PlayerColor.Red, 6, 6),
          place(PieceType.Pawn, PlayerColor.Red, 7, 7),
          place(PieceType.King, PlayerColor.Yellow, file, rank),
        ],
        PlayerColor.Red,
        TWO_PLAYER
      );
    const delta = (file: number, rank: number): number =>
      evaluateFull(lonely(file, rank), PlayerColor.Red) -
      evaluateFull(lonely(file, rank), PlayerColor.Red, { ...FULL_EVAL_WEIGHTS, kingHunt: 0 });

    expect(delta(3, 13)).toBe(0);
    expect(delta(6, 9)).toBe(0);
  });
});
