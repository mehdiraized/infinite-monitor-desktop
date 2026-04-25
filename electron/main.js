"use strict";

/**
 * Infinite Monitor – Desktop Shell
 * Main process: starts the Next.js server, manages the BrowserWindow.
 *
 * Phase 1 responsibilities:
 *   - Find a free port
 *   - Spawn the upstream Next.js server (dev or standalone production)
 *   - Show a loading screen while the server warms up
 *   - Load the app into the window once ready
 *   - Route external links to the system browser
 *   - Clean up the server process on exit
 */

const { app, BrowserWindow, shell, dialog, nativeTheme } = require("electron");
const { spawn, execFileSync } = require("child_process");
const path = require("path");
const http = require("http");
const net = require("net");
const fs = require("fs");

const { buildMenu } = require("./menu");
const { scheduleUpdateCheck } = require("./updater");

// ── Constants ────────────────────────────────────────────────────────────────

const IS_DEV = !app.isPackaged;

// In dev: the desktop/ dir; in prod: Contents/Resources/
const RESOURCES_PATH = IS_DEV
	? path.resolve(__dirname, "..")
	: process.resourcesPath;

// Prepared runtime copy used during development. It is rebuilt from web/ +
// overlay/ before dev/build and keeps the web/ submodule clean.
const WEB_DIR = path.resolve(__dirname, "..", ".web-runtime");

// Preferred port – arbitrary high number unlikely to be in use
const PREFERRED_PORT = 3847;

// ── State ────────────────────────────────────────────────────────────────────

/** @type {BrowserWindow|null} */
let mainWindow = null;
/** @type {import('child_process').ChildProcess|null} */
let nextProcess = null;
/** @type {number|null} */
let appPort = null;
/** @type {AbortController|null} — cancelled when the Next.js server dies unexpectedly */
let serverAbort = null;

// ── Port utilities ────────────────────────────────────────────────────────────

/**
 * Returns a free TCP port. Tries `preferred` first; falls back to OS-assigned.
 * @param {number} preferred
 * @returns {Promise<number>}
 */
function findFreePort(preferred) {
	return new Promise((resolve) => {
		const probe = net.createServer();
		probe.listen(preferred, "127.0.0.1", () => {
			probe.close(() => resolve(preferred));
		});
		probe.on("error", () => {
			const fallback = net.createServer();
			fallback.listen(0, "127.0.0.1", () => {
				const { port } = fallback.address();
				fallback.close(() => resolve(port));
			});
		});
	});
}

function findNestedServerScript(rootDir, depth = 0) {
	if (!fs.existsSync(rootDir) || depth > 4) return null;

	for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
		const full = path.join(rootDir, entry.name);
		if (entry.isFile() && entry.name === "server.js") return full;
		if (entry.isDirectory() && entry.name !== "node_modules") {
			const nested = findNestedServerScript(full, depth + 1);
			if (nested) return nested;
		}
	}

	return null;
}

/**
 * Polls http://127.0.0.1:{port}/ until it responds or times out.
 * Pass a `signal` AbortSignal to cancel early (e.g. when the server process dies).
 * @param {number} port
 * @param {number} [timeoutMs=90000]
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
function waitForServer(port, timeoutMs = 90_000, signal) {
	return new Promise((resolve, reject) => {
		const deadline = Date.now() + timeoutMs;
		let done = false;

		function finish(err) {
			if (done) return;
			done = true;
			if (err) reject(err);
			else resolve();
		}

		if (signal)
			signal.addEventListener(
				"abort",
				() => {
					finish(
						signal.reason instanceof Error
							? signal.reason
							: new Error(String(signal.reason)),
					);
				},
				{ once: true },
			);

		function attempt() {
			if (done) return;
			const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
				res.resume(); // drain the response
				// Only consider the server ready on a successful response.
				// A 500 means Turbopack is still compiling — keep polling.
				if (res.statusCode && res.statusCode < 500) {
					finish();
				} else {
					if (Date.now() >= deadline) {
						finish(
							new Error(
								`Server on port ${port} kept returning ${res.statusCode} after ${timeoutMs / 1000}s.`,
							),
						);
					} else {
						setTimeout(attempt, 800);
					}
				}
			});
			req.on("error", () => {
				if (done) return;
				if (Date.now() >= deadline) {
					finish(
						new Error(
							`Server on port ${port} did not respond within ${timeoutMs / 1000}s.`,
						),
					);
				} else {
					setTimeout(attempt, 500);
				}
			});
			req.setTimeout(1000, () => req.destroy());
		}

		setTimeout(attempt, 600); // first check after a short initial pause
	});
}

// ── Node.js binary resolution ─────────────────────────────────────────────────

/**
 * Finds the path to a `node` binary whose major version matches `major`.
 *
 * Search order:
 *   0. Bundled binary (node-bin/node inside app Resources) — always used in
 *      production so end-users don't need Node.js installed.
 *   1. PATH `node` — if its major version matches, return 'node' (fastest).
 *      Used in development when Electron is launched from the terminal.
 *   2. nvm versions directory — latest installed vMAJOR.x.x patch.
 *      Used in development when Electron is launched from the Dock.
 *   3. Common static paths (Homebrew, system) — version-checked.
 *
 * This ensures native modules (better-sqlite3, isolated-vm, etc.) are always
 * loaded by the same Node ABI they were compiled for.
 *
 * @param {number} major  Required Node.js major version (e.g. 22)
 * @returns {string|null}
 */
