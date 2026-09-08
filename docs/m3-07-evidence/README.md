# M3-07 completed private replay evidence

Reviewed 2026-09-07. The [pre-change inventory](../m3-07-acceptance.md) was committed
at `f74a24e` before implementation. Reviewed product implementation is `c29885d`;
reviewed test-driver correction is
`f9c54928d7faece4b18e0b39f1cb317a258b2777`. All 17 requested Windows invocations
passed on that clean source. Linux
[CI 34171318234](https://github.com/ariesyous/li4chess/actions/runs/34171318234)
passed on that exact PR head. [PR #18](https://github.com/ariesyous/li4chess/pull/18)
remains draft and unmerged; its checks identify the final documentation/evidence
revision separately. No deployment or hosted activation occurred.

## Proven contract and coverage

Four independent authenticated Chromium contexts use maintained routing, real
local Wrangler/workerd SQLite Durable Objects and D1. Export derives identity and
membership on the server, requires no controller proof, and preserves the exact
creation checkpoint, ordered events, terminal result, recorded walking randomness,
original producer and source lineage. The browser assembles and validates the
whole replay before downloading; imports pass through the existing local reader.
See the [implemented contract](../multiplayer-v1.md) for every typed failure.

| Inventory | Retained proof |
| --- | --- |
| R01 | Full campaign ordinary repetition and walking-survivor histories, all four downloaded files, canonical command/receipt reconstruction and final client equality. |
| R02 | Full campaign observer/takeover/refresh recovery plus focused observer download and explicit takeover; every download checks unchanged controller text and terminal history. Historical preflight avoids taking control and retains pending intentions. |
| R03 | Focused missing/invalid/nonmember and forged-field rejection; all four completed-game same-principal rotations retain proof-free reads and revoke old cookies. Full campaign expiry/revocation cases intentionally use unfinished rooms and prove replay requests reject before history access. Reader units cover expiry before and after awaits. |
| R04 | Unfinished rejection and valid opening-abort export; injected schema incompatibility, malformed event JSON, quarantine, divergent marker and unavailable table/binding fail explicitly without operational writes. Retained persistence suite covers missing interior events; reader units cover missing marker/cache/timing. Whole absent creation has an implemented `replayMissing` path, not a separate endpoint runtime fixture. |
| R05 | Focused lost response, disabled duplicate click, delayed response after Leave and session rotation; refreshed observer safely retries. StrictMode E2E changes room/principal while a response is delayed and permits only the new-room download. |
| R06 | Full recovery campaign preserves terminal histories after six interruption boundaries and D1 rollback; focused whole-runtime restart invalidates cursors and restarts the exact replay. Isolated reader binding outage recovers without changing canonical or operational records. |
| R07 | Five source-linked fixture endings retain source bytes/digests. Ordinary walking game records two random walking actions. Focused simulated newer serving identity opens, refreshes, exports and leaves the historical producer unchanged. |
| R08 | Every audited terminal history has four member files plus a local import/re-export file. Import intentionally creates a current-build checkpoint with source replay digest; it does not rewrite the downloaded original producer. All 47 local hotseat/CPU/browser tests pass. |
| R09 | Reader units traverse all 2048 command continuations at exactly 32,000,000 bytes and at +1 byte; acceptance/replayLimit and no writes are asserted. These are synthetic trusted-port accounting fixtures, not reachable long games. Protocol tests cover 32/33 events and command 2048/2049. Maintained real D1 history tests remain enabled; fixture exclusion and changed tool/test type checks pass. |
| R10 | Full Windows checks, Linux CI, source maps, raw/decoded checksum indexes, independent source/evidence reviews and committed-blob verification. Failed attempts are retained separately below. |

Each platform passed **83 full-campaign observations over 27 runtime starts** and
**11 focused replay observations over 3 starts**. Observation rows are not games.
The full campaign audits 13 terminal histories: six ordinary-setup completions
(two use injected clocks and one uses injected outages), five checkpoint-assisted
endings and two opening aborts. Four incident rooms and two credential-loss rooms
remain intentionally unfinished. The focused campaign audits one ordinary-setup
opening abort through the isolated fixture entry; its remaining endpoint/race
checks reuse that terminal abort. These classifications do not claim every case
is unassisted ordinary play.

The focused historical case modifies only the test runtime variable
`M3_07_READER_BUILD` to forty `7` characters after restart. The initial sanitized
`replay-members.configuration.json` is retained; that later delta is recorded in
observations and here. It is a simulated serving identity, not a second deployed
build. The original replay producer remains the actual measured artifact.

## Revisions, tools and artifact bytes

[Windows index](windows/artifact-index.json) covers actual commands/logs,
configuration, environment, summaries and all replay comparisons.
[Windows checks](windows/validation.json) record every invocation and exit code;
[toolchain](windows/toolchain.json) records actual executable resolution. Node
24.18.0 runs from `C:/Program Files/nodejs/node.exe`; Corepack 0.35.0 resolves pinned
pnpm 10.33.0 through an ignored local shim, excluding the host-global pnpm 11 wrapper.
Wrangler is 4.129.0, workerd 1.20260903.1 and Chromium 141.0.7390.37. Hardware and
configuration are recorded per harness, not inferred from historical timings.

Windows source fingerprint:
`sha256:cb976a67aedcd34385700af2a7e509e57a1bf948b481aeeaf19f109e32f00709`.
Linux source fingerprint:
`sha256:e11e4222c669d468957720567bc51fcc54838253c7197d5746e58220dc447421`.
Linux Node is 24.20.0 and pnpm is 10.33.0; exact environment/configuration is in
the [campaign](linux/campaign/artifact-index.json) and
[replay](linux/replay/artifact-index.json) indexes. The complete redacted CI log
and step outcomes are in the [Linux root index](linux/artifact-index.json).

CI tested clean merge checkout `d229397566feacaaf8b6980beccab39c79bff690`, whose
parents are main baseline `eddbcad` and PR head `f9c5492`; its tree exactly equals
the PR head tree `01047b8d7747b4349eb097b8bf719fea495e6eb0`.
[CI source metadata](linux/ci-source.json) and original `ci-merge.commit` bytes
allow reconstructing that small Git object if the temporary GitHub ref disappears.
Verify its object hash before `git hash-object -t commit -w`; its tree and blobs
already exist in permanent PR-head history. This does not substitute a producer.

Source maps reconstruct exact bytes from Git blobs plus explicit CRLF/inline
transforms and recompute each producer fingerprint. For example, from repository
root, use `pnpm --filter @li4chess/worker exec tsx test/campaign-source.ts verify
../.. ../../docs/m3-07-evidence/windows/campaign/source-map.json.gz` (one command).
Windows maps also substantiate the unchanged-source older subsystem runs; their
large duplicate `source.json.gz` archives are explicitly omitted in the index.
The failed Linux merge object is retained by the same method. No runtime databases,
raw private Wrangler configurations, cookies, controller proofs or admin keys are
included. `.gitattributes` preserves evidence bytes; indexes cover stored and,
where compressed, decoded checksums. Verification reads committed Git blobs, not
only the current checkout.

## Actual validation

| Commands | Corrected Windows result; Linux CI also passed |
| --- | --- |
| `pnpm install --frozen-lockfile`; `pnpm lint`; `pnpm test`; `pnpm build` | Pass. Turbo commands used `--force`: 695 units and fresh type checks/builds, no cached check claims. |
| `pnpm --filter @li4chess/web test:e2e` | 47 passed. |
| Architecture / persistence / GameRoom `test:integration` | 14 / 9 / 22 groups; GameRoom 25 starts. |
| `pnpm build:workers`; `pnpm check:workers`; worker `check:room`; `pnpm test:workers` | Pass, including default Workers browser/lifecycle tests and fixture-free deployment dry runs. |
| Worker `build:multiplayer`; `check:multiplayer`; `test:multiplayer` | Pass; 14 maintained authenticated runtime groups. |
| Worker `test:campaign`; `test:replay` | 83/27 and 11/3 observations/starts. Driver check proves distinct API sockets, zero retries and sanitized parseable diagnostics. |

## Failures, review and remaining limits

[Exploratory records](exploratory/README.md) retain early successes/failures, the
first complete Windows run and the original failed Linux campaign. The Linux
socket-reset cause remains inferred; explicit connection-close driver requests
and zero retries passed both corrected platforms. Browser networking and exact
acceptance assertions were not weakened. Only the failed run's raw console log
was removed because its thrown error contained disposable fixture credentials;
the complete redacted log, failed status/step metadata, sanitized artifacts and
original source remain retained. Future thrown fixture errors are sanitized.

Independent contract, substantive implementation and fresh source reviews covered
authentication, cross-store fences, replay lineage, resource bounds, browser races
and test isolation. Findings resolved include exact aggregate byte accounting,
StrictMode cancellation, historical preflight ordering, stale identity callbacks,
terminal closed-channel publication and direct resource-boundary tests. Independent
evidence review recomputed source maps, checksums, canonical commands/replays,
four-member download bytes and fixture digests and checked credential redaction.
Final committed-blob and PR-head checks are recorded with the closeout.

Limits are deliberate: 2048 canonical commands, one command per continuation,
32 events per page, 32 MB artifact, four readers and ten-minute continuations.
Over-limit games return explicit `replayLimit`; they are not truncated. Lost
credentials cannot recover membership by issuing another principal. No public
links/history list, accounts or new recovery policy were added. Historical
compatibility requires a supported complete genesis audit and retains the writer
producer fence. Hosted TLS/origin/cookies, latency/load, actual eviction/hibernation,
coordinated restore and rollout/rollback remain separately authorized. M3 remains
incomplete; [private rematch consent/creation](../m3-08-handoff.md) is the proposed
next bounded slice, not work started here.
