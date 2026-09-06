import { describe,expect,it } from "vitest";
import { ALL_COLORS,GameState,PlayerColor,PieceType,positionKey,isInsufficientMaterial,applyMove,legalMoves,createInitialState,resignPlayer,advanceWalkingKing,awardPoints } from "../src/index.js";
import { K,N,B,P,R,Q,kings,position,play,colorAt,sq,Placement } from "./ffa-helpers.js";

for(const rotation of ALL_COLORS) describe(`FFA draws: ${PlayerColor[rotation]}`,()=>{
  const c=(n:number)=>colorAt(rotation,n);
  const active=(base:GameState,n:number):GameState=>({ ...base,players:Object.fromEntries(ALL_COLORS.map(color=>[color,
    { ...base.players[color],status:(color-rotation+4)%4<n ? "active" : "checkmated" }])) as GameState["players"] });
  it("FFA-DRAW-01: third actual reversible cycle occurrence awards ten once to every active player",()=>{
    let state=position(rotation,[...kings,[3,3,N,0]]);
    state={ ...state,positionCounts:{ [positionKey(state)]:1 } };
    const cycle=[[[7,0],[8,0]],[[0,6],[0,7]],[[6,13],[6,12]],[[13,7],[12,7]],
      [[8,0],[7,0]],[[0,7],[0,6]],[[6,12],[6,13]],[[12,7],[13,7]]] as const;
    for(let i=0;i<16;i++) {
      const [from,to]=cycle[i%8];
      state=play(state,rotation,from,to);
      if(i<15) expect(state.result).toBeNull();
    }
    expect(state.result?.reason).toBe("repetition");
    expect(state.awardLedger.map(a=>[a.rule,a.recipient,a.delta])).toEqual(ALL_COLORS.map(color=>["repetition",color,10]));
    expect(state.result?.placements.map(p=>p.meanRank)).toEqual([2.5,2.5,2.5,2.5]);
  });
  it("FFA-DRAW-02: board/rights/interaction identity distinguishes repetition but scores do not",()=>{
    const base=position(rotation,[...kings,[5,5,P,0]]),key=positionKey(base);
    const changed:GameState[]=[{ ...base,turn:c(1) },{ ...base,castlingRights:{ ...base.castlingRights,[rotation]:{ kingside:true,queenside:false } } },
      { ...base,enPassantRights:[{ target:sq(rotation,5,6),pawnSquare:sq(rotation,5,5),pawnOwner:rotation,eligiblePlayers:[c(1)] }] },
      { ...base,players:{ ...base.players,[c(1)]:{ ...base.players[c(1)],status:"resigned",kingStatus:"walking" } } },
      { ...base,players:{ ...base.players,[c(1)]:{ ...base.players[c(1)],status:"checkmated" } } }];
    const pawn=base.board.slice();pawn[sq(rotation,5,5)]={ ...pawn[sq(rotation,5,5)]!,hasMoved:false };changed.push({ ...base,board:pawn });
    for(const state of changed) expect(positionKey(state)).not.toBe(key);
    expect(positionKey({ ...base,players:{ ...base.players,[rotation]:{ ...base.players[rotation],score:10 } } })).toBe(key);
    const queen=base.board.slice();queen[sq(rotation,5,5)]={ type:Q,owner:rotation,hasMoved:true };
    const promoted=queen.slice();promoted[sq(rotation,5,5)]={ ...promoted[sq(rotation,5,5)]!,promotedFrom:P };
    expect(positionKey({ ...base,board:queen })).not.toBe(positionKey({ ...base,board:promoted }));
    const passive=position(rotation,[...kings,[5,8,Q,1]]);
    const dead={ ...passive,players:{ ...passive.players,[c(1)]:{ ...passive.players[c(1)],status:"checkmated" as const } } };
    const movedBlocker=dead.board.slice();movedBlocker[sq(rotation,5,9)]=movedBlocker[sq(rotation,5,8)];movedBlocker[sq(rotation,5,8)]=null;
    expect(positionKey(dead)).not.toBe(positionKey({ ...dead,board:movedBlocker }));
    const walking={ ...base,players:{ ...base.players,[c(1)]:{ ...base.players[c(1)],status:"resigned" as const,kingStatus:"walking" as const } } };
    expect(positionKey(walking)).not.toBe(positionKey({ ...walking,players:{ ...walking.players,[c(1)]:{ ...walking.players[c(1)],kingStatus:"checkmated" } } }));
  });
  it("FFA-DRAW-03: three/four active bare Kings draw; any active minor or Pawn prevents it",()=>{
    for(const n of [3,4]) {
      const base=active(position(rotation,kings),n);
      const after=play(base,rotation,[7,0],[8,0]);
      expect(after.result?.reason).toBe("insufficient-material");
      expect(after.awardLedger).toHaveLength(n);
      for(const type of [P,N,B]) expect(isInsufficientMaterial(active(position(rotation,[...kings,[5,5,type,0]]),n))).toBe(false);
      const passive=active(position(rotation,[...kings,[5,5,Q,3]]),3);
      expect(isInsufficientMaterial(passive)).toBe(true);
    }
  });
  it("FFA-DRAW-04: precisely the accepted two-active dead-material cases",()=>{
    const cases:readonly (readonly [readonly Placement[],boolean])[]=[
      [[],true],[[[5,5,B,0]],true],[[[5,5,N,0]],true],[[[5,5,B,0],[8,8,B,1]],true],
      [[[5,6,B,0],[8,9,B,1]],true],[[[5,5,B,0],[8,9,B,1]],false],
      [[[5,5,N,0],[8,8,N,1]],false],[[[5,5,N,0],[8,8,N,0]],false],
      [[[5,5,B,0],[8,8,B,0]],false],...([P,R,Q] as const).map(type=>[[[5,5,type,0]] as readonly Placement[],false] as const),
    ];
    for(const [pieces,dead] of cases) {
      const before=active(position(rotation,[...kings,...pieces]),2);
      expect(isInsufficientMaterial(before)).toBe(dead);
      const after=play(before,rotation,[7,0],[8,0]);
      expect(after.result?.reason ?? null).toBe(dead ? "insufficient-material" : null);
    }
  });
  it("FFA-DRAW-05: counter ends at 200 individual quiet moves with two, three or four active seats",()=>{
    for(const n of [2,3,4]) {
      const before={ ...active(position(rotation,[...kings,[5,5,R,0]]),n),reversibleMoves:198 };
      const penultimate=play(before,rotation,[7,0],[8,0]);
      expect(penultimate.reversibleMoves).toBe(199);expect(penultimate.result).toBeNull();
      const after=play(penultimate,rotation,[0,6],[0,7]);
      expect(after.reversibleMoves).toBe(200);expect(after.result?.reason).toBe("fifty-move");
      expect(after.awardLedger.map(a=>a.delta)).toEqual(Array(n).fill(10));
    }
  });
  it("FFA-DRAW-06: pawn moves, promotion, live/dead captures and EP reset 199 to zero",()=>{
    const cases:readonly [readonly Placement[],readonly[number,number],readonly[number,number],boolean][]=[
      [[[6,1,P,0]],[6,1],[6,2],false],[[[6,1,P,0],[7,2,N,1]],[6,1],[7,2],false],
      [[[5,6,P,0]],[5,6],[5,7],false],[[[5,5,R,0],[5,8,N,1]],[5,5],[5,8],false],
      [[[5,5,R,0],[5,8,N,1]],[5,5],[5,8],true],
    ];
    for(const [pieces,from,to,dead] of cases) {
      const base=position(rotation,[...kings,...pieces]);
      const before={ ...base,reversibleMoves:199,players:dead ? { ...base.players,[c(1)]:{ ...base.players[c(1)],status:"checkmated" as const } } : base.players };
      const after=play(before,rotation,from,to);
      expect(after.reversibleMoves).toBe(0);expect(after.result).toBeNull();
    }
    const ep={ ...position(rotation,[...kings,[3,6,P,0],[3,7,P,1]]),reversibleMoves:199,
      enPassantRights:[{ target:sq(rotation,2,7),pawnSquare:sq(rotation,3,7),pawnOwner:c(1),eligiblePlayers:[rotation] }] };
    const after=play(ep,rotation,[3,6],[2,7]);
    expect(after.reversibleMoves).toBe(0);expect(after.result).toBeNull();
  });
  it("FFA-DRAW-07/08: simultaneous predicates award one flat ten, preserve prior scores and exclude inactive seats",()=>{
    let before=active(position(rotation,kings),3);
    before=awardPoints({ ...before,eventSequence:1,reversibleMoves:199 },"capture",rotation,3,1);
    const candidate=legalMoves(before).find(m=>m.to===sq(rotation,8,0))!;
    const key=positionKey(applyMove(before,candidate));
    const after=applyMove({ ...before,positionCounts:{ [key]:2 } },candidate);
    expect(after.result?.reason).toBe("repetition");
    expect(after.reversibleMoves).toBe(200);
    expect(after.awardLedger[0]).toEqual(before.awardLedger[0]);
    expect(after.awardLedger.slice(1).map(a=>[a.rule,a.recipient,a.delta])).toEqual(
      ALL_COLORS.filter(color=>color!==c(3)).map(color=>["repetition",color,10]));
    expect(after.players[rotation].score).toBe(13);
    expect(after.players[c(3)].score).toBe(0);
    expect(after.awardLedger.slice(1)).toEqual(ALL_COLORS.filter(color=>color!==c(3)).map((recipient,index)=>({
      sequence:4+index,causeSequence:3,rule:"repetition",recipient,delta:10,total:recipient===rotation ? 13 : 10,
    })));
    expect(after.eventSequence).toBe(7);
    expect(()=>applyMove(after,candidate)).toThrow(/finished/);
  });
  it("FFA-DRAW-07: a forfeit can leave bare active Kings, without counting an extra move or repetition",()=>{
    const before={ ...position(rotation,[...kings,[5,5,R,0]]),completedMoves:{ 0:3,1:3,2:3,3:3 },reversibleMoves:50 };
    const after=resignPlayer(before,rotation);
    expect(after.result?.reason).toBe("insufficient-material");
    expect(after.reversibleMoves).toBe(50);expect(after.positionCounts).toEqual(before.positionCounts);
    expect(after.players[rotation].score).toBe(0);expect(after.randomActions).toEqual([]);
    expect(after.awardLedger).toHaveLength(3);
  });
});

it("FFA-DRAW-06: castle and automatic quiet King increment; automatic capture resets even for a walking owner",()=>{
  const initial=createInitialState(),board=initial.board.slice();board[8]=null;board[9]=null;
  const castle={ ...initial,board,reversibleMoves:198 };
  expect(applyMove(castle,legalMoves(castle).find(m=>m.castle==="kingside")!).reversibleMoves).toBe(199);
  const base={ ...position(0,[...kings,[6,1,P,0],[5,5,R,1]]),completedMoves:{ 0:3,1:3,2:3,3:3 },reversibleMoves:50 };
  const walking=resignPlayer(base,0);
  const quiet=advanceWalkingKing(walking);
  expect(quiet.reversibleMoves).toBe(51);
  // Seed 1 chooses (7,1) from the same four-destination canonical list.
  const captureBoard=walking.board.slice();captureBoard[21]={ type:PieceType.Knight,owner:2,hasMoved:true };
  const captured=advanceWalkingKing({ ...walking,board:captureBoard,reversibleMoves:199 });
  expect(captured.moveHistory.at(-1)?.captured?.type).toBe(N);
  expect(captured.reversibleMoves).toBe(0);
  expect(captured.players[0].score).toBe(0);
});
