# Recommendation: make the laboratory informative before choosing a winner

Keep the TypeScript rules oracle and classic production bot. Develop Engine v2
as a local Worker running bounded iterative search behind a stable strategy and
vector-evaluation interface. Start with paranoid for an affordable tactical
reference and retain Max^n as an explicit experiment. Do not ship TT/quiescence
or a language rewrite on the strength of this spike's match results.

The evidence is [84 games / 10,988 plies](experiments.md), all replay-verified:
23 repetition draws, 61 censored, no errors and no sole winner. Those are useful
pipeline results but cannot identify the strongest engine. **No measured playing
strength improvement is proven.** Full classic level 5 remains the strongest
configured baseline, not a demonstrated tournament champion.

## Proven engineering and tactical improvements

* A permanent classic snapshot with source fingerprints, reproducible arena,
  seat rotation, complete result/error logs and compressed replay evidence.
* Iterative deepening returns a completed answer under a budget where direct
  depth search returns only an unscored fallback. Cancellation/node/time semantics
  and terminal results are now testable; moves and PV prefixes are legal.
* Outcome utility sees actual victory and supports drawing while losing and
  declining a draw while winning. It has explicit bounded semantics rather than
  arbitrary mate constants mixed into material.
* Bounded quiescence avoids one verified poisoned capture missed at depth 1.
  This is a tactical regression improvement, not overall match strength.

## Promising but unproven

* Enhanced ordering has small mixed node effects. Relative per-owner material
  reduces opening calibration bias but did not establish better outcomes.
* Max^n models self-interested opponents correctly under its specified utility,
  yet is costlier and often shallower; realism alone is not strength evidence.
* BRS merits a separate research branch after synthetic-pass/deferred-mate
  semantics are specified. Existing academic wins in other domains do not justify
  silently skipping real 4PC turns.
* Score-distance personality sampling is safer than arbitrary top K under the
  evaluator, but shallow evaluation can still miss a queen loss. Add tactical
  awareness gates and human playtesting before defining production difficulties.

## Rejected as defaults

* The current history-complete score TT: zero score hits and measurable overhead.
  Keep its correctness tests; investigate a cheap ordering cache separately.
* Unbudgeted depth 4/5 on the browser main thread: classic opening level 4 took
  about 191 seconds, level 5 exceeded 290 seconds. A timeout callback does not
  isolate synchronous computation.
* Treating capped games as draws, the level-1 classic as full classic, or repeating
  deterministic seeds as independent strength evidence. No Elo is reported.

## Deferred research and prerequisites

TypeScript is adequate for the **next research stage**, not yet established as
adequate for deep, strong mobile play. Opening throughput is about 530 search
nodes/s, versus ~33k in a trivial two-king position. Attack/ray/leaper routines
account for ~71% of measured source self-samples. Optimize and cross-check that
work before make/unmake or Rust/WASM. A Rust rewrite is **not justified yet**;
there is no cross-language benchmark or differential core to support one.

NNUE requires correctly labeled diverse self-play, an agreed utility target,
four-owner features/rotational handling, accumulator parity and actual mobile
inference benchmarks. MCTS/policy-value additionally needs a useful policy,
training infrastructure and vector backups. Neither should be the next major
implementation. The current small corpus and draw/censor-heavy matches are not
a credible training set. SPSA/Bayesian/evolutionary tuning is also deferred until
the objective produces informative, held-out outcomes. No learned strength or
human enjoyment has been measured.

## Exact next five engineering steps

1. **Audit rule edge cases and expand the corpus.** Resolve enemy-king capture
   and castling ownership findings against the product spec in a separate rules
   change, then add multi-turn forced survival, triple check, third-party rescue,
   promotion races and played middlegames. Regenerate baseline only explicitly.
2. **Implement the Worker contract and bounded difficulty.** Start with a modest
   iterative search, request IDs, reset cancellation, stale-reply rejection and
   watchdog fallback. Verify 100/250/500 ms tiers on desktop and a slow mobile
   device. Keep a deterministic node-budget test mode.
3. **Optimize attack queries behind oracle parity tests.** Try square-centric
   queries/piece lists, reduce redundant legality/attack allocation, profile
   whole moves, and benchmark real middlegames. Evaluate make/unmake and WASM only
   after this result identifies the remaining bottleneck.
4. **Run informative, preregistered tournaments.** Use dozens of varied legal
   opening/endgame histories, adequate completion budgets, all B seats and both
   AABB geometries, then hundreds of games per promising comparison. Retain
   censored outcomes and seed-cluster intervals; reserve validation seeds. First
   compare ID/no-TT, ordering, bounded quiescence and relative evaluation one at
   a time under equal wall time as well as equal nodes.
5. **Choose the multiplayer model on held-out evidence.** Compare paranoid and
   Max^n with shared per-owner features and turn-order threat tests, then a
   separately specified BRS if justified. Add a two-weight tuning pilot only
   once completion and rank variance supply signal. Choose defaults using both
   placements and a small human study of shuffling, obvious blunders and enjoyment.

The route toward a credible open-source FFA engine is now reproducible: preserve
the oracle, measure real bottlenecks, and require outcomes before claiming strength.
