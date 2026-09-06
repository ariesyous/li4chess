import { useRef, useState } from "react";
import { GameScreen } from "./components/GameScreen.js";
import { SeatSetupScreen } from "./components/SeatSetupScreen.js";
import { SeatSetups } from "./game/useLocalGame.js";
import { resumeLocalGame } from "./game/localSave.js";
import type { ResumedGame } from "./game/localSave.js";
import { ALL_COLORS } from "@li4chess/engine";

export function App() {
  const [seats, setSeats] = useState<SeatSetups | null>(null);
  const [resumed, setResumed] = useState<ResumedGame>();
  const [resumeMessage, setResumeMessage] = useState("");
  const [resumeBusy, setResumeBusy] = useState(false);
  const operation = useRef(0);
  const start = (next: SeatSetups) => { operation.current++; setResumed(undefined); setSeats(next); setResumeBusy(false); };
  const resume = async () => {
    const token = ++operation.current;
    setResumeBusy(true); setResumeMessage("Verifying saved game…");
    try {
      const recovered = await resumeLocalGame(window.localStorage);
      if (token !== operation.current) return;
      const next = Object.fromEntries(ALL_COLORS.map(color => [color, {
        isCPU: recovered.state.players[color].isCPU, difficulty: recovered.state.players[color].cpuDifficulty ?? 3,
      }])) as SeatSetups;
      setResumed(recovered); setSeats(next); setResumeMessage("");
    } catch (error) {
      if (token === operation.current) setResumeMessage(`Cannot resume: ${error instanceof Error ? error.message : String(error)} You can start a new game or import a replay after setup.`);
    } finally { if (token === operation.current) setResumeBusy(false); }
  };

  if (seats === null) {
    return <SeatSetupScreen onStart={start} onResume={() => void resume()} resumeBusy={resumeBusy} resumeMessage={resumeMessage} />;
  }
  return <GameScreen key={JSON.stringify(seats)} seats={seats} resumed={resumed} onRestart={() => { operation.current++; setSeats(null); setResumed(undefined); }} />;
}
