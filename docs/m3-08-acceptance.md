# M3-08 authenticated private rematches: pre-change acceptance

Prepared 2026-09-07 (merge observed 2026-09-08 UTC). This inventory precedes
implementation. The maintainer authorizes same-four-principal private rematch
consent, fresh creation, deliberate browser entry, independent reviews, retained
Windows/Linux evidence, reviewed commits and a draft PR with exact-head CI.
Hosted activation, M4 and broad lobby expansion remain outside this slice.

## Baseline and review

PR #18 was initially draft/unmerged at `78e27ef3476c34e728c7d0ffcec53f29ee14b30a`.
The maintainer subsequently authorized independent review and conditional merge.
Two fresh reviewers found no substantive merge blockers. Evidence review checked
514 indexed artifacts, 112 decoded checksums, four 756-file source maps and
28 groups of byte-identical four-member downloads. Parent review checked browser
reconstruction and every successful step of exact-head CI 34172770041.
PR #18 merged at `229e325c7f4ee4ebae7abe53f025047f070aa5f9`.
Post-merge CI 34180878295 must pass before implementation; Pages 34180878310 passed.
No Cloudflare activation was performed. The unchanged Pages workflow ran on merge.

Node is `C:/Program Files/nodejs/node.exe`, 24.18.0. Pinned pnpm 10.33.0 runs via
`C:/Program Files/nodejs/node_modules/corepack/dist/pnpm.js`; the default host
wrapper reports 11.19.0 and is excluded. Frozen installation on the merged baseline
passed. This setup check is not M3-08 acceptance validation.

## Accepted scope versus proposed implementation defaults

Accepted by the maintainer: the same four existing principals; explicit individual
consent; no automatic entry, controller acquisition or play from a proposal or
consent; reuse maintained guest/lobby/GameRoom/persistence, readiness and local
clock configuration; preserve the old game; define abort eligibility explicitly.

The choices below are bounded implementation defaults, independently reviewed
before implementation. They are not selected launch controls or public policy.

| Area | Proposed contract |
| --- | --- |
| Eligibility | A canonical terminal private game, including opening aborts, with four immutable principal/seat grants and matching canonical/operational terminal identity. Waiting, active, missing, incompatible, divergent or incident rooms reject. A new always-fenced read-only eligibility path is required: current-producer `completedStatus` alone does not prove completion. |
| Proposal | Any current authenticated original principal, including an observer tab, may propose. Proposal creation supplies no consent. One active proposal per source room; all four subsequently consent separately. |
| Consent ownership | Server cookie authentication and frozen membership determine principal. No request identity, invitation, room ID, seat or controller proof can consent for someone else. Sibling tabs act on one principal's consent. |
| Proposal identity | A monotonically increasing source-room proposal epoch and revision fence delayed operations. Each accepted mutation has a principal-owned stable ID and exact stored payload/outcome. |
| Competing operations | The GuestService queue serializes proposals and consent across awaits. Same accepted ID/payload returns its historical outcome plus current proposal state; changed payload conflicts. A competing proposal does not add consent. Stale revisions reject. |
| Decline/withdraw | Any member may close a pending proposal; withdrawal cancels it for all four. A later proposal starts with all consents clear. A committed successor cannot be undone by a late withdrawal. |
| Departure | Temporary disconnect or closing a sibling tab does not revoke principal consent. Deliberate result-screen departure sends an explicit withdrawal with a saved stable intention. Lost departure replies remain recoverable, or the user may deliberately abandon response recovery with clear uncertainty. |
| Expiry | Fixed ten-minute proposal deadline, not extended by reads/retries. Deadline checks occur at mutation admission and status; expiry requires no receipt slot. Alarm cleanup is bounded and preserves terminal outcomes. |
| Session rotation | Same-principal valid replacement session retains consent and can recover principal-owned accepted requests. Retired credentials reject. Explicit revocation/absence of a valid session before unanimity cancels a pending proposal. Do not mistake rotation's intermediate credential retirement for departure. Interrupted rotation is tested. |
| Unanimity | Await the old terminal eligibility fence first. Then recheck proposal deadline, all four principals' current valid credentials and resource capacity immediately before the synchronous admission transaction. Fourth consent, successor lobby and source-to-successor mapping are one GuestService SQLite transaction. |
| Fresh creation | Create a new maintained waiting lobby with a fresh room/game identity and persisted seed distinct from the source seed. Store original clock policy and seat assignment, four memberships and all readiness false. No invitation admits replacement members. |
| Readiness | Each participant deliberately enters, then readies through existing authenticated readiness. Fixed rematch seats cannot be reassigned. Recheck all four principals at creation freeze. Once the exact creation intent is durably frozen, later expiry/revocation cannot abandon or rewrite it; recovery reconciles that same intent even when user access fails. `start` persists exact creation and calls maintained GameRoom/D1 creation; neither proposal nor consent starts play. |
| Recovery | No distributed atomic transaction is claimed. The unanimous lobby allocation is local/atomic; later GameRoom/D1 creation uses existing durable intent and same identity/header/seed. Lost replies, partial creation and restart must never allocate another identity. |
| After unanimous allocation | The successor mapping remains immutable even if someone later withdraws access, expires or revokes. No replacement principal or second successor is created. A waiting lobby with no frozen creation intent remains explicitly unavailable; account recovery is outside scope. |
| Previous game | Never reset the original authority or append rematch events to its canonical history. Preserve result, replay bytes, commands/receipts, producer, source digest and random history exactly. Cross-game relationship belongs to lobby/rematch metadata. |
| Resource bounds | At most eight proposals and 128 accepted mutation receipts per source room; retain outcomes without tombstone eviction. Reserve eight receipt slots for the at-most-eight terminal cancellations (already closed proposals reject new cancellation IDs); normal operations stop at 120. Rejected traffic does not consume receipts. Existing 64-lobby, request/body and queue limits remain. Exact retries/status/automatic expiry remain available at the cap. |
| Browser intentions | Persist exact request before sending; storage failure prevents send. Lost/ambiguous responses retain it. Only a verified response or deliberate abandonment clears it. Response identity/revision and component epoch fence every callback; a receipt for older state never restores it. |
| Browser entry | Explicit entry creates a fresh connection instance keyed by room/principal/session and invalidates old sockets/polls/download callbacks first. Preserve previous-result/replay access in a separate authenticated view without replacing an active successor connection. Resolve or deliberately abandon outstanding gameplay/control/rematch intentions before transition. |

