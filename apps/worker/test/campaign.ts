import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { chromium, expect, type BrowserContext, type Page, type Response as BrowserResponse, type Request as BrowserRequest, type ConsoleMessage } from "@playwright/test";
import { legalMoves, localSquare, PieceType, resignPlayer, type PlayerColor } from "@li4chess/engine";
import { ONLINE_VERSION, parseOnlineResponse, engineState, readReplay, equalCanonical, canonicalJson } from "@li4chess/protocol";
import type { OnlineResponse, OnlineSnapshot, ReplayEnvelopeV2, ReplayEventV2 } from "@li4chess/protocol";
import { creationBoundary, digest, exactReader, prepareCommand } from "@li4chess/persistence/model";
import type { GameHeader, CommandRecord, Receipt, Boundary, Prepared } from "@li4chess/persistence/model";
import { runtimeEnvironment } from "@li4chess/protocol/node";
import { root, packageRoot, assets, require, verifyArtifact, freePort, runNode, startRuntime, stopRuntime, wrangler, localEnv, handleSignals } from "../scripts/shared.js";
import { captureSourceMap } from "./campaign-source.js";
import { campaignHttp, sanitizeCampaign, campaignJson } from "./campaign-http.js";

handleSignals();
const artifact = await verifyArtifact(true);
const output = resolve(process.env.M3_06_OUTPUT ?? resolve(root, "arena-results", `m3-06-${Date.now()}`));
await mkdir(dirname(output), { recursive: true }); await mkdir(output);
await captureSourceMap(root, output, artifact.producer);
const port = await freePort(), origin = `http://127.0.0.1:${port}`;
const key = randomBytes(32).toString("hex");
const selected = (process.env.M3_06_CASES ?? "ordinary,endings,recovery,clocks,incidents,auth").split(",");
assert(selected.every(s => ["ordinary","endings","recovery","clocks","incidents","auth","replay","rematch"].includes(s)), "Unknown campaign group");
const browser = await chromium.launch();
const observations: unknown[] = [];
const secrets = new Set<string>([key]);
let log = "", failure: unknown, starts = 0;
let runtime: Awaited<ReturnType<typeof startRuntime>> | undefined;
let runDirectory = "", configPath = "";
const contexts = new Set<BrowserContext>();
const names = ["Red", "Blue", "Yellow", "Green"];
const record = (name: string, data: object = {}) => { observations.push({ name, ...data }); process.stdout.write(`PASS ${name}\n`); };
const same = (a: unknown, b: unknown) => assert(equalCanonical(a, b), "Canonical equality");
async function request(context: BrowserContext, body: object, proof?: string): Promise<OnlineResponse> {
  const response = await context.request.post(`${origin}/api/online`, { ...campaignHttp, headers: { ...campaignHttp.headers,
    Origin: origin, "Content-Type": "application/json", "X-Li4chess-Protocol": ONLINE_VERSION,
    ...(proof ? { "X-Li4chess-Connection": proof } : {}) }, data: { version: ONLINE_VERSION, ...body } });
  return parseOnlineResponse(await response.json());
}
async function admin<T = unknown>(body: object): Promise<T> {
  const response = await fetch(`${origin}/__m3-06`, { method: "POST", headers: { "Content-Type": "application/json", "X-M3-06-Key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json() as { result: T }).result;
}
async function start(name: string, fixture = false, scenario = "ordinary", initialMs = 600000, ttlMs = 3600000) {
  if (runtime) { await stopRuntime(runtime.child); runtime = undefined; }
  runDirectory = resolve(output, name); await mkdir(runDirectory);
  const config = JSON.parse(await readFile(resolve(packageRoot, "wrangler.multiplayer.local.jsonc"), "utf8"));
  config.main = resolve(packageRoot, fixture ? "test/campaign-worker.ts" : "src/multiplayer-local.ts");
  config.assets.directory = assets; config.vars.ONLINE_ORIGIN = origin;
  config.vars.ONLINE_INITIAL_MS = String(initialMs); config.vars.ONLINE_INCREMENT_MS = "50";
  config.vars.GUEST_TTL_MS = String(ttlMs);
  if (fixture) { config.vars.M3_06_KEY = key; config.vars.M3_06_SCENARIO = scenario; }
  config.d1_databases[0].migrations_dir = resolve(root, "packages/persistence/migrations");
  configPath = resolve(runDirectory, "wrangler.json"); await writeFile(configPath, JSON.stringify(config));
  const retained = structuredClone(config); if (fixture) retained.vars.M3_06_KEY = "[ephemeral; omitted]";
  await writeFile(resolve(output, `${name}.configuration.json`), JSON.stringify(retained, null, 2));
  await runNode(wrangler, ["d1", "migrations", "apply", "GAME_DB", "--local", "--config", configPath, "--persist-to", resolve(runDirectory, "runtime")], root, localEnv, s => { log += s; });
  runtime = await startRuntime(port, runDirectory, artifact.producer.buildFingerprint!, s => { log += s; }, configPath); starts++;
}
async function restart() {
  assert(runtime); await stopRuntime(runtime.child); runtime = undefined;
  runtime = await startRuntime(port, runDirectory, artifact.producer.buildFingerprint!, s => { log += s; }, configPath); starts++;
}
async function observe(context: BrowserContext) {
  await context.addInitScript({content: `(() => {
    const target = window; target.__snapshots = []; target.__socketCount = 0; target.__sockets = [];
    const remember = m => { if (m.type === "snapshot") target.__snapshots.push(m.snapshot); };
    const Original = window.WebSocket;
    window.WebSocket = class extends Original { constructor(url, protocols) { super(url, protocols); target.__socketCount++; target.__sockets.push(this); this.addEventListener("message", e => { try { remember(JSON.parse(e.data)); } catch {} }); } };
    const originalFetch = window.fetch;
    window.fetch = async (...args) => { const response = await originalFetch(...args); void response.clone().json().then(remember).catch(() => undefined); return response; };
  })();`});
}
async function connected(page: Page) {
  await expect(page.getByTestId("online-status")).toContainText(/connected|terminal/, { timeout: 20000 });
  await expect(page.getByTestId("online-control")).toContainText(/Controller|Observer/);
}
async function snapshot(page: Page): Promise<OnlineSnapshot> {
  const s = await page.evaluate(() => {
    const shown = document.querySelector('[data-testid="online-boundary"]')?.textContent;
    return (window as unknown as { __snapshots: OnlineSnapshot[] }).__snapshots.slice().reverse().find(s => shown === `Command ${s.command} · ${s.stateHash}`);
  });
  const r = await parseOnlineResponse({ version: ONLINE_VERSION, type: "snapshot", snapshot: s }); assert(r.type === "snapshot"); return r.snapshot;
}
async function proof(page: Page): Promise<string> {
  const value = await page.evaluate(() => JSON.parse(sessionStorage.getItem("li4chess.online.connection.v1")!).proof as string);
  secrets.add(value); return value;
}
let entryFailure=0;
async function enter(page: Page) {
  const events:unknown[]=[];const remember=(value:unknown)=>{if(events.length<40)events.push(value);};
  const pathname=(url:string)=>{try{return new URL(url).pathname;}catch{return "[invalid URL]";}};
  const pageError=(error:Error)=>remember({type:"pageerror",message:error.message.slice(0,2000)});
  const consoleError=(message:ConsoleMessage)=>{if(message.type()==="error")remember({type:"console",message:message.text().slice(0,2000)});};
  const crash=()=>remember({type:"crash"});
  const failed=(request:BrowserRequest)=>remember({type:"requestfailed",path:pathname(request.url()),failure:request.failure()?.errorText});
  const response=(r:BrowserResponse)=>{if(["document","script","stylesheet"].includes(r.request().resourceType()))remember({type:"response",path:pathname(r.url()),status:r.status(),contentType:r.headers()["content-type"]??null});};
  page.on("pageerror",pageError);page.on("console",consoleError);page.on("crash",crash);page.on("requestfailed",failed);page.on("response",response);
  try{await page.goto(origin);await page.getByRole("button",{name:"Private multiplayer",exact:true}).click();}
  catch(error){
    const name=`browser-entry-failure-${entryFailure++}`;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const document=await Promise.race([page.evaluate(()=>({rootChildren:window.document.getElementById("root")?.childElementCount??null,readyState:window.document.readyState,
      buttons:Array.from(window.document.querySelectorAll("button")).slice(0,30).map(button=>(button.textContent??"").slice(0,100))})).catch(()=>null),
      new Promise<{timedOut:true}>(resolve=>{timer=setTimeout(()=>resolve({timedOut:true}),3000);})]);clearTimeout(timer);
    await writeFile(resolve(output,`${name}.json`),campaignJson({events,document,path:pathname(page.url()),runtimeExitCode:runtime?.child.exitCode,runtimeSignal:runtime?.child.signalCode},secrets)).catch(()=>undefined);
    await page.screenshot({path:resolve(output,`${name}.png`),mask:[page.locator("input"),page.locator("code")],animations:"disabled",timeout:5000}).catch(()=>undefined);
    throw error;
  }finally{page.off("pageerror",pageError);page.off("console",consoleError);page.off("crash",crash);page.off("requestfailed",failed);page.off("response",response);}
}
type Game = { pages: Page[]; guests: BrowserContext[]; room: string; invitation: string };
type Inspection = {records:{pending?:Prepared;cache:Boundary;timing:{value:OnlineSnapshot["timing"]};incident?:unknown};hit:{stage:string}|null};
async function game(): Promise<Game> {
  const guests: BrowserContext[] = [], pages: Page[] = [];
  for (let seat = 0; seat < 4; seat++) {
    const c = await browser.newContext(); contexts.add(c); guests.push(c); await observe(c);
    const p = await c.newPage(); pages.push(p); await enter(p);
    await p.getByRole("button", { name: "Create guest session", exact: true }).click();
    await expect(p.getByText("Guest session active", { exact: true })).toBeVisible();
    for (const cookie of await c.cookies()) secrets.add(cookie.value);
  }
  await pages[0].getByRole("button", { name: "Create private room", exact: true }).click();
  const invitation = await pages[0].getByRole("textbox", { name: "Share invitation", exact: true }).inputValue(); secrets.add(invitation);
  const room = await pages[0].getByTestId("online-room").textContent(); assert(room);
  for (let seat = 1; seat < 4; seat++) {
    await pages[seat].getByRole("textbox", { name: "Invitation", exact: true }).fill(invitation);
    await pages[seat].getByRole("button", { name: "Join private room", exact: true }).click();
    await expect(pages[seat].getByTestId("online-room")).toHaveText(room);
  }
  for (let seat = 0; seat < 4; seat++) {
    await pages[seat].getByRole("button", { name: `${names[seat]} — Available`, exact: true }).click();
    await pages[seat].getByRole("button", { name: "Ready", exact: true }).click();
  }
  for (const p of pages) await connected(p);
  const sessions = await Promise.all(guests.map(c => request(c, { type: "session" })));
  assert(sessions.every(s => s.type === "session")); assert.equal(new Set(sessions.map(s => s.type === "session" && s.principal)).size, 4);
  return { pages, guests, room, invitation };
}
async function closeGame(g: Game) { for (const c of g.guests) { await c.close(); contexts.delete(c); } }
async function apiReplay(guest:BrowserContext,room:string) {
  let response=await request(guest,{type:"replay",room,cursor:null});assert(response.type==="replay"&&response.page.header,JSON.stringify(response));
  const header=response.page.header,events:ReplayEventV2[]=[];let result=header.result;
  const head=response.page.head,principal=response.page.principal,generation=response.page.generation;
  while(response.page.next!==null){
    const cursor=response.page.next;
    const next=await request(guest,{type:"replay",room,cursor});assert(next.type==="replay");
    // Repeating the same authenticated page must return the exact prior response.
    same(await request(guest,{type:"replay",room,cursor}),next);
    same(next.page.head,head);assert.equal(next.page.principal,principal);assert.equal(next.page.generation,generation);
    events.push(...next.page.events);response=next;
  }
  const last=events.at(-1);if(last?.type==="terminal"||last?.type==="abort")result=last.result;
  const replay={...header,events,result,finalStateHash:head.stateHash};await readReplay(replay);return replay;
}
async function takeovers(g: Game) {
  for (let seat = 0; seat < 4; seat++) {
    const original = g.pages[seat], c = g.guests[seat], oldProof = await proof(original);
    const observer = await c.newPage(); await enter(observer);
    await observer.getByRole("textbox", {name:"Invitation",exact:true}).fill(g.invitation);
    await observer.getByRole("button", {name:"Join private room",exact:true}).click(); await connected(observer);
    await expect(observer.getByTestId("online-control")).toContainText("Observer");
    let blocked = true, first = true; const ids: string[] = [];
    await observer.route("**/api/online", async route => {
      const b = route.request().postDataJSON() as {type:string;id:string};
      if (b.type === "takeControl") { ids.push(b.id); if (blocked) { if (first) await route.fetch(); first = false; await route.abort("failed"); return; } }
      await route.continue();
    });
    await observer.getByRole("button", {name:"Take control",exact:true}).click();
    await expect(observer.getByTestId("pending-takeover")).toBeVisible();
    const id = await observer.getByTestId("pending-takeover").textContent(); assert(id);
    observer.once("dialog", dialog => { assert.equal(dialog.type(), "confirm"); void dialog.dismiss(); });
    await observer.getByRole("button", {name:"Leave online room",exact:true}).click();
    await expect(observer.getByTestId("pending-takeover")).toHaveText(id);
    await observer.reload(); await observer.getByRole("button", {name:"Private multiplayer",exact:true}).click();
    await expect(observer.getByTestId("pending-takeover")).toHaveText(id); blocked = false;
    await expect(observer.getByTestId("pending-takeover")).toHaveCount(0, {timeout:20000});
    await expect(observer.getByTestId("online-control")).toContainText("Controller · generation 2");
    await expect(original.getByTestId("online-control")).toContainText("Observer");
    assert.equal(new Set(ids).size, 1); assert(ids.length >= 2);
    const fenced = await request(c, {type:"command",room:g.room,id:`old-tab-${seat}`,expectedCommand:0,action:{type:"resign"}}, oldProof);
    assert(fenced.type === "error" && fenced.code === "unauthorized");
    await observer.unroute("**/api/online");
    await original.getByRole("button", {name:"Take control",exact:true}).click();
    await expect(original.getByTestId("online-control")).toContainText("Controller · generation 3");
    await observer.getByRole("button", {name:"Leave online room",exact:true}).click(); await observer.close();
    record(`B04 seat ${seat}: lost takeover, cancelled abandonment, refresh and old-tab fence`, {id,generation:3});
  }
}
async function converge(g: Game, command: number) {
  for (const page of g.pages) await expect(page.getByTestId("online-boundary")).toContainText(`Command ${command} ·`, { timeout: 20000 });
  const values = await Promise.all(g.pages.map(snapshot));
  for (let i = 0; i < values.length; i++) await expect(g.pages[i].getByTestId("online-boundary")).toHaveText(`Command ${command} · ${values[i].stateHash}`);
  for (const s of values) { assert.equal(s.command, command); same(s.state, values[0].state); assert.equal(s.stateHash, values[0].stateHash); assert.equal(s.chainHash, values[0].chainHash); assert.equal(s.event, values[0].event); same(s.producer, artifact.producer); }
  return values[0];
}
async function freshReconnect(g: Game) {
  const elapsedMs: number[] = [];
  for (const page of g.pages) {
    const started = performance.now();
    const before = await page.evaluate(() => ({ sockets: (window as unknown as {__socketCount:number}).__socketCount, snapshots: (window as unknown as {__snapshots:unknown[]}).__snapshots.length }));
    await page.getByRole("button", {name:"Reconnect and resync",exact:true}).click();
    // Sustained outages reach the maintained 8s backoff; a manual reconnect
    // restarts that delay, then authenticates. Match connected()'s 20s bound.
    try { await expect.poll(() => page.evaluate(() => (window as unknown as {__socketCount:number}).__socketCount), {timeout:20000}).toBeGreaterThan(before.sockets); }
    catch(error) { throw new Error(`Replacement socket did not open: ${await page.getByTestId("online-status").textContent()}`,{cause:error}); }
    await expect.poll(() => page.evaluate(() => (window as unknown as {__snapshots:unknown[]}).__snapshots.length), {timeout:20000}).toBeGreaterThan(before.snapshots);
    await connected(page);
    elapsedMs.push(performance.now()-started);
  }
  observations.push({name:"fresh replacement connection observations",room:g.room,elapsedMs});
}
const squareName = (square: number) => `${String.fromCharCode(97 + square % 14)}${Math.floor(square / 14) + 1}`;
async function clickMove(page: Page, from: number, to: number) {
  await page.getByRole("button", { name: new RegExp(`^${squareName(from)} `) }).click();
  await page.getByRole("button", { name: new RegExp(`^${squareName(to)}(?: |$)`) }).click();
}
async function uiMove(g: Game, from: number, to: number) {
  const before = await snapshot(g.pages[0]), state = engineState(before.state);
  assert(legalMoves(state).some(m => m.from === from && m.to === to), "Driver uses an engine-legal intention");
  await clickMove(g.pages[state.turn], from, to); return converge(g, before.command + 1);
}
async function action(g: Game, seat: number, action: { type: "resign" | "claimWin" }, id: string) {
  const before = await snapshot(g.pages[0]);
  const r = await request(g.guests[seat], { type: "command", room: g.room, id, expectedCommand: before.command, action }, await proof(g.pages[seat]));
  assert.equal(r.type, "receipt"); return r;
}
async function database(): Promise<DatabaseSync> {
  for (const path of await readdir(resolve(runDirectory, "runtime"), { recursive: true })) {
    if (!path.endsWith(".sqlite")) continue;
    const db = new DatabaseSync(resolve(runDirectory, "runtime", path), { readOnly: true });
    if (db.prepare("SELECT name FROM sqlite_master WHERE name='games'").get()) return db;
    db.close();
  }
  throw new Error("Canonical local D1 not found");
}
async function audit(g: Game, name: string, classification: "ordinary-complete" | "fixture-assisted" | "opening-abort") {
  for (const p of g.pages) await expect(p.getByTestId("online-result")).toBeVisible({ timeout: 20000 });
  const final = await snapshot(g.pages[0]); await converge(g, final.command);
  const db = await database();
  try {
    const row = db.prepare("SELECT * FROM games WHERE id=?").get(g.room)!;
    const header = JSON.parse(String(row.header_json)) as GameHeader;
    const commands = db.prepare("SELECT record_json,receipt_json FROM commands WHERE game_id=? ORDER BY seq").all(g.room).map(r => ({ record: JSON.parse(String(r.record_json)) as CommandRecord, receipt: JSON.parse(String(r.receipt_json)) as Receipt }));
    const events = db.prepare("SELECT event_json FROM events WHERE game_id=? ORDER BY seq").all(g.room).map(r => JSON.parse(String(r.event_json)) as ReplayEventV2);
    const results = db.prepare("SELECT result_json FROM results WHERE game_id=?").all(g.room);
    assert.equal(results.length, 1); assert.equal(row.command_seq, final.command); assert.equal(row.event_seq, final.event);
    assert.equal(row.state_hash, final.stateHash); assert.equal(row.chain_hash, final.chainHash); assert.equal(row.quarantine, null);
    let boundary = await creationBoundary(header, exactReader(artifact.producer));
    for (const c of commands) {
      const { prepared: p, next } = await prepareCommand(boundary, c.record.owner, c.record.input, artifact.producer, c.record.format === "li4chess-d1-command-v2" ? c.record.timing : undefined);
      same(p.record, c.record); same(p.receipt, c.receipt); same(p.events, events.slice(c.record.firstEvent - 1, c.record.lastEvent));
      boundary = next;
    }
    same(boundary.state, final.state);
    const replay: ReplayEnvelopeV2 = { ...header.replay, events, result: JSON.parse(String(results[0].result_json)), finalStateHash: final.stateHash };
    same((await readReplay(replay)).state, final.state); same(replay.engineBuild, artifact.producer);
    if (classification === "ordinary-complete") { assert.equal(replay.game.setupId, "li4chess-modern-ffa-setup-v1"); assert.equal(replay.game.sourceReplayHash, undefined); }
    else if (classification === "fixture-assisted") {
      assert(replay.game.setupId.startsWith("li4chess-ffa-checkpoint-v1:"));
      const {sourceReplay} = await admin<{sourceReplay:ReplayEnvelopeV2}>({op:"inspect",room:g.room});
      assert.equal(await digest(sourceReplay), replay.game.sourceReplayHash); await readReplay(sourceReplay);
      same(sourceReplay.initialState, replay.initialState);
      await writeFile(resolve(output, `${name}.source.replay.json`), JSON.stringify(sourceReplay));
    }
    await writeFile(resolve(output, `${name}.replay.json`), JSON.stringify(replay));
    await writeFile(resolve(output, `${name}.canonical.json`), JSON.stringify({ header, commands, final, clients: await Promise.all(g.pages.map(snapshot)) }));
    for (let seat=0;seat<4;seat++) {
      const page=g.pages[seat],control=await page.getByTestId("online-control").textContent();
      const download=page.waitForEvent("download"); await page.getByRole("button",{name:"Download replay",exact:true}).click();
      const file=await download;const path=resolve(output,`${name}.member-${seat}.replay.json`);await file.saveAs(path);
      const exported=JSON.parse(await readFile(path,"utf8")) as ReplayEnvelopeV2;
      same(exported,replay);same((await readReplay(exported)).state,final.state);
      await expect(page.getByTestId("replay-download-status")).toContainText("Verified replay download started");
      await expect(page.getByTestId("online-control")).toHaveText(control!);
    }
    record(`${name}: four authenticated result downloads equal canonical replay`,{room:g.room,producer:replay.engineBuild,sourceReplayHash:replay.game.sourceReplayHash??null});
    const local=await g.guests[0].newPage();await local.goto(origin);await local.getByRole("button",{name:"Start game",exact:true}).click();
    await local.getByLabel("Import replay",{exact:true}).setInputFiles({name:"private.replay.json",mimeType:"application/json",buffer:Buffer.from(canonicalJson(replay))});
    await expect(local.getByTestId("game-result")).toBeVisible();
    const localDownload=local.waitForEvent("download");await local.getByRole("button",{name:"Export replay",exact:true}).click();
    const localFile=await localDownload;const localPath=resolve(output,`${name}.local-import.replay.json`);await localFile.saveAs(localPath);
    const imported=JSON.parse(await readFile(localPath,"utf8")) as ReplayEnvelopeV2;
    assert.equal(imported.game.sourceReplayHash,await digest(replay));same(imported.engineBuild,artifact.producer);
    same((await readReplay(imported)).state.position,final.state.position);await local.close();
    for (let seat = 0; seat < 4; seat++) {
      const rejected = await request(g.guests[seat], { type: "command", room: g.room, id: `terminal-new-${seat}`, expectedCommand: final.command, action: { type: "resign" } }, await proof(g.pages[seat]));
      assert(rejected.type === "error" && rejected.code === "terminal" && !rejected.ambiguous);
      await g.pages[seat].reload(); await g.pages[seat].getByRole("button", { name: "Private multiplayer", exact: true }).click(); await connected(g.pages[seat]);
    }
    same((await converge(g, final.command)).state, final.state);
    await freshReconnect(g);
    const terminalClients = await Promise.all(g.pages.map(snapshot));
    for (const client of terminalClients) {
      assert.equal(client.timing.phase,"terminal"); assert.equal(client.timing.deadline,null); assert.equal(client.timing.activeSeat,null);
      same(client.timing.remainingMs, final.timing.remainingMs); same(client.timing.disconnectRemainingMs, final.timing.disconnectRemainingMs);
    }
    for (const page of g.pages) for (const p of final.state.position.result!.placements)
      await expect(page.getByTestId("online-result")).toContainText(`${names[p.color]} — place ${p.place}, ${p.score} points`);
    await g.pages[0].screenshot({path:resolve(output,`${name}.png`),fullPage:true});
    record(name, { classification, commands: commands.length, events: events.length, result: final.state.position.result, randomActions: final.state.position.randomActions, stateHash: final.stateHash, chainHash: final.chainHash, replay: `${name}.replay.json` });
    return { final, commands };
  } finally { db.close(); }
}

try {
  if (selected.includes("ordinary")) {
  await start("ordinary");
  const g = await game();
  const originalSnapshot = await snapshot(g.pages[0]);
  const retained: { seat: number; body: object; receipt: OnlineResponse }[] = [];
  for (let ply = 0; ply < 16; ply++) {
    const seat = ply % 4 as PlayerColor, outward = Math.floor(ply / 4) % 2 === 0;
    const from = localSquare(seat, outward ? 1 : 0, outward ? 0 : 2), to = localSquare(seat, outward ? 0 : 1, outward ? 2 : 0);
    if (ply < 4) {
      const page = g.pages[seat], c = g.guests[seat], savedProof = await proof(page);
      await c.setOffline(true); await expect(page.getByTestId("online-status")).toContainText("recovering");
      await c.setOffline(false); await connected(page);
      await page.reload(); await page.getByRole("button", { name: "Private multiplayer", exact: true }).click(); await connected(page); assert.equal(await proof(page), savedProof);
      let blocked = true, first = true; const ids: string[] = [];
      await c.route("**/api/online", async route => {
        const body = route.request().postDataJSON() as { type: string; id?: string };
        if (body.type === "command") { ids.push(body.id!); if (blocked) { if (first && seat % 2 === 1) await route.fetch(); first = false; await route.abort("failed"); return; } }
        await route.continue();
      });
      await clickMove(page, from, to); await expect(page.getByTestId("pending-command")).toBeVisible();
      const id = await page.getByTestId("pending-command").textContent(); assert(id);
      await expect.poll(() => ids.length).toBeGreaterThan(0);
      await page.reload(); await page.getByRole("button", { name: "Private multiplayer", exact: true }).click();
      await expect(page.getByTestId("pending-command")).toHaveText(id); blocked = false;
      await connected(page); await expect(page.getByTestId("pending-command")).toHaveCount(0, { timeout: 20000 });
      assert(ids.length >= 2); assert.equal(new Set(ids).size, 1); await c.unroute("**/api/online");
      await converge(g, ply + 1);
      const body = { type: "command", room: g.room, id, expectedCommand: ply, action: { type: "move", from, to } };
      const receipt = await request(c, body, await proof(page)); assert.equal(receipt.type, "receipt"); retained.push({ seat, body, receipt });
      const conflict = await request(c, { ...body, action: { type: "resign" } }, await proof(page)); assert(conflict.type === "error" && conflict.code === "conflict");
      const stale = await request(c, { ...body, id: `stale-${seat}` }, await proof(page)); assert(stale.type === "error" && stale.code === "stale");
      const outOfTurn = await request(c, { ...body, id: `out-of-turn-${seat}`, expectedCommand: ply + 1, action: { type: "move", from: to, to: from } }, await proof(page)); assert(outOfTurn.type === "error" && outOfTurn.code === "invalid");
      record(`B01/B02 seat ${seat}: offline, refresh and ${seat % 2 ? "post-commit" : "pre-delivery"} loss`, { id, receipt });
    } else await uiMove(g, from, to);
    if (ply === 7) {
      const older = await snapshot(g.pages[0]);
      await restart(); await freshReconnect(g); await converge(g, 8); record("R01 ordinary whole-runtime restart preserves four guests and canonical prefix");
      for (const page of g.pages) {
        const count = await page.evaluate(() => (window as unknown as {__socketCount:number}).__socketCount);
        await page.evaluate(old => {
          const sockets = (window as unknown as {__sockets:WebSocket[]}).__sockets;
          sockets[0].dispatchEvent(new Event("close"));
          sockets.at(-1)!.dispatchEvent(new MessageEvent("message", {data:JSON.stringify({version:"li4chess-online-v1",type:"snapshot",snapshot:old})}));
        }, originalSnapshot);
        await page.waitForTimeout(100);
        await expect(page.getByTestId("online-boundary")).toHaveText(`Command 8 · ${older.stateHash}`);
        assert.equal(await page.evaluate(() => (window as unknown as {__socketCount:number}).__socketCount),count);
      }
      record("B03 all-seat delayed old-transport callbacks cannot close replacement connections");
    }
  }
  const complete = await audit(g, "G01-ordinary-repetition", "ordinary-complete");
  assert.equal(complete.final.state.position.result?.reason, "repetition");
  assert.deepEqual(complete.final.state.position.result?.placements.map(p => [p.score, p.place, p.meanRank]), Array(4).fill([10, 1, 2.5]));
  for (const r of retained) same(await request(g.guests[r.seat], r.body, await proof(g.pages[r.seat])), r.receipt);
  record("B02 original all-seat receipts and admission survive later commands, terminal and refresh");
  await closeGame(g);

  const walking = await game();
  await takeovers(walking);
  for (let ply = 0; ply < 12; ply++) {
    const s = engineState((await snapshot(walking.pages[0])).state), moves = legalMoves(s);
    const move = moves.find(m => m.from === localSquare(s.turn, 4, 1)) ?? moves.find(m => m.piece.type === PieceType.Pawn && !m.captured);
    assert(move); await uiMove(walking, move.from, move.to);
  }
  for (const seat of [0, 1]) {
    const before = await snapshot(walking.pages[0]); assert.equal(before.state.position.turn, seat);
    const test = resignPlayer(engineState(before.state), seat as PlayerColor); assert(legalMoves(test).some(m => m.piece.type === PieceType.King));
    await action(walking, seat, { type: "resign" }, `walking-resign-${seat}`);
    await expect.poll(async () => (await snapshot(walking.pages[0])).state.position.randomActions.length, { timeout: 20000 }).toBe(seat + 1);
    await converge(walking, before.command + 2);
  }
  await action(walking, 2, { type: "resign" }, "walking-terminal");
  const walkingResult = await audit(walking, "G02-ordinary-walking-survivor", "ordinary-complete");
  assert.equal(walkingResult.final.state.position.randomActions.length, 2);
  assert.equal(walkingResult.final.state.position.result?.reason, "elimination");
  assert.equal(walkingResult.final.state.position.players[3].score, 60);
  await closeGame(walking);
  }

  if (selected.includes("endings")) {
  for (const scenario of ["claim", "mate", "stalemate", "insufficient", "fifty-move"] as const) {
    await start(`fixture-${scenario}`, true, scenario); const f = await game();
    if (scenario === "claim") {
      assert.equal((await snapshot(f.pages[0])).state.position.turn, 1);
      f.pages[0].once("dialog", d => void d.accept());
      await f.pages[0].getByRole("button", {name:"Claim Win",exact:true}).click();
    } else if (scenario === "mate" || scenario === "stalemate") {
      const initial = await snapshot(f.pages[0]);
      await uiMove(f, 84, 98); await uiMove(f, 148, 149); const passive = await uiMove(f, 111, 110);
      assert.equal(passive.state.position.players[0].status, scenario === "mate" ? "checkmated" : "stalemated");
      assert.equal(passive.state.position.turn, 1);
      same(passive.state.position.board.filter(p => p?.owner === 0), initial.state.position.board.filter(p => p?.owner === 0));
      await uiMove(f,5,32); await uiMove(f,149,150); const beforeCapture = await uiMove(f,110,109);
      const captured = await uiMove(f,32,3);
      assert.equal(captured.state.position.board[3]?.owner,1);
      assert.equal(captured.state.position.players[1].score,beforeCapture.state.position.players[1].score);
      assert.equal(captured.state.position.awardLedger.length,beforeCapture.state.position.awardLedger.length);
      assert.equal(captured.state.position.turn,2);
      await action(f, 3, {type:"resign"}, `${scenario}-resign-3`); await converge(f, 8);
      await action(f, 2, {type:"resign"}, `${scenario}-resign-2`);
    } else {
      await uiMove(f, 7, 8); if (scenario === "fifty-move") await uiMove(f, 84, 98);
    }
    const {final} = await audit(f, `G-fixture-${scenario}`, "fixture-assisted");
    assert.equal(final.state.position.result?.reason, scenario === "claim" ? "claim-win" : ["mate", "stalemate"].includes(scenario) ? "elimination" : scenario === "insufficient" ? "insufficient-material" : "fifty-move");
    if (scenario === "claim") { assert.equal(final.state.position.players[0].score, 21); assert.equal(final.state.position.players[1].score, 20); assert.equal(final.state.position.result?.winner,2); assert.equal(final.state.position.players[2].score,100); }
    if (["insufficient","fifty-move"].includes(scenario)) {
      assert.deepEqual(final.state.position.result?.placements.map(p=>[p.score,p.place,p.meanRank]),Array(4).fill([10,1,2.5]));
      assert.equal(final.state.position.awardLedger.length,4); assert(final.state.position.awardLedger.every(a=>a.delta === 10));
    }
    await closeGame(f);
  }
  }

  if (selected.includes("recovery")) {
  await start("recovery", true); const recovery = await game();
  const stages = ["before-prepare", "after-prepare", "after-d1", "after-finalize", "before-activation", "after-activation"];
  const recoveredReceipts: {seat:number;body:object;receipt:OnlineResponse}[] = [];
  for (let ply = 0; ply < 16; ply++) {
    const seat = ply % 4 as PlayerColor, outward = Math.floor(ply / 4) % 2 === 0;
    const from = localSquare(seat, outward ? 1 : 0, outward ? 0 : 2), to = localSquare(seat, outward ? 0 : 1, outward ? 2 : 0);
    if (ply < stages.length) {
      const stage = stages[ply], page = recovery.pages[seat];
      const before = await admin<Inspection>({op:"inspect",room:recovery.room}), admittedTime=before.records.timing.value.accountedAt;
      await admin({op:"time",room:recovery.room,now:admittedTime});
      await admin({op:"fault",room:recovery.room,fault:{stage,mode:"pause"}});
      await clickMove(page, from, to); await expect(page.getByTestId("pending-command")).toBeVisible();
      const id = await page.getByTestId("pending-command").textContent(); assert(id);
      await expect.poll(async () => (await admin<Inspection>({op:"inspect",room:recovery.room})).hit?.stage).toBe(stage);
      const interrupted = await admin<Inspection>({op:"inspect",room:recovery.room});
      const db = await database(); const canonical = db.prepare("SELECT command_seq,event_seq,state_hash,chain_hash FROM games WHERE id=?").get(recovery.room); db.close();
      assert.equal(canonical?.command_seq, ["before-prepare","after-prepare"].includes(stage) ? ply : ply + 1);
      for (const p of recovery.pages) await expect(p.getByTestId("online-boundary")).toContainText(`Command ${ply} ·`);
      await writeFile(resolve(output, `R01-${stage}.json`), JSON.stringify({interrupted,canonical,id}));
      for (const c of recovery.guests) await c.setOffline(true);
      await restart(); await admin({op:"time",room:recovery.room,now:admittedTime+60000});
      for (const c of recovery.guests) await c.setOffline(false);
      await freshReconnect(recovery); const resumed = await converge(recovery, ply + 1);
      await expect(page.getByTestId("pending-command")).toHaveCount(0, {timeout:20000});
      if (interrupted.records.pending) same(resumed.state, interrupted.records.pending.finalState);
      const expectedBalances=[...before.records.timing.value.remainingMs];expectedBalances[seat]+=before.records.timing.value.policy.incrementMs;
      same(resumed.timing.remainingMs,expectedBalances);
      same(resumed.timing.disconnectRemainingMs,before.records.timing.value.disconnectRemainingMs);
      const body = {type:"command",room:recovery.room,id,expectedCommand:ply,action:{type:"move",from,to}};
      const receipt = await request(recovery.guests[seat],body,await proof(page)); assert(receipt.type === "receipt");
      if (interrupted.records.pending) same(receipt.receipt, interrupted.records.pending.receipt);
      recoveredReceipts.push({seat,body,receipt});
      record(`R01 ${stage}: exact durable boundary and retained browser intention recover`, {id,receipt,timing:resumed.timing,unavailableTimeMs:60000,expectedBalances});
    } else if (ply === 6) {
      await admin({op:"sql",room:recovery.room,sql:"CREATE TRIGGER m3_06_rollback BEFORE INSERT ON commands BEGIN SELECT RAISE(ABORT,'campaign D1 interruption'); END;"});
      const page = recovery.pages[seat]; await clickMove(page,from,to);
      await expect(page.getByTestId("online-timing")).toHaveText("Timing suspended");
      const id = await page.getByTestId("pending-command").textContent(); assert(id);
      const suspended = await admin<Inspection>({op:"inspect",room:recovery.room}); assert(suspended.records.pending);
      const clock = await page.getByRole("region",{name:`${names[seat]} timing`}).textContent();
      await page.waitForTimeout(350); assert.equal(await page.getByRole("region",{name:`${names[seat]} timing`}).textContent(),clock);
      await page.reload(); await page.getByRole("button",{name:"Private multiplayer",exact:true}).click();
      await expect(page.getByTestId("pending-command")).toHaveText(id);
      for (const c of recovery.guests) await c.setOffline(true);
      await restart(); await admin({op:"time",room:recovery.room,now:suspended.records.timing.value.accountedAt+60000});
      await admin({op:"sql",room:recovery.room,sql:"DROP TRIGGER m3_06_rollback"});
      for (const c of recovery.guests) await c.setOffline(false);
      await freshReconnect(recovery); const resumed = await converge(recovery, ply + 1);
      same(resumed.state, suspended.records.pending.finalState);
      same(resumed.timing.remainingMs,suspended.records.timing.value.remainingMs);
      same(resumed.timing.disconnectRemainingMs,suspended.records.timing.value.disconnectRemainingMs);
      const body = {type:"command",room:recovery.room,id,expectedCommand:ply,action:{type:"move",from,to}};
      const receipt = await request(recovery.guests[seat],body,await proof(page)); assert(receipt.type === "receipt"); same(receipt.receipt,suspended.records.pending.receipt);
      recoveredReceipts.push({seat,body,receipt});
      record("R02 D1 rollback freezes UI and exact prepare survives refresh plus whole-runtime restart",{id,receipt,admission:suspended.records.pending.record});
    } else await uiMove(recovery,from,to);
  }
  await audit(recovery,"R01-R02-recovered-repetition","ordinary-complete");
  for (const r of recoveredReceipts) same(await request(recovery.guests[r.seat],r.body,await proof(recovery.pages[r.seat])),r.receipt);
  await closeGame(recovery);
  }

  if (selected.includes("clocks")) {
  for (const mode of ["timeout", "disconnect"] as const) for (const mature of [false,true]) {
    await start(`${mode}-${mature ? "after-opening" : "opening"}`, true); const timed = await game();
    if (mature) for (let ply = 0; ply < 12; ply++) {
      const s = engineState((await snapshot(timed.pages[0])).state), moves = legalMoves(s);
      const m = moves.find(m => m.from === localSquare(s.turn,4,1)) ?? moves.find(m => m.piece.type === PieceType.Pawn && !m.captured); assert(m); await uiMove(timed,m.from,m.to);
    }
    if (mode === "disconnect") {
      await timed.guests[0].setOffline(true); await expect(timed.pages[0].getByTestId("online-status")).toContainText("recovering");
      await expect.poll(async () => (await admin<Inspection>({op:"inspect",room:timed.room})).records.timing.value.connected[0]).toBe(false);
    }
    const before = await admin<Inspection>({op:"inspect",room:timed.room}), timing = before.records.timing.value;
    const now = mode === "timeout" ? timing.deadline! + 1 : timing.accountedAt + timing.disconnectRemainingMs[0] + 1;
    await admin({op:"time",room:timed.room,now});
    if (mode === "timeout") {
      const m = legalMoves(engineState(before.records.cache.state))[0]; assert(m);
      const late = await request(timed.guests[0],{type:"command",room:timed.room,id:"late-move",expectedCommand:before.records.cache.head.command,action:{type:"move",from:m.from,to:m.to}},await proof(timed.pages[0]));
      assert(late.type === "error" && ["stale","terminal"].includes(late.code) && !late.ambiguous);
      record(`B02 ${mature ? "post-guard" : "opening"} late move cannot outrun authoritative deadline`,{late});
    } else await admin({op:"alarm",room:timed.room});
    if (mode === "disconnect") { await timed.guests[0].setOffline(false); await freshReconnect(timed); }
    if (mature) {
      await admin({op:"time",room:timed.room,now:now+1}); await admin({op:"alarm",room:timed.room});
      await expect.poll(async () => (await snapshot(timed.pages[1])).state.position.randomActions.length).toBe(1);
      await converge(timed,14);
      await action(timed,2,{type:"resign"},`${mode}-resign-2`); await converge(timed,15);
      await action(timed,3,{type:"resign"},`${mode}-resign-3`);
    }
    const {final,commands} = await audit(timed,`G03-${mode}-${mature ? "complete" : "abort"}`,mature ? "ordinary-complete" : "opening-abort");
    const automatic = commands.find(c => c.record.input.action.type === (mode === "timeout" ? "timeout" : "disconnectForfeit")); assert(automatic);
    assert.equal(automatic.record.input.caller.kind,"server");
    assert.equal(final.state.position.result?.reason,mature ? "elimination" : "abort");
    if (mature) assert.equal(final.state.position.players[1].score,60);
    record(`T01 ${mode}: authoritative ${mature ? "post-guard" : "opening"} deadline`,{before:timing,automatic:automatic.record,testOnlyTime:now});
    await closeGame(timed);
  }
  }
  if (selected.includes("incidents")) {
    await start("incidents",true);
    for (const incident of ["missing-timing","incompatible-timing","divergent-marker","owner-fence"]) {
      const g = await game(), initial = await snapshot(g.pages[0]);
      if (incident === "owner-fence") await admin({op:"sql",room:g.room,sql:"UPDATE games SET owner_generation=2 WHERE id=?",values:[g.room]});
      else if (incident === "divergent-marker") await admin({op:"mutate",room:g.room,key:"marker",value:{command:initial.command,event:initial.event,stateHash:`sha256:${"0".repeat(64)}`,chainHash:initial.chainHash}});
      else {
        const value = {...initial.timing,format:"unknown-clock-version"};
        await admin({op:"mutate",room:g.room,key:"timing",value:incident === "missing-timing" ? null : {value,hash:await digest(value)}});
      }
      await restart();
      for (const page of g.pages) {
        await page.getByRole("button",{name:"Reconnect and resync",exact:true}).click();
        await expect(page.getByTestId("online-status")).toContainText(/recovering|connecting/);
      }
      await expect.poll(async () => {
        const i = await admin<Inspection>({op:"inspect",room:g.room}); return !!i.records.incident || i.records.timing?.value.phase === "incident";
      },{timeout:20000}).toBe(true);
      const inspected = await admin<Inspection>({op:"inspect",room:g.room});
      const db = await database();
      const canonical = db.prepare("SELECT command_seq,event_seq,state_hash,chain_hash,quarantine FROM games WHERE id=?").get(g.room); db.close();
      assert.equal(canonical?.command_seq,0); assert.equal(canonical?.event_seq,0); assert.equal(canonical?.state_hash,initial.stateHash); assert.equal(canonical?.chain_hash,initial.chainHash);
      if (incident === "divergent-marker") assert(canonical?.quarantine);
      for (const page of g.pages) {
        await expect(page.getByTestId("online-result")).toHaveCount(0);
        await expect(page.getByTestId("online-boundary")).toHaveText(`Command 0 · ${initial.stateHash}`);
      }
      record(`R03 ${incident}: explicit unavailable incident preserves canonical history`,{classification:"unfinished-incident",canonical,inspected});
      await closeGame(g);
    }
  }
  if (selected.includes("auth")) {
    await start("auth-rotation"); const g = await game();
    for (let seat = 0; seat < 4; seat++) {
      const page = g.pages[seat], guest = g.guests[seat], originalSession = await request(guest,{type:"session"});
      const cookie = (await guest.cookies())[0]; assert(cookie); secrets.add(cookie.value);
      const rotated = await request(guest,{type:"rotate"}); assert(rotated.type === "session" && originalSession.type === "session");
      assert.equal(rotated.principal,originalSession.principal); assert.equal(rotated.generation,originalSession.generation+1);
      await expect(page.getByTestId("online-status")).toContainText(/revoked|expired/);
      const old = await guest.request.post(`${origin}/api/online`,{...campaignHttp,headers:{...campaignHttp.headers,Origin:origin,"Content-Type":"application/json","X-Li4chess-Protocol":ONLINE_VERSION,Cookie:`${cookie.name}=${cookie.value}`},data:{version:ONLINE_VERSION,type:"session"}});
      const oldResult = await parseOnlineResponse(await old.json()); assert(oldResult.type === "error" && oldResult.code === "revoked");
      for (const c of await guest.cookies()) secrets.add(c.value);
      await page.reload(); await page.getByRole("button",{name:"Private multiplayer",exact:true}).click(); await connected(page);
      await expect(page.getByTestId("online-control")).toContainText("Observer");
      await page.getByRole("button",{name:"Take control",exact:true}).click(); await expect(page.getByTestId("online-control")).toContainText("Controller");
      record(`B05 seat ${seat}: live rotation revokes old socket/cookie and reconnect requires explicit takeover`,{principal:rotated.principal,generation:rotated.generation});
    }
    for (let ply=0;ply<16;ply++) { const seat=ply%4 as PlayerColor,outward=Math.floor(ply/4)%2===0; await uiMove(g,localSquare(seat,outward?1:0,outward?0:2),localSquare(seat,outward?0:1,outward?2:0)); }
    await audit(g,"B05-rotated-guests-complete","ordinary-complete"); await closeGame(g);
    for (const mode of ["revocation","expiry"] as const) {
      await start(`auth-${mode}`,false,"ordinary",600000,mode === "expiry" ? 30000 : 3600000); const retired = await game();
      const originalCookies = await Promise.all(retired.guests.map(async guest => (await guest.cookies())[0]));
      for (let seat=0;seat<4;seat++) {
        const cookie=originalCookies[seat]; assert(cookie); secrets.add(cookie.value);
        if(mode === "revocation") assert.equal((await request(retired.guests[seat],{type:"revoke"})).type,"revoked");
        await expect(retired.pages[seat].getByTestId("online-status")).toContainText(/expired|revoked/,{timeout:35000});
        const response=await retired.guests[seat].request.post(`${origin}/api/online`,{...campaignHttp,headers:{...campaignHttp.headers,Origin:origin,"Content-Type":"application/json","X-Li4chess-Protocol":ONLINE_VERSION,Cookie:`${cookie.name}=${cookie.value}`},data:{version:ONLINE_VERSION,type:"session"}});
        const result=await parseOnlineResponse(await response.json()); assert(result.type === "error" && result.code === (mode === "expiry" ? "expired" : "revoked"));
        const replayResponse=await retired.guests[seat].request.post(`${origin}/api/online`,{...campaignHttp,headers:{...campaignHttp.headers,Origin:origin,"Content-Type":"application/json","X-Li4chess-Protocol":ONLINE_VERSION,Cookie:`${cookie.name}=${cookie.value}`},data:{version:ONLINE_VERSION,type:"replay",room:retired.room,cursor:null}});
        const replayError=await parseOnlineResponse(await replayResponse.json());assert(replayError.type==="error"&&replayError.code===(mode==="expiry"?"expired":"revoked"));
      }
      const db=await database();const canonical=db.prepare("SELECT command_seq,event_seq,lifecycle FROM games WHERE id=?").get(retired.room);db.close();assert.equal(canonical?.command_seq,0);
      record(`B05 all-seat live ${mode} closes access and later requests reject`,{classification:"unfinished-credential-loss",canonical}); await closeGame(retired);
    }
  }
  if(selected.includes("rematch")) {
    const status=async(g:Game,seat=0)=>{const r=await request(g.guests[seat],{type:"rematch",room:g.room});assert(r.type==="rematch",JSON.stringify(r));return r;};
    const currentRematch=async(g:Game,seat:number)=>{const s=await status(g,seat);await expect(g.pages[seat].getByTestId("rematch-status")).toHaveAttribute("data-revision",String(s.rematch.revision));};
    let serial=0;
    const mutation=async(g:Game,seat:number,type:"rematchPropose"|"rematchConsent"|"rematchDecline")=>{
      const s=await status(g,seat);return {type,room:g.room,id:`rematch-${serial++}`,expectedRevision:s.rematch.revision,...(type==="rematchPropose"?{}:{proposal:s.rematch.proposal})};
    };
    const canonicalBytes=async(room:string)=>{const db=await database();try{return JSON.stringify({
      game:db.prepare("SELECT * FROM games WHERE id=?").all(room),
      commands:db.prepare("SELECT * FROM commands WHERE game_id=? ORDER BY seq").all(room),
      events:db.prepare("SELECT * FROM events WHERE game_id=? ORDER BY seq").all(room),
      checkpoints:db.prepare("SELECT * FROM checkpoints WHERE game_id=? ORDER BY command_seq").all(room),
      results:db.prepare("SELECT * FROM results WHERE game_id=?").all(room),
    });}finally{db.close();}};
    await start("rematch-ordinary");const g=await game();
    const unfinished=await request(g.guests[0],{type:"rematch",room:g.room});assert(unfinished.type==="error"&&unfinished.code==="replayIncomplete");
    for(let ply=0;ply<16;ply++){const seat=ply%4 as PlayerColor,outward=Math.floor(ply/4)%2===0;await uiMove(g,localSquare(seat,outward?1:0,outward?0:2),localSquare(seat,outward?0:1,outward?2:0));}
    const completed=await audit(g,"RM01-original-repetition","ordinary-complete");
    const oldRoom=g.room,oldBytes=await canonicalBytes(oldRoom),oldReplay=canonicalJson(await apiReplay(g.guests[0],oldRoom));
    await g.pages[0].getByRole("button",{name:"Propose rematch",exact:true}).click();
    await expect(g.pages[0].getByTestId("rematch-status")).toContainText("pending · 0/4");
    const pending=await status(g);assert(pending.rematch.successor===null);
    const competing=await Promise.all([1,2].map(async seat=>request(g.guests[seat],await mutation(g,seat,"rematchPropose"))));
    assert(competing.every(r=>r.type==="error"&&["conflict","stale"].includes(r.code)));
    const observer=await g.guests[0].newPage();await enter(observer);
    await observer.getByRole("textbox",{name:"Invitation",exact:true}).fill(g.invitation);await observer.getByRole("button",{name:"Join private room",exact:true}).click();await connected(observer);
    await expect(observer.getByTestId("online-control")).toContainText("Observer");
    await observer.getByRole("button",{name:"Consent to rematch",exact:true}).click();
    await expect(g.pages[0].getByRole("button",{name:"You consented",exact:true})).toBeDisabled();
    const duplicate=await mutation(g,0,"rematchConsent"),first=await request(g.guests[0],duplicate);assert(first.type==="rematch");
    const repeat=await request(g.guests[0],duplicate);assert(repeat.type==="rematch");same(first.receipt,repeat.receipt);assert.equal(repeat.rematch.consents.filter(Boolean).length,1);
    const mismatch=await request(g.guests[0],{...duplicate,type:"rematchDecline"});assert(mismatch.type==="error"&&mismatch.code==="conflict");
    await observer.getByRole("button",{name:"Take control",exact:true}).click();await expect(observer.getByTestId("online-control")).toContainText("Controller");
    await observer.close();
    record("RM04 observer/controller takeover and duplicate consent share one principal vote; competing proposals add none");
    await currentRematch(g,1);
    let lost=true;const sent:string[]=[];
    await g.pages[1].route("**/api/online",async route=>{const b=route.request().postDataJSON() as {type:string;id:string};
      if(b.type==="rematchConsent"){sent.push(b.id);if(lost){await route.fetch();await route.abort("failed");return;}}await route.continue();});
    await g.pages[1].getByRole("button",{name:"Consent to rematch",exact:true}).click();
    await expect(g.pages[1].getByTestId("pending-rematch")).toBeVisible();const lostId=await g.pages[1].getByTestId("pending-rematch").textContent();
    await g.pages[1].reload();await g.pages[1].getByRole("button",{name:"Private multiplayer",exact:true}).click();await connected(g.pages[1]);
    await expect(g.pages[1].getByTestId("pending-rematch")).toHaveText(lostId!);lost=false;
    await g.pages[1].getByRole("button",{name:"Retry same rematch request",exact:true}).click();await expect(g.pages[1].getByTestId("pending-rematch")).toHaveCount(0);
    assert.equal(new Set(sent).size,1);await g.pages[1].unroute("**/api/online");
    assert.equal((await status(g)).rematch.consents.filter(Boolean).length,2);await currentRematch(g,2);
    await g.pages[2].getByRole("button",{name:"Consent to rematch",exact:true}).click();await expect(g.pages[2].getByTestId("rematch-status")).toContainText("3/4");
    for(let seat=0;seat<4;seat++){
      const before=await request(g.guests[seat],{type:"session"});const rotated=await request(g.guests[seat],{type:"rotate"});assert(before.type==="session"&&rotated.type==="session"&&before.principal===rotated.principal);
      for(const cookie of await g.guests[seat].cookies())secrets.add(cookie.value);
      await g.pages[seat].reload();await g.pages[seat].getByRole("button",{name:"Private multiplayer",exact:true}).click();await connected(g.pages[seat]);
      for(const cookie of await g.guests[seat].cookies())secrets.add(cookie.value);
      assert.equal((await status(g,seat)).rematch.consents.filter(Boolean).length,3);
    }
    await currentRematch(g,3);
    let captured:OnlineResponse|undefined;await g.pages[3].route("**/api/online",async route=>{if((route.request().postDataJSON() as {type:string}).type==="rematchConsent"){const response=await route.fetch();captured=await parseOnlineResponse(await response.json());await route.abort("failed");return;}await route.continue();});
    await g.pages[3].getByRole("button",{name:"Consent to rematch",exact:true}).click();await expect.poll(()=>captured?.type).toBe("rematch");await expect(g.pages[3].getByTestId("pending-rematch")).toBeVisible();
    const last=await g.pages[3].evaluate(()=>JSON.parse(sessionStorage.getItem("li4chess.online.rematch.v1")!).request as {type:"rematchConsent";room:string;id:string;expectedRevision:number;proposal:number});
    const lastReply=captured!;assert(lastReply.type==="rematch"&&lastReply.rematch.successor);
    const successor=lastReply.rematch.successor;
    for(const [seat,page] of g.pages.entries()){await expect(page.getByTestId("online-result")).toBeVisible();if(seat!==3)await expect(page.getByRole("button",{name:"Enter rematch room",exact:true})).toBeEnabled();}
    let db=await database();assert.equal(db.prepare("SELECT count(*) AS n FROM games WHERE id=?").get(successor)!.n,0);db.close();
    const waiting=await request(g.guests[0],{type:"lobby",room:successor});assert(waiting.type==="lobby"&&waiting.lobby.phase==="waiting");assert(waiting.lobby.seats.every(s=>s&&!s.ready));same(waiting.lobby.policy,completed.final.timing.policy);
    await restart();await g.pages[3].unroute("**/api/online");await g.pages[3].getByRole("button",{name:"Retry same rematch request",exact:true}).click();await expect(g.pages[3].getByTestId("pending-rematch")).toHaveCount(0);const recovered=await request(g.guests[3],last);assert(recovered.type==="rematch");same(recovered.receipt,lastReply.receipt);assert.equal(recovered.rematch.successor,successor);
    assert.equal(await canonicalBytes(oldRoom),oldBytes);assert.equal(canonicalJson(await apiReplay(g.guests[0],oldRoom)),oldReplay);
    record("RM01/RM03/RM06 unanimous consent persists once across runtime restart; all-seat rotation and lost reply preserve principal intentions",{oldRoom,successor,lastReceipt:lastReply.receipt});
    // Retire succeeds, but successor lookup fails: the old room must obtain a fresh proof.
    await g.pages[0].reload();await g.pages[0].getByRole("button",{name:"Private multiplayer",exact:true}).click();await connected(g.pages[0]);
    const retiredProof=await proof(g.pages[0]);let entryFailure=true;
    await g.pages[0].route("**/api/online",async route=>{const b=route.request().postDataJSON() as {type:string;room:string};
      if(entryFailure&&b.type==="lobby"&&b.room===successor){entryFailure=false;await route.abort("failed");return;}await route.continue();});
    await g.pages[0].getByRole("button",{name:"Enter rematch room",exact:true}).click();
    await expect.poll(()=>g.pages[0].evaluate(old=>{const raw=sessionStorage.getItem("li4chess.online.connection.v1");const value=raw?JSON.parse(raw).proof:null;return !!value&&value!==old;},retiredProof)).toBe(true);await connected(g.pages[0]);await g.pages[0].unroute("**/api/online");
    record("RM06 failed successor entry recovers the retired source connection with fresh proof");
    for(const page of g.pages){await page.reload();await page.getByRole("button",{name:"Private multiplayer",exact:true}).click();await connected(page);await page.getByRole("button",{name:"Enter rematch room",exact:true}).click();await expect(page.getByTestId("online-room")).toHaveText(successor);}
    const fixed=await request(g.guests[0],{type:"seat",room:successor,seat:1});assert(fixed.type==="error"&&fixed.code==="conflict");
    await g.pages[0].getByRole("button",{name:"View previous result and replay",exact:true}).click();await expect(g.pages[0].getByTestId("previous-result")).toContainText("repetition");
    await g.pages[0].getByRole("button",{name:"Close previous result",exact:true}).click();
    for(const page of g.pages)await page.getByRole("button",{name:"Ready",exact:true}).click();for(const page of g.pages)await connected(page);
    g.room=successor;const fresh=await converge(g,0);
    assert.notEqual(fresh.state.position.randomSeed,completed.final.state.position.randomSeed);assert.equal(fresh.producer.sourceRevision,artifact.producer.sourceRevision);
    await uiMove(g,17,31);assert.equal(await canonicalBytes(oldRoom),oldBytes);assert.equal(canonicalJson(await apiReplay(g.guests[0],oldRoom)),oldReplay);
    db=await database();const newHeader=JSON.parse(String(db.prepare("SELECT header_json FROM games WHERE id=?").get(successor)!.header_json));db.close();
    await writeFile(resolve(output,"RM01-new-genesis.json"),JSON.stringify({oldRoom,successor,header:newHeader,firstMove:await snapshot(g.pages[0])}));
    record("RM01/RM02 deliberate entry, fixed seats, readiness and legal new-game play preserve exact original canonical/replay bytes",{oldRoom,successor,oldSeed:completed.final.state.position.randomSeed,newSeed:fresh.state.position.randomSeed});
    await closeGame(g);
  }
  if(selected.includes("rematch")) {
    await start("rematch-abort-and-departure");const g=await game();await action(g,0,{type:"resign"},"rm-abort");await converge(g,1);
    const audited=await audit(g,"RM08-opening-abort","ordinary-complete");assert.equal(audited.final.state.position.result?.reason,"abort");
    const status=async()=>{const r=await request(g.guests[1],{type:"rematch",room:g.room});assert(r.type==="rematch");return r;};
    let serial=0;
    const mutate=async(seat:number,type:"rematchPropose"|"rematchConsent"|"rematchDecline")=>{const r=await status();return request(g.guests[seat],{type,room:g.room,id:`abort-rematch-${serial++}`,expectedRevision:r.rematch.revision,...(type==="rematchPropose"?{}:{proposal:r.rematch.proposal})});};
    const outsider=await browser.newContext();contexts.add(outsider);
    const attempt={type:"rematchPropose",room:g.room,id:"abort-first-proposal",expectedRevision:0};
    const missing=await request(outsider,attempt,await proof(g.pages[0]));assert(missing.type==="error"&&missing.code==="unauthorized");
    await request(outsider,{type:"issue"});for(const cookie of await outsider.cookies())secrets.add(cookie.value);
    const nonmember=await request(outsider,attempt);assert(nonmember.type==="error"&&nonmember.code==="unauthorized");
    for(let seat=0;seat<4;seat++){
      const forged=await request(g.guests[seat],{...attempt,id:`forged-${seat}`,seat,principal:"forged"});assert(forged.type==="error"&&forged.code==="invalid");
    }
    await outsider.close();contexts.delete(outsider);
    assert.equal((await request(g.guests[0],attempt)).type,"rematch");assert.equal((await mutate(0,"rematchConsent")).type,"rematch");
    const page=g.pages[0];await page.route("**/api/online",async route=>{
      if((route.request().postDataJSON() as {type:string}).type==="rematch"){await route.abort("failed");return;}await route.continue();});
    await page.reload();await page.getByRole("button",{name:"Private multiplayer",exact:true}).click();await connected(page);
    const dismissed=new Promise<void>(resolve=>page.once("dialog",dialog=>{assert(dialog.message().includes("without confirmed withdrawal"));void dialog.dismiss().then(resolve);}));
    await page.getByRole("button",{name:"Leave online room",exact:true}).click();await dismissed;await expect(page.getByRole("button",{name:"Leave online room",exact:true})).toBeEnabled();await expect(page.getByTestId("online-result")).toBeVisible();
    assert.equal((await status()).rematch.consents.filter(Boolean).length,1);
    await page.unroute("**/api/online");await page.getByRole("button",{name:"Leave online room",exact:true}).click();
    await expect(page.getByRole("button",{name:"Private multiplayer",exact:true})).toBeVisible();assert.equal((await status()).rematch.phase,"declined");
    const stale=await request(g.guests[1],{type:"rematchConsent",room:g.room,id:"stale-departure",proposal:1,expectedRevision:1});assert(stale.type==="error"&&stale.code==="stale");
      for(let epoch=2;epoch<=8;epoch++){
      const proposed=await mutate(1,"rematchPropose");assert(proposed.type==="rematch"&&proposed.rematch.proposal===epoch&&proposed.rematch.consents.every(v=>!v));
      if(epoch===8){
        let capped=false;for(let i=0;i<120;i++){const vote=await mutate(1,"rematchConsent");if(vote.type==="error"){assert.equal(vote.code,"capacity");capped=true;break;}assert.equal(vote.type,"rematch");}
        assert(capped);assert.equal((await status()).rematch.phase,"pending");
      }
      assert.equal((await mutate(2,"rematchDecline")).type,"rematch");
    }
    const cap=await mutate(1,"rematchPropose");assert(cap.type==="error"&&cap.code==="capacity");
    const exact=await request(g.guests[0],attempt);assert(exact.type==="rematch"&&exact.receipt?.id===attempt.id&&exact.rematch.proposal===8);
    same(await apiReplay(g.guests[1],g.room),await apiReplay(g.guests[2],g.room));
    record("RM03/RM05/RM06/RM08 abort eligibility, identity fences, fresh departure withdrawal, stale epochs and proposal capacity");await closeGame(g);
  }
  if(selected.includes("rematch")) {
    const guestSql=async<T=unknown>(sql:string,values:(string|number|null)[]=[])=>admin<T>({op:"guest-sql",room:"unused",sql,values});
    for(const stage of ["before-creation","after-creation","before-d1","after-d1"]){
      await start(`rematch-recovery-${stage}`,true);const g=await game();await action(g,0,{type:"resign"},`abort-${stage}`);await converge(g,1);
      const original=await apiReplay(g.guests[0],g.room);
      const sourceRows=async()=>{const db=await database();try{return JSON.stringify({game:db.prepare("SELECT * FROM games WHERE id=?").get(g.room),commands:db.prepare("SELECT * FROM commands WHERE game_id=? ORDER BY seq").all(g.room),events:db.prepare("SELECT * FROM events WHERE game_id=? ORDER BY seq").all(g.room),result:db.prepare("SELECT * FROM results WHERE game_id=?").all(g.room)});}finally{db.close();}};
      const originalRows=await sourceRows();
      if(stage==="after-creation"){
        const before=await request(g.guests[0],{type:"session"});assert(before.type==="session");const old=(await g.guests[0].cookies())[0];secrets.add(old.value);
        await admin({op:"detach-outage",room:g.room,value:true});const rotated=await request(g.guests[0],{type:"rotate"});assert(rotated.type==="session"&&rotated.principal===before.principal);
        for(const cookie of await g.guests[0].cookies())secrets.add(cookie.value);
        const rejected=await g.guests[0].request.post(`${origin}/api/online`,{...campaignHttp,headers:{...campaignHttp.headers,Origin:origin,"Content-Type":"application/json","X-Li4chess-Protocol":ONLINE_VERSION,Cookie:`${old.name}=${old.value}`},data:{version:ONLINE_VERSION,type:"rematch",room:g.room}});assert.equal((await rejected.json() as {code:string}).code,"revoked");
        await admin({op:"detach-outage",room:g.room,value:false});
      }
      for(const page of g.pages)await page.close();
      const status=async()=>{const r=await request(g.guests[0],{type:"rematch",room:g.room});assert(r.type==="rematch");return r;};
      let serial=0;
      const intention=async(type:"rematchPropose"|"rematchConsent"|"rematchDecline")=>{const r=await status();return {type,room:g.room,id:`fault-rematch-${serial++}`,expectedRevision:r.rematch.revision,...(type==="rematchPropose"?{}:{proposal:r.rematch.proposal})};};
      const proposal=await intention("rematchPropose");assert.equal((await request(g.guests[0],proposal)).type,"rematch");
      if(stage==="after-creation"){
        const old=await admin<Inspection>({op:"inspect",room:g.room});
        await admin({op:"mutate",room:g.room,key:"incident",value:{reason:"isolated integrity incident"}});
        const incident=await request(g.guests[0],{type:"rematch",room:g.room});assert(incident.type==="error");await admin({op:"mutate",room:g.room,key:"incident",value:old.records.incident??null});
        await admin({op:"mutate",room:g.room,key:"cache",value:{...old.records.cache,head:{...old.records.cache.head,stateHash:`sha256:${"f".repeat(64)}`}}});
        const divergent=await request(g.guests[0],{type:"rematch",room:g.room});assert(divergent.type==="error");await admin({op:"mutate",room:g.room,key:"cache",value:old.records.cache});
        const cfg=JSON.parse(await readFile(configPath,"utf8"));cfg.vars.M3_07_READER_BUILD="7".repeat(40);await writeFile(configPath,JSON.stringify(cfg));await restart();
        assert.equal((await status()).rematch.phase,"pending");same(await apiReplay(g.guests[0],g.room),original);
        delete cfg.vars.M3_07_READER_BUILD;await writeFile(configPath,JSON.stringify(cfg));await restart();
        record("RM03/RM08 interrupted detach rotation, incident/divergent rejection and historical-serving rematch eligibility",{historicalReader:"7".repeat(40)});
      }
      if(stage==="before-creation"){
        await guestSql("UPDATE guest_records SET value=json_set(value,'$.proposals[0].expiresAt',?) WHERE key=?",[Date.now()-1,`rematch:${g.room}`]);
        assert.equal((await status()).rematch.phase,"expired");
        assert.equal((await request(g.guests[0],await intention("rematchPropose"))).type,"rematch");
        for(let seat=0;seat<4;seat++){
          const auth=await request(g.guests[seat],{type:"session"});assert(auth.type==="session");
          await guestSql("UPDATE guest_records SET value=json_set(value,'$.expiresAt',?) WHERE key LIKE 'credential:%' AND json_extract(value,'$.principal')=?",[Date.now()-1,auth.principal]);
          const observed=await request(g.guests[(seat+1)%4],{type:"rematch",room:g.room});assert(observed.type==="rematch"&&observed.rematch.phase==="participantUnavailable"&&!observed.rematch.successor);
          // Isolated fixture restores the original credential deadline for the next independent seat case.
          await guestSql("UPDATE guest_records SET value=json_set(value,'$.expiresAt',?) WHERE key LIKE 'credential:%' AND json_extract(value,'$.principal')=?",[auth.expiresAt,auth.principal]);
          assert.equal((await request(g.guests[0],await intention("rematchPropose"))).type,"rematch");
        }
      }
      for(let seat=0;seat<3;seat++)assert.equal((await request(g.guests[seat],await intention("rematchConsent"))).type,"rematch");
      const last=await intention("rematchConsent");
      if(stage==="before-creation"){
        await admin({op:"eligibility-delay",room:g.room,now:2500});
        const auth=await request(g.guests[3],{type:"session"});assert(auth.type==="session");
        await guestSql("UPDATE guest_records SET value=json_set(value,'$.expiresAt',?) WHERE key LIKE 'credential:%' AND json_extract(value,'$.principal')=?",[Date.now()+2000,auth.principal]);
        const expired=await request(g.guests[3],last);assert(expired.type==="error"&&expired.code==="expired");
        await admin({op:"eligibility-delay",room:g.room});
        await guestSql("UPDATE guest_records SET value=json_set(value,'$.expiresAt',?) WHERE key LIKE 'credential:%' AND json_extract(value,'$.principal')=?",[auth.expiresAt,auth.principal]);
        // Expiry can settle the proposal via the real alarm. Start a fresh epoch if necessary.
        if((await status()).rematch.phase!=="pending"){
          assert.equal((await request(g.guests[0],await intention("rematchPropose"))).type,"rematch");
          for(let seat=0;seat<3;seat++)assert.equal((await request(g.guests[seat],await intention("rematchConsent"))).type,"rematch");
          Object.assign(last,await intention("rematchConsent"));
        }
      }
      // SQLite trigger interrupts the actual local admission transaction, not a mocked reducer.
      await guestSql("CREATE TRIGGER rematch_allocation_rollback BEFORE INSERT ON guest_records WHEN NEW.key LIKE 'lobby:%' BEGIN SELECT RAISE(ABORT,'isolated rematch allocation rollback'); END");
      const rolled=await request(g.guests[3],last);assert(rolled.type==="error");assert.equal((await status()).rematch.consents.filter(Boolean).length,3);assert.equal((await status()).rematch.successor,null);
      await restart();await guestSql("DROP TRIGGER rematch_allocation_rollback");
      const allocated=await request(g.guests[3],last);assert(allocated.type==="rematch"&&allocated.rematch.successor);const successor=allocated.rematch.successor;
      const exact=await request(g.guests[3],last);assert(exact.type==="rematch");same(exact.receipt,allocated.receipt);
      if(stage==="before-d1")await admin({op:"sql",room:successor,sql:"CREATE TRIGGER rematch_d1_rollback BEFORE INSERT ON games BEGIN SELECT RAISE(ABORT,'isolated rematch D1 rollback'); END"});
      else {await admin({op:"fault",room:successor,fault:{stage,mode:"throw",remaining:100}});await admin({op:"hold-recovery",room:successor,value:true});}
      // The configured development clock changes, but the successor must copy its source policy.
      const cfg=JSON.parse(await readFile(configPath,"utf8"));cfg.vars.ONLINE_INITIAL_MS="777777";cfg.vars.ONLINE_INCREMENT_MS="777";await writeFile(configPath,JSON.stringify(cfg));
      const retained=structuredClone(cfg);retained.vars.M3_06_KEY="[ephemeral; omitted]";await writeFile(resolve(output,`RM07-${stage}-changed.configuration.json`),JSON.stringify(retained));await restart();
      for(let seat=0;seat<4;seat++)await request(g.guests[seat],{type:"ready",room:successor,ready:true});
      const frozenRows=await guestSql<{value:string}[]>("SELECT value FROM guest_records WHERE key=?",[`lobby:${successor}`]);const frozen=JSON.parse(frozenRows[0].value) as {creation:{policy:unknown};phase:string};assert.equal(frozen.phase,"creating");assert(frozen.creation);same(frozen.creation.policy,{initialMs:600000,incrementMs:50,increment:"after-move"});
      if(stage!=="before-d1"){const hit=await admin<Inspection>({op:"inspect",room:successor});assert.equal(hit.hit?.stage,stage);}
      // Expire every credential only AFTER exact intent has been durably frozen.
      await guestSql("UPDATE guest_records SET value=json_set(value,'$.expiresAt',?) WHERE key LIKE 'credential:%'",[Date.now()-1]);
      await restart();await admin({op:"hold-recovery",room:successor,value:false});await admin({op:"fault",room:successor});if(stage==="before-d1")await admin({op:"sql",room:successor,sql:"DROP TRIGGER rematch_d1_rollback"});
      await expect.poll(async()=>{const rows=await guestSql<{value:string}[]>("SELECT value FROM guest_records WHERE key=?",[`lobby:${successor}`]);return (JSON.parse(rows[0].value) as {phase:string}).phase;},{timeout:90000}).toBe("started");
      const recoveredRows=await guestSql<{value:string}[]>("SELECT value FROM guest_records WHERE key=?",[`lobby:${successor}`]);const recovered=JSON.parse(recoveredRows[0].value) as {creation:unknown;phase:string};assert.equal(recovered.phase,"started");same(recovered.creation,frozen.creation);
      const db=await database();try{assert.equal(db.prepare("SELECT count(*) AS n FROM games WHERE id=?").get(successor)!.n,1);}finally{db.close();}
      const unavailable=await request(g.guests[0],{type:"lobby",room:successor});assert(unavailable.type==="error"&&unavailable.code==="expired");
      const canonical=await admin<Boundary>({op:"canonical",room:successor});assert.equal(canonical.head.command,0);
      assert.equal(await sourceRows(),originalRows);
      await writeFile(resolve(output,`RM07-${stage}.json`),JSON.stringify({stage,oldRoom:g.room,successor,original,frozenCreation:frozen.creation,recoveredCreation:recovered.creation,canonical}));
      record(`RM07/RM08 ${stage}: allocation rollback, whole-runtime restart and credential-independent frozen creation recovery`,{oldRoom:g.room,successor});await closeGame(g);
    }
  }
  if(selected.includes("replay")) {
    await start("replay-members",true);const g=await game();
    const error=async(guest:BrowserContext,body:object,code:string)=>{
      const r=await request(guest,body);assert(r.type==="error"&&r.code===code&&!r.ambiguous,JSON.stringify(r));
    };
    await error(g.guests[0],{type:"replay",room:g.room,cursor:null},"replayIncomplete");
    await action(g,0,{type:"resign"},"replay-opening-abort");
    const complete=await audit(g,"replay-opening-abort","opening-abort");
    const expected=await apiReplay(g.guests[0],g.room);
    const outsider=await browser.newContext();contexts.add(outsider);
    await error(outsider,{type:"replay",room:g.room,cursor:null},"unauthorized");
    const issued=await request(outsider,{type:"issue"});assert(issued.type==="session");for(const c of await outsider.cookies())secrets.add(c.value);
    await error(outsider,{type:"replay",room:g.room,cursor:null},"unauthorized");
    for(const extra of [{principal:issued.principal},{seat:0},{invitation:g.invitation}])await error(g.guests[0],{type:"replay",room:g.room,cursor:null,...extra},"invalid");
    const invalid=await outsider.request.post(`${origin}/api/online`,{...campaignHttp,headers:{...campaignHttp.headers,Origin:origin,"Content-Type":"application/json","X-Li4chess-Protocol":ONLINE_VERSION,Cookie:"li4chess-local-guest=bad"},data:{version:ONLINE_VERSION,type:"replay",room:g.room,cursor:null}});
    assert.equal((await invalid.json() as {code:string}).code,"unauthorized");
    record("R03 replay membership, missing/invalid credentials and forged fields reject");

    const observer=await g.guests[0].newPage();await enter(observer);
    await observer.getByRole("textbox",{name:"Invitation",exact:true}).fill(g.invitation);await observer.getByRole("button",{name:"Join private room",exact:true}).click();await connected(observer);
    await expect(observer.getByTestId("online-control")).toContainText("Observer");
    const downloadObserver=observer.waitForEvent("download");await observer.getByRole("button",{name:"Download replay",exact:true}).click();
    const observerFile=await downloadObserver;await observerFile.saveAs(resolve(output,"replay-observer.replay.json"));
    same(JSON.parse(await readFile(resolve(output,"replay-observer.replay.json"),"utf8")),expected);
    await observer.getByRole("button",{name:"Take control",exact:true}).click();await expect(observer.getByTestId("online-control")).toContainText("Controller");
    same(await apiReplay(g.guests[0],g.room),expected);
    record("R02 observer download and explicit takeover preserve replay");

    const page=g.pages[1];let downloads=0;page.on("download",()=>downloads++);
    await page.route("**/api/online",async route=>{if((route.request().postDataJSON() as {type:string}).type==="replay")await route.abort("failed");else await route.continue();});
    await page.getByRole("button",{name:"Download replay",exact:true}).click();await expect(page.getByTestId("replay-download-status")).not.toContainText("Verifying");
    await page.unroute("**/api/online");assert.equal(downloads,0);
    const retried=page.waitForEvent("download");await page.getByRole("button",{name:"Download replay",exact:true}).click();await retried;assert.equal(downloads,1);
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let reached!:()=>void;const arrived=new Promise<void>(resolve=>{reached=resolve;});
    await page.route("**/api/online",async route=>{
      if((route.request().postDataJSON() as {type:string}).type!=="replay"){await route.continue();return;}
      const response=await route.fetch();reached();await gate;await route.fulfill({response}).catch(()=>undefined);
    });
    await page.getByRole("button",{name:"Download replay",exact:true}).click();await arrived;
    await expect(page.getByRole("button",{name:"Download replay",exact:true})).toBeDisabled();
    await page.getByRole("button",{name:"Leave online room",exact:true}).click();release();
    await expect(page.getByRole("button",{name:"Start game",exact:true})).toBeVisible();await page.unroute("**/api/online");assert.equal(downloads,1);
    record("R05 lost response retries, duplicate-click guard and late callback after leaving do not export a partial/wrong file");

    const rotatingPage=g.pages[2];let rotatedDownloads=0;rotatingPage.on("download",()=>rotatedDownloads++);
    let releaseRotation!:()=>void,rotationArrived!:()=>void;
    const rotationGate=new Promise<void>(resolve=>{releaseRotation=resolve;}),rotationPending=new Promise<void>(resolve=>{rotationArrived=resolve;});
    await rotatingPage.route("**/api/online",async route=>{
      const body=route.request().postDataJSON() as {type:string;cursor:string|null};
      if(body.type!=="replay"||body.cursor===null){await route.continue();return;}
      const response=await route.fetch();rotationArrived();await rotationGate;await route.fulfill({response}).catch(()=>undefined);
    });
    await rotatingPage.getByRole("button",{name:"Download replay",exact:true}).click();await rotationPending;
    const rotatedDuringDownload=await request(g.guests[2],{type:"rotate"});assert(rotatedDuringDownload.type==="session");
    for(const cookie of await g.guests[2].cookies())secrets.add(cookie.value);
    await expect(rotatingPage.getByTestId("online-status")).toContainText(/revoked|expired/);releaseRotation();
    await rotatingPage.unroute("**/api/online");await rotatingPage.reload();await rotatingPage.getByRole("button",{name:"Private multiplayer",exact:true}).click();await connected(rotatingPage);
    assert.equal(rotatedDownloads,0);const rotationDownload=rotatingPage.waitForEvent("download");
    await rotatingPage.getByRole("button",{name:"Download replay",exact:true}).click();await rotationDownload;assert.equal(rotatedDownloads,1);
    record("R05 delayed final response after credential rotation cannot download; refreshed observer retries successfully");

    const pending=await request(g.guests[0],{type:"replay",room:g.room,cursor:null});assert(pending.type==="replay"&&pending.page.next);
    await restart();await error(g.guests[0],{type:"replay",room:g.room,cursor:pending.page.next},"replayRestart");
    same(await apiReplay(g.guests[0],g.room),expected);
    await admin({op:"replay-outage",room:g.room,value:true});
    const unavailable=await request(g.guests[0],{type:"replay",room:g.room,cursor:null});assert(unavailable.type==="error"&&unavailable.code==="unavailable");
    await admin({op:"replay-outage",room:g.room,value:false});same(await apiReplay(g.guests[0],g.room),expected);
    record("R06 whole-runtime restart invalidates cursor and isolated replay binding outage recovers exact replay");

    for(let seat=0;seat<4;seat++){
      const guest=g.guests[seat],old=(await guest.cookies())[0];assert(old);secrets.add(old.value);
      const original=await request(guest,{type:"session"}),rotated=await request(guest,{type:"rotate"});assert(original.type==="session"&&rotated.type==="session");
      assert.equal(original.principal,rotated.principal);for(const c of await guest.cookies())secrets.add(c.value);
      const rejected=await guest.request.post(`${origin}/api/online`,{...campaignHttp,headers:{...campaignHttp.headers,Origin:origin,"Content-Type":"application/json","X-Li4chess-Protocol":ONLINE_VERSION,Cookie:`${old.name}=${old.value}`},data:{version:ONLINE_VERSION,type:"replay",room:g.room,cursor:null}});
      assert.equal((await rejected.json() as {code:string}).code,"revoked");same(await apiReplay(guest,g.room),expected);
    }
    record("R03 four same-principal rotations retain proof-free reads and retire old credentials");
    // Close attached tabs before injected corruption so heartbeat recovery cannot
    // mutate operational records while a read-only assertion is being measured.
    for(const p of [...g.pages,observer])await p.close();
    const inspect=()=>admin<Inspection>({op:"inspect",room:g.room});
    const before=await inspect();
    for(const [sql,restore,code] of [
      ["UPDATE persistence_schema SET version=99 WHERE id=1","UPDATE persistence_schema SET version=2 WHERE id=1","replayIncompatible"],
      ["UPDATE games SET quarantine='fixture-quarantine' WHERE id=?","UPDATE games SET quarantine=NULL WHERE id=?","replayIntegrity"],
      ["ALTER TABLE commands RENAME TO commands_unavailable","ALTER TABLE commands_unavailable RENAME TO commands","unavailable"],
    ]){
      await admin({op:"sql",room:g.room,sql,values:sql.includes("?")?[g.room]:[]});
      await error(g.guests[0],{type:"replay",room:g.room,cursor:null},code);
      same((await inspect()).records,before.records);
      await admin({op:"sql",room:g.room,sql:restore,values:restore.includes("?")?[g.room]:[]});
    }
    const marker=before.records.cache.head;
    await admin({op:"mutate",room:g.room,key:"marker",value:{...marker,chainHash:`sha256:${"0".repeat(64)}`}});
    await error(g.guests[0],{type:"replay",room:g.room,cursor:null},"replayIntegrity");
    await admin({op:"mutate",room:g.room,key:"marker",value:marker});same(await apiReplay(g.guests[0],g.room),expected);
    const sql=async(statement:string,values:(string|number|null)[]=[])=>admin<{results:Record<string,unknown>[]}>({op:"sql",room:g.room,sql:statement,values});
    for(const scenario of ["header-version","event-corruption"]){
      const trigger=scenario==="header-version"?"immutable_game":"immutable_events";
      const definition=String((await sql("SELECT sql FROM sqlite_master WHERE name=?",[trigger])).results[0].sql);
      const table=scenario==="header-version"?"games":"events",column=scenario==="header-version"?"header_json":"event_json";
      const predicate=scenario==="header-version"?"id=?":"game_id=? AND seq=1";
      const original=String((await sql(`SELECT ${column} AS value FROM ${table} WHERE ${predicate}`,[g.room])).results[0].value);
      const altered=scenario==="header-version"?JSON.stringify({...JSON.parse(original),replay:{...JSON.parse(original).replay,replaySchemaVersion:99}}):"null";
      await sql(`DROP TRIGGER ${trigger}`);await sql(`UPDATE ${table} SET ${column}=? WHERE ${predicate}`,[altered,g.room]);
      await error(g.guests[0],{type:"replay",room:g.room,cursor:null},scenario==="header-version"?"replayIncompatible":"replayIntegrity");
      same((await inspect()).records,before.records);
      await sql(`UPDATE ${table} SET ${column}=? WHERE ${predicate}`,[original,g.room]);await sql(definition);
    }
    record("R04 incompatible schema, quarantine, read outage and divergent marker fail explicitly without writes");

    // Simulated serving-identity change is fixture-only; original producer bytes
    // remain the actual recorded build, and no historical event is rewritten.
    const config=JSON.parse(await readFile(configPath,"utf8"));config.vars.M3_07_READER_BUILD="7".repeat(40);await writeFile(configPath,JSON.stringify(config));
    await restart();const historicalBefore=await inspect();
    const historical=await g.guests[0].newPage();await enter(historical);
    await historical.getByRole("textbox",{name:"Invitation",exact:true}).fill(g.invitation);await historical.getByRole("button",{name:"Join private room",exact:true}).click();
    await expect(historical.getByTestId("online-control")).toContainText("Replay-only observation",{timeout:20000});
    const historicDownload=historical.waitForEvent("download");await historical.getByRole("button",{name:"Download replay",exact:true}).click();
    const historicFile=await historicDownload;await historicFile.saveAs(resolve(output,"historical-producer.replay.json"));
    same(JSON.parse(await readFile(resolve(output,"historical-producer.replay.json"),"utf8")),expected);
    await historical.reload();await historical.getByRole("button",{name:"Private multiplayer",exact:true}).click();
    await expect(historical.getByTestId("online-control")).toContainText("Replay-only observation");
    await historical.getByRole("button",{name:"Leave online room",exact:true}).click();
    same((await inspect()).records,historicalBefore.records);
    record("R07 fixture-simulated newer serving identity opens, refreshes, exports and leaves original producer without operational mutation",{producer:expected.engineBuild,simulatedServingRevision:config.vars.M3_07_READER_BUILD,result:complete.final.state.position.result});
    await closeGame(g);await outsider.close();contexts.delete(outsider);
  }
  await verifyArtifact(true);
} catch (error) { failure = error; }
finally {
  for (const c of contexts) await c.close().catch(() => undefined);
  const cleanup = await Promise.allSettled([browser.close(), ...(runtime ? [stopRuntime(runtime.child)] : [])]);
  for (const result of cleanup) if (result.status === "rejected") failure ??= result.reason;
  const sanitize = (s: string) => sanitizeCampaign(s, secrets);
  await writeFile(resolve(output, "observations.json"), campaignJson(observations, secrets));
  await writeFile(resolve(output, "runtime.log"), sanitize(log));
  await writeFile(resolve(output, "manifest.json"), JSON.stringify({ producer: artifact.producer, environment: runtimeEnvironment(), nodeExecutable: process.execPath,
    pnpm: execFileSync(process.execPath, [process.env.npm_execpath!, "--version"], { encoding: "utf8", windowsHide: true }).trim(),
    wrangler: require("wrangler/package.json").version, workerd: require(require.resolve("workerd/package.json", { paths: [resolve(root, "node_modules/wrangler")] })).version,
    chromium: browser.version(), command: selected.join(",")==="rematch"?"pnpm --filter @li4chess/worker test:rematch":selected.join(",")==="replay"?"pnpm --filter @li4chess/worker test:replay":"pnpm --filter @li4chess/worker test:campaign", selected, starts, hosted: false }, null, 2));
  await writeFile(resolve(output, "summary.json"), campaignJson({ passed: !failure, groups: observations.length, selected, starts, failure: failure instanceof Error ? failure.stack : failure ? String(failure) : null }, secrets));
}
if (failure) throw new Error(sanitizeCampaign(failure instanceof Error ? failure.stack ?? failure.message : String(failure), secrets));
