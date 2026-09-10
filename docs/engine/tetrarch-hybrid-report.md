# Tetrarch advisory hybrid: bounded arena result

2026-09-09 local / 2026-09-10 UTC. Follow-up to the
[initial v8 audit](tetrarch-v8-report.md), under the accepted
[predeclared plan](tetrarch-hybrid-plan.md). Draft PR [#24](https://github.com/ariesyous/li4chess/pull/24).

## Decision

The advisory hybrid is executable and promising enough to retain as an opt-in
research engine. A C compatibility fork was not needed for this slice. Tetrarch
supplied **980 of 985 hybrid moves (99.49%)**; the existing bounded bot supplied
five moves at unsupported en-passant roots. No illegal candidate, malformed
reply, crash or watchdog fallback occurred in the campaign. Every recorded game
passed canonical replay validation.

The hybrid finished first in **9 of 14 completed mixed games**; two more mixed
games reached the cap. That is encouraging evidence for this particular resource
configuration, not an Elo estimate, a full-strength comparison or production
acceptance. Keep the browser bot unchanged. A possible next slice is a separately
scoped browser prototype plus held-out comparisons against stronger native
settings and matched wall-time budgets; this report does not start that work.

## Implemented boundary

`@li4chess/tetrarch-engine/hybrid` accepts an external adviser and a native
fallback. It snapshots and validates canonical state, classifies transport
support, hashes the full state and matches the returned from/to/promotion to the
canonical legal list. Only canonical metadata is returned. An external score or
PV never adjudicates a game. The existing arena owns move application, points,
claims, walking actions, termination and replay.

The Node client lazily starts a reusable Worker. Request sequence and state hash
correlate responses; stale replies are ignored. Cancellation, crash, malformed
results and a 30-second watchdog replace the worker. Cancellation propagates
without choosing a fallback. Other adviser failures route to the native bot.
The watchdog bounds external execution, not total turn time or synchronous native
fallback. This is a Node arena implementation, not a tested browser WASM host.

Root restrictions remain pending EP, forfeits/walking owners, fractional or
out-of-u16 scores, moved pawns on their home rank, wrong ruleset and terminal
states. Passive mate/stalemate armies are representable. The production predicate
still rejects all states; the separately named hybrid capability permits an
imperfect adviser under the experiment's accepted model limitations.

The canonical engine, production/frozen bots, upstream C, NNUE, C bridge and
TypeScript WASM search loop are unchanged from the initial spike. This preserves
its evidence about active-king captures, descendant EP, scoring attribution,
survival-based terminal utility, repetition history and draw/claim differences.
Root validation prevents an illegal played move; it cannot repair a mistaken
prediction inside the external search. The fallback currently operates between
real moves, not at arbitrary nodes inside C search.

## Experiment and provenance

The existing `ArenaEngine`, `tournament`, `runGame`, `replay` and `aggregate`
interfaces produce all records. Four distinct Modern opening histories were
generated with seeds 1–4 and eight legal random plies. Each opening places one
hybrid against three bounded native bots in all four seats. One four-native
control uses the same opening. All 20 games have a 400-ply cap after the opening.

| Configuration | Search resources |
| --- | --- |
| Tetrarch v8 adviser | 20,000 nodes, iterative depths up to 32, no soft time limit, 30 s worker watchdog |
| Native baseline and fallback | Production level 3: 2,048 nodes, depth 3, 250 ms shared budget |
| WASM | Pinned v8 `4a35cea06b710a6633302c2226ebfebbba52d7a4`, scalar Emscripten 4.0.15, 16 MiB TT, 32 MiB heap |
| Network | Unmodified `net-ffa1.nnue`, checked hash and required successful NNUE load |

The main campaign ran from clean commit
`275f07da753b71227ff935b5bd0fb345a69a9240`, fingerprint
`sha256:b142b3fed51bc83a70a694efc56d5408645964570d6ee01d970db5becbde5d66`.
Windows 11 x64, Node 24.18.0, pnpm 10.33.0, Ryzen 5 5600X, 12 logical CPUs,
34,269,650,944 bytes reported system memory. Source stayed fixed and outputs
remained ignored until completion. Local tests/builds finished before timing;
CI ran remotely. [Run metadata](tetrarch-hybrid-evidence/campaign/run.json)
retains exact binary, glue, parameter and network hashes.

Native search uses wall time, so seeded openings do not make its entire move
sequence deterministic. The configurations have unequal node budgets and search
models. Timing across different reached positions is descriptive, not an
equal-position speedup. Fixed-node Tetrarch determinism was checked separately.

## Results

All **20 games / 5,096 measured plies** replayed successfully before saving and
again during aggregation. The eight opening plies per game are additional and
retained in each initial history. No errors, aborts or automatic walking actions
occurred. The four opening states were confirmed distinct.

| Group | Completed | Capped / unfinished | Repetition endings |
| --- | ---: | ---: | ---: |
| One hybrid / three native | 14 / 16 | 2 | 0 |
| Four-native control | 3 / 4 | 1 | 0 |

Hybrid mean rank among completed games was **1.86**. Its first-place and sole-win
rates were both 9/14 (64.3%); the native seats collectively won the remaining
five. Capped games have no final placement. Per-seat completed counts vary, so
the seat-normalized first-place rate is reported separately as 64.6%. Four seed
blocks are too few for the arena's confidence interval; it correctly returns
null. Completed games may be a biased subset.

| Opening seed | Hybrid Red place | Blue place | Yellow place | Green place | Native control ending |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 4 | 1 | Claim Win |
| 2 | 4 | 1 | 1 | 1 | Capped |
| 3 | Capped | 1 | 3 | Capped | Insufficient material |
| 4 | 2 | 4 | 1 | 1 | Elimination |

Mixed endings include four eliminations, five claims, three insufficient-material
draws, two automatic 200-turn draws (protocol reason `fifty-move`) and two caps.
These automatic draw endings still have point-based final placements; they are
distinct from unfinished capped games.

| Move timing | Count | Median | p95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Hybrid, including fallback | 985 | 104.6 ms | 124.7 ms | 254.2 ms |
| Accepted adviser moves | 980 | 104.6 ms | 124.3 ms | 177.4 ms |
| Native fallback | 5 | 252.9 ms | 253.6 ms | 254.2 ms |
| Native opponent moves | 3,007 | 243.6 ms | 250.8 ms | 253.0 ms |

The 980 accepted adviser searches each spent 20,000 nodes: median completed
depth 4, p95 6, maximum 7. These search-node/depth fields exclude the five routed
native turns, whose diagnostics are retained separately. Every fallback was
`unsupported-state` / `en-passant-semantics`, a 0.51% routing rate on this corpus.
This is not a promise about arbitrary games or supported-search correctness.

Movement statistics are mixed: the hybrid reversed its previous own move on
113/985 turns (11.5%), versus 579/3,007 native opponent turns (19.3%). But hybrid
moves revisited an earlier whole-board position 24 times, versus three native
opponent moves; the all-native control had seven such revisits. These are simple
descriptive counts, not verified blunders or human enjoyment measurements.
The hybrid has not solved repetition or shuffling.

## Validation and reproduction

Local frozen install, lint, **755 unit tests** and build passed. The 13 added
tests exercise canonical move authority, input isolation, EP routing, illegal or
missing candidates, unavailable NNUE, adviser failure, cancellation, stale
identities, busy clients, crash/exit, malformed output, watchdog and recovery.
The real WASM smoke also checks fixed-node determinism, in-flight cancellation
and successful search after worker replacement. Missing assets never silently
select hand evaluation.

[CI on implementation commit 275f07d](https://github.com/ariesyous/li4chess/actions/runs/34423775751)
passed frozen install, lint, unit tests, build and **53 browser tests**. The
browser remains on its original assets and CPU implementation. Documentation and
evidence publication follow the measured implementation commit.

The preliminary five-game, 16-ply smoke is retained separately; all five games
were deliberately censored and its 16 hybrid moves required no fallback. It ran
on the earlier dirty development fingerprint recorded in its own metadata,
not the clean main-campaign fingerprint. Do not pool it into strength results.

See [evidence and checksums](tetrarch-hybrid-evidence/README.md) and
[package reproduction instructions](../../packages/tetrarch-engine/README.md).
The full [summary](tetrarch-hybrid-evidence/campaign/summary.json),
[mixed replays](tetrarch-hybrid-evidence/campaign/mixed.jsonl.gz) and
[control replays](tetrarch-hybrid-evidence/campaign/controls.jsonl.gz) retain all
outcomes, timings, fallback reasons and canonical history.
