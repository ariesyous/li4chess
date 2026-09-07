# M3-02 acceptance plan

Declared 2026-09-06 before behavior changes. Scope is the Workers deployment
foundation in the accepted [M3-01 ADR](m3-01-adr.md), stopping before M3-03.
Fetched remote baseline: `52dfe1b2ea02adb0e76ed17b40450d5a46d3e4b4`.
[PR #12](https://github.com/ariesyous/li4chess/pull/12) is open; its final-head
[CI](https://github.com/ariesyous/li4chess/actions/runs/34063186380) passed.
`codex/m3-02-workers-foundation` starts there and targets the M3-01 branch in a
stacked draft PR. Do not merge the dependency or include its diff in this slice.

## Routing and build decisions

- A maintained `apps/worker` TypeScript package serves the actual React build via
  an ASSETS binding. No architecture-spike imports, fixture keys, fault/admin
  routes, D1, Durable Objects, credentials, or multiplayer implementation.
- Pages remains the default Vite build at `/li4chess/` in `apps/web/dist`.
  Explicit Workers mode builds `/` in `apps/web/dist-workers`; neither output
  overwrites the other. The existing Pages workflow remains byte-for-byte intact.
- Worker-first routing with asset HTML/fallback handling disabled makes the HTTP
  contract explicit: GET/HEAD `/api/health` and `/api/build` return bounded JSON;
  unknown `/api` routes return JSON 404, unsupported methods 405 with Allow.
  Upgrades reject. Query/header/body input is never echoed in diagnostics.
- GET/HEAD `/`, `/index.html`, and extensionless application navigation paths
  serve the same shell. Missing `/assets/*`, file-like paths, and internal/source
  paths return 404 even for browser navigation. Unsupported methods never serve
  HTML. Existing assets use actual Static Assets responses and MIME types.
- One generated build identity is shared by Worker diagnostics and the Workers
  frontend; asset hashes and source identity are retained outside public assets.
  Production replay-v2/state-v2 provenance and local save branching remain intact.

## Required local evidence

| Gate | Required observation |
| --- | --- |
| Runtime HTTP | Actual Wrangler/workerd, status/method/HEAD/content-type contract, API misses including navigation/upgrade requests, no diagnostic input reflection, static bytes/hashes, shell refresh, missing files |
| Browser | Actual bundled app through Worker, JS/CSS and dedicated CPU Worker loaded, real human/CPU moves, keyboard board interaction, save/refresh/resume, replay export/import with verified producer/source lineage |
| Build isolation | Pages `/li4chess/` and Workers `/` outputs both verified; Workers build leaves Pages bytes intact; dry-run both named environment configurations |
| Harness | Windows and CI commands; loopback, explicit free ports, bounded readiness, fresh evidence output, reliable owned-process cleanup, no retries of failed assertions |
| Regression | Frozen install, lint (including changed tests), unit tests, build, all existing web browser tests, M3-01 integration, new runtime/browser checks |
| Review/CI | Fresh substantive and final independent reviewers, findings resolved, human-authored commits, pushed draft PR, passing CI for final pushed revision |

Record revision or dirty-tree digest, Node/pnpm/Wrangler/workerd/browser versions,
commands, runtime config, observations and limitations in fresh M3-02 evidence.
Do not edit source during accepted evidence runs. Do not weaken assertions or
add retries to conceal failures. Preserve old evidence and frozen classic code.

## Repository completion versus hosted gates

M3-02 completes when the above local/repository gates pass and the operational
handoff defines exact later GitHub Builds setup, separate environments, artifact
identity, CI promotion and rollback. Current official Cloudflare documentation
must support platform-dependent choices with a review date.

No account connection, remote build setup, provisioning, live secrets, plan
selection, publication or deployment is authorized. Local dry-run is not hosted
verification. GitHub Builds activation, names/domains/account settings, hosted
asset/cache behavior, deployment/rollback and observability are later separately
authorized gates. M3 remains incomplete. M3-03 owns normalized migrations,
transaction fencing, bounded event/checkpoint reconstruction and retention design;
no persistence model is implemented here.
