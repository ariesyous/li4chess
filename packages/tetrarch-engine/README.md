# Tetrarch v8 research package

**Not a production bot.** The production capability predicate always returns
`supported: false`. Unmodified v8's search rules are incompatible with li4chess.
The existing browser bot remains in use. See the
[architecture note](../../docs/engine/tetrarch-v8-architecture.md) and
[integration report](../../docs/engine/tetrarch-v8-report.md).

## Pin and boundaries

- Repository: <https://github.com/IchNukeDichWeg/Tetrarch>
- Tag `v8`, commit `4a35cea06b710a6633302c2226ebfebbba52d7a4`.
- MIT, Copyright (c) 2026 IchNukeDichWeg. The exact upstream
  [license](vendor/tetrarch/LICENSE) is retained.
- [Manifest](vendor/tetrarch/manifest.json): Git-blob hashes of the sole C source,
  license and `net-ffa1.nnue`, plus generated parameter/reference hashes.
- No upstream behavior patches. `native/bridge.c` is a local ABI shim, separate
  from the upstream source. No opening book, other networks, Python engine or
  upstream tooling is redistributed. Python/NumPy are build-time inputs only
  when regenerating parameters. Normal builds/tests need neither Python nor C.
- `.generated` holds ignored WASM/ES-module output. It is not shipped by the web
  app. `src/wasm.ts` is a research runner, deliberately absent from package exports.

## Reproduce

From the repository root, use Node >=24 and Corepack pnpm 10.33.0:

```sh
corepack pnpm install --frozen-lockfile
git clone --depth 1 --branch v8 https://github.com/IchNukeDichWeg/Tetrarch.git arena-results/tetrarch-v8-upstream
git -C arena-results/tetrarch-v8-upstream rev-parse HEAD
corepack pnpm --filter @li4chess/tetrarch-engine vendor
```

`vendor` defaults to that ignored checkout, verifies its exact commit and clean
tree, reads imported source via `git show` to avoid CRLF conversion, and invokes
`scripts/export-params.py`. Set `PYTHON` to a Python executable with NumPy (the
recorded build used Python's bundled NumPy 2.3.5). The exporter requires a
little-endian host. It imports pinned `core.py`, `board.py`, `eval_hand.py` and
`nnue.py`, freezes `build_params()` and produces Python NNUE reference evaluations
for five setups. No C library or Python search is invoked by this step.

Install/activate **Emscripten 4.0.15** separately; the spike used an ignored SDK:

```sh
git clone --depth 1 --branch 4.0.15 https://github.com/emscripten-core/emsdk.git arena-results/tetrarch-emsdk
```

Then run the SDK's platform-specific `emsdk install 4.0.15` and
`emsdk activate 4.0.15`. On Windows, use `emsdk.bat` and set `EMCC` to the
absolute `upstream/emscripten/emcc.bat` path and `EMSDK_PYTHON` to the SDK's
`python/3.13.3_64bit/python.exe`. On other platforms, activate its environment
so `emcc` is on PATH. The build checks the compiler version and imported hashes.

```sh
corepack pnpm --filter @li4chess/tetrarch-engine build:wasm
corepack pnpm --filter @li4chess/tetrarch-engine test
corepack pnpm --filter @li4chess/tetrarch-engine proof ../../arena-results/tetrarch-new-run
```

The output directory must not already exist. The proof asserts Python/WASM NNUE
agreement, deterministic node-limited search, legal standard-start candidate and
rotated king-capture rejection; records differential results and the 100 ms,
250 ms, 500 ms, 1 s, 3 s, 5 s, 10 s, 15 s and 30 s envelope. It preserves explained
and unexplained mismatches rather than removing external illegal moves before
comparison. A completed command means the diagnostic ran, **not** that its
recorded compatibility gate passed. Read `stats` and `decision` in `report.json`.

Timing uses a local iterative root with v8's measured-rate node cap, attempted
depths up to 32, and a 16 MiB TT. It does not reproduce Python's early-stop
`FFA_NEXT_DEPTH_FRACTION=0.06` heuristic. It attempts to spend the requested
budget, discards incomplete iterations, and reports overruns honestly. It is
not a hard deadline and must not run on a UI thread. No strength claim follows
from these initial-position measurements. Run without concurrent tests/builds.

## Dependency map and runtime contract

| Upstream responsibility | Research replacement |
| --- | --- |
| `board.py`, `eval_hand.py`, NNUE rotations and Python PRNG Zobrist constants | Frozen 85,872-byte `params.bin`; C `tt_params_size` checked at initialization |
| ctypes shared-library loading and layouts | Modular Emscripten ES module plus narrow C ABI shim |
| Board construction / FEN4 | Typed direct board packing; no FEN4 round-trip or provenance loss |
| `nnue.Net.load`, NumPy arrays | TypeScript validates exact header/length; C copies arrays via `tt_load_net` |
| Python root iteration / limits | Local TypeScript loop, C node limits; no hard time/cancel contract claimed |
| Repetition history | Not transported; benchmark starts from the initial board; root movegen ignores history |
| Game adjudication / points / replay | Always `@li4chess/engine` and `@li4chess/protocol` |
| Protocol / training / match / book tooling | Not required or imported into runtime |

The C unit uses standard integer, math, memory and time headers, with conditional
ARM NEON/x86 AVX inference and a scalar fallback. This build uses the scalar
path, no pthreads, no shared memory and `FILESYSTEM=0`; it needs no file access
or Python at runtime. `clock_gettime` occurs in benchmark helpers, not a search
deadline. Static C globals mean one engine instance/search at a time.

C APIs include `tt_init`, size/ready checks, `tt_alloc`/`tt_clear`,
`tt_load_net`/`tt_net_loaded`, `tt_gen_legal`, `tt_make`/`tt_unmake`,
`tt_eval`, `tt_search`, `tt_set_rep_history`, `tt_pv` and feature toggles.
Upstream TT/history/search state stays inside the WASM instance. Bounds-checked
TypeScript callers copy only required values; no C result mutates game state.

## Root conversion is not production support

`researchCapability` classifies whether the limited **root legal-move view** can
be packed for a diagnostic. It rejects terminal states, wrong ruleset, every
pending EP right, forfeits/walking kings, fractional or out-of-u16-range points,
and moved pawns on their starting line. The C board lacks the latter flag.

Active/passive ownership, occupancy, turn, promotion-to-PQUEEN and rights are
packed directly. Passive mate/stalemate armies retain their pieces. Arbitrary
non-Modern castle geometry, no-move attribution, historical repetition, seeded
actions, ledgers, terminal results and claim behavior are not certified for
search. Even an entirely ordinary root can reach incompatible descendants.
`canUseTetrarch` therefore rejects **every** production state. No measured
root-representation percentage is advertised as a safe fallback rate.

Candidates carry only from/to/promotion. `matchCandidate` resolves them against
the canonical legal list; external capture, check, elimination and castle/EP
flags never supply authority. Rejections include root identity, raw move, turn,
canonical list and capability reasons. `chooseWithFallback` demonstrates the
fail-closed native callback path; the app continues using its existing Worker.

## Update procedure

Do not follow upstream main. A future task must change the exact pin in the
vendor script, adapter constant and documentation; retain prior evidence, verify
license/network provenance, regenerate from a clean checkout, review blob/hash
changes, rebuild and rerun all diagnostics into a new directory. Add local
behavior changes only as explicit, reviewable patches. Reopen full state-transition
and scoring parity before arena strength tests, then Worker/cancellation/browser
gates. Root legality alone cannot promote this package to production.