function findNodeForVersion(major) {
	// Helper: get major version of a node binary, or -1 on error
	function nodeMajor(bin) {
		try {
			const raw = execFileSync(bin, ["--version"], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			}).trim();
			return parseInt(raw.replace(/^v/, "").split(".")[0], 10);
		} catch (_) {
			return -1;
		}
	}

	// 0. Bundled binary — mandatory in production (app is self-contained).
	//    node-bin/node is downloaded by scripts/prepare-node.js at build time
	//    and included in the package via extraResources → process.resourcesPath.
	const bundledBin = path.join(
		RESOURCES_PATH,
		"node-bin",
		process.platform === "win32" ? "node.exe" : "node",
	);
	if (fs.existsSync(bundledBin)) {
		// In production we trust the bundled binary version matches.
		// In dev we still version-check to catch misconfigured setups.
		if (!IS_DEV || nodeMajor(bundledBin) === major) return bundledBin;
	}

	// In production without a bundled binary (shouldn't happen after a proper
	// build) fall through to system search so dev workflows still work.

	// 1. PATH node — used in terminal sessions with nvm active
	if (nodeMajor("node") === major) return "node";

	// 2. nvm store — works even when Electron is launched from Dock (no shell env)
	const nvmDir =
		process.env.NVM_DIR || path.join(process.env.HOME || "", ".nvm");
	const nvmVersionsDir = path.join(nvmDir, "versions", "node");
	if (fs.existsSync(nvmVersionsDir)) {
		let bestBin = null;
		let bestPatch = -1;
		try {
			for (const entry of fs.readdirSync(nvmVersionsDir)) {
				if (!entry.startsWith(`v${major}.`)) continue;
				const patch = parseInt(
					entry.replace(/^v/, "").split(".")[2] || "0",
					10,
				);
				const bin = path.join(nvmVersionsDir, entry, "bin", "node");
				if (
					patch > bestPatch &&
					fs.existsSync(bin) &&
					nodeMajor(bin) === major
				) {
					bestPatch = patch;
					bestBin = bin;
				}
			}
		} catch (_) {
			/* readdir failed */
		}
		if (bestBin) return bestBin;
	}

	// 3. Common static locations (Homebrew, system)
	const staticPaths = [
		"/opt/homebrew/bin/node",
		"/usr/local/bin/node",
		"/usr/bin/node",
		"C:\\Program Files\\nodejs\\node.exe",
	];
	for (const bin of staticPaths) {
		if (fs.existsSync(bin) && nodeMajor(bin) === major) return bin;
	}

	return null;
}

/**
 * Finds the directory containing the `npm` binary for the given Node major version.
 * The bundled node-bin/ only contains the `node` binary (not `npm`), so we must
 * search for npm separately — critical when Electron is launched from the Dock or
 * any environment where the inherited PATH is minimal (/usr/bin:/bin only).
 *
 * @param {number} major  Required Node.js major version (e.g. 22)
 * @param {string|null} foundNodeBin  The node binary found by findNodeForVersion
 * @returns {string|null}
 */
