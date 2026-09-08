# Next bounded M3 handoff: hosted acceptance planning

Prepared 2026-09-08 after [M3-08 local acceptance](m3-08-evidence/README.md).
This proposed task does not authorize provisioning or deployment.

First review draft [PR #19](https://github.com/ariesyous/li4chess/pull/19), require
passing CI on its exact final head, and merge only with maintainer authorization.
Verify post-merge checks before starting the next implementation branch.

The recommended next scope is a reviewable hosted acceptance plan. Inventory
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
