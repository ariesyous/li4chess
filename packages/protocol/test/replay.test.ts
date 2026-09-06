import { ALL_COLORS, PieceType, PlayerColor, applyMoveRequest, claimWin, computeGameResult, createInitialState, legalMoves, localSquare, resignPlayer } from "@li4chess/engine";
import type { GameState } from "@li4chess/engine";
import { describe, expect, it, vi } from "vitest";
import { appendReplay, canonicalJson, createReplay, deserializeGameState, engineState, projectState, readReplay,
  serializeGameState, sha256, stateHash } from "../src/index.js";
import type { ActionRequest, EngineBuildIdentityV1, ReplayEnvelopeV2 } from "../src/index.js";

const build: EngineBuildIdentityV1 = { format: "li4chess-engine-build-v1", sourceRevision: "0".repeat(40),
  packageVersions: { "@li4chess/engine": "0.0.0", "@li4chess/protocol": "0.0.0" },
  workingTree: { status: "unreproducible", reason: "Synthetic test producer" } };
const opening = { 0: 3, 1: 3, 2: 3, 3: 3 } as const;
async function play(initial: GameState, requests: ActionRequest[]): Promise<ReplayEnvelopeV2> {
  let replay = await createReplay(initial, build);
  for (const request of requests) replay = await appendReplay(replay, request, build);
  return replay;
}
function sparse(): GameState {
  const initial = createInitialState();
  return { ...initial, board: initial.board.map(p => p?.type === "K" ? p : null),
    castlingRights: { 0: { kingside:false,queenside:false },1: { kingside:false,queenside:false },
      2: { kingside:false,queenside:false },3: { kingside:false,queenside:false } },positionCounts:{} };
}