function findNpmBinDir(major, foundNodeBin) {
	// 1. npm is usually next to node in the same bin dir (nvm / Homebrew layout)
	if (foundNodeBin && foundNodeBin !== "node") {
		const npmBin = path.join(path.dirname(foundNodeBin), "npm");
		if (fs.existsSync(npmBin)) return path.dirname(foundNodeBin);
	}

	// 2. nvm versions directory — latest installed vMAJOR.x.x patch
	const nvmDir =
		process.env.NVM_DIR || path.join(process.env.HOME || "", ".nvm");
	const nvmVersionsDir = path.join(nvmDir, "versions", "node");
	if (fs.existsSync(nvmVersionsDir)) {
		let bestDir = null;
		let bestPatch = -1;
		try {
			for (const entry of fs.readdirSync(nvmVersionsDir)) {
				if (!entry.startsWith(`v${major}.`)) continue;
				const patch = parseInt(
					entry.replace(/^v/, "").split(".")[2] || "0",
					10,
				);
				const npmBin = path.join(nvmVersionsDir, entry, "bin", "npm");
				if (patch > bestPatch && fs.existsSync(npmBin)) {
					bestPatch = patch;
					bestDir = path.join(nvmVersionsDir, entry, "bin");
				}
			}
		} catch (_) {
			/* readdir failed */
		}
		if (bestDir) return bestDir;
	}

	// 3. Common static locations (Homebrew, system)
	const staticNpmPaths = [
		"/opt/homebrew/bin/npm",
		"/usr/local/bin/npm",
		"/usr/bin/npm",
	];
	for (const npmBin of staticNpmPaths) {
		if (fs.existsSync(npmBin)) return path.dirname(npmBin);
	}

	return null;
}

// ── Server launch ─────────────────────────────────────────────────────────────

/**
 * Spawns the Next.js server.
 *   - Development: `next dev --port {port}` in ../.web-runtime
 *   - Production: `node server.js` using the bundled standalone output
 *
 * User data (SQLite DB) is always routed to app.getPath('userData').
 *
 * @param {number} port
 */
