# M3-01 acceptance evidence

Measured 2026-09-06 against the [pre-implementation acceptance plan](../m3-01-acceptance.md).
The [ADR](../m3-01-adr.md) retains D09's Cloudflare architecture with explicit
recovery and hosted gates. The shipped app still provides local play only.

## Accepted local runtime run

All **14 check groups passed**, with **8 real runtime starts / 7 forced restarts**.
The harness ran actual Wrangler/workerd, SQLite-backed GameRoom objects, local
D1 bindings and real HTTP/WebSocket clients. No Cloudflare services or credentials
were provisioned. [Summary](local-runtime/summary.json),
[environment/configuration identity](local-runtime/manifest.json),
[redacted configuration](local-runtime/configuration.json).

Source: `d0249a3deffe0ed3e147b49b33e50ebc8b5c6f05` plus the frozen dirty tree
`sha256:f2df1ffc9634697115e700338d9ee6436650d8a77ffb380ef20049527ea9b1f3`.
All **272 source files** were retained, and their path/length/content digest was
independently recomputed before packaging. Source remained unchanged throughout
the accepted run. Later closeout documentation is not retroactively part of it.

Environment: Windows kernel 10.0.26200 x64, AMD Ryzen 5 5600X / 12 logical CPUs,
34,269,650,944 bytes RAM, Node **24.18.0**, pnpm **10.33.0**, Wrangler **4.129.0**,
workerd **1.20260903.1**. Port 8799; seed `00000001`; compatibility date 2026-09-01.
The generated config uses local-only bindings and a fresh persistent directory.

| Input / boundary | Observed result |
| --- | --- |
| Static Assets and Worker routing | Existing Vite HTML and its JS module served at `/li4chess/`; root probe served; health succeeds and unknown API remains JSON 404. Asset bytes/hashes retained separately, including their embedded producing-build metadata. |
| Invalid clients | Missing/wrong/game-mismatched capability, actor mismatch, unknown fields, old protocol, server-only action, wrong method, oversized fixed/chunked bodies and bad WebSocket origin/version/token/future sequence reject. A subsequent valid request still succeeds. |
| Duplicate/stale/concurrent | Original receipt survives lost response and later commands; ID/content collision rejects. Two simultaneous eligible commands yield one 200 and one 409. During a 500 ms injected persistence delay, no acknowledgement or gameplay broadcast occurs; a concurrent request remains stale. A 24-request excess burst yields 14 stale 409 and 10 queue 429 responses, no extra actions. |
| Before prepare restart | No action exists; retry applies it exactly once. |
| After prepare restart | Exact stored successor reconciles into D1, then the local cache; duplicate retry returns the same receipt. |
| After D1 restart | Exact canonical successor is recognized; local finalization cannot duplicate the action. |
| After local finalize restart | Original canonical receipt/state survives the missing response. |
| Cache-only loss | Protected test hook removes local snapshot, leaves pending storage alone; D1 reconstructs the same snapshot. This does not simulate losing a pending intent. |
| Actual D1 failed batch | The attempted INSERT followed by nonexistent-table SQL rolls back: D1 row count remains one, prepare remains pending. Reads/new commands return unavailable and no candidate gameplay snapshot escapes. Clearing the injected fault commits the original command once. |
| Live observer after ambiguous finalize | Receives exact versioned `resyncRequired`, stops using the old connection and immediately authenticates a new one. Full canonical replay and duplicate receipt agree. It does not wait for a TCP close event. |
| Modern repetition game | 16 legal Knight moves, 16 command sequences, 21 replay events; four ordered +10 awards and exact terminal repetition result survive the after-D1 restart and retry. |
| Walking / survivor game | 12 legal opening Pawn moves, three post-opening resignations, one recorded seeded walking action. The walking action survives after-prepare restart; the third resignation survives after-finalize restart. Green wins with three ordered +20 survivor awards and unchanged PRNG history. |

Every recovered action is compared to a separately authored replay via the shared
production engine/protocol, then independently read with `readReplay`. Full
canonical replay equality covers metadata, state hashes, ordered effects, random
selection and terminal facts. This is a separate execution of the shared oracle,
not an independently implemented chess engine. D1 count/head assertions establish
that duplicate attempts do not add rows. The accepted runtime log contains no
unhandled request-stream or WebSocket errors.

## Artifacts and reproduction

