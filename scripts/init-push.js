#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function findPublicDir(startPath) {
  const possiblePaths = ['public', 'static', 'assets'];
  let currentPath = startPath;

  while (currentPath !== path.parse(currentPath).root) {
    for (const dir of possiblePaths) {
      const fullPath = path.join(currentPath, dir);
      if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
        return fullPath;
      }
    }
    currentPath = path.dirname(currentPath);
  }
  return null;
}

const swFileName = 'firebase-messaging-sw.js';
const sourcePath = path.join(__dirname, '..', 'public', swFileName);

if (!fs.existsSync(sourcePath)) {
  console.error(`[Ethora] Error: Source service worker not found at ${sourcePath}`);
  process.exit(1);
}

// When run via npx, process.cwd() is the user's project root
const targetDir = findPublicDir(process.cwd());

if (!targetDir) {
  console.error('[Ethora] Error: Could not find a public directory in your project.');
  console.info('Please manually copy the service worker:');
  console.info(`cp node_modules/@ethora/chat-component/public/${swFileName} ./public/`);
  process.exit(1);
}

const targetPath = path.join(targetDir, swFileName);

try {
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`[Ethora] ✅ Successfully copied ${swFileName} to ${targetDir}`);
} catch (err) {
  console.error(`[Ethora] Error: Failed to copy service worker: ${err.message}`);
  process.exit(1);
}
