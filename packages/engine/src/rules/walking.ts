import { GameState,Move,WalkingSelection } from "../types.js";
import { assertLocalMigrationState } from "../stateFormat.js";
import { applyMove } from "./applyMove.js";
import { legalMoves } from "./legality.js";

/** Counter-based splitmix32 permutation; all arithmetic wraps at 32 bits. */
export function randomWord(seed:number,index:number): number {
  let word=(seed+Math.imul(index+1,0x9e3779b9))>>>0;
  word=Math.imul(word^(word>>>16),0x21f0aaad);
  word=Math.imul(word^(word>>>15),0x735a2d97);
  return (word^(word>>>15))>>>0;
}

export function candidateMovesHash(moves:readonly Move[]): string {
  // Numeric from/to order, then the optional canonical special-move fields.
  const text=JSON.stringify(moves.map(m=>[m.from,m.to,m.promotion??null,m.castle??null,m.enPassantCapture??null]));
  let hash=14695981039346656037n;
  for (const char of text) hash=((hash^BigInt(char.charCodeAt(0)))*1099511628211n)&0xffffffffffffffffn;
  return `fnv1a64:${hash.toString(16).padStart(16,"0")}`;
}

/** Reject the incomplete high bucket rather than biasing modulo selection. */
export function uniformIndex(size:number,wordAt:(index:number)=>number,cursor:number): { index:number;cursor:number } {
  if (!Number.isInteger(size) || size<1 || size>0x100000000) throw new Error("Invalid candidate count");
  const limit=Math.floor(0x100000000/size)*size;
  let word:number;
  do { word=wordAt(cursor++); } while (word>=limit);
  return { index:word%size,cursor };
}

export function selectWalkingMove(state:GameState): { move:Move;selection:WalkingSelection } {
  assertLocalMigrationState(state);
  if (state.result || state.players[state.turn].kingStatus !== "walking") throw new Error("No scheduled walking king action");
  const moves=legalMoves(state).sort((a,b)=>a.from-b.from || a.to-b.to);
  if (!moves.length) throw new Error("Walking king must be resolved before random selection");
  const seed=Number.parseInt(state.randomSeed,16);
  const chosen=uniformIndex(moves.length,index=>randomWord(seed,index),state.randomDrawIndex);
  return { move:moves[chosen.index],selection:{ algorithmId:"splitmix32-rejection-v1",seed:state.randomSeed,
    drawIndex:state.randomDrawIndex,drawsUsed:chosen.cursor-state.randomDrawIndex,candidateMovesHash:candidateMovesHash(moves) } };
}

export function advanceWalkingKing(state:GameState): GameState {
  const selected=selectWalkingMove(state);
  const sequence=state.eventSequence+1;
  const causeSequence=state.players[state.turn].forfeit!.sequence;
  const after=applyMove(state,selected.move);
  return { ...after,randomDrawIndex:state.randomDrawIndex+selected.selection.drawsUsed,
    randomActions:[...state.randomActions,{ ...selected,sequence,causeSequence,actor:state.turn }] };
}
