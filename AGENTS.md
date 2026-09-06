# Agent guide

These instructions apply throughout this repository. Start with [README.md](README.md)
for setup and implemented capabilities, [ROADMAP.md](ROADMAP.md) for product
direction, and [docs/project-state.md](docs/project-state.md) for accepted
decisions, current work, and the next tasks. [docs/rules-spec.md](docs/rules-spec.md)
describes the current implementation's rules; it is not yet the target
Chess.com-compatible FFA specification.

## Session continuity

- At the start of work, read the roadmap and project state, then check the working tree and relevant code. Verify handoff claims before relying on them.
- Keep durable decisions, current focus, blockers, next actions, and dated validation in `docs/project-state.md`. Update it after meaningful implementation or planning changes; avoid transcript-style logs.
- Track milestone status in `ROADMAP.md`. Mark a milestone complete only when its exit criteria have evidence. Keep proposed choices distinct from maintainer-confirmed decisions.
- Update README when implemented capabilities change, and update the rules specification alongside intentional behavior changes. Planned behavior must not be presented as implemented.
- Retain the user's scope for the current task. The roadmap provides context and sequencing; it does not authorize implementing every milestone or provisioning/deploying services in one session.

## Repository conventions

- Use the repository's configured human Git identity for commits. Do not substitute an AI provider's name or email as author or committer.
- Do not add AI co-author trailers, generated-by footers, or agent session links to commits or pull request descriptions.
- Keep the frozen classic bot and historical experiment artifacts intact. Label new measurements with their code version and environment; do not present historical timings as current performance.
- Validate code changes with `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm --filter @li4chess/web test:e2e` when browser behavior is affected. CI runs all four.

## Project structure

li4chess is a TypeScript monorepo using pnpm workspaces and Turborepo. The current
product is local four-player free-for-all chess in one browser tab, with human
and CPU seats. Networked multiplayer is not implemented.

- `apps/web`: React/Vite application. `src/game/useLocalGame.ts` owns local game state, input handling, and CPU turn scheduling.
- `packages/engine`: pure rules engine. Keep React, browser APIs, network calls, and filesystem I/O out of this package.
- `packages/bot`: production search/evaluation, experimental search, and the frozen `src/classic/` snapshot.
- `packages/arena`: seeded tournaments, replay validation, benchmarks, and result reporting.
- `packages/protocol`: JSON serialization helpers and shared game types for future networking.
- `packages/ui-kit`: presentational board, piece glyphs, and theme. Keep game decisions in the engine or application.

Follow existing strict TypeScript and ESM conventions, including `.js` extensions
in relative source imports. Use workspace package exports for cross-package
dependencies. Preserve immutable state transitions and JSON-shaped game state.

## Rules and game behavior

- Implement rules in `packages/engine`; avoid duplicating legality or scoring in the UI or bot.
- Use the shared board transforms for player-relative geometry. The board is a 14×14 array with 160 playable squares; turn order is Red → Blue → Yellow → Green, skipping inactive players.
- A legal move must leave the mover's own king safe. Resolve another player's checkmate or stalemate when rotation reaches that player, not immediately when they are checked.
- Checkmate and stalemate retain passive dead armies: zero-point capturable blockers that cannot move or attack. Their owners lose special rights and skip turns.
- Pawns automatically promote on their eighth rank to Queens with pawn provenance and one-point capture value; no underpromotion or spare king.
- Final points determine every placement, including eliminated players; equal scores share place and mean occupied rank. Third elimination ends play, with +20 per live walking King to the survivor. Claim Win is immediate. Automatic repetition, insufficient-material and 200-turn draws award each active player a flat +10 without survivor stacking.
- Resignation/timeout during the per-seat opening guard aborts; afterwards only the forfeiter's King stays live and receives recorded seeded legal moves on its regular turn. Automatic claims must secure first place even against eliminated high scorers.
- `applyMove` assumes a legal move. Validate external move requests against the engine's legal moves before applying them.
- For intentional rules changes, update the specification and add focused regression coverage. Cover all four orientations when changing pawn movement, castling, or board transforms.

The behavior above describes the partial migration; the historical house rules
are preserved in `docs/rules-spec-house-ffa-v1.md`. The accepted product
target is Chess.com's standard FFA rules, including its different scoring,
promotion, and elimination behavior. M1 is the compatibility audit and migration;
do not preserve the current house rules as a product requirement. Verify unclear
reference behavior, version the replacement specification/replays, and preserve
historical evidence rather than rewriting it to fit the new rules.

Active-king non-capture and castling ownership/rights now have accepted fixtures
in all four orientations. The migration contract settles the remaining target
semantics; follow its inventory without reopening decisions absent contradictory
evidence. Keep rules fixes separate from bot comparisons so
changes to the rules engine do not silently alter the experiment being measured.

## Bot and research work

Production CPU turns currently call `chooseCpuMove` synchronously after a timer.
A timer delays search but does not move computation off the UI thread. Bounded
search in a Web Worker, with cancellation and stale-result handling, is the next
documented M2 priority, alongside M1 rules compatibility. Experimental
`searchPosition` is separate from the production choice path; do not assume
the UI already uses its budgets.

- Preserve `packages/bot/src/classic/` and archived evidence under `docs/engine/results/`.
- Both classic and production bots use the current rules engine. The laboratory utility also uses production evaluation; account for these shared dependencies in comparisons.
- Write new measurements to fresh output directories. Record the commit, any uncommitted code changes, runtime/hardware, engine configuration, seeds, and budgets alongside results.
- Arena script paths are relative to `packages/arena`. Use `../../arena-results/<run-name>` to write into the root's ignored results directory.
- Replay-validate games before drawing conclusions. Treat ply-capped games as unfinished/censored, not draws or losses.
- Distinguish tactical regression improvements, throughput measurements, and playing strength. Small comparisons and historical timings do not establish current strength or performance.

Read [arena methodology](docs/engine/arena-methodology.md),
[production reconciliation](docs/engine/reconciliation.md), and the
[engine recommendation](docs/engine/engine-v2-recommendation.md) before changing
experiment methodology or interpreting archived results.

## Development and validation

Use Node.js 20 or newer and the pnpm version pinned in `package.json` (10.33.0).
Run commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm test
pnpm build
pnpm --filter @li4chess/web exec playwright install chromium
pnpm --filter @li4chess/web test:e2e
```

`pnpm lint` runs TypeScript checks. Unit tests use Vitest; browser tests use
Playwright and start their own Vite server. Run lint, unit tests, and build for
code changes, plus browser tests when behavior visible in the browser is affected,
including changes to the rules or bot used by the app. For documentation-only
edits, check local links, commands against package scripts, and `git diff --check`.

Keep Vite's `/li4chess/` base path in mind when changing asset URLs or navigation:
the GitHub Pages workflow publishes `apps/web/dist` under that project path.

Before finishing, review the diff for unrelated changes and report what changed,
which checks actually ran, and any remaining limitations. Do not report earlier
test runs or historical benchmarks as fresh validation.
