/**
 * Guards the published package manifest.
 *
 * `exports` is the one field in package.json that can break every
 * consumer at once: once it exists, any subpath it does not name stops
 * resolving. These tests pin the parts that people outside this repo
 * actually depend on.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const root = process.cwd();
const pkg = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8')
) as Record<string, any>;
const npmignore = readFileSync(resolve(root, '.npmignore'), 'utf8');

describe('package manifest', () => {
  it('is MIT, matching the LICENSE file', () => {
    expect(pkg.license).toBe('MIT');
    expect(readFileSync(resolve(root, 'LICENSE'), 'utf8')).toContain(
      'MIT License'
    );
  });

  describe('exports map', () => {
    it('points the root export at the same files as main/types', () => {
      expect(pkg.exports['.']).toEqual({
        types: './dist/main.d.ts',
        default: './dist/main.js',
      });
      expect(`./${pkg.main}`).toBe(pkg.exports['.'].default);
      expect(`./${pkg.types}`).toBe(pkg.exports['.'].types);
    });

    it('keeps ./dist/* deep imports resolving to dist, not dist/dist', () => {
      // Consumers (and our own docs) reference
      // `@ethora/chat-component/dist/types/...`. A bare `"./*":
      // "./dist/*"` wildcard would rewrite that to `dist/dist/types/...`
      // and 404, so the more specific pattern has to exist.
      expect(pkg.exports['./dist/*']).toBe('./dist/*');
    });

    it('exposes the non-dist files listed in `files`', () => {
      expect(pkg.exports['./public/*']).toBe('./public/*');
      expect(pkg.exports['./scripts/*']).toBe('./scripts/*');
      for (const entry of pkg.files as string[]) {
        const top = entry.split('/')[0];
        expect(
          pkg.exports[`./${top}/*`] ?? pkg.exports['.'],
          `no exports entry covers "${entry}"`
        ).toBeTruthy();
      }
    });

    it('exposes package.json, which tooling reads directly', () => {
      expect(pkg.exports['./package.json']).toBe('./package.json');
    });

    it('keeps a catch-all wildcard so unlisted subpaths still resolve', () => {
      expect(pkg.exports['./*']).toBe('./dist/*');
    });
  });

  describe('sideEffects', () => {
    it('is not a blanket false: the entry has module-scope side effects', () => {
      // src/main.ts imports ./index.css and writes
      // window._ethoraAppLoadTime at module scope, so a bundler must not
      // be told the package is side-effect free.
      expect(pkg.sideEffects).not.toBe(false);
      expect(Array.isArray(pkg.sideEffects)).toBe(true);
    });

    it('marks the stylesheet and the entry chunk', () => {
      expect(pkg.sideEffects).toContain('*.css');
      expect(pkg.sideEffects).toContain('./dist/main.js');
      // Vite emits the real entry code as a hashed `main-<hash>.js`
      // chunk; that is where the window write ends up.
      expect(pkg.sideEffects).toContain('./dist/main-*.js');
    });

    it('still lets the source entry be recognised in a linked checkout', () => {
      expect(pkg.sideEffects).toContain('./src/main.ts');
      expect(pkg.sideEffects).toContain('./src/index.css');
    });
  });

  describe('.npmignore', () => {
    it('no longer contradicts the `files` field over dist/', () => {
      expect(pkg.files).toContain('dist');
      const ignored = npmignore
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
      expect(ignored).not.toContain('dist/');
      expect(ignored).not.toContain('dist');
    });
  });
});
