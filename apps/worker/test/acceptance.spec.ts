import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalJson, engineState, readReplay, recordReplay, sha256, type ReplayEnvelopeV2 } from "@li4chess/protocol";
import { generated, assets, sha } from "../scripts/shared.js";

const build = JSON.parse(await readFile(resolve(generated, "build.json"), "utf8"));
const artifact = JSON.parse(await readFile(resolve(generated, "artifact.json"), "utf8")) as { assets: Record<string, string> };
const output = process.env.M3_02_OUTPUT!;
interface CpuObservation {
  type: "started" | "result"; version: number; requestId: string; gameId: string; stateId: string; seat: number;
  diagnostics?: { nodes: number; completedDepth: number; elapsedMs: number; fallback: boolean; stopped: string };
}
declare global { interface Window { workerMessages: CpuObservation[] } }

async function expectFullBoard(page: Page) {
  const geometry = await page.locator(".chess-board").evaluate(board => {
    const bounds = board.getBoundingClientRect();
    const squares = Array.from(board.querySelectorAll<HTMLElement>("[data-square]"));
    return { count: squares.length, outside: squares.filter(square => {
      const cell = square.getBoundingClientRect();
      return cell.left < bounds.left - 0.5 || cell.right > bounds.right + 0.5 ||
        cell.top < bounds.top - 0.5 || cell.bottom > bounds.bottom + 0.5 ||
        Math.abs(cell.width - cell.height) > 0.5;
    }).map(square => square.dataset.square) };
  });
  expect(geometry).toEqual({ count: 160, outside: [] });
}

test("HTTP contract rejects unknown APIs, upgrades, methods and internal paths without SPA fallback", async ({ request }) => {
  const observations = [];
  for (const method of ["GET", "HEAD"]) {
    for (const path of ["/api/health", "/api/build"]) {
      const response = await request.fetch(`${path}?private=do-not-reflect`, { method, headers: { Authorization: "Bearer do-not-reflect" } });
      expect(response.status()).toBe(200); expect(response.headers()["content-type"]).toBe("application/json; charset=utf-8");
      expect(response.headers()["cache-control"]).toBe("no-store");
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
      const body = await response.text(); expect(body.length).toBeLessThan(1024); expect(body).not.toContain("do-not-reflect");
      if (method === "HEAD") expect(body).toBe("");
      else if (path === "/api/build") expect(JSON.parse(body)).toEqual({ service: "li4chess", environment: "local",
        target: "workers", basePath: "/", sourceRevision: build.producer.sourceRevision,
        buildFingerprint: build.producer.buildFingerprint, workingTree: build.producer.workingTree.status });
      else expect(JSON.parse(body)).toEqual({ ok: true, service: "li4chess", environment: "local" });
      observations.push({ method, path, status: response.status(), headers: response.headers(), body });
    }
  }
  for (const path of ["/api", "/api/", "/api/missing", "/api/rooms/game/init", "/api/rooms/game/fault",
    "/api/rooms/game/forget", "/api%2Fmissing", "/%61pi/missing", "/src/main.tsx", "/src", "/node_modules", "/.generated/build.json",
    "/.git/config", "/assets/missing", "/assets/missing.js", "/missing.css", "/missing.png", "/favicon.ico", "/bad%252fpath"]) {
    const response = await request.get(path, { headers: { Accept: "text/html", "Sec-Fetch-Mode": "navigate" } });
    expect(response.status(), path).toBe(404); expect(response.headers()["content-type"]).toContain("application/json");
    expect(await response.json()).toEqual({ error: "not_found" });
    observations.push({ method: "GET", path, status: response.status(), body: await response.text() });
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    for (const path of ["/api/health", "/api/build", "/api/missing", "/", "/assets/missing.js"]) {
      const response = await request.fetch(path, { method, data: "ignored input" });
      expect(response.status()).toBe(405); expect(response.headers().allow).toBe("GET, HEAD");
      expect(await response.json()).toEqual({ error: "method_not_allowed" });
    }
  }
  for (const path of ["/api/health", "/api/rooms/game/ws", "/"]) {
    const response = await request.get(path, { headers: { Upgrade: "websocket", Connection: "Upgrade" } });
    expect(response.status()).toBe(400); expect(await response.json()).toEqual({ error: "upgrade_not_supported" });
  }
  expect((await request.get("/api/health")).status()).toBe(200);
  await writeFile(resolve(output, "http-observations.json"), JSON.stringify(observations, null, 2));
});

test("Static Assets returns exact built bytes and MIME types, navigation and HEAD preserve the shell", async ({ request }) => {
  for (const [name, hash] of Object.entries(artifact.assets)) {
    const response = await request.get(`/${name}`);
    expect(response.status(), name).toBe(200); expect(sha(await response.body()), name).toBe(hash);
    if (name.endsWith(".js")) expect(response.headers()["content-type"]).toMatch(/(?:text|application)\/javascript/);
    if (name.endsWith(".css")) expect(response.headers()["content-type"]).toContain("text/css");
    if (name.endsWith(".html")) expect(response.headers()["content-type"]).toContain("text/html");
    const head = await request.head(`/${name}`); expect(head.status()).toBe(200); expect(await head.text()).toBe("");
  }
  const shell = await readFile(resolve(assets, "index.html"), "utf8");
  for (const path of ["/", "/index.html", "/play", "/play/local", "/play/local/", "/play?source=refresh", "/li4chess/"]) {
    const response = await request.get(path, { headers: { "Sec-Fetch-Mode": "navigate" } });
    expect(response.status(), path).toBe(200); expect(await response.text()).toBe(shell);
    expect(response.headers()["content-type"]).toContain("text/html");
    const head = await request.head(path); expect(head.status()).toBe(200); expect(await head.text()).toBe("");
  }
  // Root-path Workers output never pretends to host Pages-prefixed bundles.
  const js = Object.keys(artifact.assets).find(name => /^assets\/index-.*\.js$/.test(name))!;
  expect((await request.get(`/li4chess/${js}`)).status()).toBe(404);
});

