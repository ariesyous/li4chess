# L1: local/CPU launch on li4chess.org after UI1

Accepted direction: 2026-09-08. This is L1 in the [roadmap](../ROADMAP.md).
The [Lichess-style UI sprint](ui-sprint-lichess.md) precedes this launch.
The maintainer reports owning the domain in their Cloudflare account. Account
configuration and hosted application state have not been inspected in this task.

Publish the existing local/CPU browser game with minimal ongoing maintenance.
Keep this a small delivery task; private multiplayer already exists locally and
does not need to be activated to launch. No account system, matchmaking, ratings,
D1 or Durable Object provisioning is required for L1.

1. Pull/check the current main revision and its CI before implementation. The
   documentation reset started from PR #19 merge 9a49a80. Preserve the completed
   rules, CPU, replay and multiplayer evidence; do not treat historical checks
   as validation of a new release.
2. Keep the [GitHub Pages workflow](../.github/workflows/deploy-pages.yml).
   Configure the custom domain and HTTPS in GitHub Pages and DNS in Cloudflare;
   adapt the current Vite /li4chess/ asset base to / for the custom-domain build.
   Keep private multiplayer disabled. Workers hosting remains an optional later
   choice, not a launch dependency.
3. Prepare concrete deployment settings and inspect necessary GitHub/domain
   configuration. Reuse the existing accounts and Pages workflow. Resolve
   access or spending decisions only when needed; prepare reviewable changes
   before requesting any outstanding deployment authorization.
4. Check the actual HTTPS domain on desktop and phone: start and finish games,
   CPU responsiveness, refresh/resume, replay export/import, asset paths and clear
   local/CPU-only descriptions. Explain that browser saves are local; a save on
   the old Pages origin does not automatically appear on the new domain. Replay
   export/import provides a portable transfer path.
5. Record the deployed revision, actual checks, operating limits and a concise
   update/rollback procedure. Verify Pages works through the new domain.
   Mark L1 complete only with hosted evidence. Ongoing work should focus on bugs
   and occasional feedback, with no promised feature schedule.

Run repository-required checks for any code or browser changes and the applicable
hosting checks. Worker checks apply if Worker behavior changes. This documentation task does not deploy anything.
The separate [hosted multiplayer handoff](m3-hosted-handoff.md) is deferred until
after L1, if friend-invite play is pursued.
