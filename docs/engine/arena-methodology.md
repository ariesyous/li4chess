# Reproducible local engine laboratory

Run from the repository root after `pnpm install` (Node >=20):

```sh
pnpm --filter @li4chess/arena test
pnpm --filter @li4chess/arena arena arena-results/example 2 160 random-v1,random-v1,random-v1,classic-v1-level1
pnpm --filter @li4chess/arena experiments arena-results/sparse-example sparse 2 160
pnpm --filter @li4chess/arena experiments arena-results/opening-example opening 1 80
pnpm --filter @li4chess/arena exec vite-node src/relative-experiment.ts arena-results/relative-example
pnpm --filter @li4chess/arena report arena-results/example/games.jsonl
```

Output paths in these commands are relative to `packages/arena`, because pnpm
runs package scripts there. Choose a new output directory: log creation fails
if it would overwrite prior evidence. `report` accepts `.jsonl.gz` too. No
telemetry/network is part of arena execution. Set `TURBO_TELEMETRY_DISABLED=1`
when using the repository's existing root Turbo commands if desired.

## Engine contract and replay

An `ArenaEngine` has an ID, serializable versioned configuration and a sync/async
`choose(state, random)` method. Return a move and optional statistics. Each seat
gets its own deterministic PRNG derived from the game seed. Games give engines a
clone; returned move identity is matched to the oracle's legal list, and only
the oracle's canonical move is applied. Exceptions/invalid moves produce an
error record, not a fictional loss. Arbitrary engines run in-process: a hung
synchronous plugin cannot be preempted; untrusted/hanging adapters need process
or Worker isolation. Built-in experimental search has node/time budgets.

JSONL stores the full initial state, engine IDs/configs, seed, canonical moves,
post-move position keys, timing, root branching and available search metrics.
Final records include result/placements/winner, all scores/statuses, elimination
turns (including pre-existing fixture eliminations), length, wall time and reason.
Replay regenerates and validates moves, keys, final result and scores. The
experiment runner verifies **every** game before appending it.

## Fairness and censoring

`tournament([A,A,A,B], seeds, cap, initial)` cyclically rotates B through all seats
for each seed. It also supports AABB and ABCD; compare adjacent AABB and opposite
ABAB separately or supply all unique permutations if geometry should be averaged.
Same seed/initial state is paired across rotations; jitter uses legal oracle moves.
Time measurements are nondeterministic, move sequences under node budgets are
deterministic. A seed does not diversify deterministic engines unless it changes
the starting history; the ablation runner therefore applies four seeded opening
moves. Fixed depth is measured separately from equal node/time resources.

Never call a 64-node candidate a full-strength engine or level-1 classic the
strongest baseline. `classic-v1` specifically means frozen level 5. Lower levels
keep original stochastic difficulty; seeds make that behavior repeatable. The
level-1-versus-lab comparison changes evaluation, terminal utility, search and
novelty handling together and is **not** a one-feature strength ablation.

Max-ply games are **censored**, not draws. They get no invented final placements.
Placement/first/score/survival statistics are conditional on completed games;
per-game scores and active statuses are still retained for censored games.
Always read the completion/error counts alongside strength metrics. Completed
games may be a biased subset. Repetition rate uses all attempted games as its
denominator. First-place rate includes tied first; sole-win rate is separate.
Four players can all have 100% tied-first and 0% wins. Average game and move
durations report mean, median, p95 and max using nearest lower empirical order
statistics. Small sample tails are descriptive, not precise estimates.

Head-to-head assigns 1/0.5/0 for better/equal/worse placement for each cross-engine
pair, then averages equally across the first engine's four seats. Missing seat
coverage yields null. These pairs are correlated, not independent Elo games.
First-place confidence intervals resample whole seed blocks (1,000 deterministic
bootstrap replicates), preserving the linked rotations/seat entries. Fewer than
five seed blocks or a block without completed entries yields null; this spike's
tiny samples cannot support tight intervals or significance claims. Future runs
need at least dozens of distinct starting histories and predeclared stopping
rules, with a held-out opening/seed pool. TrueSkill-style ratings remain deferred
until enough noncensored heterogeneous matches can validate the assumptions.

## Position corpus

`packages/bot/src/positions.json` is a small versioned-in-Git sparse position
format with tags, board tuples `[square, owner, pieceType]`, active/inactive seats,
turn and optional expected-move subsets, avoid-move constraints, legal properties
and perft counts. `loadPosition` supplies moved flags, disabled castling and a
fresh repetition history for sparse fixtures; the initial-board fixture retains
real initial rights. Full-state arena logs cover arbitrary repetition histories.

Covered now: opening legality/perft, promotion/queen choice, free queen capture,
poisoned capture, multiple-player check/fork geometry, forced mate/elimination,
king escape, sparse endgame, draw while losing/avoid draw while winning (tests
augment history). Opening oracle perft is 1/20/395 at depths 0/1/2: useful regression
counts, not independent proof of the oracle. Mate and poison answers are checked
against actual resulting states. Compound tags indicate relevance, not that a
single fixture comprehensively proves every tagged concept.

Missing dedicated corpus classes: deeper forced mate/survival, triple check,
promotion interception races, nonterminal waiting, overloaded defenders, and
verified third-party tactical rescue. Add independently defensible result sets
or properties; do not manufacture a preferred move merely to satisfy a tag.
