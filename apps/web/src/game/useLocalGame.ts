import { chooseCpuMove } from "@li4chess/bot";
import {
  GameState,
  Move,
  PieceType,
  PlayerColor,
  SeatConfig,
  applyMove,
  createInitialState,
  legalMoves,
} from "@li4chess/engine";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface SeatSetup {
  readonly isCPU: boolean;
  readonly difficulty: 1 | 2 | 3 | 4 | 5;
}

export type SeatSetups = Readonly<Record<PlayerColor, SeatSetup>>;

function toSeatConfig(seats: SeatSetups): SeatConfig {
  const isCPU: Record<PlayerColor, boolean> = {
    [PlayerColor.Red]: seats[PlayerColor.Red].isCPU,
    [PlayerColor.Blue]: seats[PlayerColor.Blue].isCPU,
    [PlayerColor.Yellow]: seats[PlayerColor.Yellow].isCPU,
    [PlayerColor.Green]: seats[PlayerColor.Green].isCPU,
  };
  const cpuDifficulty: Partial<Record<PlayerColor, number>> = {};
  for (const color of [PlayerColor.Red, PlayerColor.Blue, PlayerColor.Yellow, PlayerColor.Green]) {
    if (seats[color].isCPU) cpuDifficulty[color] = seats[color].difficulty;
  }
  return { isCPU, cpuDifficulty };
}

const CPU_MOVE_DELAY_MS = 400;

export function useLocalGame(seats: SeatSetups) {
  const [state, setState] = useState<GameState>(() => createInitialState(toSeatConfig(seats)));
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);

  const currentSeat = seats[state.turn];
  const legal = useMemo(() => legalMoves(state, state.turn), [state]);

  const play = useCallback((move: Move) => {
    setState((prev) => applyMove(prev, move));
    setSelectedSquare(null);
  }, []);

  // Drive CPU turns automatically.
  useEffect(() => {
    if (state.result !== null) return;
    if (!currentSeat.isCPU) return;
    const timer = setTimeout(() => {
      const move = chooseCpuMove(state, state.turn, currentSeat.difficulty);
      play(move);
    }, CPU_MOVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, currentSeat, play]);

  const selectSquare = useCallback(
    (square: number) => {
      if (currentSeat.isCPU || state.result !== null) return;

      if (selectedSquare === null) {
        const hasMoveFrom = legal.some((m) => m.from === square);
        if (hasMoveFrom) setSelectedSquare(square);
        return;
      }

      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }

      const candidates = legal.filter((m) => m.from === selectedSquare && m.to === square);
      // Promotions always auto-resolve to Queen, for every seat (human included).
      const move = candidates.find((m) => m.promotion === PieceType.Queen) ?? candidates[0];
      if (move) {
        play(move);
        return;
      }

      const hasMoveFrom = legal.some((m) => m.from === square);
      setSelectedSquare(hasMoveFrom ? square : null);
    },
    [legal, play, selectedSquare, currentSeat, state.result]
  );

  const legalTargets = useMemo(() => {
    if (selectedSquare === null) return new Set<number>();
    return new Set(legal.filter((m) => m.from === selectedSquare).map((m) => m.to));
  }, [legal, selectedSquare]);

  const reset = useCallback(() => {
    setState(createInitialState(toSeatConfig(seats)));
    setSelectedSquare(null);
  }, [seats]);

  return { state, selectedSquare, legalTargets, selectSquare, reset };
}
