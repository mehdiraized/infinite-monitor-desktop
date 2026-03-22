'use strict';

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

const { app, BrowserWindow, shell, dialog, nativeTheme } = require('electron');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const http = require('http');
const net = require('net');
const fs = require('fs');

const { buildMenu } = require('./menu');

// ── Constants ────────────────────────────────────────────────────────────────

const IS_DEV = !app.isPackaged;

// In dev: the desktop/ dir; in prod: Contents/Resources/
const RESOURCES_PATH = IS_DEV
  ? path.resolve(__dirname, '..')
  : process.resourcesPath;

// Sibling web/ directory used during development
const WEB_DIR = path.resolve(__dirname, '..', '..', 'web');

// Preferred port – arbitrary high number unlikely to be in use
const PREFERRED_PORT = 3847;

// ── State ────────────────────────────────────────────────────────────────────

/** @type {BrowserWindow|null} */
let mainWindow = null;
/** @type {import('child_process').ChildProcess|null} */
let nextProcess = null;
/** @type {number|null} */
let appPort = null;

// ── Port utilities ────────────────────────────────────────────────────────────

/**
 * Returns a free TCP port. Tries `preferred` first; falls back to OS-assigned.
 * @param {number} preferred
 * @returns {Promise<number>}
 */
function findFreePort(preferred) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(preferred, '127.0.0.1', () => {
      probe.close(() => resolve(preferred));
    });
    probe.on('error', () => {
      const fallback = net.createServer();
      fallback.listen(0, '127.0.0.1', () => {
        const { port } = fallback.address();
        fallback.close(() => resolve(port));
      });
    });
  });
}

/**
 * Polls http://127.0.0.1:{port}/ until it responds or times out.
 * @param {number} port
 * @param {number} [timeoutMs=90000]
 * @returns {Promise<void>}
 */
function waitForServer(port, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function attempt() {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.resume(); // drain the response
        resolve();
      });
      req.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Server on port ${port} did not respond within ${timeoutMs / 1000}s.`));
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
 * Finds the `node` executable. Tries PATH first, then common install locations.
 * Returns null if not found.
 * @returns {string|null}
 */
function resolveNodeBinary() {
  // 1. PATH lookup (works when launched from terminal)
  try {
    execFileSync('node', ['--version'], { stdio: 'ignore' });
    return 'node';
  } catch (_) { /* not in PATH */ }

  // 2. Common locations (for apps launched from macOS Dock / Windows Start)
  const candidates = [
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
    '/usr/bin/node',
    '/opt/local/bin/node',
    ...(process.env.HOME
      ? [
          // nvm default
          path.join(process.env.HOME, '.nvm', 'alias', 'default'),
        ]
      : []),
    // Windows
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        execFileSync(candidate, ['--version'], { stdio: 'ignore' });
        return candidate;
      } catch (_) { /* not executable */ }
    }
  }

  return null;
}

// ── Server launch ─────────────────────────────────────────────────────────────

/**
 * Spawns the Next.js server.
 *   - Development: `next dev --port {port}` in ../web
 *   - Production: `node server.js` using the bundled standalone output
 *
 * User data (SQLite DB) is always routed to app.getPath('userData').
 *
 * @param {number} port
 */
function startServer(port) {
  const userDataDir = app.getPath('userData');
  const dbPath = path.join(userDataDir, 'data', 'widgets.db');

  // Ensure the data directory exists before the server starts
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    DATABASE_PATH: dbPath,
    NEXT_TELEMETRY_DISABLED: '1',
  };

  let cmd, args, cwd;

  if (IS_DEV) {
    // Development: run `next dev` directly in the web source tree
    if (!fs.existsSync(WEB_DIR)) {
      showFatalError(
        `Web source directory not found:\n${WEB_DIR}\n\n` +
        'Make sure the web/ directory is present alongside desktop/.'
      );
      return;
    }

    const nextBin = process.platform === 'win32'
      ? path.join(WEB_DIR, 'node_modules', '.bin', 'next.cmd')
      : path.join(WEB_DIR, 'node_modules', '.bin', 'next');

    if (!fs.existsSync(nextBin)) {
      showFatalError(
        `Next.js binary not found at:\n${nextBin}\n\n` +
        'Run  npm install  inside the web/ directory first.'
      );
      return;
    }

    env.NODE_ENV = 'development';
    cmd = nextBin;
    args = ['dev', '--port', String(port)];
    cwd = WEB_DIR;
  } else {
    // Production: run the bundled Next.js standalone server
    const nodeBin = resolveNodeBinary();
    if (!nodeBin) {
      showFatalError(
        'Node.js 22+ is required but was not found on this system.\n\n' +
        'Install Node.js from https://nodejs.org and restart the app.'
      );
      return;
    }

    const serverScript = path.join(RESOURCES_PATH, 'web-server', 'server.js');
    if (!fs.existsSync(serverScript)) {
      showFatalError(
        `Bundled server not found at:\n${serverScript}\n\n` +
        'The app package may be corrupt. Please reinstall.'
      );
      return;
    }

    env.NODE_ENV = 'production';
    cmd = nodeBin;
    args = [serverScript];
    cwd = path.join(RESOURCES_PATH, 'web-server');
  }

  nextProcess = spawn(cmd, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  nextProcess.stdout.on('data', (d) => process.stdout.write(`[web] ${d}`));
  nextProcess.stderr.on('data', (d) => process.stderr.write(`[web] ${d}`));

  nextProcess.on('error', (err) => {
    console.error('[web] spawn error:', err.message);
    showFatalError(`Failed to start the web server:\n${err.message}`);
  });

  nextProcess.on('exit', (code, signal) => {
    if (app.isQuitting) return;
    if (code !== 0 && signal !== 'SIGTERM') {
      console.error(`[web] process exited unexpectedly (code=${code}, signal=${signal})`);
    }
  });
}

// ── Window ────────────────────────────────────────────────────────────────────

/** Creates the main BrowserWindow and shows the loading screen. */
function createWindow() {
  const iconPath = path.join(RESOURCES_PATH, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#09090b', // matches the app's dark background; prevents white flash
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // No preload needed in phase 1 – the web app is the source of truth
    },
    titleBarStyle: 'default',
    title: 'Infinite Monitor',
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
  });

  // Show loading HTML while the Next.js server warms up
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml())}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // DevTools can be opened via View → Toggle Developer Tools (Ctrl+Shift+I / Cmd+Alt+I)
    // Auto-opening DevTools detached steals focus from the window and breaks
    // focus-sensitive UI components (like dropdowns in Base UI).
  });

  // Handle failed loads (network errors, etc.)
  mainWindow.webContents.on('did-fail-load', (_ev, code, desc, url) => {
    // Ignore the data: URL for the loading screen; only handle real app failures
    if (url && url.startsWith('data:')) return;
    console.warn(`[window] did-fail-load: ${code} ${desc} (${url})`);
    showErrorPage(
      `Could not load the application (${code}: ${desc}).\n\n` +
      'Try reloading. If the issue persists, restart the app.'
    );
  });

  // Open external links in the system browser instead of navigating the app window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (ev, url) => {
    if (!isAppUrl(url)) {
      ev.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  buildMenu({ isDevMode: IS_DEV, mainWindow });
}

/** True if `url` is a URL served by our local Next.js server. */
function isAppUrl(url) {
  if (!appPort) return false;
  try {
    const { hostname, port } = new URL(url);
    return (hostname === '127.0.0.1' || hostname === 'localhost') &&
           (!port || port === String(appPort));
  } catch (_) {
    return false;
  }
}

/** Navigate the main window to the running app. */
function loadApp() {
  if (!mainWindow) return;
  mainWindow.loadURL(`http://127.0.0.1:${appPort}`).catch((err) => {
    console.error('[window] loadURL failed:', err.message);
    showErrorPage(err.message);
  });
}

