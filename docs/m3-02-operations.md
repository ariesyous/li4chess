# M3-02 Workers operations handoff

Reviewed **2026-09-06**. This is repository configuration and a proposed later
activation procedure under the [accepted ADR](m3-01-adr.md). No Cloudflare
account, Git connection, build trigger, resource, secret, route, paid plan,
upload or deployment was created. Local workerd and Wrangler dry runs cannot
verify account settings or hosted behavior. Results belong in the
[M3-02 acceptance evidence](m3-02-evidence/README.md).

## Repository boundary

The maintained application entry point is `apps/worker`, configured by
`apps/worker/wrangler.jsonc`. Its Static Assets directory is
`apps/web/dist-workers`; the React build uses `/` as its base. The existing
Pages workflow still builds `apps/web/dist` with `/li4chess/` and publishes
only that directory. Workers output must never replace the Pages artifact.
Neither application bundle imports the architecture spike's credentials,
administrative routes, fault injection or recovery hooks.

The local Worker has a small read-only HTTP surface and serves the existing
single-browser game. D1, Durable Objects, clocks, credentials, online rooms and
multiplayer are absent. Separate `staging` and `production` configurations are
future deployment targets, not evidence that hosted environments exist. The
resolved names are `li4chess-staging` and `li4chess-production`; the default is
`li4chess-local`. Compatibility is pinned to `2026-09-01`.

