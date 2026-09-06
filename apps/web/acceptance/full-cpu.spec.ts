import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readReplay } from "@li4chess/protocol";
import { resumeLocalGame } from "../src/game/localSave.js";
import { observeProduction } from "./observer.js";
import { directory, producer, saveEvidence, beginEvidence } from "./run.js";

test("uninterrupted four production CPUs finish a Modern game and resume its exact result", async ({ page, browser }) => {
  beginEvidence("four-cpu");
  await page.setViewportSize({ width:1280, height:900 });
  await observeProduction(page);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("./"); await page.getByLabel("Red CPU", { exact: true }).check();
  for (const select of await page.locator("select").all()) await select.selectOption("1");
  await page.getByRole("button", { name: "Start game" }).click();
  // The observation limit is not a draw. On failure retain the unfinished journal.
  try { await expect(page.getByTestId("game-result")).toBeVisible({ timeout: 780_000 }); }
  catch (error) {
    saveEvidence("four-cpu-unfinished.json", { journal: await page.evaluate(() => localStorage.getItem("li4chess.local-game.v1")), reason: "Observation limit; unfinished" });
    throw error;
  }
  await expect(page.locator("#result-heading")).toBeFocused();
  const observations = await page.evaluate(() => window.m2.jobs.map(({ request, ...job }) => ({ ...job, request: request && { ...request, stateJson: undefined } })));
  const pending = page.waitForEvent("download"); await page.getByRole("button", { name: "Export replay", exact: true }).click();
  const download = await pending; await download.saveAs(resolve(directory, "four-cpu.replay.json"));
  const replay = JSON.parse(await readFile(resolve(directory, "four-cpu.replay.json"), "utf8"));
  const checked = await readReplay(replay);
  expect(replay.engineBuild).toEqual(producer);
  expect(replay.game.setupId).toBe("li4chess-modern-ffa-setup-v1");
  expect(checked.state.position.result).not.toBeNull(); expect(checked.state.position.result?.reason).not.toBe("abort");
  expect(errors).toEqual([]); expect(observations.length).toBeGreaterThan(12);
  expect(observations.every(job => job.response && !job.error && job.request?.requestId === job.response.requestId)).toBe(true);
  await page.screenshot({ path: resolve(directory, "four-cpu-result-1280.png"), fullPage: true });
  saveEvidence("four-cpu.json", { browser: browser.version(), result: checked.state.position.result,
    plies: checked.state.position.moveHistory.length, observations, errors, randomness: "Production Math.random; returned moves preserved; walking seed in replay" });
  await page.reload(); await page.getByRole("button", { name: "Resume saved game" }).click();
  await expect(page.getByTestId("game-result").locator("li")).toHaveCount(4);
  const journal = await page.evaluate(() => localStorage.getItem("li4chess.local-game.v1"));
  const resumed = await resumeLocalGame({ getItem: () => journal, setItem: () => {} });
  expect(resumed.state.result).toEqual(checked.state.position.result);
  expect(resumed.state.awardLedger).toEqual(checked.state.position.awardLedger);
  saveEvidence("four-cpu-resume.json", { finalStateHash: replay.finalStateHash, exactResultAndLedger: true });
});
