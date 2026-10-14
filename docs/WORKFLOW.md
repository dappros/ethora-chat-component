# Workflow: branches, commits, local CI, releases

This repository publishes `@ethora/chat-component` to npm.

## Branches

Two long-lived branches:

- `main`: released code. Every npm release is cut from here.
- `dev`: integration. Work lands here first.

Work branches use `<type>/<name>`, where `<name>` is lowercase words joined by hyphens:

| Type | Use |
|---|---|
| `feat/` | new functionality |
| `fix/` | bug fix |
| `hotfix/` | urgent fix; still goes through `dev` |
| `chore/` | tooling, dependencies, release plumbing |
| `docs/` | documentation only |
| `refactor/` | code change without behaviour change |
| `test/` | tests only |
| `perf/` | performance |
| `ci/` | CI configuration |
| `build/` | build system |
| `revert/` | revert of an earlier change |

Examples: `feat/room-search`, `fix/unread-counter-reset`, `chore/release-flow`.

Release lines are named with four digits, `YYMM` (for example `2610`). Other names are not allowed for new branches.

Branches that already exist are not renamed. The naming rule applies when a new branch is first pushed.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`.

Keep each fix in its own commit. Do not mix a fix with a refactor or a feature.

## Flow

1. Start from `dev`: `git switch -c feat/room-search dev`
2. Commit on the work branch.
3. Merge into `dev` locally: `git switch dev && git merge --no-ff feat/room-search`
4. Push: `git push origin dev`. The `pre-push` hook runs `npm run ci:local` first and aborts the push if it fails.
5. When `dev` is ready for release: `git switch main && git merge --no-ff dev && git push origin main`. The server CI (GitHub Actions) runs on the push to `main`.
6. Release from `main` (see below).

Do not merge pull requests into `dev` from the GitHub web UI. The local gate in step 4 is what protects `dev`, and it does not run for web merges.

Set up the hooks once per clone with `npm install`. This sets `core.hooksPath` to `.githooks/`.

## Local CI

```bash
npm run ci:local
```

Runs lint, tests, the release-script checks and the build. The same checks run on the server after the merge to `main`.

## Versions and releases

Versions are the UTC date written as `yy.m.d` with no leading zeros, for example `26.10.14`. npm rejects `26.10.01`.

- If today's version is newer than the latest version on npm, the release uses today's date.
- If today's version is not newer (a second release on the same day), the release uses the next day: `26.9.26` becomes `26.9.27`.
- Future dates are allowed.

Tags are `v` plus the version, for example `v26.10.14`.

Plan a release (changes nothing):

```bash
npm run release
```

Cut a release from `main` (commit and tag locally):

```bash
npm run release -- --yes
```

Cut and publish in one step (the tag push starts the publish workflow):

```bash
npm run release -- --yes --push
```

Or run the **Release** workflow by hand in GitHub Actions (Actions > Release > Run workflow). It bumps and tags `main`, then publishes.

The publish job checks that the tag matches `package.json`, that the version is not on npm yet, that it is newer than the latest version, and that the tag points at `origin/main`.

Publishing uses the `npm-release` environment. Add required reviewers there if you want a manual approval step.
