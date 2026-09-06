import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createInitialState } from "@li4chess/engine";
import { recordReplay } from "@li4chess/protocol";
import type { EngineBuildIdentityV1 } from "@li4chess/protocol";

declare global {
  interface Window { cpuProbe: { started: number; results: number; terminated: number; busy: boolean } }
}
async function observeWorkers(page: Page) {
  await page.addInitScript(() => {
    window.cpuProbe = { started: 0, results: 0, terminated: 0, busy: false };
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", event => {
          if (event.data?.type === "started") { window.cpuProbe.started++; window.cpuProbe.busy = true; }
          if (event.data?.type === "result") { window.cpuProbe.results++; window.cpuProbe.busy = false; }
        });
      }
      override terminate() { window.cpuProbe.terminated++; window.cpuProbe.busy = false; super.terminate(); }
    };
  });
}
async function startRedCpu(page: Page) {
  await page.goto("/");
  for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
  await page.locator('input[type="checkbox"]').first().check();
  await page.locator("select").selectOption("5");
  await page.getByRole("button", { name: "Start game" }).click();
  await page.waitForFunction(() => window.cpuProbe.busy);
}

test("real level-5 Worker keeps input usable; leaving terminates active search", async ({ page }) => {
  await observeWorkers(page); await startRedCpu(page);
  await page.getByLabel("Rotate board to current player").check();
  await expect(page.getByLabel("Rotate board to current player")).toBeChecked();
  expect(await page.evaluate(() => window.cpuProbe.busy)).toBe(true);
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start game" })).toBeVisible();
  expect(await page.evaluate(() => window.cpuProbe.terminated)).toBe(1);
  for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
  await page.getByRole("button", { name: "Start game" }).click();
  await page.waitForTimeout(1300);
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(0);
  expect(await page.evaluate(() => window.cpuProbe.results)).toBe(0);
});

test("import during real active search terminates old Worker and preserves the imported turn", async ({ page }) => {
  const producer: EngineBuildIdentityV1 = { format: "li4chess-engine-build-v1", sourceRevision: "0".repeat(40), packageVersions: { "@li4chess/engine": "0.0.0", "@li4chess/protocol": "0.0.0" },
    workingTree: { status: "unreproducible", reason: "Worker lifecycle acceptance fixture" } };
  const saved = await recordReplay(createInitialState(), [], producer);
  await observeWorkers(page); await startRedCpu(page);
  await page.getByLabel("Import replay").setInputFiles({ name: "hotseat.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(page.getByTestId("replay-message")).toContainText("Replay verified");
  expect(await page.evaluate(() => window.cpuProbe.terminated)).toBe(1);
  await page.waitForTimeout(1300);
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(0);
  await expect(page.getByTestId("turn-status")).toContainText("Red to move");
  expect(await page.evaluate(() => window.cpuProbe.results)).toBe(0);
});

test("terminal action cancels an active real Worker", async ({ page }) => {
  await observeWorkers(page); await startRedCpu(page);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Resign Red", exact: true }).click();
  await expect(page.getByTestId("game-result")).toContainText("Game aborted");
  expect(await page.evaluate(() => window.cpuProbe.terminated)).toBe(1);
  await page.waitForTimeout(1300);
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(0);
});

test("confirmed reset terminates active search and only the new game can move", async ({ page }) => {
  await observeWorkers(page); await startRedCpu(page);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Reset game", exact: true }).click();
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(0);
  expect(await page.evaluate(() => window.cpuProbe.terminated)).toBe(1);
  await expect(page.getByTestId("turn-status")).toContainText("Blue to move", { timeout: 8000 });
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(1);
  expect(await page.evaluate(() => window.cpuProbe.results)).toBe(1);
  await expect(page.getByTestId("player-0")).toContainText("CPU L5");
});

test("refresh during real active search resumes exactly one CPU turn with saved difficulty", async ({ page }) => {
  await observeWorkers(page); await startRedCpu(page);
  await page.reload();
  await page.getByRole("button", { name: "Resume saved game" }).click();
  await page.waitForFunction(() => window.cpuProbe.busy);
  await expect(page.getByTestId("turn-status")).toContainText("Red to move");
  await expect(page.getByTestId("turn-status")).toContainText("Blue to move", { timeout: 8000 });
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(1);
  expect(await page.evaluate(() => window.cpuProbe.results)).toBe(1);
  await expect(page.getByTestId("player-0")).toContainText("CPU L5");
});

for (const failure of ["constructor", "crash", "watchdog"] as const) {
  test(`${failure} recovery applies exactly one legal move`, async ({ page }) => {
    if (failure === "constructor") {
      await page.addInitScript(() => { window.Worker = class { constructor() { throw new Error("Unavailable Worker"); } } as unknown as typeof Worker; });
    } else {
      // Real Worker failure/hang, deliberately injected at its module boundary.
      await page.route("**/src/game/cpu.worker.ts*", route => route.fulfill({ contentType: "application/javascript",
        body: failure === "crash" ? 'throw new Error("Injected Worker crash")' : 'self.onmessage = () => { while (true) {} };' }));
    }
    await page.goto("/");
    for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
    await page.locator('input[type="checkbox"]').first().check();
    await page.locator("select").selectOption("1");
    await page.getByRole("button", { name: "Start game" }).click();
    await expect(page.getByTestId("turn-status")).toContainText("Blue to move", { timeout: 8000 });
    await expect(page.getByTestId("move-history").locator("li")).toHaveCount(1);
    await page.waitForTimeout(700);
    await expect(page.getByTestId("move-history").locator("li")).toHaveCount(1);
  });
}
