import { GameState, PieceType, applyMoveRequest, createInitialState, legalMoves,timeoutPlayer,advanceWalkingKing,claimWin } from "@li4chess/engine";
import { describe, expect, it } from "vitest";
import { deserializeGameState, deserializeMove, serializeGameState, serializeMove } from "../src/index.js";

describe("serialization round-trip", () => {
  it("FFA-END-08: claim result retains surrendered winner, shared ranks and precise awards",()=>{
    const base=createInitialState();
    const initial={ ...base,players:{ ...base.players,0:{ ...base.players[0],score:21 },
      2:{ ...base.players[2],status:"checkmated" as const },3:{ ...base.players[3],status:"checkmated" as const } } };
    const result=claimWin(initial,0);
    expect(deserializeGameState(serializeGameState(result))).toEqual(result);
    expect(result.result?.placements.map(p=>p.meanRank)).toEqual([1,2,3.5,3.5]);
  });
  it("retains timeout clock facts, opening aborts and walking random continuation",()=>{
    const base=createInitialState();
    const abort=timeoutPlayer(base,0,{ remainingMs:0 });
    expect(deserializeGameState(serializeGameState(abort))).toEqual(abort);
    const walking=timeoutPlayer({ ...base,board:base.board.map(p=>p?.type === "K" || p?.type === "R" ? p : null),
      completedMoves:{ 0:3,1:3,2:3,3:3 } },0,{ remainingMs:0 });
    expect(advanceWalkingKing(deserializeGameState(serializeGameState(walking)))).toEqual(advanceWalkingKing(walking));
  });
  it("rejects prior partial snapshots without scoring history instead of inventing it", () => {
    for (const patch of [{ eventSequence:undefined }, { eventSequence:-1 }, { awardLedger:undefined }]) {
      const prior = { ...createInitialState(), ...patch };
      expect(() => deserializeGameState(JSON.stringify(prior))).toThrow(/migration/i);
      expect(() => applyMoveRequest(prior as GameState, { from:20,to:34 })).toThrow(/migration/i);
    }
  });
  it("retains automatic promotion provenance in state and move capture metadata", () => {
    const base = createInitialState();
    const board = base.board.map(() => null) as GameState["board"][number][];
    for (const square of [7,84,188,111]) board[square] = base.board[square];
    board[89] = { type:PieceType.Pawn, owner:0, hasMoved:true };
    board[130] = { type:PieceType.Knight, owner:1, hasMoved:true };
    const promoted = applyMoveRequest({ ...base, board, positionCounts:{} }, { from:89, to:103 });
    const restored = deserializeGameState(serializeGameState(promoted));
    expect(restored.board[103]?.promotedFrom).toBe(PieceType.Pawn);
    const captured = applyMoveRequest(restored, { from:130, to:103 });
    expect(captured.players[1].score).toBe(1);
    expect(deserializeGameState(serializeGameState(captured)).awardLedger).toEqual(captured.awardLedger);
    expect(deserializeMove(serializeMove(captured.moveHistory.at(-1)!)).captured?.promotedFrom).toBe(PieceType.Pawn);
  });
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

  it("retains pending EP eligibility across JSON and replays the canonical capture", () => {
    const initial = createInitialState();
    const board = initial.board.map(() => null) as GameState["board"][number][];
    for (const square of [7,84,188,111]) board[square] = initial.board[square];
    board[20] = initial.board[20];
    board[47] = {type:PieceType.Pawn,owner:2,hasMoved:true};
    let state = applyMoveRequest({...initial,board,positionCounts:{}},{from:20,to:48});
    state = applyMoveRequest(state,{from:84,to:85});
    const restored = deserializeGameState(serializeGameState(state));
    expect(restored.enPassantRights).toEqual([{target:34,pawnSquare:48,pawnOwner:0,eligiblePlayers:[2]}]);
    const request = {from:47,to:34};
    expect(applyMoveRequest(restored,request)).toEqual(applyMoveRequest(state,request));
  });

  it("rejects historical and reserved standard snapshots without relabelling them", () => {
    for (const rulesetId of [undefined,"li4chess-house-ffa-v1","li4chess-ffa-standard-v1"]) {
      const snapshot = {...createInitialState(),rulesetId};
      expect(() => deserializeGameState(JSON.stringify(snapshot))).toThrow(/migration/i);
      expect(() => serializeGameState(snapshot as unknown as GameState)).toThrow(/migration/i);
    }
  });
});