Repository policy disables `workers_dev` and `preview_urls` explicitly and
provides no public routes. Keep both flags in version control: dashboard-only
changes can be overwritten by subsequent Wrangler deployments. A later hostname
requires an authorized configuration change and hosted checks; a successful
local server or dry run supplies no public endpoint.
[Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

## Proposed GitHub Builds settings

These values are a setup checklist for a separately authorized operator. They
are not instructions to activate hosting as part of M3-02.

| Setting | Later value / requirement |
| --- | --- |
| Repository | `ariesyous/li4chess`; restrict GitHub installation access to this repository. |
| Root directory | `/` (repository root), where `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and root `package.json` live. |
| Build variables | `NODE_VERSION=24.18.0`, `PNPM_VERSION=10.33.0`, `SKIP_DEPENDENCY_INSTALL=1`, `WRANGLER_SEND_METRICS=false`. Record actual versions from every hosted build log. |
| Build command | `pnpm install --frozen-lockfile && pnpm build:workers` |
| Wrangler configuration | Always pass `--config apps/worker/wrangler.jsonc`; do not permit automatic framework configuration or config discovery to select the spike. |
| Staging deployment command | `pnpm exec wrangler deploy --config apps/worker/wrangler.jsonc --env staging` |
| Production deployment command | `pnpm exec wrangler deploy --config apps/worker/wrangler.jsonc --env production` |
| Branch selection | Initially keep build triggers disconnected. At activation, select an explicitly approved promotion branch for each environment and record its exact name. Do not connect this feature branch as production. |
| Non-production branch builds | Disabled initially for both environment Workers. Enabling previews is a separate decision; do not accept dashboard defaults implicitly. |
| Build watch paths | Initially watch the entire repository, including shared packages, lockfile, build scripts and provenance inputs. Narrowing to `apps/worker/**` alone misses frontend, engine and protocol changes. |
| Runtime variables / secrets | `APP_ENV=staging` / `APP_ENV=production`, declared in the matching config; no live secrets or database bindings. Build variables are not runtime bindings. |
| Public entry points | No routes, `workers_dev=false`, `preview_urls=false` until separately reviewed activation. |

The build image documents `NODE_VERSION`, `PNPM_VERSION` and an option to skip
automatic dependency installation. Explicit installation above enforces the
frozen lockfile instead of relying on platform defaults.
[Build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).

Builds has distinct build and deploy fields; Wrangler's custom-build stanza
does not substitute for the dashboard build field. The root is intentionally
the monorepo root and the deploy command supplies the nested config path.
Confirm that exact combination in the first authorized hosted build.
[Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Create or identify each environment Worker only after authorization, then
connect the repository separately to each one. The dashboard Worker name must
match the name resolved by the selected Wrangler environment; copying commands
without `--env` could address the default Worker. The documented environment
workflow uses `--env` in both deploy command fields. Our explicit root/config
choice differs from the monorepo quickstart's directory-next-to-config example,
so retain both flags rather than using the dashboard's bare deploy default.
[Builds overview](https://developers.cloudflare.com/workers/ci-cd/builds/),
[environment and monorepo setup](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/).

If a future preview workflow is approved, its non-production command must select
the same intended environment explicitly, for example
`pnpm exec wrangler versions upload --config apps/worker/wrangler.jsonc --env staging`.
`versions upload` still uploads to Cloudflare; it is not a local validation
command. It creates a version without making it the active deployment, whereas
`deploy` uploads and activates. Disabled preview URLs provide no browsing URL.
Later Durable Object Workers do not receive ordinary preview URLs; a branch
preview must not be mistaken for isolated staging storage.
[Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Environment names separate Workers. Future storage bindings must also be
explicitly separated per environment; bindings and variables do not all inherit
from the top level. M3-03 must not silently bind staging to production D1.
[Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/).

## Identity, runtime and release gate

Node 24 runs installation, Vite and tooling; the deployed request handler runs
on workerd. Keep the configuration's compatibility date pinned and retest date
changes. Node-only `@li4chess/protocol/node` may run during the build to derive
the actual Git revision and source fingerprint; it must not enter the runtime
bundle. The existing producer contract includes package versions and dirty-tree
identity, so a revision alone does not identify an uncommitted local build.

Before activation, retain the exact source commit, source fingerprint, lockfile,
tool versions, selected environment, resolved config, frontend asset checksums
and Worker bundle checksums. After an authorized upload, also retain the
Cloudflare version ID, deployment ID and Builds log URL. Compare the served
build response and replay producer against the retained artifact. The public
health response is bounded identification, not an administrative inspection API.

The workspace commands `pnpm build:workers`, `pnpm dev:workers`,
`pnpm test:workers` and `pnpm check:workers` build, serve locally, exercise the
real runtime/browser, and perform local deployment dry runs respectively. Run
them from the repository root with the pinned package manager. The last command
must retain `--dry-run`; none of these commands is hosted activation. Run
`pnpm build` and the existing web browser suite separately for the Pages build.

The repository CI gate must pass lint, units, both frontend output builds,
existing browser regression, architecture integration, Worker HTTP/runtime
acceptance, Worker browser acceptance and environment dry runs. Check the exact
final pushed revision. Builds reacts to Git events; this document does not
claim it waits for external GitHub checks. Before enabling automatic activation,
the operator must establish and verify protected promotion/required checks or
another explicit approval gate that prevents an unverified revision deploying.

No Cloudflare credentials belong in current GitHub CI. Account-owned choices
remain unavailable: account and zone IDs, GitHub installation grants, selected
Worker names' availability, build-token permissions, branch protection and
promotion policy, hostname/DNS/TLS, observability retention, quotas and plan.
The ADR's budget and hosted reliability gates still apply. Repository dry runs
cannot validate any of those settings.

## Routing and rollback checks after authorization

Wrangler can run the actual Worker and assets locally, but hosted rollout and
edge behavior require separate evidence. On an authorized staging endpoint,
repeat health methods, unknown API navigation, missing JS/CSS/CPU assets,
refresh/deep navigation, browser CPU turns, save/resume and replay producer
checks. Explicit Worker-first routing ensures application HTTP policy runs
before asset fallback. Cloudflare's built-in SPA routing can otherwise prioritize
navigation requests; preserve the tested configuration when changing routing.
[Worker routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/),
[SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/).

Retain a known-good uploaded version and rehearse rollback in isolated staging
before production activation. Later rollback selects an explicit version ID,
for example `pnpm exec wrangler rollback VERSION_ID --config apps/worker/wrangler.jsonc --env staging`.
This command is remote and must not run during M3-02. Verify HTML, JS, CSS,
CPU Worker bytes and build identity after rollback; record versions before and
after. Static Assets are deployed with the Worker and versioned together.
[Static Assets](https://developers.cloudflare.com/workers/static-assets/).

Rollback immediately changes the active deployment. It does not restore
connected data, and resource or Durable Object class lifecycle changes can
prevent rollback. Cloudflare currently limits rollback to the 100 most recently
published versions. Recheck these restrictions when activating hosting.
[Rollback documentation](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

The foundation has no server-side game persistence to migrate. Browser saves
remain origin-scoped: opening a different future Workers origin will not move
the Pages origin's local save automatically; replay export/import is the
existing portable path. Later active online games require the ADR's compatible
reader/drain-or-branch producer policy, coordinated storage restore and admission
suspension. M3-03 should design normalized migrations, head fencing, receipts,
incremental replay reconstruction and retention under that policy; implementing
them is outside M3-02.
