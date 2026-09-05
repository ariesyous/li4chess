# Experiment ledger — 2026-09-05

Classic baseline: **867b4cb6e4599e9fd006cde1951309bb90b27718**.
Search/arena ablations correspond to commit `058a90b`; final evaluator/reporting
and source-fingerprint tooling is in `ca333fe`. IDs below are scoped by suite
(`sparse-v1/EXP-1`, `opening-v1/EXP-1`, etc.), not globally unique by number alone.
No run was discarded for an unfavorable result. See [results/manifest.json](results/manifest.json)
for hashes of the curated artifacts and compressed oracle-verified replays.

## Environment and validation

Windows x64, AMD Ryzen 5 5600X (12 logical CPUs), 34.27 GB RAM, Node 24.18.0,
host pnpm 11.19.0 (repository manifest pins 10.33.0), Vite 5.4.21 / Vitest 2.1.9.
No WASM runtime or neural network. Playwright 1.56.1 with Chromium 141.0.7390.37.
Baseline: 34 engine + 8 bot + 2 protocol tests = **44 passed**. Final: 34 engine,
29 bot, 4 arena, 2 protocol = **69 tests**; browser autoplay + 40-second soak =
**2 passed**. Workspace type checks and production build passed. Chromium was
initially absent; installing the pinned browser resolved launch failures.
Production rules and web hook were not changed. Frozen bot source hashes match
the starting SHA after normalizing line endings.

## Games actually played

**84 games, 10,988 recorded plies, 23 repetition draws, 61 ply-censored games,
zero engine errors, zero sole victories.** All completed games tied all four
participants first. These results cannot distinguish playing strength. Total
game wall time summed across runs: 463.18 seconds (about 0.181 games/s including
censored runs, not completed decisive games/s). Classic latency benchmarking
and replay validation time are outside that sum. A replay audit found no captured
kings in these games; the separately documented oracle edge case did not occur.

| Suite | Games / starts | Limits | Result |
|---|---|---|---|
| baseline-smoke | 4; initial board, seed 1, B rotates all seats | three random seats vs classic level 1; 80 plies | 4 censored |
| sparse-v1 | 48; symmetric 12-piece fixture + four legal jitter moves, seeds 1,2 | six A,A,A,B comparisons, 4 rotations/seed; 64 search nodes, depth 2, 160 plies | 21 draws, 27 censored |
| opening-v1 | 24; initial board + four legal jitter moves, seed 1 | same six comparisons/rotations; 64 nodes, depth 2, 80 plies | 24 censored |
| relative-v1 | 8; standard initial board, seeds 11,12 | three lab-ID seats vs one relative-material seat; depth 3, 128 nodes, 240 plies | 2 draws, 6 censored |

Relative-material engines are deterministic and that last suite has no opening
jitter: its two seed blocks repeat the same games for each rotation. This is a
pipeline repeatability check, **not eight independent strength samples**. All
other limitations (paired rotations, conditional completed-game statistics,
incomplete seat coverage) are described in [arena methodology](arena-methodology.md).
Bootstrap CIs are null: fewer than five distinct seed blocks are available.

## Incremental hypotheses and decisions

| ID (both ablation suites) | A → B / hypothesis | Sparse draws / 8 games | Outcome and decision |
|---|---|---:|---|
| EXP-1 | classic level 1 → lab-ID; outcome-aware bounded search may be more useful | 0 | All censored in both suites. Multiple semantics change together. **INCONCLUSIVE** strength; retain separate frozen classic. |
| EXP-2 | fixed depth → iterative deepening; completed shallower answers survive budget exhaustion | 4 | Confirmed in tests and benchmark: opening fixed depth 3 returns depth 0 at 500 nodes; ID returns completed depth 2. **KEEP** budget behavior, no strength claim. |
| EXP-3 | ID → history-safe TT; caching/hints may reduce work | 4 | Zero score hits across all 8 benchmark positions; some prior-iteration ordering savings. Sparse B mean move 13.57 ms vs A 8.36 ms. **REJECT as default optimization**, retain experimental implementation. |
| EXP-4 | TT → enhanced ordering; promotion/capture/killers/history may prune more | 4 | Poison fixture 316→311 nodes; escape 225→228; several unchanged. **INCONCLUSIVE**, retain switch for larger tests. |
| EXP-5 | ordering → bounded quiescence; reduce tactical horizon errors | 5 | Poisoned-capture regression succeeds; other positions lose nominal depth under equal nodes. Sparse q mean 12.80 ms vs A 16.22 ms is not a strength/speed win: different trajectories and frequent unfinished iterations. **KEEP experimental only**. |
| EXP-6 | ordered paranoid → ordered Max^n (both without TT/Q); selfish opponent backups may improve FFA | 4 | Correctly different backup semantics in a controlled test; same drawn outcomes here. Sparse Max^n mean 14.14 ms vs paranoid 8.47 ms. **INCONCLUSIVE**, expensive and often shallower. |
| REL-1 | coalition material → own material minus average active rival; reduce opening utility bias | 2 / 8 | Symmetry/calibration test passes; no decisive games. Mean move 96.84 vs 101.32 ms follows different trees, not an isolated evaluator speed ratio. **INCONCLUSIVE**, no promotion to production. |

