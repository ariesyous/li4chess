# M3-08 private rematch evidence

Prepared 2026-09-08. The pre-change acceptance inventory was committed at
`8054754`; independently reviewed implementation is `44cfc48b642fa0ac64d850cc1e9da13b24b2d379`.
Reviewed browser-startup diagnostics are `9cad92f435d7d4a949cc038d7e3447c2351a0252`.
The implementation was not changed by that diagnostic revision.

All 18 Windows invocations passed on clean `9cad92f` (716 unit tests and
47 local browser tests). [Linux CI 34185544401](https://github.com/ariesyous/li4chess/actions/runs/34185544401)
passed on that exact PR head. [PR #19](https://github.com/ariesyous/li4chess/pull/19)
remains draft and unmerged; its final evidence/documentation head receives a
separate exact-head CI check.

[Windows checks](windows/validation.json), [Windows index](windows/artifact-index.json),
[Linux CI metadata](linux/ci.json), [Linux index](linux/artifact-index.json) and
[independent reviews](reviews.json) retain the verification details. The
[pre-change inventory](../m3-08-acceptance.md) separates accepted scope from bounded
implementation defaults.

Each platform passed 83 full-campaign observations over 27 starts, 11 replay
observations over 3 starts, and 16 rematch observations over 21 starts. Observations
are not game counts. The rematch campaign audits ordinary repetition and an
opening abort; four further opening-abort sources exercise assisted fault/expiry
recovery. It creates five successor games, one played through a legal first move
and four checked at exact recovered genesis.

## Local acceptance boundary

Four independent authenticated Chromium contexts complete an ordinary Modern
repetition game, propose with zero automatic votes, consent individually, then
explicitly enter and ready in one new private room. A legal successor move is
verified. Original result, canonical records and replay bytes remain unchanged.
Opening aborts are eligible. The same four principal/seat assignments and source
clock policy are fixed, and the successor identity and seed differ.

| Inventory | Executable evidence |
| --- | --- |
| RM01–RM02 | Rematch ordinary repetition audit includes four member exports, local import, canonical reconstruction, explicit entry/readiness, new genesis and legal successor move. Original canonical rows and replay are compared through allocation, runtime restart and new play. |
| RM03–RM04 | Observer takeover, duplicate principal votes, competing proposals, all-seat rotation, missing/nonmember/forged-field rejection; four isolated pre-consensus credential-expiry cases and expiry after awaited eligibility. Rotation survives injected detach failure and rejects its retired cookie. Existing full campaign retains all-seat live revocation/expiry and old-cookie checks through the shared authentication path. |
| RM05 | Pending departure reconciles fresh status; unavailable status requires explicit uncertainty, and cancelled departure retains consent. A confirmed departure closes the proposal. Stale epochs, eight-proposal cap and real 120-receipt normal-admission exhaustion preserve status, terminal cancellation and exact retries. Reducer units cover both final-vote/withdraw orders. |
| RM06 | Browser transport drops an ordinary consent and the fourth consent after server acceptance; saved exact requests recover after refresh/restart without duplicate allocation. Failed successor lookup after retirement obtains fresh source proof. Browser units cover storage failure, cleanup recovery, duplicate calls, stopped callbacks, room/identity fencing and rotation-owned recovery. |
| RM07 | Four isolated stages cover before/after creation and D1. A GuestService SQL trigger rolls back unanimous allocation; exact retry after restart allocates once. Actual D1 SQL rollback is separate from injected boundary failures. Persistent barriers hold after-write/after-commit recovery until restart; real persisted alarms recover frozen creation after every credential expires. Frozen and recovered intents are identical. |
| RM08 | Active rejection, opening abort, historical-serving eligibility, incident/divergent rejection, copied original clock after environment change, fixed seats and expired successor access. Assisted credential/deadline/serving-identity tests use isolated fixture routes, not account recovery. |
| RM09–RM10 | Existing suites remain enabled, test tools type-check, deployment dry runs exclude fixture controls, and HTTP driver checks retain zero retries. Indexed Windows/Linux artifacts, source-map reconstruction, immutable CI merge bytes and independent reviews provide provenance. Final PR checks identify its documentation/evidence head separately. |

The ten-minute deadline, eight proposals, 128 retained receipts (normal cap 120),
fixed seats and copied clock are bounded local implementation defaults, not launch
policy. Readiness and access loss after unanimous allocation do not permit another
successor. Frozen creation remains recoverable independently of later access loss.
Cross-store atomicity is not claimed: only unanimous lobby allocation is one local
SQLite transaction. Existing 64-lobby capacity still applies.

M3 remains incomplete. Hosted TLS/origin/cookies, actual eviction/hibernation,
geographic load, coordinated restore and release/rollback gates are separate.
No Cloudflare activation, provisioning, account connection or M4 work occurred.

## Revisions, provenance and checksums

Windows validation logs record all 18 invocations, exit codes, tool paths and clean
source. The pinned pnpm 10.33.0 runs through Corepack with Node 24.18.0; the host's
unrelated pnpm 11 wrapper is excluded. Manifests retain actual Wrangler/workerd,
Chromium and runtime/hardware facts. Linux CI metadata records its exact PR head;
the original synthetic merge commit bytes are retained and hash-verified, with a
tree identical to that head. No producer revision is substituted.

Artifact indexes hash stored bytes and decoded compressed logs/canonical files.
Source maps reconstruct measured bytes from permanent Git blobs plus explicit
line-ending/inline records. Duplicate source archives are omitted; runtime
folders, databases, raw configuration and credentials are not retained. Only
sanitized root artifacts are copied. Evidence attributes preserve bytes in Git;
committed-blob verification is separate from filesystem verification.

The final evidence review reconstructs canonical histories, receipts/events,
four-member download equality, local import source hashes and all four successor
recovery genesis boundaries. New identity/seed and copied policy are checked.
Source-map and evidence verification do not establish hosted scale or operating
capacity.

## Preserved earlier attempts

The first complete Windows run on `44cfc48` passed all 18 checks (716 unit tests and
47 local browser tests). Its independently checked evidence includes 255 indexed
files, 111 replay files, 16 canonical histories and four recovery genesis records.
It is retained separately from diagnostic-revision acceptance.

Initial Linux [CI 34184427730](https://github.com/ariesyous/li4chess/actions/runs/34184427730) failed while opening a fresh observer page in the
existing full campaign, before replay/rematch checks. Asset HTTP 200 responses do
not prove React initialization; retained evidence does not establish a product
root cause. The diagnostic revision adds bounded errors, asset response metadata,
rendered-button/root facts and masked screenshots on failure. It does not retry,
increase assertion timeouts or weaken expectations. The failed CI log, source map,
partial canonical evidence and original merge commit remain retained.

Six exploratory diagnostic bundles preserve three successful and three failed
runs. Failures exposed a stale-revision test setup, an unsafe proof-inspection poll,
and a departure-dialog synchronization race. Corrections wait for the specific
observable state rather than repeating a failed assertion or mutation. These
minimal bundles omit replay/canonical bodies referenced by observations; they
support diagnostics and progression, not independent RM02 acceptance. The complete
Windows/Linux artifact sets contain the actual canonical and replay bodies.

## Independent reviews and next step

Server review resolved rotation atomicity, durable frozen-creation alarms and
recovery-test barriers. Browser review resolved retry retention, retired-proof
recovery, fresh departure reconciliation, concurrent-action fencing and transient
storage cleanup recovery. Protocol/reducer review found no remaining blocker in
receipt identity, epochs, capacity or obsolete-callback handling. Final evidence
review is recorded separately from source inspection and runtime validation.

Review and merge the draft PR separately. The next bounded work is to plan the
remaining hosted acceptance gates with explicit authorization and ownership;
local acceptance does not authorize deployment or M4.

## Reproducing byte verification

The [verifier](verify.mts) checks indexes, source maps and reconstructed histories.
From the repository root after installing pinned dependencies, restore the two
retained synthetic CI commit objects when working in a fresh clone:

```sh
git hash-object -t commit -w docs/m3-08-evidence/linux/ci-merge.commit
git hash-object -t commit -w docs/m3-08-evidence/exploratory/linux-ci-34184427730/ci-merge.commit
node apps/worker/node_modules/tsx/dist/cli.mjs docs/m3-08-evidence/verify.mts docs/m3-08-evidence --committed
```

Omit `--committed` to verify filesystem bytes. CI-source metadata records each
commit hash and the equal permanent-head tree; restoring an object does not
substitute a producer identity or change a branch.
