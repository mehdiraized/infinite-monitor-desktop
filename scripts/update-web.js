#!/usr/bin/env node
'use strict';

/**
 * update-web.js — Pull latest upstream changes
 *
 *   pnpm run upstream
 *
 * Steps:
 *   1. Reset web/ to clean upstream (remove overlay)
 *   2. Fetch + merge upstream/main into web/
 *   3. Update parent repo's submodule pointer
 *   4. Re-install workspace dependencies (web/package.json may have changed)
 *   5. Re-apply the desktop overlay
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT, 'web');

function run(cmd, cwd, label) {
  if (label) console.log(`\n  ${label}`);
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: cwd ?? ROOT, stdio: 'inherit' });
}

function capture(cmd, cwd) {
  return execSync(cmd, { cwd: cwd ?? ROOT }).toString().trim();
}

console.log('\n━━━ upstream: pulling latest upstream changes ━━━\n');

// ── 1. Reset overlay ─────────────────────────────────────────────────────────
console.log('  [1/5] Resetting overlay...');
run('node scripts/reset-overlay.js');

// ── 2. Pull upstream/main ────────────────────────────────────────────────────
console.log('\n  [2/5] Fetching upstream...');
run('git fetch upstream', WEB_DIR);

const beforeHash = capture('git rev-parse HEAD', WEB_DIR);
run('git merge upstream/main --no-edit', WEB_DIR);
const afterHash = capture('git rev-parse HEAD', WEB_DIR);

if (beforeHash === afterHash) {
  console.log('\n  ✓  Already up-to-date — no new commits from upstream.');
} else {
  console.log(`\n  ✓  Updated: ${beforeHash.slice(0, 7)} → ${afterHash.slice(0, 7)}`);
}

// ── 3. Update submodule pointer in parent repo ───────────────────────────────
console.log('\n  [3/5] Updating submodule pointer...');
run('git add web');
console.log('  ✓  Submodule pointer staged (remember to commit desktop/)');

// ── 4. Re-install workspace dependencies ─────────────────────────────────────
// The upstream merge may have added or updated packages in web/package.json.
// Re-running pnpm install from the workspace root picks up all changes and
// recompiles any native modules for the current Node version.
// HUSKY=0 prevents husky from running in web/ (it's a read-only submodule).
console.log('\n  [4/5] Re-installing workspace dependencies...');
const { execSync: execS } = require('child_process');
execS('pnpm install', {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, HUSKY: '0' },
});

// ── 5. Re-apply overlay ──────────────────────────────────────────────────────
console.log('\n  [5/5] Re-applying desktop overlay...');
run('node scripts/apply-overlay.js');

console.log('\n━━━ upstream: done! ━━━');
console.log('  Run `pnpm run dev` to test the updated app.');
console.log('  Then commit the updated submodule pointer:\n');
console.log('    git commit -m "chore: update web submodule to latest upstream"\n');
