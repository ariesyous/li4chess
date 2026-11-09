import { expect, test } from "@playwright/test";

const sizeKey = "li4chess.board-size";

for (const viewport of [
  { width: 1920, height: 945 },
  { width: 1440, height: 900 },
  { width: 1280, height: 600 },
  { width: 820, height: 1180 },
  { width: 360, height: 800 },
  { width: 360, height: 600 },
  { width: 320, height: 568 },
]) {
  test(`an oversized saved board fits the ${viewport.width}×${viewport.height} window`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(key => localStorage.setItem(key, "1500"), sizeKey);
    await page.goto("/");
    await page.getByRole("button", { name: "Play against computers", exact: true }).click();
    const frame = page.locator(".board-frame");
    await expect(frame).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".chess-board")).toBeInViewport({ ratio: 1 });
    const overlaps = await page.evaluate(() => {
      const squares = [...document.querySelectorAll(".board-square")].map(square => square.getBoundingClientRect());
      return [...document.querySelectorAll(".player-panel")].filter(panel => {
        const card = panel.getBoundingClientRect();
        return squares.some(square => Math.min(card.right, square.right) - Math.max(card.left, square.left) > 1
          && Math.min(card.bottom, square.bottom) - Math.max(card.top, square.top) > 1);
      }).map(panel => {
        const card = panel.getBoundingClientRect();
        return { player: panel.getAttribute("aria-label"), width: card.width, height: card.height,
          overlaps: squares.filter(square => Math.min(card.right, square.right) - Math.max(card.left, square.left) > 1
            && Math.min(card.bottom, square.bottom) - Math.max(card.top, square.top) > 1)
            .map(square => ({ width: Math.min(card.right, square.right) - Math.max(card.left, square.left),
              height: Math.min(card.bottom, square.bottom) - Math.max(card.top, square.top) })) };
      });
    });
    expect(overlaps).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(key => localStorage.getItem(key), sizeKey)).toBe("1500");

    await page.getByText("Board display", { exact: true }).click();
    const range = page.getByRole("slider", { name: "Board size", exact: true });
    if (await range.count()) {
      await range.focus();
      await page.keyboard.press("End");
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(frame).toBeInViewport({ ratio: 1 });
      const max = Number(await range.getAttribute("max"));
      expect(Math.abs((await page.locator(".chess-board").boundingBox())!.width - max)).toBeLessThan(1);
      const grip = page.getByRole("slider", { name: "Resize board", exact: true });
      await expect(grip).toHaveAttribute("aria-valuemax", String(max));
      await expect(grip).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: info.outputPath("capped-board.png"), fullPage: true });
  });
}

test("a saved size shrinks for a short window and returns when the window grows", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 2160 });
  await page.addInitScript(key => localStorage.setItem(key, "1500"), sizeKey);
  await page.goto("/");
  await page.getByRole("button", { name: "Play against computers", exact: true }).click();
  const board = page.locator(".chess-board");
  await expect(board).toHaveCSS("width", "1500px");
  await page.setViewportSize({ width: 1920, height: 768 });
  await expect(page.locator(".board-frame")).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(key => localStorage.getItem(key), sizeKey)).toBe("1500");
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game", exact: true }).click();
  await expect(page.locator(".board-frame")).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 1920, height: 2160 });
  await expect(board).toHaveCSS("width", "1500px");
});

test("dragging the grip beyond the bottom stops at the shared height limit", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Play against computers", exact: true }).click();
  const grip = page.getByRole("slider", { name: "Resize board", exact: true });
  await grip.focus();
  await page.keyboard.press("Home");
  const start = (await grip.boundingBox())!;
  await page.mouse.move(start.x + 20, start.y + 20);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, 895, { steps: 15 });
  await page.mouse.up();
  const max = Number(await grip.getAttribute("aria-valuemax"));
  await expect(grip).toHaveAttribute("aria-valuenow", String(max));
  await expect(page.locator(".board-frame")).toBeInViewport({ ratio: 1 });
  await expect(grip).toBeInViewport({ ratio: 1 });
});

test("a very short landscape window keeps a usable board and scrollable controls", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page.getByRole("button", { name: "Play against computers", exact: true }).click();
  await expect.poll(async () => Math.round((await page.locator(".chess-board").boundingBox())!.width)).toBe(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await expect(page.getByRole("button", { name: "Resign Red", exact: true })).toBeVisible();
});
