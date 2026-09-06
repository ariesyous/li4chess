import { describe, expect, it } from "vitest";
import { PROTOCOL, readCommand } from "../src/command.js";

const move = { protocol: PROTOCOL, id: "command1", expectedSequence: 0, action: { type: "move", actor: 0, move: { from: 17, to: 31 } } };
describe("prototype untrusted command boundary", () => {
  it("accepts a minimal own-seat intention, not derived metadata", () => {
    expect(readCommand(move, 0)).toEqual(move);
    expect(() => readCommand({ ...move, action: { ...move.action, move: { ...move.action.move, capture: true } } },0)).toThrow("Invalid fields");
  });
  it("rejects identity, version, seat and privileged-action confusion", () => {
    for (const input of [null, [], { ...move, protocol: "legacy-v1" }, { ...move, id: "" }, { ...move, expectedSequence: -1 }, { ...move, extra: 1 }]) {
      expect(() => readCommand(input, 0)).toThrow();
    }
    expect(() => readCommand(move,1)).toThrow("authorized");
    expect(() => readCommand(move,null)).toThrow("authorized");
    for (const type of ["timeout", "disconnectForfeit", "randomKingMove"]) {
      expect(() => readCommand({ ...move, action: { type, actor: 0 } },0)).toThrow("authorized");
    }
    expect(readCommand({ ...move, action: { type: "randomKingMove", actor: 0 } },null).action.type).toBe("randomKingMove");
  });
  it("rejects invalid board squares and underpromotion", () => {
    for (const intention of [{ from: 0, to: 31 }, { from: 17, to: 999 }, { from: 17.5, to: 31 }, { from: 17, to: 31, promotion: "N" }]) {
      expect(() => readCommand({ ...move, action: { ...move.action, move: intention } },0)).toThrow("intention");
    }
  });
});
