#!/usr/bin/env node
"use strict";

/**
 * scripts/prepare-web.js
 *
 * Pre-build script run before electron-builder packages the app.
 *
 * Steps:
 *   1. Build the prepared runtime web app (.web-runtime/) in production mode.
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

const { execFileSync, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(ROOT, ".web-runtime");
const STANDALONE_DIR = path.join(WEB_DIR, ".next", "standalone");
const STATIC_SRC = path.join(WEB_DIR, ".next", "static");
const PUBLIC_SRC = path.join(WEB_DIR, "public");
const WEB_BUILD_DIR = path.join(ROOT, "web-build");
const BUNDLED_NODE = path.join(
	ROOT,
	"node-bin",
	process.platform === "win32" ? "node.exe" : "node",
);
const SHADCN_COMPONENTS =
	"button card badge input table tabs scroll-area skeleton separator progress alert avatar checkbox dialog dropdown-menu label popover radio-group select sheet slider switch textarea toggle tooltip accordion collapsible command context-menu hover-card menubar navigation-menu pagination resizable sonner";

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

function findStandaloneServer(dir, depth = 0) {
	if (!fs.existsSync(dir) || depth > 4) return null;

	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isFile() && entry.name === "server.js") {
			return full;
		}
		if (
			entry.isDirectory() &&
			entry.name !== "node_modules" &&
			entry.name !== ".next"
		) {
			const nested = findStandaloneServer(full, depth + 1);
			if (nested) return nested;
		}
	}

	return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log("\n━━━ prepare-web: building runtime Next.js app ━━━\n");

if (!fs.existsSync(WEB_DIR)) {
	console.log("  .web-runtime/ not found. Rebuilding it first...");
	execSync("node scripts/apply-overlay.js", { cwd: ROOT, stdio: "inherit" });
}

// Step 1: build
// Run Next with the bundled Node 22 binary when available. Native modules are
// rebuilt for Node 22, so using a newer system Node during this step can break
// page-data collection with NODE_MODULE_VERSION mismatches.
try {
	// Pass NEXT_BUILD=1 so that overlay/src/db/index.ts uses an in-memory
	// database instead of a file.  This eliminates SQLITE_BUSY errors when
	// multiple page-data workers evaluate the DB module simultaneously.
	const nodeForBuild = fs.existsSync(BUNDLED_NODE)
		? BUNDLED_NODE
		: process.execPath;
	const nextBin = path.join(
		WEB_DIR,
		"node_modules",
		"next",
		"dist",
		"bin",
		"next",
	);
	console.log(
		`\n  $ ${path.relative(ROOT, nodeForBuild)} ${path.relative(WEB_DIR, nextBin)} build  (in ${path.relative(process.cwd(), WEB_DIR)})`,
	);
	execFileSync(nodeForBuild, [nextBin, "build"], {
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

// Detect standalone layout dynamically. Newer Next.js releases may place
// server.js under a nested project directory such as `.web-runtime/server.js`.
const discoveredServerJs = findStandaloneServer(STANDALONE_DIR);

if (!discoveredServerJs) {
	console.error(
		`\nERROR: server.js not found in standalone output.\n` +
			`Checked under:\n  ${STANDALONE_DIR}`,
	);
	process.exit(1);
}

const serverRootRelative = path.relative(
	STANDALONE_DIR,
	path.dirname(discoveredServerJs),
);
const isNested = serverRootRelative !== "";

if (isNested) {
	console.warn(
		`\n  WARNING: standalone output uses nested layout (${serverRootRelative}/server.js).\n` +
			"  Continuing with nested-layout handling.\n",
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
	const brokenNodeModules = path.join(
		WEB_BUILD_DIR,
		serverRootRelative,
		"node_modules",
	);
	if (fs.existsSync(brokenNodeModules)) {
		fs.rmSync(brokenNodeModules, { recursive: true, force: true });
		console.log(
			`  removed: ${path.relative(ROOT, brokenNodeModules)} (broken pnpm workspace symlinks)`,
		);
	}
}

// Determine where server.js landed in web-build and copy static alongside it
const staticDest = isNested
	? path.join(WEB_BUILD_DIR, serverRootRelative, ".next", "static")
	: path.join(WEB_BUILD_DIR, ".next", "static");

// Copy .next/static next to server.js (required by the standalone server)
copyDir(STATIC_SRC, staticDest);

// Copy public/ next to server.js
const publicDest = isNested
	? path.join(WEB_BUILD_DIR, serverRootRelative, "public")
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

// Step 4: create shims for Turbopack hash-suffixed externals
// Turbopack appends a content hash to serverExternalPackages names in the
// generated chunks (e.g. "just-bash-4c29e37088fb84b8").  Node.js cannot
// resolve these names at runtime.  Scan the server chunks for the pattern
// and create lightweight shim packages that re-export the real module.
console.log("\n  Creating shims for hash-suffixed externals...");
{
	const chunksDir = isNested
		? path.join(WEB_BUILD_DIR, serverRootRelative, ".next", "server", "chunks")
		: path.join(WEB_BUILD_DIR, ".next", "server", "chunks");

	// Match e.y("pkg-hexhash") or e.y("@scope+pkg-hexhash")
	const extRe = /\.y\("([^"]+)-([0-9a-f]{8,})"\)/g;
	const shimmed = new Set();

	if (fs.existsSync(chunksDir)) {
		for (const file of fs.readdirSync(chunksDir)) {
			if (!file.endsWith(".js")) continue;
			const content = fs.readFileSync(path.join(chunksDir, file), "utf-8");
			let m;
			while ((m = extRe.exec(content)) !== null) {
				const rawPkg = m[1]; // e.g. "just-bash" or "@scope+pkg"
				const hash = m[2];
				const hashId = `${rawPkg}-${hash}`; // e.g. "just-bash-4c29e37088fb84b8"
				const realPkg = rawPkg.replace(/\+/g, "/"); // "@scope+pkg" → "@scope/pkg"

				if (shimmed.has(hashId)) continue;
				shimmed.add(hashId);

				const shimDir = path.join(buildNodeModules, hashId);
				if (fs.existsSync(shimDir)) continue; // already present

				// Verify the real package is resolvable
				const realDir = path.join(buildNodeModules, realPkg);
				if (!fs.existsSync(realDir)) {
					// Also check the pnpm virtual store
					const pnpmStore = path.join(buildNodeModules, ".pnpm");
					let found = false;
					if (fs.existsSync(pnpmStore)) {
						const prefix = realPkg.replace("/", "+") + "@";
						for (const entry of fs.readdirSync(pnpmStore)) {
							if (entry.startsWith(prefix)) {
								const candidate = path.join(
									pnpmStore,
									entry,
									"node_modules",
									realPkg,
								);
								if (fs.existsSync(candidate)) {
									// Copy the real package to flat node_modules first
									fs.cpSync(candidate, realDir, {
										recursive: true,
										dereference: true,
									});
									console.log(
										`  ensured: ${realPkg} (copied from .pnpm store)`,
									);
									found = true;
									break;
								}
							}
						}
					}
					if (!found) {
						console.warn(
							`  skip shim: ${hashId} → ${realPkg} (package not found)`,
						);
						continue;
					}
				}

				fs.mkdirSync(shimDir, { recursive: true });
				// CJS shim that re-exports the real package
				fs.writeFileSync(
					path.join(shimDir, "index.js"),
					`module.exports = require(${JSON.stringify(realPkg)});\n`,
				);
				// ESM shim for dynamic import()
				fs.writeFileSync(
					path.join(shimDir, "index.mjs"),
					`export * from ${JSON.stringify(realPkg)};\nimport _default from ${JSON.stringify(realPkg)};\nexport default _default;\n`,
				);
				fs.writeFileSync(
					path.join(shimDir, "package.json"),
					JSON.stringify(
						{
							name: hashId,
							version: "0.0.0",
							main: "index.js",
							module: "index.mjs",
							exports: {
								".": {
									import: "./index.mjs",
									require: "./index.js",
									default: "./index.js",
								},
							},
						},
						null,
						2,
					) + "\n",
				);
				console.log(`  shimmed: ${hashId} → ${realPkg}`);
			}
		}
	}
	console.log(`  ${shimmed.size} external shim(s) created.`);
}

// Step 4b: pre-bake widget base template (required for MAS App Sandbox builds)
// The App Sandbox blocks runtime execution of /opt/homebrew/bin/npm, so the
// widget base template must be built at package time and bundled in the app.
// process.execPath inside the sandboxed server is the bundled node binary,
// so vite is invoked as `node vite.js build` instead of `npx vite build`.
console.log("\n━━━ prepare-web: pre-baking widget base template ━━━\n");
{
	const templateSrc = path.join(WEB_DIR, ".cache", "widget-base-template");
	// Validate using the same required-files check as widget-runner's isValidBaseTemplate
	const REQUIRED_TEMPLATE_FILES = [
		"node_modules/.package-lock.json",
		"index.html",
		"vite.config.ts",
		"tsconfig.json",
		"tailwind.config.ts",
		"src/lib/utils.ts",
		"src/components/ui/alert.tsx",
		"src/components/ui/badge.tsx",
		"src/components/ui/button.tsx",
		"src/components/ui/card.tsx",
		"src/components/ui/scroll-area.tsx",
		"src/components/ui/skeleton.tsx",
		"src/components/ui/tabs.tsx",
		"node_modules/dompurify/package.json",
		"node_modules/topojson-client/package.json",
	];
	const alreadyBuilt = REQUIRED_TEMPLATE_FILES.every((f) =>
		fs.existsSync(path.join(templateSrc, f)),
	);

	if (!alreadyBuilt) {
		console.log(
			"  Running npm install for widget template (first time — may take a few minutes)...",
		);
		try {
			execSync("node scripts/prebuild-template.mjs", {
				cwd: WEB_DIR,
				stdio: "inherit",
				timeout: 360_000,
			});
		} catch (err) {
			console.warn(
				"  WARNING: Widget template pre-bake failed:",
				err.message.split("\n")[0],
			);
			console.warn(
				"  Widgets requiring npm may not work in the sandboxed (MAS) build.",
			);
		}
	} else {
		console.log("  Widget base template already cached, skipping npm install.");
	}

	const missingUiFiles = REQUIRED_TEMPLATE_FILES.filter((file) =>
		file.startsWith("src/components/ui/"),
	).filter((file) => !fs.existsSync(path.join(templateSrc, file)));
	if (missingUiFiles.length > 0) {
		console.log(
			`  Installing missing widget UI components (${missingUiFiles.length} file(s))...`,
		);
		execSync(`npx shadcn@latest add --yes ${SHADCN_COMPONENTS}`, {
			cwd: templateSrc,
			stdio: "inherit",
			timeout: 120_000,
		});
	}

	const bundledExtraDeps = ["dompurify", "topojson-client"];
	const missingBundledExtraDeps = bundledExtraDeps.filter(
		(pkg) =>
			!fs.existsSync(
				path.join(templateSrc, "node_modules", pkg, "package.json"),
			),
	);
	if (missingBundledExtraDeps.length > 0) {
		console.log(
			`  Installing bundled widget dependencies: ${missingBundledExtraDeps.join(", ")}`,
		);
		execSync(
			`npm install --include=dev --no-save ${missingBundledExtraDeps.join(" ")}`,
			{
				cwd: templateSrc,
				stdio: "inherit",
				timeout: 120_000,
			},
		);
	}

	if (
		fs.existsSync(path.join(templateSrc, "node_modules", ".package-lock.json"))
	) {
		const serverRelDir = isNested
			? path.join(WEB_BUILD_DIR, serverRootRelative)
			: WEB_BUILD_DIR;
		const templateDest = path.join(serverRelDir, ".cache", "widget-base-template");
		copyDir(templateSrc, templateDest);
		console.log(
			`  bundled widget template → ${path.relative(ROOT, templateDest)}`,
		);
	} else {
		console.warn(
			"  Skipping widget template bundle (template not available).",
		);
	}
}

// Step 5: resolve ALL remaining symlinks (safety net)
// fs.cpSync({ dereference: true }) should handle symlinks, but on some CI
// environments (GitHub Actions + pnpm) absolute symlinks survive the copy.
// Walk the whole tree and replace every last symlink with a real copy.
console.log("\n  Resolving remaining symlinks...");
const resolved = resolveAllSymlinks(WEB_BUILD_DIR);
console.log(`  ${resolved} symlink(s) resolved.`);

// Step 5b: relocate the standalone node_modules inside .web-runtime/
//
// electron-builder's createFilter() (builder-util/out/util/filter.js) contains
// a hard-coded check:
//
//   if (relative === "node_modules") return false;
//
// This runs for ALL copy operations — including extraResources — and permanently
// excludes any directory named "node_modules" that sits at the ROOT of the
// extraResources "from" path (web-build/).  No filter pattern overrides it.
//
// server.js lives inside .web-runtime/ and resolves bare module specifiers
// (require('next'), etc.) by walking UP the directory tree looking for
// node_modules/.  Moving the standalone node_modules one level deeper to
// .web-runtime/node_modules/ satisfies both constraints:
//   • electron-builder sees relative = ".web-runtime/node_modules" (not
//     "node_modules") → includes it.
//   • Node.js resolution from .web-runtime/server.js finds modules in
//     .web-runtime/node_modules/ on its first lookup. ✓
if (isNested) {
	const rootNodeModules = path.join(WEB_BUILD_DIR, "node_modules");
	const serverNodeModules = path.join(
		WEB_BUILD_DIR,
		serverRootRelative,
		"node_modules",
	);
	if (fs.existsSync(rootNodeModules) && !fs.existsSync(serverNodeModules)) {
		fs.renameSync(rootNodeModules, serverNodeModules);
		console.log(
			`  relocated: node_modules → ${path.relative(ROOT, serverNodeModules)}`,
		);
	}
}

// Step 6: verify — fail the build if any symlinks remain
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
