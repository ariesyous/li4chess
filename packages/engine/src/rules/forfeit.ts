import { ALL_COLORS,GameState,PlayerColor } from "../types.js";
import { assertLocalMigrationState } from "../stateFormat.js";
import { remainingEnPassantRights } from "./enPassant.js";
import { resolveScheduledTurns } from "./turn.js";
import { updateNoMoveCauses } from "./causation.js";
import { resolveDraws } from "./draw.js";

function forfeit(state:GameState,actor:PlayerColor,reason:"resign" | "timeout",clock?:{ readonly remainingMs:number }): GameState {
  assertLocalMigrationState(state);
  if (state.result) throw new Error("Cannot forfeit a finished game");
  if (!ALL_COLORS.includes(actor) || state.players[actor].status !== "active") throw new Error("Only an active seat may forfeit");
  const sequence=state.eventSequence+1;
  if (ALL_COLORS.some(color=>state.completedMoves[color]<3)) {
    return { ...state,eventSequence:sequence+1,result:{ reason:"abort",winner:null,placements:[],abort:{
      classification:reason === "resign" ? "early-resign" : "early-timeout",actor,causeSequence:sequence,
      completedMoves:{ ...state.completedMoves },ratingLiable:actor,...(clock ? { clock } : {}) } } };
  }
  let working:GameState={ ...state,eventSequence:sequence,
    players:{ ...state.players,[actor]:{ ...state.players[actor],status:reason === "resign" ? "resigned" : "timed-out",
      kingStatus:"walking",eliminatedOnTurn:state.turnNumber,forfeit:{ reason,sequence,...(clock ? { clock } : {}) } } },
    castlingRights:{ ...state.castlingRights,[actor]:{ kingside:false,queenside:false } } };
  working={ ...working,enPassantRights:remainingEnPassantRights(working) };
  working=updateNoMoveCauses(state,working,actor,sequence);
  return resolveDraws(resolveScheduledTurns(working,working.turn,sequence).state,sequence,false);
}

export function resignPlayer(state:GameState,actor:PlayerColor): GameState { return forfeit(state,actor,"resign"); }

/** Local deterministic clock fact only. Network authority belongs to M3. */
export function timeoutPlayer(state:GameState,actor:PlayerColor,clock:{ readonly remainingMs:number }): GameState {
  if (clock?.remainingMs !== 0) throw new Error("Timeout requires a zero clock fact");
  return forfeit(state,actor,"timeout",{ remainingMs:0 });
}
