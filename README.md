# Infinite Monitor – Desktop

A native desktop wrapper for the [Infinite Monitor](https://github.com/homanp/infinite-monitor)
AI-powered dashboard builder. The dashboard UI is served from a locally-running
Next.js server; the Electron shell only manages the window and process lifecycle.

---

## Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 22+ | Required at **runtime** in production builds; install from [nodejs.org](https://nodejs.org) |
| npm | 9+ | Comes with Node.js |

---

## Directory layout

```
infinite-monitor/
├── web/          ← upstream Next.js app (source of truth)
└── desktop/      ← this project (Electron shell)
```

Both directories must exist at the same level.

---

## Setup

### 1. Install web app dependencies

```sh
cd ../web
npm install
```

### 2. Install desktop dependencies

```sh
cd ../desktop
npm install
```

### 3. Generate placeholder icons (first time only)

```sh
npm run generate-icons
```

This creates `assets/icon.png`. Replace it with your real artwork before distributing.

---

## Development

Start the desktop app in development mode:

```sh
npm run dev
```

What happens:
1. Electron starts.
2. `main.js` spawns `next dev` in `../web` on a random port (default 3847).
3. A loading screen is shown while Next.js warms up (takes ~5–15 s first time).
4. Once ready, the BrowserWindow navigates to `http://127.0.0.1:{port}`.
5. Developer Tools open automatically.

Hot reload works normally – edit files in `../web/src/` and the page refreshes.

To restart only Electron (without restarting the web server), close and reopen
the app window; the Next.js child process is restarted automatically.

---

## Production build

### 1. Verify `next.config.ts` has standalone output enabled

```ts
// web/next.config.ts
const nextConfig: NextConfig = {
  output: "standalone",   // ← must be present
  // ...
};
```

This is already applied. See `ARCHITECTURE.md` for why.

### 2. Build

```sh
# All platforms (current OS only)
npm run build

# Explicit targets
npm run build:mac
npm run build:win
npm run build:linux
```

The build pipeline:
1. Generates icons (`scripts/generate-icons.js`).
2. Runs `npm run build` in `../web` (produces `.next/standalone/`).
3. Copies the standalone server to `web-build/` (via `scripts/prepare-web.js`).
4. Runs `electron-builder` to package everything into `dist/`.

### Output locations

| Platform | Output |
|----------|--------|
| macOS | `dist/Infinite Monitor-{version}.dmg` + `.zip` |
| Windows | `dist/Infinite Monitor Setup {version}.exe` |
| Linux | `dist/Infinite Monitor-{version}.AppImage` + `.deb` |

---

## User data

The SQLite database and any future app preferences are stored in the platform's
standard application data directory:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/infinite-monitor-desktop/` |
| Windows | `%APPDATA%\infinite-monitor-desktop\` |
| Linux | `~/.config/infinite-monitor-desktop/` |

The database path is `data/widgets.db` inside that directory.
It is separate from the `web/data/` directory, so development and production
data do not interfere.

**File → Help → Open Data Directory** in the app menu opens this folder.

---

## Icons

Replace the placeholder with real artwork before distributing:

1. Place a 1024×1024 PNG at `assets/icon.png`.
2. Install the icon builder:
   ```sh
   npm install --save-dev electron-icon-builder
   ```
3. Generate platform formats:
   ```sh
   npx electron-icon-builder --input=assets/icon.png --output=assets/ --flatten
   ```
   This produces `assets/icon.icns` (macOS) and `assets/icon.ico` (Windows).

---

## macOS code signing & notarisation

For App Store or direct distribution, add your signing credentials:

```sh
# environment variables (or use a .env file – never commit credentials)
export CSC_LINK="path/to/Developer_ID_Application.p12"
export CSC_KEY_PASSWORD="your-p12-password"
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

Then uncomment `notarize: true` in `electron-builder.yml` and rebuild.

---

## Updating from upstream

When new commits land in `../web`:

```sh
cd ../web
git pull
npm install          # if dependencies changed
cd ../desktop
npm run build        # rebuilds the standalone server and repackages
```

No Electron code changes are needed for pure web app updates.

---

## Troubleshooting

### "Web source directory not found"
Make sure `../web` exists relative to `desktop/`. The expected layout:
```
infinite-monitor/
├── web/
└── desktop/
```

### "Node.js binary not found" (production app)
Node.js 22+ must be installed and accessible. If you installed via nvm, make sure
`nvm use 22` has been run and the binary is in a standard location.

### "next binary not found" (development mode)
Run `npm install` in `../web` first.

### App shows a white flash before the dark UI loads
This is suppressed by setting `backgroundColor: '#09090b'` on the BrowserWindow.
If you still see it, it is a timing issue specific to your system; it has no
functional effect.

### Port conflict
The app picks a free port starting at 3847. If it can't bind, it falls back to
any available OS-assigned port. You should not need to configure ports manually.

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for:
- Why the local server approach was chosen over loading the hosted site
- Layer diagram
- Security posture
- Upstream compatibility strategy
- Phase 2 extension points
