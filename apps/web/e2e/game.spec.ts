import { expect, test } from "@playwright/test";
import { makeARedPawnMove, setAllDifficulties } from "./helpers.js";

test("human (Red) + 3 CPU: a real move plays, then all three CPU seats auto-play their turns", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  // Default seat config is exactly Red human / Blue+Yellow+Green CPU.
  await setAllDifficulties(page, 1);
  await page.getByRole("button", { name: "Start game" }).click();

  await expect(page.getByTestId("turn-status")).toContainText("Turn 1 — Red to move");

  await makeARedPawnMove(page);

  // Rotation is Red -> Blue -> Yellow -> Green -> Red; after Red's move and all
  // three CPU seats auto-playing, it should come back around to Red on turn 5.
  await expect(page.getByTestId("turn-status")).toContainText("Turn 5 — Red to move", { timeout: 15_000 });

  const history = page.getByTestId("move-history").locator("li");
  await expect(history).toHaveCount(4);

  expect(errors).toEqual([]);
});

test("4-CPU autoplay: the whole game drives itself turn after turn with no errors or desync", async ({ page }) => {
  // A real 4-player game between weak/fast bots can take a very long time to
  // actually reach elimination (see the engine's own fuzz tests, where random
  // play rarely finishes within even 80 plies) — requiring full completion
  // here would make this suite slow and flaky. Instead this soaks the UI's
  // autoplay wiring for a bounded window: turns must keep advancing, and IF
  // the game happens to finish in that window the result view must be sane.
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  // Seat rows render in fixed Red/Blue/Yellow/Green order, so the first CPU
  // checkbox on the page is Red's — check it too, and drop every difficulty to 1 for speed.
  await page.locator('input[type="checkbox"]').first().check();
  await setAllDifficulties(page, 1);
  await page.getByRole("button", { name: "Start game" }).click();

  await expect(page.getByTestId("turn-status")).toContainText("Turn 1", { timeout: 5_000 });

  const deadline = Date.now() + 40_000;
  let lastTurnNumber = 1;
  let sawResult = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2_000);
    if (await page.getByTestId("game-result").isVisible()) {
      sawResult = true;
      break;
    }
    const text = await page.getByTestId("turn-status").textContent();
    const match = text?.match(/Turn (\d+)/);
    expect(match, `expected a turn-status readout, got: ${text}`).toBeTruthy();
    const turnNumber = Number(match![1]);
    expect(turnNumber).toBeGreaterThanOrEqual(lastTurnNumber);
    lastTurnNumber = turnNumber;
  }

  // Autoplay must have made real progress either way.
  expect(lastTurnNumber).toBeGreaterThan(1);

  if (sawResult) {
    // Either a single winner (elimination) or a tied draw (threefold repetition) —
    // both are valid outcomes, so just confirm the result view rendered sanely.
    const placements = page.getByTestId("game-result").locator("li");
    await expect(placements).toHaveCount(4);
  }

  expect(errors).toEqual([]);
});
