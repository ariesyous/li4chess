# Main-branch reconciliation, 2026-09-05

PRs #9, #7 and #8 were merged in that order after each passed GitHub Actions:
lint, unit tests, production build and both existing Playwright browser tests.
The final combination has 91 project unit tests. The independent diagnostic
that previously exposed the contender-selection bug now passes too.

## Production and research state

The production bot includes decisive outcome scoring, placement credit, bare-king
endgame guidance, exact-score contender filtering, improved ordering, attack maps
and early legal-move availability checks. The engine laboratory and frozen classic
bot are retained. No experimental search strategy has been promoted to production.

`utility.ts` imports the current production evaluator, and both production and
classic use the current rules engine. Therefore the earlier laboratory numbers
describe a different implementation. All 28 historical evidence checksums were
verified unchanged; the new measurements live in `results/reconciliation/`.

## Refreshed benchmark

The existing benchmark ran on Node 24.18.0, Windows x64, AMD Ryzen 5 5600X.
Five timed samples followed a warmup for each primitive. Opening medians:

| Operation | Median |
| --- | ---: |
| `legalMoves` | 1.182 ms |
| `applyMove` | 0.030 ms |
| `evaluateFull` | 0.079 ms |

Three bounded opening searches measured 2,981, 3,785 and 3,981 nodes/second.
These are descriptive samples, not a controlled cross-environment speedup ratio.
The earlier 530 nodes/second and 191-second level-4 timing remain historical;
full production levels 4 and 5 were not benchmarked in this reconciliation.
See [the complete benchmark](results/reconciliation/benchmark.json).

## Production versus classic

The comparison uses level 3 for both bots, one seed, four distinct adjacent AABB
cyclic seat rotations, and a 250-ply cap. This avoids duplicate deterministic ABAB
rotations. Each game is replay-verified before being saved; an exclusive run file
prevents a second process from appending into the same output directory.

All four games replayed successfully: 798 plies, zero errors, no repetition draws,
three elimination finishes and one game censored at 250 plies. Production won two
of the completed games; classic won one. Total game runtime was 691.5 seconds.

| Rotation (Red, Blue, Yellow, Green) | Plies | Outcome |
| --- | ---: | --- |
| Production, Production, Classic, Classic | 216 | Classic won |
| Production, Classic, Classic, Production | 128 | Production won |
| Classic, Classic, Production, Production | 204 | Production won |
| Classic, Production, Production, Classic | 250 | Capped, unfinished |

Production move time had a median of 263 ms and a 95th percentile of 1,740 ms;
classic measured 546 ms and 5,315 ms respectively. Their positions and branching
factors differ, so this is not an equal-position speed comparison. See the
[summary](results/reconciliation/summary.json), [compressed replays](results/reconciliation/games.jsonl.gz),
[run metadata](results/reconciliation/run.json) and [checksums](results/reconciliation/manifest.json).

One seed and adjacent seating alone cannot establish general playing strength.
The comparison does not cover the opposite-seat geometry, varied starting
positions, equal wall-time budgets or held-out seeds. Larger tournaments remain
future research. Capped games must remain censored rather than counted as draws.

Run new measurements from the repository root, using a fresh output directory:

```sh
pnpm --filter @li4chess/arena bench ../../arena-results/current-benchmark
pnpm --filter @li4chess/arena compare-production ../../arena-results/current-comparison 1 250
```

The comparison logs its PID at startup and reports each completed game. A quiet
console during a game is expected; do not start a duplicate run. Five seeds would
produce 20 games, with substantially more runtime than this integration check.

## History and next work

Main retains its individual code changes, with automated attribution trailers
removed from commit messages. Every rewritten commit preserved its original
file tree. [The commit mapping](results/reconciliation/history-map.json) connects
the old history with the cleaned history. In particular, historical baseline
`867b4cb6e4599e9fd006cde1951309bb90b27718` is code-identical to
`a60ea00ad68aac95a1e6cf71d32f2266324c178c`. Old hashes inside frozen evidence are
retained as experiment identifiers, rather than editing archived measurements.

Worker integration with bounded difficulty is the next product priority:
request IDs, reset cancellation, stale-result rejection and watchdog fallback.
CPU search still runs synchronously in the browser. Reducing interior-node check
annotation is a separate optimization candidate. The documented rules edge cases
and experimental placement-utility calibration still need their own audits.
