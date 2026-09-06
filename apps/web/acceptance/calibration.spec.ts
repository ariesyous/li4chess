import { expect, test } from "@playwright/test";
import { createInitialState, legalMoves } from "@li4chess/engine";
import type { GameState, PieceType, PlayerColor } from "@li4chess/engine";
import { recordReplay, resolveAction, serializeGameState } from "@li4chess/protocol";
import { beginEvidence, producer, saveEvidence } from "./run.js";
import { observeProduction } from "./observer.js";
import type { Observation, InputSample } from "./observer.js";

function sparse(pieces: readonly (readonly [number, number, string])[], inactive: number[] = []): GameState {
  const base = createInitialState(), board: GameState["board"][number][] = Array(196).fill(null);
  for (const [square, owner, type] of pieces) board[square] = { owner: owner as PlayerColor, type: type as PieceType, hasMoved: true };
  return { ...base, board, positionCounts: {}, players: Object.fromEntries([0,1,2,3].map(color => [color, {
    ...base.players[color as PlayerColor], ...(inactive.includes(color) ? { status: "checkmated", eliminatedOnTurn: 1 } : {}),
  }])) as GameState["players"], castlingRights: { 0:{ kingside:false, queenside:false }, 1:{ kingside:false, queenside:false }, 2:{ kingside:false, queenside:false }, 3:{ kingside:false, queenside:false } } };
}
function fixtures() {
  let mid = createInitialState(), seed = 20260906;
  const continuation = [];
  for (let ply = 0; ply < 32; ply++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const moves = legalMoves(mid), move = moves[seed % moves.length];
    const action = { type: "move" as const, actor: mid.turn, move };
    continuation.push(action); mid = resolveAction(mid, action).after;
    if (mid.result) throw new Error("Middlegame fixture unexpectedly terminal");
  }
  return { positions: {
    opening: createInitialState(), middlegame: mid,
    tactical: sparse([[3,0,"K"], [94,1,"K"], [120,2,"K"], [153,3,"K"], [6,0,"Q"]]),
    endgame: sparse([[6,0,"K"], [84,1,"K"], [20,0,"P"]], [2,3]),
  }, continuation };
}
const percentile = (values: number[], fraction: number) => [...values].sort((a,b) => a-b)[Math.ceil(values.length * fraction)-1];

test("production Worker budgets and real input frames across positions and viewports", async ({ page, browser }) => {
  beginEvidence("calibration"); await observeProduction(page);
  const fixture = fixtures();
  saveEvidence("positions.json", { generatorSeed: 20260906, continuation: fixture.continuation,
    positions: Object.fromEntries(Object.entries(fixture.positions).map(([name,state]) => [name, JSON.parse(serializeGameState(state))])) });
  const groups: { width:number; position:string; level:number; jobs:Observation[]; inputs:InputSample[] }[] = [];
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  for (const width of [1280,768,360]) {
    await page.setViewportSize({ width, height:900 }); await page.goto("./");
    for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
    await page.getByRole("button", { name:"Start game" }).click();
    const savedProducer = await page.evaluate(() => JSON.parse(localStorage.getItem("li4chess.local-game.v1")!).producer);
    expect(savedProducer).toEqual(producer);
    for (const [position, base] of Object.entries(fixture.positions)) for (const level of width === 1280 ? [1,2,3,4,5] : [5]) {
      const state: GameState = { ...base, players: Object.fromEntries([0,1,2,3].map(color => [color, {
        ...base.players[color as PlayerColor], isCPU:color === base.turn, cpuDifficulty:level,
      }])) as GameState["players"] };
      const replay = await recordReplay(state, [], producer), group = { width, position, level, jobs: [] as Observation[], inputs: [] as InputSample[] };
      groups.push(group);
      // Additional level-5 trials only fill the predeclared 30-input sample minimum.
      for (let trial = 0; trial < 5 || (level === 5 && group.inputs.length < 30); trial++) {
        expect(trial, "30 active-search inputs must be measurable within 30 trials").toBeLessThan(30);
        const before = await page.evaluate(() => window.m2.jobs.length);
        await page.getByLabel("Import replay", { exact:true }).setInputFiles({ name:"position.json", mimeType:"application/json", buffer:Buffer.from(JSON.stringify(replay)) });
        await page.waitForFunction(count => window.m2.jobs.length > count && !!window.m2.jobs[count].started, before);
        if (level === 5) for (let input = 0; input < 6; input++) {
          if (await page.evaluate(() => !!window.m2.jobs.at(-1)?.ended)) break;
          await page.getByLabel("Rotate board to current player").click();
        }
        await page.waitForFunction(count => !!window.m2.jobs[count]?.ended, before, { timeout:5000 });
        await page.waitForFunction(count => !!window.m2.jobs[count]?.terminated, before);
        const observation = await page.evaluate(count => window.m2.jobs[count], before);
        const requestId = observation.request!.requestId;
        const inputs = await page.evaluate(id => window.m2.inputs.filter(input => input.requestId === id), requestId);
        group.jobs.push(observation); group.inputs.push(...inputs);
        // Retain evidence even when an acceptance assertion below fails.
        saveEvidence("raw.json", { browser:browser.version(), groups, errors });
        expect(observation.error).toBeUndefined(); expect(observation.response).toBeDefined();
        const response = observation.response!;
        expect(response.requestId).toBe(requestId); expect(response.stateId).toBe(observation.request!.stateId);
        expect(legalMoves(state).some(move => move.from === response.move.from && move.to === response.move.to && move.promotion === response.move.promotion)).toBe(true);
        expect(observation.url).toMatch(/\/assets\/cpu\.worker-[\w-]+\.js$/);
      }
      console.log(`${width}px ${position} L${level}: ${group.jobs.length} searches, ${group.inputs.length} active-search inputs`);
    }
  }
  const summary = groups.map(group => {
    const search = group.jobs.map(job => job.response!.diagnostics.elapsedMs);
    const startup = group.jobs.map(job => job.started! - job.created);
    const roundTrip = group.jobs.map(job => job.ended! - job.created);
    const overhead = roundTrip.map((time,index) => time - search[index]);
    const inputs = group.inputs.map(input => input.milliseconds);
    return { width:group.width, position:group.position, level:group.level, samples:search.length,
      budget:group.jobs[0].request!.budget, searchP95:percentile(search,.95), searchMax:Math.max(...search),
      startupP95:percentile(startup,.95), overheadP95:percentile(overhead,.95), roundTripP95:percentile(roundTrip,.95),
      fallbackCount:group.jobs.filter(job => job.response!.diagnostics.fallback).length,
      completedDepths:group.jobs.map(job => job.response!.diagnostics.completedDepth),
      inputSamples:inputs.length, inputP95:inputs.length ? percentile(inputs,.95) : null, inputMax:inputs.length ? Math.max(...inputs) : null };
  });
  saveEvidence("summary.json", { browser:browser.version(), summary, errors,
    methodology:"Production app/Worker, fresh Worker per request; native input timestamp to next rAF during confirmed search. 400ms turn pacing excluded. Browser emulation, no CPU throttling; no physical input/display latency or strength claim." });
  expect(errors).toEqual([]);
  for (const group of summary) {
    expect(group.searchP95).toBeLessThanOrEqual(group.budget.timeMs! + 100);
    expect(group.searchMax).toBeLessThanOrEqual(group.budget.timeMs! + 250);
    if (group.level === 5) { expect(group.inputSamples).toBeGreaterThanOrEqual(30); expect(group.inputP95!).toBeLessThan(100); expect(group.inputMax!).toBeLessThan(250); }
  }
});