- [Exact HTTP/WebSocket observations](local-runtime/observations.json.gz),
  [runtime log](local-runtime/runtime.log.gz), and [checksums](local-runtime/checksums.json).
- Complete [repetition replay](local-runtime/repetition.replay.json) and
  [walking/survivor replay](local-runtime/walking.replay.json).
- [Full frozen source](local-runtime/source.json.gz): JSON with `producer` and
  `files`, mapping repository-relative paths to base64 bytes. SHA-256 folds
  sorted path, NUL, decimal byte length, NUL and bytes, matching protocol's
  `readBuildIdentity`. No credential-bearing generated config is included.
- [Exact staged assets](local-runtime/assets.json.gz): path → base64 map;
  manifest records SHA-256 for each. They are real built artifacts, not a claim
  that the subsequently edited documentation was in their embedded producer.

Use Node's `gunzipSync` or a gzip reader for compressed JSON/text. The original
local run directory was `arena-results/m3-01-acceptance-20260906-v4`; the copied
manifest's `source/` and `runtime/` refer to that original layout. The published
source equivalent is `source.json.gz`; SQLite runtime files and fixture secrets
are intentionally not published. No production data was accessed.

From a checkout with Node 24 and pinned pnpm, run `pnpm build`, then
`pnpm --filter @li4chess/architecture-spike test:integration`. It rejects an
existing output directory, an occupied port and source drift. See
[package workflow](../../packages/architecture-spike/README.md). CI executes the
same command after build, without Cloudflare credentials, and uploads redacted
evidence. Readiness polling awaits startup; it does not retry failed assertions.

## Review findings and unsuccessful runs

Fresh independent consistency and security/evidence reviewers found and verified
fixes for predecessor/prefix validation, stale observers after local finalize,
queue/body bounds, transport-aware costs, future-sequence/restart WebSocket tests,
and clock/milestone wording. Unit regressions reject individually valid but
divergent restored replay prefixes. No substantive review finding remains open.

[Eight unsuccessful attempt summaries, identities and logs](local-runtime/failed-attempts.json.gz)
are retained separately; none count as accepted validation. The main findings:

1. Returning an authorization response with a live forwarded request body caused
   the next request to fail; workerd reported reading after a response ended.
   Canceling oversized input also failed the local stream pump. The final probe
   buffers accepted input, drains/discards excess, and has regressions for both
   fixed-length and chunked oversized input followed by healthy requests.
2. Echoing reserved WebSocket close code 1005 emitted an unhandled runtime error.
   Close handlers now normalize codes. Later isolated diagnostics showed a valid
   close frame received and acknowledged while the local proxy withheld TCP END;
   waiting five seconds for CLOSED was unsupported. Merely changing close codes
   did not fix it. Explicit `resyncRequired` now drives immediate reconnect, with
   unchanged exact-state assertions; this does not pretend the TCP issue vanished.
3. One exploratory run passed behavior checks but failed the source-drift guard
   during concurrent edits. It is not accepted evidence. A test producer fixture
   initially omitted required engine/protocol package versions; the fixture was
   corrected without changing production validation.

## Validation and limits

Fresh Windows checks ran with Node 24.18.0 / pnpm 10.33.0: frozen install,
`pnpm lint --force`, `pnpm test --force` (**606 unit tests**), `pnpm build --force`,
and `pnpm --filter @li4chess/web test:e2e` (**46 browser tests**, no retries).
Changed prototype test sources type-check in package lint. The final prototype
changes additionally passed the complete local integration above. Pushed-revision
CI and final closeout are recorded in [project state](../project-state.md).

This proves bounded local application consistency across completed durable write
boundaries, including actual process-tree termination and restart. Faults/delay
are explicitly injected; D1 SQL/batch/storage and local WebSockets are real runtime
bindings. It does not prove interruption during an OS disk flush, regional failure,
hosted D1 replicas, hibernation billing, PITR, live clock deadlines, guest lifecycle,
long-game throughput or deployment rollback. The retained-body limit does not
bound wire bytes or slow-client duration. Full snapshots are intentionally small
and inefficient; normalization remains M3-03.

The ADR's M3-02 through M3-06 handoff keeps these gates explicit. M3-01's local
architecture conclusion is to retain D09 with the persistence/resync contract;
M3 as a whole remains incomplete. No service was provisioned or deployed.
