# L1: polished local/CPU GitHub Pages checkpoint

Accepted direction: 2026-09-08, D14 in [project state](project-state.md).
This is L1 in the [roadmap](../ROADMAP.md), following the bounded
[Lichess-style UI sprint](ui-sprint-lichess.md). It replaces the custom-domain
launch plan. Cloudflare, li4chess.org launch and hosted multiplayer are shelved.

Deliver a polished standalone browser game at the existing
[GitHub Pages project site](https://ariesyous.github.io/li4chess/), with human
players sharing one device and optional CPU seats. Preserve completed local
multiplayer and all rules/bot/replay evidence. There is no scheduled hosted follow-up.

## Completed release work and completion evidence

UI1 was published through [PR #20](https://github.com/ariesyous/li4chess/pull/20).
The owner-letter default follow-up, [PR #21](https://github.com/ariesyous/li4chess/pull/21),
landed at `88eff78`; its [CI](https://github.com/ariesyous/li4chess/actions/runs/34275820654)
and [Pages deployment](https://github.com/ariesyous/li4chess/actions/runs/34275820649)
passed. The hosted site loaded under `/li4chess/` with assets, CPU Worker play,
owner letters off by default, responsive controls, local save/resume, and replay
export. The release candidate also corrects the setup recovery copy: it no longer
claims a save exists before one has been created.

Hosted review on 2026-09-09 at that deployed `88eff78` baseline used Chromium
desktop and a 360 × 800 browser emulation (not a physical phone). It completed
a four-CPU level-1 game in 177 moves and rendered eliminations, the points ledger
and final places; completed a hotseat rotation; completed human/CPU turn
scheduling; reset/cancelled a local game; refreshed and resumed a saved game;
exported a replay; and imported the validated terminal hotseat fixture, rendering
the threefold-draw result. The mobile layout kept a 337 px board within a 345 px
document width and a 317 px Start Game control within the 360 px viewport. The
final release deployment rechecks the only candidate change—the recovery wording—
alongside asset and CPU-Worker loading.

The tagged release's exact commit, final CI and Pages run links, and hosted review
record are published in its GitHub release. [L1 release notes](l1-release.md)
define the product boundary, known limitations and repeatable Pages procedure.

1. Verify the current main revision, working tree and CI before implementation.
   Preserve existing work; historical acceptance does not validate a new release.
   Confirm UI1's visual, accessibility and asset-provenance criteria are complete.
2. Review setup, ordinary play, CPU turns, saving/resuming, replay import/export
   and results on desktop and mobile layouts. Include hotseat, mixed human/CPU
   and four-CPU play, cancellation/reset, checked and eliminated armies, and
   walking kings. Fix concrete usability/reliability defects found in this review.
   Further bot research stays outside scope unless a serious defect requires it;
   document remaining limitations, including endgame shuffling, honestly.
3. Keep the [Pages workflow](../.github/workflows/deploy-pages.yml),
   apps/web/dist output and Vite /li4chess/ base. Keep private multiplayer disabled
   in this build. No custom domain, DNS migration, Workers deployment or storage
   provisioning is required. Describe actual local/CPU capabilities in the app
   and README, including browser-local saves and portable replay backups.
4. Run pnpm lint, pnpm test, pnpm build and
   pnpm --filter @li4chess/web test:e2e on the release candidate. Inspect visual
   results and record the revision, environment, actual checks and limitations.
   Run affected Worker/multiplayer checks if shared behavior changes.
5. Verify the candidate's CI and actual Pages HTTPS deployment at /li4chess/.
   Check asset and CPU Worker loading, complete games, responsive controls,
   refresh/resume and replay export/import on desktop/mobile. Distinguish local
   browser evidence, hosted checks, emulation and physical-device testing.
6. Record the deployed commit, Pages workflow run, release tag and release notes
   with known limitations. Document repeatable update and rollback steps against
   the actual workflow: it deploys on main pushes or manual dispatch. Explain how
   to restore a known-good revision and verify its resulting deployment; do not
   imply that creating a tag deploys it. Mark L1 complete only with this evidence.

L1 is a bounded release checkpoint, not a claim that the game can never improve.
Afterwards, focus on bug fixes and occasional feedback without a promised feature
schedule. The preserved [hosted multiplayer handoff](m3-hosted-handoff.md)
requires a new maintainer scope decision before resuming.
