import { chooseCpuMove } from "@li4chess/bot";
import {
  GameState,
  Move,
  PieceType,
  PlayerColor,
  SeatConfig,
  createInitialState,
  legalMoves,
  claimSecuresSoleWin,
} from "@li4chess/engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canonicalJson, recordReplay, replayCheckpoint, resolveAction } from "@li4chess/protocol";
import type { ActionRequest } from "@li4chess/protocol";

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
  const [replayBusy,setReplayBusy] = useState(false);
  const [replayMessage,setReplayMessage] = useState("");
  const currentState = useRef(state);
  const journal = useRef<{ initial:GameState;requests:ActionRequest[];sourceReplayHash?:string }>({ initial:state,requests:[] });

  const currentSeat = useMemo(()=>({ isCPU:state.players[state.turn].isCPU,difficulty:state.players[state.turn].cpuDifficulty ?? 3 }),[state]);
  const legal = useMemo(() => legalMoves(state, state.turn), [state]);

  const commit = useCallback((request:ActionRequest) => {
    const after = resolveAction(currentState.current,request).after;
    journal.current.requests.push(request);
    currentState.current=after;
    setState(after);
    setSelectedSquare(null);
  }, []);
  const play = useCallback((move:Move)=>commit({ type:"move",actor:currentState.current.turn,move }),[commit]);

  // Drive CPU turns automatically.
  useEffect(() => {
    if (state.result !== null || replayBusy) return;
    if (state.players[state.turn].kingStatus === "walking") {
      const timer = setTimeout(() => { if (currentState.current === state) commit({ type:"randomKingMove",actor:state.turn }); },CPU_MOVE_DELAY_MS);
      return () => clearTimeout(timer);
    }
    if (!currentSeat.isCPU) return;
    const timer = setTimeout(() => {
      if (currentState.current !== state) return;
      if (claimSecuresSoleWin(state,state.turn)) { commit({ type:"claimWin",actor:state.turn });return; }
      const move = chooseCpuMove(state, state.turn, currentSeat.difficulty as 1|2|3|4|5);
      play(move);
    }, CPU_MOVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, currentSeat, play, commit, replayBusy]);

  const selectSquare = useCallback(
    (square: number) => {
      if (replayBusy || currentSeat.isCPU || state.result !== null || state.players[state.turn].kingStatus === "walking") return;

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
    [legal, play, selectedSquare, currentSeat, state, replayBusy]
  );

  const legalTargets = useMemo(() => {
    if (selectedSquare === null) return new Set<number>();
    return new Set(legal.filter((m) => m.from === selectedSquare).map((m) => m.to));
  }, [legal, selectedSquare]);

  const reset = useCallback(() => {
    const initial=createInitialState(toSeatConfig(seats));
    currentState.current=initial;journal.current={ initial,requests:[] };setState(initial);
    setSelectedSquare(null);
  }, [seats]);

  const resign = useCallback(() => { if (!replayBusy) commit({ type:"resign",actor:currentState.current.turn }); },[commit,replayBusy]);
  const timeout = useCallback(() => { if (!replayBusy) commit({ type:"timeout",actor:currentState.current.turn,clock:{ remainingMs:0 } }); },[commit,replayBusy]);
  const claim = useCallback((actor:PlayerColor) => { if (!replayBusy) commit({ type:"claimWin",actor }); },[commit,replayBusy]);

  const exportReplay = useCallback(async()=>{
    setReplayBusy(true);setReplayMessage("");
    try {
      const saved=structuredClone(journal.current);
      const replay=await recordReplay(saved.initial,saved.requests,__ENGINE_BUILD__,saved.sourceReplayHash);
      const url=URL.createObjectURL(new Blob([canonicalJson(replay)],{type:"application/json"}));
      const link=document.createElement("a");link.href=url;link.download="li4chess-replay-v2.json";link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      setReplayMessage("Replay exported.");
    } catch (error) { setReplayMessage(error instanceof Error ? error.message : String(error)); }
    finally { setReplayBusy(false); }
  },[]);
  const importReplay = useCallback(async(file:File)=>{
    setReplayBusy(true);setReplayMessage("");
    try {
      const recovered=await replayCheckpoint(JSON.parse(await file.text()));
      currentState.current=recovered.state;
      journal.current={ initial:recovered.state,requests:[],sourceReplayHash:recovered.sourceReplayHash };
      setState(recovered.state);setSelectedSquare(null);
      setReplayMessage(recovered.state.result ? "Finished replay loaded." : "Replay verified. Play can continue; exports retain a link to the imported replay.");
    } catch (error) { setReplayMessage(error instanceof Error ? error.message : String(error)); }
    finally { setReplayBusy(false); }
  },[]);

  return { state, selectedSquare, legalTargets, selectSquare, reset, resign, timeout,claim,exportReplay,importReplay,replayBusy,replayMessage };
}
