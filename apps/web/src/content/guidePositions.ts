import {
  ALL_COLORS, PieceType, PlayerColor, VALID_SQUARES, applyMoveRequest,
  captureValue, createInitialState, fileOf, isSquareOnBoard, localSquare, rankOf, squareOf,
} from "@li4chess/engine";
import type { GameState, Piece, Square } from "@li4chess/engine";

// Teaching checkpoints, not claims of reachability from a complete played game.
// The diagram generator and tests use these same engine-validated positions.
export function teachingPosition(pieces: readonly [Square, Piece][]): GameState {
  const initial = createInitialState();
  const board = initial.board.map(() => null) as (Piece | null)[];
  for (const color of ALL_COLORS) board[localSquare(color, 4, 0)] = { type: PieceType.King, owner: color, hasMoved: true };
  for (const [square, piece] of pieces) {
    if (!isSquareOnBoard(square) || board[square]) throw new Error("Invalid teaching placement");
    board[square] = piece;
  }
  return { ...initial, board, positionCounts: {},
    castlingRights: { 0: { kingside: false, queenside: false }, 1: { kingside: false, queenside: false },
      2: { kingside: false, queenside: false }, 3: { kingside: false, queenside: false } } };
}

const piece = (type: PieceType, owner: PlayerColor): Piece => ({ type, owner, hasMoved: true });
export const startingBoard = createInitialState();
export const promotionFrom = squareOf(5, 6); // f7, Red's seventh rank
export const promotionTo = squareOf(5, 7); // f8, Red's eighth rank
export const beforePromotion = teachingPosition([[promotionFrom, piece(PieceType.Pawn, PlayerColor.Red)]]);
export const afterPromotion = applyMoveRequest(beforePromotion, { from: promotionFrom, to: promotionTo });

export const captureFrom = squareOf(7, 3); // h4
export const captureTo = squareOf(9, 3); // j4
export const recaptureFrom = squareOf(12, 6); // m7
export const beforeCapture = teachingPosition([
  [captureFrom, piece(PieceType.Queen, PlayerColor.Red)],
  [captureTo, piece(PieceType.Rook, PlayerColor.Blue)],
  [recaptureFrom, piece(PieceType.Bishop, PlayerColor.Green)],
]);
export const afterCapture = applyMoveRequest(beforeCapture, { from: captureFrom, to: captureTo });
const blueWaits = applyMoveRequest(afterCapture, { from: localSquare(PlayerColor.Blue, 4, 0), to: squareOf(1, 6) });
const yellowWaits = applyMoveRequest(blueWaits, { from: localSquare(PlayerColor.Yellow, 4, 0), to: squareOf(7, 13) });
export const afterRecapture = applyMoveRequest(yellowWaits, { from: recaptureFrom, to: captureTo });

// Fail generation as well as tests if an engine change invalidates a published example.
if (VALID_SQUARES.length !== 160 || startingBoard.board.filter(Boolean).length !== 64
  || afterPromotion.board[promotionTo]?.promotedFrom !== PieceType.Pawn
  || captureValue(afterPromotion.board[promotionTo]!) !== 1
  || afterCapture.players[PlayerColor.Red].score !== 5
  || afterRecapture.players[PlayerColor.Green].score !== 9) {
  throw new Error("Guide examples no longer match the rules engine; review the text and diagrams.");
}

export const guideDiagrams = [
  { name: "starting-board", title: "Four armies, one board", description: "The engine's starting position: Red at the bottom, Blue left, Yellow top and Green right. Arrows show each army's pawn direction. Turns go Red, Blue, Yellow, Green.",
    state: startingBoard, crop: [0, 13, 0, 13], highlights: [] as Square[],
    arrows: [[squareOf(7, 3), squareOf(7, 5)], [squareOf(3, 7), squareOf(5, 7)],
      [squareOf(6, 10), squareOf(6, 8)], [squareOf(10, 6), squareOf(8, 6)]], seats: true },
  { name: "red-promotion", title: "Promotion is closer than the far edge", description: "Cropped teaching position, viewed from Red. Red's pawn on f7 moves to f8 and automatically becomes a Queen. A later active capture of that Queen is worth one point.",
    state: beforePromotion, crop: [3, 8, 4, 9], highlights: [promotionTo], arrows: [[promotionFrom, promotionTo]], seats: false },
  { name: "capture-trap", title: "A five-point capture can cost nine", description: "Cropped teaching position. Red Queen h4 can capture Blue Rook j4 for five points. After quiet Blue and Yellow King moves, Green Bishop m7 can capture that Queen on j4 for nine points. Both captures are engine-validated legal moves.",
    state: beforeCapture, crop: [5, 13, 1, 9], highlights: [captureTo], arrows: [[captureFrom, captureTo], [recaptureFrom, captureTo]], seats: false },
] as const;

export const coordinates = (square: Square) => `${String.fromCharCode(97 + fileOf(square))}${rankOf(square) + 1}`;
