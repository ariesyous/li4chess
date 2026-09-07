import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { chromium, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ONLINE_VERSION, parseOnlineResponse, sha256 } from "@li4chess/protocol";
import type { OnlineResponse, OnlineSnapshot } from "@li4chess/protocol";
import { runtimeEnvironment } from "@li4chess/protocol/node";
import { root, packageRoot, assets, generated, require, verifyArtifact, freePort, runNode, startRuntime, stopRuntime, wrangler, localEnv, handleSignals } from "../scripts/shared.js";

handleSignals();
const artifact=await verifyArtifact(true);
const output=resolve(process.env.M3_05_OUTPUT??resolve(root,"arena-results",`m3-05-${Date.now()}`));await mkdir(dirname(output),{recursive:true});await mkdir(output);
const port=await freePort(),origin=`http://127.0.0.1:${port}`;
const config=JSON.parse(await readFile(resolve(packageRoot,"wrangler.multiplayer.local.jsonc"),"utf8")) as {main:string;assets:{directory:string};vars:Record<string,string>;d1_databases:{migrations_dir:string}[]};
config.main=resolve(packageRoot,"src/multiplayer-local.ts");config.assets.directory=assets;config.vars.ONLINE_ORIGIN=origin;
config.d1_databases[0].migrations_dir=resolve(root,"packages/persistence/migrations");
const configPath=resolve(output,"wrangler.json");await writeFile(configPath,JSON.stringify(config,null,2));
await writeFile(resolve(output,"manifest.json"),JSON.stringify({producer:artifact.producer,environment:runtimeEnvironment(),
  nodeExecutable:process.execPath,pnpm:execFileSync(process.execPath,[process.env.npm_execpath!,"--version"],{encoding:"utf8",windowsHide:true}).trim(),
  wrangler:require("wrangler/package.json").version,workerd:require(require.resolve("workerd/package.json",{paths:[resolve(root,"node_modules/wrangler")]})).version,
  configuration:"wrangler.json",expiryTtlMs:12000,command:"pnpm --filter @li4chess/worker test:multiplayer",origin,hosted:false,startedAt:new Date().toISOString()},null,2));
await writeFile(resolve(output,"artifact.json"),JSON.stringify(artifact,null,2));
let log="",failure:unknown,browser:Browser|undefined,runtime:Awaited<ReturnType<typeof startRuntime>>|undefined;
const observations:unknown[]=[];
const record=(name:string,data:unknown={})=>{observations.push({name,...data as object});process.stdout.write(`PASS ${name}\n`);};
const contexts:BrowserContext[]=[];
const credentialTokens:string[]=[];
async function sql(command:string,persist=resolve(output,"runtime"),configuration=configPath){let text="";
  await runNode(wrangler,["d1","execute","GAME_DB","--local","--config",configuration,"--persist-to",persist,"--command",command,"--json"],root,localEnv,data=>{text+=data;});log+=text;return text;}
