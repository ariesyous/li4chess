# M3-06 local four-browser acceptance campaign

Declared 2026-09-07 before behavior changes. Scope is complete private games and
necessary correctness fixes, independent review, retained Windows/Linux evidence,
and a draft PR with passing final-head CI. Hosted activation and M4 are excluded.

## Baseline and inspection

Fetched origin/main is M3-05 merge `e8d5494898bcd7b88491aa3ea2ccc19e01d13816`.
PR #16 is merged, superseding its draft wording in historical handoff documents.
Final head `c0a418a1388472f34d301d3d10ca97443993d574` passed CI 34136255021;
Pages 34147880224 succeeded on the merge. Post-merge CI 34147880230 was still
running at declaration; it subsequently passed before behavior changes. The clean tree
became `codex/m3-06-four-browser-validation` without replacing an existing branch.
Node resolves to `C:/Program Files/nodejs/node.exe` 24.18.0; Corepack selects pinned
pnpm 10.33.0. The host-global pnpm wrapper is not the validation executable.

The inventory inspects maintained GuestService, multiplayer-local routing and
wire schemas, Room/SQLite storage/timing, D1 recovery and command commitments,
browser connection/lobby state, runtime harnesses, immutable build fingerprints,
fixture exclusion dry-runs and CI. M3-05's browser run ends in an opening abort;
M3-04's complete internal games do not establish four authenticated browser play.
Neither is relabeled as fresh M3-06 evidence.

## Scenario matrix

Every row below is an acceptance requirement, not an implemented/passed claim.
The evidence index will map each row to executable checks and exact observed data.
Four independent Chromium contexts have distinct server-issued HttpOnly guests;
same-context observer/copied tabs supplement those four seats. Browser routing
uses the maintained public service, actual workerd SQLite DOs and isolated D1.

| ID | Scenario and expected canonical result | Browser/runtime observations and boundary |
| --- | --- | --- |
| G01 | Ordinary UI guest issuance, room creation/invitation join, seat/ready and Modern start through complete repetition game. Four active players receive +10 once, shared first/mean rank 2.5. | All four boards and terminal UI agree with D1 command/event/state/chain hashes; replay from creation, terminal reconnect and exact old receipt. No initial checkpoint substitution. |
| G02 | Ordinary Modern opening with at least three completed moves per seat; resignation, recorded legal walking actions and third elimination. Survivor gets +20 per still-live walking King; points determine every placement. | Assert actual legal King mobility before forfeits, seeded random cursor/candidate provenance, passive army rendering, normal scheduled walking and terminal immutability. Label any unfinished run. |
| G03 | Authoritative timeout and cumulative disconnect-bank exhaustion both beyond guard and during opening. | Zero-clock versus distinct 60,000 ms disconnect facts; opening abort counts/liable seat/no normal awards; later walking/survivor completion. Test-only time acceleration is labeled. |
| G04 | Legal Claim Win, including legitimate out-of-turn admission. | Exactly two active players and >=21 lead; trailer +20, immediate frozen placements, eliminated high scorer preserved. Clearly labeled checkpoint-assisted ending. |
| G05 | Scheduled checkmate/stalemate, passive dead armies and skipped turns. | Shared engine resolves on victim rotation; exact awards, zero-point blockers/captures and next eligible seat; continue to terminal. Clearly labeled fixture assistance. |
| G06 | Automatic repetition, insufficient material and 200 reversible turns. | Exact draw precedence and one flat +10 per active seat; no survivor stacking. G01 proves ordinary repetition; hard boundaries use labeled checkpoints and source-linked replay. |
| B01 | Refresh/offline/reconnect/resyncRequired across all seats. | UI recovery, same identity/proof where valid, immediate replacement connection, canonical convergence and no client-established expiry. |
| B02 | Lost response before delivery and after canonical commit; duplicate/conflicting/stale/out-of-turn/late requests. | Pending remains distinguishable from rejection; exact IDs/actions/expected sequence retained through refresh, later commands and terminal; original receipt/admittedAt unchanged. |
| B03 | Old snapshots/receipts and callbacks after newer state/replacement connection. | No board rollback or replacement-socket closure; browser-visible state and focused deterministic regressions. |
| B04 | Observer/copied tabs and explicit takeover at each seat; lost takeover response plus refresh/reconnect. | Copied proof gets observer identity; old tabs fenced; one stable takeover ID, generation advances exactly once, unresolved old-generation action never reauthored. |
| B05 | Credential expiry, revocation and rotation. | Existing sockets lose access/presence, later requests reject old credentials, same-principal rotation distinct from new identity; admission/publication ordering remains authoritative. |
| B06 | Lost waiting-room creation response; seat/ready races; room/identity changes and cleanup. | Stable creation ID, one immutable creation/seed/grants, monotonic lobby, obsolete completion ignored, deliberate abandonment preserves unresolved intentions until chosen. |
| R01 | Whole-runtime stop/restart with live browser intentions, before prepare, after prepare, after exact D1 commit, after finalize, after activation and before publication. | Persist exact boundary facts before termination; recover identical prepared bytes/receipts/randomness; no speculative success. Browser retries same ID and converges after restart; run continues to terminal where recoverable. |
| R02 | D1 rollback/suspension and uncertain commit response. | Old canonical prefix during failure; clock/bank balances frozen; exact primary reconciliation, single increment/effect group, original admission after repair and terminal. |
| R03 | Owner fence, duplicate reconciliation, missing/incompatible timing and divergent history. | Deterministic recovery or explicit unavailable/quarantine, never fabricated clocks/actions/result. Negative incident rooms are intentionally unfinished. |
| T01 | Admission, suspension, reconnect, lease expiry, takeover and earliest deadline edges. | Server timing revisions/debits and main-versus-disconnect tie ordering; cosmetic browser countdown is not timeout proof. Real alarm delivery and deterministic injected-time arithmetic reported separately. |
| I01 | Isolation, compatibility, provenance and cleanup. | No test key/time/crash/admin hook in deployable bundles; unchanged default opt-in/Pages paths, released migrations, command-v1/v2, state/replay-v2, frozen classic/archive bytes. Hidden owned processes, fresh databases/ports, identity readiness and released-port checks on failure/success. |

