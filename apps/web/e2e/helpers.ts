import type { Page } from "@playwright/test";

/** A real starting Red Pawn move, independent of glyph/font/color rendering. */
export async function makeARedPawnMove(page: Page): Promise<void> {
  await page.getByRole("button", { name: "g2 Red Pawn", exact: true }).click();
  await page.getByRole("button", { name: "g4 empty, legal destination", exact: true }).click();
}

export async function setAllDifficulties(page: Page, level: number): Promise<void> {
  for (const select of await page.locator("select").all()) await select.selectOption(String(level));
}
