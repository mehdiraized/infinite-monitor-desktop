'use strict';

/**
 * settings-window.js
 *
 * Creates and manages the Settings window.
 * IPC handlers read/write the web app's Zustand localStorage store
 * (key: "infinite-monitor-settings") via mainWindow.webContents.executeJavaScript.
 */

const { BrowserWindow, ipcMain, shell, app, nativeTheme } = require('electron');
const path = require('path');
const fs   = require('fs');

const SETTINGS_KEY  = 'infinite-monitor-settings';   // Zustand persist key
const THEME_KEY     = 'im-desktop-theme';             // separate key for theme pref
const RELEASES_URL  = 'https://github.com/mehdiraized/infinite-monitor-desktop/releases';

/** @type {BrowserWindow|null} */
let win = null;

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the current main window (largest non-settings window).
 * Uses getAllWindows() so it always reflects the live reference.
 */
function getMainWindow() {
  return BrowserWindow.getAllWindows().find(w => w !== win && !w.isDestroyed()) || null;
}

/**
 * Read the full Zustand store from mainWindow's localStorage.
 * Returns { selectedModel, apiKeys, searchProvider, mcpServers, customApis }
 * or an empty object on failure.
 */
async function readStore(mainWindow) {
  if (!mainWindow) return {};
  try {
    const raw = await mainWindow.webContents.executeJavaScript(
      `localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})`
    );
    if (!raw) return {};
    return JSON.parse(raw).state ?? {};
  } catch (_) { return {}; }
}

/**
 * Patch a subset of the Zustand store in mainWindow's localStorage.
 * Merges `patch` into `state` without touching other keys.
 */
async function patchStore(mainWindow, patch) {
  if (!mainWindow) return;
  try {
    const raw = await mainWindow.webContents.executeJavaScript(
      `localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})`
    );
    const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 };
    parsed.state = { ...parsed.state, ...patch };
    await mainWindow.webContents.executeJavaScript(
      `localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, ${JSON.stringify(JSON.stringify(parsed))})`
    );
    // Trigger Zustand's storage event so the web app re-hydrates
    await mainWindow.webContents.executeJavaScript(
      `window.dispatchEvent(new StorageEvent('storage', { key: ${JSON.stringify(SETTINGS_KEY)} }))`
    );
  } catch (_) { /* ignore */ }
}

async function readTheme(mainWindow) {
  if (!mainWindow) return 'dark';
  try {
    const val = await mainWindow.webContents.executeJavaScript(
      `localStorage.getItem(${JSON.stringify(THEME_KEY)})`
    );
    return val || 'dark';
  } catch (_) { return 'dark'; }
}

async function applyTheme(mainWindow, theme) {
  if (!mainWindow) return;
  try {
    await mainWindow.webContents.executeJavaScript(
      `localStorage.setItem(${JSON.stringify(THEME_KEY)}, ${JSON.stringify(theme)})`
    );
    // Inject/remove the light-mode class on <html>
    if (theme === 'light') {
      await mainWindow.webContents.executeJavaScript(
        `document.documentElement.classList.add('im-light-theme')`
      );
    } else {
      await mainWindow.webContents.executeJavaScript(
        `document.documentElement.classList.remove('im-light-theme')`
      );
    }
  } catch (_) { /* ignore */ }
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

let handlersRegistered = false;

function registerHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle('settings:get-app-info', () => ({
    name:    app.getName(),
    version: app.getVersion(),
    description: 'AI-powered dashboard builder',
  }));

  ipcMain.handle('settings:get-all', async () => {
    const mw = getMainWindow();
    const store = await readStore(mw);
    const theme = await readTheme(mw);
    return { apiKeys: store.apiKeys || {}, theme };
  });

  ipcMain.handle('settings:set-api-key', async (_e, provider, key) => {
    const mw = getMainWindow();
    const store = await readStore(mw);
    const apiKeys = { ...(store.apiKeys || {}), [provider]: key };
    await patchStore(mw, { apiKeys });
  });

  ipcMain.handle('settings:remove-api-key', async (_e, provider) => {
    const mw = getMainWindow();
    const store = await readStore(mw);
    const apiKeys = { ...(store.apiKeys || {}) };
    delete apiKeys[provider];
    await patchStore(mw, { apiKeys });
  });

  ipcMain.handle('settings:get-theme', async () => {
    return readTheme(getMainWindow());
  });

  ipcMain.handle('settings:set-theme', async (_e, theme) => {
    await applyTheme(getMainWindow(), theme);
    if (win) win.webContents.send('theme-changed', theme);
  });

  ipcMain.handle('settings:check-updates', () => {
    shell.openExternal(RELEASES_URL);
  });
}

// ── window ────────────────────────────────────────────────────────────────────

function openSettingsWindow() {
  registerHandlers();

  if (win && !win.isDestroyed()) {
    win.focus();
    return;
  }

  const isMac = process.platform === 'darwin';

  win = new BrowserWindow({
    width: 620,
    height: 520,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Settings',
    backgroundColor: '#09090b',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload-settings.js'),
    },
  });

  win.loadFile(path.join(__dirname, 'settings.html'));

  win.on('closed', () => { win = null; });

  // Prevent external navigation
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (ev) => ev.preventDefault());
}

module.exports = { openSettingsWindow };
