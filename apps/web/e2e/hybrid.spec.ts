import { openCustomize } from "./helpers.js";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { resumeLocalGame } from "../src/game/localSave.js";

async function start(page: Page, level = "3") {
  await page.addInitScript(()=>{
    const Native=window.Worker;
    (window as unknown as {hybridResults:unknown[]}).hybridResults=[];
    window.Worker=class extends Native {
      constructor(url:string|URL,options?:WorkerOptions){super(url,options);
        this.addEventListener("message",event=>{if(event.data?.type==="result")
          (window as unknown as {hybridResults:unknown[]}).hybridResults.push(event.data.diagnostics);});
      }
    };
  });
  await page.goto("/"); await openCustomize(page);
  for(const checkbox of await page.locator('input[type="checkbox"]').all())await checkbox.uncheck();
  await page.locator('input[type="checkbox"]').first().check();
  await page.locator("select").selectOption(level);
  await page.getByRole("button",{name:"Start game"}).click();
  await expect(page.getByTestId("turn-status")).toContainText("Blue to move",{timeout:20000});
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(1);
  return page.evaluate(()=>(window as unknown as {hybridResults:unknown[]}).hybridResults);
}
test("default CPU loads real WASM/NNUE and returns a Tetrarch move",async({page})=>{
  const assets:string[]=[];page.on("response",r=>{if(/\.(wasm|nnue|bin)(\?|$)/.test(r.url())&&r.ok())assets.push(r.url());});
  const results=await start(page);
  expect(results).toHaveLength(1);expect(results[0]).toMatchObject({engine:"tetrarch",fallback:false});
  expect(assets.some(u=>u.includes(".wasm"))).toBe(true);
  expect(assets.some(u=>u.includes(".nnue"))).toBe(true);
});
test("level 10 completes a real adviser turn and resumes with its difficulty", async ({ page }) => {
  const results = await start(page, "10");
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ engine: "tetrarch", fallback: false });
  const saved = await page.evaluate(() => localStorage.getItem("li4chess.local-game.v1"));
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game", exact: true }).click();
  await expect(page.getByTestId("player-0")).toContainText("CPU L10");
  await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(1);
  const resumed = await page.evaluate(() => localStorage.getItem("li4chess.local-game.v1"));
  const before = await resumeLocalGame({ getItem: () => saved, setItem: () => {} });
  const after = await resumeLocalGame({ getItem: () => resumed, setItem: () => {} });
  expect(after.state).toEqual(before.state);
});
test("level 10 uses a legal native turn when adviser assets are unavailable", async ({ page }) => {
  await page.route("**/*.nnue*", route => route.abort());
  const results = await start(page, "10");
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ engine: "native", fallbackReason: expect.any(String) });
});
test("missing network uses native search without stopping the game",async({page})=>{
  await page.route("**/*.nnue*",route=>route.abort());
  const results=await start(page);
  expect(results).toHaveLength(1);expect(results[0]).toMatchObject({engine:"native",fallbackReason:expect.any(String)});
});
test("corrupt network fails integrity validation and uses native search",async({page})=>{
  await page.route("**/*.nnue*",route=>route.fulfill({body:"corrupt network",contentType:"application/octet-stream"}));
  const results=await start(page);
  expect(results[0]).toMatchObject({engine:"native",fallbackReason:"engine-asset-integrity"});
});
test("default hybrid remains usable under fourfold CPU throttling",async({page})=>{
  const session=await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate",{rate:4});
  const results=await start(page);
  expect(results[0]).toMatchObject({engine:"tetrarch",fallback:false});
});