Each B occupies every seat equally in the full attempted suite. Completed-only
seat coverage can differ, so some normalized metrics are null. All opening
EXP-1..6 games were censored. There is no measured strongest candidate and no
valid Elo, win-probability gain or human-enjoyment claim. Full `classic-v1` depth 5
is frozen and callable by the arena, but its opening latency made whole-game
comparison impractical in this bounded spike. Do not relabel level-1 results as
full-classic strength results.

## Performance results

Final uncontended microbenchmark (five trials per operation; search mean of three
depth-3 / 300-node / 500-ms calls). The sparse tactical rows are synthetic.

| Position | Root legal moves | Legal ms | Apply ms | Eval ms | Search nodes/s | Completed depth |
|---|---:|---:|---:|---:|---:|---:|
| Opening | 20 | 1.20 | 1.43 | 0.50 | 530 | 2 |
| Promotion | 9 | 0.09 | 0.05 | 0.01 | 8,255 | 3 |
| Hanging queen | 26 | 0.38 | 0.65 | 0.02 | 1,981 | 3 |
| Poisoned pawn | 43 | 0.62 | 0.17 | 0.02 | 6,020 | 2 |
| Double check | 35 | 0.43 | 0.08 | 0.01 | 8,432 | 3 |
| Mate in one | 38 | 0.13 | 0.04 | 0.02 | 11,767 | 2 |
| Two kings | 5 | 0.01 | 0.01 | <0.01 | 32,548 | 3 |
| King escape | 4 | 0.04 | 0.38 | 0.01 | 9,884 | 3 |

Full-state cloning is not full `applyMove`. The latter includes next-turn legal
generation and deferred elimination. Board-only apply was ~0.0003 ms at opening,
below a reliable per-call timer resolution; it cannot explain ~1.43 ms full apply.
V8 profile self-samples restricted to engine/bot source: `isSquareAttacked` 35.8%,
`pawnAttackSquares` 14.1%, rays 11.4%, leaper destinations 10.0%. Together these
account for about 71% of the recorded source self-samples. This supports targeting
attack generation/allocation first. It is not an end-to-end speedup prediction.

Classic best-choice opening latency (single initial trial): level 1 94.2 ms,
level 2 154.4 ms, level 3 8.20 s, level 4 **190.57 s**. Level 5 was stopped after
more than **290 seconds** without an answer (recorded interval from previous
result write ~297.6 s; not a completed latency). Other experiments ran during
parts of these long trials, so do not treat them as precise isolated speed ratios.
A separate watchdog rerun measured level 3 at 7.49 s and stopped levels 4/5 at
10 s. Two-king full-classic depth 5 completed in 13.9 ms initially and 23.1 ms in
the isolated cold-process rerun. The large position dependence is the finding.

At depth 3 / 500 nodes, opening ID used ~931 ms and reached depth 2; Max^n used
~1,694 ms for the same node cap/depth reached. On hanging queen, paranoid reached
depth 3 in 178 nodes while Max^n exhausted 500 nodes with only depth 1 complete.
On poisoned pawn, ID/TT/ordering used 364/316/311 nodes at depth 3; quiescence
exhausted 500 with depth 1 complete. All raw rows are retained, including slower
and unchanged outcomes. These small fixed-order trials need random-order repeat
benchmarking before drawing general performance conclusions.

## Honest boundary

The spike proves laboratory reproducibility, explicit terminal handling, bounded
search and a tactical quiescence example. **It proves no playing-strength gain.**
It also exposes that shallow, censored FFA self-play is a poor tuning signal.
Next experiments must improve position coverage, budgets and completion, and
validate rule edge cases before larger tournaments or tuning. No result was
discarded, no capped game adjudicated as a draw, and no optional NNUE/MCTS/BRS
implementation presented as finished work.
