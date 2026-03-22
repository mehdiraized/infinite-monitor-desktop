#!/usr/bin/env node
'use strict';

/**
 * release.js — Tag a release and push to GitHub
 *
 *   npm run release
 *   npm run release -- --dry    (dry-run: no tag, no push)
 *
 * What this script does:
 *   1. Verify git working tree is clean (overlay files ignored)
 *   2. Read version from package.json  →  tag = v{version}
 *   3. Ensure the tag does not already exist
 *   4. Create an annotated git tag
 *   5. Push the tag to origin
 *
 * After the tag is pushed, GitHub Actions builds all platforms and
 * creates the GitHub Release automatically (see .github/workflows/release.yml).
 *
 * Prerequisites:
 *   - git configured with push access to origin
 *   - GitHub Actions workflow present in .github/workflows/release.yml
 */

const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const ROOT    = path.resolve(__dirname, '..');
const pkg     = require(path.join(ROOT, 'package.json'));
const isDry   = process.argv.includes('--dry');

function run(cmd, cwd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: cwd ?? ROOT, stdio: 'inherit' });
}

function capture(cmd, cwd) {
  return execSync(cmd, { cwd: cwd ?? ROOT }).toString().trim();
}

const version = pkg.version;
const tag     = `v${version}`;

console.log(`\n━━━ release: ${tag}${isDry ? ' (DRY RUN)' : ''} ━━━\n`);

// ── 1. Check git cleanliness ─────────────────────────────────────────────────
// Allow overlay-applied files in web/ — they're expected during dev.
// Only care about staged changes in the desktop/ shell itself.
const staged = capture('git diff --name-only --cached');
if (staged) {
  console.error('ERROR: You have staged changes. Commit or stash them first.\n');
  console.error(staged);
  process.exit(1);
}

const modified = capture('git diff --name-only')
  .split('\n')
  .filter(f => f && !f.startsWith('web/'));   // overlay changes in web/ are fine

if (modified.length > 0) {
  console.error('ERROR: You have unstaged changes in desktop/:\n');
  modified.forEach(f => console.error(`  ${f}`));
  console.error('\nCommit or stash them before releasing.\n');
  process.exit(1);
}

// ── 2. Check tag doesn't already exist ───────────────────────────────────────
const existingTags = capture('git tag').split('\n');
if (existingTags.includes(tag)) {
  console.error(`ERROR: Tag ${tag} already exists.`);
  console.error(`Bump the version in package.json first:  npm version patch\n`);
  process.exit(1);
}

console.log(`  Version : ${version}`);
console.log(`  Tag     : ${tag}`);
console.log(`  Dry run : ${isDry}\n`);

// ── 3. Create annotated tag ───────────────────────────────────────────────────
if (!isDry) {
  run(`git tag -a ${tag} -m "Release ${tag}"`);
  console.log(`\n  ✓  Tag ${tag} created.`);
} else {
  console.log(`  [DRY] Would run: git tag -a ${tag} -m "Release ${tag}"`);
}

// ── 4. Push tag ───────────────────────────────────────────────────────────────
if (!isDry) {
  run(`git push origin ${tag}`);
  console.log(`  ✓  Tag pushed to origin.`);
} else {
  console.log(`  [DRY] Would run: git push origin ${tag}`);
}

// ── Done ──────────────────────────────────────────────────────────────────────
console.log('\n━━━ release: done! ━━━');
if (!isDry) {
  console.log(`
  GitHub Actions is now building all platforms.
  Track progress at:
    https://github.com/mehdiraized/infinite-monitor/actions

  The release will appear at:
    https://github.com/mehdiraized/infinite-monitor/releases/tag/${tag}
`);
} else {
  console.log(`\n  Dry run complete — no tag created or pushed.\n`);
}
