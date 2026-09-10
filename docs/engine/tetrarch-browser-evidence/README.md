# Default browser hybrid validation

Windows x64 / Node 24.18.0 / pnpm 10.33.0, 2026-09-09 local.
See [implementation and limits](../tetrarch-browser-default.md).

`lint.log`, `test.log`, `build.log` and `browser.log` retain the complete fixed-tree
validation: lint, 759 unit tests, build and 57 browser tests. `production.log`
records the initial four passing project-base production tests. The final
`project-build-final.log` / `project-production-final.log` and `root-build.log` /
`root-production-fixed.log` verify bundled default WASM/NNUE, asset failure
recovery and fourfold CPU throttling at both `/li4chess/` and `/`.

`root-production.log` preserves a failed preliminary harness run: the root build
was served by a project-base preview server, returning 404 for application JS/CSS.
The corrected preview configuration explicitly sets the matching base; the final
four tests pass at each base. No game or search assertion was weakened.

`manifest.json` checksums every other file here. Runtime byte and source-input
hashes are independently recorded in the package's
[runtime manifest](../../../packages/tetrarch-engine/runtime/manifest.json).
The WASM is byte-identical to the original arena binary. These are integration
and recovery checks, not new playing-strength measurements or physical-device
benchmarks. Historical arena evidence remains separate and unchanged.
