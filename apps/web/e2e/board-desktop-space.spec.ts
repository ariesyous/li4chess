import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createInitialState } from "@li4chess/engine";
import { recordReplay } from "@li4chess/protocol";
import { openGameTools } from "./helpers.js";

const sizeKey = "li4chess.board-size";
const boardWidth = (page: Page) => page.locator(".chess-board").evaluate(board => board.getBoundingClientRect().width);

async function expectClearCorners(page: Page) {
  const overlaps = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".player-panel")];
    const obstacles = [...document.querySelectorAll(".board-square"), ...cards];
    return cards.filter(card => {
      const a = card.getBoundingClientRect();
      return obstacles.some(obstacle => {
        if (obstacle === card) return false;
        const b = obstacle.getBoundingClientRect();
        return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
          && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      });
    }).map(card => card.getAttribute("aria-label"));
  });
  expect(overlaps).toEqual([]);
  await expect(page.locator(".board-frame")).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const viewport of [{ width: 1898, height: 943 }, { width: 1908, height: 895 }, { width: 3840, height: 2160 }]) {
  test(`normal and Zen boards use the available desktop space at ${viewport.width}×${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto("/li4chess/");
    await page.getByRole("button", { name: "Play against computers", exact: true }).click();
    // A square board is height-limited here, but the cards belong in its empty
    // corners instead of consuming two extra rows above and below the board.
    await expect.poll(() => boardWidth(page)).toBeGreaterThan(viewport.height - 240);
    await expectClearCorners(page);
    const fitted = await boardWidth(page);
    const grip = page.getByRole("slider", { name: "Resize board", exact: true });
    await grip.focus();
    await page.keyboard.press("Home");
    await expect.poll(() => boardWidth(page)).toBeCloseTo(280, 0);
    await expectClearCorners(page);
    await page.keyboard.press("End");
    await expect.poll(() => boardWidth(page)).toBeGreaterThan(fitted - 11);
    await expectClearCorners(page);
    await page.screenshot({ path: info.outputPath("normal-desktop.png") });

    await page.getByRole("button", { name: "Zen mode", exact: true }).click();
    await expect.poll(() => boardWidth(page)).toBeGreaterThan(viewport.height - 100);
    await expectClearCorners(page);
    const exit = page.getByRole("button", { name: "Exit zen mode", exact: true });
    await expect(exit).toBeInViewport({ ratio: 1 });
    const banner = (await page.getByTestId("turn-status").boundingBox())!;
    const button = (await exit.boundingBox())!;
    expect(banner.y).toBeLessThan(button.y + button.height);
    expect(banner.x + banner.width).toBeLessThan(button.x);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await page.screenshot({ path: info.outputPath("zen-desktop.png") });

    await exit.click();
    await expect.poll(() => boardWidth(page)).toBeGreaterThan(fitted - 11);
    await expectClearCorners(page);
  });
}

test("a small remembered board can grow to the full desktop fit after reload", async ({ page }) => {
  await page.setViewportSize({ width: 1898, height: 943 });
  await page.addInitScript(key => localStorage.setItem(key, "280"), sizeKey);
  await page.goto("/li4chess/");
  await page.getByRole("button", { name: "Play against computers", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game", exact: true }).click();
  await expect.poll(() => boardWidth(page)).toBeCloseTo(280, 0);
  await page.getByRole("slider", { name: "Resize board", exact: true }).focus();
  await page.keyboard.press("End");
  await expect.poll(() => boardWidth(page)).toBeGreaterThan(703);
  await expectClearCorners(page);
  await page.getByText("Board display", { exact: true }).click();
  await page.getByRole("button", { name: "Fit to window", exact: true }).click();
  await expect.poll(() => boardWidth(page)).toBeGreaterThan(703);
  expect(await page.evaluate(key => localStorage.getItem(key), sizeKey)).toBeNull();
});

test("small desktop corner cards keep walking-King labels clear of playable squares", async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(key => localStorage.setItem(key, "280"), sizeKey);
  const base = createInitialState();
  const replay = await recordReplay({ ...base, turnNumber: 13, completedMoves: { 0: 3, 1: 3, 2: 3, 3: 3 }, positionCounts: {},
    board: base.board.map(piece => piece?.type === "K" || piece?.type === "R" ? piece : null) }, [], {
    format: "li4chess-engine-build-v1", sourceRevision: "0".repeat(40),
    packageVersions: { "@li4chess/engine": "0.0.0", "@li4chess/protocol": "0.0.0" },
    workingTree: { status: "unreproducible", reason: "Desktop corner-card browser fixture" },
  });
  await page.goto("/li4chess/");
  await page.getByRole("button", { name: "Play against computers", exact: true }).click();
  await openGameTools(page);
  await page.getByLabel("Import replay", { exact: true }).setInputFiles({
    name: "post-opening.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(replay)),
  });
  await expect(page.getByTestId("replay-message")).toContainText("Replay verified");
  for (const name of ["Red", "Blue"]) {
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: `Resign ${name}`, exact: true }).click();
  }
  await expect(page.getByTestId("player-0")).toContainText("Walking King");
  await expect(page.getByTestId("player-1")).toContainText("Walking King");
  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => boardWidth(page)).toBeCloseTo(280, 0);
  await page.locator(".arena").screenshot({ path: info.outputPath("small-corner-cards.png") });
  await expectClearCorners(page);
  await page.getByRole("slider", { name: "Resize board", exact: true }).focus();
  for (let step = 0; step < 32; step++) await page.keyboard.press("ArrowRight");
  await expect.poll(() => boardWidth(page)).toBeCloseTo(600, 0);
  for (const color of [0, 1]) {
    const card = page.getByTestId(`player-${color}`);
    await expect(card.locator(".captures-preview")).toBeVisible();
    expect(await card.evaluate(panel => {
      const text = document.createRange();
      text.selectNodeContents(panel.querySelector(".player-state")!);
      return panel.querySelector(".player-captures")!.getBoundingClientRect().left - text.getBoundingClientRect().right;
    })).toBeGreaterThan(0);
  }
  await expectClearCorners(page);
});
