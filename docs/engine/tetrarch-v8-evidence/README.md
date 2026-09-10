# Tetrarch v8 spike evidence — 2026-09-09

[Decision and interpretation](../tetrarch-v8-report.md): **NO-GO for unmodified v8**.
Successful commands here are diagnostic/validation evidence, not production acceptance.

- [Final report JSON](report.json): exact engine/adapter/vendor/corpus input
  hashes (51 files), baseline Git revision plus explicit dirty-tree status,
  Node/OS/CPU, asset hash/sizes, NNUE evaluations, deterministic search,
  100 ms through 30 s results, corpus counts and six complete mismatch states.
- [Parity extract](parity.json): the same final corpus counts and witnesses.
- [Frozen install](install.log), [uncached lint](lint.log),
  [uncached unit tests](test.log), [uncached build](build.log),
  [53 browser regressions](e2e.log).
- [Compiler identity](wasm-build.log), [rebuild output](wasm-rebuild.log).
  The rebuild emits no text on success; the rebuilt binary SHA-256 was checked
  against `report.json` and matched.
- [Rejected first unit run](failed-provenance-test.log): tracked log writes
  caused nine arena provenance failures. Final tests instead logged into ignored
  `arena-results/tetrarch-validation-final`, with all source files held fixed.

Measured code was `c62507e60b24955950af3d6a5780d4c62347c410` plus the research
implementation whose hashes are in `report.json`. Final source input hashes were
verified after the run; later closeout changes concern documentation/log retention.
This is Windows x64, Node 24.18.0, pnpm 10.33.0, Ryzen 5 5600X evidence, not CI
or browser-WASM timing. Python/NumPy reference generation used NumPy 2.3.5.
The final benchmark ran without simultaneous repository builds/tests.

Two earlier exploratory campaigns remain in ignored `arena-results` locally;
their results are not substituted for the final measurements. The first used
checkout-converted source bytes; the final vendor script reads exact Git blobs.
The final campaign includes the added tactical/replay corpus and final terminal/
fallback guards. The rebuild is reproducible with the
[package instructions](../../../packages/tetrarch-engine/README.md).

Not measured: arena playing strength, full transition/scoring parity, C/WASM
browser execution, Tetrarch Worker behavior, cancellation, stale replies or
failure recovery, mobile performance, CPU utilization, total RSS, or 60 s search.
The failed rules/search gate intentionally prevents claiming those later stages.
