# M3-04 authoritative GameRoom acceptance evidence

Measured 2026-09-07 against the [pre-change acceptance contract](../m3-04-acceptance.md).
The final implementation is
[`c86e7e75c381f02d1dcd7a400a5b047b9c6ca1ee`](https://github.com/ariesyous/li4chess/commit/c86e7e75c381f02d1dcd7a400a5b047b9c6ca1ee),
following acceptance plan `a7aa45f` and reviewed implementation `bec21c8`.
The accepted Windows run used a **clean working tree** with fingerprint
`sha256:56dd58f7e342cc8a8e3fd2f8933b3769703870dd0d118485ad92c6ac5f5a2cd3`.
All **393 source files**, 23,594,337 decoded bytes, are retained in
[source.json.gz](local-runtime/source.json.gz). A fresh independent reviewer
recomputed the digest and compared every file byte with the tested checkout.
Later evidence/documentation edits are not retroactively part of that build.
[Draft PR #15](https://github.com/ariesyous/li4chess/pull/15) tracks implementation
and final documentation-revision CI; exact final-head success is verified before closeout.

## Fresh local validation

Every required command passed in one source-stable run, without assertion retries.
The [full validation log](local-runtime/validation.log.gz) records paths, versions,
commit and exit codes. `--force` bypassed Turbo caches. Changed test/tool sources
are included in TypeScript checks. [Runtime manifest](local-runtime/manifest.json).

| Command from repository root | Actual result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; unchanged lockfile |
| `pnpm lint --force` | All ten packages passed |
| `pnpm test --force` | 642 units passed, including 33 room/timing tests |
| `pnpm build --force` | All packages and default Pages build passed |
| `pnpm --filter @li4chess/game-room test:integration` | 22 groups, 25 real runtime starts passed |
| `pnpm --filter @li4chess/persistence test:integration` | Nine groups, four real runtime starts passed |
| `pnpm --filter @li4chess/web test:e2e` | All 46 browser tests passed |
| `pnpm --filter @li4chess/architecture-spike test:integration` | 14 groups, eight runtime starts passed |
| `pnpm build:workers` | Isolated root-path build; Pages artifact preserved |
| `pnpm check:workers` | Existing staging and production local dry-runs passed |
| `pnpm --filter @li4chess/worker check:room` | Generated-metadata type check, maintained-room bundle and fixture isolation passed |
| `pnpm test:workers` | Four HTTP/browser groups and both lifecycle checks passed |
| Local links / `git diff --check` | 357 local Markdown links at implementation revision resolved; whitespace check passed |

Windows 11 kernel 10.0.26200 x64; AMD Ryzen 5 5600X, 12 logical CPUs,
34,269,650,944 bytes RAM; Node **24.18.0**, Corepack pnpm **10.33.0**,
Wrangler **4.129.0**, workerd **1.20260903.1**. The global pnpm 11 wrapper was
not used or changed. Compatibility date is 2026-09-01; all runtime bindings use
local isolated state and placeholder database IDs, without a Cloudflare account.

[Implementation CI 34086306609](https://github.com/ariesyous/li4chess/actions/runs/34086306609)
passed all checks, including the Linux GameRoom suite's **22 groups / 25 starts**. Its downloaded
[manifest](local-runtime/implementation-ci-manifest.json),
[summary](local-runtime/implementation-ci-summary.json) and
[observations](local-runtime/implementation-ci-observations.json) retain Node
24.20.0, pnpm 10.33.0 and the same Wrangler/workerd versions. GitHub identifies
the run head as `c86e7e75c381f02d1dcd7a400a5b047b9c6ca1ee`; checkout builds the
synthetic PR merge `982acc14aabf494fe49b08531e3fa2e850b9eb36`, recorded by its
producer. Linux bytes/fingerprint differ from the Windows snapshot; those identities
are not conflated. Final PR-head CI is checked again after evidence commits.

## What the local runtime proves

[Observations](local-runtime/observations.json.gz), [summary](local-runtime/summary.json),
[redacted configuration](local-runtime/configuration.json), and
[runtime log](local-runtime/runtime.log.gz) retain the 22 assertion groups.
The archived test source contains their exact state/receipt/timing assertions.

- The maintained SQLite room serializes commands, resync and presence across real
  D1 awaits. Wrong authenticated seat/control, server actions, illegal requests,
  stale owner and wrong object namespace reject. Extra tabs observe; explicit
  takeover changes control. Actual maintained `GameRoom.attach` WebSockets verify
  initial publication and close handling after takeover; old close callbacks cannot
  disconnect a replacement transport instance.
- Stable creation survives uncertainty on either side of D1. Whole-runtime stops
  before prepare, after debit/prepare, after D1, after finalize/before activation,
  after activation and before acknowledgement recover the same canonical outcome,
  receipt and admission facts without repeated debit, increment or random choice.
  Exact old retries retain original admission after later and terminal commands;
  conflicting IDs reject. Unresolved persistence withholds speculative publication.
- A late failing SQL statement rolls back the actual local D1 batch. A real
  delivered alarm repairs retained work without player traffic. Separately,
  injected-time alarms drive seven actual rollbacks through persisted 1, 2, 4, 8,
  16, 32 and 60 second backoff. This proves rearming beyond six platform retries,
  not sixty seconds of observed wall-clock waiting or hosted alarm punctuality.
- Injected future time verifies deadline-minus-one admission, deadline rejection,
  backwards-time clamping, stale/duplicate alarms, main-clock/disconnect ties,
  cumulative banks and multiple connections. A separate wall-clock room verifies
  delivered timeout. Unit regressions cover one-action recovery bounds and prevent
  a reconnect from escaping an already-exhausted recovered bank.
- Cache-only loss reconstructs a bounded canonical suffix. Missing timing, complete
  local loss over an existing D1 game, divergent markers, and valid old pending
  state restored behind a later canonical head stop without stale publication or
  newly invented balances. Pending random walking work and terminal awards survive
  interruption; the [walking replay](local-runtime/walking.replay.json) validates
  through the shared engine/protocol.
- Queue, connection, request and SQLite record bounds are exercised. Additional
  unit regressions verify full-history and oversized automatic preparation stop
  in permanent capacity incidents, and post-prepare conflicts remain ambiguous
  failures requiring resync with pending work retained.
- Maintained D1 tests preserve released migrations and command-v1 reads; explicit
  v1-only policies reject command-v2. Strict admission snapshots participate in
  receipt hashes; tampering and unsupported producer/format policies reject.
  [D1 observations](local-runtime/persistence-observations.json.gz) and
  [summary](local-runtime/persistence-summary.json).

The fixture adapter contains credentials, administrative SQL, fake time and
interruption hooks only under `test/`. The deployable room has privileged binding
contracts, no public gameplay route. Bundle inspection and diff review preserve
the default Worker/Pages behavior, frozen classic bot, archived evidence, released
migrations and engine/state-v2/replay-v2 contracts.

## Measurements, bounds and limits

The [engine-generated long replay](local-runtime/long.replay.json) uses fixed
selector seed `12345678`: **256 commands and 293 events**, independently replay
validated and cache-reconstructed. It is **unfinished/censored**, not a draw,
loss or strength result. [Measurements](local-runtime/measurements.json) and
[1,461 per-request samples](local-runtime/rpc-samples.json.gz) span the full suite.

The long-history loop took **59.567 seconds** on this Windows host, including HTTP,
fixture capture, SQLite/D1 and full canonical checks. Its largest encoded state
was **113,676 bytes**; the final inspected room-records object was **126,244 bytes**
as encoded JSON, including record keys and JSON syntax. The latter excludes
SQLite indexes, pages/WAL and canonical D1 storage. These are
observations for one bounded history, not capacity or latency acceptance targets.

Implementation ceilings are 16 ordinary queued operations plus a coalesced alarm,
eight connections, 1,100,000 bytes per room record, one canonical action/attempt per
invocation, and 1–60 second retry backoff. Persistence retains its 2,048-command,
32-event, eight-command-page and 16-command checkpoint bounds. A room invocation
combines several fenced adapter calls: its worst-case aggregate query count can
exceed the Free plan's 50-query allowance. No operating plan or launch control is
selected; hosted query/CPU/load budgets must be established before activation.

Cold recovery conservatively resumes the last durably accounted balances and
does not charge unknown infrastructure time. Same-prefix operational rollback
cannot be detected from D1 alone without an independently newer operational
marker. These policies are explicit in the [room contract](../../packages/game-room/README.md)
and [M3-05 handoff](../m3-05-handoff.md). Local restart tests do not prove power-loss
disk flushing, hosted eviction/hibernation availability, regional failover, alarm
punctuality, Time Travel or coordinated D1/DO restore. Official platform sources
and their 2026-09-07 review date are in the [acceptance plan](../m3-04-acceptance.md).

## Review and earlier attempts

Fresh design, substantive implementation, final code and final evidence reviews
covered authority, consistency, timing, recovery, provenance and deployment
isolation. Findings were fixed before this run: old-pending/later-D1 quarantine,
takeover close identity, one-action alarm recovery, exhausted-bank reconnect,
post-prepare ambiguity and permanent capacity handling. The generated build JSON
literal-type mismatch was also fixed and independently reviewed; `check:room`
now type-checks after that file exists.

[Prior attempts](local-runtime/prior-attempts.json.gz) are explicitly separate:

| Directory label | Outcome |
| --- | --- |
| `m3-03-1788756268407` | Startup failed before runtime capture; available manifest/source retained |
| `m3-03-1788756301359` | Sandbox denied esbuild ancestor/log access; captured startup failure |
| `m3-03-1788756333281` | Nine D1 groups passed, then source-drift guard failed during ongoing edits |
| `m3-04-1788756850192` | Fixture expected terminal before a required walking action; fixture sequence corrected |
| `m3-04-1788756928626` | Concurrent edits caused actual Wrangler reload during long history; liveness invalidated |
| `m3-04-acceptance-1` | Full source-stable run passed with 638 units, before final review fixes/four regressions |
| `m3-04-acceptance-final` | Clean `bec21c8` lint exposed generated JSON literal widening; fixed in `c86e7e7` |

The archive maps directory/file names to base64 bytes. Earlier source archives
are losslessly represented by `source-delta.json`: start with the accepted
`source.json.gz` files, delete `removed`, apply `replaced`, and use the recorded
producer. This avoids duplicating unchanged archived binary evidence. Other suites
share the accepted source identity and retain individual manifests; only one copy
of the full source is packaged. [Checksums](local-runtime/checksums.json) cover every
published raw artifact except the checksum index itself.

M3 remains incomplete. The next slice is the authenticated caller and strict
command/receipt/resync protocol in the [M3-05 handoff](../m3-05-handoff.md).
No merge, main push, hosted activation, resource provisioning, secret or purchase
is part of this work.
