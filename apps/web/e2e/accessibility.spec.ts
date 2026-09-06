import { expect, test } from "@playwright/test";
import { localSquare, createInitialState, legalMoves } from "@li4chess/engine";
import { recordReplay, resolveAction } from "@li4chess/protocol";
import type { ActionRequest, EngineBuildIdentityV1 } from "@li4chess/protocol";
import type { GameState, PieceType, PlayerColor } from "@li4chess/engine";

test("a check against a non-current player is announced alongside its score", async ({ page }) => {
  const base = createInitialState(), board: GameState["board"][number][] = Array(196).fill(null);
  for (const [square, owner, type] of [[3,0,"K"], [94,1,"K"], [120,2,"K"], [153,3,"K"], [6,0,"Q"]] as const) {
    board[square] = { owner: owner as PlayerColor, type: type as PieceType, hasMoved: true };
  }
  const initial: GameState = { ...base, board, positionCounts: {}, castlingRights: {
    0: { kingside:false, queenside:false }, 1: { kingside:false, queenside:false }, 2: { kingside:false, queenside:false }, 3: { kingside:false, queenside:false },
  } };
  const producer: EngineBuildIdentityV1 = { format: "li4chess-engine-build-v1", sourceRevision: "0".repeat(40),
    packageVersions: { "@li4chess/engine": "0.0.0", "@li4chess/protocol": "0.0.0" }, workingTree: { status: "unreproducible", reason: "Check announcement fixture" } };
  const replay = await recordReplay(initial, [], producer);
  await page.goto("/"); await page.getByRole("button", { name: "Start game" }).click();
  await page.getByLabel("Import replay", { exact: true }).setInputFiles({ name: "checks.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(replay)) });
  await expect(page.getByTestId("replay-message")).toContainText("Replay verified");
  await page.locator('[data-square="6"]').click(); await page.locator('[data-square="90"]').click();
  await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
  await expect(page.getByTestId("action-announcement")).toContainText("Yellow is in check.");
  await expect(page.getByTestId("action-announcement")).toContainText("Red gained 1 points");
  await expect(page.getByTestId("player-2")).toContainText("Check");
});

test("keyboard-only setup, board selection, clearing, move and game controls", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Resume saved game" })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(page.getByLabel("Red CPU", { exact: true })).toBeFocused();
  for (const name of ["Blue", "Yellow", "Green"]) {
    await page.keyboard.press("Tab"); await expect(page.getByLabel(`${name} CPU`, { exact: true })).toBeFocused(); await page.keyboard.press("Space");
  }
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Start game" })).toBeFocused(); await page.keyboard.press("Enter");
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  await expect(page.locator('[data-square="20"]')).toBeFocused();
  await page.keyboard.press("Enter"); await expect(page.locator('[data-square="20"]')).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape"); await expect(page.locator('[data-square="20"]')).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Space"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp");
  await expect(page.locator('[data-square="48"]')).toBeFocused();
  await expect(page.locator('[data-square="48"]')).toHaveAccessibleName("g4 empty, legal destination");
  await expect(page.locator('[data-square="48"]')).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter"); await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
  await page.keyboard.press("Tab"); await expect(page.getByLabel("Rotate board to current player")).toBeFocused();
  await page.keyboard.press("Space"); await expect(page.locator(".chess-board")).toHaveAttribute("data-bottom-color", "1");
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Save game", exact: true })).toBeFocused();
  await page.keyboard.press("Enter"); await expect(page.getByTestId("save-message")).toContainText("Saved on this browser");
});

test("arrow navigation follows every rotation and player panels follow the same directions", async ({ page }) => {
  await page.goto("/");
  for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByLabel("Rotate board to current player").check();
  for (const color of [0, 1, 2, 3] as const) {
    await expect(page.locator(".chess-board")).toHaveAttribute("data-bottom-color", String(color));
    for (const seat of [0, 1, 2, 3]) await expect(page.getByTestId(`player-${seat}`)).toHaveAttribute("data-direction", ["bottom", "left", "top", "right"][(seat - color + 4) % 4]);
    const from = localSquare(color, 3, 1), to = localSquare(color, 3, 2);
    await page.locator(`[data-square="${from}"]`).focus(); await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowUp"); await expect(page.locator(`[data-square="${to}"]`)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("move-history").locator("li")).toHaveCount(color + 1);
  }
});

for (const width of [360, 768, 1280]) test.describe(`${width}px layout`, () => {
  test.use({ viewport: { width, height: 900 }, hasTouch: width < 1000 });
  test("full board, readable panels, touch controls and deliberate terminal result", async ({ page }, testInfo) => {
    await page.goto("/");
    for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
    await page.getByRole("button", { name: "Start game" }).click();
    for (const color of [0, 1, 2, 3]) {
      await expect(page.getByTestId(`player-${color}`)).toBeVisible();
      await expect(page.getByTestId(`player-${color}`)).toContainText("Human");
      await expect(page.getByTestId(`player-${color}`)).toContainText("0 pts");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const board = await page.locator(".chess-board").boundingBox();
    expect(board!.x).toBeGreaterThanOrEqual(0); expect(board!.x + board!.width).toBeLessThanOrEqual(width);
    expect(Math.abs(board!.width - board!.height)).toBeLessThan(1);
    const controls = await page.locator("button:not(.board-square)").evaluateAll(buttons => buttons.filter(b => b.getBoundingClientRect().height > 0).map(b => b.getBoundingClientRect().height));
    expect(controls.every(height => height >= 44)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`game-${width}.png`), fullPage: true });
    const source = page.locator('[data-square="20"]'), target = page.locator('[data-square="48"]');
    if (width < 1000) { await source.tap(); await target.tap(); } else { await source.click(); await target.click(); }
    await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
    page.once("dialog", dialog => { expect(dialog.message()).toContain("aborts"); return dialog.dismiss(); });
    await page.getByRole("button", { name: "Resign Blue", exact: true }).click();
    await expect(page.getByTestId("game-result")).toHaveCount(0);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Resign Blue", exact: true }).click();
    await expect(page.getByTestId("game-result")).toContainText("Game aborted");
    await expect(page.locator("#result-heading")).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`result-${width}.png`), fullPage: true });
  });
});

test("long histories stay scrollable without expanding the board frame", async ({ page }, testInfo) => {
  const producer: EngineBuildIdentityV1 = { format: "li4chess-engine-build-v1", sourceRevision: "0".repeat(40),
    packageVersions: { "@li4chess/engine": "0.0.0", "@li4chess/protocol": "0.0.0" }, workingTree: { status: "unreproducible", reason: "Long-history layout fixture" } };
  const initial = createInitialState(); let state = initial; const requests: ActionRequest[] = [];
  for (let i = 0; i < 80 && !state.result; i++) {
    const moves = legalMoves(state), request: ActionRequest = { type: "move", actor: state.turn, move: moves[(i * 17 + 3) % moves.length] };
    state = resolveAction(state, request).after; requests.push(request);
  }
  expect(state.moveHistory.length).toBeGreaterThan(30);
  const replay = await recordReplay(initial, requests, producer);
  await page.setViewportSize({ width: 360, height: 900 }); await page.goto("/");
  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByLabel("Import replay", { exact: true }).setInputFiles({ name: "history.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(replay)) });
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(state.moveHistory.length);
  const list = page.getByTestId("move-history");
  expect(await list.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await list.focus(); await page.keyboard.press("End");
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("long-history-360.png"), fullPage: true });
});