function startServer(port) {
	const userDataDir = app.getPath("userData");
	const dbPath = path.join(userDataDir, "data", "widgets.db");

	// Ensure the data directory exists before the server starts
	const dbDir = path.dirname(dbPath);
	if (!fs.existsSync(dbDir)) {
		fs.mkdirSync(dbDir, { recursive: true });
	}

	// Resolve Node 22 once — used in both dev and prod branches.
	// We always need the exact version the native modules were compiled for.
	const nodeBin = findNodeForVersion(22);

	// Prepend the Node 22 bin directory to PATH so that npm/npx are available
	// to child processes (e.g. widget-runner's Vite builds).  When Electron is
	// launched from the Dock, the inherited PATH is minimal (/usr/bin:/bin:…)
	// and doesn't include nvm or Homebrew directories.
	// NOTE: The bundled node-bin/ contains only `node` (not `npm`), so we must
	// also find the npm bin dir separately and add it to PATH.
	const nodeBinDir =
		nodeBin && nodeBin !== "node" ? path.dirname(nodeBin) : null;
	const npmBinDir = IS_DEV ? findNpmBinDir(22, nodeBin) : null;

	// Warn the user if npm can't be found — widgets won't build without it.
	// This is non-fatal: the dashboard and all other features still work.
	if (IS_DEV && !npmBinDir) {
		console.warn("[main] npm not found — widget builds will fail");
		// Show the warning after the window is ready so it overlays the app.
		app.whenReady().then(() => {
			dialog
				.showMessageBox(mainWindow || null, {
					type: "warning",
					title: "Node.js Required for Widgets",
					message: "npm (Node.js) was not found on your system.",
					detail:
						"Widgets are built using npm. Without it, all widgets will show " +
						'a "Build failed" error.\n\n' +
						"To fix this:\n" +
						"  1. Download and install Node.js 22 from https://nodejs.org\n" +
						'  2. Click "Restart App" below — the app will relaunch and\n' +
						"     pick up the newly installed Node.js automatically.\n\n" +
						"The rest of the app continues to work normally.",
					buttons: ["Dismiss", "Download Node.js", "Restart App"],
					defaultId: 1,
					cancelId: 0,
				})
				.then(({ response }) => {
					if (response === 1) {
						// Open Node.js download page
						shell.openExternal("https://nodejs.org/en/download/");
					} else if (response === 2) {
						// Relaunch the app immediately so the updated PATH is picked up
						app.relaunch();
						app.exit(0);
					}
				})
				.catch(() => {});
		});
	}

	const pathParts = [];
	if (nodeBinDir) pathParts.push(nodeBinDir);
	if (npmBinDir && npmBinDir !== nodeBinDir) pathParts.push(npmBinDir);
	pathParts.push(process.env.PATH || "");
	const extendedPath = pathParts.join(path.delimiter);

	const env = {
		...process.env,
		PORT: String(port),
		HOSTNAME: "127.0.0.1",
		DATABASE_PATH: dbPath,
		NEXT_TELEMETRY_DISABLED: "1",
		PATH: extendedPath,
	};

	let cmd, args, cwd;

	if (IS_DEV) {
		// Development: run `next dev` directly in the prepared runtime tree.
		// Spawn `node next.js dev` explicitly instead of the .bin/next shell wrapper
		// so that we control which Node binary executes Next.js — critical because
		// better-sqlite3 and isolated-vm are compiled for Node 22 ABI.
		if (!fs.existsSync(WEB_DIR)) {
			showFatalError(
				`Prepared runtime directory not found:\n${WEB_DIR}\n\n` +
					"Run `node scripts/apply-overlay.js` or `pnpm run dev` again.",
			);
			return;
		}

		// next.js entry point — works with both npm and pnpm workspace symlinks.
		// Try `next` (Next.js 15+) and fall back to `next.js` (older versions).
		const nextModuleBase = path.join(
			WEB_DIR,
			"node_modules",
			"next",
			"dist",
			"bin",
		);
		const nextModulePath = fs.existsSync(path.join(nextModuleBase, "next"))
			? path.join(nextModuleBase, "next")
			: path.join(nextModuleBase, "next.js");
		if (!fs.existsSync(nextModulePath)) {
			showFatalError(
				`Next.js not found at:\n${nextModuleBase}\n\n` +
					"Run  pnpm install  from the desktop/ directory first.",
			);
			return;
		}

		if (!nodeBin) {
			showFatalError(
				"Node.js 22 is required but was not found.\n\n" +
					"Install it via nvm:  nvm install 22\n" +
					"Or download from https://nodejs.org",
			);
			return;
		}

		env.NODE_ENV = "development";
		cmd = nodeBin;
		args = [nextModulePath, "dev", "--port", String(port)];
		cwd = WEB_DIR;
	} else {
		// Production: run the bundled Next.js standalone server
		if (!nodeBin) {
			showFatalError(
				"Node.js 22 is required but was not found on this system.\n\n" +
					"Install Node.js 22 from https://nodejs.org and restart the app.",
			);
			return;
		}

		// Locate server.js: Next.js standalone output may be flat or nested under
		// the traced project directory (for example `.web-runtime/server.js`).
		const serverRoot = path.join(RESOURCES_PATH, "web-server");
		const serverScript = findNestedServerScript(serverRoot);

		if (!serverScript) {
			showFatalError(
				`Bundled server not found under:\n${serverRoot}\n\n` +
					"The app package may be corrupt. Please reinstall.",
			);
			return;
		}

		env.NODE_ENV = "production";
		cmd = nodeBin;
		args = [serverScript];
		cwd = path.dirname(serverScript);
	}

	nextProcess = spawn(cmd, args, {
		cwd,
		env,
		stdio: ["ignore", "pipe", "pipe"],
		detached: false,
	});

	// Collect stderr so we can surface it if the process crashes during startup
	let stderrBuf = "";
	const STDERR_MAX = 2000;

	nextProcess.stdout.on("data", (d) => process.stdout.write(`[web] ${d}`));
	nextProcess.stderr.on("data", (d) => {
		process.stderr.write(`[web] ${d}`);
		stderrBuf += d.toString();
		if (stderrBuf.length > STDERR_MAX) stderrBuf = stderrBuf.slice(-STDERR_MAX);
	});

	nextProcess.on("error", (err) => {
		console.error("[web] spawn error:", err.message);
		showFatalError(`Failed to start the web server:\n${err.message}`);
	});

	nextProcess.on("exit", (code, signal) => {
		if (app.isQuitting) return;
		if (signal === "SIGTERM") return; // clean shutdown
		if (code !== 0) {
			console.error(`[web] process exited unexpectedly (code=${code})`);
			// Surface the error immediately instead of waiting for the 90 s timeout.
			// Also cancel any in-progress waitForServer so it stops polling.
			const detail = stderrBuf.trim()
				? stderrBuf.trim().split("\n").slice(-12).join("\n")
				: `Exit code ${code}`;
			const msg = `Web server crashed on startup:\n\n${detail}`;
			if (serverAbort) {
				serverAbort.abort(new Error(msg));
			} else {
				showFatalError(msg);
			}
		}
	});
}

