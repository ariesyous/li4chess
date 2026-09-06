import { ALL_COLORS, PlayerColor } from "@li4chess/engine";
import { PLAYER_COLOR_HEX, PLAYER_COLOR_NAME } from "@li4chess/ui-kit";
import { useState } from "react";
import { SeatSetups } from "../game/useLocalGame.js";

const DEFAULT_SEATS: SeatSetups = {
  [PlayerColor.Red]: { isCPU: false, difficulty: 3 },
  [PlayerColor.Blue]: { isCPU: true, difficulty: 3 },
  [PlayerColor.Yellow]: { isCPU: true, difficulty: 3 },
  [PlayerColor.Green]: { isCPU: true, difficulty: 3 },
};

export function SeatSetupScreen({ onStart, onResume, resumeBusy, resumeMessage }: {
  onStart: (seats: SeatSetups) => void; onResume: () => void; resumeBusy: boolean; resumeMessage: string;
}) {
  const [seats, setSeats] = useState<SeatSetups>(DEFAULT_SEATS);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>li4chess</h1>
      <p>4-player free-for-all chess. Set up each seat, then start a local hotseat game.</p>
      <button type="button" onClick={onResume} disabled={resumeBusy}>Resume saved game</button>
      <p>Games save automatically on this browser. Starting a new game replaces the local save.</p>
      {resumeMessage && <p role="status">{resumeMessage}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {ALL_COLORS.map((color) => (
          <div
            key={color}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 12,
              border: `2px solid ${PLAYER_COLOR_HEX[color]}`,
              borderRadius: 8,
            }}
          >
            <strong style={{ color: PLAYER_COLOR_HEX[color], minWidth: 64 }}>{PLAYER_COLOR_NAME[color]}</strong>
            <label>
              <input
                type="checkbox"
                checked={seats[color].isCPU}
                onChange={(e) =>
                  setSeats((prev) => ({ ...prev, [color]: { ...prev[color], isCPU: e.target.checked } }))
                }
              />{" "}
              CPU
            </label>
            {seats[color].isCPU && (
              <label>
                Difficulty:{" "}
                <select
                  value={seats[color].difficulty}
                  onChange={(e) =>
                    setSeats((prev) => ({
                      ...prev,
                      [color]: { ...prev[color], difficulty: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 },
                    }))
                  }
                >
                  {[1, 2, 3, 4, 5].map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onStart(seats)}
        style={{ marginTop: 24, padding: "10px 20px", fontSize: 16, cursor: "pointer" }}
      >
        Start game
      </button>
    </div>
  );
}
