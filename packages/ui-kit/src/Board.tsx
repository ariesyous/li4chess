import { BOARD_SIZE, Piece, PieceType, PlayerColor, isOnBoard, squareOf, localToBoard, boardToLocal, localSquare } from "@li4chess/engine";
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { PIECE_GLYPHS } from "./pieceGlyphs.js";
import { PLAYER_COLOR_HEX } from "./theme.js";

export interface BoardProps {
  readonly board: readonly (Piece | null)[];
  readonly onSquareClick?: (square: number) => void;
  readonly onClearSelection?: () => void;
  readonly selectedSquare?: number | null;
  readonly legalTargets?: ReadonlySet<number>;
  readonly checkedColors?: ReadonlySet<PlayerColor>;
  /** Passive army owners supplied by the application; the board does not decide game status. */
  readonly deadColors?: ReadonlySet<PlayerColor>;
  /** Per-square passive appearance, including dead armies with a live King. */
  readonly deadSquares?: ReadonlySet<number>;
  readonly lastMove?: { readonly from: number; readonly to: number } | null;
  /** Which color's side renders at the bottom of the screen. Defaults to Red (the board's "natural" orientation). */
  readonly bottomColor?: PlayerColor;
}

/** Absolute (file, rank) for a given on-screen position, given which color's zone renders at the bottom. */
function displayToAbsolute(displayFile: number, displayRank: number, bottomColor: PlayerColor): [number, number] {
  return localToBoard(bottomColor, displayFile - 3, displayRank);
}
const PIECE_NAMES = { P: "Pawn", N: "Knight", B: "Bishop", R: "Rook", Q: "Queen", K: "King" };

export function Board({
  board,
  onSquareClick,
  onClearSelection,
  selectedSquare = null,
  legalTargets,
  checkedColors,
  deadColors,
  deadSquares,
  lastMove,
  bottomColor = PlayerColor.Red,
}: BoardProps) {
  const [focused, setFocused] = useState(() => localSquare(bottomColor, 3, 1));
  const boardRef = useRef<HTMLDivElement>(null);
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, square: number) => {
    if (event.key === "Escape") { event.preventDefault(); onClearSelection?.(); return; }
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (!directions[event.key] && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const [localFile, rank] = boardToLocal(bottomColor, square % 14, Math.floor(square / 14));
    let file = localFile + 3, nextRank = rank;
    const [df, dr] = directions[event.key] ?? [event.key === "Home" ? 1 : -1, 0];
    if (event.key === "Home") file = -1;
    if (event.key === "End") file = 14;
    for (let i = 0; i < 14; i++) {
      file += df; nextRank += dr;
      if (file < 0 || file > 13 || nextRank < 0 || nextRank > 13) break;
      const [f, r] = displayToAbsolute(file, nextRank, bottomColor);
      if (!isOnBoard(f, r)) continue;
      const next = squareOf(f, r);
      setFocused(next); boardRef.current?.querySelector<HTMLButtonElement>(`[data-square="${next}"]`)?.focus(); break;
    }
  };
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
      const isDead = piece !== null && (deadSquares?.has(square) ?? (deadColors?.has(piece.owner) === true));
      const isSelected = selectedSquare === square;
      const isLegalTarget = legalTargets?.has(square) ?? false;
      const isLastMove = lastMove?.from === square || lastMove?.to === square;
      const isDark = (file + rank) % 2 === 0;
      const isCheckedKingSquare =
        !isDead && piece?.type === PieceType.King && checkedColors?.has(piece.owner) === true;

      cells.push(
        <button
          key={square}
          type="button"
          data-square={square}
          className="board-square"
          tabIndex={focused === square ? 0 : -1}
          aria-pressed={isSelected}
          aria-label={`${String.fromCharCode(97 + file)}${rank + 1}${piece ? ` ${isDead ? "dead " : ""}${PlayerColor[piece.owner]} ${PIECE_NAMES[piece.type]}` : " empty"}${isLegalTarget ? ", legal destination" : ""}${isCheckedKingSquare ? ", in check" : ""}${isLastMove ? ", last move" : ""}`}
          onFocus={() => setFocused(square)}
          onKeyDown={event => navigate(event, square)}
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
            fontSize: "clamp(20px, 4.6vw, 36px)",
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
            <span aria-hidden="true" style={{ color: isDead ? "#777777" : PLAYER_COLOR_HEX[piece.owner], filter: "drop-shadow(0 0 1px black)", WebkitTextStroke: "0.5px #202c28" }}>
              {PIECE_GLYPHS[piece.type]}
            </span>
          )}
          {piece && <small aria-hidden="true" className="piece-owner">{PlayerColor[piece.owner][0]}{isDead ? "×" : ""}</small>}
        </button>
      );
    }
  }

  return (
    <div
      ref={boardRef}
      role="group"
      aria-label="Four-player chess board. Arrow keys navigate, Enter or Space selects, Escape clears."
      className="chess-board"
      data-bottom-color={bottomColor}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
        gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
        width: "100%",
        aspectRatio: "1",
        gap: "1px",
        background: "transparent",
      }}
    >
      {cells}
    </div>
  );
}
