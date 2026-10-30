import { expect, it } from "vitest";
import {
  BOARD_SIZE_KEY, BOARD_SIZE_STEP, MAX_BOARD_SIZE, MIN_BOARD_SIZE, ZEN_MODE_KEY,
  boardSizeFromDrag, readBoardSize, readZenMode, snapBoardSize, writeBoardSize, writeZenMode,
} from "../src/game/displayPrefs.js";

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}
const blocked = () => { throw new DOMException("Blocked", "SecurityError"); };
const blockedStorage = { getItem: blocked, setItem: blocked, removeItem: blocked };

it("snaps board sizes to the step grid within the limits", () => {
  expect(BOARD_SIZE_STEP).toBe(10);
  expect(snapBoardSize(565)).toBe(570);
  expect(snapBoardSize(564)).toBe(560);
  expect(snapBoardSize(10)).toBe(MIN_BOARD_SIZE);
  expect(snapBoardSize(10_000)).toBe(MAX_BOARD_SIZE);
  expect(snapBoardSize(700, 400, 650)).toBe(650);
  expect(snapBoardSize(300, 400, 650)).toBe(400);
  // A window narrower than the minimum cannot hold the minimum: the room that exists wins.
  expect(snapBoardSize(500, 390, 350)).toBe(350);
});

it("round-trips a custom board size and removes it when the window should decide", () => {
  const disk = storage();
  expect(readBoardSize(disk)).toBeNull();
  writeBoardSize(700, disk);
  expect(disk.values.get(BOARD_SIZE_KEY)).toBe("700");
  expect(readBoardSize(disk)).toBe(700);
  writeBoardSize(null, disk);
  expect(disk.values.has(BOARD_SIZE_KEY)).toBe(false);
  expect(readBoardSize(disk)).toBeNull();
});

it("stores board sizes on the step grid and accepts the full valid range", () => {
  const disk = storage();
  writeBoardSize(644, disk);
  expect(disk.values.get(BOARD_SIZE_KEY)).toBe("640");
  writeBoardSize(MIN_BOARD_SIZE, disk);
  expect(readBoardSize(disk)).toBe(MIN_BOARD_SIZE);
  writeBoardSize(MAX_BOARD_SIZE, disk);
  expect(readBoardSize(disk)).toBe(MAX_BOARD_SIZE);
  // An off-grid value written by anything else is read back on the grid.
  expect(readBoardSize(storage({ [BOARD_SIZE_KEY]: "645" }))).toBe(650);
});

it("ignores unusable remembered board sizes instead of guessing", () => {
  for (const raw of ["", " ", "abc", "640px", "NaN", "Infinity", "640.5", "-640", "0", String(MIN_BOARD_SIZE - 1), String(MAX_BOARD_SIZE + 1)]) {
    expect(readBoardSize(storage({ [BOARD_SIZE_KEY]: raw })), `stored ${JSON.stringify(raw)}`).toBeNull();
  }
});

it("keeps working without usable browser storage", () => {
  expect(readBoardSize(null)).toBeNull();
  expect(readBoardSize(blockedStorage)).toBeNull();
  expect(() => writeBoardSize(700, blockedStorage)).not.toThrow();
  expect(() => writeBoardSize(null, blockedStorage)).not.toThrow();
  expect(() => writeBoardSize(700, null)).not.toThrow();
  expect(readZenMode(null)).toBe(false);
  expect(readZenMode(blockedStorage)).toBe(false);
  expect(() => writeZenMode(true, blockedStorage)).not.toThrow();
  expect(() => writeZenMode(true, null)).not.toThrow();
});

it("remembers zen mode only when it was explicitly turned on", () => {
  const disk = storage();
  expect(readZenMode(disk)).toBe(false);
  writeZenMode(true, disk);
  expect(disk.values.get(ZEN_MODE_KEY)).toBe("true");
  expect(readZenMode(disk)).toBe(true);
  writeZenMode(false, disk);
  expect(readZenMode(disk)).toBe(false);
  for (const raw of ["", "1", "yes", "TRUE", "false"]) expect(readZenMode(storage({ [ZEN_MODE_KEY]: raw })), `stored ${JSON.stringify(raw)}`).toBe(false);
});

it("sizes the board from a sideways drag of its top-right grip", () => {
  // The board is centered, so its right edge moves half as far as its width: dragging the grip by dx changes the width by 2·dx.
  expect(boardSizeFromDrag(565, 0)).toBe(565);
  expect(boardSizeFromDrag(565, 100)).toBe(765);
  expect(boardSizeFromDrag(565, -100)).toBe(365);
  expect(boardSizeFromDrag(500, 0.5)).toBe(501);
});
