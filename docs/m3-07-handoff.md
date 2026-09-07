# After M3-06: bounded handoff

Prepared 2026-09-07 for [draft PR #17](https://github.com/ariesyous/li4chess/pull/17).
Verify its final head and passing CI before starting another slice. The M3-06
[acceptance inventory](m3-06-acceptance.md) and [evidence index](m3-06-evidence/README.md) distinguish ordinary games, accelerated
clock scenarios, checkpoint endings, opening aborts and unfinished incident rooms.
M3-05 PR #16 is verified merged at `e8d5494898bcd7b88491aa3ea2ccc19e01d13816`;
its former draft status is historical.

## M3 assessment

Four authenticated local browser sessions can complete ordinary private games with
authoritative clocks and converge after refresh, lost responses, duplicate/stale/
out-of-turn/late commands and whole-runtime restart. Exact prepared commands, random
provenance and receipts survive D1 rollback/reconciliation; missing or divergent
operational state fails unavailable or quarantined. These conclusions require the
linked completed M3-06 manifests; they are not claims of hosted service readiness.

M3 stays in progress. Its saved-game replay and rematch capabilities are not yet
available as authenticated multiplayer product flows. Existing local hotseat/CPU
replay import/export and internal canonical reconstruction do not fill that gap.
The restart portion has local process evidence, while real hosted eviction/hibernation
and the operational gates below remain untested. Four-browser/server CI coverage
addresses the local exit criteria only.

## Recommended next product slice

Propose authenticated completed-private-game replay retrieval and browser export,
with authorization derived from existing room membership and the maintained canonical
history. Keep reconstruction, receipts, source lineage and replay-v2 validation in
the existing persistence/protocol layers. Define one bounded read-only interface and
one browser result-screen export flow, with explicit unavailable/quarantine responses
for incomplete, incompatible or divergent histories. Prove access control, exact
producer/source provenance, export/import round trips and stable completed results
through existing four-browser CI. Retain local opt-in and the default hosting behavior.
This is a proposed next task, not authorization to implement it in M3-06.

Rematches should be a separate bounded follow-up: a new room/game identity, seed,
readiness and consent, without mutating the prior result or implicitly moving guests.
Do not add matchmaking, accounts, ratings, analysis or shared online CPU seats as
part of either slice. Launch time controls and public operating policies remain open
until work actually depends on them.

## Hosted validation requires new authorization

Before connecting an account, provisioning or activation, agree a separate scope
covering HTTPS origins/cookies and session behavior, geographic latency/load targets,
real DO eviction/hibernation and alarms, coordinated DO/D1 restore, release compatibility,
rollout and rollback, budget/plan and resource ownership. Use the operations/ADR gates
and current official platform documentation. No local campaign authorizes live secrets,
production data, infrastructure changes, purchases or publishing.

## Starting the next task

Read AGENTS, README, ROADMAP, project state, M3 acceptance/evidence and contracts;
fetch refs and verify PR #17's actual status and CI before choosing a branch. Preserve
unrelated work and the configured human Git identity. Use Node 24+ and pnpm 10.33.0
from verified executables; this Windows host's global pnpm wrapper differs. Keep
fixture/time/crash/admin entry points outside deployable bundles. Reuse the isolated
runtime harness and maintain all current checks. Do not mark M3 or begin M4 merely
because M3-06's local campaign has passed.
