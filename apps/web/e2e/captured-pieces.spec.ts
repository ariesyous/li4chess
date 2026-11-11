import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createInitialState, PieceType, squareOf } from "@li4chess/engine";
import type { GameState, PlayerColor } from "@li4chess/engine";
import { recordReplay } from "@li4chess/protocol";
import type { ActionRequest } from "@li4chess/protocol";
import { openGameTools } from "./helpers.js";

const producer = { format: "li4chess-engine-build-v1" as const, sourceRevision: "0".repeat(40),
  packageVersions: { "@li4chess/engine": "0.0.0", "@li4chess/protocol": "0.0.0" },
  workingTree: { status: "unreproducible" as const, reason: "Captured-piece browser fixture" } };

function position(pieces: readonly (readonly [number, number, PieceType, PlayerColor])[]): GameState {
  const board: GameState["board"][number][] = Array(196).fill(null);
  for (const [file, rank, type, owner] of pieces) board[squareOf(file, rank)] = { type, owner, hasMoved: true };
  return { ...createInitialState(), board, positionCounts: {}, turnNumber: 13, completedMoves: { 0: 3, 1: 3, 2: 3, 3: 3 },
    castlingRights: { 0: { kingside: false, queenside: false }, 1: { kingside: false, queenside: false },
      2: { kingside: false, queenside: false }, 3: { kingside: false, queenside: false } } };
}

