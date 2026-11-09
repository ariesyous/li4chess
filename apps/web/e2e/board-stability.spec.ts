import { expect, test } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";
import { createInitialState, PieceType, PlayerColor, squareOf } from "@li4chess/engine";
import type { GameState } from "@li4chess/engine";
import { recordReplay } from "@li4chess/protocol";
import { openCustomize, openGameTools } from "./helpers.js";

// Headless Chromium normally hides scrollbars; exercise their actual width.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const sizeKey = "li4chess.board-size";
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(({ page }) => { expect(pageErrors.get(page)).toEqual([]); });
const width = (page: Page) => page.locator(".chess-board").evaluate(board => board.getBoundingClientRect().width);
const settle = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

async function watchWidths(page: Page) {
  await page.evaluate(() => {
    const samples: number[] = [];
    const metrics: unknown[] = [];
    const observer = new ResizeObserver(entries => {
      const width = entries[0]!.contentRect.width;
      samples.push(width);
      metrics.push({ width, viewport: [innerWidth, innerHeight, document.documentElement.clientWidth, visualViewport?.height],
        fit: (document.querySelector(".local-game") as HTMLElement).style.getPropertyValue("--board-fit-height"),
        area: document.querySelector(".play-area")!.getBoundingClientRect().width });
    });
    observer.observe(document.querySelector(".chess-board")!);
    Object.assign(window, { boardSizeProbe: { samples, observer, metrics } });
  });
}
async function expectStable(page: Page, initial: number) {
  await settle(page);
  const result = await page.evaluate(() => {
    const probe = (window as unknown as { boardSizeProbe: { samples: number[]; observer: ResizeObserver; metrics: unknown[] } }).boardSizeProbe;
    probe.observer.disconnect();
    return { samples: probe.samples, metrics: probe.metrics };
  });
  expect(result.samples.length).toBeGreaterThan(0);
  for (const sample of [...result.samples, await width(page)]) expect(Math.abs(sample - initial), JSON.stringify({ initial, ...result })).toBeLessThan(1);
}

async function swipe(session: CDPSession, page: Page, x: number, y: number, dy: number) {
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 10; step++) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + dy * step / 10 }] });
    await settle(page);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

