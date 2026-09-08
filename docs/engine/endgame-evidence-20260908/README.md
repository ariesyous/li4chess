# Bounded pawn-endgame guidance, 2026-09-08

Production levels 3–5 now recognize a concrete king-escort target and give a
small bonus to clear promotion routes screened for interception. This is a
targeted improvement to planning in king-and-pawn endings. Long quiet play
remains possible; these measurements do not establish general playing strength.

## Reproduction and cause

The [original user file](../../../packages/arena/fixtures/endgame/user-replay-v2.json)
is preserved byte-for-byte with its clean producer identity and SHA-256:
`aea47bafac8c4c55c981b117f7474fa6bac9cd2b1457cacac17d188175b1efd7`.
Its provenance is documented beside the fixture. Main was already at
`9a49a8083d1b2d968d187e46299d2b50a1be9e01` after the requested fast-forward pull;
pre-existing uncommitted documentation was preserved.

The regression reconstructs all 240 moves from legal standard setup and checks
board, players, turn, counters, ledger, history and result against the checkpoint.
It independently confirms the [original analysis](../endgame-review-2026-09-08.md):
four active kings and four pawns; scores Red 52, Blue 55, Yellow 30, Green 38;
77 final quiet king moves; repetition maximum 2; reversible counter 77/200.
Blue's pawns are blocked. Yellow's e10–e9 is legal at ply 239.

The [fresh original-evaluator diagnostic](original-depth3.json) reproduces
g7–g8 at −249.78 versus e10–e9 at −249.89333333333335. The linear pawn term is
too weak here to beat small mobility/center differences, and there was no escort
or route feature. Four-player depth 3 cannot reach the mover's next turn.
However, [exact depths 1–5](primary/depth.json) still prefer g7–g8 with the old
evaluator: increasing depth alone is not a demonstrated fix. Neither evaluator
forces an immediate push in this position, and no winning pawn line is proved.

## Implementation boundary

The only production change is [evaluate.ts](../../../packages/bot/src/evaluate.ts).
The new term is disabled whenever any live non-king/non-pawn piece exists and
is absent from the material-only level-1/2 presets.

- King escort values proximity to the next square of one own pawn, including
  a blockade. It plateaus beside that square, is capped at 0.84, and does not
  accumulate with history, novel squares or multiple pawns.
- A pawn gets 0.35 per advanced local rank only if its route to promotion is
  empty and passes a conservative screen: every opponent's current pawn attacks
  and king interception distance, with a move allowance for opponents and only
  current own-king protection trusted. Passive pieces still block routes.
- This is a positional estimate, not a promotion proof. It does not solve future
  pawn advances, forced escort paths, opposition or all multi-player races.
  Legal search and terminal placement utility remain authoritative. All four
  orientations include interception, blocked-route, escort and winning-draw tests.

No rules, scoring, draw thresholds, search depth/node/time policies, cancellation,
watchdog, UI, hosting or frozen classic sources changed. The laboratory imports
production evaluation, so its evaluator also sees this term; no laboratory
search strategy was promoted. The separately copied arena baseline matches the
four original production source files, checked against `9a49a80` after normalizing
checkout line endings. Raw source hashes and bytes are retained in the snapshots.

## Replay improvement and its limit

Two distinct continuation protocols are retained; neither predicts human Red.
Red is modeled by the baseline bot in both.

| Continuation | Baseline | Candidate CPUs |
| --- | --- | --- |
| Deterministic, random callback .99, 2,048 nodes/depth 3, no time cutoff, 32-ply cap | 32 quiet king moves; no progress | Yellow e10–e9 at ply 23, Blue d10xe9 at 26, Yellow King xe9 at 27 |
| Seed 41, normal level-3 budgets, 160-ply cap | First pawn move at 123; Yellow subsequently loses both pawns without recapturing | First pawn move also at 123; Yellow's prepared king recaptures at 127 |

The [deterministic canonical replays](deterministic/games.jsonl.gz) verify the
regression's actual pawn exchange rather than merely a different wandering path.
The [seeded canonical replays](primary/games.jsonl.gz) show the limitation:
both have a longest quiet-king run of 122 and both are **unfinished** at 160 plies.
Their king returns are 76 versus 57, but fewer returns alone do not prove useful
play. Blue's points lead makes a draw desirable; tests retain a leader choosing
a winning repetition draw over nonterminal pawn progress.

## Equal-budget comparison

Windows 10.0.26200 x64, AMD Ryzen 5 5600X, 12 logical CPUs, about 32 GiB RAM,
Node 24.18.0, Corepack pnpm 10.33.0. Each move uses depth ≤3, ≤2,048 nodes,
≤250 ms; every game is capped at 160 additional plies. Node/time use is recorded.
Only completed iterations select evaluated moves, as before.

