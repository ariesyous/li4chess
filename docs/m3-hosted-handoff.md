# Deferred M3 handoff: hosted friend-invite acceptance

Prepared 2026-09-08 after [M3-08 local acceptance](m3-08-evidence/README.md).
Updated 2026-09-08: the accepted minimal-time direction makes the
[local/CPU domain launch](local-launch-handoff.md) the next task. This handoff is
deferred until after L1, if hosted friend-invite play is pursued. Preserve the
implemented multiplayer and the acceptance needs below. This document does not
authorize provisioning or deployment.

PR #19 merged at 9a49a80, verified by the 2026-09-08 pull. Verify the current
main revision and its checks when resuming; no fresh post-merge CI verification
is claimed by this documentation update.

When resumed, deliver casual create-room/share-link/play-with-friends behavior
using the existing guests, clocks, reconnects, replay downloads and rematches.
Use a bounded hosted acceptance plan for that outcome. Inventory
existing ADR gates and identify the environment, owner, budget, fixtures,
measurable pass/fail criteria, retained evidence and cleanup for each:

- TLS, allowed origins, cookie/session behavior and deployed asset routing.
- Geographic latency, concurrent rooms, resource limits and operational costs.
- Real Durable Object eviction/hibernation and alarm recovery.
- Coordinated D1/Durable Object backup and restore, including divergent histories.
- Build compatibility, rollout/rollback, incident ownership and observability.

Separate local evidence from checks requiring a hosted account. Prepare concrete
configuration changes and acceptance procedures for review before activation.
Do not infer a launch clock, public access policy, paid resource budget or
provisioning permission from the roadmap. M3 remains incomplete until its remaining
exit criteria have evidence. M4 public matchmaking and rated play remain separate.
