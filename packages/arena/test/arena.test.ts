import { describe, expect, it } from "vitest";
import { aggregate, replay, rotateSeats, runGame, seededRandom, Seats } from "../src/index.js";
import { randomEngine } from "../src/engines.js";

describe("arena", () => {
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
});
