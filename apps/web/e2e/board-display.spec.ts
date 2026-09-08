import { expect, test } from "@playwright/test";

test("piece-owner letters toggle without changing square names and persist after resume", async ({ page }) => {
  await page.goto("/li4chess/");
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const pawn = page.getByRole("button", { name: "g2 Red Pawn", exact: true });
  await expect(pawn.locator(".piece-owner")).toHaveText("R");
  await page.getByText("Board display", { exact: true }).click();
  await page.getByLabel("Show piece-owner letters", { exact: true }).uncheck();
  await expect(page.locator(".piece-owner")).toHaveCount(0);
  await pawn.click();
  await expect(pawn).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  await expect(page.getByTestId("save-message")).toContainText("Saved on this browser");
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game", exact: true }).click();
  await expect(pawn).toBeVisible();
  await expect(page.locator(".piece-owner")).toHaveCount(0);
  await page.getByText("Board display", { exact: true }).click();
  await page.getByLabel("Show piece-owner letters", { exact: true }).check();
  await expect(pawn.locator(".piece-owner")).toHaveText("R");
});
