# Classic baseline (recorded before experimental search changes)

Fetched origin/main on 2026-09-05: **867b4cb6e4599e9fd006cde1951309bb90b27718**,
`Make the bot actually seek pawn promotion instead of shuffling forever (#6)`.
Initial working tree was clean. Branch: `codex/engine-rd-spike`.

`packages/bot/src/classic/` is a verbatim snapshot of the four bot source files
at this SHA. `classic-v1` means level 5, deterministic, full evaluation, depth 5.
Budget-reduced classic configurations must have distinct IDs; they are not the
strongest baseline. The snapshot still uses the unchanged TypeScript rules
oracle, so future rules changes require a new baseline version or pinned checkout.

## Call path and correctness inventory

`useLocalGame` waits 400 ms, then synchronously calls `chooseCpuMove` on the UI
thread. Difficulty selects depth 1–5 and evaluation weights. `rankMoves` orders
captures/checks and calls paranoid alpha-beta on each `applyMove` child. Every
opponent minimizes the root player's scalar. Leaves, including finished games,
call material or full evaluation. Root alpha is shared: later root scores may be
upper bounds, so the ranked list is not an exact MultiPV list. `chooseCpuMove`
applies every root move again to prefer all novel positions over any repetition,
then sometimes samples top K without checking score distance.

The board is a flat 196-cell array with 160 playable squares. Player-local
rotations share pawn/castling geometry. Pseudo generation allocates ray/leaper
arrays. Legal filtering clones the board per candidate, checks the mover's king
against active opponents, and annotates every checked opponent. `applyMove`
clones board/player/rights records, updates score and en passant, regenerates
next-player legal moves, cascades deferred elimination/stalemate, computes
placements, copies repetition counts and appends history. Checkmate removes
pieces; stalemate freezes them. Repetition draws tie active players for first.
Score breaks simultaneous elimination ties; it does not determine the winner.

Read inventory: all engine source modules (board, setup, transforms, movegen,
attacks/check, boardOps, legality, applyMove, elimination, scoring, repetition),
bot source/tests, engine tests including fuzz, protocol serialization, web hook,
Playwright game/soak tests, and `docs/rules-spec.md`.

## Limits and hypotheses

| Limitation | Consequence / experiment |
|---|---|
| Scalar own-minus-all-opponents evaluation | Cannot express independent opponent objectives; compare vector Max^n |
| Paranoid coalition | May defend against cooperation that selfish opponents would reject |
| Fixed depth, no iterative deepening or budget | Unpredictable latency; depth 5 exceeds one four-seat cycle by only one ply |
| No TT or Zobrist key | Repeated states searched again; history-sensitive draws complicate reuse |
| Immutable copies and repeated legal generation | Likely expensive, but profile before rewriting |
| No quiescence | Capture/check horizon effects; test bounded tactical continuations |
| Capture/check-only ordering | No previous PV, TT move, killers/history; compare ordering separately |
| Terminal static evaluation | Material may outweigh actual victory; define outcome utility first |
| Absolute novelty filter | Can reject a lifesaving draw or sound recurrence |
| No per-opponent urgency/control model | Threats collapse regardless of turn distance or beneficiary |
| Synchronous UI search | setTimeout delays blocking; it does not isolate computation |
| No strength measurement | Existing legal-move and short soak tests cannot establish playing strength |

Potential oracle issues found by inspection, outside this spike's rule scope:
movegen permits enemy-king destinations in synthetic/deferred-check positions;
castling home-piece tests omit owner checks. Keep these visible when interpreting
tactical results; do not silently fix rules while comparing bot variants.

## Initial validation

Baseline test results and environment are recorded in `experiments.md`.
The host pnpm wrapper uses pnpm 11 despite the manifest pin to 10.33.0 and added
an esbuild build approval to the workspace file. The locked esbuild script was
enabled to permit Vite/Vitest execution; no runtime service was added.
