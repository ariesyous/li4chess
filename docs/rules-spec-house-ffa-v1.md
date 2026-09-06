# Historical house-rule specification

Frozen specification from `bb6677439c159a9b53ce3a5029982f667c4a99d4`.
This records `li4chess-house-ffa-v1`, including its known errors and unverified
claims. It is historical evidence, not the current engine or accepted FFA target.

# li4chess Rules Spec — 4-Player Free-For-All

> **Current implementation baseline, not the public-release target.** On
> 2026-09-06, the maintainer chose compatibility with Chess.com's standard FFA
> rules. The house rules below remain the existing engine's specification until
> the versioned M1 migration. See [ROADMAP.md](../ROADMAP.md) and
> [project state](project-state.md). Do not claim compatibility from this document;
> preserve its historical version when replacing it.

This is the authoritative ruleset the engine implements and tests are checked against. Where no universal standard exists across other 4-player chess implementations, a deliberate house ruling is made and flagged as such.

## Board

- 14x14 grid, squares addressed by `(file, rank)`, both `0..13`.
- Corner cutout: the four 3x3 blocks where `(file < 3 || file > 10) && (rank < 3 || rank > 10)` do not exist. 160 playable squares remain, forming a cross/plus shape.
- Seating, clockwise turn order: **Red** (bottom, ranks 0-1, files 3-10) -> **Blue** (left, files 0-1, ranks 3-10) -> **Yellow** (top, ranks 12-13, files 3-10) -> **Green** (right, files 12-13, ranks 3-10). This matches Chess.com's FFA layout, the only widely-known reference implementation.
- Each player's back rank uses standard chess order, queenside to kingside: Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook, with a full pawn rank in front. Each player's own local frame is used to place this (see Engine README / `board.ts`), so all 4 sides are consistent rotations of one another.

## Turn order

Fixed rotation Red -> Blue -> Yellow -> Green -> Red ..., skipping any player whose status is not `active`. If only one player remains active, the game ends immediately.

## Legality

A move is illegal iff, after applying it, the **moving player's own** king is left in check. This is evaluated independently per mover.

Separately (detection, not a legality constraint): after a move is applied, each of the other (up to 3) players' kings is checked for check, and the move is annotated with which colors are newly in check (`Move.isCheck`, 0-3 entries). A single move can check multiple opponents at once (e.g. a discovered check plus a direct check along a different line).

**Deferred checkmate consequence:** because turn order is a fixed rotation (not "whoever is in check moves next"), a move can check a player who isn't next in rotation (e.g. Green's move checks Red, but Red->Blue->Yellow->Green->Red means Blue or Yellow may move first). That player's checkmate/stalemate status is only evaluated once rotation actually reaches them, using the board as it stands at that moment (which may have changed in the meantime) — not eagerly resolved the instant the check occurs. This is a deliberate consequence of the legality rule above (only the mover's own king matters when validating a move), not a special case bolted on afterward.

## Checkmate

A player with no legal move while their king is in check is **checkmated**: their king and all remaining pieces are immediately removed from the board (they vanish — not captured by, nor scored to, any opponent). Their status becomes `checkmated`, and the turn passes to the next active player in rotation. No other piece's pin/check calculation may reference the removed king afterward.

## Stalemate — house ruling

**No universal standard exists** for stalemate in multiplayer FFA chess (single-source implementations vary, and there is no published authoritative rules document). li4chess's ruling:

A player with no legal move whose king is **not** in check is **stalemated**: their status becomes `stalemated`, their remaining pieces stay frozen in place on the board (not removed — still capturable/usable as blockers by the other players), and they are skipped in every future turn rotation.

This is chosen over "remove pieces like checkmate" (a disproportionate windfall for being merely stuck, not defeated) and over "just skip their turn and re-check every rotation" (functionally near-identical once truly stalemated, but this framing keeps their material meaningfully on the board for the remaining players to interact with, and gives a clear, distinct status for the UI to display). **This ruling should be spot-checked against real Chess.com behavior before being considered final** — it is a best-effort convention, not a verified fact.

## Scoring

Points are credited to the capturing player at the moment of capture: Pawn = 1, Knight = 3, Bishop = 3, Rook = 5, Queen = 9. No points for kings (kings are never "captured" — see Checkmate above). Score is used only to break placement ties among eliminated players; it is not itself a win condition in FFA v1.

## Game end and placement

The game ends when exactly one player remains `active`; that player is the winner. Among eliminated/stalemated players, placement ranks by later elimination turn = better placement. Ties (e.g. two players eliminated on the exact same move, via a simultaneous double-checkmate) are broken by score, then by fixed seat order (Red > Blue > Yellow > Green) as a last, deterministic resort.

## Draws by threefold repetition

If the same position — board occupants, whose turn it is, castling rights, the en passant target, and every player's status (active/checkmated/stalemated) — recurs 3 times over the course of the game, the game ends immediately in a **draw**: every currently-`active` player ties for 1st place, and already-eliminated players are ranked below them exactly as in a normal game end. This exists because weak CPU endgames (e.g. a lone king and knight with no way to force progress) can otherwise shuffle forever with no other end condition to stop them. `GameResult.reason` distinguishes `"elimination"` from `"repetition"` so the UI can label a draw as a draw rather than showing a false single winner.

## En passant

Standard rule, evaluated relative to each pawn's own player-local forward direction (Red moves toward increasing rank, Blue toward increasing file, Yellow toward decreasing rank, Green toward decreasing file). The en passant target square is set only immediately after a double pawn push and is cleared unconditionally after the very next move by any player, matching standard chess timing.

**Geometric consequence (not a house ruling — falls out of the board geometry):** only the player seated *directly opposite* the double-pushing player (Red<->Yellow, or Blue<->Green) can ever capture that pawn en passant. A pawn belonging to either adjacent player (e.g. Blue or Green reacting to a Red double push) can never land a diagonal capture on the passed-over square, since its forward/diagonal axis is rotated 90 degrees relative to the pusher's. This was verified directly against the move generator (see `test/pawns.test.ts`) rather than assumed.

## Castling

Each player's king and rooks start on their own back rank in their own local frame; castling geometry (king moves 2 squares toward the rook, rook jumps to the far side) is expressed once generically in local-frame terms and reused for all 4 orientations — it is not 4 separate implementations. Requirements: king and the chosen rook have not moved, all squares between them are empty, the king is not currently in check, and the king does not pass through or land on any square attacked by **any** other active player (evaluated against up to 3 possible attackers, not just one).

## Promotion

A pawn promotes upon reaching the far rank in its own local forward direction (local rank 13 in its own frame). Promotes to Queen, Rook, Bishop, or Knight, player's choice (CPU/auto-resolve defaults to Queen).