// ── Window ────────────────────────────────────────────────────────────────────

/** Creates the main BrowserWindow and shows the loading screen. */
function createWindow() {
	const iconPath = path.join(RESOURCES_PATH, "assets", "icon.png");

	const isMac = process.platform === "darwin";

	mainWindow = new BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 960,
		minHeight: 640,
		show: false,
		backgroundColor: "#09090b", // matches the app's dark background; prevents white flash
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			// No preload needed in phase 1 – the web app is the source of truth
		},
		// macOS: hide the title bar but keep native traffic-light buttons visible.
		// The web app header acts as the drag region (see page.tsx).
		titleBarStyle: isMac ? "hiddenInset" : "default",
		...(isMac ? { trafficLightPosition: { x: 16, y: 14 } } : {}),
		title: "Infinite Monitor",
		...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
	});

	// Show loading HTML while the Next.js server warms up
	mainWindow.loadURL(
		`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml())}`,
	);

	mainWindow.once("ready-to-show", () => {
		mainWindow.show();
		// DevTools can be opened via View → Toggle Developer Tools (Ctrl+Shift+I / Cmd+Alt+I)
		// Auto-opening DevTools detached steals focus from the window and breaks
		// focus-sensitive UI components (like dropdowns in Base UI).
	});

	// Handle failed loads (network errors, etc.)
	mainWindow.webContents.on("did-fail-load", (_ev, code, desc, url) => {
		// Ignore the data: URL for the loading screen; only handle real app failures
		if (url && url.startsWith("data:")) return;
		console.warn(`[window] did-fail-load: ${code} ${desc} (${url})`);
		showErrorPage(
			`Could not load the application (${code}: ${desc}).\n\n` +
				"Try reloading. If the issue persists, restart the app.",
		);
	});

	// Open external links in the system browser instead of navigating the app window
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (isAppUrl(url)) return { action: "allow" };
		shell.openExternal(url);
		return { action: "deny" };
	});

	mainWindow.webContents.on("will-navigate", (ev, url) => {
		if (!isAppUrl(url)) {
			ev.preventDefault();
			shell.openExternal(url);
		}
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});

	buildMenu({ isDevMode: IS_DEV, mainWindow });
}

/** True if `url` is a URL served by our local Next.js server. */
function isAppUrl(url) {
	if (!appPort) return false;
	try {
		const { hostname, port } = new URL(url);
		return (
			(hostname === "127.0.0.1" || hostname === "localhost") &&
			(!port || port === String(appPort))
		);
	} catch (_) {
		return false;
	}
}

/** Navigate the main window to the running app. */
function loadApp() {
	if (!mainWindow) return;
	mainWindow.loadURL(`http://127.0.0.1:${appPort}`).catch((err) => {
		console.error("[window] loadURL failed:", err.message);
		showErrorPage(err.message);
	});
}

// ── Error / loading HTML ──────────────────────────────────────────────────────