async function request(context:BrowserContext,body:unknown,proof?:string,headers:Record<string,string>={}):Promise<OnlineResponse>{
  const r=await context.request.post(`${origin}/api/online`,{headers:{Origin:origin,"Content-Type":"application/json","X-Li4chess-Protocol":ONLINE_VERSION,...(proof?{"X-Li4chess-Connection":proof}:{}),...headers},data:{version:ONLINE_VERSION,...body as object}});
  return parseOnlineResponse(await r.json());
}
async function observe(context:BrowserContext){await context.addInitScript({content:`
  window.__onlineMessages = [];
  window.WebSocket = class extends window.WebSocket {
    constructor(url, protocols) { super(url, protocols); this.addEventListener("message", event => {
      try { window.__onlineMessages.push(JSON.parse(event.data)); } catch {}
    }); }
  };
`});}
async function lastSnapshot(page:Page):Promise<OnlineSnapshot>{const value=await page.evaluate(()=>{
  const messages=(window as unknown as {__onlineMessages:{type:string;snapshot:unknown}[]}).__onlineMessages;
  return messages.filter(m=>m.type==="snapshot").at(-1)?.snapshot;
});assert(value);const r=await parseOnlineResponse({version:ONLINE_VERSION,type:"snapshot",snapshot:value});assert(r.type==="snapshot");return r.snapshot;}
async function connected(page:Page){await expect(page.getByTestId("online-status")).toContainText(/connected|terminal/,{timeout:20000});await expect(page.getByTestId("online-control")).toContainText(/Controller|Observer/);}
async function proof(page:Page){return page.evaluate(()=>JSON.parse(sessionStorage.getItem("li4chess.online.connection.v1")!).proof as string);}
async function enter(page:Page){await page.goto(origin);await page.getByRole("button",{name:"Private multiplayer",exact:true}).click();}
try{
  await runNode(wrangler,["d1","migrations","apply","GAME_DB","--local","--config",configPath,"--persist-to",resolve(output,"runtime")],root,localEnv,data=>{log+=data;});
  runtime=await startRuntime(port,output,artifact.producer.buildFingerprint!,data=>{log+=data;},configPath);
  browser=await chromium.launch();
  for(let i=0;i<5;i++){const c=await browser.newContext();contexts.push(c);await observe(c);}
  const pages=await Promise.all(contexts.slice(0,4).map(c=>c.newPage()));
  for(const page of pages){await enter(page);await page.getByRole("button",{name:"Create guest session",exact:true}).click();await expect(page.getByText("Guest session active",{exact:true})).toBeVisible();}
  const sessions=await Promise.all(contexts.slice(0,4).map(c=>request(c,{type:"session"})));
  assert(sessions.every(s=>s.type==="session"));assert.equal(new Set(sessions.map(s=>s.type==="session"?s.principal:"")).size,4);
  for(const c of contexts.slice(0,4)){const cookies=await c.cookies();assert.equal(cookies.length,1);assert(cookies[0].httpOnly);assert.equal(cookies[0].sameSite,"Strict");assert.match(cookies[0].value,/^[0-9a-f]{64}$/);credentialTokens.push(cookies[0].value);}
  record("four independently issued HttpOnly guest sessions");
  const creations:string[]=[];let loseCreation=true;
  await pages[0].route("**/api/online",async route=>{const body=route.request().postDataJSON() as {type:string;id?:string};if(body.type==="create"){
    creations.push(body.id!);if(loseCreation){loseCreation=false;await route.fetch();await route.abort("failed");return;}}await route.continue();});
  await pages[0].getByRole("button",{name:"Create private room",exact:true}).click();
  await expect(pages[0].getByRole("status")).toContainText("Response lost");
  await pages[0].getByRole("button",{name:"Create private room",exact:true}).click();
  const invitation=await pages[0].getByRole("textbox",{name:"Share invitation",exact:true}).inputValue();
  const room=await pages[0].getByTestId("online-room").textContent();assert(room);
  const createId=await pages[0].evaluate(()=>sessionStorage.getItem("li4chess.online.create"));assert(createId);
  assert.equal(creations.length,2);assert.equal(new Set(creations).size,1);await pages[0].unroute("**/api/online");
  const createdAgain=await request(contexts[0],{type:"create",id:createId});assert(createdAgain.type==="created");assert.equal(createdAgain.lobby.room,room);assert.equal(createdAgain.invitation,invitation);
  for(let i=1;i<4;i++){await pages[i].getByRole("textbox",{name:"Invitation",exact:true}).fill(invitation);await pages[i].getByRole("button",{name:"Join private room",exact:true}).click();await expect(pages[i].getByTestId("online-room")).toHaveText(room);}
  const noSeat=await request(contexts[1],{type:"ready",room,ready:true});assert(noSeat.type==="error"&&noSeat.code==="unauthorized");
  const outsider=await request(contexts[4],{type:"issue"});assert.equal(outsider.type,"session");
  const wrongRoom=await request(contexts[4],{type:"lobby",room});assert(wrongRoom.type==="error"&&wrongRoom.code==="unauthorized");
  const leaving=await contexts[4].newPage();await enter(leaving);let release!:(()=>void),arrived!:(()=>void);
  const held=new Promise<void>(done=>{release=done;}),ready=new Promise<void>(done=>{arrived=done;});
  await leaving.route("**/api/online",async route=>{if((route.request().postDataJSON() as {type:string}).type==="create"){
    const response=await route.fetch();arrived();await held;await route.fulfill({response});}else await route.continue();});
  await leaving.getByRole("button",{name:"Create private room",exact:true}).click();await ready;
  await leaving.getByRole("button",{name:"Back to local play",exact:true}).click();release();
  await leaving.waitForResponse(r=>r.url().endsWith("/api/online")&&r.request().postDataJSON().type==="create");
  await leaving.getByRole("button",{name:"Private multiplayer",exact:true}).click();await expect(leaving.getByRole("button",{name:"Create private room",exact:true})).toBeVisible();
  assert.equal(await leaving.evaluate(()=>sessionStorage.getItem("li4chess.online.room")),null);await leaving.close();
  record("late successful lobby response after leave cannot restore cleared room state");
  const race=await Promise.all([request(contexts[0],{type:"seat",room,seat:0}),request(contexts[1],{type:"seat",room,seat:0})]);
  assert.equal(race.filter(r=>r.type==="lobby").length,1);assert.equal(race.filter(r=>r.type==="error"&&r.code==="conflict").length,1);
  // Resolve requested colors after concurrent arbitration, preserving the winning seat.
  const zeroWinner=race[0].type==="lobby"?0:1;const order=[zeroWinner,1-zeroWinner,2,3];
  for(let seat=1;seat<4;seat++)assert.equal((await request(contexts[order[seat]],{type:"seat",room,seat})).type,"lobby");
  const readies=await Promise.all(order.map(i=>request(contexts[i],{type:"ready",room,ready:true})));assert(readies.every(r=>r.type==="lobby"));
  for(const page of pages)await connected(page);
  record("invitation membership, concurrent seats/readiness and immutable game creation",{room,seats:order});
  const red=pages[order[0]],redContext=contexts[order[0]],redProof=await proof(red);
  const invalids=[{type:"command",room,id:"server:1",expectedCommand:0,action:{type:"resign"}},{type:"command",room,id:"x",expectedCommand:-1,action:{type:"resign"}},
    {type:"command",room,id:"x",expectedCommand:0,action:{type:"timeout"}},{type:"command",room,id:"x",expectedCommand:0,action:{type:"resign",actor:1}},
    {type:"command",room,id:"x",expectedCommand:0,action:{type:"move",from:0,to:1}},{type:"lobby",room,principal:"forged"},{type:"lobby",room,version:"unknown"}];
  for(const body of invalids){const r=await request(redContext,body,redProof);assert(r.type==="error"&&r.code==="invalid");}
  for(const supplied of ["https://foreign.invalid","null",""]){const r=await request(redContext,{type:"lobby",room},undefined,{Origin:supplied});assert(r.type==="error"&&r.code==="origin");}
  const oversized=await request(redContext,{type:"create",id:"a".repeat(5000)});assert(oversized.type==="error"&&oversized.code==="invalid");
  const wrongPrincipal=await request(contexts[order[1]],{type:"resync",room,expectedCommand:0},redProof);assert(wrongPrincipal.type==="error"&&wrongPrincipal.code==="unauthorized");
  record("strict origin/version/field/action/size/sequence and proof authorization rejection");
  for(const headers of [{Origin:"https://foreign.invalid","Sec-WebSocket-Protocol":ONLINE_VERSION},{Origin:origin,"Sec-WebSocket-Protocol":"unknown"}]){
    const response=await redContext.request.get(`${origin}/api/online`,{headers:{Upgrade:"websocket",...headers}});
    const r=await parseOnlineResponse(await response.json());assert(r.type==="error"&&["origin","invalid"].includes(r.code));
  }
  for(const mode of ["malformed","timeout"]){
    const result=await red.evaluate(({version,mode})=>new Promise<{messages:string[];code:number}>((done,reject)=>{
      const socket=new WebSocket(location.origin.replace("http:","ws:")+"/api/online",version),messages:string[]=[];
      const timer=setTimeout(()=>{socket.close();reject(new Error("Unauthenticated frame deadline not enforced"));},8000);
      socket.onopen=()=>{if(mode==="malformed")socket.send(JSON.stringify({version,type:"attach",room:"forged",proof:"bad",principal:"forged"}));};
      socket.onmessage=e=>messages.push(e.data as string);socket.onclose=e=>{clearTimeout(timer);done({messages,code:e.code});};
    }),{version:ONLINE_VERSION,mode});
    assert.equal(result.code,1008);assert(result.messages.every(text=>JSON.parse(text).type==="resyncRequired"));
  }
  record("WebSocket origin/protocol rejection and bounded unauthenticated first-frame deadline without room data");
  // Lose a real successful HTTP response while retaining exact committed intention.
  const sent:string[]=[];let lose=true;
  await red.route("**/api/online",async route=>{const body=route.request().postDataJSON() as {type:string;id?:string};if(body.type==="command"){
    sent.push(body.id!);if(lose){lose=false;await route.fetch();await route.abort("failed");return;}}await route.continue();});
  await red.getByRole("button",{name:"d2 Red Pawn",exact:true}).click();
  await red.getByRole("button",{name:/^d3/}).click();
  await expect(red.getByTestId("online-boundary")).toContainText("Command 1",{timeout:20000});
  await expect(red.getByTestId("pending-command")).toHaveCount(0,{timeout:20000});assert(sent.length>=2);assert.equal(new Set(sent).size,1);
  await red.unroute("**/api/online");
  const receipt=await request(redContext,{type:"command",room,id:sent[0],expectedCommand:0,action:{type:"move",from:17,to:31}},redProof);
  assert.equal(receipt.type,"receipt");
  const conflict=await request(redContext,{type:"command",room,id:sent[0],expectedCommand:0,action:{type:"resign"}},redProof);assert(conflict.type==="error"&&conflict.code==="conflict");
  const stale=await request(redContext,{type:"command",room,id:"stale-boundary",expectedCommand:0,action:{type:"resign"}},redProof);assert(stale.type==="error"&&stale.code==="stale");
  for(const page of pages)await expect(page.getByTestId("online-boundary")).toContainText("Command 1");
  const snapshots=await Promise.all(pages.map(lastSnapshot));assert.equal(new Set(snapshots.map(s=>s.stateHash)).size,1);
  record("lost response exact retry, conflict rejection and four-client canonical consistency",{commandId:sent[0],receipt,snapshot:snapshots[0]});
  await red.reload();await red.getByRole("button",{name:"Private multiplayer",exact:true}).click();await connected(red);assert.equal(await proof(red),redProof);
  await expect(red.getByTestId("online-boundary")).toContainText("Command 1");
  const observer=await redContext.newPage();await enter(observer);
  // Same guest, independent sessionStorage and proof. Join membership again explicitly.
  await observer.getByRole("textbox",{name:"Invitation",exact:true}).fill(invitation);await observer.getByRole("button",{name:"Join private room",exact:true}).click();await connected(observer);
  const takeovers:string[]=[];let loseTakeover=true;
  await observer.route("**/api/online",async route=>{const body=route.request().postDataJSON() as {type:string;id?:string};if(body.type==="takeControl"){
    takeovers.push(body.id!);if(loseTakeover){loseTakeover=false;await route.fetch();await route.abort("failed");return;}}await route.continue();});
  await expect(observer.getByTestId("online-control")).toContainText("Observer");await observer.getByRole("button",{name:"Take control",exact:true}).click();
  await expect(observer.getByTestId("online-control")).toContainText("Controller");await expect(red.getByTestId("online-control")).toContainText("Observer");
  await connected(observer);await expect.poll(()=>observer.evaluate(()=>JSON.parse(sessionStorage.getItem("li4chess.online.connection.v1")!).takeover)).toBeNull();
  assert(takeovers.length>=2);assert.equal(new Set(takeovers).size,1);
  const takeoverRetry=await request(redContext,{type:"takeControl",room,id:takeovers[0]},await proof(observer));
  assert(takeoverRetry.type==="control"&&takeoverRetry.control.controller&&takeoverRetry.control.generation===2);await observer.unroute("**/api/online");
  await red.getByRole("button",{name:"Take control",exact:true}).click();await expect(red.getByTestId("online-control")).toContainText("Controller");
  await expect(observer.getByTestId("online-control")).toContainText("Observer");await observer.getByRole("button",{name:"Take control",exact:true}).click();
  await expect(observer.getByTestId("online-control")).toContainText("Controller · generation 4");await expect(red.getByTestId("online-control")).toContainText("Observer");
  const old=await request(redContext,{type:"command",room,id:"old-tab",expectedCommand:1,action:{type:"resign"}},redProof);assert(old.type==="error"&&old.code==="unauthorized");
  record("refresh reauthentication, observer tabs, explicit takeover and stale controller rejection");
  const popupPromise=red.waitForEvent("popup");await red.evaluate(()=>{window.open("/","copied-tab");});const copied=await popupPromise;
  await copied.getByRole("button",{name:"Private multiplayer",exact:true}).click();await connected(copied);
  assert.notEqual(await proof(copied),redProof);await expect(copied.getByTestId("online-control")).toContainText("Observer");await copied.close();
  record("opener-copied session storage receives an independent observer proof");
  await contexts[order[1]].setOffline(true);await expect(pages[order[1]].getByTestId("online-status")).toContainText("recovering",{timeout:15000});
  await contexts[order[1]].setOffline(false);await connected(pages[order[1]]);await expect(pages[order[1]].getByTestId("online-boundary")).toContainText("Command 1");
  record("browser network interruption reconnects and resyncs");
  const blue=pages[order[1]],blueContext=contexts[order[1]];
  await sql("CREATE TRIGGER m3_05_interruption BEFORE INSERT ON commands BEGIN SELECT RAISE(ABORT, 'local persistence interruption'); END;");
  await blue.getByRole("button",{name:"b11 Blue Pawn",exact:true}).click();await blue.getByRole("button",{name:/^c11/}).click();
  await expect(blue.getByTestId("online-status")).toContainText("recovering",{timeout:15000});
  await expect(blue.getByTestId("online-timing")).toHaveText("Timing suspended");
  const suspendedClock=await blue.getByRole("region",{name:"Blue timing"}).textContent();
  await blue.waitForTimeout(350);assert.equal(await blue.getByRole("region",{name:"Blue timing"}).textContent(),suspendedClock,"Authoritative suspended balances do not count down");
  const pendingId=await blue.getByTestId("pending-command").textContent();assert(pendingId);
  for(const page of pages)await expect(page.getByTestId("online-boundary")).toContainText("Command 1");
  await blue.reload();await blue.getByRole("button",{name:"Private multiplayer",exact:true}).click();
  await expect(blue.getByTestId("pending-command")).toHaveText(pendingId);
  await sql("DROP TRIGGER m3_05_interruption;");
  await connected(blue);await expect(blue.getByTestId("online-boundary")).toContainText("Command 2",{timeout:20000});
  await expect(blue.getByTestId("pending-command")).toHaveCount(0,{timeout:20000});
  const recovered=await request(blueContext,{type:"command",room,id:pendingId,expectedCommand:1,action:{type:"move",from:141,to:142}},await proof(blue));assert.equal(recovered.type,"receipt");
  record("real D1 rollback suspends publication; browser refresh retains exact intention through alarm recovery",{id:pendingId,receipt:recovered,snapshot:await lastSnapshot(blue)});
  const observerProof=await proof(observer);
  await connected(observer);
  const terminal=await request(redContext,{type:"command",room,id:"terminal-resign",expectedCommand:2,action:{type:"resign"}},observerProof);assert.equal(terminal.type,"receipt");
  const duplicate=await request(redContext,{type:"command",room,id:"terminal-resign",expectedCommand:2,action:{type:"resign"}},observerProof);assert.deepEqual(duplicate,terminal);
  const terminalNew=await request(redContext,{type:"command",room,id:"terminal-new",expectedCommand:3,action:{type:"resign"}},observerProof);assert(terminalNew.type==="error"&&terminalNew.code==="terminal");
  for(const page of [...pages,observer])await expect(page.getByTestId("online-result")).toBeVisible();
  const final=await lastSnapshot(observer);assert.equal(final.state.position.result?.reason,"abort");
  record("out-of-turn resignation, terminal receipt retry and immutable result",{terminal,final});
  const beforeCookie=(await redContext.cookies())[0].value;
  const rotation=await request(redContext,{type:"rotate"});assert.equal(rotation.type,"session");assert.notEqual((await redContext.cookies())[0].value,beforeCookie);
  await expect(observer.getByTestId("online-status")).toContainText(/revoked|expired/);
  const revoked=await request(redContext,{type:"revoke"});assert.equal(revoked.type,"revoked");assert.equal((await redContext.cookies()).length,0);
  const liveGuest=contexts[order[1]],livePage=pages[order[1]],liveToken=(await liveGuest.cookies())[0].value;
  assert.equal((await request(liveGuest,{type:"revoke"})).type,"revoked");
  await expect(livePage.getByTestId("online-status")).toContainText(/revoked|expired/);
  const retiredCookie=await request(liveGuest,{type:"session"},undefined,{Cookie:`li4chess-local-guest=${liveToken}`});
  assert(retiredCookie.type==="error"&&retiredCookie.code==="revoked");
  record("credential rotation and revocation affect existing connections");
  await observer.screenshot({path:resolve(output,"online-terminal.png"),fullPage:true});
  // Fresh local databases, same maintained entry, short absolute TTL configuration.
  for(const c of contexts)await c.close();await stopRuntime(runtime.child);runtime=undefined;
  const expiryOutput=resolve(output,"expiry");await mkdir(expiryOutput);const expiryConfig=resolve(expiryOutput,"wrangler.json");
  const shortConfig=structuredClone(config);shortConfig.vars.GUEST_TTL_MS="12000";await writeFile(expiryConfig,JSON.stringify(shortConfig,null,2));
  await runNode(wrangler,["d1","migrations","apply","GAME_DB","--local","--config",expiryConfig,"--persist-to",resolve(expiryOutput,"runtime")],root,localEnv,data=>{log+=data;});
  runtime=await startRuntime(port,expiryOutput,artifact.producer.buildFingerprint!,data=>{log+=data;},expiryConfig);
  const expiryContexts:BrowserContext[]=[];for(let i=0;i<4;i++){const c:BrowserContext=await browser.newContext();expiryContexts.push(c);contexts.push(c);assert.equal((await request(c,{type:"issue"})).type,"session");}
  const expiringToken=(await expiryContexts[0].cookies())[0].value;
  const expiryLobby=await request(expiryContexts[0],{type:"create",id:"expiry-room"});assert(expiryLobby.type==="created");
  const expiryRoom=expiryLobby.lobby.room;for(let i=1;i<4;i++)assert.equal((await request(expiryContexts[i],{type:"join",invitation:expiryLobby.invitation})).type,"lobby");
  for(let i=0;i<4;i++){assert.equal((await request(expiryContexts[i],{type:"seat",room:expiryRoom,seat:i})).type,"lobby");assert.equal((await request(expiryContexts[i],{type:"ready",room:expiryRoom,ready:true})).type,"lobby");}
  const expiryPage=await expiryContexts[0].newPage();await expiryPage.goto(origin);await expiryPage.evaluate(room=>sessionStorage.setItem("li4chess.online.room",room),expiryRoom);
  await expiryPage.getByRole("button",{name:"Private multiplayer",exact:true}).click();await connected(expiryPage);
  await expect(expiryPage.getByTestId("online-status")).toContainText(/expired|revoked/,{timeout:15000});
  const expired=await request(expiryContexts[0],{type:"session"},undefined,{Cookie:`li4chess-local-guest=${expiringToken}`});assert(expired.type==="error"&&expired.code==="expired");
  record("absolute credential expiry closes existing authenticated socket and rejects the expired cookie");
  await stopRuntime(runtime.child);runtime=undefined;
  let inspected=false;
  for(const file of await readdir(resolve(output,"runtime"),{recursive:true})){if(!file.endsWith(".sqlite"))continue;const db=new DatabaseSync(resolve(output,"runtime",file),{readOnly:true});
    try{if(!db.prepare("SELECT name FROM sqlite_master WHERE name='guest_records'").get())continue;
      const rows=db.prepare("SELECT key,value FROM guest_records").all();const text=JSON.stringify(rows);for(const token of credentialTokens){assert(!text.includes(token));assert(text.includes(await sha256(token)));}
      inspected=true;record("actual SQLite guest store retains digests and lifecycle records without raw guest credentials",{rows:rows.length});
    }finally{db.close();}}
  assert(inspected,"Inspected actual guest SQLite storage");
  await verifyArtifact(true);
}catch(error){failure=error;}finally{
  try{await browser?.close();}catch(error){failure??=error;}finally{if(runtime)try{await stopRuntime(runtime.child);}catch(error){failure??=error;}}
  await writeFile(resolve(output,"runtime.log"),log);await writeFile(resolve(output,"observations.json"),JSON.stringify(observations,null,2));
  await writeFile(resolve(output,"summary.json"),JSON.stringify({passed:!failure,groups:observations.length,error:failure instanceof Error?failure.stack:failure??null,finishedAt:new Date().toISOString()},null,2));
}
if(failure)throw failure;process.stdout.write(`Multiplayer evidence: ${output}\n`);
