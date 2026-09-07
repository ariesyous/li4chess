# M3-05 to M3-06 handoff

Prepared 2026-09-07. M3-05 implements private authenticated multiplayer; acceptance
status is in [project state](project-state.md) and [evidence](m3-05-evidence/README.md).
M3 remains incomplete. This handoff does not authorize deployment or all of M3.

M3-05 merged in [PR #16](https://github.com/ariesyous/li4chess/pull/16) at
`e8d5494898bcd7b88491aa3ea2ccc19e01d13816`. Verified 2026-09-07: final head
`c0a418a1388472f34d301d3d10ca97443993d574` passed
[CI 34136255021](https://github.com/ariesyous/li4chess/actions/runs/34136255021),
and the merge passed [CI 34147880230](https://github.com/ariesyous/li4chess/actions/runs/34147880230)
and [Pages 34147880224](https://github.com/ariesyous/li4chess/actions/runs/34147880224).
These verified outcomes supersede the original draft handoff status. The
[M3-06 inventory](m3-06-acceptance.md) records the subsequent local campaign.
## Implemented boundary

Four independent guests can issue HttpOnly credentials, create/join a private
room, atomically select seats and ready, play via the existing board, observe in
other tabs and explicitly take over. Expiry/revocation affect connections; rotating
credentials advances session. Invitations grant membership requests, not seats.
Cookie plus session-bound tab proof authenticates public commands before GameRoom
binding access. Current engine legality and command-v1/v2/state-v2/replay-v2 persist.

Public schemas are in [multiplayer-v1](multiplayer-v1.md); local commands and exact
configuration are in [Worker README](../apps/worker/README.md). SQLite prepare,
exact D1 reconciliation, finalize, activation and publication remain authoritative.
Pending command/takeover IDs survive ambiguous responses. Browser reconnect
reauthenticates and resyncs; stale frames/receipts cannot roll back newer state.
Suspension timing is anchored to finalized state. Identity changes preserve old
unresolved intentions until explicit abandonment. Default Pages/Worker behavior
is unchanged; all online integration is opt-in local configuration.

## Recommended next slice: complete-game browser validation

Begin with a pre-change M3-06 acceptance inventory against the final M3-05 merge
and CI evidence. Keep this as validation and focused fixes; do not expand lobby,
accounts, matchmaking, ratings or shared online CPU seats. Use four independently
authenticated browser contexts against the maintained entry, local D1 and SQLite.

1. Drive complete standard-FFA games beyond the opening guard. Prove shared
   canonical placements, scores, dead armies, turn rotation and terminal immutability
   for the selected endings, including legal Claim Win, timeout/disconnect,
   resignation with walking King and automatic draw paths. Reuse engine fixtures
   only through a clearly isolated test entry; never add administrative public routes.
2. Expand the interruption matrix across all four seats and observer/controller
   tabs: refresh, lost response, offline transition, expired/revoked/rotated session,
   takeover, waiting room creation and credential loss. Resolve receipt and result
   consistency after later commands and complete endings.
3. Exercise whole-runtime restart and canonical recovery while browser clients
   retain pending intentions, including each prepare/commit/finalize/activation
   boundary and incompatible/missing operational state. Keep uncertain outcomes
   explicit. Add complete-game replay validation and compare all client boundaries.
4. Retain all architecture, persistence, room, local-play and M3-05 suites on
   Windows and CI. Record exact source/tool/config identity, failures and censored
   scenarios. Current M3-05 evidence proves an opening abort plus interruptions,
   not this comprehensive full-game campaign or playing strength/capacity.

## Separately authorized hosted gates

Do not connect accounts or provision resources without additional authority.
Hosted work needs explicit environment/binding isolation, TLS and cookie/origin
verification, migration/producer compatibility, quota/CPU/query/load budgets,
geographic latency and fairness, WebSocket eviction/hibernation and alarm-delivery
observations, deployment interruption, rollout/rollback and coordinated D1/DO
restore. Public abuse/retention/operating policies and launch time control remain
unselected. The deliberately bounded single local GuestService is not public
scale or durable account recovery. Local expiry is absolute; no account identity
recovery or membership replacement is implemented.

Preserve frozen classic code and archived evidence. Never infer hosted authority
from the existence of local Wrangler files or a passing dry-run.
