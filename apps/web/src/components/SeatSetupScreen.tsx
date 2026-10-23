import { ALL_COLORS, PlayerColor } from "@li4chess/engine";
import { CPU_POLICIES } from "@li4chess/bot";
import type { CpuLevel } from "@li4chess/bot";
import { Piece, PLAYER_COLOR_HEX, PLAYER_COLOR_NAME } from "@li4chess/ui-kit";
import { PieceType } from "@li4chess/engine";
import { useState } from "react";
import type { CSSProperties } from "react";
import { SeatSetups } from "../game/useLocalGame.js";
import { RulesHelp } from "./RulesHelp.js";
import { Icon } from "./Icon.js";

export const DEFAULT_SEATS: SeatSetups = {
  [PlayerColor.Red]: { isCPU: false, difficulty: 3 }, [PlayerColor.Blue]: { isCPU: true, difficulty: 3 },
  [PlayerColor.Yellow]: { isCPU: true, difficulty: 3 }, [PlayerColor.Green]: { isCPU: true, difficulty: 3 },
};
export function SeatSetupScreen({ seats, onSeatsChange, customizeOpen, hasSavedGame, onStart, onResume, resumeBusy, resumeMessage }: {
  seats: SeatSetups; onSeatsChange: (seats: SeatSetups) => void; customizeOpen: boolean; hasSavedGame: boolean;
  onStart: (seats: SeatSetups) => void; onResume: () => void; resumeBusy: boolean; resumeMessage: string;
}) {
  const [customizing, setCustomizing] = useState(customizeOpen);
  return <main className="setup-shell">
    <header className="setup-header"><h1>li<span>4</span>chess</h1><p className="eyebrow">Four players. One board.</p>
      <p>Take on three computer opponents in free-for-all chess. Free to play, right here in your browser.</p></header>
    <section className="quick-start-card" aria-label="Play against computers">
      <div className="quick-start-copy"><h2>One board. Every player for themselves.</h2>
        <p>You play Red against three level-3 computers. No account or clock needed.</p></div>
      <button className="primary-button" type="button" onClick={() => onStart(DEFAULT_SEATS)}><Icon name="play" />Play against computers</button>
      {hasSavedGame && <p className="setup-note">Starting a new game replaces the game saved in this browser.</p>}
    </section>
    {hasSavedGame && <section className="resume-card" aria-label="Local game recovery">
      <button type="button" onClick={onResume} disabled={resumeBusy}><Icon name="reset" />Resume saved game</button>
      <p>Continue where you left off on this browser.</p>
    </section>}
    {resumeMessage && <p className="notice" role="status">{resumeMessage}</p>}
    <ul className="setup-primer" aria-label="The essentials">
      <li><strong>Highest points wins.</strong> Capture pieces and checkmate opponents to score.</li>
      <li><strong>Protect your King.</strong> Checkmate eliminates your army.</li>
      <li><strong>Dead pieces stay on the board.</strong> They block squares and are worth no points.</li>
    </ul>
    <details className="customize-game" open={customizing} onToggle={event => setCustomizing(event.currentTarget.open)}>
      <summary>Customize game</summary>
      <div className="customize-game-body"><p>Play with friends on the same device, change the computer levels, or watch four computers play.</p>
    <h2>Choose your seats</h2><div className="seat-grid">{ALL_COLORS.map(color => <section key={color} className="seat-row"
      style={{ "--seat-color": PLAYER_COLOR_HEX[color] } as CSSProperties} aria-label={`${PLAYER_COLOR_NAME[color]} seat`}>
      <h2><Piece type={PieceType.Knight} color={PLAYER_COLOR_HEX[color]} />{PLAYER_COLOR_NAME[color]}</h2>
      <label><input type="checkbox" aria-label={`${PLAYER_COLOR_NAME[color]} CPU`} checked={seats[color].isCPU}
        onChange={event => onSeatsChange({ ...seats, [color]: { ...seats[color], isCPU: event.target.checked } })} />CPU {seats[color].isCPU ? "opponent" : "off · Human"}</label>
      {seats[color].isCPU && <label>Level<select aria-label={`${PLAYER_COLOR_NAME[color]} difficulty`} value={seats[color].difficulty}
        onChange={event => onSeatsChange({ ...seats, [color]: { ...seats[color], difficulty: Number(event.target.value) as CpuLevel } })}>
        {([1, 2, 3, 4, 5] as CpuLevel[]).map(level => <option key={level} value={level}>{level} · {CPU_POLICIES[level].label}</option>)}
      </select></label>}
    </section>)}</div>
    <button className="primary-button" type="button" onClick={() => onStart(seats)}><Icon name="play" />Start game</button>
    <p className="setup-note">Levels 1–5 give the CPU more thinking time, from 50 ms to 1 second. These are search budgets, not ratings. All games are anonymous and local, with no running clocks.</p>
    </div></details>
    <section className="card"><RulesHelp /></section>
  </main>;
}
