import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { makeARedPawnMove } from "./helpers.js";

const BOARD_SIZE_KEY = "li4chess.board-size";
const board = (page: Page) => page.locator(".chess-board");
const boardWidth = async (page: Page) => Math.round((await board(page).boundingBox())!.width);
const storedSize = (page: Page) => page.evaluate(key => localStorage.getItem(key), BOARD_SIZE_KEY);
const hasHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
const slider = (page: Page) => page.getByLabel("Board size", { exact: true });
const fitButton = (page: Page) => page.getByRole("button", { name: "Fit to window", exact: true });
async function startSolo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Play against computers", exact: true }).click();
  await expect(board(page)).toBeVisible();
}
const openBoardDisplay = (page: Page) => page.getByText("Board display", { exact: true }).click();

test.describe("board size on a 1440×900 window", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the Board size slider resizes the board, is remembered, and Fit to window restores the automatic size", async ({ page }) => {
    await startSolo(page);
    // The automatic fit includes the actual player cards, controls and wrapped help.
    const fitted = await boardWidth(page);
    expect(fitted).toBeGreaterThan(390);
    expect(fitted).toBeLessThanOrEqual(565);
    await expect(page.locator(".board-frame")).toBeInViewport({ ratio: 1 });
    await openBoardDisplay(page);
    await expect(slider(page)).toHaveAttribute("min", "280");
    expect(Math.abs(Number(await slider(page).inputValue()) - fitted)).toBeLessThanOrEqual(5);
    await expect(fitButton(page)).toBeDisabled();

    await slider(page).fill("700");
    await expect.poll(() => boardWidth(page)).toBe(700);
    expect(await storedSize(page)).toBe("700");
    await expect(fitButton(page)).toBeEnabled();
    expect(await hasHorizontalScroll(page)).toBe(false);
    const box = (await board(page).boundingBox())!;
    expect(Math.abs(box.width - box.height)).toBeLessThan(1);
    await makeARedPawnMove(page);
    await expect(page.getByTestId("move-history").locator("li")).not.toHaveCount(0);

    await page.reload();
    await page.getByRole("button", { name: "Resume saved game", exact: true }).click();
    await expect.poll(() => boardWidth(page)).toBe(700);
    await openBoardDisplay(page);
    await expect(slider(page)).toHaveValue("700");

    await fitButton(page).click();
    await expect.poll(() => boardWidth(page)).toBe(fitted);
    expect(await storedSize(page)).toBeNull();
    await expect(fitButton(page)).toBeDisabled();
    expect(Math.abs(Number(await slider(page).inputValue()) - fitted)).toBeLessThanOrEqual(5);
  });

  test("the slider is keyboard operable and stops at its limits", async ({ page }) => {
    await startSolo(page);
    await openBoardDisplay(page);
    await slider(page).fill("500");
    await expect.poll(() => boardWidth(page)).toBe(500);
    await slider(page).focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await expect.poll(() => boardWidth(page)).toBe(530);
    await page.keyboard.press("Home");
    await expect.poll(() => boardWidth(page)).toBe(280);
    await page.keyboard.press("End");
    const max = Number(await slider(page).getAttribute("max"));
    await expect.poll(() => boardWidth(page)).toBe(max);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("dragging the corner grip resizes the board under the pointer; double-clicking fits it to the window", async ({ page }) => {
    await startSolo(page);
    const grip = page.getByTestId("board-resizer");
    await expect(grip).toHaveAttribute("role", "slider");
    await expect(grip).toHaveAccessibleName("Resize board");
    const fitted = await boardWidth(page);
    const enlarged = Math.round((fitted + 200) / 10) * 10;
    const start = (await grip.boundingBox())!;
    const x = start.x + start.width / 2, y = start.y + start.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 100, y + 25, { steps: 6 });
    await page.mouse.up();
    // Centered board: its right edge moves half as far as its width grows, so +100px of pointer is +200px of board (on the 10px grid).
    await expect.poll(() => boardWidth(page)).toBe(enlarged);
    expect(await storedSize(page)).toBe(String(enlarged));
    const moved = (await grip.boundingBox())!;
    expect(Math.abs(moved.x + moved.width / 2 - (x + 100))).toBeLessThanOrEqual(6);

    // Dragging far to the left stops at the smallest board rather than collapsing it.
    await grip.scrollIntoViewIfNeeded();
    const shrinkStart = (await grip.boundingBox())!;
    await page.mouse.move(shrinkStart.x + 20, shrinkStart.y + 20);
    await page.mouse.down();
    await page.mouse.move(shrinkStart.x - 500, shrinkStart.y + 20, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => boardWidth(page)).toBe(280);

    await grip.dblclick();
    await expect.poll(() => boardWidth(page)).toBe(fitted);
    expect(await storedSize(page)).toBeNull();
  });

  test("zen mode fits the board to the window whatever size was chosen, and leaving zen restores that size", async ({ page }) => {
    await page.addInitScript(key => localStorage.setItem(key, "700"), BOARD_SIZE_KEY);
    await startSolo(page);
    expect(await boardWidth(page)).toBe(700);
    await page.getByRole("button", { name: "Zen mode", exact: true }).click();
    await expect(page.getByRole("button", { name: "Exit zen mode", exact: true })).toBeVisible();
    await expect.poll(() => boardWidth(page)).toBe(642);
    await expect(page.getByTestId("board-resizer")).toHaveCount(0);
    expect(await storedSize(page)).toBe("700");
    await page.getByRole("button", { name: "Exit zen mode", exact: true }).click();
    await expect.poll(() => boardWidth(page)).toBe(700);
  });

  for (const remembered of ["abc", "100"]) {
    test(`a remembered size of "${remembered}" is ignored and the board fits the window`, async ({ page }) => {
      await page.addInitScript(([key, value]) => localStorage.setItem(key!, value!), [BOARD_SIZE_KEY, remembered]);
      await startSolo(page);
      expect(await boardWidth(page)).toBeGreaterThan(390);
      expect(await page.locator(".local-game").evaluate(element => element.style.getPropertyValue("--board-size"))).toBe("");
      await expect(page.locator(".board-frame")).toBeInViewport({ ratio: 1 });
    });
  }
});

