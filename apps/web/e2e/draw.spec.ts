import { expect,test } from "@playwright/test";
import { createInitialState,GameState } from "@li4chess/engine";

for(const cause of ["insufficient-material","fifty-move"] as const) test(`automatic ${cause} draw explains the result and flat awards`,async({page})=>{
  const base=createInitialState();
  const initial:GameState=cause==="fifty-move" ? { ...base,reversibleMoves:199 } : { ...base,board:base.board.map(p=>p?.type==="K" ? p : null) };
  await page.route("**/src/game/useLocalGame.ts",async route=>{
    const response=await route.fetch(),source=await response.text();
    expect(source).toContain("createInitialState(toSeatConfig(seats))");
    await route.fulfill({response,body:source.replace("createInitialState(toSeatConfig(seats))",`(${JSON.stringify(initial)})`)});
  });
  await page.goto("/");
  for(const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
  await page.getByRole("button",{name:"Start game"}).click();
  const square=(index:number)=>page.locator(`button[data-square="${index}"]`);
  await square(cause==="fifty-move" ? 4 : 7).click();
  await square(cause==="fifty-move" ? 31 : 8).click();
  await expect(page.getByTestId("game-result")).toContainText(cause==="fifty-move" ? "draw by 50-move rule" : "draw by insufficient material");
  await expect(page.getByTestId("award-ledger").locator("li")).toHaveCount(4);
  await expect(page.getByTestId("game-result")).toContainText("Red — 10 pts · place 1 (shared)");
  await expect(page.getByTestId("winner-name")).toHaveCount(0);
});