## Evidence and interruption contract

Capture canonical creation headers, command records/receipts, ordered events,
terminal results, final state/hash/chain, operational timing and all four client
observations. Validate histories through maintained replay-v2 from their recorded
creation, not merely latest checkpoint; compare producer and source lineage.
Random actions must preserve algorithm/seed/cursor/draw count/candidate hash.
Check terminal new-command rejection and exact duplicate receipt after later work
and reconnect. Timing revisions can differ by observation time; compare canonical
heads exactly and timing at explicitly synchronized/suspended boundaries.

After prepare and before D1: old committed prefix plus exact durable intent.
After D1 and before finalize: exact canonical successor reconciles without reducer
rerun. After finalize and before activation: suspended successor, no outage debit.
After activation and before publication: durable successor and original receipt.
Before prepare: no admitted action is invented; retry may admit the original ID.
Missing operational state and incompatible prefixes must remain unavailable.

Use isolated test adapters around maintained authority ports or maintained class
construction, never a second game authority. Ordinary games use the unmodified
maintained entry. Fixture credentials remain ephemeral and outside all deployable
entries. Do not retain cookies, tab proofs, invitation secrets or runtime databases.
Record unsuccessful attempts and causal fixes; readiness polling is permitted,
assertion retries and timeout inflation to hide failures are not.

## Exit criteria and roadmap mapping

G01/G02 establish roadmap complete-game capability; G03–G06 cover ending families.
B01–B06 cover handoff interruption/authentication/intent continuity; R01–R03 and
T01 cover recovery and clock fairness; I01 covers integration and release boundaries.
All required existing suites remain enabled, changed test/tool sources type-check,
and a new four-browser/runtime campaign runs in CI on the final pushed revision.
Run frozen install, lint, units, build, web E2E, architecture/persistence/GameRoom
integrations, Workers builds/dry-runs/runtime, check:room, and all multiplayer checks.
Retain exact revision/source fingerprint, tool paths/versions, configs, commands,
observations, failures and reviewed source maps without duplicating old archives.
Fresh substantive and final independent reviews must resolve material findings.

Only then mark M3-06 locally complete and publish a draft PR. M3 overall remains
subject to an explicit assessment of saved replay/rematch product capability and
hosted gates: TLS/origin/cookies, geographic latency/load, real eviction/hibernation,
alarm behavior, coordinated restore and rollout/rollback. Local process restart
does not prove those claims. No launch clock, public operating policy, accounts,
matchmaking, ratings, CPU seats, hosting resources or activation is selected.

Read with [roadmap](../ROADMAP.md), [M3-06 handoff](m3-06-handoff.md),
[authority contract](m3-04-acceptance.md), [wire contract](multiplayer-v1.md),
[rules](rules-spec.md) and [replay format](state-replay-v2.md).

## Platform review

Official documentation rechecked 2026-09-07: SQLite storage transactions and
output gates do not provide an atomic transaction with D1; SQL cursors should be
fully consumed before awaits. The maintained adapter retains its storage gates
and queue. [SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).
D1 batches roll back failed transactions; direct database binding calls use the
primary. Exact reconciliation remains application-owned.
[D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/).
Alarms are at least once with limited automatic retries; existing explicit
rearming is retained. Local injected time and manual fixture alarms do not prove
hosted punctuality. [Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/).

## Observed acceptance

The declared local matrix passed on Windows and Linux with independently reviewed
[retained evidence](m3-06-evidence/README.md). The evidence maps complementary
existing-suite checks explicitly; observation rows are not game counts.
[Draft PR #17](https://github.com/ariesyous/li4chess/pull/17) records exact final-head
CI after documentation closeout. M3 remains incomplete for the product and hosted
gates in the [next handoff](m3-07-handoff.md).
