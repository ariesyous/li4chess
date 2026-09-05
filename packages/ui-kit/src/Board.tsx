import { BOARD_SIZE, Piece, PieceType, PlayerColor, isOnBoard, squareOf } from "@li4chess/engine";
import { PIECE_GLYPHS } from "./pieceGlyphs.js";
import { PLAYER_COLOR_HEX } from "./theme.js";

export interface BoardProps {
  readonly board: readonly (Piece | null)[];
  readonly onSquareClick?: (square: number) => void;
  readonly selectedSquare?: number | null;
  readonly legalTargets?: ReadonlySet<number>;
  readonly checkedColors?: ReadonlySet<PlayerColor>;
  readonly lastMove?: { readonly from: number; readonly to: number } | null;
  /** Which color's side renders at the bottom of the screen. Defaults to Red (the board's "natural" orientation). */
  readonly bottomColor?: PlayerColor;
}

const ROTATIONS: Record<PlayerColor, number> = {
  [PlayerColor.Red]: 0,
  [PlayerColor.Blue]: 1,
  [PlayerColor.Yellow]: 2,
  [PlayerColor.Green]: 3,
};

// Mirrors the engine's own board.ts rotateCW exactly, so display rotation stays
// consistent with the seating geometry (Red -> Blue -> Yellow -> Green, clockwise).
function rotateCW(file: number, rank: number): [number, number] {
  return [rank, BOARD_SIZE - 1 - file];
}

/** Absolute (file, rank) for a given on-screen position, given which color's zone renders at the bottom. */
function displayToAbsolute(displayFile: number, displayRank: number, bottomColor: PlayerColor): [number, number] {
  let file = displayFile;
  let rank = displayRank;
  for (let i = 0; i < ROTATIONS[bottomColor]; i++) {
    [file, rank] = rotateCW(file, rank);
  }
  return [file, rank];
}

export function Board({
  board,
  onSquareClick,
  selectedSquare = null,
  legalTargets,
  checkedColors,
  lastMove,
  bottomColor = PlayerColor.Red,
}: BoardProps) {
  const cells: JSX.Element[] = [];

  // Render rank 13 (top of screen) down to rank 0 (bottom), so the bottom color's back rank sits at the bottom.
  for (let displayRank = BOARD_SIZE - 1; displayRank >= 0; displayRank--) {
    for (let displayFile = 0; displayFile < BOARD_SIZE; displayFile++) {
      const [file, rank] = displayToAbsolute(displayFile, displayRank, bottomColor);
      if (!isOnBoard(file, rank)) {
        cells.push(<div key={`${displayFile},${displayRank}`} style={{ visibility: "hidden" }} />);
        continue;
      }

      const square = squareOf(file, rank);
      const piece = board[square];
      const isSelected = selectedSquare === square;
      const isLegalTarget = legalTargets?.has(square) ?? false;
      const isLastMove = lastMove?.from === square || lastMove?.to === square;
      const isDark = (file + rank) % 2 === 0;
      const isCheckedKingSquare =
        piece?.type === PieceType.King && checkedColors?.has(piece.owner) === true;

      cells.push(
        <button
          key={square}
          type="button"
          onClick={() => onSquareClick?.(square)}
          style={{
            width: "100%",
            height: "100%",
            aspectRatio: "1",
            border: "none",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "min(3.5vw, 32px)",
            cursor: onSquareClick ? "pointer" : "default",
            background: isSelected
              ? "#f5d76e"
              : isLastMove
                ? "#e8e0b0"
                : isDark
                  ? "#7a8c6e"
                  : "#e9e6d6",
            outline: isCheckedKingSquare ? "3px solid #ff2d2d" : "none",
            outlineOffset: "-3px",
            position: "relative",
          }}
        >
          {isLegalTarget && (
            <span
              style={{
                position: "absolute",
                width: piece ? "90%" : "30%",
                height: piece ? "90%" : "30%",
                borderRadius: "50%",
                background: piece ? "transparent" : "rgba(0,0,0,0.25)",
                border: piece ? "3px solid rgba(0,0,0,0.35)" : "none",
              }}
            />
          )}
          {piece && (
            <span style={{ color: PLAYER_COLOR_HEX[piece.owner], filter: "drop-shadow(0 0 1px black)" }}>
              {PIECE_GLYPHS[piece.type]}
            </span>
          )}
        </button>
      );
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
        gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
        width: "min(90vw, 700px)",
        aspectRatio: "1",
        gap: "1px",
        background: "#333",
      }}
    >
      {cells}
    </div>
  );
}
