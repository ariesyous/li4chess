/**
 * Per-browser display choices for the local game screen. Reads and writes tolerate blocked or full storage:
 * a choice still applies for the current visit, it just is not remembered.
 */
export const BOARD_SIZE_KEY = "li4chess.board-size";
export const ZEN_MODE_KEY = "li4chess.zen-mode";

/** Smallest custom board in CSS pixels; matches the floor of the automatic fit, where panels and pieces stay legible. */
export const MIN_BOARD_SIZE = 390;
/** Sanity bound for stored values only. The layout always clamps to the room the window actually offers. */
export const MAX_BOARD_SIZE = 8000;
/** Granularity of the slider and of drag resizing. */
export const BOARD_SIZE_STEP = 10;

type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): PreferenceStorage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; }
  catch { return null; }
}

/** Rounds to the step grid and keeps the result within the limits; an impossible range yields its upper limit. */
export function snapBoardSize(size: number, min = MIN_BOARD_SIZE, max = MAX_BOARD_SIZE): number {
  return Math.min(Math.max(Math.round(size / BOARD_SIZE_STEP) * BOARD_SIZE_STEP, min), max);
}

/** The saved custom board width, or null when the window should decide. Unusable values are ignored, not repaired. */
export function readBoardSize(storage: PreferenceStorage | null = browserStorage()): number | null {
  try {
    const raw = storage?.getItem(BOARD_SIZE_KEY);
    if (raw === null || raw === undefined) return null;
    const size = Number(raw);
    return Number.isInteger(size) && size >= MIN_BOARD_SIZE && size <= MAX_BOARD_SIZE ? snapBoardSize(size) : null;
  } catch { return null; }
}

export function writeBoardSize(size: number | null, storage: PreferenceStorage | null = browserStorage()): void {
  try {
    if (size === null) storage?.removeItem(BOARD_SIZE_KEY);
    else storage?.setItem(BOARD_SIZE_KEY, String(snapBoardSize(size)));
  } catch { /* The size still applies to this visit without browser storage. */ }
}

export function readZenMode(storage: PreferenceStorage | null = browserStorage()): boolean {
  try { return storage?.getItem(ZEN_MODE_KEY) === "true"; }
  catch { return false; }
}

export function writeZenMode(zen: boolean, storage: PreferenceStorage | null = browserStorage()): void {
  try { storage?.setItem(ZEN_MODE_KEY, String(zen)); }
  catch { /* Zen mode still applies to this visit without browser storage. */ }
}

/**
 * Board width after dragging the grip in the board's top-right corner sideways by `dx` from a board of `startSize`.
 * The board is centered, so its right edge moves half as far as its width changes; doubling the pointer's
 * movement keeps the grip under the pointer. Vertical movement does not matter.
 */
export function boardSizeFromDrag(startSize: number, dx: number): number {
  return startSize + 2 * dx;
}
