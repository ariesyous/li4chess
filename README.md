# li4chess

An open-source 4-player chess site, in the spirit of [lichess](https://lichess.org) — because right now Chess.com is the only place to play 4-player chess online.

## Status

Early development. Current milestone: a fully-correct, locally-playable 4-player free-for-all chess game (hotseat humans and/or CPU bots, single browser tab). See `docs/rules-spec.md` for the rules this variant implements, and the plan doc in this repo's history for the full roadmap.

## Monorepo layout

- `packages/engine` — pure 4-player chess rules engine (board, movegen, check/checkmate/elimination rules). No UI/IO dependencies.
- `packages/bot` — search-based CPU opponent, built on `engine`.
- `packages/arena` — local seeded engine tournaments, replay validation, and benchmarks.
- `packages/protocol` — shared DTO/event types for (de)serializing game state, used by the UI now and by a future networked server.
- `packages/ui-kit` — presentational board/piece components, no game logic.
- `apps/web` — the React app tying it all together.

## Development

```sh
pnpm install
pnpm test    # run all test suites
pnpm dev     # run the web app
```

The [engine R&D spike](docs/engine/engine-v2-recommendation.md) includes a frozen
classic bot, experimental bounded paranoid/Maxⁿ search, a tactical corpus, and
[reproducible arena commands](docs/engine/arena-methodology.md). See the
[experiment ledger](docs/engine/experiments.md) for measured results and limitations.