Three separate synthetic validation families (runner, blockade, interception),
four spatial/owner rotations, seeds 701/1709, and four seeded legal initial moves
exercise adjacent AABB and opposite ABAB seating. The evaluator was frozen before
validation. The [primary](primary/run.json) pass alone confounds pawn ownership
with engine assignment; the [reverse](reverse/run.json) pass swaps both versions
on every identical seed/start. Only the combined 48 games support the table below.
This correction added comparisons, not evaluator tuning. An earlier run was
stopped before the invalid blockade fixture ran; its corrected pawn ranks are
validated upfront, and [the stopped attempt](exploratory/stopped-v1.zip) is retained.

| Combined observation | Baseline | Candidate |
| --- | ---: | ---: |
| Completed seat-games | 96 | 96 |
| Mean final rank (lower is better) | 2.5469 | 2.4531 |
| First-place rate, including ties | 25.00% | 27.08% |
| Moves | 1,403 | 1,405 |
| Quiet king moves | 1,020 | 1,033 |
| Returns to the previous own king square | 245 (17.46% of moves) | 223 (15.87%) |
| Plan-miss proxy | 4 | 3 |

All **48/48 games completed and replay-validated**, with zero errors or capped
games in this validation pool; all ended by insufficient material with placements
determined by points. The separate replay continuations remain censored and are
excluded from placements. [Combined figures](primary/combined.json),
[primary observations](primary/observations.json), [reverse observations](reverse/observations.json)
and both compressed game logs retain the underlying records.

The plan-miss proxy counts a quiet king move that fails to improve the fixed
route/escort score when an improving legal pawn move survives the immediately
following opponent's legal captures. It is heuristic-dependent and does not
prove full-cycle safety or a winning plan. Counts 4 versus 3 are not evidence of
a reliable reduction in avoidable shuffling. Total quiet king moves increased.
The small placement difference and fewer returns likewise do not establish
general strength: only three artificial positions and two correlated seed blocks
were used, with no meaningful confidence interval. Reserve new positions/seeds
before any further tuning; these are now observed validation evidence.

## Tactical checks and responsiveness

Each bot passed 16 expected/avoided tactical-move checks plus 16 legality checks
across the existing eight-position corpus rotated four ways, at equal node-only
budgets. The [raw observations](primary/observations.json) preserve each move and
completed depth. These supplement the focused endgame and existing tactical tests.

Paired timing uses the same four positions, three samples per level, alternating
execution order, and unchanged level-3/4/5 policies. No other test suite ran
concurrently with the timing measurements. All 72 searches completed an iteration;
none fell back. Small samples describe this desktop only.

| Level | Baseline maximum ms | Candidate maximum ms | Policy ms |
| --- | ---: | ---: | ---: |
| 3 | 63.20 | 82.69 | 250 |
| 4 | 500.11 | 500.12 | 500 |
| 5 | 1,000.10 | 1,000.11 | 1,000 |

The small deadline overshoots are indivisible engine-operation time, not changed
budgets. Candidate maximum during validation games was 250.50 ms and all searches
respected the 2,048-node cap. Game-position timings are not matched-position
throughput comparisons. No physical mobile-device performance claim is made.

Fresh required checks all passed, without cache reuse or browser retries:

- `corepack pnpm lint --force`
- `corepack pnpm test --force`: **731 tests**, including 13 new oriented bot
  regressions and two replay reconstruction/continuation tests.
- `corepack pnpm build --force`
- `corepack pnpm --filter @li4chess/web test:e2e`: **47 tests**, including real
  Worker responsiveness, reset/import/terminal cancellation, stale-response
  rejection, failure recovery and watchdog recovery.

[Logs](checks/test.log) and adjacent lint/build/browser logs retain the actual
output. Existing Turbo notices about packages without emitted build artifacts
did not fail checks. Final changes after these checks are documentation and
byte-preservation attributes only; production/test code is unchanged.

## Provenance and reproduction

The production evaluator's measured SHA-256 is
`56f6cedd43a99d4cfbc6f32fd2eabce4e07a15b23dd38a9bbc2525239e215646`.
Each run records the base revision, dirty-tree fingerprint, runtime/hardware,
budgets, source hashes, a working-tree patch and a ZIP of relevant source bytes.
The full dirty fingerprint includes preserved user documentation; it is not
presented as a clean commit. Primary and reverse use identical evaluator bytes.
[Artifact checksums](manifest.json) protect the retained measurements.

From the repository root, use fresh output directories:

```sh
corepack pnpm --filter @li4chess/arena exec vite-node src/endgame-comparison.ts ../../arena-results/endgame-primary primary
corepack pnpm --filter @li4chess/arena exec vite-node src/endgame-comparison.ts ../../arena-results/endgame-reverse reverse
```

The runner validates every game before saving and before aggregation. Supplementary
scripts are retained under `scripts/` as executed from the repository's ignored
`arena-results/` directory; their relative imports assume that original location.
Exact node-only tests are deterministic. Wall-time cutoffs may change trajectories
between machines or runs. No historical results were overwritten or reinterpreted.
