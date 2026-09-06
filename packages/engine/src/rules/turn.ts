import { ALL_COLORS,GameState,PlayerColor,nextColor } from "../types.js";
import { isPlayerInCheck } from "./check.js";
import { countActive } from "./elimination.js";
import { finishElimination } from "./finish.js";
import { remainingEnPassantRights } from "./enPassant.js";
import { hasLegalMove } from "./legality.js";
import { hasLiveKing } from "./live.js";
import { awardPoints } from "./scoring.js";
import { findKingSquare,isSquareAttacked } from "./attacks.js";
import { updateNoMoveCauses } from "./causation.js";

/** Settle immobile kings only as clockwise rotation reaches them. */
export function resolveScheduledTurns(state: GameState,first: PlayerColor,causeSequence: number): { state:GameState; eliminated:PlayerColor[] } {
  let working=state;
  let candidate=first;
  const eliminated:PlayerColor[]=[];
  for (let step=0;step<4;step++) {
    if (countActive(working.players)<=1) break;
    if (!hasLiveKing(working,candidate)) { candidate=nextColor(candidate); continue; }
    if (hasLegalMove(working,candidate)) { working={ ...working,turn:candidate }; break; }
    const checked=isPlayerInCheck(working,candidate);
    const walking=working.players[candidate].kingStatus === "walking";
    const selfCause=working.players[candidate].noMoveCause?.actor === candidate;
    const king=findKingSquare(working.board,candidate);
    const checkingOwners=ALL_COLORS.filter(owner=>owner!==candidate && working.players[owner].status === "active" &&
      king!==null && isSquareAttacked(working.board,king,owner));
    const status=checked ? "checkmated" : "stalemated";
    const prior=working;
    working={ ...working,
      players:{ ...working.players,[candidate]:{ ...working.players[candidate],
        ...(walking ? { kingStatus:status } : { status,eliminatedOnTurn:working.turnNumber }) } },
      castlingRights:{ ...working.castlingRights,[candidate]:{ kingside:false,queenside:false } } };
    working={ ...working,enPassantRights:remainingEnPassantRights(working) };
    working=updateNoMoveCauses(prior,working,candidate,causeSequence);
    if (checked) eliminated.push(candidate);
    // Walking stalemate has an explicit shared award regardless of causation.
    if (checked) {
      for (const recipient of checkingOwners) working=awardPoints(working,"mate",recipient,20/checkingOwners.length,causeSequence);
    } else if (!walking && selfCause) {
      working=awardPoints(working,"self-stalemate",candidate,20,causeSequence);
    } else for (const recipient of ALL_COLORS) {
      if (working.players[recipient].status === "active") working=awardPoints(working,walking ? "walking-stalemate" : "opponent-stalemate",recipient,10,causeSequence);
    }
    candidate=nextColor(candidate);
  }
  working=finishElimination(working,causeSequence);
  return { state:working,eliminated };
}
