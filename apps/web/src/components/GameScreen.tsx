import { ALL_COLORS, PieceType, PlayerColor } from "@li4chess/engine";
import { Board, PIECE_GLYPHS, PLAYER_COLOR_HEX, PLAYER_COLOR_NAME } from "@li4chess/ui-kit";
import { useState } from "react";
import { SeatSetups, useLocalGame } from "../game/useLocalGame.js";

const PROMOTION_CHOICES: readonly PieceType[] = [
  PieceType.Queen,
  PieceType.Rook,
  PieceType.Bishop,
  PieceType.Knight,
];

function squareLabel(square: number): string {
  const file = square % 14;
  const rank = Math.floor(square / 14);
  return `${String.fromCharCode(97 + file)}${rank + 1}`;
}

export function GameScreen({ seats, onRestart }: { seats: SeatSetups; onRestart: () => void }) {
  const {
    state,
    selectedSquare,
    legalTargets,
    selectSquare,
    pendingPromotion,
    choosePromotion,
    cancelPromotion,
  } = useLocalGame(seats);
  const [rotateToMover, setRotateToMover] = useState(false);

  const lastMove = state.moveHistory[state.moveHistory.length - 1] ?? null;
  const checkedColors = new Set(lastMove?.isCheck ?? []);
  const justAffected = ALL_COLORS.filter(
    (color) => state.players[color].eliminatedOnTurn === state.turnNumber
  );

  return (
    <div
      style={{ display: "flex", gap: 24, padding: 24, fontFamily: "system-ui, sans-serif", alignItems: "flex-start" }}
    >
      <div style={{ position: "relative" }}>
        <Board
          board={state.board}
          onSquareClick={selectSquare}
          selectedSquare={selectedSquare}
          legalTargets={legalTargets}
          checkedColors={checkedColors}
          lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
          bottomColor={rotateToMover ? state.turn : PlayerColor.Red}
        />

        {pendingPromotion && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ background: "white", borderRadius: 8, padding: 16, textAlign: "center" }}>
              <p style={{ margin: "0 0 12px" }}>Promote to:</p>
              <div style={{ display: "flex", gap: 8 }}>
                {PROMOTION_CHOICES.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    data-testid={`promote-${choice}`}
                    onClick={() => choosePromotion(choice)}
                    style={{ fontSize: 28, padding: 8, cursor: "pointer" }}
                  >
                    {PIECE_GLYPHS[choice]}
                  </button>
                ))}
              </div>
              <button type="button" onClick={cancelPromotion} style={{ marginTop: 8 }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ minWidth: 240 }}>
        <h2>Status</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {ALL_COLORS.map((color) => (
            <li
              key={color}
              style={{
                color: PLAYER_COLOR_HEX[color],
                fontWeight: state.turn === color && state.result === null ? "bold" : "normal",
              }}
            >
              {PLAYER_COLOR_NAME[color]}
              {seats[color].isCPU ? ` (CPU L${seats[color].difficulty})` : " (You)"} — {state.players[color].status}
              {" · "}
              {state.players[color].score} pts
            </li>
          ))}
        </ul>

        {justAffected.length > 0 && (
          <div style={{ background: "#fff3cd", border: "1px solid #e0c060", borderRadius: 6, padding: 8, margin: "8px 0" }}>
            {justAffected.map((color) =>
              state.players[color].status === "checkmated" ? (
                <p key={color} style={{ margin: 0, color: PLAYER_COLOR_HEX[color] }}>
                  ♔ {PLAYER_COLOR_NAME[color]} is checkmated — eliminated, their pieces are removed from the board.
                </p>
              ) : (
                <p key={color} style={{ margin: 0, color: PLAYER_COLOR_HEX[color] }}>
                  {PLAYER_COLOR_NAME[color]} is stalemated — no legal moves, but not in check. Their pieces stay
                  frozen on the board and they're skipped from now on.
                </p>
              )
            )}
          </div>
        )}

        {state.result ? (
          <div data-testid="game-result">
            <h3>Game over</h3>
            <ol style={{ paddingLeft: 20 }}>
              {state.result.placements.map((p) => (
                <li
                  key={p.color}
                  data-testid={p.place === 1 ? "winner-name" : undefined}
                  style={{
                    color: PLAYER_COLOR_HEX[p.color],
                    fontWeight: p.place === 1 ? "bold" : "normal",
                  }}
                >
                  {p.place === 1 ? "🏆 " : ""}
                  {PLAYER_COLOR_NAME[p.color]} — {p.score} pts
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p data-testid="turn-status">
            Turn {state.turnNumber} — {PLAYER_COLOR_NAME[state.turn]} to move
          </p>
        )}

        <label style={{ display: "block", margin: "8px 0" }}>
          <input type="checkbox" checked={rotateToMover} onChange={(e) => setRotateToMover(e.target.checked)} />{" "}
          Rotate board to current player
        </label>

        <button type="button" onClick={onRestart} style={{ marginTop: 8 }}>
          New game
        </button>

        <h3 style={{ marginTop: 24 }}>Move history</h3>
        <ol
          data-testid="move-history"
          style={{ maxHeight: 300, overflowY: "auto", paddingLeft: 20, fontSize: 14, margin: 0 }}
        >
          {state.moveHistory.map((move, index) => (
            <li key={index} style={{ color: PLAYER_COLOR_HEX[move.piece.owner] }}>
              {move.piece.type}
              {squareLabel(move.from)}
              {move.captured ? "x" : "-"}
              {squareLabel(move.to)}
              {move.promotion ? `=${move.promotion}` : ""}
              {move.castle ? ` (${move.castle} castle)` : ""}
              {move.isCheck.length > 0 ? "+" : ""}
              {move.eliminates.length > 0 ? " ✝" : ""}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