test.describe("board size beyond the default layout", () => {
  for (const width of [1440, 1920]) {
    test(`dragging the size slider back and forth stays stable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 945 });
      await startSolo(page);
      await openBoardDisplay(page);
      const range = slider(page);
      await range.fill("800");
      const box = (await range.boundingBox())!;
      const min = Number(await range.getAttribute("min")), max = Number(await range.getAttribute("max"));
      let x = box.x + 8 + (box.width - 16) * (800 - min) / (max - min);
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (const [destination, limit] of [[box.x + box.width + 50, max], [box.x - 50, min]] as const) {
        const start = x;
        let previous = Number(await range.inputValue());
        for (let step = 1; step <= 25; step++) {
          x = start + (destination - start) * step / 25;
          await page.mouse.move(x, y);
          // Let React and ResizeObserver settle before checking each real pointer event.
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          const current = Number(await range.inputValue());
          if (destination > start) expect(current).toBeGreaterThanOrEqual(previous);
          else expect(current).toBeLessThanOrEqual(previous);
          expect(Math.abs((await range.boundingBox())!.x - box.x)).toBeLessThan(1);
          expect(Math.abs((await board(page).boundingBox())!.width - current)).toBeLessThan(1);
          previous = current;
        }
        await expect(range).toHaveValue(String(limit));
      }
      await page.mouse.up();
      expect(await hasHorizontalScroll(page)).toBe(false);
    });
  }

  test("on a wide window the board can grow past the default layout without overflowing or crowding the side panel", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await startSolo(page);
    expect(await boardWidth(page)).toBeGreaterThan(390);
    expect(await boardWidth(page)).toBeLessThanOrEqual(745);
    await expect(page.locator(".board-frame")).toBeInViewport({ ratio: 1 });
    await openBoardDisplay(page);
    const max = Number(await slider(page).getAttribute("max"));
    // The default layout holds at most 858px (1240px shell − padding − side panel); a wide window offers more.
    expect(max).toBeGreaterThan(1000);
    await slider(page).fill(String(max));
    await expect.poll(() => boardWidth(page)).toBe(max);
    expect(await hasHorizontalScroll(page)).toBe(false);
    const sidebar = (await page.getByRole("complementary", { name: "Game controls and history" }).boundingBox())!;
    const box = (await board(page).boundingBox())!;
    expect(sidebar.x).toBeGreaterThanOrEqual(box.x + box.width);
    expect(sidebar.x + sidebar.width).toBeLessThanOrEqual(1920);
    expect(box.x).toBeGreaterThanOrEqual(0);
  });

  test("a remembered size too large for a narrow window is clamped to what fits", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.addInitScript(key => localStorage.setItem(key, "1500"), BOARD_SIZE_KEY);
    await startSolo(page);
    const box = (await board(page).boundingBox())!;
    expect(box.width).toBeGreaterThan(700);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(800);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("a phone can shrink its board even when it starts at full width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await startSolo(page);
    await openBoardDisplay(page);
    await expect(page.getByLabel("Show piece-owner letters", { exact: true })).toBeVisible();
    await expect(slider(page)).toHaveCount(1);
    await expect(page.getByTestId("board-resizer")).toHaveCount(1);
    expect(await boardWidth(page)).toBe(352);
    await slider(page).focus();
    await page.keyboard.press("Home");
    await expect.poll(() => boardWidth(page)).toBe(280);
  });
});
