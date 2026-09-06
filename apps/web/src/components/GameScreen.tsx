import { ALL_COLORS, PlayerColor, isPlayerInCheck, isLivePiece,hasLiveKing,canClaimWin } from "@li4chess/engine";
import { Board, PLAYER_COLOR_HEX, PLAYER_COLOR_NAME } from "@li4chess/ui-kit";
import { useState } from "react";
import { SeatSetups, useLocalGame } from "../game/useLocalGame.js";

function squareLabel(square: number): string {
  const file = square % 14;
  const rank = Math.floor(square / 14);
  return `${String.fromCharCode(97 + file)}${rank + 1}`;
}

export function GameScreen({ seats, onRestart }: { seats: SeatSetups; onRestart: () => void }) {
  const { state, selectedSquare, legalTargets, selectSquare,resign,timeout,claim } = useLocalGame(seats);
  const [rotateToMover, setRotateToMover] = useState(false);

  const lastMove = state.moveHistory[state.moveHistory.length - 1] ?? null;
  const deadSquares = new Set(state.board.flatMap((piece,square)=>piece && !isLivePiece(state,piece) ? [square] : []));
  const checkedColors = new Set(ALL_COLORS.filter(color => hasLiveKing(state,color) && isPlayerInCheck(state, color)));
  const justAffected = ALL_COLORS.filter(
    (color) => state.players[color].eliminatedOnTurn === state.turnNumber && ["checkmated","stalemated"].includes(state.players[color].status)
  );

  return (
    <div
      style={{ display: "flex", gap: 24, padding: 24, fontFamily: "system-ui, sans-serif", alignItems: "flex-start" }}
    >
      <Board
        board={state.board}
        onSquareClick={selectSquare}
        selectedSquare={selectedSquare}
        legalTargets={legalTargets}
        checkedColors={checkedColors}
        deadSquares={deadSquares}
        lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
        bottomColor={rotateToMover ? state.turn : PlayerColor.Red}
      />

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
              {state.players[color].kingStatus === "walking" ? " · King walks automatically" : ""}
            </li>
          ))}
        </ul>

        {justAffected.length > 0 && (
          <div style={{ background: "#fff3cd", border: "1px solid #e0c060", borderRadius: 6, padding: 8, margin: "8px 0" }}>
            {justAffected.map((color) =>
              state.players[color].status === "checkmated" ? (
                <p key={color} style={{ margin: 0, color: PLAYER_COLOR_HEX[color] }}>
                  ♔ {PLAYER_COLOR_NAME[color]} is checkmated — their army stays on the board as dead pieces.
                  They block squares, cannot move or attack, and can be captured for zero points.
                </p>
              ) : (
                <p key={color} style={{ margin: 0, color: PLAYER_COLOR_HEX[color] }}>
                  {PLAYER_COLOR_NAME[color]} is stalemated — no legal moves, but not in check. Their pieces stay
                  on the board as dead pieces that block squares, cannot move or attack, and can be captured for zero points.
                </p>
              )
            )}
          </div>
        )}

        {state.result ? (
          <div data-testid="game-result">
            <h3>
              {state.result.reason === "abort" ? "Game aborted" : "Game over"}
              {state.result.reason === "repetition"
                ? " — draw by threefold repetition"
                : ""}
            </h3>
            {state.result.abort && <p>{PLAYER_COLOR_NAME[state.result.abort.actor]} {state.result.abort.classification === "early-resign" ? "resigned" : "timed out"} before every seat completed three moves. No placements are awarded.</p>}
            {state.result.claim && <p>{PLAYER_COLOR_NAME[state.result.claim.actor]} claimed the win. {PLAYER_COLOR_NAME[state.result.claim.trailer]} received 20 points; play ends immediately.</p>}
            <ol style={{ paddingLeft: 20 }}>
              {state.result.placements.map((p) => (
                <li
                  key={p.color}
                  data-testid={p.place === 1 && state.result!.winner !== null ? "winner-name" : undefined}
                  style={{
                    color: PLAYER_COLOR_HEX[p.color],
                    fontWeight: p.place === 1 ? "bold" : "normal",
                  }}
                >
                  {p.place === 1 ? "🏆 " : ""}
                  {PLAYER_COLOR_NAME[p.color]} — {p.score} pts · place {p.place}{p.meanRank!==p.place ? " (shared)" : ""}
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
        {!state.result && state.players[state.turn].status === "active" && <div style={{ marginTop:8 }}>
          <button type="button" onClick={resign}>Resign {PLAYER_COLOR_NAME[state.turn]}</button>{" "}
          <button type="button" onClick={timeout}>Simulate timeout</button>
          <p style={{ fontSize:14 }}>A forfeit before every seat completes three moves aborts the game. Later, the army becomes dead and its King moves automatically. Timeout is a local action; this game has no running clock.</p>
        </div>}
        {ALL_COLORS.filter(color=>!seats[color].isCPU && canClaimWin(state,color)).map(color=><div key={color}>
          <button type="button" onClick={()=>claim(color)}>Claim Win for {PLAYER_COLOR_NAME[color]}</button>
          <p>End now: the other active player receives 20 points. Final points determine placements.</p>
        </div>)}

        <h3 style={{ marginTop: 24 }}>Move history</h3>
        <p style={{ fontSize: 14 }}>Pawns automatically become Queens on their eighth rank. A promoted Queen is worth one capture point.</p>
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
        <h3>Points</h3>
        <ol data-testid="award-ledger" style={{ maxHeight: 160, overflowY: "auto", fontSize: 14 }}>
          {state.awardLedger.map(award => (
            <li key={award.sequence}>
              {PLAYER_COLOR_NAME[award.recipient]} +{award.delta} {award.rule === "multi-check" ? "multiple kings checked" : award.rule} — {award.total} pts
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
