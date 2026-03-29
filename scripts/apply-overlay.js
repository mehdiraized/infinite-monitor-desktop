#!/usr/bin/env node
"use strict";

/**
 * apply-overlay.js
 *
 * Builds a disposable runtime copy of desktop/web/ at desktop/.web-runtime/
 * and applies every file from desktop/overlay/ on top of that copy.
 *
 * The source submodule in web/ stays clean at all times. Development and
 * builds run against .web-runtime/ instead. Most overlay files are symlinked
 * for fast iteration; files that rely on relative sibling imports are copied
 * so module resolution still happens inside .web-runtime/.
 *
 * Usage:
 *   node scripts/apply-overlay.js
 *
 * To undo (remove the runtime copy and clean legacy overlay files from web/):
 *   node scripts/reset-overlay.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OVERLAY = path.join(ROOT, "overlay");
const WEB_DIR = path.join(ROOT, "web");
const RUNTIME_WEB_DIR = path.join(ROOT, ".web-runtime");

// Files that live in overlay/ for IDE support but must NOT be linked into runtime.
const OVERLAY_EXCLUDE = new Set(["tsconfig.json"]);
const SOURCE_EXCLUDE = new Set([".git", ".next", ".turbo"]);
const COPY_OVERLAY_FILES = new Set(["src/app/layout.tsx", "src/db/index.ts"]);

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

function isExcluded(rel, excluded) {
	return rel
		.split(path.sep)
		.filter(Boolean)
		.some((part) => excluded.has(part));
}

function ensureCleanWeb() {
	const status = execSync("git status --porcelain", {
		cwd: WEB_DIR,
		stdio: ["ignore", "pipe", "ignore"],
	})
		.toString()
		.trim();

	if (!status) return;

	console.error(
		"[apply-overlay] ERROR: web/ has local changes. Run `node scripts/reset-overlay.js` first.",
	);
	console.error(status);
	process.exit(1);
}

function copySourceTree(src, dest) {
	fs.cpSync(src, dest, {
		recursive: true,
		dereference: false,
		verbatimSymlinks: true,
		filter(currentSrc) {
			const rel = path.relative(src, currentSrc);
			return !rel || !isExcluded(rel, SOURCE_EXCLUDE);
		},
	});
}

let count = 0;

function linkOverlayRecursive(src, dest) {
	const rel = path.relative(OVERLAY, src);
	if (OVERLAY_EXCLUDE.has(rel) || isExcluded(rel, OVERLAY_EXCLUDE)) return;

	const stat = fs.statSync(src);
	if (stat.isDirectory()) {
		fs.mkdirSync(dest, { recursive: true });
		for (const entry of fs.readdirSync(src)) {
			linkOverlayRecursive(path.join(src, entry), path.join(dest, entry));
		}
	} else {
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.rmSync(dest, { recursive: true, force: true });
		if (COPY_OVERLAY_FILES.has(rel)) {
			fs.copyFileSync(src, dest);
			fs.chmodSync(dest, stat.mode);
		} else {
			const linkTarget = path.relative(path.dirname(dest), src);
			fs.symlinkSync(linkTarget, dest);
		}
		console.log(`  ✓  ${path.relative(ROOT, dest)}`);
		count++;
	}
}

ensureCleanWeb();

console.log("\n━━━ apply-overlay: preparing .web-runtime/ from web/ ━━━\n");

fs.rmSync(RUNTIME_WEB_DIR, { recursive: true, force: true });
copySourceTree(WEB_DIR, RUNTIME_WEB_DIR);

console.log(
	"\n━━━ apply-overlay: applying desktop modifications into .web-runtime/ ━━━\n",
);
linkOverlayRecursive(OVERLAY, RUNTIME_WEB_DIR);

console.log(`\n  ${count} overlay file(s) applied to .web-runtime/.\n`);
