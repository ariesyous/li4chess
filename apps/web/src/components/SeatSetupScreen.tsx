import { ALL_COLORS, PlayerColor } from "@li4chess/engine";
import { CPU_POLICIES } from "@li4chess/bot";
import type { CpuLevel } from "@li4chess/bot";
import { PLAYER_COLOR_HEX, PLAYER_COLOR_NAME } from "@li4chess/ui-kit";
import { useState } from "react";
import type { CSSProperties } from "react";
import { SeatSetups } from "../game/useLocalGame.js";
import { RulesHelp } from "./RulesHelp.js";

const DEFAULT_SEATS: SeatSetups = {
  [PlayerColor.Red]: { isCPU: false, difficulty: 3 }, [PlayerColor.Blue]: { isCPU: true, difficulty: 3 },
  [PlayerColor.Yellow]: { isCPU: true, difficulty: 3 }, [PlayerColor.Green]: { isCPU: true, difficulty: 3 },
};
export function SeatSetupScreen({ onStart, onResume, resumeBusy, resumeMessage }: {
  onStart: (seats: SeatSetups) => void; onResume: () => void; resumeBusy: boolean; resumeMessage: string;
}) {
  const [seats, setSeats] = useState<SeatSetups>(DEFAULT_SEATS);
  return <main className="setup-shell">
    <header className="setup-header"><p className="eyebrow">Four players. One board.</p><h1>li4chess</h1>
      <p>A local game of free-for-all chess. Share the board with friends, take on the CPUs, or watch all four play.</p></header>
    <section className="resume-card" aria-label="Saved local game">
      <button type="button" onClick={onResume} disabled={resumeBusy}>Resume saved game</button>
      <p>Autosaved on this browser. Start a new game below to replace it, or resume after a refresh.</p>
    </section>
    {resumeMessage && <p className="notice" role="status">{resumeMessage}</p>}
    <h2>Choose your seats</h2><div className="seat-grid">{ALL_COLORS.map(color => <section key={color} className="seat-row"
      style={{ "--seat-color": PLAYER_COLOR_HEX[color] } as CSSProperties} aria-label={`${PLAYER_COLOR_NAME[color]} seat`}>
      <h2>{PLAYER_COLOR_NAME[color]}</h2>
      <label><input type="checkbox" aria-label={`${PLAYER_COLOR_NAME[color]} CPU`} checked={seats[color].isCPU}
        onChange={event => setSeats(previous => ({ ...previous, [color]: { ...previous[color], isCPU: event.target.checked } }))} />CPU {seats[color].isCPU ? "opponent" : "off · Human"}</label>
      {seats[color].isCPU && <label>Level<select aria-label={`${PLAYER_COLOR_NAME[color]} difficulty`} value={seats[color].difficulty}
        onChange={event => setSeats(previous => ({ ...previous, [color]: { ...previous[color], difficulty: Number(event.target.value) as CpuLevel } }))}>
        {([1, 2, 3, 4, 5] as CpuLevel[]).map(level => <option key={level} value={level}>{level} · {CPU_POLICIES[level].label}</option>)}
      </select></label>}
    </section>)}</div>
    <button className="primary-button" type="button" onClick={() => onStart(seats)}>Start game</button>
    <p className="setup-note">Levels 1–5 give the CPU more thinking time, from 50 ms to 1 second. These are search budgets, not ratings. All games are anonymous and local, with no running clocks.</p>
    <section className="card"><RulesHelp /></section>
  </main>;
}
