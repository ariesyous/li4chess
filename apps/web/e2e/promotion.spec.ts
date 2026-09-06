import { expect, test } from "@playwright/test";
import { GameState, PieceType, createInitialState } from "@li4chess/engine";

test("eighth-rank promotion displays Queen and history, then capture scores one point", async ({ page }) => {
  const base = createInitialState();
  const board = base.board.map(() => null) as GameState["board"][number][];
  for (const square of [7,84,188,111]) board[square] = base.board[square];
  board[89] = { type:PieceType.Pawn, owner:0, hasMoved:true };
  board[130] = { type:PieceType.Knight, owner:1, hasMoved:true };
  const initial: GameState = { ...base, board, positionCounts:{} };
  await page.route("**/src/game/useLocalGame.ts", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const initializer = "createInitialState(toSeatConfig(seats))";
    expect(source).toContain(initializer);
    await route.fulfill({ response, body:source.replace(initializer, `(${JSON.stringify(initial)})`) });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name:"Start game" })).toBeVisible();
  for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
  await page.getByRole("button", { name:"Start game" }).click();
  const square = (index: number) => page.locator(`button[data-square="${index}"]`);
  await square(89).click();
  await square(103).click();
  await expect(square(103)).toHaveAttribute("aria-label", "f8 Red Q");
  await expect(page.getByTestId("move-history")).toContainText("Pf7-f8=Q");
  await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
  await square(130).click();
  await square(103).click();
  await expect(square(103)).toHaveAttribute("aria-label", "f8 Blue N");
  await expect(page.getByText("Blue (You) — active · 1 pts", { exact:true })).toBeVisible();
});