// ── Error / loading HTML ──────────────────────────────────────────────────────

function loadingHtml() {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Infinite Monitor</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #09090b;
    color: #71717a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    gap: 14px;
    user-select: none;
    -webkit-user-select: none;
    -webkit-app-region: drag;
  }
  .spinner {
    width: 28px;
    height: 28px;
    border: 2px solid #27272a;
    border-top-color: #52525b;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  p { font-size: 13px; letter-spacing: 0.01em; }
</style>
</head>
<body>
  <div class="spinner"></div>
  <p>Starting Infinite Monitor…</p>
</body>
</html>`;
}

function errorHtml(message) {
  const safe = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  console.error('[main] fatal:', message);
  if (mainWindow) {
    mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(errorHtml(message))}`
    );
  } else {
    dialog.showErrorBox('Infinite Monitor – Startup Error', message);
  }
}

function showErrorPage(message) {
  if (!mainWindow) return;
  mainWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(errorHtml(message))}`
  );
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Deny any webview attachment attempts (defence-in-depth)
  app.on('web-contents-created', (_ev, contents) => {
    contents.on('will-attach-webview', (ev) => ev.preventDefault());
  });

  // Mark for clean shutdown detection
  app.isQuitting = false;

  try {
    appPort = await findFreePort(PREFERRED_PORT);
    createWindow();
    startServer(appPort);
    await waitForServer(appPort);
    loadApp();
  } catch (err) {
    console.error('[main] startup failed:', err);
    showFatalError(err.message);
  }
});

app.on('activate', () => {
  // macOS: re-open window when clicking Dock icon with no windows open
  if (BrowserWindow.getAllWindows().length === 0 && appPort) {
    createWindow();
    loadApp();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  if (nextProcess) {
    nextProcess.kill('SIGTERM');
    nextProcess = null;
  }
});
