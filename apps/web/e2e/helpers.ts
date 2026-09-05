import { Page } from "@playwright/test";

/** Clicks a Red-owned pawn button on the board, then clicks its farthest available forward-push destination. */
export async function makeARedPawnMove(page: Page): Promise<void> {
  const pawnRect = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const pawnButtons = buttons.filter((b) => b.textContent?.includes("♙"));
    for (const b of pawnButtons) {
      const span = b.querySelector("span:last-child") as HTMLElement | null;
      if (span && getComputedStyle(span).color.includes("214, 69, 69")) {
        const r = b.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }
    }
    return null;
  });
  if (!pawnRect) throw new Error("no red pawn found on board");
  await page.mouse.click(pawnRect.x + pawnRect.w / 2, pawnRect.y + pawnRect.h / 2);
  await page.waitForTimeout(150);

  const targetRect = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    for (const b of buttons) {
      const dot = b.querySelector("span");
      if (dot && (dot as HTMLElement).style.borderRadius === "50%" && !b.textContent?.trim().match(/[a-zA-Z]/)) {
        const r = b.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }
    }
    return null;
  });
  if (!targetRect) throw new Error("no legal destination dot found for the selected pawn");
  await page.mouse.click(targetRect.x + targetRect.w / 2, targetRect.y + targetRect.h / 2);
}

/** Sets every seat's difficulty <select> (when visible) to the given level, for speed. */
export async function setAllDifficulties(page: Page, level: number): Promise<void> {
  const selects = page.locator("select");
  const count = await selects.count();
  for (let i = 0; i < count; i++) {
    await selects.nth(i).selectOption(String(level));
  }
}
