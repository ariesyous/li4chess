# li4chess

An open-source four-player chess site, inspired by [lichess](https://lichess.org).

## Status

Early development, with a playable local free-for-all game in a single browser
tab. Each of the four seats can be a hotseat human or a CPU, including fully
automatic four-CPU games. Networked multiplayer is not implemented yet.

The goal is a free, ad-free four-player equivalent of Lichess. The first public
release will offer Chess.com-compatible FFA, public matchmaking, anonymous
casual and CPU play, and account-based rated play. See [ROADMAP.md](ROADMAP.md)
for milestones and [project state](docs/project-state.md) for current decisions
and next tasks.

Current features include:

- A cross-shaped board with 160 playable squares and Red → Blue → Yellow → Green turn order.
- Legal-move highlighting, last-move and check indicators, move history, and optional board rotation to the current player.
- Five CPU difficulty levels using paranoid alpha-beta search, which treats opponents as a coalition against the searching player.
- Castling, en passant, promotion, deferred checkmate/stalemate resolution, placements, and threefold-repetition draws.

The [rules specification](docs/rules-spec.md) describes the implemented
standard FFA contract. Setup, ordinary king safety, active-king
non-capture, per-player en-passant windows, and castling now have executable
acceptance fixtures for all four orientations. Castling enforces own home
pieces, permanent rights loss, king-path safety, and passive dead-piece blocking.
Checkmated and stalemated armies remain as grey passive pieces: they occupy and
block squares, cannot move or attack, lose special rights, and are capturable
for zero points (including eligible dead-pawn en passant). Final points determine
all placements, including eliminated players; equal scores share a place. The
third elimination ends play and the survivor gets 20 per live walking King.
With two active players, a leader ahead by at least 21 may Claim Win immediately,
awarding the trailer 20 points without further walking turns.
Pawns automatically promote on their eighth rank to Queens worth one capture
point; provenance survives moves, captures, serialization, and search hashes.
Captures use standard piece values, and own-army newly delivered multi-checks
award the Queen/non-Queen schedule. An ordered points ledger explains those
awards in the local UI. Active checking owners split mate points; stalemate
credit tracks the last cause of losing all legal moves. Local resignation and
simulated timeout abort during the opening, then leave dead armies with live
Kings that move automatically on scheduled turns using recorded seeded choices.
Automatic repetition, insufficient-material and 50-move draws each award a
flat 10 points per active player. The 50-move rule counts 200 individual turns
and resets on pawn moves or any capture, including dead pieces.
The local app exports and imports validated replay-v2 files, including unfinished
games and terminal results. State-v2 canonical SHA-256 hashes cover actions,
individual awards, random provenance and results. Imported games resume from an
explicit checkpoint under the current build, retaining a source replay hash.
The implemented ruleset is `li4chess-ffa-standard-v1`. M1 is complete; its
validation and CI evidence is recorded in [project state](docs/project-state.md).

CPU search runs in a dedicated Web Worker using bounded iterative production
search. Five resource policies retain production evaluation; only completed
iterations drive evaluated choices. Cancellation terminates the Worker, replies
must match the current game/state/seat, and failures recover from current legal
moves. Budgets and acceptance thresholds are in [M2 acceptance](docs/m2-acceptance.md);
calibration and complete M2 validation are pending. The former synchronous
`chooseCpuMove` remains available to historical comparison consumers;
the browser uses `chooseBoundedCpuMove`. This is not a playing-strength claim.
Local persistence and the responsive accessible game frame are further M2 work;
network authority, live clocks and disconnect tracking are M3 work.

## Monorepo layout

The TypeScript monorepo uses pnpm workspaces and Turborepo.

| Package | Responsibility |
| --- | --- |
| [`apps/web`](apps/web) | React/Vite app, seat setup, local game state, and CPU turn scheduling. |
| [`packages/engine`](packages/engine) | Pure rules engine: board geometry, move generation, legality, scoring, elimination, and repetition. No UI or I/O dependencies. |
| [`packages/bot`](packages/bot) | Production CPU search and evaluation, frozen classic bot, and experimental search. |
| [`packages/arena`](packages/arena) | Seeded tournaments, replay validation, reports, and benchmarks. |
| [`packages/protocol`](packages/protocol) | Validated state-v2/replay-v2, canonical hashes and producer provenance. |
| [`packages/ui-kit`](packages/ui-kit) | Presentational board, piece glyphs, and player colors. |

The main application flow lives in
[`useLocalGame`](apps/web/src/game/useLocalGame.ts): human input or CPU search
selects a move, `applyMoveRequest` matches it against current legal moves and
applies the canonical move, and React renders the updated board. Game state is
plain JSON-shaped data.

## Development

Use Node.js 24 or newer and pnpm **10.33.0**, the version pinned in
`package.json`. Run commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local Vite server at `/li4chess/` (normally
`http://localhost:5173/li4chess/`). The default setup is a human playing Red
against three level-3 CPUs. Configure each seat before starting, then click a
piece and a highlighted destination to move.

### Validation

```sh
pnpm lint                             # TypeScript checks across all packages
pnpm test                             # Unit tests, including rules, bots, and arena
pnpm build                            # Build all packages and the web app
pnpm --filter @li4chess/web exec playwright install chromium
pnpm --filter @li4chess/web test:e2e    # Human/CPU turns, autoplay, and dead armies
```

CI runs lint, unit tests, the production build, and browser tests on pull
requests and pushes to `main`. Playwright starts its own local Vite server.
The GitHub Pages workflow deploys `apps/web/dist` from `main`; Vite's base path
is configured for `/li4chess/`.

## Bot research and benchmarks

The production bot includes outcome-aware scoring, endgame guidance, and
selection among moves with comparable evaluated scores. The laboratory adds
bounded iterative search with paranoid and Maxⁿ strategies, optional
transposition tables and quiescence, and a tactical position corpus. Experimental
search has not been promoted to the browser's production bot.

Arena writers produce version-2 records with replay hashes, actual build and
runtime/hardware provenance, engine configuration, seeds and budgets. Readers
validate games before aggregation. Legacy v1 records are rejected and preserved
in a separate [checksum manifest](docs/legacy-replay-manifest.json):

```sh
pnpm --filter @li4chess/arena bench ../../arena-results/current-benchmark
pnpm --filter @li4chess/arena compare-production ../../arena-results/current-comparison 1 250
```

Choose a fresh output directory for each run. These paths are relative to
`packages/arena`; the examples write into the root `arena-results` directory.
The comparison uses one seed, four seat rotations, and a 250-ply cap per game,
and can take several minutes. Capped games are unfinished, not draws.

- [Arena methodology](docs/engine/arena-methodology.md): commands, replay validation, seat rotation, and interpretation of results.
- [Production reconciliation](docs/engine/reconciliation.md): production changes and measurements after their integration with the laboratory.
- [Experiment ledger](docs/engine/experiments.md): historical results and limitations.
- [Engine recommendation](docs/engine/engine-v2-recommendation.md): research conclusions and next engineering steps.

Keep the frozen sources in `packages/bot/src/classic` and historical evidence
intact. Both production and classic bots use the current rules engine; new
measurements must identify their code version and environment. Historical
timings do not describe current performance, and the existing small comparisons
do not establish general playing strength.

## Roadmap and project continuity

[ROADMAP.md](ROADMAP.md) defines capability milestones and completion criteria:
compatible FFA rules, responsive CPU play, reliable online games, public rated
matchmaking, learning tools, community events, and a sustainable open platform.

[docs/project-state.md](docs/project-state.md) retains accepted decisions,
current focus, the next actionable tasks, open questions, and dated validation
between development sessions. M1 is complete; see the
[fixture coverage](docs/m1-03-fixtures.md).
Worker integration is the next local-play milestone. Research continues
alongside the product roadmap with versioned, reproducible evidence.

See [AGENTS.md](AGENTS.md) for repository conventions, including validation,
preserving research evidence, and commit attribution.

## License

li4chess is licensed under the GNU Affero General Public License, version 3
(`AGPL-3.0-only`). See [LICENSE](LICENSE) for the full terms.
