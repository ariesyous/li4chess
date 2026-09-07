# M3-06 local acceptance evidence

Evidence reviewed 2026-09-07. Windows validation source is
`d44847e8f4b281fbd9e6d8576e1c08a2af8e2b3a` (clean). All sixteen required
invocations passed in `m3-06-validation-1788805099306`. Draft
[PR #17](https://github.com/ariesyous/li4chess/pull/17) remains unmerged.
Linux CI status and final-head verification are recorded below.

The verified M3-05 baseline is merged PR #16 at
`e8d5494898bcd7b88491aa3ea2ccc19e01d13816`. Head CI 34136255021 and post-merge
CI 34147880230 and Pages 34147880224 succeeded. Historical draft wording does
not change that merge status.

## What the campaign establishes

The new `apps/worker/test/campaign.ts` uses four independent authenticated
Chromium contexts, maintained private-room routing, real local workerd SQLite
Durable Objects and local D1. Ordinary scenarios enter through guest issuance,
private-room creation, invitation join, seat selection and readiness. Fixture and
fault scenarios use a separate loopback test entry around the same authority.

Every audited terminal history is independently reconstructed from its canonical
creation and ordered D1 commands/events through the maintained reducer and
replay-v2 reader. The audit compares exact records, receipts, producer, state and
chain hashes, final scores/placements, result, all four rendered client boundaries
and terminal timing. Fixture histories retain and verify their source replay digest.
All seats reject new terminal commands and refresh/reconnect to unchanged results.
Original ambiguous command receipts are checked again after later commands and
terminal completion. Recorded walking actions retain their PRNG provenance.

| Inventory | New executable evidence | Complementary checks retained and rerun |
| --- | --- | --- |
| G01 | `G01-ordinary-repetition`: 16 ordinary knight moves from Modern setup; four +10 awards, shared first/mean rank 2.5. | Persistence and GameRoom replay reconstruction suites. |
| G02 | `G02-ordinary-walking-survivor`: 12 ordinary opening moves, post-guard resignations, two recorded walking moves and Green +60 survivor result. | GameRoom seeded walking prepare/restart and persistence random reconciliation. |
| G03 | `G03-timeout-{abort,complete}` and `G03-disconnect-{abort,complete}`: ordinary starting boards, injected authoritative time, opening abort versus post-guard walking and Blue +60. | GameRoom real delivered timeout/alarm, exact deadline-minus-one/deadline and main-clock/disconnect tie tests. |
| G04 | `G-fixture-claim`: checkpoint-assisted, legitimate out-of-turn claim, Red 21/Blue 20 with eliminated Yellow 100 retained as winner. | Shared engine rules fixtures. |
| G05 | `G-fixture-mate` and `G-fixture-stalemate`: checkpoint-assisted scheduled elimination, skipped Red turns and zero-point passive King capture; continued to terminal. | Shared engine passive-army legality and all-orientation fixtures. |
| G06 | G01 proves ordinary repetition; `G-fixture-insufficient` and `G-fixture-fifty-move` prove checkpoint-assisted material/200-reversible-turn boundaries and exact flat draw awards. | Shared engine draw predicate/precedence fixtures. |
| B01/B02 | All-seat offline/refresh; pre-delivery loss for seats 0/2, post-commit loss for 1/3; original IDs/receipts/admissions survive recovery and terminal; stale/conflicting/out-of-turn/late commands reject. | `online.test.ts` immediate resyncRequired, ambiguous failed resync and pending send fencing; maintained multiplayer runtime strict request/authorization validation. |
| B03 | All-seat obsolete snapshots and old-transport close callbacks cannot roll back command 8 or close replacements; convergence observes the rendered boundary. | `online.test.ts` old receipt/resync after newer snapshot, delayed control generation and HTTP terminal resync. |
| B04 | Each seat loses a committed takeover response, cancels abandonment, refreshes with the same ID and fences its old controller; original tab explicitly retakes control. | Maintained multiplayer runtime opener-copied session storage receives a distinct observer proof; unit storage-failure and malformed-takeover regressions. |
| B05 | Each seat rotates an active credential, old socket/cookie loses access, refreshed tab is observer until explicit takeover; resulting ordinary game completes. All-seat revoke/expiry rooms intentionally remain unfinished. | Maintained multiplayer runtime credential digests/no raw credentials, absolute expiry and existing-socket lifecycle tests. |
| B06 | Takeover cancellation and explicit cleanup are browser-visible in the new campaign. | Maintained multiplayer runtime lost creation retry, concurrent seat/readiness, immutable creation, delayed successful lobby response after Leave; unit session identity change preserves unresolved storage until abandonment. |
| R01 | Six whole-runtime interruption boundaries: before prepare, after prepare, after D1, after finalize, before activation, after activation/before publication. Persisted browser intentions and exact receipt/timing recover; repetition game completes. | GameRoom repeated reconciliation and seeded walking interruption; persistence before/after-commit random prepare recovery. |
| R02 | Real SQL-triggered D1 rollback freezes UI; refresh and whole-runtime restart retain exact prepared command and single increment, exclude injected 60-second outage debit, then complete. | GameRoom delayed D1 serialization, seven rolled-back retries and actual alarm-only recovery; persistence uncertain acknowledgement reconciliation. |
| R03 | Missing/incompatible timing, divergent marker and owner fence preserve canonical command/event zero and expose unavailability/quarantine; intentionally unfinished incident rooms. | GameRoom stale restored prepare/timing/marker quarantine, missing local records; persistence divergent restore/checkpoint/interior-effect rejection. |
| T01 | Server-side deadline facts, exact balances across six outage boundaries and D1 suspension, replacement connection observations and frozen terminal timing. | GameRoom cumulative bank, concurrent sockets, takeover/close, clock tie/backwards-time/stale alarm coverage; maintained multiplayer credential admission/expiry behavior. |
| I01 | Exclusive fresh output/database directories and ports; owned runtime shutdown/released-port checks; compact reconstructible source map; separate test entry and deployable-bundle forbidden-hook checks. | All existing checks, released migration compatibility, command-v1/v2 and replay-v2 tests, default Worker/Pages and local hotseat/CPU browser suites. |

## Classification and evidence files

The full campaign passed **70 observations, 27 runtime starts and 13 audited
terminal histories**. Observation rows are not independent games.

The declared full campaign contains six ordinary-setup completions: G01, G02,
R01/R02 recovered repetition, two post-guard clock endings and rotated-guest
repetition. The two clock completions use explicitly injected time; the recovery
completion uses injected outages. Only G01/G02 and rotated-guest repetition use
the ordinary maintained entry without fixture administration. Five other endings
are checkpoint-assisted. Two opening aborts are terminal aborts, not played-out
complete games. Four incident rooms and two credential-loss rooms are unfinished.
These classifications agree with the retained canonical histories and summary.

[Windows artifact index](windows/artifact-index.json) retains exact executable versions,
commands, configuration and producer/source fingerprints. `*.canonical.json`
contains canonical creation, commands/receipts and four final clients;
`*.replay.json` contains audited histories; fixture `*.source.replay.json` establishes
lineage; `observations.json.gz` records interruption boundaries. Terminal captures show actual
UI results. Source maps reconstruct exact bytes from Git blobs plus recorded
transformations/inline changes; verification must recompute the producer fingerprint.
Do not archive raw runtime databases, unsanitized runtime Wrangler configs, cookies, invitation
secrets, tab proofs or admin keys. Large unchanged historical archives remain at
their original locations rather than being copied into this evidence set.

## Fixes, failed attempts and review

The production fix makes an unresolved takeover visible, persists its command ID
before send, retains it after lost responses or failed outcome storage, blocks game
actions while unresolved, and requires deliberate abandonment on Leave. Focused
regressions cover initial storage failure, lost response plus refresh, failed outcome
storage and malformed saved IDs. It changes no wire version or authority rule.

Independent review strengthened exact clock conservation, passive zero-point
capture, eliminated high-score placement, draw totals, source replay lineage and
rendered-client observation. Recovery now requires a fresh replacement socket and
fresh accepted snapshot, rather than trusting a stale connected label. Fresh final source review also found non-atomic pending-command cleanup. Commit `45db971` writes the candidate saved state before replacing memory/UI; three regressions retain and resend the original ID after failed receipt, rejection or deliberate cleanup. Independent review confirmed resolution with no other substantive source finding.

Exploratory driver failures are retained as failures: build fingerprint drift during
concurrent source edits; serialized instrumentation referring to tsx's unavailable
`__name`; an invalid manually-mutated walking-mobility precondition; capturing expired
cookies only after waiting for another seat; and a five-second fresh-socket assertion
that was shorter than the maintained eight-second recovery backoff. Corrections
locked source during measurement, used raw instrumentation, used `resignPlayer` for
preconditions, captured cookies before waiting and aligned fresh-socket/snapshot
readiness with the existing 20-second connection bound. The last change has measured
replacement elapsed times and independent diagnosis; it does not alter backoff or
retry failed assertions. [Exploratory records](exploratory/index.json) retain seven failed/partial attempts separately; only the complete clean run is acceptance evidence. Early runs without compact source maps retain contemporaneous producer manifests, not a claim of independent byte reconstruction.

## Validation and limits

[Checks](windows/checks.json) and compressed logs retain every actual command and exit code:

| Validation | Fresh Windows result |
| --- | --- |
| Frozen install; lint; unit tests; build | Pass; **678 units**, including 36 browser-state units. Lint checks fixture Worker and Node tool sources separately. Turbo checks used `--force` to avoid cached claims. |
| Web E2E | **46 passed**, preserving hotseat/CPU behavior. |
| Architecture / persistence / GameRoom integration | **14 / 9 / 22 groups**, respectively; GameRoom used 25 runtime starts. |
| Workers build / check / check:room / runtime | Pass; four browser checks and owned-process startup/ready cleanup observations. |
| Multiplayer build / check / runtime | Pass; **14 maintained authenticated groups**. |
| New campaign | **70 observations / 27 starts**, all six selections, six fixture preconditions. |
| Source reconstruction | **515 files**, fingerprint `sha256:610294ba48681c5caef2378aa47dd395a396b625c9c369ae3ec1014df77d0944`. |

Node: `C:/Program Files/nodejs/node.exe` 24.18.0; pinned pnpm 10.33.0 via
`C:/Program Files/nodejs/node_modules/corepack/dist/pnpm.js`, not the global
pnpm 11 wrapper. Wrangler 4.129.0, workerd 1.20260903.1, Chromium 141.0.7390.37.
Exact Windows hardware/configurations are in the manifests. Test controls use
600,000 ms plus 50 ms increment and 60,000 ms disconnect banks; these select no
launch policy. Whole-runtime outages inject 60 seconds only in isolated fixtures.

Three identical 46 MB source archives were omitted in favor of the verified
compact source map. Existing suite producer fingerprints match that map. Root
artifact indexes retain SHA-256 and byte counts; runtime databases and nested
unsanitized Wrangler configurations are excluded. Terminal screenshot visual
inspection confirmed the rendered survivor placements without invitation data.

Linux [CI 34151136700](https://github.com/ariesyous/li4chess/actions/runs/34151136700)
passed every workflow step for head `d44847e8f4b281fbd9e6d8576e1c08a2af8e2b3a`.
[Linux artifacts](linux/artifact-index.json) retain 70 observations, 27 starts and
13 audited terminal histories. Node 24.20.0 used the same pinned pnpm, Wrangler,
workerd and Chromium versions. CI's clean merge checkout
`96eb00565e60fab7cea0b43eed2e795068c2ccbb` has parents `e8d5494` and `d44847e`,
and the same Git tree as `d44847e`. Its independently reconstructed 515-file
fingerprint is `sha256:a1018c281274392c4e25438cb24b45682af00ea6b31c11f6ef0b9833a609a139`;
Linux LF and Windows CRLF bytes are recorded separately, not conflated.

Fresh independent source and evidence reviewers resolved all substantive findings.
The evidence reviewer independently reproduced the Windows and Linux command/receipt/event
and replay checks, all four client states, fixture lineage and all artifact hashes;
targeted decompressed scans found no bearer credentials or session proofs.
The documentation/evidence closeout is followed by another exact pushed-head CI
check. The immutable final run link and head are recorded on
[PR #17](https://github.com/ariesyous/li4chess/pull/17); an earlier run is not a
substitute for that final check. The PR remains draft and unmerged.

This is local Windows/Linux Chromium/workerd evidence. Process restart is not hosted
eviction or hibernation. Injected clocks/manual alarms do not establish hosted alarm
latency. No hosted TLS/origin/cookie, geographic latency/load, coordinated restore or
rollout/rollback claim is made. No launch clock, operating policy, deployment or M4
feature is selected. Saved multiplayer replay retrieval/export and rematches remain
product work; canonical replay audits alone do not provide either player-facing flow.
