import { describe, expect, it } from "vitest";
import { aggregate, replay, rotateSeats, runGame, seededRandom, Seats } from "../src/index.js";
import { randomEngine } from "../src/engines.js";
import { createInitialState, computeDrawResult,resignPlayer,advanceWalkingKing,computeGameResult } from "@li4chess/engine";

describe("arena", () => {
  it("FFA-END-08: auto-claims preserve replay and reports use shared mean ranks",async()=>{
    const base=createInitialState();
    const initial={ ...base,players:{ ...base.players,0:{ ...base.players[0],score:21 },
      2:{ ...base.players[2],status:"checkmated" as const },3:{ ...base.players[3],status:"checkmated" as const } } };
    const seats=[0,1,2,3].map(c=>({ ...randomEngine,id:`seat-${c}` })) as unknown as Seats;
    const game=await runGame(seats,{ seed:1,maxPlies:1,initial });
    expect(game.termination).toBe("claim-win");
    expect(game.moves).toHaveLength(0);
    expect(replay(game).result?.winner).toBe(0);
    const report=aggregate([game]);
    expect(report.engines.map(e=>e.averagePlacement)).toEqual([1,2,3.5,3.5]);
    const players={ ...initial.players,0:{ ...initial.players[0],status:"resigned" as const,score:50 },1:{ ...initial.players[1],score:0 } };
    const terminal=await runGame(seats,{ seed:1,maxPlies:0,initial:{ ...initial,players,result:computeGameResult(players) } });
    expect(aggregate([terminal]).engines[0].soleWin).toBe(1);
    const behindDead={ ...initial,players:{ ...initial.players,2:{ ...initial.players[2],score:50 } } };
    const continued=await runGame(seats,{ seed:1,maxPlies:1,initial:behindDead });
    expect(continued.claim).toBeUndefined();
    expect(continued.moves).toHaveLength(1);
    expect(continued.termination).toBe("max-ply");
  });
  it("records an abort separately without inventing placements or completed-seat statistics",async()=>{
    const initial=resignPlayer(createInitialState(),0);
    const game=await runGame([randomEngine,randomEngine,randomEngine,randomEngine],{ seed:1,maxPlies:1,initial });
    expect(replay(game)).toEqual(initial);
    expect(game.termination).toBe("abort");
    const report=aggregate([game]);
    expect(report).toMatchObject({ completed:0,aborted:1,censored:0,errors:0 });
    expect(report.engines[0].averagePlacement).toBeNull();
  });
  it("walking actions bypass seat engines and replay the recorded choice",async()=>{
    const base=createInitialState();
    const initial=resignPlayer({ ...base,board:base.board.map(p=>p?.type === "K" || p?.type === "R" ? p : null),completedMoves:{ 0:3,1:3,2:3,3:3 } },0);
    const bad={ id:"must-not-run",choose(){ throw new Error("walking king called a seat engine"); } };
    const game=await runGame([bad,randomEngine,randomEngine,randomEngine],{ seed:1,maxPlies:1,initial });
    expect(game.termination).toBe("max-ply");
    expect(replay(game)).toEqual(advanceWalkingKing(initial));
  });
  it("records four tied first places separately from sole wins", async () => {
    const initial=createInitialState();
    const game=await runGame([randomEngine,randomEngine,randomEngine,randomEngine],{seed:1,maxPlies:0,initial:{...initial,result:computeDrawResult(initial.players)}});
    const report=aggregate([game]);
    expect(report.completed).toBe(1);expect(report.engines[0].firstPlace).toBe(1);
    expect(report.engines[0].soleWin).toBe(0);expect(report.engines[0].firstPlaceCluster95).toBeNull();
  });
  it("reproduces seeded games and replays against the oracle", async () => {
    const seats: Seats = [randomEngine, randomEngine, randomEngine, randomEngine];
    const a = await runGame(seats, { seed: 42, maxPlies: 8 });
    const b = await runGame(seats, { seed: 42, maxPlies: 8 });
    expect(a.moves.map(m => m.move)).toEqual(b.moves.map(m => m.move));
    expect(replay(a)).toEqual(replay(b));
    expect(a.termination).toBe("max-ply");
    expect(aggregate([a]).engines[0].averagePlacement).toBeNull();
  });
  it("balances all seats and keeps seeds reproducible", () => {
    const seats = ["a", "b", "c", "d"].map(id => ({ ...randomEngine, id })) as unknown as Seats;
    expect([0,1,2,3].map(r => rotateSeats(seats,r)[0].id)).toEqual(["a","b","c","d"]);
    expect(seededRandom(0)()).toBe(seededRandom(0)());
    expect(seededRandom(1)()).not.toBe(seededRandom(0)());
  });
  it("captures engine errors without inventing placements", async () => {
    const bad = { id: "crash", choose() { throw new Error("test crash"); } };
    const game = await runGame([bad,randomEngine,randomEngine,randomEngine], { seed: 1, maxPlies: 2 });
    expect(game.termination).toBe("error"); expect(game.error).toContain("test crash");
    expect(game.errorSeat).toBe(0); expect(game.result).toBeNull();
  });
  it("rejects historical snapshots before replay, aggregation or resuming a record", async () => {
    const game = await runGame([randomEngine,randomEngine,randomEngine,randomEngine], {seed:1,maxPlies:0});
    const legacy = JSON.parse(JSON.stringify(game));
    delete legacy.initial.rulesetId;
    delete legacy.initial.enPassantRights;
    legacy.initial.enPassantTarget = null;
    expect(() => replay(legacy)).toThrow(/migration/i);
    expect(() => aggregate([legacy])).toThrow(/migration/i);
    await expect(runGame([randomEngine,randomEngine,randomEngine,randomEngine], {seed:1,maxPlies:0,initial:legacy.initial})).rejects.toThrow(/migration/i);
  });
});
