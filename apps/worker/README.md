# Application Worker foundation

Maintained TypeScript entry point for the actual local React game, using Workers
Static Assets. This package is separate from the M3-01 prototype. It has no
database, Durable Object, credential, administrative endpoint or multiplayer.
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
verification. M3-03 persistence is the next slice.
