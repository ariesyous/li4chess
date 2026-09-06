import { CPU_POLICIES } from "@li4chess/bot";
import type { CpuDiagnostics, CpuLevel } from "@li4chess/bot";
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
import { canonicalJson, recordReplay, replayCheckpoint, resolveAction, serializeGameState, sha256 } from "@li4chess/protocol";
import type { ActionRequest } from "@li4chess/protocol";
import { requestCpu } from "./cpuClient.js";
import type { CpuFailure } from "./cpuClient.js";

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
  const [cpuStatus, setCpuStatus] = useState("");
  const [cpuDiagnostics, setCpuDiagnostics] = useState<{
    requestId: string; gameId: string; stateId: string; outcome: "search" | "recovery";
    failure?: CpuFailure | "illegal"; search: CpuDiagnostics | null; roundTripMs: number; startupMs: number | null;
  } | null>(null);
  const [cpuNotice, setCpuNotice] = useState("");
  const cancelCpu = useRef<() => void>(() => {});
  const busy = useRef(false);
  const operation = useRef(0);
  const mounted = useRef(true);
  const gameId = useRef(crypto.randomUUID());
  const currentState = useRef(state);
  const journal = useRef<{ initial:GameState;requests:ActionRequest[];sourceReplayHash?:string }>({ initial:state,requests:[] });

  const currentSeat = useMemo(()=>({ isCPU:state.players[state.turn].isCPU,difficulty:state.players[state.turn].cpuDifficulty ?? 3 }),[state]);
  const legal = useMemo(() => legalMoves(state, state.turn), [state]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current++; cancelCpu.current(); };
  }, []);

  const commit = useCallback((request:ActionRequest) => {
    if (!mounted.current || busy.current || currentState.current.result) return;
    const after = resolveAction(currentState.current,request).after;
    cancelCpu.current();
    journal.current.requests.push(request);
    currentState.current=after;
    setState(after);
    setSelectedSquare(null);
  }, []);
  const play = useCallback((move:Move)=>commit({ type:"move",actor:currentState.current.turn,move }),[commit]);

  // Drive CPU turns automatically.
  useEffect(() => {
    if (state.result !== null || replayBusy || busy.current) { setCpuStatus(""); return; }
    let cancelled = false;
    let stopWorker = () => {};
    const cancel = () => { cancelled = true; clearTimeout(timer); stopWorker(); };
    const current = () => !cancelled && mounted.current && !busy.current && currentState.current === state;
    const timer = setTimeout(() => {
      if (!current()) return;
      if (state.players[state.turn].kingStatus === "walking") { commit({ type:"randomKingMove",actor:state.turn }); return; }
      if (!currentSeat.isCPU) return;
      if (claimSecuresSoleWin(state,state.turn)) { commit({ type:"claimWin",actor:state.turn });return; }
      const started = performance.now();
      const requestId = crypto.randomUUID(), requestedGame = gameId.current;
      let stateId = "", startupMs: number | null = null;
      const recover = (failure: CpuFailure | "illegal" = "initialization") => {
        if (!current()) return;
        setCpuDiagnostics({ requestId, gameId: requestedGame, stateId, outcome: "recovery", failure,
          search: null, startupMs, roundTripMs: performance.now() - started });
        setCpuNotice(`CPU recovery (${failure}): used a legal move. Play can continue.`);
        if (legal[0]) play(legal[0]);
      };
      setCpuStatus("CPU thinking");
      void (async () => {
        try {
          const stateJson = serializeGameState(state);
          stateId = await sha256(stateJson);
          if (!current()) return;
          const difficulty = currentSeat.difficulty as CpuLevel;
          stopWorker = requestCpu({ type: "search", version: 1, requestId, gameId: requestedGame,
            stateId, stateJson, seat: state.turn, difficulty, budget: CPU_POLICIES[difficulty] }, (response, failure) => {
            if (!current()) return;
            if (!response) { recover(failure); return; }
            const move = legal.find(move => move.from === response.move.from && move.to === response.move.to && move.promotion === response.move.promotion);
            if (!move) { recover("illegal"); return; }
            setCpuDiagnostics({ requestId, gameId: requestedGame, stateId, outcome: "search", search: response.diagnostics,
              startupMs, roundTripMs: performance.now() - started });
            setCpuStatus("");
            play(move);
          }, undefined, undefined, () => { startupMs = performance.now() - started; });
          if (cancelled) stopWorker();
        } catch { recover(); }
      })();
    }, CPU_MOVE_DELAY_MS);
    cancelCpu.current = cancel;
    if (state.players[state.turn].kingStatus === "walking") {
      setCpuStatus("King walks automatically");
    } else {
      setCpuStatus(currentSeat.isCPU ? "CPU preparing" : "");
    }
    return cancel;
  }, [state, currentSeat, play, commit, replayBusy, legal]);

  const selectSquare = useCallback(
    (square: number) => {
      if (busy.current || replayBusy || currentSeat.isCPU || state.result !== null || state.players[state.turn].kingStatus === "walking") return;

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
    operation.current++; cancelCpu.current(); busy.current = false; setReplayBusy(false);
    gameId.current = crypto.randomUUID();
    setCpuDiagnostics(null); setCpuNotice("");
    const initial=createInitialState(toSeatConfig(seats));
    currentState.current=initial;journal.current={ initial,requests:[] };setState(initial);
    setSelectedSquare(null);
  }, [seats]);

  const resign = useCallback(() => { if (!replayBusy) commit({ type:"resign",actor:currentState.current.turn }); },[commit,replayBusy]);
  const timeout = useCallback(() => { if (!replayBusy) commit({ type:"timeout",actor:currentState.current.turn,clock:{ remainingMs:0 } }); },[commit,replayBusy]);
  const claim = useCallback((actor:PlayerColor) => { if (!replayBusy) commit({ type:"claimWin",actor }); },[commit,replayBusy]);

  const exportReplay = useCallback(async()=>{
    if (busy.current) return;
    const token = ++operation.current;
    busy.current = true; cancelCpu.current();
    setReplayBusy(true);setReplayMessage("");
    try {
      const saved=structuredClone(journal.current);
      const replay=await recordReplay(saved.initial,saved.requests,__ENGINE_BUILD__,saved.sourceReplayHash);
      if (!mounted.current || token !== operation.current) return;
      const url=URL.createObjectURL(new Blob([canonicalJson(replay)],{type:"application/json"}));
      const link=document.createElement("a");link.href=url;link.download="li4chess-replay-v2.json";link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      setReplayMessage("Replay exported.");
    } catch (error) { if (mounted.current && token === operation.current) setReplayMessage(error instanceof Error ? error.message : String(error)); }
    finally { if (mounted.current && token === operation.current) { busy.current = false; setReplayBusy(false); } }
  },[]);
  const importReplay = useCallback(async(file:File)=>{
    const token = ++operation.current;
    busy.current = true; cancelCpu.current();
    setReplayBusy(true);setReplayMessage("");
    try {
      const recovered=await replayCheckpoint(JSON.parse(await file.text()));
      if (!mounted.current || token !== operation.current) return;
      gameId.current = crypto.randomUUID();
      setCpuDiagnostics(null); setCpuNotice("");
      currentState.current=recovered.state;
      journal.current={ initial:recovered.state,requests:[],sourceReplayHash:recovered.sourceReplayHash };
      setState(recovered.state);setSelectedSquare(null);
      setReplayMessage(recovered.state.result ? "Finished replay loaded." : "Replay verified. Play can continue; exports retain a link to the imported replay.");
    } catch (error) { if (mounted.current && token === operation.current) setReplayMessage(error instanceof Error ? error.message : String(error)); }
    finally { if (mounted.current && token === operation.current) { busy.current = false; setReplayBusy(false); } }
  },[]);

  return { state, selectedSquare, legalTargets, selectSquare, reset, resign, timeout,claim,exportReplay,importReplay,replayBusy,replayMessage,cpuStatus,cpuDiagnostics,cpuNotice };
}
