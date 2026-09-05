import { Board, PLAYER_COLOR_HEX, PLAYER_COLOR_NAME } from "@li4chess/ui-kit";
import { SeatSetups, useLocalGame } from "../game/useLocalGame.js";
import { ALL_COLORS } from "@li4chess/engine";

export function GameScreen({ seats, onRestart }: { seats: SeatSetups; onRestart: () => void }) {
  const { state, selectedSquare, legalTargets, selectSquare } = useLocalGame(seats);
  const lastMove = state.moveHistory[state.moveHistory.length - 1] ?? null;
  const checkedColors = new Set(lastMove?.isCheck ?? []);

  return (
    <div style={{ display: "flex", gap: 24, padding: 24, fontFamily: "system-ui, sans-serif", alignItems: "flex-start" }}>
      <Board
        board={state.board}
        onSquareClick={selectSquare}
        selectedSquare={selectedSquare}
        legalTargets={legalTargets}
        checkedColors={checkedColors}
        lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
      />
      <div style={{ minWidth: 220 }}>
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

        {state.result ? (
          <div>
            <h3>Game over</h3>
            <ol>
              {state.result.placements.map((p) => (
                <li key={p.color} style={{ color: PLAYER_COLOR_HEX[p.color] }}>
                  {PLAYER_COLOR_NAME[p.color]} — {p.score} pts
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p>
            Turn {state.turnNumber} — {PLAYER_COLOR_NAME[state.turn]} to move
          </p>
        )}

        <button type="button" onClick={onRestart} style={{ marginTop: 16 }}>
          New game
        </button>
      </div>
    </div>
  );
}
