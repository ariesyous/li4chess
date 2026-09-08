# Application Worker foundation

Maintained TypeScript entry point for the actual local React game, using Workers
Static Assets. This package is separate from the M3-01 prototype. Its default
entry has no database, Durable Object or multiplayer. The explicit local
multiplayer entry below supplies authenticated private rooms; administrative
and fault controls remain exclusively in isolated test entries.
See [acceptance](../../docs/m3-02-acceptance.md) and the
[operations handoff](../../docs/m3-02-operations.md).

## Windows and CI workflow

From the repository root, using Node 24+ and pnpm **10.33.0**:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm build:workers
pnpm check:workers
pnpm --filter @li4chess/web exec playwright install chromium
pnpm test:workers
pnpm dev:workers
```

`pnpm dev` remains the fast Vite/HMR workflow at `/li4chess/`. `dev:workers`
serves the compiled Workers app on `http://127.0.0.1:8787/` with actual
Wrangler/workerd. It deliberately requires a fresh `build:workers` after source
edits, including provenance inputs such as documentation. Stop with Ctrl+C;
rebuild and start again. Set `WORKER_PORT` to another free port (1024–65535),
for example `$env:WORKER_PORT = '8788'` in PowerShell. Occupied ports fail rather
than attaching to another service. Helpers use hidden child processes on Windows.

If a host-global pnpm wrapper ignores the pinned version, use Corepack shims in
a temporary directory and put that directory first in PATH; verify `node
--version` and `pnpm --version` before running. Do not change the global wrapper.

`build:workers` shares one immutable producer identity between the frontend and
Worker, builds `/` into `apps/web/dist-workers`, and writes a private checksum
manifest in `.generated`. Default `pnpm build` and the unchanged Pages workflow
still build `/li4chess/` into `apps/web/dist`. Workers builds verify any existing
Pages output is byte-identical afterwards. Keep both outputs out of Git.

`check:workers` verifies the fresh artifact and runs Wrangler **deploy --dry-run**
for both named environment configurations, retaining bundles/logs in `.generated`.
It has no remote deployment effect. The package has no publishing command.
No Cloudflare account is needed for any command above.

## HTTP and navigation

- GET/HEAD `/api/health`: JSON service/environment identity and `ok`.
- GET/HEAD `/api/build`: JSON source revision, fingerprint, tree status and target.
  Diagnostics use `no-store`, never return request input, credentials or source.
- Unknown `/api` paths are JSON 404 even with navigation headers. Unsupported
  methods are JSON 405 with `Allow: GET, HEAD`; upgrades are rejected with 400.
- Existing assets use their Static Assets bytes and MIME types. `/`,
  `/index.html`, and extensionless navigation aliases such as `/play/local`
  load the local game. These aliases are not implemented online rooms.
- Missing `/assets/*`, file-like paths and internal/source paths return 404.
  SPA fallback never hides missing JavaScript, CSS, images or CPU Workers.

Worker-first routing and disabled automatic HTML/SPA handling are deliberate.
All requests execute this small Worker, including asset requests; hosted request
costs must account for that choice. No capacity/cost claim comes from local tests.

## Evidence and cleanup

`test:workers` requires both builds. It allocates free loopback HTTP/inspector
ports, verifies build identity during bounded readiness, then runs Playwright
HTTP and browser acceptance through workerd. It validates exact asset hashes,
real CPU turns, keyboard play, save/resume, replay checkpoint/source lineage,
missing routes, methods, navigation and phone layout. Test sources type-check in
`pnpm lint`. Existing Vite browser tests and the M3-01 integration remain separate.

Each run creates a fresh `arena-results/m3-02-<timestamp>` with source snapshot,
artifact/configuration, runtime versions, HTTP/browser observations, logs,
screenshots and replay. Set `M3_02_OUTPUT` to an unused absolute directory to
choose the location. Existing output directories reject. Do not edit source
during a run: source or artifact drift fails it. Generated runtime state is never
published in evidence. CI uploads selected evidence, not local runtime storage.

Cleanup kills only owned process trees and awaits port release. Cancellation
checks exercise interruption during startup and after readiness: Linux sends
OS SIGTERM; Windows uses IPC to invoke the registered Node SIGTERM handler,
because Node on Windows does not offer POSIX signal delivery. This does not
claim survival of forced host termination or power loss. Startup/teardown polling
only waits for lifecycle readiness; failed acceptance assertions have zero retries.

Hosted builds, routing, cache behavior, environment availability, deploy/rollback,
account settings and future storage isolation require separately authorized
verification.

## Explicit local GameRoom integration

The separate `wrangler.room.local.jsonc` registers the maintained
[`@li4chess/game-room`](../../packages/game-room/README.md) SQLite class with
placeholder local D1 bindings. Its `src/room-local.ts` supplies the same immutable
build producer as the application. Default `wrangler.jsonc`, staging/production
entry points, public fetch routes and Pages deployment are unchanged. No room
creation/gameplay endpoint is exposed by either application entry.

After `pnpm build:workers`, run `pnpm --filter @li4chess/worker check:room` for the
local bundle dry-run and fixture-isolation check. Real room behavior is exercised
by `pnpm --filter @li4chess/game-room test:integration`, using a separate test
entry/configuration. The separate M3-05 entry supplies authenticated private transport; hosted activation
needs separately authorized bindings,
environment isolation, producer compatibility and migration/restore validation.

## Explicit local authenticated multiplayer

