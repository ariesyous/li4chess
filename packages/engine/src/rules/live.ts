import { GameState,Piece,PieceType,PlayerColor } from "../types.js";

export function hasLiveKing(state: GameState,color: PlayerColor): boolean {
  return state.players[color].status === "active" || state.players[color].kingStatus === "walking";
}

export function isLivePiece(state: GameState,piece: Piece): boolean {
  return state.players[piece.owner].status === "active" ||
    (piece.type === PieceType.King && state.players[piece.owner].kingStatus === "walking");
}
