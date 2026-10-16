#!/usr/bin/env node
// Publish to npm from your own machine, for when the Release workflow is not
// available. The normal path is the Release workflow (a tag or a manual run),
// which also attaches npm provenance. Provenance needs GitHub OIDC, so this
// local path publishes without it.
//
//   npm run release -- --yes            1. bump, commit and tag v<version> locally
//   npm run publish:npm                 2. checks everything, then publishes
//   npm run publish:npm -- --dry-run    checks everything, publishes nothing
//
// Before publishing, this checks: you are logged in to npm (npm login), the
// working tree is clean, HEAD is the commit tagged v<package.json version>, the
// version is not on npm yet, and it is newer than the latest published one.
// Then it runs the local CI and the consumer smoke test.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkExplicit, latestOf } from './lib/version.mjs';

const dryRun = process.argv.includes('--dry-run');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const { name, version } = pkg;
const tag = `v${version}`;

function fail(message) {
  console.error(`publish:npm: ${message}`);
  process.exit(1);
}

function out(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// Runs a command with the terminal attached (so npm can ask for a one-time code).
function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) fail(`"${cmd} ${args.join(' ')}" failed`);
}

// 1. logged in to npm
let who;
try {
  who = out('npm', ['whoami']);
} catch {
  fail('you are not logged in to npm. Run "npm login" first');
}
console.log(`npm user: ${who}`);

// 2. clean working tree
if (out('git', ['status', '--porcelain']) !== '') {
  fail('the working tree has changes. Commit or stash them first');
}

// 3. HEAD is the commit tagged for this version
let tagCommit;
try {
  tagCommit = out('git', ['rev-parse', '--verify', '-q', `${tag}^{commit}`]);
} catch {
  fail(`tag ${tag} does not exist. Run "npm run release -- --yes" first`);
}
const head = out('git', ['rev-parse', 'HEAD']);
if (tagCommit !== head) {
  fail(`${tag} points at ${tagCommit.slice(0, 8)}, but HEAD is ${head.slice(0, 8)}. Tag the commit you are publishing`);
}

// 4 and 5. version is new and newer than what is on npm
let published = [];
try {
  const list = JSON.parse(out('npm', ['view', name, 'versions', '--json']) || '[]');
  published = Array.isArray(list) ? list : [list];
} catch (err) {
  if (!String(err.stderr || '').includes('E404')) {
    fail(`cannot read ${name} from npm: ${String(err.stderr || err.message).trim()}`);
  }
}
const check = checkExplicit(version, published);
if (check.error) fail(check.error);
const latest = latestOf(published);
console.log(`publishing ${name}@${version} (latest on npm: ${latest ? latest.join('.') : 'none'})`);

// 6. the same checks CI runs, plus the consumer smoke test
run('npm', ['run', 'ci:local']);
run('bash', ['scripts/consumer-smoke.sh', '18']);

// 7. publish. No --provenance here: it needs GitHub OIDC, which only CI has.
const publishArgs = ['publish', '--access', 'public'];
if (dryRun) publishArgs.push('--dry-run');
console.log(dryRun ? 'dry run: nothing will be uploaded' : 'publishing now');
run('npm', publishArgs);

if (!dryRun) {
  console.log(`published ${name}@${version}. Push the commit and the tag: git push origin HEAD && git push origin ${tag}`);
}