`src/multiplayer-local.ts` and `wrangler.multiplayer.local.jsonc` are the opt-in
entry and isolated local bindings. Default Pages, staging/production and the
ordinary application entry still have no public online route. The build records
the multiplayer choice; default Worker checks reject opt-in assets. Rebuild the
ordinary target before returning to `dev:workers`, `check:workers` or deployment
preparation. No hosted activation is implied by these commands.

From the repository root, with Node 24+ and pinned pnpm 10.33.0:

```sh
pnpm --filter @li4chess/worker build:multiplayer
pnpm --filter @li4chess/worker check:multiplayer
pnpm --filter @li4chess/worker exec wrangler d1 migrations apply GAME_DB --local --config wrangler.multiplayer.local.jsonc --persist-to ../../arena-results/multiplayer-dev
pnpm --filter @li4chess/worker exec wrangler dev --local --config wrangler.multiplayer.local.jsonc --ip 127.0.0.1 --port 8790 --persist-to ../../arena-results/multiplayer-dev
```

Open `http://127.0.0.1:8790/` in four independent browser profiles/contexts. Choose
Private multiplayer, issue one guest per context, create a room and copy its
invitation into the other contexts. Each guest chooses a seat and Ready. Same
profile tabs share guest identity and observe until explicit takeover. Guest
rotation/revocation are maintained API operations; lobby UI offers revocation.
Local hotseat and CPU play remain available. Stop the foreground local process
with Ctrl+C. Rebuild after source edits; producer drift is intentionally fenced.

`ONLINE_ORIGIN` must equal the exact browser origin. The supplied one-hour guest
TTL and ten-minute/no-increment development clock are local configuration only,
not selected launch controls. Credentials are HttpOnly cookies; secondary tab
proofs live in sessionStorage. Expiry loses guest access permanently; rotation
preserves principal while advancing session and retiring old connections.
Cookie/proof bytes must never be placed in URLs or copied into evidence.

`pnpm --filter @li4chess/worker test:multiplayer` runs real workerd SQLite/D1 and
independent Chromium contexts. Set `M3_05_OUTPUT` to a fresh absolute directory;
existing directories reject. It records versions, source/asset identity, local
configuration and observations. It includes genuine lost HTTP responses, copied
tabs, takeover, expiry, refresh during a real D1 rollback and server alarm recovery.
The rollback trigger is test-owned SQL outside deployable entry points. Runtime
databases and credential cookies are never uploaded by CI. Owned process cleanup
uses the existing tested Worker lifecycle helper and awaits port release.

See [acceptance](../../docs/m3-05-acceptance.md),
[wire contract](../../docs/multiplayer-v1.md) and
[M3-06 handoff](../../docs/m3-06-handoff.md). Hosted TLS, resources, quotas,
geographic behavior and rollout remain separately authorized gates.

## M3-06 four-browser campaign

After the multiplayer build, `pnpm --filter @li4chess/worker test:campaign` runs
ordinary complete Modern games through four independently authenticated Chromium
contexts, all-seat interruption/takeover checks, labeled source-linked checkpoint
endings, exact canonical/replay audits, whole-runtime restart boundaries, D1
rollback, clock/disconnect deadlines and explicit unrecoverable incidents.
`M3_06_OUTPUT` must name a fresh absolute directory. `M3_06_CASES` optionally
selects comma-separated `ordinary,endings,recovery,clocks,incidents,auth` for
focused debugging; selected groups are recorded and partial runs are not full
acceptance. CI runs all groups, with zero assertion retries.

Only root evidence files are eligible for retention. Nested runtime directories
contain isolated SQLite databases and ephemeral fixture configurations and must
never be archived or uploaded. The sanitized configuration, producer/source map,
canonical commands, replays, observations and failure summary live at the root.
`test/campaign-worker.ts` alone contains fixture credentials, time/fault controls
and administration. Deployable bundle checks forbid those identifiers. Fixture
class construction supplies generic authority ports; public requests cannot do so.
Test clock configuration does not select launch policy. Local process restart
does not establish hosted eviction, hibernation or coordinated restore behavior.

## M3-07 completed replay retrieval/export

The opt-in multiplayer result screen offers **Download replay**. Current member
cookies authorize paged canonical retrieval without a controller proof or takeover.
Ordinary terminal games and opening aborts export replay-v2 with original producer,
source lineage, exact result and recorded randomness. Local import uses the existing
validated reader. Incomplete/incompatible/divergent/unavailable histories return
explicit failures. See the [wire contract](../../docs/multiplayer-v1.md#completed-private-replay-retrieval-m3-07)
for the 32 MB artifact ceiling, ten-minute disposable continuations and retry rules.

After `build:multiplayer`, `pnpm --filter @li4chess/worker test:replay` exercises
member/observer/rotation reads, interrupted downloads, restart, persistence-read
faults, corrupt records and fixture-simulated serving-producer changes. Set
`M3_07_OUTPUT` to a fresh absolute output directory. Existing `test:campaign` now
also verifies all four downloads and local import for every audited terminal history,
including ordinary and walking games and labeled source-linked endings. CI retains
only sanitized root artifacts, never runtime databases. New fault/identity controls
remain in the isolated campaign entry and are excluded by deployable bundle checks.

M3-08 adds `pnpm --filter @li4chess/worker test:rematch` (fresh output via
`M3_08_OUTPUT`) for authenticated rematches and creation recovery. Its isolated
campaign administration is excluded by `check:multiplayer`; no hosted activation
is implied. See [acceptance](../../docs/m3-08-acceptance.md).
