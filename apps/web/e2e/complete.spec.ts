import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { legalMoves, localSquare } from "@li4chess/engine";
import { readReplay } from "@li4chess/protocol";
import type { ReplayEnvelopeV2 } from "@li4chess/protocol";
import { resumeLocalGame } from "../src/game/localSave.js";

export async function exportCompleted(page: Page, info: TestInfo, name: string) {
  await expect(page.locator("#result-heading")).toBeFocused();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export replay", exact: true }).click();
  const download = await pending, path = info.outputPath(`${name}.replay.json`);
  await download.saveAs(path);
  const replay = JSON.parse(await readFile(path, "utf8")) as ReplayEnvelopeV2;
  const checked = await readReplay(replay);
  expect(replay.result).not.toBeNull(); expect(replay.result!.result.reason).not.toBe("abort");
  expect(replay.game.setupId).toBe("li4chess-modern-ffa-setup-v1");
  await expect(page.getByTestId("game-result").locator("li")).toHaveCount(4);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  await page.reload(); await page.getByRole("button", { name: "Resume saved game" }).click();
  await expect(page.getByTestId("game-result").locator("li")).toHaveCount(4);
  const saved = await page.evaluate(() => localStorage.getItem("li4chess.local-game.v1"));
  const resumed = await resumeLocalGame({ getItem: () => saved, setItem: () => {} });
  expect(resumed.state.result).toEqual(replay.result!.result);
  expect(resumed.state.awardLedger).toEqual(checked.state.position.awardLedger);
  return replay;
}

test("complete phone hotseat game: Modern opening to repetition, export and terminal resume", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 900 }); await page.goto("/");
  for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
  await page.getByRole("button", { name: "Start game" }).click();
  for (let ply = 0; ply < 16; ply++) {
    const color = ply % 4 as 0 | 1 | 2 | 3, home = localSquare(color, 1, 0), out = localSquare(color, 0, 2);
    const from = Math.floor(ply / 4) % 2 === 0 ? home : out, to = from === home ? out : home;
    await page.locator(`[data-square="${from}"]`).focus(); await page.keyboard.press("Enter");
    await page.locator(`[data-square="${to}"]`).focus(); await page.keyboard.press("Enter");
  }
  await expect(page.getByTestId("game-result")).toContainText("threefold repetition");
  const replay = await exportCompleted(page, info, "hotseat-360");
  expect(replay.events.filter(event => event.type === "move")).toHaveLength(16);
  expect(replay.result!.result.placements.every(p => p.score === 10 && p.place === 1)).toBe(true);
});

test("complete mixed game: real CPU opening, deliberate forfeits, walking Kings and final awards", async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 768, height: 900 }); await page.goto("/");
  await page.getByLabel("Yellow CPU", { exact:true }).uncheck(); await page.getByLabel("Green CPU", { exact:true }).uncheck();
  for (const select of await page.locator("select").all()) await select.selectOption("1");
  await page.getByRole("button", { name: "Start game" }).click();
  for (let ply = 0; ply < 12; ply++) {
    if (ply % 4 === 1) continue;
    const color = ply % 4 as 0 | 2 | 3;
    await expect(page.getByTestId("turn-status")).toContainText(`Turn ${ply + 1} — ${["Red", "Blue", "Yellow", "Green"][color]} to move`, { timeout: 10_000 });
    const saved = await page.evaluate(() => localStorage.getItem("li4chess.local-game.v1"));
    const { state } = await resumeLocalGame({ getItem: () => saved, setItem: () => {} });
    // Open a square next to each human King so the later forfeits can walk.
    const move = legalMoves(state).find(move => move.from === localSquare(color, 3, Math.floor(ply / 4) + 1) && move.to === localSquare(color, 3, Math.floor(ply / 4) + 2))!;
    expect(move).toBeDefined();
    await page.locator(`[data-square="${move.from}"]`).click(); await page.locator(`[data-square="${move.to}"]`).click();
  }
  await expect(page.getByTestId("turn-status")).toContainText("Turn 13 — Red to move", { timeout: 10_000 });
  for (const color of ["Red", "Yellow", "Green"]) {
    await expect(page.getByTestId("turn-status")).toContainText(`${color} to move`);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: `Resign ${color}`, exact: true }).click();
  }
  const replay = await exportCompleted(page, info, "mixed-768");
  expect(replay.events.filter(event => event.type === "move")).toHaveLength(13);
  expect(replay.events.filter(event => event.type === "randomKingMove")).toHaveLength(2);
  expect(replay.result!.result).toMatchObject({ reason: "elimination", winner: 1 });
  expect((await readReplay(replay)).state.position.awardLedger.filter(a => a.rule === "survivor").map(a => a.delta)).toEqual([20,20,20]);
});
