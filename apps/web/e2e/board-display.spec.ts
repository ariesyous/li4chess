import { openGameTools } from "./helpers.js";
import { expect, test } from "@playwright/test";

test("piece-owner letters default off and remember either choice without changing square names", async ({ page }) => {
  await page.goto("/li4chess/");
  await page.getByRole("button", { name: "Play against computers", exact: true }).click();
  const pawn = page.getByRole("button", { name: "g2 Red Pawn", exact: true });
  await expect(page.locator(".piece-owner")).toHaveCount(0);
  await page.getByText("Board display", { exact: true }).click();
  const toggle = page.getByLabel("Show piece-owner letters", { exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(pawn.locator(".piece-owner")).toHaveText("R");
  await pawn.click();
  await expect(pawn).toHaveAttribute("aria-pressed", "true");
  await openGameTools(page);
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  await expect(page.getByTestId("save-message")).toContainText("Saved on this browser");
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game", exact: true }).click();
  await expect(pawn).toBeVisible();
  await expect(pawn.locator(".piece-owner")).toHaveText("R");
  await page.getByText("Board display", { exact: true }).click();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(page.locator(".piece-owner")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game", exact: true }).click();
  await expect(pawn).toBeVisible();
  await expect(page.locator(".piece-owner")).toHaveCount(0);
  await page.getByText("Board display", { exact: true }).click();
  await expect(toggle).not.toBeChecked();
});

for (const viewport of [
  { width: 360, height: 600 },
  { width: 820, height: 1180 },
  { width: 960, height: 600 },
  { width: 1024, height: 768 },
]) test(`board and resize grip fit the ${viewport.width}×${viewport.height} viewport`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto("/li4chess/");
  await page.getByRole("button", { name: "Play against computers", exact: true }).click();
  const handle = page.getByRole("slider", { name: "Resize board", exact: true });
  await expect(page.locator(".board-frame")).toBeInViewport({ ratio: 1 });
  if (await handle.count()) await expect(handle).toBeInViewport({ ratio: 1 });
  else expect((await page.locator(".chess-board").boundingBox())!.width).toBeLessThanOrEqual(280);
  await expect(page.locator(".chess-board")).toBeInViewport({ ratio: 1 });
  const board = await page.locator(".chess-board").boundingBox();
  expect(Math.abs(board!.width - board!.height)).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test("mouse drag resizes immediately, survives resume, and preserves board input", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/li4chess/");
  await page.getByRole("button", { name: "Play against computers", exact: true }).click();
  const handle = page.getByRole("slider", { name: "Resize board", exact: true });
  const original = Number(await handle.getAttribute("aria-valuenow"));
  const expected = Math.round((original - 120) / 10) * 10;
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + 22, grip.y + 22);
  await page.mouse.down();
  await page.mouse.move(grip.x - 38, grip.y - 98, { steps: 8 });
  await expect.poll(async () => Number(await handle.getAttribute("aria-valuenow"))).toBe(expected);
  await page.mouse.up();
  await expect(page.locator(".chess-board")).toHaveCSS("width", `${expected}px`);
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game", exact: true }).click();
  await expect(handle).toHaveAttribute("aria-valuenow", String(expected));
  await page.getByRole("button", { name: "g2 Red Pawn", exact: true }).click();
  await page.getByRole("button", { name: "g4 empty, legal destination", exact: true }).click();
  await expect(page.getByTestId("move-history").locator("li").first()).toContainText("g2-g4");
});

test.describe("tablet touch controls", () => {
  test.use({ hasTouch: true, viewport: { width: 820, height: 1180 } });
  test("touch resizing uses Board display and leaves the board free to scroll", async ({ page }, testInfo) => {
    await page.goto("/li4chess/");
    await page.getByRole("button", { name: "Play against computers", exact: true }).tap();
    const handle = page.getByRole("slider", { name: "Resize board", exact: true });
    await expect(handle).toBeHidden();
    await page.getByText("Board display", { exact: true }).tap();
    const range = page.getByRole("slider", { name: "Board size", exact: true });
    await range.tap({ position: { x: 8, y: 22 } });
    await expect(range).toHaveValue("280");
    await expect.poll(async () => Math.round((await page.locator(".chess-board").boundingBox())!.width)).toBe(280);
    await expect(page.locator('.board-square[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.getByTestId("move-history").locator("li")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("tablet-resized.png"), fullPage: true });
  });
});

test("keyboard and display slider respect bounds, reset to fit, and adapt to rotation", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/li4chess/");
  await page.getByRole("button", { name: "Play against computers", exact: true }).click();
  const handle = page.getByRole("slider", { name: "Resize board", exact: true });
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  const smaller = Number(await handle.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", String(smaller + 10));
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await expect(handle).toHaveAttribute("aria-valuenow", "280");
  await page.getByText("Board display", { exact: true }).click();
  const range = page.getByRole("slider", { name: "Board size", exact: true });
  await range.focus();
  await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "290");
  await page.getByRole("button", { name: "Fit to window", exact: true }).click();
  await expect.poll(async () => Number(await handle.getAttribute("aria-valuenow"))).toBeGreaterThan(600);
  expect(await page.evaluate(() => localStorage.getItem("li4chess.board-size"))).toBeNull();
  await handle.focus();
  await page.keyboard.press("End");
  await page.getByRole("button", { name: "Fit to window", exact: true }).click();
  await handle.focus();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(async () => Number(await handle.getAttribute("aria-valuenow"))).toBeLessThan(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(handle).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".chess-board")).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect.poll(async () => Number(await handle.getAttribute("aria-valuenow"))).toBeGreaterThan(600);
});

test("unavailable browser storage does not prevent resizing", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error("Storage blocked"); };
    Storage.prototype.setItem = () => { throw new Error("Storage blocked"); };
    Storage.prototype.removeItem = () => { throw new Error("Storage blocked"); };
  });
  await page.goto("/li4chess/");
  await page.getByRole("button", { name: "Play against computers", exact: true }).click();
  const handle = page.getByRole("slider", { name: "Resize board", exact: true });
  await handle.focus();
  await page.keyboard.press("Home");
  await expect(handle).toHaveAttribute("aria-valuenow", "280");
  await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "290");
});
