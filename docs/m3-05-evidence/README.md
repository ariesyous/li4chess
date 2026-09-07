# M3-05 authenticated multiplayer acceptance evidence

Measured 2026-09-07 against the [pre-change plan](../m3-05-acceptance.md), commit
`630bc6f`. Reviewed implementation
[`c0d845715c2f1c66a83ad35bb94c885e1a8d8492`](https://github.com/ariesyous/li4chess/commit/c0d845715c2f1c66a83ad35bb94c885e1a8d8492)
passed every required local command on a clean tree, with Windows fingerprint
`sha256:8397459b17078c188db89248f0afe9fcb09d4f7261396c9e5c070b22a88ff0b8`.
Test-only correction `45bbcff` strengthens walking preconditions and standalone
live revocation. Final CI remains pending on [draft PR #16](https://github.com/ariesyous/li4chess/pull/16).
M3-05 is not yet marked complete; [M3-06](../m3-06-handoff.md) remains outside scope.

## Actual local checks

[Commands/exits](local-runtime/checks.json), [transcript](local-runtime/validation.log.gz),
[package output](local-runtime/package-task-logs.json.gz) and runtime observations
retain the run. `--force` bypassed Turbo caches. The PowerShell transcript omitted
native stdout; package logs and runtime records supply it. The [structured browser
report](local-runtime/web-e2e.json.gz) is a separate same-revision repeat at
14:36:34Z to fill that logging gap. The original 14:31:45Z invocation also passed.
Neither used retries, and changed test/tool sources type-check.

| Command from repository root | Clean implementation result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile unchanged |
| `pnpm lint --force` | Ten packages |
| `pnpm test --force` | 671 units: includes 37 room/timing, 53 protocol, 29 web |
| `pnpm build --force` | Packages and default Pages build |
| `pnpm --filter @li4chess/web test:e2e` | 46 passed; structured repeat also 46, zero flaky/skipped |
| `pnpm --filter @li4chess/architecture-spike test:integration` | 14 groups, eight starts |
| `pnpm --filter @li4chess/persistence test:integration` | Nine groups, four starts |
| `pnpm --filter @li4chess/game-room test:integration` | 22 groups, 25 starts |
| `pnpm build:workers` | Default assets; Pages bytes preserved |
| `pnpm check:workers` | Existing staging/production dry-runs |
| `pnpm --filter @li4chess/worker check:room` | Bundle/type check and fixture exclusion |
| `pnpm test:workers` | Four HTTP/browser tests and owned-process lifecycle checks |
| `pnpm --filter @li4chess/worker build:multiplayer` | Explicit opt-in asset/build mode |
| `pnpm --filter @li4chess/worker check:multiplayer` | Local bundle/type check, fixture exclusion, default-mode rejection |
| `pnpm --filter @li4chess/worker test:multiplayer` | 14 actual workerd/D1/Chromium groups, two isolated databases |
| Markdown / whitespace | 403 local links at implementation revision; `git diff --check` passed |

Windows 11 kernel 10.0.26200 x64, Ryzen 5 5600X / 12 logical CPUs,
34,269,650,944 bytes RAM; Node **24.18.0**, Corepack pnpm **10.33.0**, Wrangler
**4.129.0**, workerd **1.20260903.1**, compatibility date **2026-09-01**.
[Manifest](local-runtime/multiplayer-manifest.json) records executable/origin/tools.
[Configuration](local-runtime/multiplayer-configuration.json) uses placeholder
local bindings and a development clock; [expiry configuration](local-runtime/expiry-configuration.json)
uses a real 12-second TTL. No Cloudflare account or hosted resource was accessed.

## Proven scope

[Multiplayer observations](local-runtime/multiplayer-observations.json.gz),
[summary](local-runtime/multiplayer-summary.json), [runtime log](local-runtime/multiplayer-runtime.log.gz)
and [screenshot](local-runtime/online-terminal.png) establish:

- Four independent HttpOnly/SameSite guest cookies and distinct principals.
  Actual SQLite inspection verifies the four original token digests and absence
  of those raw tokens. Invitations request membership; concurrent seats/readiness
  produce one immutable game creation.
- Genuine successful creation/command/takeover responses lost in transport.
  Browser retries preserve IDs; original receipt/admission facts survive later
  commands, conflicting/stale requests reject and four clients share one hash.
- Origin/version/field/action/size/proof rejection, WebSocket protocol/origin
  rejection, malformed first frames and a real five-second handshake deadline.
  No room data precedes authentication; public bodies cannot author server actions.
- Refresh reauthentication, observer tabs, explicit takeover, copied-tab proof
  separation, browser-driven lost-takeover reconciliation and later takeovers.
  Offline recovery resyncs; late lobby responses cannot restore cleared room state.
- Real D1 rollback via test-owned SQL trigger: no speculative publication, frozen
  server suspension balances, exact pending intention across browser refresh,
  actual alarm recovery and original receipt after repair. Fault SQL remains
  outside deployable entries.
- Legal out-of-turn resignation ends an opening abort; terminal retries return
  the original receipt, new commands reject and clients agree. This does not
  substitute for M3-06's comprehensive complete-game campaign.
- Rotation closes old-session tabs; expiry closes an attached guest and rejects
  its cookie. The initial revoke check removed the replacement cookie; `45bbcff`
  additionally tests revocation of another connected guest and old-cookie rejection.
  Its fresh runtime result remains pending.

Focused units cover stale snapshots/receipts, immediate resyncRequired, late socket
callbacks, identity mismatch preservation, in-flight cleanup, pending takeover/game
ordering, lease/deadline fairness and ambiguous post-commit fences. Retained
[room](local-runtime/room-summary.json), [persistence](local-runtime/persistence-summary.json),
[architecture](local-runtime/architecture-summary.json), and [Worker](local-runtime/workers-summary.json)
regressions preserve prior contracts. The 256-command history is unfinished/censored,
not a completed game, capacity measurement or playing-strength claim.

## Source identity, independent review and failures

[Source map](local-runtime/source-map.json.gz) reconstructs all **448 tested files**
without duplicating historical source bundles. Each entry names its Git blob at
`c0d8457`, byte length and SHA-256. `identity` uses Git bytes; `crlf` decodes UTF-8
and replaces `/\r?\n/g` with CRLF; `inline` uses recorded base64. The 237 CRLF,
20 inline and 191 unchanged entries reproduce the Windows checkout. Hash sorted
path, NUL, decimal byte length, NUL and bytes to reproduce the build fingerprint.
An independent reviewer verified every blob/tree ID and reconstructed byte against
the original runtime archive. [Checksums](local-runtime/checksums.json) cover
artifact bytes. Databases/cookies/proofs are excluded. Later evidence/docs are not
retroactively part of that build.

Independent substantive and final security/browser reviews resolved expiry
ordering, stale detach callbacks, attachment deadlines, ambiguous post-commit
fences, suspension delivery, peer failures, artifact mode, copied proofs, identity
cleanup and takeover races. Evidence review requested the stronger live revoke test.

[Exploratory failures](local-runtime/exploratory-failures.json.gz) retain four
failed runtime attempts with source fingerprints: WebSocket RPC serialization
(fixed with authenticated binding-only fetch), test instrumentation serialization,
and missing offline handling. These are not accepted runs. Exploratory TypeScript
checks caught module/result-field/inference errors; a focused unit caught fencing
classification. All were corrected without weakening assertions.

[CI 34133514555](https://github.com/ariesyous/li4chess/actions/runs/34133514555)
failed the retained mixed local-game scenario: 13 ordinary moves but zero walking
actions. A legal CPU counterexample reproduces the unsafe single-corridor assumption;
the unavailable failed replay is not claimed identical to it. An initial three-pawn
replacement also exposed check and failed locally. The revised driver prepares
mobility from actual legal positions and checks walking preconditions. Exact
13 moves, two walking actions and three +20 survivor awards remain required.
No gameplay/rules changes or assertion retries were introduced.

Hosted TLS/cookies, eviction/hibernation, geographic latency, alarm punctuality,
load/quota budgets, deployment interruption, restore and rollout remain separate
gates. Local caps are not launch policies; no launch time control was selected.
