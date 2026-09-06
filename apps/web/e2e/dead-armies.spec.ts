import { expect, test } from "@playwright/test";
import { GameState, PieceType, PlayerColor, createInitialState, squareOf } from "@li4chess/engine";
import { resolveAction } from "@li4chess/protocol";

for (const status of ["checkmated", "stalemated"] as const) for (const walking of [false, true]) {
  test(`${walking ? "walking King" : "active King"} ${status}: retained army is grey, unselectable, unchecked and zero-point capturable`, async ({ page }) => {
    const base = createInitialState();
    const board = base.board.map(() => null) as (GameState["board"][number])[];
    const { King:K, Knight:N, Pawn:P, Rook:R } = PieceType;
    for (const [f,r,type,owner] of [
      [3,0,K,0], [0,6,K,1], [8,10,K,2], [13,7,K,3],
      [5,0,N,1], [6,1,N,1], [6,2,N,1], [3,13,P,0], [3,9,R,1], [3,5,N,1],
      ...(status === "checkmated" ? [[3,3,R,1] as const] : []),
    ] as const) board[squareOf(f,r)] = { type, owner, hasMoved:true };
    let initial: GameState = { ...base, board, turn:PlayerColor.Green, positionCounts:{},
      castlingRights:{ 0:{ kingside:false, queenside:false }, 1:{ kingside:false, queenside:false },
        2:{ kingside:false, queenside:false }, 3:{ kingside:false, queenside:false } } };
    if (walking) initial = resolveAction({ ...initial, completedMoves: { 0:3, 1:3, 2:3, 3:3 } }, { type: "resign", actor: 0 }).after;
    // Supply a deterministic initial position only in this browser test. The
    // real hook, reducer, selection, and rendering handle every subsequent move.
    await page.route("**/src/game/useLocalGame.ts", async route => {
      const response = await route.fetch();
      const source = await response.text();
      const initializer = "createInitialState(toSeatConfig(seats))";
      expect(source).toContain(initializer);
      await route.fulfill({ response, body:source.replace(initializer, `(${JSON.stringify(initial)})`) });
    });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    await expect(page.getByRole("button", { name:"Start game" })).toBeVisible();
    for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.uncheck();
    await page.getByRole("button", { name:"Start game" }).click();
    const square = (f: number, r: number) => page.locator(`button[data-square="${squareOf(f,r)}"]`);
    await square(13,7).click();
    await square(12,7).click();
    await expect(page.getByTestId("turn-status")).toContainText("Blue to move");
    await expect(page.getByTestId("action-announcement")).toContainText(`Red ${walking ? "King " : ""}${status}; dead army.`);
    if (!walking) await expect(page.getByText(`Red is ${status}`, { exact:false })).toContainText("zero points");
    await expect(page.getByRole("button", { name:/dead Red/ })).toHaveCount(2);
    await expect(square(3,0)).toHaveCSS("outline-style", "none");
    await expect(square(3,0).locator("span")).toHaveCSS("color", "rgb(119, 119, 119)");
    await square(3,0).click();
    await expect(square(3,0)).not.toHaveCSS("background-color", "rgb(245, 215, 110)");
    await square(3,9).click();
    await square(3,13).click();
    await expect(square(3,13)).toHaveAttribute("aria-label", "d14 Blue Rook, last move");
    await expect(page.getByRole("button", { name:/dead Red/ })).toHaveCount(1);
    await expect(page.getByTestId("player-1")).toContainText(`${status === "checkmated" ? 20 : 10} pts`);
    await expect(page.getByTestId("player-1")).toContainText("Human");
    expect(errors).toEqual([]);
  });
}
