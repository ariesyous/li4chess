# M3-07 completed private replay acceptance

Declared 2026-09-07 before implementation. The maintainer authorizes authenticated
completed-private-game retrieval and browser download, independent review, retained
Windows/Linux evidence, reviewed commits and a draft PR with exact final-head CI.
Rematches, hosted activation and M4 remain outside this slice.

## Verified baseline

PR #17 merged at `eddbcad64d340ed7b4df4fe2baa277d4db5424f0`. Its head was
`270adfc6038332f09885c480a24ce5f249da9e3c`. Post-merge
[CI 34166793615](https://github.com/ariesyous/li4chess/actions/runs/34166793615)
and [Pages 34166793571](https://github.com/ariesyous/li4chess/actions/runs/34166793571)
both succeeded, verified before behavior changes. Historical draft wording is
superseded. Fetched origin/main became the new, clean
`codex/m3-07-completed-game-replay` branch without replacing an existing branch.
Node is `C:/Program Files/nodejs/node.exe` 24.18.0. Corepack's pinned pnpm is
10.33.0; the host-global 11.19.0 wrapper is excluded from validation.

## Contract and technical choices

The product scope above is accepted. The following are implementation choices
proposed from inspection, subject to executable validation and independent review.

- Extend maintained versioned private transport with a read-only paged retrieval
  operation. Existing exact Origin, JSON/protocol header and HttpOnly credential
  checks apply. Every page authenticates and checks stored room membership before
  access and rechecks credentials before publication. No invitation, room ID, seat
  claim, client identity, cursor or controller proof grants access by itself.
- Same-principal rotation preserves membership; its new valid session can start a
  download without taking control. Retired credentials reject. Expired/revoked
  credentials cannot recover membership by issuing a different guest. A page
  response identifies the authenticated principal/session so an obsolete browser
  callback cannot export under a changed identity.
- Reuse canonical persistence's genesis boundary, stored command/receipt checks,
  reducer and replay-v2 validation. Return the exact creation checkpoint, ordered
  events, final result/hash, original producer, setup and source digest. Walking
  randomness is verified from recorded provenance, never regenerated with ambient
  randomness. No rules, receipt or result changes are part of retrieval.
- Use a separate read-only room path: verify immutable room identity, membership,
  owner, canonical header/head, operational marker/cache/timing and incident state.
  Do not call gameplay boot/recovery, attach, takeover or clock advancement merely
  to export. Inconsistent stores reject without modifying or clearing an incident.
- Historical producers require explicit compatible read policy and a complete
  genesis audit under the supported standard-v1/state-v2/replay-v2 reducer. Preserve
  the historical producer identity; the current serving build never becomes the
  game's producer. Writer producer fencing and command-v1/v2 remain intact.
- Bound each reconstruction invocation and response; retain only bounded trusted
  server continuation state, never accept a browser checkpoint as that state.
  Expired/lost continuations explicitly restart. Duplicate reads are retryable.
  Declare concrete page, aggregate byte, cursor lifetime and concurrency limits in
  the implemented contract, with exact-boundary tests. The existing 2048-command
  admission ceiling remains unchanged. Any narrower export byte boundary must be
  visible, tested and reported rather than silently truncating long histories.

## Authorization and failure matrix

| Case | Required outcome |
| --- | --- |
| Four current member credentials; controller or observer; no tab proof | Identical canonical artifact, no control acquisition |
| Refresh/reconnect/takeover or same-principal rotation | Membership preserved; valid new session can restart retrieval |
| Missing, malformed, unknown, expired or revoked credential | Typed authentication rejection; no history disclosure |
| Valid nonmember, copied invitation, forged seat/principal or cursor | Rejection; no history disclosure |
| Waiting or unfinished game | Typed unfinished/unavailable response; no export |
| Terminal opening abort | Valid replay-v2 abort artifact with exact counts/facts and no invented placements |
| Missing history, incompatible schema/producer/actions | Typed missing/incompatible failure; no replacement checkpoint |
| Divergent/quarantined canonical or operational records | Typed integrity/unavailable failure; no repair or fabricated artifact |
| Persistence outage, lost/delayed page, runtime restart | Explicit retry/restart; no partial file download |
| Exact resource boundary and exceeded limit | Supported boundary succeeds; exceeded bound fails explicitly |

## Browser and acceptance inventory

| ID | Required executable proof |
| --- | --- |
| R01 | Ordinary Modern complete game through four independent authenticated Chromium contexts, maintained routing and real local Wrangler/workerd SQLite DO + D1; all four download identical replay bytes/content matching canonical initial/events/result/final state. |
| R02 | Observer/controller tabs, explicit takeover, refresh/reconnect and repeated downloads preserve read authorization, exact placements/scores, terminal history, clocks, banks and pending intentions. |
| R03 | Missing/invalid/nonmember credentials, all-seat expiry/revocation/rotation, proof-free retrieval, old credentials and forged fields reject appropriately. |
| R04 | Unfinished game rejects; terminal opening abort exports correctly; incompatible, missing, divergent and quarantined records fail explicitly. |
| R05 | Loading, success and actionable failures; immediate duplicate-click guard; interrupted/lost/delayed responses safely retry; room/session changes and leaving invalidate every late callback before download. |
| R06 | Whole-runtime restart and persistence outage/recovery preserve exact terminal identity and export; no download side effects or automatic incident clearance. |
| R07 | Labeled source-linked checkpoint endings and walking-King randomness retain exact producer/source lineage and recorded random facts. |
| R08 | Existing replay-v2 reader and local browser import accept downloaded artifacts; re-export retains the existing checkpoint/source-link semantics. Local hotseat/CPU save/import/export suites remain enabled. |
| R09 | Concrete page/aggregate/continuation/concurrency boundaries, changed tool/test type checks, deployable fixture exclusion, additive version compatibility and unchanged default hosting. |
| R10 | Fresh full Windows validation, new checks in Linux CI, independent substantive and final evidence reviews, source maps and committed-blob artifact checksums without credentials or runtime databases. |

All requested frozen install, lint, units, builds, browser, architecture,
persistence, GameRoom, Worker, multiplayer and campaign commands must pass on
unchanged validation source. Retain failures and limitations explicitly; no
assertion retries or weakened earlier suites. Evidence records exact revision,
source fingerprint, executable versions/paths, configuration, commands and observed
comparisons. Preserve artifact bytes through Git attributes and verify committed
blobs. Never retain cookies, credentials, proofs or administrative secrets.

## Implemented and validated choices

Independent contract and implementation reviews selected one canonical command
per continuation, at most 32 events per transport page, a 32,000,000-byte exact
canonical artifact ceiling, four principal readers, a ten-minute audit lifetime,
and the existing 2048-command maximum. A new download invalidates that principal's
old cursor; repeating the last cursor returns the same page. Long games above the
byte ceiling explicitly return `replayLimit`; they are not silently truncated.
Synthetic trusted-port tests walk all 2048 continuations at exactly the byte cap
and one byte above it. These test boundary accounting, not reachable game length
or hosted performance. Maintained D1 and browser campaigns establish real replay
semantics separately.

Historical terminal builds use an authenticated `replayStatus` preflight before
browser control attachment; creation history retains its producer. Fixture-only
serving identity substitution tests this path and is not a second deployed build.
The current writer's exact producer fence remains in force.

Exploratory runtime testing exposed an existing terminal publication issue when
session rotation closed a sibling channel: a delivery failure suspended the
already committed terminal result. The scoped correction prunes closed channels
and republishes corrected terminal presence, retaining canonical history, control,
clock balances and disconnect banks. Active-game delivery failures retain existing
recovery semantics. Focused unit and real runtime regression checks pass.

Full-source and resource-test independent reviews found no remaining substantive
source blocker. Corrected clean `f9c54928d7faece4b18e0b39f1cb317a258b2777` passed
all 17 Windows invocations and Linux CI 34171318234. The
[evidence index](m3-07-evidence/README.md) maps R01-R10 to actual checks and
distinguishes ordinary games, assisted fixtures and synthetic resource tests.
Independent evidence review verifies exact source/artifact/replay bytes; final
documentation-revision CI is verified on draft PR #18 before task completion.

## Platform documentation and completion gate

First clean Windows validation at `c29885d243a269ea1347380a64d3d3f70ef0923b`
passed all 17 commands: 695 units, 47 local browser tests, 83 full-campaign
observations/27 starts and 11 focused replay observations/3 starts. Linux
[CI 34170371852](https://github.com/ariesyous/li4chess/actions/runs/34170371852)
failed after both ordinary histories exported successfully: the test driver's next
terminal-command POST encountered a socket hang-up. The healthy runtime log and
browser-only interval are consistent with an idle pooled socket reset; this cause
is inferred, not packet-proven. The scoped driver correction uses distinct HTTP
connections and explicitly zero retries, leaving all browser transport and exact
assertions intact. A local HTTP test proves distinct sockets and no reset retry.
Thrown fixture errors now use the same credential redaction as retained artifacts;
structured JSON sanitizes string values before encoding. Synthetic error tests
cover known and unknown cookie/proof/header values and valid retained JSON. An
intermediate sanitizer test failure was corrected before acceptance reruns.

Additional official review on 2026-09-07:
[Node 24 reused sockets](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html#requestreusedsocket)
and [Playwright request retries](https://playwright.dev/docs/api/class-apirequestcontext).

Official documentation reviewed 2026-09-07:
[DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and
[SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).
Bound reconstruction across invocations and consume SQL cursors before awaits;
local workerd acceptance does not establish hosted resource capacity or latency.

Mark M3-07 complete only when R01-R10 have retained evidence, substantive findings
are resolved and CI passes on the exact final pushed revision of the draft PR.
M3 remains incomplete for rematches and separately authorized hosted gates. Update
the contracts, README, roadmap, project state and next-slice handoff with actual
outcomes, without claiming these proposed choices are implemented before testing.
