# Original user replay

`user-replay-v2.json` is the exact 102,738-byte user-provided file from
`C:/Users/sith/Downloads/li4chess-replay-v2.json`, supplied for this regression
on 2026-09-08. SHA-256 (also its canonical replay hash):
`aea47bafac8c4c55c981b117f7474fa6bac9cd2b1457cacac17d188175b1efd7`.

Original producer revision: `9a49a8083d1b2d968d187e46299d2b50a1be9e01`.
Its clean producer identity is retained without relabeling. Red was human;
Blue, Yellow and Green were level-3 CPUs. There are zero envelope events and
240 moves inside the checkpoint; the regression reconstructs those moves
independently from legal standard setup, not merely accepting the checkpoint.

The separate `src/endgame-baseline/` files are byte copies of production
`bounded.ts`, `difficulty.ts`, `evaluate.ts`, and `search.ts` from that revision's
working checkout before the endgame change. They are a comparison baseline,
not the historical classic bot, and use the same current rules engine.
The new experiment records their source hashes alongside the candidate.

Run both assignments from the repository root, using fresh directories:

```sh
corepack pnpm --filter @li4chess/arena exec vite-node src/endgame-comparison.ts ../../arena-results/<fresh-primary> primary
corepack pnpm --filter @li4chess/arena exec vite-node src/endgame-comparison.ts ../../arena-results/<fresh-reverse> reverse
```

The runner rejects nonempty output directories, snapshots the relevant source,
records environment/configuration and replay-validates every game. Its held-out
position/seed pool is separate from the user replay and development tests.
