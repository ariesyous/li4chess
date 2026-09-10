# Default browser advisory hybrid

The maintainer explicitly selected the hybrid as the default CPU on 2026-09-09,
after the [arena comparison](tetrarch-hybrid-report.md). This supersedes the
earlier opt-in proposal. Implementation is on draft PR #24; it is not deployed
until that branch is merged and the normal Pages workflow publishes it.

## Runtime

Every CPU seat uses Tetrarch v8 WASM/NNUE in a fresh browser Worker. The canonical
engine still owns legal moves, application, scoring, draws, claims, walking kings
and results. State/game/seat/request identities and canonical intention matching
prevent stale or illegal replies from advancing play. Reset, import, resignation,
new game and unmount terminate active work without starting fallback searches.

The existing `chooseBoundedCpuMove` runs inside the Worker when a root cannot be
represented, assets fail to load or pass integrity, or the adviser returns an
illegal move. If the hybrid Worker crashes, hangs or returns malformed data, the
host terminates it and launches a separate native Worker. If that also fails,
the existing current-legal-list recovery keeps the game playable. No search runs
on the UI thread. Fallback reason and actual engine remain in response diagnostics.

The initial host watchdog is five seconds plus the native tier's time allowance;
native retry uses two seconds plus that allowance. These cover loading and search.
The soft C search time limit uses the tier's existing 50/100/250/500/1,000 ms
allowance and may overrun; Worker termination provides the hard recovery boundary.
Asset loading completes before the search-start notification. HTTP caching can
reuse the immutable hashed asset URLs across fresh Workers.

| Level | Tetrarch node cap | Maximum depth | Soft time allowance |
| --- | ---: | ---: | ---: |
| 1 | 1,000 | 2 | 50 ms |
| 2 | 5,000 | 3 | 100 ms |
| 3 | 20,000 | 8 | 250 ms |
| 4 | 40,000 | 10 | 500 ms |
| 5 | 80,000 | 12 | 1,000 ms |

These are resource tiers, not calibrated ratings or proven monotonically stronger
opponents. Level 3 retains the arena's 20,000-node cap but adds a soft time limit
and depth ceiling. Native fallback retains each existing `CPU_POLICIES` tier.

## Assets and reproducibility

The browser build uses the same pinned v8 C source, parameter ABI, scalar NNUE
and 16 MiB TT / 32 MiB initial heap as the research build. A browser-only Emscripten
module avoids Node filesystem dependencies. Vite emits the WASM, parameters and
network as assets under the configured Pages base, including custom-domain `/`.
The native retry Worker has no WASM or network dependency.

`packages/tetrarch-engine/runtime/manifest.json` records compiler 4.0.15, exact
runtime hashes and C/bridge/build-script input hashes. Every web build checks
those and the vendor manifest. Normal installs/builds need Node/pnpm only.
Regeneration requires the [documented SDK setup](../../packages/tetrarch-engine/README.md)
and `pnpm --filter @li4chess/tetrarch-engine build:browser`.
The worker checks SHA-256 for fetched WASM, parameters and NNUE before use.
Pinned MIT notices remain in the existing third-party notices.

## Verification and limits

Focused tests cover default adviser routing, canonical illegal-move rejection,
native-only recovery, crash replacement, cancellation during retry, stale work
and tier-bound diagnostics. Browser cases exercise real WASM/NNUE, missing and
corrupt networks, fourfold CPU throttling, cancellation, reset/import/resignation
and active Worker failure. Production-preview tests use the built assets; CI runs
them after the normal full browser suite. CPU throttling is a desktop simulation,
not physical mobile-device validation.

Fresh Windows / Node 24.18.0 / pnpm 10.33.0 validation passed lint, 759 unit tests,
build, all 57 browser tests and four production-preview tests at `/li4chess/`.
The emitted assets are 46,790 bytes WASM, 85,872 bytes parameters and 1,976,880
bytes NNUE; the hybrid and native Worker bundles are approximately 48 kB and
35 kB. The WASM hash matches the original measured research binary exactly.
Build input line endings are pinned to LF for portable verification. The same
four production tests also passed with a custom-domain `/` build. An initial
root preview run served the wrong base and returned 404 for application assets;
the preview configuration now explicitly matches the build base. Both base paths
passed after that harness correction.

Fresh logs and checksums are in [browser evidence](tetrarch-browser-evidence/README.md).

The historical 20-game sample remains limited evidence. Root validation protects
played moves, but the adviser can still misjudge hypothetical descendant scoring
or edge cases. No C rule compatibility, new rating or general strength claim is
introduced by selecting the hybrid as default.
