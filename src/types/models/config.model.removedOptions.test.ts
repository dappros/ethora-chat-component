import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// These five options were declared in IConfig and documented in the README as
// working features, but no code in src/ ever read any of them. They were
// removed rather than implemented: bubble styling is handled by
// src/styles/tokens.ts and config.colors, and the rest were legacy init flags
// with no runtime path left.
//
// This is a source-text guard, not a type test: vitest does not typecheck, and
// re-adding a key to the interface is exactly the regression worth catching.
// If one of these ever comes back, it must come back with an implementation
// and a behavioural test, at which point this list is the thing to update.
const REMOVED_OPTIONS = [
  'bubleMessage',
  'forceSetRoom',
  'clearStoreBeforeInit',
  'botMessageAutoScroll',
  'customRooms',
];

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'config.model.ts'), 'utf8');
const readme = readFileSync(join(here, '../../../README.md'), 'utf8');

describe('IConfig no longer declares options nothing implements', () => {
  it.each(REMOVED_OPTIONS)('%s is not declared in config.model.ts', (option) => {
    expect(source).not.toContain(`${option}?`);
  });

  it.each(REMOVED_OPTIONS)('%s is not documented in the README', (option) => {
    expect(readme).not.toContain(`\`${option}\``);
  });

  it('dropped the types that only those options used', () => {
    expect(source).not.toContain('MessageBubble');
    expect(source).not.toContain('PartialRoomWithMandatoryKeys');
  });
});
