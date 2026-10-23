import type { Page } from "@playwright/test";

export async function openCustomize(page: Page): Promise<void> {
  const summary = page.locator("summary").filter({ hasText: /^Customize game$/ });
  if (await summary.locator("..").getAttribute("open") === null) await summary.click();
}

export async function openGameTools(page: Page): Promise<void> {
  const summary = page.locator("summary").filter({ hasText: /^More game tools$/ });
  if (await summary.locator("..").getAttribute("open") === null) await summary.click();
}

/** A real starting Red Pawn move, independent of glyph/font/color rendering. */
export async function makeARedPawnMove(page: Page): Promise<void> {
  await page.getByRole("button", { name: "g2 Red Pawn", exact: true }).click();
  await page.getByRole("button", { name: "g4 empty, legal destination", exact: true }).click();
}

export async function setAllDifficulties(page: Page, level: number): Promise<void> {
  for (const select of await page.locator("select").all()) await select.selectOption(String(level));
}
