import { ALL_COLORS,GameState,PlayerColor } from "../types.js";
import { assertLocalMigrationState } from "../stateFormat.js";
import { computeGameResult } from "./elimination.js";
import { remainingEnPassantRights } from "./enPassant.js";
import { awardPoints } from "./scoring.js";
import { findKingSquare } from "./attacks.js";

/** Final king awards apply only to sole-survivor termination, never claims/draws. */
export function finishElimination(state:GameState,causeSequence:number):GameState {
  if (state.result) return state;
  const active=ALL_COLORS.filter(color=>state.players[color].status === "active");
  if (active.length>1) return state;
  let working=state;
  if (active.length===1) for(const subject of ALL_COLORS) {
    if (subject!==active[0] && state.players[subject].kingStatus === "walking" && findKingSquare(state.board,subject)!==null) {
      working=awardPoints(working,"survivor",active[0],20,causeSequence,subject);
    }
  }
  return { ...working,eventSequence:working.eventSequence+1,result:computeGameResult(working.players) };
}

export function canClaimWin(state:GameState,actor:PlayerColor):boolean {
  if (state.result || state.players[actor]?.status !== "active") return false;
  const active=ALL_COLORS.filter(color=>state.players[color].status === "active");
  return active.length===2 && state.players[actor].score-state.players[active.find(color=>color!==actor)!].score>=21;
}

/** Automatic consumers may safely finish only if the projected points result wins. */
export function claimSecuresSoleWin(state:GameState,actor:PlayerColor):boolean {
  return canClaimWin(state,actor) && claimWin(state,actor).result?.winner===actor;
}

export function claimWin(state:GameState,actor:PlayerColor):GameState {
  assertLocalMigrationState(state);
  if (!canClaimWin(state,actor)) throw new Error("Claim Win requires two active players and a lead of at least 21 points");
  const trailer=ALL_COLORS.find(color=>color!==actor && state.players[color].status === "active")!;
  const lead=state.players[actor].score-state.players[trailer].score;
  const causeSequence=state.eventSequence+1;
  let working:GameState={ ...state,eventSequence:causeSequence,
    players:{ ...state.players,[actor]:{ ...state.players[actor],status:"resigned",kingStatus:"surrendered",eliminatedOnTurn:state.turnNumber } },
    castlingRights:{ ...state.castlingRights,[actor]:{ kingside:false,queenside:false } } };
  working={ ...working,enPassantRights:remainingEnPassantRights(working) };
  working=awardPoints(working,"claim-win",trailer,20,causeSequence,actor);
  return { ...working,eventSequence:working.eventSequence+1,
    result:{ ...computeGameResult(working.players),reason:"claim-win",claim:{ actor,trailer,lead,causeSequence } } };
}