async function exportGame(page: Page): Promise<ReplayEnvelopeV2> {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export replay", exact: true }).click();
  const file = await pending; const replay = JSON.parse(await readFile((await file.path())!, "utf8"));
  await readReplay(replay); expect(replay.engineBuild).toEqual(build.producer); return replay;
}

test("bundled CPU Worker makes real turns; refresh, save and replay import retain producer lineage", async ({ page, browser }) => {
  const errors: string[] = [], workers: string[] = [], responses: { url: string; status: number }[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("worker", worker => workers.push(worker.url()));
  page.on("response", response => { if (response.url().includes("/assets/")) responses.push({ url: response.url(), status: response.status() }); });
  await page.addInitScript(() => {
    window.workerMessages = [];
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", event => window.workerMessages.push(event.data));
      }
    };
  });
  await page.goto("/play/local");
  for (const select of await page.locator("select").all()) await select.selectOption("1");
  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByRole("button", { name: "g2 Red Pawn", exact: true }).click();
  await page.getByRole("button", { name: "g4 empty, legal destination", exact: true }).click();
  await expect(page.getByTestId("turn-status")).toContainText("Turn 5 — Red to move", { timeout: 15000 });
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(4);
  await expectFullBoard(page);
  expect(workers).toHaveLength(3);
  const messages = await page.evaluate(() => window.workerMessages);
  expect(messages.map(message => message.type)).toEqual(["started", "result", "started", "result", "started", "result"]);
  for (let index = 0; index < 6; index += 2) {
    const started = messages[index], result = messages[index + 1];
    expect(result).toMatchObject({ version: 1, requestId: started.requestId, gameId: started.gameId,
      stateId: started.stateId, seat: index / 2 + 1 });
    expect(result.diagnostics!.fallback).toBe(false);
    expect(result.diagnostics!.completedDepth).toBe(1);
    expect(result.diagnostics!.nodes).toBeGreaterThan(0);
    expect(result.diagnostics!.nodes).toBeLessThanOrEqual(128);
    expect(result.diagnostics!.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(["depth", "nodes", "time"]).toContain(result.diagnostics!.stopped);
  }
  await expect(page.getByText(/CPU recovery/)).toHaveCount(0);
  for (const url of workers) expect(new URL(url).pathname).toMatch(/^\/assets\/cpu\.worker-[\w-]+\.js$/);
  expect(responses.some(item => item.url.endsWith(".css") && item.status === 200)).toBe(true);
  expect(responses.some(item => /\/assets\/index-.*\.js$/.test(item.url) && item.status === 200)).toBe(true);
  expect(responses.every(item => item.status === 200)).toBe(true);
  const saved = await exportGame(page); const savedState = (await readReplay(saved)).state;
  const expectedCheckpoint = await recordReplay(engineState(savedState), [], build.producer, await sha256(canonicalJson(saved)));
  await page.reload(); await page.getByRole("button", { name: "Resume saved game" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByTestId("turn-status")).toContainText("Turn 5 — Red to move");
  const resumed = await exportGame(page);
  expect(resumed).toEqual(expectedCheckpoint);
  expect(resumed.game.sourceReplayHash).toBe(await sha256(canonicalJson(saved)));
  await page.getByLabel("Import replay").setInputFiles({ name: "saved.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(page.getByTestId("replay-message")).toContainText("Replay verified");
  const imported = await exportGame(page);
  expect(imported).toEqual(expectedCheckpoint);
  expect(imported.game.sourceReplayHash).toBe(await sha256(canonicalJson(saved)));
  expect(errors).toEqual([]);
  await page.screenshot({ path: resolve(output, "worker-game.png"), fullPage: true });
  await writeFile(resolve(output, "worker-game.replay.json"), JSON.stringify(saved, null, 2));
  await writeFile(resolve(output, "browser-observations.json"), JSON.stringify({ browserVersion: browser.version(), workers, messages, responses, errors }, null, 2));
});

test("phone viewport preserves keyboard board controls through Worker navigation and refresh", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto("/play");
  for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
  await page.getByRole("button", { name: "Start game" }).click();
  const pawn = page.getByRole("button", { name: "g2 Red Pawn", exact: true });
  await pawn.focus(); await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp"); await page.keyboard.press("Enter");
  await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
  await expectFullBoard(page);
  await expect(page.getByTestId("save-message")).toContainText("Saved on this browser");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload(); await page.getByRole("button", { name: "Resume saved game" }).click();
  await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
  await page.screenshot({ path: resolve(output, "worker-phone.png"), fullPage: true });
});
