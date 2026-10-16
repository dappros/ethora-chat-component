#!/usr/bin/env node
// Starts the Release workflow on GitHub Actions. No npm login is needed on this
// machine: the publish runs in CI with the NPM_TOKEN secret. Needs the GitHub CLI
// (gh), logged in with write access to the repository.
//
//   npm run release:ci              next version (the day after the current one)
//   npm run release:ci -- 26.10.20  an explicit version
import { spawnSync } from 'node:child_process';
import { parseVersion } from './lib/version.mjs';

const REPO = 'dappros/ethora-chat-component';
const version = process.argv[2];

if (version !== undefined && parseVersion(version).error) {
  console.error(`release:ci: ${parseVersion(version).error}`);
  process.exit(1);
}

const args = ['workflow', 'run', 'release.yml', '--repo', REPO];
if (version) args.push('-f', `version=${version}`);

const result = spawnSync('gh', args, { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`Started the Release workflow on ${REPO}.`);
console.log(`Follow it with: gh run list --repo ${REPO} --workflow release.yml`);
