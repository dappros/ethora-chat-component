// Unit checks for scripts/lib/version.mjs. Run with: npm run test:release
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkExplicit, latestOf, nextVersion, parseVersion } from './version.mjs';

const at = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12));

test('accepts unpadded yy.m.d', () => {
  assert.equal(parseVersion('26.10.1').error, undefined);
  assert.equal(parseVersion('26.1.1').error, undefined);
  assert.equal(parseVersion('27.2.12').error, undefined);
});

test('rejects leading zeros the way npm does', () => {
  assert.match(parseVersion('26.10.01').error, /leading zero/);
  assert.match(parseVersion('26.01.1').error, /leading zero/);
});

test('rejects impossible calendar dates and bad shapes', () => {
  assert.match(parseVersion('26.2.30').error, /real calendar date/);
  assert.match(parseVersion('26.13.1').error, /real calendar date/);
  assert.match(parseVersion('26.0.1').error, /real calendar date/);
  assert.match(parseVersion('26.10').error, /yy.m.d/);
});

test('next version is today when nothing published is newer', () => {
  assert.equal(nextVersion([26, 9, 8], at(2026, 10, 14)), '26.10.14');
});

test('a second release on the same day moves to the next day', () => {
  assert.equal(nextVersion([26, 9, 26], at(2026, 9, 26)), '26.9.27');
});

test('a release on a later day uses that day', () => {
  assert.equal(nextVersion([26, 9, 26], at(2026, 9, 27)), '26.9.27');
});

test('after a future version the next one is the day after it', () => {
  assert.equal(nextVersion([27, 2, 12], at(2026, 10, 14)), '27.2.13');
});

test('month and year rollover', () => {
  assert.equal(nextVersion([26, 12, 31], at(2026, 12, 31)), '27.1.1');
});

test('first release with nothing on npm uses today', () => {
  assert.equal(nextVersion(null, at(2026, 10, 14)), '26.10.14');
});

test('latestOf ignores entries that are not x.y.z', () => {
  assert.deepEqual(latestOf(['1.0.0', '26.9.8', '26.10.4', 'next']), [26, 10, 4]);
  assert.equal(latestOf([]), null);
});

test('checkExplicit refuses a version that is not newer than the latest', () => {
  assert.match(checkExplicit('26.9.1', ['26.9.8']).error, /not newer/);
});

test('checkExplicit refuses a version that is already published', () => {
  assert.match(checkExplicit('26.9.8', ['26.9.8']).error, /already published/);
});

test('checkExplicit accepts a newer, unpublished version, including a future one', () => {
  assert.equal(checkExplicit('26.10.14', ['26.9.8']).error, undefined);
  assert.equal(checkExplicit('27.2.12', ['26.9.8']).error, undefined);
});
