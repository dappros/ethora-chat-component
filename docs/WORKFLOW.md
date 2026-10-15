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

Runs lint, tests, the release-script checks and the build. The server CI runs the same checks after the merge to `main`, plus the consumer smoke test (React 18 and 19). The consumer smoke test is not part of `ci:local` because it is slower.

## Versions and releases

Versions are dates written as `yy.m.d` with no leading zeros, for example `26.10.2`. npm rejects `26.10.02`.

- Without an explicit version, the release is the day after the current version: `26.10.1` becomes `26.10.2`. Today's date does not matter, so versions can trail the calendar.
- Pass an explicit version to choose another one: `npm run release -- 26.10.20`. It must be new on npm and newer than the latest version.
- Only when nothing is published yet is today's date used.
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

## Server CI

Runs on the push to `main` (and on demand):

- **verify**: lint, tests, the release-script rules, build.
- **consumer-smoke**: packs the package, installs the tarball into a clean project with React 18 and 19, and type-checks the documented import. It catches a package that ships without types or with a broken `exports` map.
- **secret-scan** (gitleaks): off until the repository variable `SECRET_SCAN` is set to `true`. Turn it on only after the tracked credentials are removed and an allowlist for the app token is agreed.

## Publish from your own machine

If the Release workflow is not available, you can publish by hand:

```bash
npm login                          # once, with an account that can publish @ethora/chat-component
npm run release -- --yes           # bump, commit and tag v<version> locally
npm run publish:npm -- --dry-run   # checks everything, uploads nothing
npm run publish:npm                # checks everything, then publishes
git push origin HEAD && git push origin v<version>
```

`publish:npm` refuses to run unless you are logged in, the working tree is clean, HEAD is the commit tagged `v<version>`, the version is new and newer than the latest on npm. It then runs `ci:local` and the consumer smoke test. npm may ask for a one-time code (2FA).

A manual publish has no npm provenance, because provenance needs GitHub OIDC. Prefer the Release workflow for releases that matter.

## Consumers of the local checkout

`ethora-install-shared` builds this package from a local checkout (`deploy/scripts/setup-node-services.sh`). It runs `npm run build:lib` in this directory and then checks that `dist/main.d.ts` exists. Keep `build:lib` working. It is an alias of `build`, and `build` must keep producing `dist/` with the type declarations.
