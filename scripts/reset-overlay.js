#!/usr/bin/env node
"use strict";

/**
 * reset-overlay.js
 *
 * Restores web/ to a clean upstream state and removes the disposable
 * .web-runtime/ directory used for development and builds.
 *
 * Use this before updating web/ if you want a guaranteed clean merge.
 *
 * Usage:
 *   node scripts/reset-overlay.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(ROOT, "web");
const RUNTIME_WEB_DIR = path.join(ROOT, ".web-runtime");

// Files that have historically been added by overlay and may still exist in web/
// from the old copy-into-web workflow.
const LEGACY_OVERLAY_NEW_FILES = [
	"public/sw.js",
	"src/components/offline-banner.tsx",
	"src/components/onboarding.tsx",
	"src/components/api-status-banner.tsx",
	"src/app/api/health/route.ts",
];

const OVERLAY_EXCLUDE = new Set(["tsconfig.json"]);

if (!fs.existsSync(WEB_DIR)) {
	console.error("[reset-overlay] ERROR: web/ directory not found.");
	process.exit(1);
}

function listOverlayFiles(dir, files = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		const rel = path.relative(path.join(ROOT, "overlay"), full);
		if (OVERLAY_EXCLUDE.has(rel)) continue;
		if (entry.isDirectory()) {
			listOverlayFiles(full, files);
		} else {
			files.push(rel);
		}
	}
	return files;
}

function isTrackedInWeb(rel) {
	try {
		execSync(`git ls-files --error-unmatch -- ${JSON.stringify(rel)}`, {
			cwd: WEB_DIR,
			stdio: "ignore",
		});
		return true;
	} catch {
		return false;
	}
}

function removeIfExists(rel) {
	const full = path.join(WEB_DIR, rel);
	if (!fs.existsSync(full)) return;
	fs.rmSync(full, { recursive: true, force: true });
	console.log(`  ✓  Removed overlay-only file: ${rel}`);

	let dir = path.dirname(full);
	while (dir !== WEB_DIR) {
		try {
			const entries = fs.readdirSync(dir);
			if (entries.length !== 0) break;
			fs.rmdirSync(dir);
		} catch {
			break;
		}
		dir = path.dirname(dir);
	}
}

console.log("\n━━━ reset-overlay: restoring web/ to clean upstream ━━━\n");

// 1. Restore modified tracked files
try {
	execSync("git checkout -- .", { cwd: WEB_DIR, stdio: "inherit" });
	console.log("\n  ✓  Modified files restored via git checkout.");
} catch (err) {
	console.error("  ✗  git checkout failed:", err.message);
	process.exit(1);
}

// 2. Remove overlay-only (untracked) files left over from the old workflow.
const overlayDir = path.join(ROOT, "overlay");
const overlayFiles = listOverlayFiles(overlayDir);
const overlayOnly = new Set(LEGACY_OVERLAY_NEW_FILES);
for (const rel of overlayFiles) {
	if (!isTrackedInWeb(rel)) overlayOnly.add(rel);
}

for (const rel of overlayOnly) {
	removeIfExists(rel);
}

// 3. Remove the disposable runtime copy.
if (fs.existsSync(RUNTIME_WEB_DIR)) {
	fs.rmSync(RUNTIME_WEB_DIR, { recursive: true, force: true });
	console.log("  ✓  Removed .web-runtime/.");
}

console.log(
	"\n  web/ is now clean.  Run `node scripts/apply-overlay.js` to rebuild .web-runtime/.\n",
);