describe("REPLAY-01..12 accepted v2 contract", () => {
  it("REPLAY-01/02: canonical ordering, encoding and independent SHA-256 vectors", async () => {
    expect(canonicalJson({ z:[null,true,"é\n"], b:undefined, a:3 })).toBe('{"a":3,"z":[null,true,"é\\n"]}');
    expect(canonicalJson({ b:2,a:1 })).toBe(canonicalJson({ a:1,b:2 }));
    expect(canonicalJson([1,2])).not.toBe(canonicalJson([2,1]));
    expect(canonicalJson({ a:null })).not.toBe(canonicalJson({ a:undefined }));
    for (const bad of [NaN, Infinity, -Infinity, undefined, 1n, ()=>0, [undefined], Array(1), new Date(), { a:Symbol() }]) {
      expect(()=>canonicalJson(bad)).toThrow();
    }
    const cycle: Record<string,unknown> = {}; cycle.self = cycle;
    expect(()=>canonicalJson(cycle)).toThrow();
    expect(await sha256("")).toBe("sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(await sha256("abc")).toBe("sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("REPLAY-01/09: mandatory identities, producer provenance and default legacy rejection", async () => {
    const replay = await createReplay(createInitialState(), build);
    for (const patch of [{ format: "legacy-arena-v1" }, { replaySchemaVersion:1 }, { rulesetId:"li4chess-house-ffa-v1" },
      { rulesetId:null }, { stateSchemaId:"unknown" }, { engineBuild:undefined },
      { engineBuild:{ ...build,sourceRevision:"main" } }, { engineBuild:{ ...build,workingTree:undefined } },
      { engineBuild:{ ...build,workingTree:{ status:"dirty" } } }, { engineBuild:{ ...build,packageVersions:{} } },
      { game:{ ...replay.game,setupId:"unknown" } }, { game:{ ...replay.game,seatOrder:[3,2,1,0] } },
      { initialStateHash:`sha256:${"0".repeat(64)}` }, { version:1 }]) {
      await expect(readReplay({ ...replay,...patch })).rejects.toThrow();
    }
    await expect(readReplay({ version:1,initial:createInitialState(),moves:[] })).rejects.toThrow(/migration/);
    expect((await readReplay(replay)).replay.engineBuild).toEqual(build);
    await expect(appendReplay(replay, undefined, { ...build,sourceRevision:"1".repeat(40) })).rejects.toThrow(/producer/);
  });

  it("REPLAY-03: legal canonical moves, before/after chain, metadata and actor tampering", async () => {
    const replay = await play(createInitialState(), [{ type:"move",actor:0,move:{ from:20,to:48 } }]);
    const event = replay.events[0];
    expect(event.type).toBe("move");
    expect(event.sequence).toBe(1);
    expect(event.stateHashBefore).toBe(replay.initialStateHash);
    const mutations = [{ sequence:0 },{ sequence:2 },{ actor:1 },{ type:"unknown" },{ extra:true },
      { stateHashBefore:replay.finalStateHash },{ stateHashAfter:replay.initialStateHash },
      { move:{ ...(event.type === "move" ? event.move : {}),isCheck:[1] } },
      { move:{ ...(event.type === "move" ? event.move : {}),eliminates:[1] } },
      { move:{ ...(event.type === "move" ? event.move : {}),promotion:"Q" } },
      { move:{ ...(event.type === "move" ? event.move : {}),captured:{ type:"Q",owner:1,hasMoved:true } } },
      { move:{ ...(event.type === "move" ? event.move : {}),piece:{ type:"P",owner:0,hasMoved:true } } },
      { move:{ ...(event.type === "move" ? event.move : {}),to:100 } }];
    for (const patch of mutations) await expect(readReplay({ ...replay,events:[{ ...event,...patch }] })).rejects.toThrow();
    await expect(readReplay({ ...replay,events:[event,event] })).rejects.toThrow();
    await expect(readReplay({ ...replay,events:[] })).rejects.toThrow();
    const checked = await readReplay(JSON.parse(JSON.stringify(replay)));
    expect(engineState(checked.state).board[48]?.owner).toBe(0);
  });

  it.each(ALL_COLORS)("REPLAY-04/10: seat %i promotion, capture provenance and individual award", async actor => {
    const initial = sparse(), board = [...initial.board];
    const victim = (actor+1)%4;
    const from = localSquare(actor,3,6), to = localSquare(actor,4,7);
    board[from] = { type:PieceType.Pawn,owner:actor,hasMoved:true };
    board[to] = { type:PieceType.Queen,owner:victim,hasMoved:true,promotedFrom:PieceType.Pawn };
    const replay = await play({ ...initial,board,turn:actor }, [{ type:"move",actor,move:{ from,to } }]);
    const checked = await readReplay(replay);
    expect(checked.state.position.board[to]).toMatchObject({ type:"Q",promotedFrom:"P" });
    expect(replay.events.slice(0,2).map(event=>event.type)).toEqual(["move","scoreAward"]);
    expect(checked.state.position.awardLedger[0]).toMatchObject({ recipient:actor,delta:1,total:1,sequence:2,causeSequence:1 });
    const award = replay.events[1];
    if (award.type !== "scoreAward") throw new Error("Missing capture award");
    for (const patch of [{ delta:9 },{ total:9 },{ recipient:victim },{ rule:"mate" },{ causeSequence:0 },{ sequence:3 }]) {
      await expect(readReplay({ ...replay,events:[replay.events[0],{ ...award,award:{ ...award.award,...patch } },...replay.events.slice(2)] })).rejects.toThrow();
    }
  });

  it("REPLAY-05: recorded random action ignores ambient RNG; every provenance field is checked", async () => {
    const initial = createInitialState();
    let replay = await play({ ...initial,board:initial.board.map(p=>p?.type === "K" || p?.type === "R" ? p : null),completedMoves:opening }, [{ type:"resign",actor:0 }]);
    const random = vi.spyOn(Math,"random").mockImplementation(()=>{ throw new Error("Ambient RNG forbidden"); });
    try {
      replay = await appendReplay(replay,{ type:"randomKingMove",actor:0 },build);
      const event = replay.events.find(event=>event.type === "randomKingMove")!;
      if (event.type !== "randomKingMove") throw new Error("Missing random event");
      const checked = await readReplay(replay);
      expect(checked.state.position.randomDrawIndex).toBe(event.selection.drawsUsed);
      expect(event.causeSequence).toBe(1);
      for (const patch of [{ algorithmId:"other" },{ seed:"ffffffff" },{ drawIndex:1 },{ drawsUsed:2 },{ candidateMovesHash:"fnv1a64:0000000000000000" }]) {
        await expect(readReplay({ ...replay,events:replay.events.map(e=>e === event ? { ...e,selection:{ ...event.selection,...patch } } : e) })).rejects.toThrow();
      }
      for (const patch of [{ actor:1 },{ causeSequence:2 },{ move:{ ...event.move,to:event.move.from } }]) {
        await expect(readReplay({ ...replay,events:replay.events.map(e=>e === event ? { ...e,...patch } : e) })).rejects.toThrow();
      }
    } finally { random.mockRestore(); }
  });

  it.each(["resign","timeout","disconnectForfeit"] as const)("REPLAY-06/07: %s abort facts and later walking transition", async type => {
    const action: ActionRequest = type === "timeout" ? { type,actor:2,clock:{ remainingMs:0 } } : type === "disconnectForfeit" ?
      { type,actor:2,disconnect:{ bankMs:60000,cumulativeDisconnectedMs:65000,remainingMs:0 } } : { type,actor:2 };
    const replay = await play(createInitialState(),[action]);
    expect(replay.events.map(event=>event.type)).toEqual([type,"abort"]);
    expect(replay.result?.result).toMatchObject({ reason:"abort",winner:null,placements:[],abort:{ actor:2,ratingLiable:2,
      classification:type === "resign" ? "early-resign" : "early-timeout",completedMoves:{ 0:0,1:0,2:0,3:0 },causeSequence:1 } });
    expect((await readReplay(replay)).state.position.result).toEqual(replay.result?.result);
    await expect(appendReplay(replay,{ type:"resign",actor:0 },build)).rejects.toThrow();
    const later = await play({ ...createInitialState(),completedMoves:opening },[action]);
    expect((await readReplay(later)).state.position.players[2].kingStatus).toBe("walking");
    if (type === "timeout") await expect(play(createInitialState(),[{ ...action,clock:{ remainingMs:1 } } as ActionRequest])).rejects.toThrow();
    if (type === "disconnectForfeit") for (const disconnected of [59999,-1,NaN]) {
      await expect(play(createInitialState(),[{ type,actor:2,disconnect:{ bankMs:60000,cumulativeDisconnectedMs:disconnected,remainingMs:0 } }])).rejects.toThrow();
    }
  });

  it("REPLAY-07/08: interrupted awards are resumable, null stays unfinished, terminal cannot be forged", async () => {
    const replay = await play({ ...createInitialState(),reversibleMoves:199 },
      [{ type:"move",actor:0,move:{ from:4,to:31 } }]);
    expect(replay.events.map(event=>event.type)).toEqual(["move","scoreAward","scoreAward","scoreAward","scoreAward","terminal"]);
    expect(replay.result?.result.reason).toBe("fifty-move");
    for (let length=1;length<replay.events.length;length++) {
      const truncated = { ...replay,events:replay.events.slice(0,length),result:null,finalStateHash:replay.events[length-1].stateHashAfter };
      const checked = await readReplay(truncated);
      expect(checked.state.position.result).toBeNull();
      expect(checked.state.pendingEffects.length).toBe(replay.events.length-length);
      expect(()=>engineState(checked.state)).toThrow(/pending/);
      expect(await appendReplay(truncated,undefined,build)).toEqual(replay);
      await expect(appendReplay(truncated,{ type:"resign",actor:1 },build)).rejects.toThrow();
    }
    await expect(readReplay({ ...replay,result:null })).rejects.toThrow();
    await expect(readReplay({ ...replay,events:[...replay.events.slice(0,-1),{ ...replay.events.at(-1),type:"abort" }] })).rejects.toThrow();
    const incomplete = await play(createInitialState(),[{ type:"move",actor:0,move:{ from:20,to:48 } }]);
    expect((await readReplay(incomplete)).state.pendingEffects).toEqual([]);
    expect(incomplete.result).toBeNull();
    const resumed = await appendReplay(incomplete,{ type:"move",actor:1,move:{ from:85,to:87 } },build);
    expect((await readReplay(resumed)).state.position.completedMoves).toEqual({ 0:1,1:1,2:0,3:0 });
  });

  it("REPLAY-10: complete Modern game, opening rotation, three forfeits and sole survivor +60", async () => {
    let replay = await createReplay(createInitialState(),build);
    for (let ply=0;ply<12;ply++) {
      const state = engineState((await readReplay(replay)).state);
      const move = legalMoves(state).find(move=>move.piece.type === PieceType.Pawn && !move.captured)!;
      replay = await appendReplay(replay,{ type:"move",actor:state.turn,move },build);
    }
    expect((await readReplay(replay)).state.position.completedMoves).toEqual(opening);
    for (const actor of [1,2,3]) replay = await appendReplay(replay,{ type:"resign",actor },build);
    const checked = await readReplay(JSON.parse(JSON.stringify(replay)));
    expect(replay.result?.result).toMatchObject({ reason:"elimination",winner:0 });
    expect(checked.state.position.players[0].score).toBe(60);
    expect(checked.state.position.awardLedger.map(a=>[a.rule,a.recipient,a.subject,a.delta])).toEqual([
      ["survivor",0,1,20],["survivor",0,2,20],["survivor",0,3,20] ]);
    expect(replay.events.map(e=>e.sequence)).toEqual(Array.from({ length:replay.events.length },(_,index)=>index+1));
  });

  it("REPLAY-11/12: all state fields are hashed and malformed checkpoints reject", async () => {
    const initial = createInitialState(), original = projectState(initial), hash = await stateHash(original);
    for (const patch of [{ reversibleMoves:1 },{ turn:1 },{ turnNumber:2 },{ completedMoves:{ ...initial.completedMoves,0:1 } },
      { randomSeed:"00000002" },{ eventSequence:1 },{ positionCounts:{} },{ players:{ ...initial.players,0:{ ...initial.players[0],score:1 } } },
      { castlingRights:{ ...initial.castlingRights,0:{ kingside:false,queenside:true } } },
      { board:initial.board.map((piece,index)=>index === 20 ? { ...piece!,hasMoved:true } : piece) }]) {
      expect(await stateHash({ ...original,position:{ ...original.position,...patch } })).not.toBe(hash);
    }
    for (const patch of [{ board:[] },{ turn:4 },{ completedMoves:{ 0:0 } },{ randomSeed:"invalid" },{ eventSequence:-1 },
      { randomDrawIndex:1 },{ moveHistory:[{}] },{ awardLedger:[{}] },{ positionCounts:{ bad:0 } },{ result:{} },
      { players:{ ...initial.players,0:{ ...initial.players[0],score:NaN } } },{ enPassantRights:[{}] },{ extra:true }]) {
      expect(()=>deserializeGameState(JSON.stringify({ ...original,position:{ ...original.position,...patch } }))).toThrow();
    }
    expect(deserializeGameState(serializeGameState(initial))).toEqual(initial);
    const ep = { ...original,position:{ ...original.position,enPassantRights:[{ target:34,pawnSquare:48,pawnOwner:0,eligiblePlayers:[2,1] }] } };
    expect(await stateHash(ep)).toBe(await stateHash({ ...ep,position:{ ...ep.position,enPassantRights:[{ ...ep.position.enPassantRights[0],eligiblePlayers:[1,2] }] } }));
  });

  it("REPLAY-08/11: nonzero checkpoints preserve global history with explicit local causes", async () => {
    const base=createInitialState();
    const initial=resignPlayer({ ...base,completedMoves:opening,reversibleMoves:199,
      board:base.board.map(p=>p?.type === "K" || p?.type === "R" ? p : null) },0);
    const replay=await play(initial,[{ type:"randomKingMove",actor:0 }]);
    expect(replay.game.setupId).toMatch(/^li4chess-ffa-checkpoint-v1:sha256:/);
    expect(replay.events[0]).toMatchObject({ type:"randomKingMove",sequence:1,positionSequence:2,checkpointCause:{positionSequence:1} });
    expect(replay.events[0]).not.toHaveProperty("causeSequence");
    expect(replay.events[1]).toMatchObject({type:"scoreAward",sequence:2,positionSequence:3,causeSequence:1,
      award:{sequence:3,causeSequence:2,delta:10}});
    expect(replay.events.at(-1)).toMatchObject({type:"terminal",causeSequence:1});
    const truncated={...replay,events:replay.events.slice(0,2),result:null,finalStateHash:replay.events[1].stateHashAfter};
    expect(await appendReplay(truncated,undefined,build)).toEqual(replay);
    await expect(readReplay({...replay,events:replay.events.map((event,index)=>index === 0 ? {...event,checkpointCause:{positionSequence:0}} : event)})).rejects.toThrow();
    await expect(readReplay({...replay,events:replay.events.map((event,index)=>index === 1 ? {...event,causeSequence:2} : event)})).rejects.toThrow();
    const openingReplay=await createReplay(base,build);
    const changedInitial={...openingReplay.initialState,position:{...openingReplay.initialState.position,completedMoves:opening}};
    const changedHash=await stateHash(changedInitial);
    await expect(readReplay({...openingReplay,initialState:changedInitial,initialStateHash:changedHash,finalStateHash:changedHash})).rejects.toThrow(/setup/);
  });

  it.each(ALL_COLORS)("REPLAY-12: seat %i EP geometry and active eligibility reject malformed imports", actor=>{
    const initial=sparse(),board=[...initial.board],eligible=(actor+2)%4 as PlayerColor;
    const from=localSquare(actor,3,1),to=localSquare(actor,3,3);
    board[from]={type:PieceType.Pawn,owner:actor,hasMoved:false};
    board[localSquare(actor,2,3)]={type:PieceType.Pawn,owner:eligible,hasMoved:true};
    const state=applyMoveRequest({...initial,board,turn:actor},{from,to});
    expect(state.enPassantRights).toHaveLength(1);
    expect(deserializeGameState(serializeGameState(state))).toEqual(state);
    for (const patch of [
      {enPassantRights:[{...state.enPassantRights[0],target:localSquare(actor,3,4)}]},
      {enPassantRights:[{...state.enPassantRights[0],pawnSquare:localSquare(actor,2,3),pawnOwner:eligible}]},
      {board:state.board.map((p,square)=>square === to ? {...p!,hasMoved:false} : p)},
      {players:{...state.players,[eligible]:{...state.players[eligible],status:"checkmated"}}}
    ]) expect(()=>deserializeGameState(JSON.stringify({...projectState(state),position:{...projectState(state).position,...patch}}))).toThrow(/EP/);
  });

  it("REPLAY-12: passive turns and fabricated terminal predicates reject",()=>{
    const initial=createInitialState(),state=projectState(initial);
    const passive={...state,position:{...state.position,players:{...initial.players,0:{...initial.players[0],status:"checkmated"}}}};
    expect(()=>deserializeGameState(JSON.stringify(passive))).toThrow(/turn/);
    for (const reason of ["elimination","fifty-move","repetition","insufficient-material"]) {
      expect(()=>deserializeGameState(JSON.stringify({...state,position:{...state.position,result:{...computeGameResult(initial.players),reason}}}))).toThrow();
    }
  });

  it("REPLAY-02: checkpoint identity normalizes EP arrays and eligibility before hashing",async()=>{
    const initial=sparse(),board=[...initial.board];
    const first={target:localSquare(0,3,2),pawnSquare:localSquare(0,3,3),pawnOwner:0,eligiblePlayers:[1,2]};
    const second={target:localSquare(1,3,2),pawnSquare:localSquare(1,3,3),pawnOwner:1,eligiblePlayers:[0,2]};
    board[first.pawnSquare]={type:PieceType.Pawn,owner:0,hasMoved:true};
    board[second.pawnSquare]={type:PieceType.Pawn,owner:1,hasMoved:true};
    const a=await createReplay({...initial,board,enPassantRights:[first,second]},build);
    const b=await createReplay({...initial,board,enPassantRights:[second,{...first,eligiblePlayers:[2,1]}]},build);
    expect(a.game.setupId).toBe(b.game.setupId);
    expect(a.initialStateHash).toBe(b.initialStateHash);
    await readReplay(a);await readReplay(b);
  });

  it("REPLAY-07: claim checkpoint facts agree with final trailer and scores",()=>{
    const base=createInitialState();
    const initial={...base,players:{...base.players,0:{...base.players[0],score:21},
      2:{...base.players[2],status:"checkmated" as const},3:{...base.players[3],status:"checkmated" as const}}};
    const finished=claimWin(initial,0),projected=projectState(finished);
    for (const patch of [{lead:22},{trailer:2}]) {
      expect(()=>deserializeGameState(JSON.stringify({...projected,position:{...projected.position,
        result:{...finished.result,claim:{...finished.result!.claim,...patch}}}}))).toThrow(/claim/);
    }
  });

  it.each(ALL_COLORS)("REPLAY-04/10: seat %i mixed capture/check/mate and three-way fractional awards",async rotation=>{
    const square=(file:number,rank:number)=>localSquare(rotation,file-3,rank);
    const fixture=(entries:readonly (readonly [number,number,string,number])[],turn=0):GameState=>{
      const initial=sparse(),board=[...initial.board].fill(null);
      for (const [file,rank,type,owner] of entries) board[square(file,rank)]={type:type as PieceType,owner:(rotation+owner)%4,hasMoved:true};
      return {...initial,board,turn:(rotation+turn)%4};
    };
    const mixed=fixture([[7,0,"K",0],[3,0,"K",1],[10,3,"K",2],[13,7,"K",3],
      [5,0,"N",0],[6,1,"N",0],[6,2,"N",0],[3,5,"R",0],[3,3,"N",1]]);
    const replay=await play(mixed,[{type:"move",actor:rotation,move:{from:square(3,5),to:square(3,3)}}]);
    expect(replay.events.map(e=>e.type)).toEqual(["move","scoreAward","scoreAward","scoreAward"]);
    expect((await readReplay(replay)).state.position.awardLedger.map(a=>[a.rule,a.delta,a.total,a.causeSequence])).toEqual([
      ["capture",3,3,1],["multi-check",5,8,1],["mate",20,28,1]]);
    const split=fixture([[3,0,"K",0],[0,6,"K",1],[8,10,"K",2],[13,7,"K",3],
      [5,0,"N",1],[6,1,"N",1],[6,2,"N",1],[3,3,"R",1],[4,0,"R",2],[5,2,"B",3]],3);
    const splitReplay=await play(split,[{type:"move",actor:(rotation+3)%4,move:{from:square(13,7),to:square(12,7)}}]);
    expect((await readReplay(splitReplay)).state.position.awardLedger.map(a=>[a.recipient,a.delta,a.total])).toEqual(
      ALL_COLORS.filter(color=>color !== rotation).map(color=>[color,20/3,20/3]));
    await expect(readReplay({...replay,events:[replay.events[0],replay.events[2],replay.events[1],replay.events[3]]})).rejects.toThrow();
  });
});
