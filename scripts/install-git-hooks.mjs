#!/usr/bin/env node
// Points git at the versioned .githooks/ directory. Runs from `npm install`
// through the prepare script. It does nothing outside this repository's own
// work tree, so installing the package as a dependency has no side effects.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

let root;
try {
  root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  process.exit(0);
}

if (resolve(root) !== resolve(process.cwd()) || !existsSync(resolve(root, '.githooks'))) {
  process.exit(0);
}

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'ignore' });
console.log('install-git-hooks: core.hooksPath -> .githooks');
