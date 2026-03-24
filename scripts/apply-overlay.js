#!/usr/bin/env node
"use strict";

/**
 * apply-overlay.js
 *
 * Copies every file from desktop/overlay/ into desktop/web/, preserving the
 * directory structure.  Run this after `git pull` in web/ to re-apply all
 * desktop-specific modifications on top of the latest upstream source.
 *
 * Usage:
 *   node scripts/apply-overlay.js
 *
 * To undo (restore web/ to clean upstream):
 *   node scripts/reset-overlay.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OVERLAY = path.join(ROOT, "overlay");
const WEB_DIR = path.join(ROOT, "web");

// Files that live in overlay/ for IDE support but must NOT be copied into web/
const EXCLUDE = new Set(["tsconfig.json"]);

if (!fs.existsSync(OVERLAY)) {
	console.error("[apply-overlay] ERROR: overlay/ directory not found.");
	process.exit(1);
}

if (!fs.existsSync(WEB_DIR)) {
	console.error(
		"[apply-overlay] ERROR: web/ directory not found. Clone the upstream first.",
	);
	process.exit(1);
}

let count = 0;

function copyRecursive(src, dest) {
	// Skip files that are in the exclusion set (relative to overlay root)
	const rel = path.relative(OVERLAY, src);
	if (EXCLUDE.has(rel)) return;

	const stat = fs.statSync(src);
	if (stat.isDirectory()) {
		fs.mkdirSync(dest, { recursive: true });
		for (const entry of fs.readdirSync(src)) {
			copyRecursive(path.join(src, entry), path.join(dest, entry));
		}
	} else {
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.copyFileSync(src, dest);
		console.log(`  ✓  ${path.relative(ROOT, dest)}`);
		count++;
	}
}

console.log("\n━━━ apply-overlay: copying desktop modifications to web/ ━━━\n");
copyRecursive(OVERLAY, WEB_DIR);
console.log(`\n  ${count} file(s) applied.\n`);