async function importPosition(page: Page, initial: GameState, actions: readonly ActionRequest[] = []) {
  const replay = await recordReplay(initial, actions, producer);
  await page.goto("/li4chess/");
  await page.getByRole("button", { name: "Play against computers", exact: true }).click();
  await openGameTools(page);
  await page.getByLabel("Import replay", { exact: true }).setInputFiles({ name: "captures.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(replay)) });
  await expect(page.getByTestId("replay-message")).toContainText("Replay verified");
  await page.evaluate(() => scrollTo(0, 0));
}

const tray = (page: Page, color: number) => page.getByTestId(`captures-${color}`);
const width = (page: Page) => page.locator(".chess-board").evaluate(board => board.getBoundingClientRect().width);
async function expectCardsClear(page: Page) {
  const overlap = await page.evaluate(() => {
    const squares = [...document.querySelectorAll(".board-square")].map(square => square.getBoundingClientRect());
    return [...document.querySelectorAll(".player-panel")].filter(panel => {
      const card = panel.getBoundingClientRect();
      return squares.some(square => Math.min(card.right, square.right) - Math.max(card.left, square.left) > 1
        && Math.min(card.bottom, square.bottom) - Math.max(card.top, square.top) > 1);
    }).map(panel => panel.getAttribute("aria-label"));
  });
  expect(overlap).toEqual([]);
  await expect(page.locator(".board-frame")).toBeInViewport({ ratio: 1 });
}

test("captures belong to the capturer, keep their colors, group duplicates and survive rotation, Zen and resume", async ({ page }, info) => {
  await page.setViewportSize({ width: 1898, height: 943 });
  const initial = position([
    [6,0,PieceType.King,0], [0,7,PieceType.King,1], [7,13,PieceType.King,2], [13,6,PieceType.King,3],
    [3,3,PieceType.Rook,0], [4,9,PieceType.Rook,1], [10,10,PieceType.Rook,2], [9,4,PieceType.Rook,3],
    [3,4,PieceType.Pawn,1], [4,8,PieceType.Knight,2], [10,9,PieceType.Bishop,3], [8,4,PieceType.Pawn,0], [3,5,PieceType.Pawn,1],
  ]);
  await importPosition(page, initial);
  const before = await width(page);
  const moves = [[3,3,3,4], [4,9,4,8], [10,10,10,9], [9,4,8,4], [3,4,3,5]] as const;
  for (const [index, [fromFile, fromRank, toFile, toRank]] of moves.entries()) {
    await page.locator(`[data-square="${squareOf(fromFile, fromRank)}"]`).click();
    await page.locator(`[data-square="${squareOf(toFile, toRank)}"]`).click();
    await expect(tray(page, index % 4)).toHaveAccessibleName(new RegExp(`: ${index === 4 ? 2 : 1}$`));
    expect(Math.abs(await width(page) - before)).toBeLessThan(1);
    await expectCardsClear(page);
  }
  await expect(tray(page, 0).locator(".capture-piece")).toHaveCount(1);
  await expect(tray(page, 0).locator(".capture-count")).toHaveText("2");
  const blue = await page.getByRole("button", { name: /Blue Rook/ }).locator("svg").evaluate(piece => getComputedStyle(piece).color);
  await expect(tray(page, 0).locator(".capture-piece svg")).toHaveCSS("color", blue);
  for (const [color, name, captured] of [[0, "Red", "2 Blue Pawns"], [1, "Blue", "1 Yellow Knight"], [2, "Yellow", "1 Green Bishop"], [3, "Green", "1 Red Pawn"]] as const) {
    await tray(page, color).click();
    const dialog = page.getByRole("dialog", { name: `Pieces captured by ${name}`, exact: true });
    await expect(dialog.getByRole("listitem")).toHaveText([captured]);
    await page.keyboard.press("Escape");
    await expect(tray(page, color)).toBeFocused();
  }
  await page.getByLabel("Rotate board to current player").check();
  await expect(page.getByTestId("player-1")).toHaveAttribute("data-direction", "bottom");
  await expect(tray(page, 1)).toHaveAccessibleName("Pieces captured by Blue: 1");
  await page.getByRole("button", { name: "Zen mode", exact: true }).click();
  await expect(tray(page, 0).locator(".captures-preview")).toBeVisible();
  await expectCardsClear(page);
  await page.screenshot({ path: info.outputPath("captured-pieces-zen.png") });
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game", exact: true }).click();
  await expect(tray(page, 0)).toHaveAccessibleName("Pieces captured by Red: 2");
  await page.getByRole("button", { name: "Exit zen mode", exact: true }).click();
  await openGameTools(page);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Reset game", exact: true }).click();
  for (const color of [0, 1, 2, 3]) await expect(tray(page, color)).toHaveAccessibleName(/: 0$/);
});

async function crowdedCaptures(page: Page) {
  const targets = [[PieceType.Pawn,1], [PieceType.Pawn,2], [PieceType.Pawn,3], [PieceType.Knight,1], [PieceType.Bishop,2], [PieceType.Rook,3]] as const;
  const initial = position([
    [6,0,PieceType.King,0], [0,6,PieceType.King,1], [7,13,PieceType.King,2], [13,10,PieceType.King,3], [3,3,PieceType.Rook,0],
    ...targets.map(([type, owner], index) => [3, index + 4, type, owner] as const),
  ]);
  const actions: ActionRequest[] = [];
  for (let index = 0; index < 6; index++) {
    actions.push({ type: "move", actor: 0, move: { from: squareOf(3, index + 3), to: squareOf(3, index + 4) } });
    if (index === 5) break;
    const odd = index % 2;
    actions.push(
      { type: "move", actor: 1, move: { from: squareOf(0, 6 + odd), to: squareOf(0, 7 - odd) } },
      { type: "move", actor: 2, move: { from: squareOf(7 + odd, 13), to: squareOf(8 - odd, 13) } },
      { type: "move", actor: 3, move: { from: squareOf(13 - odd, 10), to: squareOf(12 + odd, 10) } },
    );
  }
  await importPosition(page, initial, actions);
}

for (const viewport of [{ width: 1898, height: 943 }, { width: 360, height: 800 }]) {
  test(`a crowded capture list stays inside the cards and opens in full at ${viewport.width}×${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await crowdedCaptures(page);
    await expect(tray(page, 0)).toHaveAccessibleName("Pieces captured by Red: 6");
    await expectCardsClear(page);
    if (viewport.width > 960) {
      await expect(tray(page, 0).locator(".captures-more")).toHaveText("+2 more");
      await page.screenshot({ path: info.outputPath("capture-cards.png") });
      await page.getByRole("slider", { name: "Resize board", exact: true }).focus();
      await page.keyboard.press("Home");
      await expectCardsClear(page);
    }
    await tray(page, 0).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Pieces captured by Red", exact: true });
    await expect(dialog.getByRole("listitem")).toHaveCount(6);
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(tray(page, 0)).toBeFocused();
    await expectCardsClear(page);
    await page.screenshot({ path: info.outputPath("compact-captures.png") });
  });
}