for (const viewport of [{ width: 360, height: 800 }, { width: 820, height: 1180 }]) {
  test.describe(`native touch at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    for (const saved of [false, true]) {
      test(`scrolling near the grip and across the board preserves the ${saved ? "saved" : "automatic"} size; only the display slider resizes`, async ({ page }) => {
        if (saved) await page.addInitScript(key => localStorage.setItem(key, "1500"), sizeKey);
        await page.goto("/");
        await page.getByRole("button", { name: "Play against computers", exact: true }).tap();
        await settle(page);
        const initial = await width(page);
        await watchWidths(page);
        const session = await page.context().newCDPSession(page);
        const tools = (await page.locator(".board-tools").boundingBox())!;
        // Begin where the old touch-capturing grip sat, then pan the board both ways.
        await swipe(session, page, tools.x + tools.width - 22, tools.y + 22, -150);
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(30);
        await page.evaluate(() => scrollTo(0, 0));
        const board = (await page.locator(".chess-board").boundingBox())!;
        await swipe(session, page, board.x + board.width / 2, board.y + board.height / 2, -100);
        const scrolled = await page.evaluate(() => scrollY);
        expect(scrolled).toBeGreaterThan(30);
        await swipe(session, page, board.x + board.width / 2, board.y + 40, 100);
        await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(scrolled);
        await expectStable(page, initial);
        expect(await page.evaluate(key => localStorage.getItem(key), sizeKey)).toBe(saved ? "1500" : null);
        await expect(page.locator('.board-square[aria-pressed="true"]')).toHaveCount(0);
        await expect(page.getByTestId("move-history").locator("li")).toHaveCount(0);

        await page.getByText("Board display", { exact: true }).tap();
        const range = page.getByRole("slider", { name: "Board size", exact: true });
        await range.scrollIntoViewIfNeeded();
        const box = (await range.boundingBox())!;
        const min = Number(await range.getAttribute("min")), max = Number(await range.getAttribute("max"));
        const x = box.x + 8 + (box.width - 16) * (Number(await range.inputValue()) - min) / (max - min);
        await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: box.y + box.height / 2 }] });
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + 8, y: box.y + box.height / 2 }] });
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await expect(range).toHaveValue(String(min));
        await expect.poll(async () => Math.round(await width(page))).toBe(min);
        expect(await page.evaluate(key => localStorage.getItem(key), sizeKey)).toBe(String(min));
        await session.detach();
      });

      test(`zoom and native panning preserve the ${saved ? "saved" : "automatic"} board layout`, async ({ page }) => {
        if (saved) await page.addInitScript(key => localStorage.setItem(key, "1500"), sizeKey);
        await page.goto("/");
        await page.getByRole("button", { name: "Play against computers", exact: true }).tap();
        await settle(page);
        const initial = await width(page);
        await watchWidths(page);
        const session = await page.context().newCDPSession(page);
        // Headless Chromium has no browser toolbar; use its native page scale
        // to change the visual viewport, then send real touch pans.
        await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1.5 });
        await expect.poll(() => page.evaluate(() => visualViewport!.scale)).toBeGreaterThan(1.2);
        await swipe(session, page, 120, 300, -80);
        await swipe(session, page, 120, 200, 80);
        await expectStable(page, initial);
        expect(await page.evaluate(key => localStorage.getItem(key), sizeKey)).toBe(saved ? "1500" : null);
        await session.detach();
      });
    }
  });
}

const producer = { format: "li4chess-engine-build-v1" as const, sourceRevision: "0".repeat(40),
  packageVersions: { "@li4chess/engine": "0.0.0", "@li4chess/protocol": "0.0.0" },
  workingTree: { status: "unreproducible" as const, reason: "Board stability browser fixture" } };

for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 700 }, { width: 360, height: 800 }, { width: 820, height: 1180 }, { width: 1440, height: 900 }, { width: 1440, height: 1500 }]) {
  test.describe(`checkmate layout at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: viewport.width < 1000, isMobile: viewport.width < 1000 });
    for (const saved of [false, true]) test(`checkmate notice appearing and clearing preserves the ${saved ? "saved" : "automatic"} board size`, async ({ page, browserName }, info) => {
      const base = createInitialState();
      const board: GameState["board"][number][] = Array(196).fill(null);
      for (const [file, rank, type, owner] of [
        [3,0,PieceType.King,0], [0,6,PieceType.King,1], [8,10,PieceType.King,2], [13,7,PieceType.King,3],
        [5,0,PieceType.Knight,1], [6,1,PieceType.Knight,1], [6,2,PieceType.Knight,1],
        [3,13,PieceType.Pawn,0], [3,9,PieceType.Rook,1], [3,5,PieceType.Knight,1], [3,3,PieceType.Rook,1],
      ] as const) board[squareOf(file, rank)] = { type, owner, hasMoved: true };
      // On the narrowest phone the top Yellow card must also fit "Dead army".
      const rotated = viewport.width === 320;
      const transform = (square: number) => rotated ? 195 - square : square;
      const victim = rotated ? PlayerColor.Yellow : PlayerColor.Red;
      const victimName = rotated ? "Yellow" : "Red";
      const position = rotated ? board.map((_, square) => {
        const piece = board[transform(square)];
        return piece ? { ...piece, owner: (piece.owner + 2) % 4 as PlayerColor } : null;
      }) : board;
      const replay = await recordReplay({ ...base, board: position, turn: rotated ? PlayerColor.Blue : PlayerColor.Green, positionCounts: {},
        castlingRights: { 0: { kingside: false, queenside: false }, 1: { kingside: false, queenside: false },
          2: { kingside: false, queenside: false }, 3: { kingside: false, queenside: false } } }, [], producer);
      if (saved) await page.addInitScript(key => localStorage.setItem(key, "1500"), sizeKey);
      await page.goto("/");
      await openCustomize(page);
      for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
      await page.getByRole("button", { name: "Start game", exact: true }).click();
      await openGameTools(page);
      await page.getByLabel("Import replay", { exact: true }).setInputFiles({ name: "before-mate.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(replay)) });
      await expect(page.getByTestId("replay-message")).toContainText("Replay verified");
      await page.evaluate(() => scrollTo(0, 0));
      await settle(page);
      // Full-page capture can temporarily resize Chromium to 1×1. Capture
      // the real viewport so measurement covers gameplay at a fixed window.
      await page.screenshot({ path: info.outputPath("before-mate.png") });
      await settle(page);
      const initial = await width(page);
      await watchWidths(page);
      const play = async (file: number, rank: number) => {
        const square = page.locator(`[data-square="${transform(squareOf(file, rank))}"]`);
        if (viewport.width < 1000) await square.tap(); else await square.click();
      };
      await play(13, 7); await play(12, 7);
      await expect(page.getByText(`${victimName} is checkmated`, { exact: false })).toBeVisible();
      await expect(page.getByTestId(`player-${victim}`)).toContainText("Dead army");
      if (viewport.height === 1500 && saved && browserName === "chromium") {
        expect(await page.evaluate(() => innerWidth - document.documentElement.clientWidth)).toBeGreaterThan(0);
      }
      await page.evaluate(() => scrollTo(0, 0));
      await expect(page.locator(".board-frame")).toBeInViewport({ ratio: 1 });
      const overlaps = await page.evaluate(() => {
        const squares = [...document.querySelectorAll(".board-square")].map(square => square.getBoundingClientRect());
        return [...document.querySelectorAll(".player-panel")].filter(panel => {
          const box = panel.getBoundingClientRect();
          return squares.some(square => Math.min(box.right, square.right) - Math.max(box.left, square.left) > 1
            && Math.min(box.bottom, square.bottom) - Math.max(box.top, square.top) > 1);
        }).map(panel => panel.getAttribute("aria-label"));
      });
      expect(overlaps).toEqual([]);
      await page.screenshot({ path: info.outputPath("after-mate.png") });
      await play(3, 9); await play(3, 13);
      await expect(page.getByText(`${victimName} is checkmated`, { exact: false })).toHaveCount(0);
      await expectStable(page, initial);
      expect(await page.evaluate(key => localStorage.getItem(key), sizeKey)).toBe(saved ? "1500" : null);
    });
  });
}

for (const viewport of [{ width: 360, height: 600 }, { width: 360, height: 700 }, { width: 820, height: 1180 }]) for (const zen of [false, true]) {
  test.describe(`turn layout at ${viewport.width}×${viewport.height}, zen ${zen}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    test("selection, CPU thinking and completed turns keep the board size stable", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Play against computers", exact: true }).tap();
      if (zen) await page.getByRole("button", { name: "Zen mode", exact: true }).tap();
      await settle(page);
      const initial = await width(page);
      await watchWidths(page);
      await page.getByRole("button", { name: "g2 Red Pawn", exact: true }).tap();
      await page.getByRole("button", { name: "g4 empty, legal destination", exact: true }).tap();
      await expect(page.getByTestId("turn-status")).toContainText("Turn 5", { timeout: 20000 });
      await expectStable(page, initial);
    });
  });
}
