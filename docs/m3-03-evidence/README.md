# M3-03 canonical D1 persistence acceptance evidence

Measured 2026-09-07 against the [pre-implementation contract](../m3-03-acceptance.md).
Final implementation is [`098aaadbc1348eee4a340dcf9468e2526748e242`](https://github.com/ariesyous/li4chess/commit/098aaadbc1348eee4a340dcf9468e2526748e242),
following the reviewed foundation commit `5018521`. The accepted local run used
a **clean working tree**, with fingerprint
`sha256:fb9fa0597d1861d254895805f8027e6f2469ce4613abcb975eef9d48030f3229`.
All **342 source files** are retained in [source.json.gz](local-runtime/source.json.gz);
an independent reviewer recomputed the digest and compared every byte with the
clean checkout. [Verification record](local-runtime/source-verification.json).
Evidence packaging and subsequent documentation are not retroactively part of
that producing build. Final documentation-revision CI is checked again via
[draft PR #14](https://github.com/ariesyous/li4chess/pull/14).

## Fresh local validation

All required commands passed in one source-stable run without assertion retries.
The [complete log](local-runtime/validation.log.gz) records executable paths,
versions, commit, commands and actual results. `--force` bypassed Turbo caches;
it did not relax any assertion. [Runtime manifest](local-runtime/manifest.json).

| Command from repository root | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed, lockfile unchanged |
| `pnpm lint --force` | Nine packages, including changed persistence test/tool sources |
| `pnpm test --force` | 608 unit tests passed |
| `pnpm build --force` | All packages and default Pages build passed |
| `pnpm --filter @li4chess/persistence test:integration` | Eight check groups, four real runtime starts, all passed |
| `pnpm --filter @li4chess/web test:e2e` | All 46 existing browser tests passed |
| `pnpm --filter @li4chess/architecture-spike test:integration` | All 14 groups; eight starts/seven restarts passed |
| `pnpm build:workers` | Separate root-path build; Pages bytes preserved |
| `pnpm check:workers` | Staging and production local deploy dry-runs passed |
| `pnpm test:workers` | Four HTTP/browser groups and both lifecycle interruption checks passed |
| Local Markdown links / `git diff --check` | 318 links resolved at implementation revision; no diff whitespace errors |

Windows 11 kernel 10.0.26200 x64; AMD Ryzen 5 5600X, 12 logical CPUs,
34,269,650,944 bytes RAM; Node **24.18.0**, temporary Corepack pnpm **10.33.0**,
Wrangler **4.129.0**, workerd **1.20260903.1**. The global pnpm 11.19.0 wrapper
was not changed or used. Compatibility date is 2026-09-01. No Cloudflare account
or hosted binding is needed. The fixture database ID is deliberately non-account
owned; the harness supplies `--local` and an isolated persistent directory.

## What actual local D1 proves

[Observations](local-runtime/observations.json.gz), [summary](local-runtime/summary.json),
[redacted configuration](local-runtime/configuration.json), and
[runtime log](local-runtime/runtime.log.gz) retain the test conditions.

- Wrangler applies 0001, then the suite populates games/receipts and identity
  foreign keys. After stopping the runtime, Wrangler applies additive 0002 and
  reapplies its ledger with no changes. The same v1 record reader recovers the
  existing game and receipt. Unknown database versions reject.
- An actual final nonexistent-table statement is appended after the command,
  action/effects, checkpoint, result, head and pruning statements. All writes
  roll back. The independent reviewer checked the installed local D1 executor:
  statements prepare/execute sequentially inside `transactionSync`, so this is a
  late execution failure rather than preflight rejection before any write.
- Concurrent writers produce exactly one commit; stale heads, a wrong namespace
  at the same generation, an old owner after generation transfer, and direct SQL
  insertion for a missing game reject with unchanged row counts. Unique keys and
  aborting insert/head triggers enforce the atomic adapter boundary.
- Exact retries return the original receipt after later commands and terminal
  completion. `lookupReceipt` also recovers original admission facts from stable
  authenticated intentions after restart and checkpoint pruning. Changed caller,
  action, expected sequence or strict admission facts conflict. Unknown producer
  policy rejects receipt, lookup, restore, recovery and audit entry points.
- Lost acknowledgements return an injected 503 after real canonical commit.
  Reconciliation proves exact prepared bytes from primary binding reads. A saved
  random-King prepare survives whole-runtime termination before D1; after commit,
  another whole-runtime restart recognizes that same canonical selection. No
  action is executed by the reconciliation API. These tests model completed write
  boundaries, not power loss during an OS disk flush or a regional outage.
- The [Modern repetition replay](local-runtime/repetition.replay.json) has 16
  commands and 21 events, including four +10 awards and its terminal result. The
  [walking/survivor replay](local-runtime/walking.replay.json) retains its recorded
  random choice and final awards. Both independently validate through the shared
  production engine/protocol. Source-linked terminal checkpoint creation also
  round-trips. This is separate execution of the shared oracle, not a second engine.
- Recovery reads a captured head/checkpoint/anchor while an append prunes the
  previous checkpoint; the result equals one complete captured prefix. A paged
  audit reproduces the entire retained history. Result-update, command-deletion
  and creation/latest checkpoint-deletion protections are checked through real SQL;
  event immutability triggers were independently reviewed in the schema.
- Individually valid but different command branches cause restore quarantine;
  fabricated divergent markers do too. Test-only removal of immutable guards
  permits deliberate checkpoint corruption, unknown command format and deletion
  of an interior terminal effect; readers reject them. No production admin route,
  fault injector, credential issuer or clear-quarantine API was introduced.

## Measurements and resulting limits

The [long replay](local-runtime/long.replay.json) is **unfinished/censored**, not a
draw, loss or playing-strength result. Its fixed xorshift selector seed is
`12345678`; all 256 accepted intentions use actual engine legal moves from the
Modern board. It has **293 events**, crosses 16 checkpoint cadences and takes
**32 audit pages** of at most eight commands. The final checkpoint commit races
a recovery read. Full replay and incremental reconstruction agree exactly.
[Measurements](local-runtime/measurements.json) and
[per-request local wall-time samples](local-runtime/rpc-samples.json.gz).

| Quantity | Observed for the 256-command history |
| --- | ---: |
| Largest state-v2 JSON | 113,676 bytes |
| Largest durable prepare, including successor/checkpoint | 229,008 bytes |
| Largest event group | 765 bytes / 2 events |
| Largest batch for this history | 6 statements |
| Command record + receipt JSON retained | 297,259 bytes / 256 rows |
| Event JSON retained | 104,497 bytes / 293 rows |
| Checkpoint JSON retained | 118,087 bytes / 2 rows |

These are encoded JSON payload totals, excluding keys, indexes, SQLite pages/WAL
and other games. Query metadata in the measurement file refers to the whole
fixture database; it is not this game's physical storage bill. Repetition
separately exercises a six-event command (action, four awards, terminal).

Code-derived ceilings are **14 bound parameters/statement** and **37 statements
in a maximum-size commit batch**, with total adapter queries below 50/invocation.
They are not measured maxima. The 32-event/command allowance leaves headroom over
the observed groups; the fetch allows 33 rows to detect violation of the 32-event
canonical ceiling, with eight commands per audit page. Checkpoints every 16
commands bound normal recovery. A full audit
uses successive invocations, rather than exceeding a query budget in one call.

Admission bounds are 2,048 commands/game, 4 KiB request, 16 KB/event, 512 KB/state
and 1 MB/full prepare. The full prepare can bind before the individual state limit.
These conservative foundation ceilings fit the measured history; they do not
establish hosted CPU, capacity or that every possible legal game fits. State-v2
contains growing move/repetition/award/random history. Only creation and newest
checkpoint remain, avoiding accumulated full-replay/state copies per command.
Every command/event/receipt/result remains for the game lifetime. Future deletion,
archival policy and storage quotas need explicit requirements and measurements.

## Review, unsuccessful attempts and CI

Fresh independent design, substantive, final-code and final-evidence reviewers
covered SQL fencing, idempotency, reconstruction, provenance, deployment isolation,
source identity and evidence limits. Resolved findings: pin read heads/anchors;
include and validate the complete successor in durable prepares; enforce producer
policy on all canonical reader entry points; reject unknown command records at
checkpoint anchors; bind expected sequence into stable request identity; provide
pre-admission receipt lookup without requiring forgotten server timing facts.
No substantive finding remains open.

[Exploratory attempt records](local-runtime/exploratory-attempts.json.gz) retain
identities, logs and summaries. The first runtime test compared JavaScript objects
with omitted versus explicitly undefined optional fields; transport and the
protocol intentionally use canonical JSON, so exact canonical comparison fixed
the assertion. Node Buffer type ambiguity was fixed before acceptance. Two later
passing exploratory runs are superseded by the clean final run above.

Initial [CI 34081248811](https://github.com/ariesyous/li4chess/actions/runs/34081248811)
failed before D1 startup because a clean checkout lacked the parent evidence
directory. [Retained failure log](local-runtime/ci-initial-failure.log.gz).
The fix creates parents while preserving exclusive creation of the final output
directory. A fresh nested-parent local run verified the fix. No assertion was
weakened and no test retry was added.

[Implementation CI 34081508076](https://github.com/ariesyous/li4chess/actions/runs/34081508076)
passed for head `098aaadbc1348eee4a340dcf9468e2526748e242`, including every
required regression and new D1 check. Downloaded [CI record](local-runtime/ci-implementation.json)
confirms all eight D1 groups/four runtime starts on Linux, Node 24.20.0 and pnpm
10.33.0, with the same Wrangler/workerd versions. GitHub tested its clean PR merge
checkout `a55af085efa5fa4673be2cb626d57b1efab28187`; that is distinct from the PR
head and Windows source fingerprint. Final documentation-revision CI is verified
again before closeout and linked from the PR description, avoiding a self-referential
evidence-commit identity.

## Artifacts and remaining gates

[Checksums](local-runtime/checksums.json) cover published artifacts. Gzip files
contain ordinary UTF-8 JSON/text; source is `{producer, files}` with file values
as base64. Original accepted directory:
`arena-results/m3-03-accepted-098aaad`. Its local SQLite files and generated
credential-bearing config are deliberately excluded. Source/config fingerprints
identify evidence; no production data was accessed.

Preserved application checks have [Worker summary](local-runtime/worker-summary.json),
[artifact hashes](local-runtime/worker-artifact.json),
[browser observations](local-runtime/worker-browser-observations.json),
[HTTP observations](local-runtime/worker-http-observations.json),
[lifecycle observations](local-runtime/worker-lifecycle.json) and
[architecture summary](local-runtime/architecture-summary.json).
Both environment [staging](local-runtime/dry-run-staging.json.gz) and
[production](local-runtime/dry-run-production.json.gz) dry-run bundle/log maps
are retained. They are local artifacts, not Cloudflare deployments/version IDs.

Application Worker/Pages configuration, frozen classic and archived evidence are
unchanged. No hosted resources, account connections, secrets, paid plans, upload,
publication or deployment occurred. Local evidence cannot prove hosted primary/
replica behavior, failover, Time Travel, coordinated D1/DO restore, quotas, regional
latency, cost or rollback. A checkpoint anchor detects corruption and verifies
canonical lineage; only genesis audit proves its prior transitions, and neither
authenticates coordinated database rewriting. Physical-device/screen-reader
checks remain outside this slice.

The [M3-04 handoff](../m3-03-handoff.md) defines the next GameRoom APIs,
ownership fencing and durable prepare → canonical commit → local finalize →
acknowledgement boundary. Authoritative clocks/alarms, guest lifecycle and
multiplayer remain unimplemented. M3 as a whole is incomplete.
