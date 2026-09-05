import { PlayerColor } from "./types.js";

/** 14x14 grid; four 3x3 corners are cut out, leaving a 160-square cross/plus shape. */
export const BOARD_SIZE = 14;
export const CUTOUT_SIZE = 3;
export const NUM_SQUARES = BOARD_SIZE * BOARD_SIZE; // 196, includes cutout cells

export function fileOf(square: number): number {
  return square % BOARD_SIZE;
}

export function rankOf(square: number): number {
  return Math.floor(square / BOARD_SIZE);
}

export function squareOf(file: number, rank: number): number {
  return rank * BOARD_SIZE + file;
}

export function isInBounds(file: number, rank: number): boolean {
  return file >= 0 && file < BOARD_SIZE && rank >= 0 && rank < BOARD_SIZE;
}

/** True iff (file, rank) falls inside one of the four cut corners. */
export function isCutout(file: number, rank: number): boolean {
  const lowBand = file < CUTOUT_SIZE;
  const highBandFile = file >= BOARD_SIZE - CUTOUT_SIZE;
  const lowBandRank = rank < CUTOUT_SIZE;
  const highBandRank = rank >= BOARD_SIZE - CUTOUT_SIZE;
  return (lowBand || highBandFile) && (lowBandRank || highBandRank);
}

/** True iff (file, rank) is a real, playable square on the cross-shaped board. */
export function isOnBoard(file: number, rank: number): boolean {
  return isInBounds(file, rank) && !isCutout(file, rank);
}

export function isSquareOnBoard(square: number): boolean {
  if (square < 0 || square >= NUM_SQUARES) return false;
  return isOnBoard(fileOf(square), rankOf(square));
}

/** All 160 playable squares, in ascending index order. Computed once at module load. */
export const VALID_SQUARES: readonly number[] = (() => {
  const squares: number[] = [];
  for (let square = 0; square < NUM_SQUARES; square++) {
    if (isSquareOnBoard(square)) squares.push(square);
  }
  return squares;
})();

/**
 * Rotate an absolute (file, rank) 90 degrees clockwise about the board center.
 * Used to derive each player's local-frame transform from Red's, since seating
 * proceeds clockwise: Red (bottom) -> Blue (left) -> Yellow (top) -> Green (right).
 */
function rotateCW(file: number, rank: number): [number, number] {
  // center is (6.5, 6.5); rotateCW(dx, dy) = (dy, -dx) about that center.
  return [rank, BOARD_SIZE - 1 - file];
}

/**
 * Maps a player's own local coordinates to absolute board coordinates.
 *
 * Local frame convention (same for every player, so movegen/castling/promotion
 * logic is written once and reused for all 4 orientations):
 *   - localFile 0..7 runs queenside -> kingside along the player's own back rank
 *     (matching standard chess file order: R N B Q K B N R).
 *   - localRank 0 is the player's own back rank; increasing localRank moves
 *     forward, toward the far side of the board (the direction that player's
 *     pawns advance and where they promote).
 */
export function localToBoard(
  color: PlayerColor,
  localFile: number,
  localRank: number
): [number, number] {
  // Red's own frame: back rank sits at absolute rank 0, occupying files 3..10.
  let file = localFile + CUTOUT_SIZE;
  let rank = localRank;
  for (let i = 0; i < color; i++) {
    [file, rank] = rotateCW(file, rank);
  }
  return [file, rank];
}

export function localSquare(
  color: PlayerColor,
  localFile: number,
  localRank: number
): number {
  const [file, rank] = localToBoard(color, localFile, localRank);
  return squareOf(file, rank);
}

function rotateCCW(file: number, rank: number): [number, number] {
  return [BOARD_SIZE - 1 - rank, file];
}

/** Inverse of localToBoard: absolute (file, rank) -> a player's own local (localFile, localRank). */
export function boardToLocal(
  color: PlayerColor,
  file: number,
  rank: number
): [number, number] {
  for (let i = 0; i < color; i++) {
    [file, rank] = rotateCCW(file, rank);
  }
  return [file - CUTOUT_SIZE, rank];
}
