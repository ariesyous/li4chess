import { expect, it } from "vitest";
import { ALL_COLORS, GameState, applyMove, applyMoveRequest, createInitialState, legalMoves, positionKey } from "../src/index.js";
import { K, P, R, kings, play, position, sq } from "./ffa-helpers.js";

it("external move intentions are matched to current legal moves; supplied metadata is never applied", () => {
  const state = createInitialState();
  const move = legalMoves(state)[0];
  const forged = {...move,captured:{type:K,owner:1 as const,hasMoved:false},enPassantCapture:188};
  expect(applyMoveRequest(state,forged)).toEqual(applyMove(state,move));
  expect(() => applyMoveRequest(state,{from:3,to:100})).toThrow(/legal move/i);
  expect(() => applyMoveRequest(state,{from:99,to:101})).toThrow(/legal move/i);
  const after = applyMoveRequest(state,move);
  expect(() => applyMoveRequest(after,move)).toThrow(/legal move/i);
  expect(() => applyMoveRequest({...state,result:{winner:0,reason:"elimination",placements:[]}},move)).toThrow(/finished/i);
});

it("the standard reducer rejects historical, partial and unknown rulesets", () => {
  const state = createInitialState();
  const move = legalMoves(state)[0];
  expect(state.rulesetId).toBe("li4chess-ffa-standard-v1");
  for (const rulesetId of [undefined,null,"li4chess-house-ffa-v1","unknown-ruleset"]) {
    expect(() => applyMove({...state,rulesetId} as unknown as GameState,move)).toThrow(/migration/i);
  }
});

it("first-move pawn entitlement is part of repetition identity", () => {
  const state = createInitialState();
  const board = state.board.slice(); board[20] = {...board[20]!,hasMoved:true};
  expect(positionKey({...state,board})).not.toBe(positionKey(state));
});

it("pending-right array order does not change repetition identity", () => {
  const state = createInitialState();
  const first = {target:34,pawnSquare:48,pawnOwner:0 as const,eligiblePlayers:[1 as const,2 as const]};
  const second = {target:72,pawnSquare:73,pawnOwner:1 as const,eligiblePlayers:[0 as const]};
  expect(positionKey({...state,enPassantRights:[first,second]})).toBe(
    positionKey({...state,enPassantRights:[second,{...first,eligiblePlayers:[2,1]}]}));
});

for (const rotation of ALL_COLORS) it(`inactive material is passive and zero-point capturable: ${rotation}`, () => {
  let state = position(rotation,[...kings,[5,5,R,0],[5,8,P,1],[7,4,R,1]]);
  const owner = ((rotation+1)%4) as 0|1|2|3;
  state = {...state,players:{...state.players,[owner]:{...state.players[owner],status:"stalemated"}}};
  // The inactive rook must not constrain the active king on (7,0).
  const after = play(state,rotation,[5,5],[5,8]);
  expect(after.players[rotation].score).toBe(0);
  expect(after.board[sq(rotation,7,4)]).toEqual(state.board[sq(rotation,7,4)]);
});
