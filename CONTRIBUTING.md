# Contributing to Infinite Monitor Desktop

Thank you for your interest in contributing! This guide covers everything you need to set up, develop, build, and release the desktop app.

---

## Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 22 | Required at install **and** runtime; use nvm: `nvm install 22` |
| pnpm | 10+ | `npm install -g pnpm` |
| git | 2.20+ | Required for submodule support |

---

## Directory layout

```
desktop/
  web/          ← git submodule — upstream Next.js app (READ ONLY)
  .web-runtime/ ← git-ignored runtime copy used by dev/build
  overlay/      ← all desktop-specific modifications
  electron/     ← Electron main process & native menu
  scripts/      ← setup, upstream, release, build helpers
  assets/       ← app icons
  .github/
    workflows/
      release.yml  ← cross-platform CI build & GitHub Release
```

---

## First-time setup

Clone the desktop repo and run:

```sh
git clone https://github.com/mehdiraized/infinite-monitor-desktop.git
cd infinite-monitor-desktop
nvm use 22          # ensure Node 22
pnpm run setup      # initialise everything
```

`pnpm run setup` handles everything:
1. Initializes the `web/` git submodule
2. Adds the `upstream` remote inside `web/`
3. Installs `web/` dependencies
4. Builds `.web-runtime/` from `web/` and links the desktop overlay into it

---

## Development

```sh
nvm use 22
pnpm run dev
```

What happens automatically:
1. `predev` rebuilds `.web-runtime/` from the clean `web/` submodule and links in `overlay/`.
2. Electron starts and spawns `next dev` inside `.web-runtime/` on a free port (default 3847).
3. A loading screen is shown while Next.js warms up (~5–15 s first time).
4. Once ready, the BrowserWindow navigates to `http://127.0.0.1:{port}`.
5. DevTools open automatically.

Hot reload works normally — overlay files are linked into `.web-runtime/`, so edits in `overlay/src/` are reflected immediately.

---

## Syncing with upstream

When new commits land in the original repo:

```sh
pnpm run upstream
```

This single command:
1. Resets `web/` to clean upstream state and removes `.web-runtime/`
2. Fetches and merges `upstream/main` into `web/`
3. Reinstalls workspace dependencies if needed
4. Rebuilds `.web-runtime/`

Then commit the updated pointer:

```sh
git commit -m "chore: update web submodule to latest upstream"
```

---

## Making desktop-only changes

All modifications live in `overlay/` — never edit `web/` directly.

1. Create or edit the file under `overlay/` using the same relative path as in `web/`
2. Apply and test:
   ```sh
   node scripts/apply-overlay.js
   pnpm run dev
   ```
3. Commit the change in `overlay/`

To undo accidental edits in `web/`:
```sh
node scripts/reset-overlay.js
```

---

## Production build

```sh
# Current platform only
pnpm run build

# Explicit targets
pnpm run build:mac
pnpm run build:win
pnpm run build:linux
```

The build pipeline (runs automatically):
1. Generates icons
2. Rebuilds `.web-runtime/` (`prebuild` hook)
3. Builds the Next.js app in `.web-runtime/` (produces `.next/standalone/`)
4. Assembles the standalone server into `web-build/`
5. Packages everything with `electron-builder` → `dist/`

### Output locations

| Platform | Output |
|----------|--------|
| macOS | `dist/Infinite Monitor-{version}.dmg` + `.zip` (x64 & arm64) |
| Windows | `dist/Infinite Monitor Setup {version}.exe` (x64) |
| Linux | `dist/Infinite Monitor-{version}.AppImage` + `.deb` (x64) |

---

## Releasing

Releases are fully automated via GitHub Actions. To publish a new release:

```sh
# 1. Bump the version
npm version patch    # or: minor | major

# 2. Tag and push — GitHub Actions does the rest
pnpm run release
```

`pnpm run release` creates an annotated git tag (`v{version}`) and pushes it to
`origin`. The CI workflow (`.github/workflows/release.yml`) then:

- Builds macOS, Windows, and Linux **in parallel**
- Creates a GitHub Release with auto-generated release notes
- Uploads all platform artifacts

> Tip: run `pnpm run release -- --dry` to simulate without creating a tag.

---

## User data

The SQLite database and app preferences are stored in the platform's standard
application data directory:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/infinite-monitor-desktop/` |
| Windows | `%APPDATA%\infinite-monitor-desktop\` |
| Linux | `~/.config/infinite-monitor-desktop/` |

**Help → Open Data Directory** in the app menu opens this folder.

---

## Icons

The icon is generated automatically during build from `assets/icon.png`.
To regenerate it:

```sh
pnpm run generate-icons
```

electron-builder converts the 512×512 PNG to `.icns` (macOS) and `.ico` (Windows) at build time.
To use custom artwork, replace `assets/icon.png` with a 1024×1024 PNG and re-run the command above.

---

## macOS code signing & notarisation

For direct distribution or App Store submission, set these environment variables
before building (never commit credentials):

```sh
export CSC_LINK="path/to/Developer_ID_Application.p12"
export CSC_KEY_PASSWORD="your-p12-password"
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

Then uncomment `notarize: true` in `electron-builder.yml` and rebuild.

---

## Troubleshooting

### `web/` directory is empty after clone
Run `pnpm run setup` — it initializes the git submodule.

### "Node.js binary not found" (production app)
Node.js 22+ must be installed. If you use nvm, run `nvm use 22` first.

### "next binary not found" (development mode)
Run `pnpm run setup` or `pnpm install` inside `web/` manually.

### App shows a white flash before the UI loads
This is suppressed by `backgroundColor: '#09090b'` on the BrowserWindow. If it
still appears it is a display timing issue with no functional effect.

### Port conflict
The app picks a free port starting at 3847 and falls back to any available
OS-assigned port. No manual port configuration is needed.

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for:
- Why the local server approach was chosen over the hosted site
- Layer diagram
- Security posture
- Upstream compatibility strategy
