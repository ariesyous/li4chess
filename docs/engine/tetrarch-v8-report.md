# Tetrarch v8 integration spike

## Result

**NO-GO for unmodified Tetrarch v8 as the li4chess production bot foundation.**
The WASM/NNUE feasibility question is answered positively. The compatibility gate
fails: v8 searches a materially different game. A legal root move is insufficient
when its score assumes illegal king captures or the wrong winner. This is not a
claim that a future compatibility fork cannot work, or that Tetrarch is weak.

## Tetrarch version

[Upstream v8](https://github.com/IchNukeDichWeg/Tetrarch/tree/4a35cea06b710a6633302c2226ebfebbba52d7a4),
commit `4a35cea06b710a6633302c2226ebfebbba52d7a4`; annotated tag object
`f48d63ba7297e667bd47d6a7b716f7a31c87e710`. MIT, Copyright (c) 2026
IchNukeDichWeg. Exact source/license/network Git blobs and generated inputs are
listed in the [manifest](../../packages/tetrarch-engine/vendor/tetrarch/manifest.json).
No upstream behavior patches, alternate nets or opening book are redistributed.

## What was implemented

Dedicated branch, [pre-implementation architecture note](tetrarch-v8-architecture.md),
isolated research package, exact-blob vendor script, parameter exporter, pinned
Emscripten build, C ABI shim, TypeScript board/move conversion, canonical candidate
validation, fail-closed capability/fallback, focused tests, a reproducible
legal-set campaign, NNUE reference checks and bounded Node search measurements.
The site and current bot have no runtime dependency on this package.

## Architecture

**Tetrarch thinks; li4chess remains the rules oracle.** The adapter copies a board
into WASM and obtains only from/to/promotion identity. `matchCandidate` regenerates
canonical `legalMoves`; an invalid candidate has diagnostics, never an authoritative
capture, check, special-move flag, award, elimination or result. Terminal and
forfeited turns reject ordinary candidates. Fallback receives a clone and its
identity is matched against the untouched canonical legal list.

The existing arena already supports asynchronous `choose` and canonical matching.
The existing browser already uses an identity-checked, terminable search Worker.
Neither required redesign to establish this spike's conclusion. See the
[dependency map and build instructions](../../packages/tetrarch-engine/README.md).

## WASM integration

Emscripten **4.0.15**, SDK tag commit `389a68bc35dcff7ebae4614e1615099dafda00d1`,
compiles the single C unit through a separate ABI shim with `-O3`, scalar inference,
modular ES-module output, 2 MiB stack, initial 32 MiB linear memory, memory growth,
no filesystem and no threads. Upstream C uses standard headers; architecture-specific
SIMD has a scalar fallback. No Python library, ctypes or filesystem is needed at
runtime. The proof instantiates directly in Node/TypeScript.

Python remains an optional **regeneration tool**: it supplies exact upstream
geometry/Zobrist tables and reference NNUE evaluations, avoiding a second handwritten
definition. TypeScript replaces board packing, network parsing and root iteration.
C supplies fixed-depth search, not iterative deepening or a wall-clock deadline.
Static globals require separate instances for simultaneous searches.

## NNUE

`nets/net-ffa1.nnue`, **1,976,880 bytes**, SHA-256
`3b6ef963fc41786c5211da65ce9141fd192df3caa7af4874f4fde104a89897ae`.
Format `TTNN`, version 2: 3,840 input features → 256 accumulators, seven extra
alive/point inputs → 32 → 32 → one integer output; quantization shifts 6/6/6.
Weights are loaded directly without Python preprocessing. TypeScript checks exact
length, magic, version, dimensions and shifts; C copies arrays. Missing/invalid
NNUE is a fatal initialization error, not silent hand evaluation.

WASM exactly matched Python reference evaluations for classic **−680**, modern
**−681**, by **−689**, byg **−706**, rg **−679**. Search diagnostics confirmed
NNUE remained loaded. This proves five fixture evaluations, not exhaustive
cross-platform/incremental-inference equivalence.

## Rules compatibility

Production-supported subset: **empty**, executable as `canUseTetrarch(state)`.
Every production call is classified `v8-search-semantics-unaccepted`, including the
initial position. A narrower root serializer exists only for differential tests.

| Area | Pinned v8 finding and implication |
| --- | --- |
| Coordinates / players | `rank*16+file` mailbox versus canonical `rank*14+file`; R/B/Y/G numbering agrees; all 160 squares round-trip tested |
| Setups | Five upstream layouts; canonical product uses its fixed Modern geometry. Five analysis layouts and four turns tested; other-layout castles are not certified |
| Active kings | `is_enemy` permits capturing them; reproduced in four orientations and two seeded playout roots. Canonical rules forbid it |
| Deferred elimination | C resolves no-move seats during rotation/search, but its leaf cutoff can precede resolution; not equivalent to the complete canonical transition contract |
| Passive armies | Alive mask preserves occupancy and disables attacks; 35 corpus positions had inactive owners. Walking-only kings cannot be encoded |
| EP | C has four per-owner target/victim slots, no canonical per-capturer eligibility set. It permits EP onto occupied targets with two captures. All pending canonical EP rights are excluded |
| Castling | Rights bits/home geometry exist. Canonical moved flags/ownership and full rights transition parity are not certified by root agreement |
| Promotion | Separate `PQUEEN=6` preserves provenance/value in direct packing. FEN4 loses it, so FEN4 is not used |
| Scores | C stores unsigned 16-bit integers; canonical split mate awards can be fractional |
| Mate | `ffa_award_elimination` awards the preceding alive seat, rather than splitting among active checking owners |
| Stalemate | v8 credits the victim +20, without canonical opponent-caused attribution or walking-king rules |
| Multi-check | v8 counts checks by the moved piece; canonical awards newly delivered own-army checks, including discoveries and Queen-tier selection |
| Terminal utility | `paranoid` immediately returns a losing mate score if the root is eliminated, and a winning score for sole survival. Canonical final points rank every player, including eliminated leaders |
| Repetition / draws | Upstream search treats a first repeat as a cutoff; the proof supplies no prior history. Canonical repetition identity includes additional rights/flags. Full 200-turn/material/award behavior and claim-win are not implemented in C search |
| Forfeit / ledger | No walking kings, seeded automatic turns, opening abort guard, cause tracking, canonical ledger or replay transaction state in the C board |

These findings come from the pinned C source, notably `is_enemy` (line 199),
`tt_gen_pseudo` (340), `ffa_award_elimination` (2515) and `paranoid` (2586),
plus upstream `board.py`, `search.py`, `core.py`, `nnue.py`, `game.py` and
`docs/RULES.md`. The upstream rules document explicitly records several assumptions
and its active-king-capture defect. li4chess rules were not changed to agree.

Correction to the proposed feature list: the v8 **FFA paranoid path does not call
quiescence**, PVS, LMR or LMP; those richer mechanisms are in the Teams path.
FFA does use alpha-beta bounds, move ordering, NNUE and a transposition table.
Its terminal utility also differs from its NNUE's point-based evaluation.

## Differential testing

Final corpus totals and raw mismatch states are retained in
[the evidence](tetrarch-v8-evidence/report.json).

| Measure | Count |
| --- | ---: |
| Positions tested/classified | 4,385 |
| Root-representable positions compared | 4,339 |
| Canonical legal moves compared | 162,787 |
| External legal moves compared | 162,793 |
| Exact root-set matches | 4,333 |
| Explained mismatch positions | 6 |
| Unexplained mismatch positions | 0 |
| Unsupported root positions | 46 |
| Production-supported positions | 0 |

Corpus: five setups × four current turns, rotated active-king-capture/castling/
promotion witnesses, eight checked-in tactical positions, a hash-validated user
replay checkpoint, and 24 fixed-seed canonical playouts of up to 180 plies each.
Only canonical moves advanced playouts. Coverage includes 212 checked current-seat
positions, 153 positions offering castles, 77 offering promotions and 35 with
inactive owners. The latter counter includes classified roots, not only comparisons.

All six discrepancies are additional active-king captures (four direct witnesses,
two seeded positions). No missing canonical move occurred. Unsupported roots:
44 pending EP states and two historical tactical fixtures whose moved pawns are
on their home line. Counts are never improved by filtering illegal external moves
out before comparison. No conversion bug or li4chess rule bug was inferred.

This is a broad **root-move diagnostic**, not complete transition/scoring parity.
It includes no no-legal-move roots, full imported-replay reconstruction campaign,
or exhaustive EP/deferred-mate/stalemate/claim terminal matrix. The demonstrated
semantic blockers make those later acceptance campaigns premature. Zero unexplained
root discrepancies is necessary but does not neutralize explained incompatibilities.

## Arena results

**Not run.** The rules/search gate failed. No arena engine was registered and no
production/classic opponent was weakened. No placement, win rate, fallback-rate
strength result or Elo estimate exists. Upstream engine-vs-engine claims describe
its own rules and opponents and are not evidence of strength under li4chess rules.

## Search-budget results

The final-run table is recorded below. All runs use the canonical initial board,
fresh TT contents, scalar WASM, 16 MiB TT, maximum depth 32, a one-billion-node
outer ceiling and the requested wall-time target. Only completed depths select
the evaluated candidate; the node count also includes the discarded partial depth.
This local root uses v8's rate estimate but deliberately does not copy Python's
0.06 early-stop fraction. These are measurements of **v8 C with the local root**.

| Target | Actual ms | Depth | Nodes | Nodes/s | Move |
| --- | ---: | ---: | ---: | ---: | --- |
| 100 ms | 103.4 | 3 | 18,187 | 175,838 | j1–i3 |
| 250 ms | 208.4 | 4 | 43,436 | 208,427 | j1–i3 |
| 500 ms | 545.0 | 5 | 114,994 | 210,992 | f2–f3 |
| 1000 ms | 1233.5 | 5 | 231,273 | 187,487 | f2–f3 |
| 3000 ms | 3628.4 | 5 | 664,401 | 183,111 | f2–f3 |
| 5000 ms | 5062.0 | 6 | 941,282 | 185,949 | j1–i3 |
| 10000 ms | 10361.9 | 6 | 1,885,870 | 182,000 | j1–i3 |
| 15000 ms | 15822.7 | 6 | 2,824,500 | 178,509 | j1–i3 |
| 30000 ms | 31673.6 | 6 | 5,621,863 | 177,493 | j1–i3 |

Each returned candidate was matched against canonical legal moves. The PV API
returned only one move in these FFA runs; no deeper variation is invented.
The move changes with completed depth, and longer elapsed time often fails to
complete an additional FFA ply. A 10,000-node search repeated the same depth-3
candidate and node count from a cleared position. **60 s was not tested.**

Rate-estimated node caps overshoot time targets. A real Worker hard watchdog,
completed-iteration messages and reliable termination would still be necessary.
There is no measured cancellation guarantee in this Node-only proof.

## Recommended difficulty settings

Do not ship Tetrarch difficulty tiers from this evidence. Playing strength was
not measured. Retain current production settings for this spike's merge, if any.
For a future compatible engine, preserve the requested **10–15 s Expert** and
**30–60 s analysis** envelope as hypotheses, with shorter 100–250 ms, 500 ms–1 s,
and 2–4 s tiers. Calibrate across tactical/middlegame/endgame and device classes,
not by scaling this single-position throughput or intentionally random blunders.

## Browser / Worker behavior

**Prototype and browser measurements deferred at the failed compatibility gate.**
No new claim is made about responsiveness, startup, cancellation, stale replies,
initialization recovery or browser compatibility. The existing production Worker
and its identity/termination/fallback contract are unchanged. A future adapter must
retain that contract, use termination to interrupt synchronous C, and send completed
iterations so a hard deadline can retain an evaluated result. No main-thread C
search fallback is permissible.

## Performance

- WASM: **46,790 bytes**, gzip **20,479 bytes**.
- ES-module glue: **8,364 bytes**; parameters: **85,872 bytes**; NNUE: **1,976,880 bytes**.
- Combined raw runtime inputs: **2,117,906 bytes** (not shipped).
- Node module instantiation plus parameter/TT/network setup: **5.24 ms** in the recorded sample.
- Parameter/TT/network portion: **2.78 ms**; NNUE copy portion: **0.62 ms**.
- Observed WASM linear memory: **32 MiB**, including the configured **16 MiB TT**.
- Freshly set deterministic 10,000-node search: **57.70 ms**, depth **3**.


These are local Node measurements on Windows x64, Node 24.18.0, AMD Ryzen 5 5600X;
not download timing or mobile/browser estimates. Linear memory is not total process
RSS or a measured peak. CPU utilization, Worker startup, cancellation latency,
CPU-throttled/browser behavior and a multi-position first/warm distribution were
not measured. The final campaign ran without concurrent repository tests/builds.

No assets are shipped by the current site. If resumed, load Worker/WASM/network
only when enabling CPU play. The roughly 2 MiB research payload makes conditional
loading reasonable, but browser benefit has not been measured.

The optional upstream `books/book-ffa20k.txt` is **6,459,409 Git-blob bytes**.
`book.py` generates balanced FEN4 starting positions for training/matches; it is
not a required C runtime move-lookup book. No early-play improvement in li4chess
is established. It is not imported; FEN4 provenance/EP assumptions would need a
separate review even if its repository MIT notice covers redistribution.

## Fallback behavior

Production capability is always false: expected fallback **100%** if this candidate
is selected through the illustrative adapter. The root serializer's observed 46/4,385
exclusion rate is not a production fallback estimate. Research initialization rejects
NNUE failure explicitly; illegal candidates retain useful diagnostics. App gameplay
continues exclusively on the current native Worker path; no systemic fallback is hidden.

## Risks / open issues

Adoption requires a compatibility fork with explicit king-capture, score attribution,
final-placement utility, EP, history/draw and walking-state decisions. Fixing root
legality alone leaves the same defects in descendants. Integer scoring representation
must accommodate canonical fractional awards. Search utility changes also invalidate
assumptions about the FFA-trained network and upstream strength comparisons.

WASM is viable, but this proof is not a production-ready bot. No acceptance is
inferred from a successful diagnostic command, a legal opening move or upstream
benchmark headlines. Further research needs a new bounded scope; no automatic next
phase, engine rewrite or deployment is included.

## Files changed

`packages/tetrarch-engine/` contains the isolated adapter, build scripts, shim,
pinned assets, manifest, tests and README. Added this report, the architecture note
and retained evidence; updated `.gitattributes`, third-party notices, workspace lock,
README, roadmap and project state. Existing rules/bot/classic/arena implementation,
Worker, web application, old research artifacts and CI workflows are preserved.

## Validation commands and results

On Windows/Node 24.18.0/Corepack pnpm 10.33.0, final source based on `c62507e`
plus the isolated spike:

- `corepack pnpm install --frozen-lockfile`: passed.
- `corepack pnpm lint --force`: passed, 11 packages, no cached tasks.
- `corepack pnpm test --force --concurrency=1`: passed, **742 tests**, including
  **11 new adapter tests**, no cached tasks.
- `corepack pnpm build --force`: passed, 11 packages, no cached tasks.
- `corepack pnpm --filter @li4chess/web test:e2e`: **53 passed**, no retries.
  These verify the existing browser product, not Tetrarch in Chromium.
- Vendor hash checks, Emscripten build/rebuild and final `proof`: passed as
  diagnostic execution; the recorded search-compatibility decision remains NO-GO.
- All **51 measured input hashes** match the delivered source. The WASM rebuild
  matches SHA-256 `a35d46272740f065baee2bb1b9bf34bde3222141ec3f0be7532fc333ab2e4e9f`.
- Local changed-document file links and diff formatting checked. There is no
  repository `format` script; TypeScript checking is included in `lint`.

[Actual logs](tetrarch-v8-evidence/README.md) retain the failed first unit attempt:
nine arena tests rejected source drift because the log itself was being written
inside the tracked documentation tree. The rerun moved logs to ignored
`arena-results` and held the tree fixed; no guard, timeout or test was weakened.
Initial sandbox compiler execution and pnpm module-layout setup also required
environment correction; neither is evidence of a C/WASM defect. Normal Turbo
no-output warnings for no-emit packages remain unchanged. No deferred-backend
integration campaign or deployment was performed.

## Branch / PR

Branch `codex/tetrarch-v8-integration-spike`, based on latest fetched main
`c62507e60b24955950af3d6a5780d4c62347c410`. Review-only research; do not merge
automatically. [Draft PR #24](https://github.com/ariesyous/li4chess/pull/24) is
pushed and open. Logical commits separate the architecture (`4341455`), isolated
implementation (`e89232f`) and evidence/report (`4ba6fcc`); documentation closeout
adds this publication record. No merge or deployment occurred.

## Recommended next step

Keep the existing bot as the production fallback and review this NO-GO report.
If pursuing Tetrarch further, scope a **C compatibility fork** with executable
transition/scoring and terminal-utility fixtures before another strength campaign.
That reuses its C/WASM and NNUE investment without tuning the existing TypeScript
bot or pretending another unverified external engine is already suitable.
