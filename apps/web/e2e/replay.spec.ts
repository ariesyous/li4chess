import { expect,test,Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createInitialState } from "@li4chess/engine";
import { canonicalJson, readReplay, recordReplay, sha256 } from "@li4chess/protocol";
import type { EngineBuildIdentityV1, ReplayEnvelopeV2 } from "@li4chess/protocol";

const producer:EngineBuildIdentityV1={format:"li4chess-engine-build-v1",sourceRevision:"0".repeat(40),
  packageVersions:{"@li4chess/engine":"0.0.0","@li4chess/protocol":"0.0.0"},
  workingTree:{status:"unreproducible",reason:"Browser acceptance fixture"}};
async function start(page:Page) {
  await page.goto("/");
  for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
  await page.getByRole("button",{name:"Start game"}).click();
}
async function exportGame(page:Page):Promise<ReplayEnvelopeV2> {
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export replay",exact:true}).click();
  const download=await downloadPromise;
  const replay=JSON.parse(await readFile((await download.path())!,"utf8"));
  await readReplay(replay);
  return replay;
}
async function importGame(page:Page,replay:unknown) {
  await page.getByLabel("Import replay").setInputFiles({name:"game.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(replay))});
}

test("export, reload, resume and re-export retain state and producer lineage; tampering rejects",async({page})=>{
  await start(page);
  await page.locator('button[data-square="20"]').click();
  await page.locator('button[data-square="48"]').click();
  const saved=await exportGame(page);
  expect(saved.game.setupId).toBe("li4chess-modern-ffa-setup-v1");
  expect(saved.result).toBeNull();
  expect(saved.events.filter(event=>event.type === "move")).toHaveLength(1);
  await start(page);
  await importGame(page,saved);
  await expect(page.getByTestId("replay-message")).toContainText("Replay verified");
  await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(1);
  await page.locator('button[data-square="85"]').click();
  await page.locator('button[data-square="87"]').click();
  const resumed=await exportGame(page);
  expect(resumed.game.sourceReplayHash).toBe(await sha256(canonicalJson(saved)));
  expect(resumed.game.setupId).toMatch(/^li4chess-ffa-checkpoint-v1:/);
  expect((await readReplay(resumed)).state.position.completedMoves).toEqual({0:1,1:1,2:0,3:0});
  await importGame(page,{...saved,finalStateHash:`sha256:${"0".repeat(64)}`});
  await expect(page.getByTestId("replay-message")).toContainText("Invalid v2");
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(2);
});

test("terminal abort exports and imports without placements",async({page})=>{
  await start(page);
  await page.getByRole("button",{name:"Resign Red",exact:true}).click();
  const saved=await exportGame(page);
  expect(saved.events.map(event=>event.type)).toEqual(["resign","abort"]);
  await start(page);await importGame(page,saved);
  await expect(page.getByTestId("replay-message")).toContainText("Finished replay loaded");
  await expect(page.getByTestId("game-result")).toContainText("Game aborted");
  await expect(page.getByTestId("game-result").locator("li")).toHaveCount(0);
});

test("imported walking King resumes its cursor and exports the recorded automatic move",async({page})=>{
  const base=createInitialState();
  const initial={...base,completedMoves:{0:3,1:3,2:3,3:3},board:base.board.map(p=>p?.type === "K" || p?.type === "R" ? p : null)};
  const saved=await recordReplay(initial,[{type:"resign",actor:0}],producer);
  await start(page);await importGame(page,saved);
  await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
  const resumed=await exportGame(page);
  expect(resumed.events[0]).toMatchObject({type:"randomKingMove",checkpointCause:{positionSequence:1}});
  expect((await readReplay(resumed)).state.position.randomDrawIndex).toBe(1);
});

test("an interrupted terminal award transaction recovers the exact final result",async({page})=>{
  const complete=await recordReplay({...createInitialState(),reversibleMoves:199},[{type:"move",actor:0,move:{from:4,to:31}}],producer);
  const interrupted={...complete,events:complete.events.slice(0,2),result:null,finalStateHash:complete.events[1].stateHashAfter};
  await start(page);await importGame(page,interrupted);
  await expect(page.getByTestId("game-result")).toContainText("50-move rule");
  await expect(page.getByTestId("award-ledger").locator("li")).toHaveCount(4);
  expect((await exportGame(page)).result).toEqual(complete.result);
});

test("imported CPU ownership and difficulty drive scheduling in a human-configured game",async({page})=>{
  const initial=createInitialState({isCPU:{0:true,1:false,2:false,3:false},cpuDifficulty:{0:1}});
  const saved=await recordReplay(initial,[],producer);
  await start(page);await importGame(page,saved);
  await expect(page.getByText(/Red \(CPU L1\)/)).toBeVisible();
  await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(1);
  expect((await readReplay(await exportGame(page))).state.position.players[0]).toMatchObject({isCPU:true,cpuDifficulty:1});
});