function loadingHtml() {
	// The infinity path used in every SVG layer — viewBox 0 0 200 100
	var INF =
		"M100,50 C100,25 82,6 56,6 C30,6 4,24 4,50 C4,76 30,94 56,94 C82,94 100,75 100,50 C100,25 118,6 144,6 C170,6 196,24 196,50 C196,76 170,94 144,94 C118,94 100,75 100,50 Z";

	return (
		'<!DOCTYPE html>\n<html lang="en"><head>\n<meta charset="utf-8">\n<title>Infinite Monitor</title>\n<style>\n' +
		"  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\n" +
		"\n" +
		"  body {\n" +
		"    background: #08080b;\n" +
		"    display: flex;\n" +
		"    flex-direction: column;\n" +
		"    align-items: center;\n" +
		"    justify-content: center;\n" +
		"    height: 100vh;\n" +
		"    overflow: hidden;\n" +
		"    user-select: none;\n" +
		"    -webkit-user-select: none;\n" +
		"    -webkit-app-region: drag;\n" +
		'    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;\n' +
		"  }\n" +
		"\n" +
		"  /* deep ambient glow — breathes slowly */\n" +
		"  body::before {\n" +
		'    content: "";\n' +
		"    position: absolute;\n" +
		"    width: 480px; height: 320px;\n" +
		"    background: radial-gradient(ellipse, rgba(79,70,229,0.07) 0%, rgba(109,40,217,0.03) 40%, transparent 70%);\n" +
		"    pointer-events: none;\n" +
		"    animation: breathe 4s ease-in-out infinite;\n" +
		"  }\n" +
		"\n" +
		"  .wrap {\n" +
		"    display: flex;\n" +
		"    flex-direction: column;\n" +
		"    align-items: center;\n" +
		"    position: relative;\n" +
		"    opacity: 0;\n" +
		"    animation: fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) forwards 0.1s;\n" +
		"  }\n" +
		"\n" +
		"  /* track = the dim always-visible skeleton of the ∞ */\n" +
		"  .inf-track  { fill: none; stroke: #18181c; stroke-width: 2; }\n" +
		"\n" +
		"  /* outer glow — wide, blurred, follows the snake */\n" +
		"  .inf-outer  { fill: none; stroke: #6d28d9; stroke-width: 14; stroke-linecap: round; opacity: 0.25; filter: url(#softBlur); }\n" +
		"\n" +
		"  /* mid glow — medium blur */\n" +
		"  .inf-mid    { fill: none; stroke: #7c3aed; stroke-width: 6;  stroke-linecap: round; opacity: 0.5;  filter: url(#tinyBlur); }\n" +
		"\n" +
		"  /* main crisp stroke — gradient indigo→violet */\n" +
		"  .inf-main   { fill: none; stroke: url(#snakeGrad); stroke-width: 2.5; stroke-linecap: round; }\n" +
		"\n" +
		"  /* bright specular edge — thin white layer on top */\n" +
		"  .inf-bright { fill: none; stroke: #ede9fe; stroke-width: 0.9; stroke-linecap: round; opacity: 0.55; }\n" +
		"\n" +
		"  /* lead dot glow ring + core */\n" +
		"  .lead-ring  { fill: #a78bfa; filter: url(#tinyBlur); opacity: 0.7; }\n" +
		"  .lead-core  { fill: #ffffff; }\n" +
		"\n" +
		"  /* ── text ── */\n" +
		"  .app-name {\n" +
		"    margin-top: 28px;\n" +
		"    font-size: 10px;\n" +
		"    font-weight: 500;\n" +
		"    letter-spacing: 0.28em;\n" +
		"    text-transform: uppercase;\n" +
		"    color: #3f3f46;\n" +
		"    opacity: 0;\n" +
		"    animation: fadeIn 0.5s ease forwards 0.5s;\n" +
		"  }\n" +
		"  .tagline {\n" +
		"    margin-top: 5px;\n" +
		"    font-size: 9px;\n" +
		"    letter-spacing: 0.06em;\n" +
		"    color: #27272a;\n" +
		"    opacity: 0;\n" +
		"    animation: fadeIn 0.5s ease forwards 0.8s;\n" +
		"  }\n" +
		"\n" +
		"  /* ── loading pulse dots ── */\n" +
		"  .dots {\n" +
		"    display: flex; gap: 5px;\n" +
		"    margin-top: 28px;\n" +
		"    opacity: 0;\n" +
		"    animation: fadeIn 0.4s ease forwards 1.1s;\n" +
		"  }\n" +
		"  .dots span { width: 3px; height: 3px; border-radius: 50%; background: #3f3f46; }\n" +
		"  .dots span:nth-child(1) { animation: blink 1.5s 0.00s ease-in-out infinite; }\n" +
		"  .dots span:nth-child(2) { animation: blink 1.5s 0.25s ease-in-out infinite; }\n" +
		"  .dots span:nth-child(3) { animation: blink 1.5s 0.50s ease-in-out infinite; }\n" +
		"\n" +
		"  /* ── keyframes ── */\n" +
		"  @keyframes fadeUp  { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }\n" +
		"  @keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }\n" +
		"  @keyframes breathe { 0%,100% { opacity:0.6; transform:scale(1);    } 50% { opacity:1; transform:scale(1.08); } }\n" +
		"  @keyframes blink   { 0%,80%,100% { opacity:0.15; } 40% { opacity:1; } }\n" +
		"  /* snake keyframe is injected by JS after path length is measured */\n" +
		"</style>\n" +
		"</head>\n" +
		"<body>\n" +
		'<div class="wrap">\n' +
		'  <svg id="logo" width="200" height="100" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">\n' +
		"    <defs>\n" +
		"      <!-- blur filters for glow layers -->\n" +
		'      <filter id="softBlur" x="-30%" y="-30%" width="160%" height="160%">\n' +
		'        <feGaussianBlur stdDeviation="5"/>\n' +
		"      </filter>\n" +
		'      <filter id="tinyBlur" x="-20%" y="-20%" width="140%" height="140%">\n' +
		'        <feGaussianBlur stdDeviation="2.5"/>\n' +
		"      </filter>\n" +
		"      <!-- gradient travels with the snake via userSpaceOnUse coords -->\n" +
		'      <linearGradient id="snakeGrad" gradientUnits="userSpaceOnUse" x1="4" y1="50" x2="196" y2="50">\n' +
		'        <stop offset="0%"   stop-color="#6366f1"/>\n' +
		'        <stop offset="40%"  stop-color="#a78bfa"/>\n' +
		'        <stop offset="70%"  stop-color="#c4b5fd"/>\n' +
		'        <stop offset="100%" stop-color="#6366f1"/>\n' +
		"      </linearGradient>\n" +
		"    </defs>\n" +
		"\n" +
		"    <!-- ① skeleton track -->\n" +
		'    <path class="inf-track" d="' +
		INF +
		'"/>\n' +
		"\n" +
		"    <!-- ② outer glow snake -->\n" +
		'    <path class="inf-outer" id="lOuter" d="' +
		INF +
		'"/>\n' +
		"\n" +
		"    <!-- ③ mid glow snake -->\n" +
		'    <path class="inf-mid"   id="lMid"   d="' +
		INF +
		'"/>\n' +
		"\n" +
		"    <!-- ④ main crisp snake -->\n" +
		'    <path class="inf-main"  id="lMain"  d="' +
		INF +
		'"/>\n' +
		"\n" +
		"    <!-- ⑤ bright specular snake -->\n" +
		'    <path class="inf-bright" id="lBright" d="' +
		INF +
		'"/>\n' +
		"\n" +
		"    <!-- ⑥ lead dot: glow ring + hard core -->\n" +
		'    <circle class="lead-ring" id="dotRing" cx="100" cy="50" r="6"/>\n' +
		'    <circle class="lead-core" id="dotCore" cx="100" cy="50" r="2.2"/>\n' +
		"  </svg>\n" +
		"\n" +
		'  <p class="app-name">Infinite Monitor</p>\n' +
		'  <p class="tagline">AI-Powered Dashboard</p>\n' +
		'  <div class="dots"><span></span><span></span><span></span></div>\n' +
		"</div>\n" +
		"\n" +
		"<script>\n" +
		"(function () {\n" +
		'  var REF    = document.getElementById("lMain");\n' +
		"  var layers = [\n" +
		'    { el: document.getElementById("lOuter"),  seg: 0.30, delay: 0      },\n' +
		'    { el: document.getElementById("lMid"),    seg: 0.26, delay: 0.025  },\n' +
		'    { el: document.getElementById("lMain"),   seg: 0.24, delay: 0.05   },\n' +
		'    { el: document.getElementById("lBright"), seg: 0.18, delay: 0.08   },\n' +
		"  ];\n" +
		'  var dotRing = document.getElementById("dotRing");\n' +
		'  var dotCore = document.getElementById("dotCore");\n' +
		"\n" +
		"  var L  = REF.getTotalLength();   // exact path length\n" +
		"  var DUR = 2800;                  // ms per revolution\n" +
		"\n" +
		"  // Build the @keyframes rule once we know L\n" +
		'  var st = document.createElement("style");\n' +
		'  st.textContent = "@keyframes snake { from { stroke-dashoffset: 0 } to { stroke-dashoffset: -" + L + " } }";\n' +
		"  document.head.appendChild(st);\n" +
		"\n" +
		"  // Apply dasharray + animation to each layer\n" +
		"  layers.forEach(function (cfg) {\n" +
		"    var seg = L * cfg.seg;\n" +
		"    var gap = L - seg;\n" +
		'    cfg.el.style.strokeDasharray  = seg + " " + gap;\n' +
		'    cfg.el.style.strokeDashoffset = "0";\n' +
		"    // negative delay = start mid-animation so it's immediately visible\n" +
		'    cfg.el.style.animation = "snake " + DUR + "ms linear -" + (cfg.delay * DUR) + "ms infinite";\n' +
		"  });\n" +
		"\n" +
		"  // Lead dot follows the HEAD of the main snake via rAF\n" +
		"  var mainSeg = L * 0.24;\n" +
		"  var t0 = null;\n" +
		"  function frame(ts) {\n" +
		"    if (!t0) t0 = ts;\n" +
		"    var progress = ((ts - t0) % DUR) / DUR;               // 0‥1 cycling\n" +
		"    var headPos  = (progress * L + mainSeg) % L;           // head of main snake\n" +
		"    var pt = REF.getPointAtLength(headPos);\n" +
		'    dotRing.setAttribute("cx", pt.x);\n' +
		'    dotRing.setAttribute("cy", pt.y);\n' +
		'    dotCore.setAttribute("cx", pt.x);\n' +
		'    dotCore.setAttribute("cy", pt.y);\n' +
		"    requestAnimationFrame(frame);\n" +
		"  }\n" +
		"  requestAnimationFrame(frame);\n" +
		"})();\n" +
		"<\/script>\n" +
		"</body>\n" +
		"</html>"
	);
}

