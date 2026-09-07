# M3-02 Workers foundation acceptance evidence

Measured 2026-09-06 America/New_York (2026-09-07 UTC) against the
[pre-implementation acceptance plan](../m3-02-acceptance.md).
Implementation: [`5508cdb18a1d9166177d5ef4f2ed736a9a9870c9`](https://github.com/ariesyous/li4chess/commit/5508cdb18a1d9166177d5ef4f2ed736a9a9870c9).
The accepted run used a **clean working tree**, source fingerprint
`sha256:763f3d2a07d7611fa55c15044aa04bedf90cd5f312d13d0ed7c21f41e3ee8604`.
The full 302-file source snapshot is retained and its digest was recomputed.
This evidence predates its own packaging and later closeout documentation.

The application serves local games only. No Cloudflare account, resource, build
trigger, secret, route, upload, deployment or paid plan was created. The
[operations handoff](../m3-02-operations.md) separates repository configuration
and local verification from hosted activation.

## Accepted checks

All required commands passed in one source-stable local run, with no assertion
retries. Full [validation log](local-runtime/validation.log.gz) and
[runtime environment/Pages asset hashes](local-runtime/manifest.json).

| Command from repository root | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile unchanged |
| `pnpm lint --force` | All eight packages; changed runtime/test/tool sources included |
| `pnpm test --force` | 606 unit tests passed |
| `pnpm build --force` | All packages, including the default Pages `/li4chess/` build |
| `pnpm --filter @li4chess/web test:e2e` | All 46 existing browser tests passed |
| `pnpm --filter @li4chess/architecture-spike test:integration` | All 14 groups, eight actual runtime starts, seven boundary restarts |
| `pnpm build:workers` | Root-path app built with shared frontend/Worker producer; existing Pages output byte-identical afterwards |
| `pnpm check:workers` | Both explicit staging/production Wrangler deploy **dry-runs** passed; only ASSETS and APP_ENV bindings |
| `pnpm test:workers` | Four HTTP/browser groups plus two cancellation boundaries passed through actual local Wrangler/workerd |
| `git diff --check` | Passed |

`--force` bypassed Turbo caches; it did not change test assertions. Environment:
Windows 11 kernel 10.0.26200 x64, AMD Ryzen 5 5600X, 12 logical CPUs,
34,269,650,944 bytes RAM; Node **24.18.0**, pnpm **10.33.0**, Wrangler **4.129.0**,
workerd **1.20260903.1**, Playwright **1.56.1**. Chromium's actual version is
recorded in [browser observations](local-runtime/browser-observations.json).
The host-global wrapper was 11.19.0; temporary Corepack shims selected pinned
pnpm without changing the global installation.

## What the runtime proves

- GET/HEAD health/build responses have bounded non-sensitive JSON, method/status
  and cache headers. Unknown APIs, including old prototype paths and encoded API
  separators, remain JSON 404 under browser navigation headers. Unsupported
  methods return 405/Allow, upgrades reject, internal/source paths and missing
  assets cannot become SPA HTML. [HTTP observations](local-runtime/http-observations.json).
- Every built asset is served with the exact recorded hash and expected MIME
  type. HEAD omits bodies. Root/index and nested extensionless navigation return
  the exact shell. Pages-prefixed bundle URLs are not silently accepted by the
  root-path Worker. Both outputs' hashes are recorded; Pages deployment workflow
  is unchanged. These are local checks, not hosted Pages/CDN checks.
- A real Red move is followed by three actual bounded CPU Worker searches.
  Native started/result messages match identities and seats; all complete depth
  one within the 128-node policy, with no fallback or recovery. The exported
  replay independently validates through the production engine/protocol.
  Reload/resume and replay import produce the exact expected checkpoint replay,
  including the source replay hash and current producer. This is independent
  replay execution with the shared engine, not a separately implemented engine.
- Desktop 1280×720 and phone 360×800 checks keep all 160 playable squares within
  the board. Keyboard selection/movement, save/resume and phone page width pass.
  [Desktop capture](local-runtime/worker-game.png) and
  [phone capture](local-runtime/worker-phone.png) were visually inspected.
- Startup and ready-runtime interruption both exit 130 and release ports.
  Normal completion also stops the owned runtime and verifies port release.
  Windows uses IPC to invoke the registered SIGTERM handler; Linux CI sends an
  actual OS SIGTERM. This is not a Windows OS signal-delivery or power-loss test.
  [Lifecycle observations](local-runtime/lifecycle.json), [summary](local-runtime/summary.json).

## Artifacts and reproduction

The original fresh directory was `arena-results/m3-02-accepted-5508cdb`.
Only selected non-secret files are published here; runtime storage is omitted.

- [Source snapshot](local-runtime/source.json.gz): JSON `{producer, files}`;
  files maps repository-relative paths to base64 bytes. Digest folds sorted path,
  NUL, decimal byte count, NUL and bytes exactly as protocol `readBuildIdentity`.
- [Built frontend bytes](local-runtime/assets.json.gz),
  [artifact identity/hashes](local-runtime/artifact.json), and
  [runtime configuration](local-runtime/configuration.json).
- [Staging dry-run bundle/log](local-runtime/dry-run-staging.json.gz) and
  [production dry-run bundle/log](local-runtime/dry-run-production.json.gz): each
  is a filename → base64 map, including Worker bundle and source map. These are
  local bundling/configuration results; there is no Cloudflare version ID.
- [Runtime log](local-runtime/runtime.log.gz), [test output](local-runtime/tests.log.gz),
  [browser report](local-runtime/browser-results.json), and
  [verified game replay](local-runtime/worker-game.replay.json).
- Fresh preserved-prototype [summary](local-runtime/architecture-summary.json),
  [manifest](local-runtime/architecture-manifest.json),
  [redacted config](local-runtime/architecture-configuration.json), and
  [runtime log](local-runtime/architecture-runtime.log.gz). Its source is the
  same accepted revision; the full original run remains in the ignored directory.
- [Checksums](local-runtime/checksums.json) cover all published raw artifacts.
  Use Node `gunzipSync` or a gzip reader to inspect compressed data.

Reproduce with the [package workflow](../../apps/worker/README.md). Do not edit
source during evidence collection. CI runs the same new checks after existing
regression coverage and uploads selected evidence including both dry-run bundles.
The stacked [draft PR #13](https://github.com/ariesyous/li4chess/pull/13) depends on
open PR #12; its final pushed revision must have successful CI before closeout.

[Implementation CI](https://github.com/ariesyous/li4chess/actions/runs/34078142730)
passed on `5508cdb18a1d9166177d5ef4f2ed736a9a9870c9`, including the full new
runtime/browser and environment dry-run steps. The downloaded
[CI record](local-runtime/ci-implementation.json) confirms a clean PR merge
checkout `2d5e4bb3f9559a7a139df5b5c627f85667a6129a`, Node 24.20.0 on Linux,
pnpm 10.33.0, Wrangler 4.129.0 and workerd 1.20260903.1. Both OS SIGTERM
boundaries passed, all four Worker test groups passed, and both environment
dry-run bundles/logs were present in the uploaded artifact. Final documentation/evidence
revision checks are verified again before closeout and linked from the PR
description, avoiding a self-referential evidence-commit identity.

## Review and rejected attempts

Fresh substantive and final independent reviewers checked routing/security,
provenance, deployment isolation, current official sources and evidence. They
verified source digest reproduction and the following resolved findings:

1. Register cancellation handling before startup; own the interruption-test
   subprocess too, and share per-child cleanup promises to prevent duplicate kills.
2. Observe actual CPU search results, since successful legal recovery alone would
   not prove that the built CPU Worker executed search.
3. Screenshot inspection found pre-existing grid min-content overflow at short
   desktop height. Shrinkable grid tracks and all-square geometry assertions
   prevent right-arm clipping; no rules/state transition changed.

Explicit hidden-file inclusion makes the narrowly enumerated CI dry-run artifact
paths unambiguous; no previous hosted upload loss was observed or claimed.

[Three rejected runtime attempts](local-runtime/failed-attempts.json.gz) retain
their exact identities, logs and failure summaries: the first used an incorrect
same-sequence replay expectation across a checkpoint boundary; the second exposed
a Windows loader-path issue in the new cancellation fixture; the third detected
that parent process exit preceded descendant socket release. The full checkpoint
oracle, file URL loader, and bounded teardown readiness fixed those causes.
Type-check attempts also caught a missing DOM library, unsupported fork option
and NodeList iteration typing before acceptance. Assertions were corrected to the
actual contract or strengthened, not bypassed; no retries were added.
Earlier passing runs before the grid correction are superseded and do not count
as final visual acceptance.

## Remaining gates and next slice

Local workerd does not verify hosted GitHub Builds settings, names/account access,
DNS/TLS, deployment/cache propagation, rollback, observability, regional behavior,
capacity or cost. Separate environments have configuration but no hosted resources.
Physical-device and screen-reader checks remain unperformed. Saves remain
origin-scoped; moving to a future Workers origin requires replay export/import.

M3-03 should implement reviewed normalized D1 migrations and persistence tests:
games/command receipts/ordered events/checkpoints and minimal identity records;
unique command ID and sequence constraints; owner generation/expected-head fencing
that aborts the whole canonical batch; bounded incremental reconstruction and
checkpoint lineage; measured retention/page/parameter limits; divergent-restore
quarantine and compatibility policy. Keep committed results immutable. Use the
ADR's durable-prepare → canonical-commit → acknowledgement boundary. Do not copy
the spike's quadratic full-replay table or fixture credentials. Production room
authority, clocks/alarms, guest lifecycle and multiplayer remain M3-04/M3-05.
No M3-03 schema or persistence behavior is implemented by this slice. M3 remains
incomplete.
