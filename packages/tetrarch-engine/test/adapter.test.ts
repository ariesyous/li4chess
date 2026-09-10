import { describe, expect, it } from "vitest";
import { ALL_COLORS, VALID_SQUARES, createInitialState, legalMoves, PieceType, localSquare } from "@li4chess/engine";
import type { GameState } from "@li4chess/engine";
import { canUseTetrarch, chooseWithFallback, decodeMove, fromMailbox, matchCandidate, packResearchState, researchCapability, toMailbox } from "../src/index.js";
import { validateNetwork } from "../src/wasm.js";

describe("Tetrarch research boundary", () => {
  it("round trips every playable square and rejects padding and nonintegers", () => {
    for (const s of VALID_SQUARES) expect(fromMailbox(toMailbox(s))).toBe(s);
    for (const s of [-1,0,14,15,255,256,3.5,NaN]) expect(() => fromMailbox(s)).toThrow();
    expect(() => toMailbox(0)).toThrow();
  });
  it("preserves owners, piece encoding, promotion provenance and immutable inputs", () => {
    const state=createInitialState(), before=structuredClone(state);
    const packed=packResearchState(state);
    for(const c of ALL_COLORS) expect(packed.squares[toMailbox(localSquare(c,4,0))]).toBe(1+c*7+5);
    const board=[...state.board]; board[localSquare(0,2,7)]={owner:0,type:PieceType.Queen,hasMoved:true,promotedFrom:PieceType.Pawn};
    expect(packResearchState({...state,board}).squares[toMailbox(localSquare(0,2,7))]).toBe(7);
    expect(state).toEqual(before);
  });
  it("matches only canonical move metadata, ignoring external flags", () => {
    const state=createInitialState(), move=legalMoves(state)[0];
    const raw=toMailbox(move.from)|(toMailbox(move.to)<<8)|(15<<16);
    expect(matchCandidate(state,raw).move).toEqual(move);
  });
  it("rejects malformed and illegal candidates with position and legal-list diagnostics", () => {
    const state=createInitialState();
    for(const raw of [0,-1,NaN,0x1000000,toMailbox(7)|(toMailbox(119)<<8)]) {
      const result=matchCandidate(state,raw); expect(result.move).toBeUndefined();
      expect(result.diagnostic).toMatchObject({reason:"illegal-external-move",turn:0,canonicalLegalMoves:expect.any(Array),position:expect.any(String)});
    }
  });
  it("decodes automatic pawn queen promotion and refuses underpromotion", () => {
    const base=toMailbox(89)|(toMailbox(103)<<8);
    expect(decodeMove(base|(6<<20)).promotion).toBe(PieceType.Queen);
    expect(()=>decodeMove(base|(1<<20))).toThrow();
  });
  it("fails production capability closed even for the standard initial position", () => {
    expect(canUseTetrarch(createInitialState())).toEqual({supported:false,reasons:["v8-search-semantics-unaccepted"]});
  });
  it("reports unsupported EP, walking kings, fractional scores and historical pawn flags", () => {
    const base=createInitialState();
    const ep={...base,enPassantRights:[{target:47,pawnSquare:61,pawnOwner:0,eligiblePlayers:[1]}]} as GameState;
    expect(researchCapability(ep)).toContain("en-passant-semantics");
    expect(()=>packResearchState(ep)).toThrow();
    const altered={...base,players:{...base.players,0:{...base.players[0],status:"resigned",kingStatus:"walking",score:20/3}}} as GameState;
    expect(researchCapability(altered)).toEqual(expect.arrayContaining(["forfeit-or-walking-king","fractional-or-out-of-range-score"]));
    for(const c of ALL_COLORS) {
      const board=[...base.board], sq=localSquare(c,0,1); board[sq]={...board[sq]!,hasMoved:true};
      expect(researchCapability({...base,board})).toContain("moved-pawn-on-home-rank");
    }
  });
  it("uses the explicit native fallback and exposes the reason", () => {
    const state=createInitialState();
    const result=chooseWithFallback(state,s=>legalMoves(s)[0]);
    expect(result.move).toEqual(legalMoves(state)[0]);
    expect(result.fallbackReason).toContain("v8-search-semantics-unaccepted");
  });
  it("rejects finished and walking turns even when the board still has geometric moves", () => {
    const state=createInitialState(), move=legalMoves(state)[0];
    const raw=toMailbox(move.from)|(toMailbox(move.to)<<8);
    const finished={...state,result:{placements:[],winner:null,reason:"repetition"}} as GameState;
    const walking={...state,players:{...state.players,0:{...state.players[0],status:"resigned",kingStatus:"walking"}}} as GameState;
    for(const s of [finished,walking]) {
      expect(matchCandidate(s,raw).move).toBeUndefined();
      expect(()=>chooseWithFallback(s,()=>move)).toThrow("No ordinary bot turn");
    }
  });
  it("validates fallback identity against the original immutable state", () => {
    const state=createInitialState(), before=structuredClone(state);
    expect(()=>chooseWithFallback(state,s=>{ (s.board as unknown[]).fill(null); return {...legalMoves(state)[0],to:0}; })).toThrow("illegal");
    expect(state).toEqual(before);
  });
  it("rejects missing, corrupt and wrong-version networks rather than hand-evaluating", () => {
    expect(()=>validateNetwork(new Uint8Array())).toThrow("length");
    const bytes=new Uint8Array(1976880); expect(()=>validateNetwork(bytes)).toThrow("magic");
    bytes.set([84,84,78,78]); expect(()=>validateNetwork(bytes)).toThrow("format");
  });
});
