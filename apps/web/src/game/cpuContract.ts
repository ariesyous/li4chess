import { validateCpuBudget } from "@li4chess/bot";
import type { CpuBudget, CpuDiagnostics, CpuLevel } from "@li4chess/bot";
import { PieceType } from "@li4chess/engine";
import type { PlayerColor } from "@li4chess/engine";

export interface CpuIdentity { requestId: string; gameId: string; stateId: string; seat: PlayerColor }
export interface CpuRequest extends CpuIdentity {
  type: "search"; version: 1; stateJson: string; difficulty: CpuLevel; budget: CpuBudget;
}
export interface MoveIntention { from: number; to: number; promotion?: PieceType }
export interface CpuStarted extends CpuIdentity { type: "started"; version: 1 }
export interface CpuResponse extends CpuIdentity {
  type: "result"; version: 1; move: MoveIntention; diagnostics: CpuDiagnostics;
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function identity(v: Record<string, unknown>): boolean {
  return typeof v.requestId === "string" && v.requestId.length > 0 && v.requestId.length < 200 &&
    typeof v.gameId === "string" && v.gameId.length > 0 && v.gameId.length < 200 &&
    typeof v.stateId === "string" && /^sha256:[0-9a-f]{64}$/.test(v.stateId) &&
    Number.isInteger(v.seat) && Number(v.seat) >= 0 && Number(v.seat) <= 3;
}
export function validRequest(v: unknown): v is CpuRequest {
  if (!record(v) || !identity(v) || v.type !== "search" || v.version !== 1 ||
    typeof v.stateJson !== "string" || !Number.isInteger(v.difficulty) || Number(v.difficulty) < 1 || Number(v.difficulty) > 5) return false;
  try { validateCpuBudget(v.budget as CpuBudget); return true; } catch { return false; }
}
export function validResponse(v: unknown): v is CpuResponse {
  if (!record(v) || !identity(v) || v.type !== "result" || v.version !== 1 || !record(v.move) || !record(v.diagnostics)) return false;
  const m = v.move, d = v.diagnostics;
  return [m.from, m.to].every(s => Number.isInteger(s) && Number(s) >= 0 && Number(s) < 196) &&
    (m.promotion === undefined || m.promotion === PieceType.Queen) &&
    Number.isInteger(d.nodes) && Number(d.nodes) >= 0 && Number(d.nodes) <= 32768 &&
    Number.isInteger(d.completedDepth) && Number(d.completedDepth) >= 0 && Number(d.completedDepth) <= 5 &&
    typeof d.elapsedMs === "number" && Number.isFinite(d.elapsedMs) && d.elapsedMs >= 0 &&
    ["depth", "nodes", "time"].includes(String(d.stopped)) && typeof d.fallback === "boolean";
}
export function validStarted(v: unknown): v is CpuStarted {
  return record(v) && identity(v) && v.type === "started" && v.version === 1;
}
export function sameIdentity(a: CpuIdentity, b: CpuIdentity): boolean {
  return a.requestId === b.requestId && a.gameId === b.gameId && a.stateId === b.stateId && a.seat === b.seat;
}
