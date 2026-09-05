import { createInitialState, legalMoves } from "@li4chess/engine";
import { describe, expect, it } from "vitest";
import { deserializeGameState, deserializeMove, serializeGameState, serializeMove } from "../src/index.js";

describe("serialization round-trip", () => {
  it("round-trips a fresh GameState through JSON unchanged", () => {
    const state = createInitialState();
    const restored = deserializeGameState(serializeGameState(state));
    expect(restored).toEqual(state);
  });

  it("round-trips a Move through JSON unchanged", () => {
    const state = createInitialState();
    const move = legalMoves(state)[0];
    const restored = deserializeMove(serializeMove(move));
    expect(restored).toEqual(move);
  });
});
