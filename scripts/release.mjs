#!/usr/bin/env node
// Release helper. Version rules are in scripts/lib/version.mjs.
//
//   npm run release                    show the next version, change nothing
//   npm run release -- 26.10.20        show the plan for an explicit version
//   npm run release -- --yes           bump package.json, commit, tag v<version> (local only)
//   npm run release -- --yes --push    also push main and the tag; the tag push publishes
//   node scripts/release.mjs verify v26.10.14
//                                      run by CI before publishing: tag, version, npm, origin/main
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkExplicit, latestOf, nextVersion, parseVersion } from './lib/version.mjs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const { name } = pkg;

function sh(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

const git = (...args) => sh('git', args);

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function publishedVersions() {
  try {
    const list = JSON.parse(sh('npm', ['view', name, 'versions', '--json']) || '[]');
    return Array.isArray(list) ? list : [list];
  } catch (err) {
    if (String(err.stderr).includes('E404')) return [];
    fail(`cannot read ${name} versions from npm: ${String(err.stderr || err.message).trim()}`);
  }
}

function tagExistsLocally(tag) {
  try {
    git('rev-parse', '-q', '--verify', `refs/tags/${tag}`);
    return true;
  } catch {
    return false;
  }
}

// true / false, or null when origin cannot be reached (no SSH access, offline).
function tagOnOrigin(tag) {
  try {
    return git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`) !== '';
  } catch {
    return null;
  }
}

function verify(tag) {
  if (!tag || !tag.startsWith('v')) fail('verify needs a tag such as v26.10.14');
  const version = tag.slice(1);
  const parsed = parseVersion(version);
  if (parsed.error) fail(parsed.error);
  if (version !== pkg.version) {
    fail(`package.json says ${pkg.version} but the tag is ${tag}. Bump the version before tagging`);
  }
  const check = checkExplicit(version, publishedVersions());
  if (check.error) fail(check.error);
  try {
    git('merge-base', '--is-ancestor', 'HEAD', 'origin/main');
  } catch {
    fail(`${tag} does not point at a commit on origin/main, releases are cut from main`);
  }
  console.log(`ok: ${name}@${version} can be published`);
}

function release(args) {
  const yes = args.includes('--yes');
  const push = args.includes('--push');
  const requested = args.find((arg) => !arg.startsWith('--'));
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const dirty = git('status', '--porcelain') !== '';

  if (yes && branch !== 'main') fail(`releases are cut from main, you are on ${branch}`);
  if (yes && dirty) fail('the working tree has changes, commit or stash them first');

  const published = publishedVersions();
  const latest = latestOf(published);
  let version;
  if (requested) {
    const check = checkExplicit(requested, published);
    if (check.error) fail(check.error);
    version = requested;
  } else {
    version = nextVersion(latest);
  }

  const tag = `v${version}`;
  if (tagExistsLocally(tag)) fail(`tag ${tag} already exists locally`);
  const onOrigin = tagOnOrigin(tag);
  if (onOrigin === true) fail(`tag ${tag} already exists on origin`);
  if (onOrigin === null && yes) {
    fail(`cannot reach origin to check ${tag}. Fix SSH access to github.com first`);
  }

  console.log(name);
  console.log(`  latest published: ${latest ? latest.join('.') : 'none'}`);
  console.log(`  next version:     ${version}`);
  console.log(`  tag:              ${tag}`);
  console.log(`  branch:           ${branch}${branch === 'main' ? '' : '  (releases are cut from main)'}`);
  if (onOrigin === null) console.log('  note:             could not reach origin to check the tag');

  if (!yes) {
    console.log('\nNothing changed. Run again with --yes to bump, commit and tag. Add --push to publish.');
    return;
  }

  sh('npm', ['version', version, '--no-git-tag-version'], { stdio: 'inherit' });
  const changed = git('diff', '--name-only').split('\n').filter(Boolean);
  if (changed.length === 0) fail('npm version changed nothing');
  git('add', '--', ...changed);
  git('commit', '-m', `chore(release): ${tag}`);
  git('tag', '-a', tag, '-m', tag);
  console.log(`committed and tagged ${tag}`);

  if (push) {
    sh('git', ['push', 'origin', 'main'], { stdio: 'inherit' });
    sh('git', ['push', 'origin', tag], { stdio: 'inherit' });
    console.log('pushed. The tag push starts the release workflow.');
  } else {
    console.log(`not pushed. To publish: git push origin main && git push origin ${tag}`);
  }
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'verify') {
  verify(rest[0]);
} else {
  release(process.argv.slice(2));
}
