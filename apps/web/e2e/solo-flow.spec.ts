import { expect, test } from "@playwright/test";
import { createInitialState } from "@li4chess/engine";
import { recordReplay } from "@li4chess/protocol";
import type { EngineBuildIdentityV1 } from "@li4chess/protocol";
import { resumeLocalGame } from "../src/game/localSave.js";
import { makeARedPawnMove, openCustomize, openGameTools } from "./helpers.js";

const producer: EngineBuildIdentityV1 = {
  format: "li4chess-engine-build-v1", sourceRevision: "0".repeat(40),
  packageVersions: { "@li4chess/engine": "0.0.0", "@li4chess/protocol": "0.0.0" },
  workingTree: { status: "unreproducible", reason: "Solo flow browser fixture" },
};

test("play again immediately starts fresh with customized seats and difficulty", async ({ page }) => {
  await page.goto("/"); await openCustomize(page);
  await page.getByLabel("Blue difficulty").selectOption("2");
  await page.getByLabel("Yellow CPU", { exact: true }).uncheck();
  await page.getByLabel("Green CPU", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await makeARedPawnMove(page);
  await expect(page.getByTestId("turn-status")).toContainText("Yellow to move");
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(2);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Resign Yellow", exact: true }).click();
  await expect(page.getByTestId("game-result")).toContainText("Game aborted");
  await expect(page.getByRole("button", { name: "Change settings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Play again", exact: true }).click();
  await expect(page.getByTestId("turn-banner")).toBeFocused();
  await expect(page.getByTestId("turn-status")).toContainText("Turn 1");
  await expect(page.getByTestId("game-result")).toHaveCount(0);
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(0);
  await expect(page.getByTestId("player-1")).toContainText("CPU L2");
  for (const color of [0, 2, 3]) await expect(page.getByTestId(`player-${color}`)).toContainText("Human");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("li4chess.local-game.v1")!));
  expect(saved.requests).toEqual([]);
  expect(saved.sourceReplayHash).toBeUndefined();
});

test("rematch and Change settings use imported current seats, clearing results and points", async ({ page }) => {
  const initial = { ...createInitialState({ isCPU: { 0: false, 1: true, 2: true, 3: true },
    cpuDifficulty: { 0: 3, 1: 1, 2: 4, 3: 5 } }), reversibleMoves: 199 };
  const replay = await recordReplay(initial, [{ type: "move", actor: 0, move: { from: 4, to: 31 } }], producer);
  await page.goto("/"); await page.getByRole("button", { name: "Play against computers" }).click();
  await openGameTools(page);
  await page.getByLabel("Import replay", { exact: true }).setInputFiles({ name: "finished.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(replay)) });
  await expect(page.getByTestId("game-result")).toContainText("50-move rule");
  await expect(page.getByTestId("award-ledger").locator("li")).toHaveCount(4);
  await expect(page.locator("#result-heading")).toBeFocused();
  await page.getByRole("button", { name: "Play again", exact: true }).click();
  await expect(page.getByTestId("turn-banner")).toBeFocused();
  await expect(page.getByTestId("turn-status")).toContainText("Your turn");
  await expect(page.getByTestId("replay-message")).toHaveCount(0);
  await expect(page.getByTestId("move-history").locator("li")).toHaveCount(0);
  await expect(page.getByTestId("award-ledger").locator("li")).toHaveCount(0);
  for (const [color, level] of [[1, 1], [2, 4], [3, 5]]) await expect(page.getByTestId(`player-${color}`)).toContainText(`CPU L${level}`);
  for (const color of [0, 1, 2, 3]) await expect(page.getByTestId(`player-${color}`)).toContainText("0 pts");
  const saved = await page.evaluate(() => localStorage.getItem("li4chess.local-game.v1"));
  const recovered = await resumeLocalGame({ getItem: () => saved, setItem: () => {} });
  expect(recovered.state.board).toEqual(createInitialState().board);
  expect(recovered.state.moveHistory).toEqual([]);
  expect(recovered.state.result).toBeNull();
  expect(JSON.parse(saved!).sourceReplayHash).toBeUndefined();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Resign Red", exact: true }).click();
  await page.getByRole("button", { name: "Change settings", exact: true }).click();
  await openCustomize(page);
  await expect(page.getByLabel("Red CPU", { exact: true })).not.toBeChecked();
  for (const [name, level] of [["Blue", "1"], ["Yellow", "4"], ["Green", "5"]]) {
    await expect(page.getByLabel(`${name} CPU`, { exact: true })).toBeChecked();
    await expect(page.getByLabel(`${name} difficulty`, { exact: true })).toHaveValue(level);
  }
  await expect(page.getByRole("button", { name: "Resume saved game", exact: true })).toBeVisible();
});

test("an eliminated solo player can watch continuing CPUs or return to setup without losing the save", async ({ page }) => {
  const base = createInitialState({ isCPU: { 0: false, 1: true, 2: true, 3: true }, cpuDifficulty: { 1: 1, 2: 1, 3: 1 } });
  const initial = { ...base, completedMoves: { 0: 3, 1: 3, 2: 3, 3: 3 },
    board: base.board.map(piece => piece?.type === "K" || piece?.type === "R" ? piece : null) };
  const replay = await recordReplay(initial, [{ type: "resign", actor: 0 }], producer);
  await page.goto("/"); await page.getByRole("button", { name: "Play against computers" }).click();
  await openGameTools(page);
  await page.getByLabel("Import replay", { exact: true }).setInputFiles({ name: "eliminated.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(replay)) });
  const notice = page.getByTestId("solo-eliminated");
  await expect(notice).toContainText("Your army is out");
  await page.getByRole("button", { name: "Watch the finish", exact: true }).click();
  await expect(notice).toContainText("Watching the finish");
  await expect.poll(() => page.getByTestId("move-history").locator("li").count()).toBeGreaterThanOrEqual(3);
  await expect(notice).toBeVisible();
  await page.getByRole("button", { name: "Start another game", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume saved game", exact: true })).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem("li4chess.local-game.v1"));
  const recovered = await resumeLocalGame({ getItem: () => saved, setItem: () => {} });
  expect(recovered.state.players[0].status).toBe("resigned");
  expect(recovered.state.moveHistory.length).toBeGreaterThanOrEqual(3);
});
