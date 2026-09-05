import { useState } from "react";
import { GameScreen } from "./components/GameScreen.js";
import { SeatSetupScreen } from "./components/SeatSetupScreen.js";
import { SeatSetups } from "./game/useLocalGame.js";

export function App() {
  const [seats, setSeats] = useState<SeatSetups | null>(null);

  if (seats === null) {
    return <SeatSetupScreen onStart={setSeats} />;
  }
  return <GameScreen key={JSON.stringify(seats)} seats={seats} onRestart={() => setSeats(null)} />;
}
