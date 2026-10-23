import { useEffect, useRef, useState } from "react";
import { GameScreen } from "./components/GameScreen.js";
import { DEFAULT_SEATS, SeatSetupScreen } from "./components/SeatSetupScreen.js";
import { SeatSetups } from "./game/useLocalGame.js";
import { hasLocalSave, resumeLocalGame } from "./game/localSave.js";
import type { ResumedGame } from "./game/localSave.js";
import { ALL_COLORS } from "@li4chess/engine";
import { OnlineGame } from "./online/OnlineGame.js";

function savedGamePresent(): boolean {
  try { return hasLocalSave(window.localStorage); }
  catch { return false; }
}

export function App() {
  const [online,setOnline] = useState(false);
  const [seats, setSeats] = useState<SeatSetups | null>(null);
  const [setupSeats, setSetupSeats] = useState<SeatSetups>(DEFAULT_SEATS);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [saveAvailable, setSaveAvailable] = useState(savedGamePresent);
  const [resumed, setResumed] = useState<ResumedGame>();
  const [resumeMessage, setResumeMessage] = useState("");
  const [resumeBusy, setResumeBusy] = useState(false);
  const operation = useRef(0);
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); }, [seats]);
  useEffect(() => {
    // This descriptive section lives outside React so it is readable before JavaScript loads.
    const information = document.getElementById("site-information");
    if (information) information.hidden = seats !== null || online;
    return () => { if (information) information.hidden = false; };
  }, [seats, online]);
  useEffect(() => {
    if (seats !== null) return;
    const refresh = () => setSaveAvailable(savedGamePresent());
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [seats, online]);
  const start = (next: SeatSetups) => {
    operation.current++; setResumed(undefined); setSetupSeats(next); setSeats(next);
    setResumeBusy(false); setResumeMessage("");
  };
  const resume = async () => {
    const token = ++operation.current;
    setResumeBusy(true); setResumeMessage("Verifying saved game…");
    try {
      const recovered = await resumeLocalGame(window.localStorage);
      if (token !== operation.current) return;
      const next = Object.fromEntries(ALL_COLORS.map(color => [color, {
        isCPU: recovered.state.players[color].isCPU, difficulty: recovered.state.players[color].cpuDifficulty ?? 3,
      }])) as SeatSetups;
      setResumed(recovered); setSetupSeats(next); setSeats(next); setResumeMessage("");
    } catch (error) {
      if (token === operation.current) setResumeMessage(`Cannot resume: ${error instanceof Error ? error.message : String(error)} You can start a new game or import a replay after setup.`);
    } finally { if (token === operation.current) setResumeBusy(false); }
  };

  if (online) return <OnlineGame onLeave={()=>setOnline(false)}/>;
  if (seats === null) {
    return <>{__MULTIPLAYER__ && <nav className="online-entry"><button onClick={()=>{ operation.current++; setResumeBusy(false); setResumeMessage(""); setOnline(true); }}>Private multiplayer</button></nav>}<SeatSetupScreen seats={setupSeats} onSeatsChange={setSetupSeats} customizeOpen={customizeOpen} hasSavedGame={saveAvailable} onStart={start} onResume={() => void resume()} resumeBusy={resumeBusy} resumeMessage={resumeMessage} /></>;
  }
  return <GameScreen key={JSON.stringify(seats)} seats={seats} resumed={resumed} onRestart={(next?: SeatSetups) => {
    operation.current++; if (next) setSetupSeats(next); setCustomizeOpen(true);
    setSeats(null); setResumed(undefined); setResumeMessage(""); setResumeBusy(false);
  }} />;
}
