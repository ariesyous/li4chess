import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { makeARedPawnMove, openCustomize } from "./helpers.js";

const ZEN_KEY = "li4chess.zen-mode";
const board = (page: Page) => page.locator(".chess-board");
const boardWidth = async (page: Page) => Math.round((await board(page).boundingBox())!.width);
const storedZen = (page: Page) => page.evaluate(key => localStorage.getItem(key), ZEN_KEY);
const hasHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
const hasVerticalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight > innerHeight);
const enterZen = (page: Page) => page.getByRole("button", { name: "Zen mode", exact: true });
const exitZen = (page: Page) => page.getByRole("button", { name: "Exit zen mode", exact: true });
const sidebar = (page: Page) => page.getByRole("complementary", { name: "Game controls and history" });
async function startSolo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Play against computers", exact: true }).click();
  await expect(board(page)).toBeVisible();
}
async function startHotseat(page: Page) {
  await page.goto("/");
  await openCustomize(page);
  for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect(board(page)).toBeVisible();
}

test.describe("on a 1440×900 window", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("zen mode keeps the board, players and turn status, removes the rest, fits the window and can be exited", async ({ page }) => {
    await startSolo(page);
    const normalWidth = await boardWidth(page);
    await expect(sidebar(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "New game", exact: true })).toBeVisible();
    await expect(page.getByLabel("Rotate board to current player")).toBeVisible();

    await enterZen(page).click();
    await expect(exitZen(page)).toBeVisible();
    await expect(page.getByTestId("zen-status")).toHaveText("Zen mode on. Controls and history are hidden.");
    // Removed: header chrome, side panel (controls, history, rules), board tools and the visible help line.
    await expect(sidebar(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New game", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Resign Red", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Rotate board to current player")).toHaveCount(0);
    await expect(page.locator(".brand")).toHaveCount(0);
    await expect(page.locator(".board-help")).toHaveCount(0);
    // Kept: turn status, all four players, the board, and the credits line.
    await expect(page.getByTestId("turn-status")).toContainText("Your turn · Red to move");
    for (const color of [0, 1, 2, 3]) await expect(page.getByTestId(`player-${color}`)).toBeVisible();
    await expect(board(page)).toBeVisible();
    await expect(page.getByRole("link", { name: "Pieces & credits", exact: true })).toBeVisible();
    // The board takes the room the removed chrome left, with no scrolling needed.
    await expect.poll(() => boardWidth(page)).toBe(642);
    expect(await boardWidth(page)).toBeGreaterThan(normalWidth);
    expect(await hasVerticalScroll(page)).toBe(false);
    expect(await hasHorizontalScroll(page)).toBe(false);
    // Screen readers keep the selection guidance as a status message.
    await expect(page.getByRole("status").filter({ hasText: "Select a piece, then a marked square." })).toHaveCount(1);
    expect(await storedZen(page)).toBe("true");

    await exitZen(page).click();
    await expect(page.getByTestId("zen-status")).toHaveText("Zen mode off. Controls and history are shown.");
    await expect(sidebar(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "New game", exact: true })).toBeVisible();
    await expect(page.getByLabel("Rotate board to current player")).toBeVisible();
    await expect.poll(() => boardWidth(page)).toBe(normalWidth);
    expect(await storedZen(page)).toBe("false");
  });

  test("the zen toggle works from the keyboard and keeps focus on the same control", async ({ page }) => {
    await startSolo(page);
    await enterZen(page).focus();
    await page.keyboard.press("Enter");
    await expect(exitZen(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(enterZen(page)).toBeFocused();
  });

  test("moves can be played inside zen mode, and a resumed game reopens in zen mode", async ({ page }) => {
    await startHotseat(page);
    await enterZen(page).click();
    await page.getByRole("button", { name: "g2 Red Pawn", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "g2 selected" })).toContainText("legal destinations");
    await page.getByRole("button", { name: "g4 empty, legal destination", exact: true }).click();
    await expect(page.getByTestId("turn-status")).toContainText("Blue to move");

    await page.reload();
    await page.getByRole("button", { name: "Resume saved game", exact: true }).click();
    await expect(exitZen(page)).toBeVisible();
    await expect(sidebar(page)).toHaveCount(0);
    await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
    await exitZen(page).click();
    await expect(page.getByTestId("move-history").locator("li")).toHaveCount(1);
  });

  test("a finished game keeps its result and next steps in zen mode, and Play again stays in zen mode", async ({ page }) => {
    await startHotseat(page);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Resign Red", exact: true }).click();
    await expect(page.getByTestId("game-result")).toContainText("Game aborted");

    await enterZen(page).click();
    const result = page.getByTestId("game-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText("Leave zen mode to export a replay or review the move history.");
    await expect(result).not.toContainText("More game tools");
    await expect(result.getByRole("button", { name: "Change settings", exact: true })).toBeVisible();
    await result.getByRole("button", { name: "Play again", exact: true }).click();
    await expect(page.getByTestId("game-result")).toHaveCount(0);
    await expect(page.getByTestId("turn-banner")).toBeFocused();
    await expect(exitZen(page)).toBeVisible();
    await expect(page.getByTestId("turn-status")).toContainText("Turn 1");
  });

  test("a failing autosave is not hidden by zen mode and can be retried", async ({ page }) => {
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
        if (key === "li4chess.local-game.v1") throw new DOMException("Blocked", "SecurityError");
        return original.call(this, key, value);
      };
    });
    await startHotseat(page);
    await enterZen(page).click();
    const warning = page.getByTestId("zen-save-warning");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Could not save on this browser");
    await expect(warning).toContainText("Leave zen mode to export a replay");
    await expect(warning.getByRole("button", { name: "Retry save", exact: true })).toBeVisible();
    // The zen preference itself still saves, because only the game save is blocked here.
    expect(await storedZen(page)).toBe("true");

    await exitZen(page).click();
    await expect(page.getByTestId("zen-save-warning")).toHaveCount(0);
    await expect(page.getByTestId("save-message")).toContainText("Could not save");
  });

  test("zen mode is available without browser storage and simply is not remembered", async ({ page }) => {
    await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("Blocked", "SecurityError"); }; });
    await startHotseat(page);
    await enterZen(page).click();
    await expect(exitZen(page)).toBeVisible();
    await expect(sidebar(page)).toHaveCount(0);
    await exitZen(page).click();
    await expect(sidebar(page)).toBeVisible();
  });

  test("the zen control is a full-size button in both modes", async ({ page }) => {
    await startSolo(page);
    expect((await enterZen(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await enterZen(page).click();
    expect((await exitZen(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 360, height: 800 }, hasTouch: true });

  test("zen mode keeps the board in the window with no horizontal scrolling and a labeled, tappable control", async ({ page }) => {
    await startSolo(page);
    // The phone header shows a short visible label; the accessible name stays "Zen mode".
    await expect(enterZen(page)).toContainText("Zen");
    expect((await enterZen(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await enterZen(page).tap();
    await expect(exitZen(page)).toBeVisible();
    expect((await exitZen(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(sidebar(page)).toHaveCount(0);
    const box = (await board(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(await hasHorizontalScroll(page)).toBe(false);
    expect(await hasVerticalScroll(page)).toBe(false);
    for (const panel of await page.locator(".player-panel").all()) {
      expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await makeARedPawnMove(page);
    await expect(page.getByTestId("turn-status")).not.toContainText("Turn 1 —");
    await exitZen(page).tap();
    await expect(sidebar(page)).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});
