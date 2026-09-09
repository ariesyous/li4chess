# L1 local/CPU GitHub Pages release

This document is the durable release-note and operations companion for the
tagged L1 checkpoint. Exact tag, commit, CI, deployment and hosted-review links
are recorded in the GitHub release, which is the authoritative publication
record for the immutable tag.

## What is released

- Anonymous four-player standard-FFA chess in one browser tab: hotseat humans,
  any mix of humans and bounded CPU seats, or four automatic CPU seats.
- Responsive board and controls, keyboard input, optional player-relative board
  rotation, visible move/points history, and owner letters off by default.
- Browser-local autosave/resume plus portable validated replay-v2 export/import.
  Start a new game only when ready to replace the one browser-local save.
- Licensed four-army Cburnett piece assets; source and attribution remain in
  [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Known limitations

- This is local-only play. Players share one device; CPUs run in the browser.
  GitHub Pages does not activate private multiplayer, accounts, matchmaking,
  ratings, clocks or remote opponents.
- Saves are local to the browser profile and can be unavailable or cleared by
  browser settings. Export a replay-v2 file for a portable backup.
- The CPUs use fixed time/node budgets, not ratings. Some late king-and-pawn
  positions can shuffle for a long time; this release makes no strength claim.
- Hosted review uses desktop and browser mobile emulation; it is not a claim of
  physical-device, Safari/Firefox, or screen-reader testing.

## Update and rollback

The real workflow is [Deploy to GitHub Pages](../.github/workflows/deploy-pages.yml):
it builds `apps/web/dist` with the Vite `/li4chess/` base and deploys on every
push to `main`, or when manually dispatched. Creating a Git tag or GitHub release
does **not** deploy Pages.

To update: validate the candidate with `pnpm lint`, `pnpm test`, `pnpm build`,
and `pnpm --filter @li4chess/web test:e2e`; merge or fast-forward the verified
commit to `main`; wait for both CI and the Pages workflow to succeed; then load
`https://ariesyous.github.io/li4chess/` and check assets and a local CPU turn.

To roll back: identify a known-good commit or immutable release tag, create a
revert commit (preferred, preserving history) or deliberately fast-forward
`main` to that known-good commit if repository policy permits it; push `main` or
manually dispatch the Pages workflow for that revision; wait for the new Pages
deployment to succeed; then verify the live URL. Do not treat a tag operation as
a rollback deployment.
