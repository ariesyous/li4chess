import { test,expect } from "@playwright/test";
import { createInitialState } from "@li4chess/engine";
import { createReplay,recordReplay,readReplay,ONLINE_VERSION } from "@li4chess/protocol";
import type { EngineBuildIdentityV1,OnlineSnapshot } from "@li4chess/protocol";
const producer:EngineBuildIdentityV1={format:"li4chess-engine-build-v1",sourceRevision:"4".repeat(40),workingTree:{status:"clean"},packageVersions:{"@li4chess/engine":"0.0.0","@li4chess/protocol":"0.0.0"}};
test("StrictMode download survives identity rerender, ignores delayed obsolete response and retries",async({page})=>{
  const initial=createInitialState(),header=await createReplay(initial,producer),replay=await recordReplay(initial,[{type:"resign",actor:0}],producer),state=(await readReplay(replay)).state;
  const snapshot:OnlineSnapshot={gameId:"room-1",command:1,event:state.sequence,state,stateHash:replay.finalStateHash,chainHash:`sha256:${"a".repeat(64)}`,producer,sourceReplayHash:null,serverTime:1000,
    timing:{format:"li4chess-room-clock-v1",revision:1,phase:"terminal",remainingMs:[1000,1000,1000,1000],disconnectRemainingMs:[60000,60000,60000,60000],connected:[true,true,true,true],activeSeat:null,activatedAt:null,deadline:null,accountedAt:1000,policy:{initialMs:1000,incrementMs:0,increment:"after-move"},previousResume:null,suspendedAt:null,backwards:false,command:1,incident:null}};
  const session={version:ONLINE_VERSION,type:"session",principal:"p1",generation:1,expiresAt:Date.now()+600000};
  await page.addInitScript(value=>{(window as unknown as {replayFixture:unknown}).replayFixture=value;},{snapshot,session});
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let arrived!:()=>void;const pending=new Promise<void>(resolve=>{arrived=resolve;});
  await page.route("**/api/online",async route=>{
    const body=route.request().postDataJSON() as {type:string;room:string;cursor:string|null};
    if(body.type==="session"){await route.fulfill({json:{...session,principal:"p2",generation:2}});return;}
    const id=Number(body.room.split("-")[1]);
    if(id===1){arrived();await gate;}
    const head={command:snapshot.command,event:snapshot.event,stateHash:snapshot.stateHash,chainHash:snapshot.chainHash};
    await route.fulfill({json:{version:ONLINE_VERSION,type:"replay",page:{room:body.room,principal:`p${id}`,generation:id,head,
      command:body.cursor?1:0,header:body.cursor?null:header,events:body.cursor?replay.events:[],next:body.cursor?null:"a".repeat(64)}}}).catch(()=>undefined);
  });
  await page.goto("/li4chess/test/replay-download-harness.html");
  await expect(page.getByRole("button",{name:"Download replay",exact:true})).toBeEnabled();
  let downloads=0;page.on("download",()=>downloads++);
  await page.getByRole("button",{name:"Download replay",exact:true}).click();await pending;
  await expect(page.getByRole("button",{name:"Download replay",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Change identity"}).click();release();
  await expect(page.getByRole("button",{name:"Download replay",exact:true})).toBeEnabled();
  const downloaded=page.waitForEvent("download");await page.getByRole("button",{name:"Download replay",exact:true}).click();
  expect((await downloaded).suggestedFilename()).toContain("room-2");expect(downloads).toBe(1);
  await expect(page.getByTestId("replay-download-status")).toContainText("Verified replay download started");
});
