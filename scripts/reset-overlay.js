#!/usr/bin/env node
"use strict";

/**
 * reset-overlay.js
 *
 * Restores web/ to a clean upstream state by:
 *   1. Running `git checkout .` in web/ (reverts modified files)
 *   2. Removing untracked overlay-only files listed in OVERLAY_NEW_FILES
 *
 * Use this before `git pull` in web/ if you want a clean merge, then
 * re-run `apply-overlay.js` afterwards.
 *
 * Usage:
 *   node scripts/reset-overlay.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(ROOT, "web");

// Files added by overlay that do not exist in the upstream repo.
// These must be removed manually since git checkout won't touch untracked files.
const OVERLAY_NEW_FILES = [
	"public/sw.js",
	"src/components/offline-banner.tsx",
	"src/components/onboarding.tsx",
];

if (!fs.existsSync(WEB_DIR)) {
	console.error("[reset-overlay] ERROR: web/ directory not found.");
	process.exit(1);
}

console.log("\n━━━ reset-overlay: restoring web/ to clean upstream ━━━\n");

// 1. Restore modified tracked files
try {
	execSync("git checkout .", { cwd: WEB_DIR, stdio: "inherit" });
	console.log("\n  ✓  Modified files restored via git checkout.");
} catch (err) {
	console.error("  ✗  git checkout failed:", err.message);
	process.exit(1);
}

// 2. Remove overlay-only (untracked) files
for (const rel of OVERLAY_NEW_FILES) {
	const full = path.join(WEB_DIR, rel);
	if (fs.existsSync(full)) {
		fs.rmSync(full);
		console.log(`  ✓  Removed overlay-only file: ${rel}`);
	}
}

console.log(
	"\n  web/ is now clean.  Run `git pull` then `node scripts/apply-overlay.js`.\n",
);
