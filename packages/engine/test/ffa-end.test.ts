import { describe,expect,it } from "vitest";
import { ALL_COLORS,GameState,PlayerColor,computeGameResult,canClaimWin,claimWin,claimSecuresSoleWin,resignPlayer,timeoutPlayer,finishElimination,advanceWalkingKing,legalMoves,applyMove } from "../src/index.js";
import { K,N,P,R,kings,position,play,colorAt,sq } from "./ffa-helpers.js";

const scored=(base:GameState,scores:readonly number[]):GameState=>({ ...base,players:Object.fromEntries(ALL_COLORS.map(c=>[c,{ ...base.players[c],score:scores[c] }])) as GameState["players"] });
it("FFA-END-01/02: points determine rank regardless of status, chronology, or seat",()=>{
  const base=position(0,kings);
  const statuses={ ...base,players:{ ...base.players,0:{ ...base.players[0],status:"checkmated" as const,eliminatedOnTurn:1 },
    1:{ ...base.players[1],status:"stalemated" as const,eliminatedOnTurn:20 },2:{ ...base.players[2],status:"resigned" as const,eliminatedOnTurn:30 } } };
  expect(computeGameResult(scored(statuses,[50,40,30,20]).players)).toMatchObject({ winner:0,placements:[
    { color:0,place:1 },{ color:1,place:2 },{ color:2,place:3 },{ color:3,place:4 },
  ] });
  for(const [scores,places,means] of [
    [[50,50,20,10],[1,1,3,4],[1.5,1.5,3,4]],[[50,20,20,10],[1,2,2,4],[1,2.5,2.5,4]],
    [[50,20,10,10],[1,2,3,3],[1,2,3.5,3.5]],[[0,0,0,0],[1,1,1,1],[2.5,2.5,2.5,2.5]],
  ]) {
    const result=computeGameResult(scored(statuses,scores).players);
    expect(result.placements.map(p=>p.place)).toEqual(places);
    expect(result.placements.map(p=>p.meanRank)).toEqual(means);
    expect(result.winner).toBe(scores[0]===scores[1] ? null : 0);
  }
});
for(const rotation of ALL_COLORS) describe(`FFA endings: ${PlayerColor[rotation]}`,()=>{
  const c=(n:number)=>colorAt(rotation,n);
  const opened=()=>({ ...position(rotation,[...kings,[5,5,R,0]]),completedMoves:{ 0:3,1:3,2:3,3:3 } });
  const two=()=>{
    let state=opened();
    state=resignPlayer(state,c(2));state=resignPlayer(state,c(3));
    return { ...state,players:{ ...state.players,[rotation]:{ ...state.players[rotation],score:21 } } };
  };
  it("FFA-END-03: third forfeit ends immediately and awards all three walking Kings",()=>{
    let state=opened();
    state=resignPlayer(state,c(1));expect(state.result).toBeNull();
    state=timeoutPlayer(state,c(2),{ remainingMs:0 });expect(state.result).toBeNull();
    state=resignPlayer(state,c(3));
    expect(state.result?.reason).toBe("elimination");
    expect(state.result?.winner).toBe(rotation);
    expect(state.players[rotation].score).toBe(60);
    expect(state.awardLedger.map(a=>[a.rule,a.recipient,a.subject,a.delta])).toEqual(
      ALL_COLORS.filter(color=>color!==rotation).map(subject=>["survivor",rotation,subject,20]));
    expect(state.randomActions).toEqual([]);
  });
  it("FFA-END-04/05: immediate 21-point claim gives only trailer twenty and bypasses walking extras",()=>{
    for(const turn of [rotation,c(1)]) {
      const base=two(),board=base.board.slice();
      board[sq(rotation,6,1)]={ type:P,owner:rotation,hasMoved:true };
      board[sq(rotation,8,5)]={ type:P,owner:c(1),hasMoved:true };
      const rights=[
        { target:sq(rotation,6,0),pawnSquare:sq(rotation,6,1),pawnOwner:rotation,eligiblePlayers:[c(1)] },
        { target:sq(rotation,8,6),pawnSquare:sq(rotation,8,5),pawnOwner:c(1),eligiblePlayers:[rotation] },
      ];
      const state={ ...base,board,turn,enPassantRights:rights };
      const before=JSON.stringify(state);
      expect(canClaimWin(state,rotation)).toBe(true);
      expect(canClaimWin(state,c(1))).toBe(false);
      expect(canClaimWin(state,c(2))).toBe(false);
      const after=claimWin(state,rotation);
      expect(JSON.stringify(state)).toBe(before);
      expect(after.players[rotation]).toMatchObject({ score:21,status:"resigned",kingStatus:"surrendered" });
      expect(after.players[c(1)].score).toBe(20);
      expect(after.awardLedger).toEqual([{ sequence:4,causeSequence:3,rule:"claim-win",recipient:c(1),subject:rotation,delta:20,total:20 }]);
      expect(after.eventSequence).toBe(5);
      expect(after.result).toMatchObject({ reason:"claim-win",winner:rotation,claim:{ actor:rotation,trailer:c(1),lead:21,causeSequence:3 } });
      expect(after.randomActions).toEqual(state.randomActions);
      expect(after.randomDrawIndex).toBe(state.randomDrawIndex);
      expect(after.castlingRights[rotation]).toEqual({ kingside:false,queenside:false });
      expect(after.board).toEqual(state.board);
      expect(after.enPassantRights).toEqual([rights[0]]);
      expect(()=>claimWin(after,rotation)).toThrow(/Claim/);
      expect(()=>advanceWalkingKing(after)).toThrow(/walking/);
      expect(()=>resignPlayer(after,c(1))).toThrow(/finished/);
      expect(()=>timeoutPlayer(after,c(1),{ remainingMs:0 })).toThrow(/finished/);
      expect(()=>applyMove(after,legalMoves(state)[0])).toThrow(/finished/);
    }
    const low=two();
    expect(()=>claimWin({ ...low,players:{ ...low.players,[rotation]:{ ...low.players[rotation],score:20 } } },rotation)).toThrow(/21/);
    expect(canClaimWin(opened(),rotation)).toBe(false);
    expect(canClaimWin(resignPlayer(opened(),c(3)),rotation)).toBe(false);
    const eligible=two();
    const behindDead={ ...eligible,players:{ ...eligible.players,[c(2)]:{ ...eligible.players[c(2)],score:50 } } };
    expect(canClaimWin(behindDead,rotation)).toBe(true);
    expect(claimSecuresSoleWin(behindDead,rotation)).toBe(false);
    expect(claimSecuresSoleWin(eligible,rotation)).toBe(true);
  });
  it("FFA-END-06: only zero through three still-live walking Kings yield separate twenty-point awards",()=>{
    for(let count=0;count<=3;count++) {
      const base=opened();
      const players={ ...base.players };
      for(let n=1;n<=3;n++) players[c(n)]={ ...players[c(n)],status:"resigned",kingStatus:n<=count ? "walking" : "checkmated" };
      const after=finishElimination({ ...base,players,eventSequence:1 },1);
      expect(after.players[rotation].score).toBe(20*count);
      expect(after.awardLedger).toHaveLength(count);
      expect(after.awardLedger.every(a=>a.delta===20 && a.rule==="survivor")).toBe(true);
      expect(finishElimination(after,1)).toBe(after);
    }
  });
  it("FFA-END-07: third normal elimination awards mate before the last walking-King award and result",()=>{
    const base=position(rotation,[[3,0,K,1],[0,6,K,0],[8,10,K,2],[13,7,K,3],
      [5,0,N,0],[6,1,N,0],[6,2,N,0],[3,3,R,0]]);
    const before={ ...base,players:{ ...base.players,[c(2)]:{ ...base.players[c(2)],status:"resigned" as const,kingStatus:"walking" as const },
      [c(3)]:{ ...base.players[c(3)],status:"stalemated" as const } } };
    const after=play(before,rotation,[0,6],[0,7]);
    expect(after.awardLedger).toEqual([
      { sequence:2,causeSequence:1,rule:"mate",recipient:rotation,delta:20,total:20 },
      { sequence:3,causeSequence:1,rule:"survivor",recipient:rotation,subject:c(2),delta:20,total:40 },
    ]);
    expect(after.eventSequence).toBe(4);
    expect(after.result?.winner).toBe(rotation);
  });
});
