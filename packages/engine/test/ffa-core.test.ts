import { describe, expect, it } from "vitest";
import { ALL_COLORS, PlayerColor, hasLegalMove, isPlayerInCheck, legalMoves, pseudoLegalMoves } from "../src/index.js";
import { B, K, N, P, Q, R, colorAt, kings, play, position, quiet, sq } from "./ffa-helpers.js";

for (const rotation of ALL_COLORS) describe(`FFA core: ${PlayerColor[rotation]}`, () => {
  const s = (f: number, r: number) => sq(rotation, f, r);
  it("FFA-CORE-01: absolute pins from each active opponent", () => {
    for (const opponent of [1,2,3] as const) {
      const state = position(rotation, [...kings, [7,2,B,0], [7,5,R,opponent]]);
      expect(pseudoLegalMoves(state).some(m => m.from === s(7,2))).toBe(true);
      expect(legalMoves(state).some(m => m.from === s(7,2))).toBe(false);
    }
  });
  it("FFA-CORE-02: a checked mover must evade every active opponent", () => {
    for (const opponent of [1,2,3] as const) {
      const state = position(rotation, [...kings, [5,2,R,0], [7,5,R,opponent]]);
      expect(isPlayerInCheck(state, rotation)).toBe(true);
      expect(legalMoves(state).some(m => m.from === s(5,2) && m.to === s(5,3))).toBe(false);
      expect(legalMoves(state).some(m => m.from === s(5,2) && m.to === s(7,2))).toBe(true);
    }
  });
  for (const [id, target] of [["FFA-CORE-03", [6,5]], ["FFA-CORE-04", [6,6]]] as const) {
    it(`${id}: rejects orthogonal/diagonal active-king adjacency`, () => {
      for (const opponent of [1,2,3] as const) {
        const state = position(rotation, [[5,5,K,0], [7,5,K,opponent]]);
        expect(legalMoves(state).some(m => m.to === s(target[0], target[1]))).toBe(false);
        expect(legalMoves(state).some(m => m.to === s(4,5))).toBe(true);
      }
    });
  }
  it("FFA-CORE-05: sliders cannot capture a live king", () => {
    for (const type of [R,Q,B]) for (const opponent of [1,2,3] as const) {
      const target = type === B ? [8,8] as const : [5,8] as const;
      const state = position(rotation, [[3,0,K,0], [5,5,type,0], [...target,K,opponent]]);
      expect(legalMoves(state).some(m => m.to === s(target[0], target[1]))).toBe(false);
      expect(hasLegalMove(state)).toBe(true);
    }
  });
  it("FFA-CORE-06: pawn, knight and king cannot capture a live king", () => {
    for (const [type, target] of [[P,[6,6]], [N,[6,7]], [K,[6,5]]] as const) {
      for (const opponent of [1,2,3] as const) {
        const state = position(rotation, [...(type === K ? [] : [[3,0,K,0] as const]), [5,5,type,0], [...target,K,opponent]]);
        expect(legalMoves(state).some(m => m.to === s(target[0], target[1]))).toBe(false);
      }
    }
  });
  it("FFA-CORE-07: double push needs first move, starting rank and two empty squares", () => {
    for (const [rank, moved, blocker, allowed] of [[1,false,null,true], [1,true,null,false], [2,false,null,false], [1,false,2,false], [1,false,3,false]] as const) {
      const state = position(rotation, [...kings, [6,rank,P,0,moved], ...(blocker === null ? [] : [[6,blocker,N,1] as const])]);
      expect(legalMoves(state).some(m => m.from === s(6,rank) && m.to === s(6,rank+2))).toBe(allowed);
    }
  });
  const trap = [[3,0,K,0], [0,6,K,1], [6,13,K,2], [13,7,K,3], [5,0,N,1], [6,1,N,1], [6,2,N,1]] as const;
  it("FFA-CORE-08: mate waits through intervening turns and resolves on the victim's turn", () => {
    let state = position(rotation, [...trap, [3,3,R,1]], 1);
    expect(isPlayerInCheck(state, rotation)).toBe(true);
    expect(hasLegalMove(state, rotation)).toBe(false);
    for (let i=0; i<2; i++) {
      state = quiet(state, rotation);
      expect(state.players[rotation].status).toBe("active");
    }
    state = quiet(state, rotation);
    expect(state.players[rotation].status).toBe("checkmated");
    expect(state.turn).toBe(colorAt(rotation, 1));
    expect(state.moveHistory.at(-1)!.eliminates).toEqual([rotation]);
  });
  it("FFA-CORE-09: an intervening player can capture the checker and rescue a pending mate", () => {
    let state = position(rotation, [...trap.filter(([f,r]) => !(f === 5 && r === 0)), [3,3,R,1], [5,5,B,3]], 1);
    expect(hasLegalMove(state, rotation)).toBe(false);
    state = quiet(quiet(state, rotation), rotation);
    state = play(state, rotation, [5,5], [3,3]);
    expect(state.turn).toBe(rotation);
    expect(state.players[rotation].status).toBe("active");
    expect(isPlayerInCheck(state, rotation)).toBe(false);
    expect(hasLegalMove(state, rotation)).toBe(true);
  });
  it("FFA-CORE-10: stalemate also waits until the victim's scheduled turn", () => {
    let state = position(rotation, trap, 1);
    expect(isPlayerInCheck(state, rotation)).toBe(false);
    expect(hasLegalMove(state, rotation)).toBe(false);
    state = quiet(quiet(state, rotation), rotation);
    expect(state.players[rotation].status).toBe("active");
    state = quiet(state, rotation);
    expect(state.players[rotation].status).toBe("stalemated");
    expect(state.turn).toBe(colorAt(rotation, 1));
  });
  it("FFA-CORE-11: an intervening move can create an escape from pending stalemate", () => {
    let state = position(rotation, [...trap.slice(0,-1), [6,2,N,3]], 1);
    expect(hasLegalMove(state, rotation)).toBe(false);
    state = quiet(quiet(state, rotation), rotation);
    state = play(state, rotation, [6,2], [8,3]);
    expect(state.turn).toBe(rotation);
    expect(state.players[rotation].status).toBe("active");
    expect(legalMoves(state).some(m => m.to === s(4,1))).toBe(true);
  });
  it("FFA-CORE-12: rotation skips inactive players and they cannot generate moves", () => {
    for (const status of ["checkmated", "stalemated", "resigned"] as const) {
      let state = position(rotation, [...kings,[5,5,R,0]]); // retain mating material while testing rotation
      const skipped = colorAt(rotation,1);
      state = { ...state, players: { ...state.players, [skipped]: { ...state.players[skipped], status } } };
      expect(legalMoves(state, skipped)).toEqual([]);
      expect(hasLegalMove(state, skipped)).toBe(false);
      expect(pseudoLegalMoves(state, skipped)).toEqual([]);
      state = quiet(state, rotation);
      expect(state.turn).toBe(colorAt(rotation,2));
      state = quiet(quiet(state, rotation), rotation);
      expect(state.turn).toBe(rotation);
    }
  });
});
