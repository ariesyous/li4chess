# Repository conventions

- Use the repository's configured human Git identity for commits. Do not substitute an AI provider's name or email as author or committer.
- Do not add AI co-author trailers, generated-by footers, or agent session links to commits or pull request descriptions.
- Keep the frozen classic bot and historical experiment artifacts intact. Label new measurements with their code version and environment; do not present historical timings as current performance.
- Validate code changes with `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm --filter @li4chess/web test:e2e` when browser behavior is affected. CI runs all four.
