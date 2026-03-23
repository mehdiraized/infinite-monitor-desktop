#!/usr/bin/env node
'use strict';

/**
 * scripts/prepare-web.js
 *
 * Pre-build script run before electron-builder packages the app.
 *
 * Steps:
 *   1. Build the Next.js web app (../web) in production mode.
 *      The build must produce a standalone output (.next/standalone/).
 *   2. Assemble the standalone server into ./web-build/ so electron-builder
 *      can include it as an extraResource.
 *
 * Standalone layout expected by Next.js:
 *   .next/standalone/          ← self-contained Node server
 *   .next/standalone/server.js ← entry point
 *   .next/static/              ← static assets (must be copied alongside)
 *   public/                    ← public assets  (must be copied alongside)
 *
 * After this script ./web-build/ will contain:
 *   server.js        ← standalone entry
 *   .next/static/    ← static assets
 *   public/          ← public assets
 *   node_modules/    ← bundled server-side node_modules (from standalone)
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT, 'web');
const STANDALONE_DIR = path.join(WEB_DIR, '.next', 'standalone');
const STATIC_SRC = path.join(WEB_DIR, '.next', 'static');
const PUBLIC_SRC = path.join(WEB_DIR, 'public');
const WEB_BUILD_DIR = path.join(ROOT, 'web-build');

// ── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd, cwd) {
  console.log(`\n  $ ${cmd}  (in ${path.relative(process.cwd(), cwd)})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
  console.log(`  copied: ${path.relative(ROOT, src)} → ${path.relative(ROOT, dest)}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('\n━━━ prepare-web: building upstream Next.js app ━━━\n');

if (!fs.existsSync(WEB_DIR)) {
  console.error(`ERROR: web directory not found at:\n  ${WEB_DIR}`);
  process.exit(1);
}

// Step 1: build
run('pnpm run build', WEB_DIR);

// Verify standalone output was produced
if (!fs.existsSync(STANDALONE_DIR)) {
  console.error(
    `\nERROR: .next/standalone was not produced by the build.\n` +
    `Make sure next.config.ts includes  output: 'standalone'\n` +
    `  (see desktop/ARCHITECTURE.md for details)`
  );
  process.exit(1);
}

// Detect standalone layout: flat (server.js at root) vs nested (server.js under web/)
// The nested layout occurs when outputFileTracingRoot is set to the workspace root (desktop/)
// instead of the project root (web/). We prefer flat, but handle both.
const flatServerJs = path.join(STANDALONE_DIR, 'server.js');
const nestedServerJs = path.join(STANDALONE_DIR, 'web', 'server.js');
const isNested = !fs.existsSync(flatServerJs) && fs.existsSync(nestedServerJs);

if (!fs.existsSync(flatServerJs) && !fs.existsSync(nestedServerJs)) {
  console.error(
    `\nERROR: server.js not found in standalone output.\n` +
    `Checked:\n  ${flatServerJs}\n  ${nestedServerJs}`
  );
  process.exit(1);
}

if (isNested) {
  console.warn(
    '\n  WARNING: standalone output uses nested layout (web/server.js).\n' +
    '  Add outputFileTracingRoot: path.resolve(__dirname) to next.config.ts for a flat layout.\n'
  );
}

// Step 2: assemble web-build/
console.log('\n━━━ prepare-web: assembling web-build/ ━━━\n');

if (fs.existsSync(WEB_BUILD_DIR)) {
  fs.rmSync(WEB_BUILD_DIR, { recursive: true, force: true });
}

// Copy the entire standalone directory (includes server.js + node_modules)
copyDir(STANDALONE_DIR, WEB_BUILD_DIR);

// Determine where server.js landed in web-build and copy static alongside it
const staticDest = isNested
  ? path.join(WEB_BUILD_DIR, 'web', '.next', 'static')
  : path.join(WEB_BUILD_DIR, '.next', 'static');

// Copy .next/static next to server.js (required by the standalone server)
copyDir(STATIC_SRC, staticDest);

// Copy public/ next to server.js
const publicDest = isNested
  ? path.join(WEB_BUILD_DIR, 'web', 'public')
  : path.join(WEB_BUILD_DIR, 'public');

copyDir(PUBLIC_SRC, publicDest);

console.log('\n━━━ prepare-web: done ━━━');
console.log(`  Output: ${WEB_BUILD_DIR}\n`);
