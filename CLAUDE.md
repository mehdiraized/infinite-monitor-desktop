# Infinite Monitor Desktop — Development Rules

## CRITICAL: Never modify web/ directly

`web/` is a **git submodule** pointing to the user's fork:
- **submodule URL**: https://github.com/mehdiraized/infinite-monitor (user's fork)
- **upstream remote** (inside web/): https://github.com/homanp/infinite-monitor (original)

**`web/` must always remain in a clean git state** (no modifications, no untracked files).

Any AI assistant, developer, or tool working on this project must follow this rule without exception.

---

## Project structure

```
desktop/
  pnpm-workspace.yaml ← pnpm workspace config (includes web/ as a workspace)
  .nvmrc              ← Node version pin (22)
  .npmrc              ← pnpm config (shamefully-hoist=true)
  web/                ← git submodule (upstream source) — READ ONLY, never edit directly
  overlay/            ← ALL desktop-specific changes live here
  electron/           ← Electron main/menu
  scripts/            ← setup, update-web, apply-overlay, reset-overlay, prepare-web, release
  assets/             ← app icons
  .github/
    workflows/
      release.yml     ← cross-platform CI build + GitHub Release
```

---

## Package manager: pnpm workspaces

This project uses **pnpm workspaces** with `shamefully-hoist=true`.

Key points:
- Run all installs from `desktop/` root — **never** run `npm install` or `pnpm install` inside `web/` directly
- All packages (electron + web deps) are installed into `desktop/node_modules/` (flat, like npm)
- `web/node_modules/` contains only pnpm symlinks pointing to `desktop/node_modules/`
- Native modules (`better-sqlite3`, `isolated-vm`, etc.) are compiled **once** for Node 22
- **Must use Node 22** — both for `pnpm install` and at runtime (`.nvmrc` enforces this)

```
nvm use 22        # always use Node 22 for this project
pnpm run setup    # first-time setup
pnpm run dev      # daily development
```

---

## How desktop modifications work (Overlay system)

All desktop-specific additions and modifications live in `overlay/`.
Before running the app, the overlay is copied on top of `web/`:

```
overlay/next.config.ts                    → web/next.config.ts
overlay/public/sw.js                      → web/public/sw.js
overlay/src/app/page.tsx                  → web/src/app/page.tsx
overlay/src/app/layout.tsx                → web/src/app/layout.tsx
overlay/src/components/offline-banner.tsx → web/src/components/offline-banner.tsx
overlay/src/components/add-menu.tsx       → web/src/components/add-menu.tsx
overlay/src/components/dashboard-grid.tsx → web/src/components/dashboard-grid.tsx
overlay/src/components/onboarding.tsx     → web/src/components/onboarding.tsx
```

The `predev` and `prebuild` pnpm hooks run `apply-overlay.js` automatically.

---

## Development workflow

```bash
# ── First time (after cloning desktop/) ───────────────────────────────────
nvm install 22       # install Node 22 if not present
nvm use 22           # switch to Node 22
pnpm run setup       # init web/ submodule + pnpm install + apply overlay

# ── Daily dev ─────────────────────────────────────────────────────────────
nvm use 22           # ensure Node 22
pnpm run dev         # apply overlay → start Electron app

# ── Sync with upstream when a new version is released ─────────────────────
pnpm run upstream    # reset overlay → fetch upstream/main → pnpm install → re-apply overlay
                     # then: git commit -m "chore: update web submodule"

# ── Release ───────────────────────────────────────────────────────────────
npm version patch    # bump version in package.json (or minor / major)
pnpm run release     # create + push git tag  →  GitHub Actions builds all platforms
```

## Manual overlay commands

```bash
# Apply overlay to web/ (done automatically by pnpm run dev)
node scripts/apply-overlay.js

# Reset web/ back to clean upstream (before git pull)
node scripts/reset-overlay.js
```

---

## How to add a new desktop-only change

1. **Create or modify the file in `overlay/`** — match the same relative path as it has in `web/`
2. Run `node scripts/apply-overlay.js` to apply it
3. Test with `pnpm run dev`
4. Commit the change in `overlay/` to the `desktop/` git repo

**Never commit any changes inside `web/`.** If you accidentally modify `web/`, run:
```bash
node scripts/reset-overlay.js
```

---

## What each overlay file does

| File | Why it's overridden |
|------|---------------------|
| `next.config.ts` | Adds `output: "standalone"`, `allowedDevOrigins`, `turbopack.root` (set to desktop/ for pnpm symlink resolution) |
| `public/sw.js` | Service Worker — caches external widget API data for offline use (200 MB / 30 days) |
| `src/app/page.tsx` | Removes GitHub link and logo; adds macOS traffic-light drag region |
| `src/app/layout.tsx` | Adds `<OfflineBanner>` to the root layout |
| `src/components/offline-banner.tsx` | New component — shows banner when network is offline |
| `src/components/add-menu.tsx` | Adds `data-add-menu-trigger` attribute for native menu integration |
| `src/components/dashboard-grid.tsx` | Auto-seeds Crypto Trader template on first launch |
| `src/components/onboarding.tsx` | New component — 3-slide first-launch onboarding flow |

---

## Why turbopack.root points to desktop/ (not web/)

With pnpm workspaces, `web/node_modules/` contains **symlinks** pointing to
`desktop/node_modules/.pnpm/...`. Turbopack refuses to follow symlinks that
point outside its `root` boundary (for security). Setting `root` to `desktop/`
(one level above `web/`) allows Turbopack to follow the pnpm symlinks correctly.

---

## Electron-specific features (desktop/ only)

- **Frameless window** (macOS): `titleBarStyle: 'hiddenInset'`, traffic lights at `{x:16, y:14}`
- **Native menu**: File → Add Widget (`Cmd+Shift+W`) triggers web app's add menu
- **Offline support**: Service Worker + OfflineBanner component
- **First-launch seed**: Auto-applies Crypto Trader template when dashboard is empty
- **Window drag**: Header has `-webkit-app-region: drag`; buttons have `no-drag`
- **Node version**: `electron/main.js` uses `findNodeForVersion(22)` to always spawn the Next.js server with Node 22, matching the compiled native module ABI
