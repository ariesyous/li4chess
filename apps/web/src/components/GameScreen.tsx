import { ALL_COLORS, PlayerColor, isPlayerInCheck, isLivePiece, hasLiveKing, canClaimWin } from "@li4chess/engine";
import { CPU_POLICIES } from "@li4chess/bot";
import type { CpuLevel } from "@li4chess/bot";
import { Board, PLAYER_COLOR_HEX, PLAYER_COLOR_NAME } from "@li4chess/ui-kit";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { SeatSetups, useLocalGame } from "../game/useLocalGame.js";
import type { ResumedGame } from "../game/localSave.js";
import { RulesHelp } from "./RulesHelp.js";

const squareLabel = (square: number) => `${String.fromCharCode(97 + square % 14)}${Math.floor(square / 14) + 1}`;
const directions = ["bottom", "left", "top", "right"] as const;
const points = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2);

export function GameScreen({ seats, onRestart, resumed }: { seats: SeatSetups; onRestart: () => void; resumed?: ResumedGame }) {
  const game = useLocalGame(seats, resumed);
  const { state, selectedSquare, legalTargets, selectSquare, clearSelection, reset, resign, timeout, claim,
    exportReplay, importReplay, replayBusy, replayMessage, cpuStatus, cpuNotice, save, saveMessage } = game;
  const [rotateToMover, setRotateToMover] = useState(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (state.result) resultHeading.current?.focus(); }, [state.result]);
  const bottomColor = rotateToMover ? state.turn : PlayerColor.Red;
  const lastMove = state.moveHistory.at(-1) ?? null;
  const deadSquares = new Set(state.board.flatMap((piece, square) => piece && !isLivePiece(state, piece) ? [square] : []));
  const checkedColors = new Set(ALL_COLORS.filter(color => hasLiveKing(state, color) && isPlayerInCheck(state, color)));
  const previous = useRef({ state, checkedColors });
  const [actionAnnouncement, setActionAnnouncement] = useState("");
  useEffect(() => {
    const before = previous.current;
    previous.current = { state, checkedColors };
    if (before.state === state) return;
    const parts: string[] = [];
    const move = state.moveHistory.at(-1);
    if (move && state.moveHistory.length > before.state.moveHistory.length) {
      parts.push(`${PLAYER_COLOR_NAME[move.piece.owner]} moved ${squareLabel(move.from)} to ${squareLabel(move.to)}${move.captured ? ", capture" : ""}${move.promotion ? ", promoted to Queen" : ""}.`);
    }
    for (const color of ALL_COLORS) {
      const player = state.players[color], old = before.state.players[color];
      const delta = player.score - old.score;
      if (delta > 0) parts.push(`${PLAYER_COLOR_NAME[color]} gained ${points(delta)} points; total ${points(player.score)}.`);
      if (player.status !== old.status && player.status !== "active") parts.push(`${PLAYER_COLOR_NAME[color]} ${player.status}; dead army${player.kingStatus === "walking" ? ", King walks automatically" : ""}.`);
      if (old.kingStatus === "walking" && player.kingStatus && ["checkmated", "stalemated", "surrendered"].includes(player.kingStatus)) parts.push(`${PLAYER_COLOR_NAME[color]} King ${player.kingStatus}; dead army.`);
      if (checkedColors.has(color) && !before.checkedColors.has(color)) parts.push(`${PLAYER_COLOR_NAME[color]} is in check.`);
    }
    setActionAnnouncement(parts.join(" "));
  }, [state]);
  const justAffected = ALL_COLORS.filter(color => state.players[color].eliminatedOnTurn === state.turnNumber && ["checkmated", "stalemated"].includes(state.players[color].status));
  const humanCount = ALL_COLORS.filter(color => !state.players[color].isCPU).length;
  const mode = humanCount === 4 ? "Hotseat" : humanCount === 0 ? "Four CPUs" : "Human + CPU";
  const opening = ALL_COLORS.some(color => state.completedMoves[color] < 3);
  const confirmAction = (message: string, action: () => void) => { if (window.confirm(message)) action(); };
  const events = [
    ...ALL_COLORS.flatMap(color => state.players[color].forfeit ? [{
      sequence: state.players[color].forfeit!.sequence,
      text: `${PLAYER_COLOR_NAME[color]} ${state.players[color].forfeit!.reason === "resign" ? "resigned" : "timed out"}; its King walks automatically while live.`,
    }] : []),
    ...state.randomActions.map(action => ({ sequence: action.sequence, text: `${PLAYER_COLOR_NAME[action.actor]} walking King: ${squareLabel(action.move.from)}–${squareLabel(action.move.to)}` })),
  ].sort((a, b) => a.sequence - b.sequence);

  return <main className="game-shell">
    <header className="app-header">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); onRestart(); }}>li4chess<span>Four players. One board.</span></a>
      <div className="context"><strong>Standard FFA</strong><span>{mode} · Local · No clock</span></div>
      <button type="button" onClick={onRestart}>New game</button>
    </header>
    <div className="game-layout">
      <section className="play-area" aria-label="Game board and players">
        <div className="turn-banner" aria-live="polite" aria-atomic="true">
          {state.result ? <span>{state.result.reason === "abort" ? "Game aborted" : "Game finished"} · Results below</span> :
            <span data-testid="turn-status">Turn {state.turnNumber} — <strong>{PLAYER_COLOR_NAME[state.turn]} to move</strong>{checkedColors.has(state.turn) ? " · Check" : ""}</span>}
          <span data-testid="cpu-status">{cpuStatus}</span>
          <span className="sr-only" data-testid="action-announcement">{actionAnnouncement}</span>
        </div>
        <div className="arena">
          {ALL_COLORS.map(color => {
            const player = state.players[color], direction = directions[(color - bottomColor + 4) % 4];
            const current = !state.result && color === state.turn;
            const status = state.result ? "Finished" : player.kingStatus === "walking" ? "Walking King" : player.status !== "active" ? "Dead army" : checkedColors.has(color) ? "Check" : current ? "To move" : "Ready";
            return <section key={color} className={`player-panel player-${direction}${current ? " current-player" : ""}`}
              style={{ "--seat-color": PLAYER_COLOR_HEX[color] } as CSSProperties}
              data-testid={`player-${color}`} data-direction={direction} aria-label={`${PLAYER_COLOR_NAME[color]}, ${direction} player`}>
              <strong className="player-name">{PLAYER_COLOR_NAME[color]} <span aria-hidden="true">{current ? "◆" : "◇"}</span></strong>
              <span className="player-kind">{player.isCPU ? `CPU L${player.cpuDifficulty ?? 3}` : "Human"}</span>
              <strong className="player-points">{points(player.score)} <small>pts</small></strong>
              <span className="player-state">{status}</span>
            </section>;
          })}
          <div className="board-slot"><Board board={state.board} onSquareClick={selectSquare} onClearSelection={clearSelection}
            selectedSquare={selectedSquare} legalTargets={legalTargets} checkedColors={checkedColors} deadSquares={deadSquares}
            lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null} bottomColor={bottomColor} /></div>
        </div>
        <div className="board-tools">
          <label><input type="checkbox" checked={rotateToMover} onChange={event => setRotateToMover(event.target.checked)} /> Rotate board to current player</label>
          <span>Bottom: {PLAYER_COLOR_NAME[bottomColor]}</span>
        </div>
        <p className="board-help" role="status">{selectedSquare === null ? "Select a piece, then a marked square. Keyboard: arrows, Enter / Space; Escape clears." : `${squareLabel(selectedSquare)} selected · ${legalTargets.size} legal destinations. Choose a marked square; Escape clears.`}</p>
        {cpuNotice && <p className="notice" role="status">{cpuNotice}</p>}
        {justAffected.map(color => <p key={color} className="notice">{PLAYER_COLOR_NAME[color]} is {state.players[color].status} — their dead pieces block squares, cannot move or attack, and can be captured for zero points.</p>)}
        {state.result && <section className="result-card" data-testid="game-result" aria-labelledby="result-heading">
          <p className="eyebrow">Final result</p>
          <h2 id="result-heading" ref={resultHeading} tabIndex={-1}>{state.result.reason === "abort" ? "Game aborted" : "Game over"}
            {state.result.reason === "repetition" ? " — draw by threefold repetition" : state.result.reason === "insufficient-material" ? " — draw by insufficient material" : state.result.reason === "fifty-move" ? " — draw by 50-move rule" : ""}</h2>
          {state.result.abort && <p>{PLAYER_COLOR_NAME[state.result.abort.actor]} {state.result.abort.classification === "early-resign" ? "resigned" : "timed out"} before every seat completed three moves. No placements are awarded.</p>}
          {state.result.claim && <p>{PLAYER_COLOR_NAME[state.result.claim.actor]} claimed the win. {PLAYER_COLOR_NAME[state.result.claim.trailer]} received 20 points; play ends immediately.</p>}
          <ol className="placements">{state.result.placements.map(p => <li key={p.color} data-testid={p.place === 1 && state.result!.winner !== null ? "winner-name" : undefined}>
            <strong>{PLAYER_COLOR_NAME[p.color]} — {points(p.score)} pts · place {p.place}{p.meanRank !== p.place ? " (shared)" : ""}</strong>
          </li>)}</ol>
          {state.result.reason !== "abort" && <p>Final points determine every placement, including eliminated players.</p>}
          <button type="button" onClick={onRestart}>Play again</button>
        </section>}
      </section>
      <aside className="game-sidebar" aria-label="Game controls and history">
        <section className="card controls"><h2>Your game</h2>
          <p>{mode}. {state.players[state.turn].isCPU && !state.result ? `CPU level ${state.players[state.turn].cpuDifficulty ?? 3}: ${CPU_POLICIES[(state.players[state.turn].cpuDifficulty ?? 3) as CpuLevel].label}.` : "Play locally, save here, or export a replay."}</p>
          <div className="button-row"><button type="button" onClick={save}>Save game</button><button type="button" disabled={replayBusy} onClick={() => void exportReplay()}>Export replay</button></div>
          <p className="subtle" data-testid="save-message" role="status">{saveMessage}</p>
          <label className="import-control">Import replay<input type="file" accept=".json,application/json" disabled={replayBusy} onChange={event => {
            const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void importReplay(file);
          }} /></label>
          {replayMessage && <p role="status" data-testid="replay-message">{replayMessage}</p>}
          <div className="button-row game-actions">
            <button type="button" onClick={() => confirmAction("Reset this game with the current seats? This replaces the local save. Export a replay first to keep this game.", reset)}>Reset game</button>
            {!state.result && state.players[state.turn].status === "active" && <>
              <button type="button" disabled={replayBusy} onClick={() => confirmAction(opening ? `Resign ${PLAYER_COLOR_NAME[state.turn]}? This aborts the game because not everyone has completed three moves.` : `Resign ${PLAYER_COLOR_NAME[state.turn]}? Your army becomes dead and your King walks automatically.`, resign)}>Resign {PLAYER_COLOR_NAME[state.turn]}</button>
              <button type="button" disabled={replayBusy} onClick={() => confirmAction(opening ? "Record a simulated timeout? This aborts the opening game." : "Record a simulated timeout? This forfeits the current seat and its King walks automatically.", timeout)}>Simulate timeout</button>
            </>}
          </div>
          {ALL_COLORS.filter(color => !state.players[color].isCPU && canClaimWin(state, color)).map(color => <div key={color} className="claim-control">
            <button type="button" disabled={replayBusy} onClick={() => confirmAction(`Claim Win for ${PLAYER_COLOR_NAME[color]}? The other active player receives 20 points. Play ends immediately and final points decide placements.`, () => claim(color))}>Claim Win for {PLAYER_COLOR_NAME[color]}</button>
            <p>End now: the other active player receives 20 points. Final points determine placements.</p>
          </div>)}
        </section>
        <section className="card history-card"><h2>Move history</h2>
          <ol data-testid="move-history" className="move-list" tabIndex={0} aria-label="Move history, scroll to inspect earlier moves">{state.moveHistory.map((move, index) => <li key={index}>
            <span className="history-owner">{PLAYER_COLOR_NAME[move.piece.owner]}</span> {move.piece.type}{squareLabel(move.from)}{move.captured ? "x" : "-"}{squareLabel(move.to)}{move.promotion ? `=${move.promotion}` : ""}{move.castle ? ` (${move.castle} castle)` : ""}{move.isCheck.length ? "+" : ""}{move.eliminates.length ? " · elimination" : ""}
          </li>)}</ol>
          {!state.moveHistory.length && <p className="subtle">The first move starts the story.</p>}
          <h3>Points</h3><ol data-testid="award-ledger" className="event-list" tabIndex={0} aria-label="Points history">{state.awardLedger.map(award => <li key={award.sequence}>
            {PLAYER_COLOR_NAME[award.recipient]} +{points(award.delta)} {award.rule === "multi-check" ? "multiple kings checked" : award.rule} — {points(award.total)} pts
          </li>)}</ol>
          {!state.awardLedger.length && <p className="subtle">Captures, checks and results earn points.</p>}
          {!!events.length && <><h3>Game events</h3><ol className="event-list" tabIndex={0} aria-label="Game events">{events.map(event => <li key={event.sequence}>{event.text}</li>)}</ol></>}
        </section>
        <section className="card"><RulesHelp /></section>
      </aside>
    </div>
  </main>;
}