## Acceptance inventory

| ID | Required executable evidence |
| --- | --- |
| RM01 | Four independently authenticated Chromium contexts complete an ordinary Modern game against maintained routing and real local workerd SQLite DO/D1, propose, give four explicit consents, deliberately enter, ready and play a legal move in the rematch. No automatic room/seat-control/play transition at proposal or consent. |
| RM02 | Exact original canonical result, header, command/receipt/event records and downloaded replay bytes before, during and after proposal, cancellation, allocation, new gameplay and recovery. New game has distinct identity/seed, Modern genesis and actual producer; source lineage is preserved in the original. |
| RM03 | All-seat nonmember/missing/invalid credentials, expiry/revocation, copied invitation, forged principal/seat and controller-proof-only requests reject. Same-principal rotation retains consent without duplication, old credentials reject, interrupted rotation and expiry during awaited eligibility fail safely. |
| RM04 | Observer/controller tabs, explicit takeover, two-tab consent, refresh/reconnect and exact duplicate requests share one principal vote and one successor. |
| RM05 | Simultaneous proposals, partial consent, decline/withdrawal/departure, fixed deadline, stale epochs/revisions, last-consent/withdraw races and proposal/resource boundaries with safe status/cancellation at capacity. |
| RM06 | Lost/delayed proposal, consent and fourth-consent replies, duplicate clicks, storage failures, refresh recovery, rotation/room changes and late old callbacks preserve exact intentions and prevent obsolete entry/state updates. |
| RM07 | Whole-runtime restart across allocation and maintained creation boundaries; real D1 outage/rollback and recovery reuse exact IDs/header/seed; immutable source history stays readable where persistence permits. |
| RM08 | Waiting/active rejection, explicit abort eligibility, historical producer read-only eligibility, integrity/incident failures, copied old clock policy across environment changes, fixed seats and successor credential loss. |
| RM09 | New test/tool sources type-check; test-only administration, clock and fault controls excluded from deployable bundles; all M3-07/M3-06/earlier suites retained without assertion retries. |
| RM10 | All requested fresh Windows validation and additive Linux CI, source maps, exact command/config/tool identities, sanitized failures and committed-blob checksums; fresh independent substantive and final evidence reviews resolve findings. Exact final pushed draft-PR revision has passing CI. |

Use isolated fixture entry points only for assisted time/fault/identity cases and
label them. Ordinary game completion is unassisted maintained routing. Never
retain cookies, proofs, invitations, bearer/admin secrets or runtime databases.
Keep source unchanged during provenance-sensitive runs, use fresh output paths,
and preserve M3-07's zero-retry HTTP driver and diagnostic sanitization.

Required commands: frozen install; lint; units; build; web test:e2e;
architecture-spike, persistence and game-room test:integration; build:workers;
check:workers; worker check:room; test:workers; worker build:multiplayer,
check:multiplayer, test:multiplayer, test:campaign, test:replay; new test:rematch.

## Platform review and exit gate

Official documents reviewed 2026-09-07:
[SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
[DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
Consume SQL cursors synchronously before awaits. A local SQLite transaction does
not make downstream DO/D1 work atomic; retain stable durable creation intent.
Local limits and restart evidence do not establish hosted capacity or restore.

Mark M3-08 complete only after RM01-RM10 have actual evidence. Keep M3 incomplete
for hosted TLS/origin/cookies, geography/load, eviction/hibernation, coordinated
restore and release/rollback gates. No hosted activation, M4, accounts, matchmaking,
ratings, analysis, shared CPU seats, public history or broad lobby redesign.
