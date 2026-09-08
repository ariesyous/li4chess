# L1: polished local/CPU GitHub Pages checkpoint after UI1

Accepted direction: 2026-09-08, D14 in [project state](project-state.md).
This is L1 in the [roadmap](../ROADMAP.md), following the bounded
[Lichess-style UI sprint](ui-sprint-lichess.md). It replaces the custom-domain
launch plan. Cloudflare, li4chess.org launch and hosted multiplayer are shelved.

Deliver a polished standalone browser game at the existing
[GitHub Pages project site](https://ariesyous.github.io/li4chess/), with human
players sharing one device and optional CPU seats. Preserve completed local
multiplayer and all rules/bot/replay evidence. There is no scheduled hosted follow-up.

## Release work and completion evidence

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

This documentation task does not deploy or tag anything. L1 is a bounded release
checkpoint, not a claim that the game can never improve. Afterwards, focus on bug
fixes and occasional feedback without a promised feature schedule. The preserved
[hosted multiplayer handoff](m3-hosted-handoff.md) requires a new maintainer scope
decision before resuming.
