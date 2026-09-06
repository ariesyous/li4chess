import { ALL_COLORS,GameState,PieceType } from "../types.js";
import { fileOf,rankOf } from "../board.js";
import { awardPoints } from "./scoring.js";
import { computeDrawResult } from "./elimination.js";
import { positionKey,REPETITION_DRAW_COUNT } from "./repetition.js";

export type DrawReason="repetition" | "insufficient-material" | "fifty-move";
export const FIFTY_MOVE_TURNS=200;

/** Accepted active-army material predicate, independent of passive blockers. */
export function isInsufficientMaterial(state:GameState):boolean {
  const active=ALL_COLORS.filter(color=>state.players[color].status==="active");
  if(active.length<2) return false;
  const pieces=state.board.flatMap((piece,square)=>piece && active.includes(piece.owner) && piece.type!==PieceType.King ? [{piece,square}] : []);
  if(active.length>=3) return pieces.length===0;
  if(pieces.length===0) return true;
  if(pieces.length===1) return [PieceType.Bishop,PieceType.Knight].includes(pieces[0].piece.type);
  if(pieces.length!==2 || pieces.some(({piece})=>piece.type!==PieceType.Bishop) || pieces[0].piece.owner===pieces[1].piece.owner) return false;
  return (fileOf(pieces[0].square)+rankOf(pieces[0].square))%2===(fileOf(pieces[1].square)+rankOf(pieces[1].square))%2;
}

/** After scheduled eliminations, choose one draw cause and award each active seat once. */
export function resolveDraws(state:GameState,causeSequence:number,recordPosition=true):GameState {
  if(state.result) return state;
  let working=state;
  const key=positionKey(state);
  const count=(state.positionCounts[key]??0)+(recordPosition ? 1 : 0);
  if(recordPosition) working={ ...working,positionCounts:{ ...working.positionCounts,[key]:count } };
  const reason:DrawReason|null=count>=REPETITION_DRAW_COUNT ? "repetition" : isInsufficientMaterial(working) ? "insufficient-material" :
    working.reversibleMoves>=FIFTY_MOVE_TURNS ? "fifty-move" : null;
  if(!reason) return working;
  for(const recipient of ALL_COLORS) if(working.players[recipient].status==="active") working=awardPoints(working,reason,recipient,10,causeSequence);
  return { ...working,eventSequence:working.eventSequence+1,result:computeDrawResult(working.players,reason) };
}
