'use strict';

const https = require('https');
const { app, dialog, shell } = require('electron');

const RELEASES_API_URL = 'https://api.github.com/repos/mehdiraized/infinite-monitor-desktop/releases/latest';
const USER_AGENT = 'infinite-monitor-desktop/1.0.0';

// 24 hours in milliseconds
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Initial delay before first background check (30 seconds)
const INITIAL_DELAY_MS = 30 * 1000;

/**
 * Parses a semver string like "v1.2.3" or "1.2.3" into [major, minor, patch].
 * Returns [0, 0, 0] if parsing fails.
 * @param {string} version
 * @returns {[number, number, number]}
 */
function parseSemver(version) {
  const clean = version.replace(/^v/, '').trim();
  const parts = clean.split('.').map((p) => parseInt(p, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * Returns true if `remote` is strictly newer than `local`.
 * Compares major, then minor, then patch numerically.
 * @param {string} local   e.g. "1.0.0"
 * @param {string} remote  e.g. "v1.2.0"
 * @returns {boolean}
 */
function isNewerVersion(local, remote) {
  const [lMaj, lMin, lPat] = parseSemver(local);
  const [rMaj, rMin, rPat] = parseSemver(remote);

  if (rMaj !== lMaj) return rMaj > lMaj;
  if (rMin !== lMin) return rMin > lMin;
  return rPat > lPat;
}

/**
 * Fetches the latest release info from GitHub.
 * Resolves with { tag_name, html_url } or rejects on network/parse error.
 * @returns {Promise<{ tag_name: string, html_url: string }>}
 */
function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const req = https.get(
      RELEASES_API_URL,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/vnd.github+json',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (!json.tag_name) {
              reject(new Error('No tag_name in response'));
              return;
            }
            resolve({ tag_name: json.tag_name, html_url: json.html_url });
          } catch (err) {
            reject(new Error(`Failed to parse GitHub response: ${err.message}`));
          }
        });
      }
    );

    req.on('error', (err) => {
      reject(new Error(`Network error: ${err.message}`));
    });

    // 10 second timeout
    req.setTimeout(10_000, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

/**
 * Checks GitHub for a newer release and prompts the user if one is found.
 *
 * @param {Electron.BrowserWindow | null} mainWindow
 * @param {boolean} isManual  When true, always show a result dialog (even if up-to-date or on error).
 */
async function checkForUpdates(mainWindow, isManual = false) {
  const currentVersion = app.getVersion();

  try {
    const { tag_name, html_url } = await fetchLatestRelease();
    const latestVersion = tag_name.replace(/^v/, '');

    if (isNewerVersion(currentVersion, tag_name)) {
      // Update is available — prompt the user
      const { response } = await dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `Infinite Monitor v${latestVersion} is available.\nYou're running v${currentVersion}.`,
        buttons: ['Download Update', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });

      if (response === 0) {
        shell.openExternal(html_url);
      }
    } else if (isManual) {
      // Already on the latest version — inform the user only when they asked manually
      await dialog.showMessageBox({
        type: 'info',
        title: 'No Update Available',
        message: `You're up to date! v${currentVersion} is the latest version.`,
        buttons: ['OK'],
      });
    }
  } catch (err) {
    console.error('[updater] check failed:', err.message);
    if (isManual) {
      await dialog.showMessageBox({
        type: 'warning',
        title: 'Update Check Failed',
        message: 'Could not check for updates. Check your internet connection.',
        buttons: ['OK'],
      });
    }
  }
}

/**
 * Schedules automatic (silent) update checks.
 * First check runs after INITIAL_DELAY_MS (30 s), then repeats every 24 h.
 *
 * @param {Electron.BrowserWindow | null} mainWindow
 */
function scheduleUpdateCheck(mainWindow) {
  // Initial check after 30 seconds
  setTimeout(() => {
    checkForUpdates(mainWindow, false);

    // Subsequent checks every 24 hours
    setInterval(() => {
      checkForUpdates(mainWindow, false);
    }, CHECK_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}

module.exports = { checkForUpdates, scheduleUpdateCheck };
