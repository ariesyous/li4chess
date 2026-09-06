import { expect,test } from "@playwright/test";
import { createInitialState,GameState } from "@li4chess/engine";

for(const action of ["Resign Red","Simulate timeout"]) {
  test(`${action}: opening action aborts without placements`,async({page})=>{
    await page.goto("/");
    for(const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
    await page.getByRole("button",{name:"Start game"}).click();
    await page.getByRole("button",{name:action,exact:true}).click();
    await expect(page.getByTestId("game-result")).toContainText("Game aborted");
    await expect(page.getByTestId("game-result")).toContainText("No placements are awarded");
    await expect(page.getByTestId("game-result").locator("li")).toHaveCount(0);
    await expect(page.getByTestId("move-history").locator("li")).toHaveCount(0);
  });
  test(`${action}: post-opening dead army retains a live automatically moving King`,async({page})=>{
    const base=createInitialState();
    const initial:GameState={ ...base,completedMoves:{ 0:3,1:3,2:3,3:3 },board:base.board.map(p=>p?.type === "K" || p?.type === "R" ? p : null) };
    await page.route("**/src/game/useLocalGame.ts",async route=>{
      const response=await route.fetch(),source=await response.text();
      expect(source).toContain("createInitialState(toSeatConfig(seats))");
      await route.fulfill({response,body:source.replace("createInitialState(toSeatConfig(seats))",`(${JSON.stringify(initial)})`)});
    });
    const errors:string[]=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.goto("/");
    for(const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
    await page.getByRole("button",{name:"Start game"}).click();
    await page.getByRole("button",{name:action,exact:true}).click();
    await expect(page.getByText(/Red \(You\).*King walks automatically/)).toBeVisible();
    await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
    await expect(page.getByRole("button",{name:/dead Red/})).toHaveCount(2);
    await expect(page.getByTestId("move-history").locator("li")).toHaveCount(1);
    await expect(page.getByTestId("game-result")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
