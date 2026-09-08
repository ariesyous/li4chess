import { expect, test } from "@playwright/test";
import { createInitialState } from "@li4chess/engine";
import type { GameState } from "@li4chess/engine";
import { recordReplay } from "@li4chess/protocol";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// The same public setup and replay-import path is used for both capture passes.
const producer = { format: "li4chess-engine-build-v1" as const, sourceRevision: "0".repeat(40),
  packageVersions: { "@li4chess/engine": "0.0.0", "@li4chess/protocol": "0.0.0" },
  workingTree: { status: "unreproducible" as const, reason: "UI1 visual fixture" } };
for (const [name, width, height] of [["desktop",1440,1000], ["short-desktop",1280,720], ["tablet",768,1024], ["phone",360,800]] as const) {
  test.describe(name, () => {
    test.use({ viewport: { width, height }, hasTouch: width < 1000 });
    test("UI1 setup, play, states and results fit the viewport", async ({ page }, info) => {
      const capture = async (state: string) => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const directory = process.env.UI1_CAPTURE ? resolve("../../docs/ui1-evidence", process.env.UI1_CAPTURE) : info.outputDir;
        await mkdir(directory, { recursive: true });
        await page.screenshot({ path: resolve(directory, `${name}-${state}.png`), fullPage: true });
      };
      await page.goto("/li4chess/");
      await capture("setup");
      for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
      await page.getByRole("button", { name: "Start game", exact: true }).click();
      const source = page.getByRole("button", { name: "g2 Red Pawn", exact: true });
      if (width < 1000) await source.tap(); else await source.click();
      await capture("play");
      await page.getByRole("button", { name: "g4 empty, legal destination", exact: true }).click();
      await expect(page.getByTestId("move-history").locator("li")).toHaveCount(1);
      const base = createInitialState();
      const checkBoard: GameState["board"][number][] = Array(196).fill(null);
      for (const [square, owner, type] of [[3,0,"K"], [94,1,"K"], [120,2,"K"], [153,3,"K"], [90,0,"Q"]] as const) {
        checkBoard[square] = { owner, type: type as NonNullable<GameState["board"][number]>["type"], hasMoved: true };
      }
      const checkReplay = await recordReplay({ ...base, board: checkBoard, positionCounts: {}, castlingRights: {
        0: { kingside:false, queenside:false }, 1: { kingside:false, queenside:false }, 2: { kingside:false, queenside:false }, 3: { kingside:false, queenside:false },
      } }, [], producer);
      await page.getByLabel("Import replay", { exact:true }).setInputFiles({name:"check.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(checkReplay))});
      await expect(page.getByTestId("player-2")).toContainText("Check");
      await expect(page.locator('[data-square="120"]')).toHaveAccessibleName(/in check/);
      await capture("check");
      const fixture: GameState = { ...base, completedMoves: {0:3,1:3,2:3,3:3}, eventSequence: 2,
        board: base.board.map(p => p?.type === "K" || p?.type === "R" ? p : null),
        players: {...base.players, 0: {...base.players[0],score:21},
          2: {...base.players[2], status:"resigned",kingStatus:"walking",forfeit:{reason:"resign",sequence:1}},
          3: {...base.players[3], status:"resigned",kingStatus:"walking",forfeit:{reason:"resign",sequence:2}}} };
      const replay = await recordReplay(fixture, [], producer);
      await page.getByLabel("Import replay", { exact:true }).setInputFiles({name:"ui1.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(replay))});
      await expect(page.getByTestId("replay-message")).toContainText("Replay verified");
      await expect(page.getByTestId("player-2")).toContainText("Walking King");
      await capture("walking");
      page.once("dialog", dialog => dialog.accept());
      await page.getByRole("button", {name:"Claim Win for Red",exact:true}).click();
      await expect(page.getByTestId("game-result")).toContainText("place 3 (shared)");
      await capture("result");
      const board = await page.locator(".chess-board").boundingBox();
      expect(board!.width).toBeLessThanOrEqual(width);
      for (const panel of await page.locator(".player-panel").all()) {
        expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
    });
  });
}
