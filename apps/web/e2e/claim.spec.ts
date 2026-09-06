import { expect,test } from "@playwright/test";
import { createInitialState,GameState } from "@li4chess/engine";

for(const {lead,turn,cpu,deadScore} of [
  {lead:20,turn:0,cpu:false,deadScore:0},{lead:21,turn:0,cpu:false,deadScore:0},
  {lead:21,turn:1,cpu:false,deadScore:0},{lead:21,turn:0,cpu:true,deadScore:0},
  {lead:21,turn:0,cpu:true,deadScore:50},
]) test(`Claim: lead ${lead}, turn ${turn}, CPU ${cpu}, eliminated score ${deadScore}`,async({page})=>{
  const base=createInitialState();
  const initial:GameState={ ...base,turn,completedMoves:{ 0:3,1:3,2:3,3:3 },
    board:base.board.map(p=>p?.type === "K" || p?.type === "R" ? p : null),
    players:{ ...base.players,0:{ ...base.players[0],score:lead },
      2:{ ...base.players[2],score:deadScore,status:"resigned",kingStatus:"walking",forfeit:{ reason:"resign",sequence:1 } },
      3:{ ...base.players[3],status:"resigned",kingStatus:"walking",forfeit:{ reason:"resign",sequence:2 } } },eventSequence:2 };
  await page.route("**/src/game/useLocalGame.ts",async route=>{
    const response=await route.fetch(),source=await response.text();
    expect(source).toContain("createInitialState(toSeatConfig(seats))");
    await route.fulfill({response,body:source.replace("createInitialState(toSeatConfig(seats))",`(${JSON.stringify(initial)})`)});
  });
  await page.goto("/");
  for(const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
  if(cpu) await page.locator('input[type="checkbox"]').first().check();
  await page.getByRole("button",{name:"Start game"}).click();
  const claim=page.getByRole("button",{name:"Claim Win for Red",exact:true});
  if(lead===20) { await expect(claim).toHaveCount(0);return; }
  if(cpu && deadScore===50) {
    await expect(page.getByTestId("move-history").locator("li")).toHaveCount(1);
    await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
    await expect(page.getByTestId("game-result")).toHaveCount(0);return;
  }
  if(!cpu) await claim.click();
  await expect(page.getByTestId("game-result")).toContainText("Red claimed the win. Blue received 20 points");
  await expect(page.getByTestId("winner-name")).toContainText("Red — 21 pts · place 1");
  await expect(page.getByTestId("game-result")).toContainText("Yellow — 0 pts · place 3 (shared)");
  await expect(page.getByTestId("award-ledger").locator("li")).toHaveCount(1);
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(0);
  await expect(page.getByTestId("turn-status")).toHaveCount(0);
});
