import { isSquareOnBoard } from "@li4chess/engine";
import type { ActionRequest } from "@li4chess/protocol";

export const PROTOCOL = "li4chess-room-spike-v1";
export class Rejection extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function fields(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Rejection(400, "Invalid object");
  const object = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(object, key)) || Object.keys(object).some(key => ![...required,...optional].includes(key))) {
    throw new Rejection(400, "Invalid fields");
  }
  return object;
}
export interface Command { protocol: typeof PROTOCOL; id: string; expectedSequence: number; action: ActionRequest }
export function readCommand(value: unknown, seat: number | null): Command {
  const raw = fields(value, ["protocol", "id", "expectedSequence", "action"]);
  if (raw.protocol !== PROTOCOL) throw new Rejection(426, "Unsupported protocol");
  if (typeof raw.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(raw.id) || !Number.isSafeInteger(raw.expectedSequence) || Number(raw.expectedSequence) < 0) {
    throw new Rejection(400, "Invalid command identity");
  }
  const type = (raw.action as { type?: unknown } | null)?.type;
  const action = fields(raw.action, ["type", "actor", ...(type === "move" ? ["move"] : [])]);
  if (!Number.isInteger(action.actor) || Number(action.actor) < 0 || Number(action.actor) > 3) throw new Rejection(400, "Invalid actor");
  if (seat === null ? type !== "randomKingMove" : action.actor !== seat || !["move", "resign", "claimWin"].includes(String(type))) {
    throw new Rejection(403, "Seat/action not authorized");
  }
  if (type === "move") {
    const move = fields(action.move, ["from", "to"], ["promotion"]);
    if (![move.from, move.to].every(square => Number.isInteger(square) && isSquareOnBoard(Number(square))) ||
      (move.promotion !== undefined && move.promotion !== "Q")) throw new Rejection(400, "Invalid intention");
  }
  return raw as unknown as Command;
}
