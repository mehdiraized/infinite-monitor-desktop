#!/usr/bin/env node
"use strict";

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

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(ROOT, "web");
const STANDALONE_DIR = path.join(WEB_DIR, ".next", "standalone");
const STATIC_SRC = path.join(WEB_DIR, ".next", "static");
const PUBLIC_SRC = path.join(WEB_DIR, "public");
const WEB_BUILD_DIR = path.join(ROOT, "web-build");

// ── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd, cwd) {
	console.log(`\n  $ ${cmd}  (in ${path.relative(process.cwd(), cwd)})`);
	execSync(cmd, { cwd, stdio: "inherit" });
}

function copyDir(src, dest) {
	if (!fs.existsSync(src)) return;
	// dereference: true resolves all symlinks to real files/directories.
	// Critical for pnpm workspaces where node_modules contain absolute symlinks
	// pointing to the build machine's filesystem — these break on other machines.
	fs.cpSync(src, dest, { recursive: true, dereference: true });
	console.log(
		`  copied: ${path.relative(ROOT, src)} → ${path.relative(ROOT, dest)}`,
	);
}

/**
 * Walk a directory tree and replace every symlink with a real copy of its target.
 * This is a safety net: fs.cpSync({ dereference: true }) should handle symlinks,
 * but on some CI environments (GitHub Actions + pnpm) absolute symlinks survive
 * the copy. This function catches any that slipped through.
 *
 * @param {string} dir  Directory to walk
 * @returns {number}    Number of symlinks resolved
 */
function resolveAllSymlinks(dir) {
	let count = 0;
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch (_) {
		return count;
	}
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isSymbolicLink()) {
			let realTarget;
			try {
				realTarget = fs.realpathSync(fullPath);
			} catch (_) {
				// Broken symlink — remove it entirely
				fs.rmSync(fullPath, { force: true });
				count++;
				continue;
			}
			// Remove the symlink
			fs.rmSync(fullPath, { force: true, recursive: true });
			// Copy the real content in its place
			const stat = fs.statSync(realTarget);
			if (stat.isDirectory()) {
				fs.cpSync(realTarget, fullPath, { recursive: true, dereference: true });
				// Recurse into the freshly copied directory (it may contain more symlinks)
				count += resolveAllSymlinks(fullPath);
			} else {
				fs.copyFileSync(realTarget, fullPath);
			}
			count++;
		} else if (entry.isDirectory()) {
			count += resolveAllSymlinks(fullPath);
		}
	}
	return count;
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log("\n━━━ prepare-web: building upstream Next.js app ━━━\n");

if (!fs.existsSync(WEB_DIR)) {
	console.error(`ERROR: web directory not found at:\n  ${WEB_DIR}`);
	process.exit(1);
}

// Step 1: build
// Use 'npx next build' instead of 'pnpm run build' to skip the "postbuild"
// hook (prebuild-template.mjs). That hook pre-caches widget templates by running
// npm install + npx shadcn, which is unnecessary for the packaged desktop app
// (the template is rebuilt at runtime) and frequently times out on CI.
try {
	// Pass NEXT_BUILD=1 so that overlay/src/db/index.ts uses an in-memory
	// database instead of a file.  This eliminates SQLITE_BUSY errors when
	// multiple page-data workers evaluate the DB module simultaneously.
	console.log(`\n  $ npx --no-install next build  (in ${path.relative(process.cwd(), WEB_DIR)})`);
	execSync("npx --no-install next build", {
		cwd: WEB_DIR,
		stdio: "inherit",
		env: { ...process.env, NEXT_BUILD: "1" },
	});
} catch (err) {
	console.error(
		"\nERROR: 'next build' failed. Check the output above for details.",
	);
	process.exit(1);
}

// Verify standalone output was produced
if (!fs.existsSync(STANDALONE_DIR)) {
	console.error(
		`\nERROR: .next/standalone was not produced by the build.\n` +
			`Make sure next.config.ts includes  output: 'standalone'\n` +
			`  (see desktop/ARCHITECTURE.md for details)`,
	);
	process.exit(1);
}

// Detect standalone layout: flat (server.js at root) vs nested (server.js under web/)
// The nested layout occurs when outputFileTracingRoot is set to the workspace root (desktop/)
// instead of the project root (web/). We prefer flat, but handle both.
const flatServerJs = path.join(STANDALONE_DIR, "server.js");
const nestedServerJs = path.join(STANDALONE_DIR, "web", "server.js");
const isNested = !fs.existsSync(flatServerJs) && fs.existsSync(nestedServerJs);

if (!fs.existsSync(flatServerJs) && !fs.existsSync(nestedServerJs)) {
	console.error(
		`\nERROR: server.js not found in standalone output.\n` +
			`Checked:\n  ${flatServerJs}\n  ${nestedServerJs}`,
	);
	process.exit(1);
}

