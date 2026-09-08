# After M3-07: bounded handoff

Prepared 2026-09-07 for [draft PR #18](https://github.com/ariesyous/li4chess/pull/18).
Verify its actual final head, CI and merge status before starting another slice;
this handoff does not authorize merging or starting rematches. M3-06 PR #17 is
verified merged at `eddbcad64d340ed7b4df4fe2baa277d4db5424f0`, with successful
merge CI and Pages. Its former draft wording is historical.

## Current boundary

Authenticated completed-private-game replay retrieval and result-screen export
have [Windows/Linux acceptance evidence](m3-07-evidence/README.md). Reads use
existing principal membership without seat takeover, preserve original producer
and source lineage, and audit maintained canonical history. Abort exports,
rotation, observer tabs, retries, stale callbacks, restart, corruption and local
import are covered. The [contract](multiplayer-v1.md) specifies limits and typed
failures. No account recovery or history-browsing product was added.

M3 remains incomplete. Rematches and separately authorized hosted gates remain.
M4, matchmaking, ratings, accounts, analysis and shared online CPU seats are not
part of this work. Default hosting remains local play.

## Recommended next slice: private rematch consent and creation

Propose a separate M3-08 acceptance inventory before implementation. Reuse current
authenticated guest membership and lobby/room creation. Define explicit participant
consent, departure and expiry behavior, immutable prior results, new game/room
identity and random seed, readiness, duplicate/lost-request handling and browser
room-transition races. Do not automatically transfer control or move participants
into a new game merely because another member requests a rematch.

Validate four independent contexts, observer/controller behavior, same-principal
rotation, nonmembers, partial consent, disconnect/reconnect, duplicate/lost replies,
and old-room late callbacks against real local workerd/D1. Old result/replay bytes
must remain identical through every new-room operation. Product choices such as
who may propose, consent expiry and invitation reuse remain proposed, not selected
policy. Keep the existing local clock configuration; launch time-control selection
and public operating policies need separate scope if they become necessary.

## Hosted gates and starting work

Hosted TLS/origin/cookies, geographic latency/load, actual eviction/hibernation,
coordinated DO/D1 restore, release compatibility, rollout/rollback and ownership/
budget remain separately authorized gates. Do not connect accounts, provision,
purchase, deploy or use live secrets based on local evidence.

Read AGENTS, README, roadmap, project state, acceptance/evidence and maintained
contracts. Fetch refs and verify PR #18 before creating a new branch from current
origin/main; preserve unrelated work and the configured human Git identity.
Use Node 24+ and verified pnpm 10.33.0 (this Windows host has a different global
wrapper). Keep test administration, fake time and fault hooks out of deployable
entries. Run every retained suite including `test:campaign` and `test:replay`.
Use fresh output directories and freeze source during provenance-sensitive checks.
