# AGENTS.md

- Use the latest versions of npm packages when adding dependencies.
- Never use emojis in code, comments, documentation, or commit messages.
- When making user-facing changes, update all relevant documentation: web app docs, CLI command references, READMEs, and SKILL files.
- Use `<table>` HTML elements instead of markdown tables in `.mdx` files in the docs app.
- Never use `--` as punctuation. Use emdashes sparingly, defaulting to commas and periods.
- Always run `pnpm type-check` at the end of each agent turn to catch type errors early.

## Release process

Changesets are created in their own dedicated PRs, separate from feature or bug-fix PRs. A feature PR should contain only the code changes. After it merges, open a follow-up PR that adds the changeset.

1. Run `pnpm changeset` and select the packages that changed. Both `@webreel/core` and `webreel` are in a fixed versioning group, so a changeset for either bumps both.
2. Commit the generated changeset file in a standalone PR and merge it to `main`.
3. The **Release** GitHub Action (`changesets/action`) will open a "chore: version packages" PR that bumps versions, updates `CHANGELOG.md` files, and updates the lockfile.
4. Merge that PR. The action will then publish to npm (using `pnpm ci:publish`, which resolves `workspace:*`) and create GitHub releases.
5. Always use `pnpm publish` (or `changeset publish`) instead of `npm publish`. `npm publish` does not resolve the pnpm `workspace:*` protocol and will publish broken packages.
6. The docs site changelog page at `/changelog` reads from `packages/webreel/CHANGELOG.md` at build time. It updates automatically on the next Vercel deploy after the version PR is merged.
7. An `NPM_TOKEN` secret must be configured in the GitHub repo settings for automated publishing to work.
