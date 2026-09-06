import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function hotseat(page: Page) {
  await page.goto("/");
  for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
  await page.getByRole("button", { name: "Start game" }).click();
}
test("hotseat moves autosave before immediate refresh and resume through keyboard controls", async ({ page }) => {
  await hotseat(page);
  await page.locator('[data-square="20"]').click(); await page.locator('[data-square="48"]').click();
  await page.reload();
  const resume = page.getByRole("button", { name: "Resume saved game" });
  await resume.focus(); await page.keyboard.press("Enter");
  await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(1);
  await page.locator('[data-square="85"]').click(); await page.locator('[data-square="87"]').click();
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(2);
  await expect(page.getByTestId("save-message")).toContainText("Saved on this browser");
});
test("abort result survives refresh and a new game replaces its save", async ({ page }) => {
  await hotseat(page); await page.getByRole("button", { name: "Resign Red", exact: true }).click();
  await page.reload(); await page.getByRole("button", { name: "Resume saved game" }).click();
  await expect(page.getByTestId("game-result")).toContainText("Game aborted");
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByTestId("game-result")).toHaveCount(0);
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(0);
});
test("missing and corrupted saves leave setup usable", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "Resume saved game" }).click();
  await expect(page.getByRole("status")).toContainText("No saved game");
  await page.evaluate(() => localStorage.setItem("li4chess.local-game.v1", "broken"));
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await expect(page.getByRole("status")).toContainText("Cannot resume");
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByTestId("turn-status")).toBeVisible();
});
test("unavailable storage reports the limitation while legal moves remain usable", async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("Blocked", "SecurityError"); }; });
  await hotseat(page);
  await expect(page.getByTestId("save-message")).toContainText("Could not save");
  await page.locator('[data-square="20"]').click(); await page.locator('[data-square="48"]').click();
  await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
  await expect(page.getByRole("button", { name: "Export replay", exact: true })).toBeEnabled();
});

test("an older asynchronous resume cannot replace a newly started game", async ({ page }) => {
  await page.route("**/src/game/localSave.ts", async route => {
    const response = await route.fetch(), source = await response.text();
    expect(source).toContain("return replayCheckpoint(replay);");
    await route.fulfill({ response, body: source.replace("return replayCheckpoint(replay);",
      'const recovered = await replayCheckpoint(replay); document.documentElement.dataset.resumeVerified = "true"; return recovered;') });
  });
  await hotseat(page);
  await page.locator('[data-square="20"]').click(); await page.locator('[data-square="48"]').click();
  await page.reload();
  // Delay the existing asynchronous hash boundary so replacement is exercised
  // while validation is in flight, without changing recovered game semantics.
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    let first = true;
    crypto.subtle.digest = async (algorithm, data) => {
      if (first) {
        first = false;
        await new Promise<void>(resolve => { (window as Window & { releaseResume?: () => void }).releaseResume = resolve; });
      }
      return original(algorithm, data);
    };
  });
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await expect(page.getByRole("status")).toContainText("Verifying");
  await page.getByRole("button", { name: "Start game" }).click();
  await page.evaluate(() => (window as Window & { releaseResume?: () => void }).releaseResume!());
  await page.waitForFunction(() => document.documentElement.dataset.resumeVerified === "true");
  await expect(page.getByTestId("turn-status")).toContainText("Red to move");
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(0);
});