function errorHtml(message) {
	const safe = message
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Error – Infinite Monitor</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #09090b;
    color: #f4f4f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 100vh; gap: 12px; padding: 32px;
    -webkit-app-region: drag;
  }
  h1 { font-size: 15px; color: #f87171; font-weight: 500; }
  p  { font-size: 13px; color: #71717a; max-width: 500px; text-align: center; line-height: 1.6; }
  pre {
    font-size: 11px; color: #52525b; background: #18181b;
    padding: 12px 16px; border-radius: 6px;
    max-width: 540px; width: 100%;
    white-space: pre-wrap; word-break: break-all;
    border: 1px solid #27272a;
  }
  button {
    margin-top: 4px; padding: 7px 18px;
    background: #27272a; color: #e4e4e7;
    border: 1px solid #3f3f46; border-radius: 6px;
    font-size: 13px; cursor: pointer;
    -webkit-app-region: no-drag;
    transition: background 0.15s;
  }
  button:hover { background: #3f3f46; }
</style>
</head>
<body>
  <h1>Failed to start</h1>
  <pre>${safe}</pre>
  <p>Make sure Node.js 22+ is installed and reachable, then try again.</p>
  <button onclick="location.reload()">Reload</button>
</body>
</html>`;
}

function showFatalError(message) {
	console.error("[main] fatal:", message);
	if (mainWindow) {
		mainWindow.loadURL(
			`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml(message))}`,
		);
	} else {
		dialog.showErrorBox("Infinite Monitor – Startup Error", message);
	}
}

function showErrorPage(message) {
	if (!mainWindow) return;
	mainWindow.loadURL(
		`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml(message))}`,
	);
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
	// Deny any webview attachment attempts (defence-in-depth)
	app.on("web-contents-created", (_ev, contents) => {
		contents.on("will-attach-webview", (ev) => ev.preventDefault());
	});

	// Mark for clean shutdown detection
	app.isQuitting = false;

	try {
		appPort = await findFreePort(PREFERRED_PORT);
		createWindow();
		serverAbort = new AbortController();
		startServer(appPort);
		await waitForServer(appPort, 90_000, serverAbort.signal);
		serverAbort = null;
		loadApp();
		// Skip GitHub update check for Mac App Store builds — the App Store
		// handles distribution and updates for those builds automatically.
		// process.mas is true when running inside the MAS sandbox.
		if (!process.mas) {
			scheduleUpdateCheck(mainWindow);
		}
	} catch (err) {
		serverAbort = null;
		console.error("[main] startup failed:", err);
		showFatalError(err.message);
	}
});

app.on("activate", () => {
	// macOS: re-open window when clicking Dock icon with no windows open
	if (BrowserWindow.getAllWindows().length === 0 && appPort) {
		createWindow();
		loadApp();
	}
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
	app.isQuitting = true;
});

app.on("will-quit", () => {
	if (nextProcess) {
		nextProcess.kill("SIGTERM");
		nextProcess = null;
	}
});
