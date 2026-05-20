import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const srcDir = resolve(rootDir, 'src');
const libSrcDir = resolve(rootDir, 'lib', 'src');

if (!existsSync(srcDir)) {
  throw new Error(`Source directory not found: ${srcDir}`);
}

mkdirSync(resolve(rootDir, 'lib'), { recursive: true });
rmSync(libSrcDir, { recursive: true, force: true });
cpSync(srcDir, libSrcDir, { recursive: true });