if (isNested) {
	console.warn(
		"\n  WARNING: standalone output uses nested layout (web/server.js).\n" +
			"  Add outputFileTracingRoot: path.resolve(__dirname) to next.config.ts for a flat layout.\n",
	);
}

// Step 2: assemble web-build/
console.log("\n━━━ prepare-web: assembling web-build/ ━━━\n");

if (fs.existsSync(WEB_BUILD_DIR)) {
	fs.rmSync(WEB_BUILD_DIR, { recursive: true, force: true });
}

// Copy the entire standalone directory (includes server.js + node_modules)
copyDir(STANDALONE_DIR, WEB_BUILD_DIR);

// In the nested layout, Next.js copies the entire web/ source tree (including
// web/node_modules/ pnpm symlinks) into the standalone output. Those symlinks
// point to paths that only exist during build and are broken at runtime, causing
// MODULE_NOT_FOUND errors because Node resolves them before the real standalone
// node_modules/ at the parent level. Remove the broken node_modules directory.
if (isNested) {
	const brokenNodeModules = path.join(WEB_BUILD_DIR, "web", "node_modules");
	if (fs.existsSync(brokenNodeModules)) {
		fs.rmSync(brokenNodeModules, { recursive: true, force: true });
		console.log(
			"  removed: web-build/web/node_modules (broken pnpm workspace symlinks)",
		);
	}
}

// Determine where server.js landed in web-build and copy static alongside it
const staticDest = isNested
	? path.join(WEB_BUILD_DIR, "web", ".next", "static")
	: path.join(WEB_BUILD_DIR, ".next", "static");

// Copy .next/static next to server.js (required by the standalone server)
copyDir(STATIC_SRC, staticDest);

// Copy public/ next to server.js
const publicDest = isNested
	? path.join(WEB_BUILD_DIR, "web", "public")
	: path.join(WEB_BUILD_DIR, "public");

copyDir(PUBLIC_SRC, publicDest);

// Step 3: patch incomplete packages
// Next.js file tracing may miss files loaded dynamically via require.resolve().
// node-stdlib-browser's esm/index.js uses resolvePath('./mock/empty.js') which
// the tracer cannot follow. Copy the full package from the source node_modules.
const buildNodeModules = path.join(WEB_BUILD_DIR, "node_modules");
const patchPackages = ["node-stdlib-browser", "esbuild"];
for (const pkg of patchPackages) {
	const dest = path.join(buildNodeModules, pkg);
	if (!fs.existsSync(dest)) continue; // not in the build, skip
	// Find the full package in the pnpm store or node_modules
	const pnpmStore = path.join(ROOT, "node_modules", ".pnpm");
	let fullPkgSrc = null;
	if (fs.existsSync(pnpmStore)) {
		// Search the pnpm virtual store for the package
		for (const entry of fs.readdirSync(pnpmStore)) {
			if (!entry.startsWith(pkg.replace("/", "+") + "@")) continue;
			const candidate = path.join(pnpmStore, entry, "node_modules", pkg);
			if (fs.existsSync(candidate)) {
				fullPkgSrc = candidate;
				break;
			}
		}
	}
	if (!fullPkgSrc) {
		// Fallback: try direct node_modules path
		const direct = path.join(ROOT, "node_modules", pkg);
		if (fs.existsSync(direct)) fullPkgSrc = direct;
	}
	if (fullPkgSrc) {
		fs.rmSync(dest, { recursive: true, force: true });
		fs.cpSync(fullPkgSrc, dest, { recursive: true, dereference: true });
		console.log(`  patched: ${pkg} (copied full package for dynamic requires)`);
	}
}

// Step 4: resolve ALL remaining symlinks (safety net)
// fs.cpSync({ dereference: true }) should handle symlinks, but on some CI
// environments (GitHub Actions + pnpm) absolute symlinks survive the copy.
// Walk the whole tree and replace every last symlink with a real copy.
console.log("\n  Resolving remaining symlinks...");
const resolved = resolveAllSymlinks(WEB_BUILD_DIR);
console.log(`  ${resolved} symlink(s) resolved.`);

// Step 5: verify — fail the build if any symlinks remain
let remaining = 0;
function countSymlinks(dir) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch (_) {
		return;
	}
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isSymbolicLink()) {
			remaining++;
			console.error(
				`  SYMLINK STILL PRESENT: ${path.relative(WEB_BUILD_DIR, fullPath)}`,
			);
		} else if (entry.isDirectory()) {
			countSymlinks(fullPath);
		}
	}
}
countSymlinks(WEB_BUILD_DIR);
if (remaining > 0) {
	console.error(
		`\nERROR: ${remaining} symlink(s) remain in web-build. The build would be broken.`,
	);
	process.exit(1);
}
console.log("  ✓ Verified: zero symlinks in web-build.");

console.log("\n━━━ prepare-web: done ━━━");
console.log(`  Output: ${WEB_BUILD_DIR}\n`);
