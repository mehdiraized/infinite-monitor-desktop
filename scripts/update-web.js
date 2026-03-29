#!/usr/bin/env node
"use strict";

/**
 * update-web.js — Pull latest upstream changes
 *
 *   pnpm run upstream
 *
 * Steps:
 *   1. Reset web/ to clean upstream and remove the runtime copy
 *   2. Fetch + fast-forward web/ to upstream/main
 *   3. Re-install workspace dependencies (web/package.json may have changed)
 *   4. Rebuild the React settings renderer
 *   5. Rebuild the runtime overlay copy
 */

const { execSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(ROOT, "web");

function run(cmd, cwd, label) {
	if (label) console.log(`\n  ${label}`);
	console.log(`  $ ${cmd}`);
	execSync(cmd, { cwd: cwd ?? ROOT, stdio: "inherit" });
}

function capture(cmd, cwd) {
	return execSync(cmd, { cwd: cwd ?? ROOT })
		.toString()
		.trim();
}

console.log("\n━━━ upstream: pulling latest upstream changes ━━━\n");

// ── 1. Reset overlay/runtime ─────────────────────────────────────────────────
console.log("  [1/5] Resetting overlay runtime...");
run("node scripts/reset-overlay.js");

// ── 2. Pull upstream/main ────────────────────────────────────────────────────
console.log("\n  [2/5] Fetching upstream...");
run("git fetch upstream", WEB_DIR);

const beforeHash = capture("git rev-parse HEAD", WEB_DIR);
run("git merge --ff-only upstream/main", WEB_DIR);
const afterHash = capture("git rev-parse HEAD", WEB_DIR);

if (beforeHash === afterHash) {
	console.log("\n  ✓  Already up-to-date — no new commits from upstream.");
} else {
	console.log(
		`\n  ✓  Updated: ${beforeHash.slice(0, 7)} → ${afterHash.slice(0, 7)}`,
	);
}

// ── 3. Re-install workspace dependencies ─────────────────────────────────────
// The upstream merge may have added or updated packages in web/package.json.
// Re-running pnpm install from the workspace root picks up all changes and
// recompiles any native modules for the current Node version.
// HUSKY=0 prevents husky from running in web/ (it's a read-only submodule).
console.log("\n  [3/5] Re-installing workspace dependencies...");
const { execSync: execS } = require("child_process");
execS("pnpm install", {
	cwd: ROOT,
	stdio: "inherit",
	env: { ...process.env, HUSKY: "0" },
});

// ── 4. Rebuild React settings renderer ───────────────────────────────────────
console.log("\n  [4/5] Rebuilding React settings renderer...");
run("node scripts/build-settings-renderer.js");

// ── 5. Rebuild runtime overlay copy ──────────────────────────────────────────
console.log("\n  [5/5] Rebuilding desktop runtime overlay...");
run("node scripts/apply-overlay.js");

console.log("\n━━━ upstream: done! ━━━");
console.log("  Run `pnpm run dev` to test the updated app.");
if (beforeHash !== afterHash) {
	console.log(
		"  Then commit the updated submodule pointer in desktop/ when ready:\n",
	);
	console.log(
		'    git commit -m "chore: update web submodule to latest upstream"\n',
	);
}
