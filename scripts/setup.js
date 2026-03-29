#!/usr/bin/env node
"use strict";

/**
 * setup.js — First-time project setup
 *
 * Run once after cloning desktop/ for the first time:
 *   pnpm run setup
 *
 * Steps:
 *   0. Check pnpm is available
 *   1. Init & update git submodule (web/)
 *   2. Add upstream remote in web/ if missing
 *   3. Clean legacy npm node_modules from web/ (if any)
 *   4. Install all workspace dependencies from desktop/ root
 *   5. Build the React settings renderer
 *   6. Build the prepared runtime overlay copy
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(ROOT, "web");
const UPSTREAM_URL = "https://github.com/homanp/infinite-monitor.git";

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

console.log("\n━━━ setup: first-time project initialization ━━━\n");

// ── Pre-check: Node version ───────────────────────────────────────────────────
// All native modules (better-sqlite3, isolated-vm, etc.) must be compiled for
// the Node version used at install time — and that SAME version must be used
// to run the Next.js server. We target Node 22 LTS.
const nodeMajor = parseInt(process.version.slice(1).split(".")[0], 10);
if (nodeMajor !== 22) {
	console.error(
		[
			"",
			`  ERROR: setup must run with Node 22. You are using ${process.version}.`,
			"",
			"  Switch to Node 22 first:",
			"    nvm install 22   # (if not yet installed)",
			"    nvm use 22",
			"    pnpm run setup",
			"",
		].join("\n"),
	);
	process.exit(1);
}
console.log(`  ✓  Node ${process.version} — correct.\n`);

// ── 0. Check pnpm ────────────────────────────────────────────────────────────
console.log("  [0/6] Checking for pnpm...");
try {
	const ver = capture("pnpm --version");
	console.log(`  ✓  pnpm ${ver} found.`);
} catch (_) {
	console.error(
		[
			"",
			"  ERROR: pnpm is not installed or not in PATH.",
			"",
			"  Install it with corepack (recommended):",
			"    corepack enable",
			"    corepack prepare pnpm@10 --activate",
			"",
			"  Or via npm:",
			"    npm install -g pnpm",
			"",
		].join("\n"),
	);
	process.exit(1);
}

// ── 1. Init submodule ────────────────────────────────────────────────────────
console.log("\n  [1/6] Initializing web/ submodule...");
run("git submodule update --init --recursive");

// ── 2. Upstream remote ───────────────────────────────────────────────────────
console.log("\n  [2/6] Configuring upstream remote in web/...");
const remotes = capture("git remote", WEB_DIR)
	.split("\n")
	.map((s) => s.trim());
if (!remotes.includes("upstream")) {
	run(`git remote add upstream ${UPSTREAM_URL}`, WEB_DIR);
	console.log("  ✓  upstream remote added.");
} else {
	console.log("  ✓  upstream remote already configured.");
}

// ── 3. Clean legacy npm node_modules ─────────────────────────────────────────
// If web/node_modules was installed by npm (no .pnpm dir), remove it first.
// pnpm workspace install recreates it with proper symlinks.
console.log("\n  [3/6] Checking for legacy npm node_modules in web/...");
const webNm = path.join(WEB_DIR, "node_modules");
const pnpmDir = path.join(webNm, ".pnpm");
if (fs.existsSync(webNm) && !fs.existsSync(pnpmDir)) {
	console.log(
		"  Found npm-managed node_modules in web/. Removing before pnpm install...",
	);
	fs.rmSync(webNm, { recursive: true, force: true });
	console.log(
		"  ✓  Removed web/node_modules — pnpm will recreate it with symlinks.",
	);
} else {
	console.log("  ✓  No legacy node_modules to clean.");
}

// ── 4. Install workspace dependencies ────────────────────────────────────────
// One pnpm install from desktop/ installs both electron deps and all web deps.
// shamefully-hoist=true (.npmrc) flattens everything into desktop/node_modules/.
// web/node_modules/ gets pnpm symlinks — no separate install step needed.
// HUSKY=0 prevents husky from running in web/ (it's a read-only submodule).
console.log("\n  [4/6] Installing workspace dependencies...");
execSync("pnpm install", {
	cwd: ROOT,
	stdio: "inherit",
	env: { ...process.env, HUSKY: "0" },
});

// ── 5. Build settings renderer + runtime copy ───────────────────────────────
console.log("\n  [5/6] Building React settings renderer...");
run("node scripts/build-settings-renderer.js");

console.log("\n  [6/6] Building runtime overlay copy...");
run("node scripts/apply-overlay.js");

console.log("\n━━━ setup: done! ━━━");
console.log("  Run `pnpm run dev` to start development.\n");
