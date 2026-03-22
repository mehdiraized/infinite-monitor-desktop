# Architecture – Infinite Monitor Desktop (Phase 1)

## Decision: Local Next.js server bundled inside the Electron shell

### Why not Option A (load infinitemonitor.com inside a BrowserWindow)?

| Concern | Hosted URL approach | Local server approach |
|---|---|---|
| User data ownership | Data lives on a remote server | SQLite lives in user's app data dir |
| Offline support | None – requires internet | Full offline (except AI API calls) |
| Backend API routes | Not available locally | Fully available |
| Widget sandboxing (Secure Exec V8) | Runs on their server | Runs on user's machine |
| Coupling to remote uptime | Breaks if site is down | No dependency on remote uptime |
| Auth / access changes | One upstream change locks users out | N/A – app is local-first |

The upstream app is explicitly **local-first**: SQLite, BYOK API keys, no user accounts.
Loading the hosted URL contradicts the design and puts user data on someone else's server.

### Why Option B (local Next.js server)?

1. The app already runs fine with `npm run dev` – no changes needed to the dashboard UI.
2. `DATABASE_PATH` env var lets the desktop app route data to `app.getPath('userData')`.
3. The Next.js `output: 'standalone'` feature produces a self-contained server binary
   that can be shipped inside the Electron package.
4. The Electron shell stays thin: it only starts the server and manages the window.

---

## Layer diagram

```
┌──────────────────────────────────────────────────────┐
│  Electron main process  (electron/main.js)           │
│  ┌──────────────────────────────────────────────┐   │
│  │  BrowserWindow                                │   │
│  │  http://127.0.0.1:{port}                      │   │
│  │  ┌──────────────────────────────────────────┐ │   │
│  │  │  Next.js app (upstream, unmodified UI)   │ │   │
│  │  │  React / Tailwind / Zustand / shadcn     │ │   │
│  │  └──────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  child_process.spawn → next dev  (development)       │
│                      → node server.js (production)   │
└──────────────────────────────────────────────────────┘
                             │
                             ▼
           ┌────────────────────────────────┐
           │  Next.js server (child process) │
           │  API routes, SQLite, Secure Exec│
           └────────────────────────────────┘
                             │
                             ▼
           ┌────────────────────────────────┐
           │  widgets.db  (SQLite)           │
           │  app.getPath('userData')/data/  │
           └────────────────────────────────┘
```

---

## File layout

```
desktop/
├── electron/
│   ├── main.js              Main process: port, server lifecycle, window
│   └── menu.js              Application menu definition
├── scripts/
│   ├── prepare-web.js       Pre-build: builds ../web and copies standalone output
│   └── generate-icons.js   Generates placeholder PNG icon (no extra deps)
├── assets/
│   ├── icon.png             App icon (replace with production art)
│   ├── icon.icns            macOS icon – generate with electron-icon-builder
│   └── icon.ico             Windows icon – generate with electron-icon-builder
├── web-build/               (git-ignored) Assembled standalone Next.js server.
│                            Produced by `npm run prepare-web`, consumed by electron-builder.
├── dist/                    (git-ignored) Packaged app output from electron-builder.
├── package.json
├── electron-builder.yml
├── .gitignore
├── ARCHITECTURE.md          (this file)
└── README.md
```

---

## How upstream updates stay compatible

### Dashboard UI changes
The BrowserWindow loads whatever the Next.js server serves at `/`. Any UI update
in the upstream repository is automatically picked up when:
- **Dev mode**: server restarts with `npm run dev` in `../web`.
- **Production build**: re-run `npm run build` in `desktop/`.

No changes to the Electron shell are needed for UI changes.

### New API routes or backend changes
Same as above – the Next.js server handles these transparently.

### Schema migrations
The upstream `src/db/index.ts` runs `ALTER TABLE` migrations on startup.
Since the SQLite file persists in `app.getPath('userData')`, user data
survives app updates automatically.

### Next.js or dependency upgrades in upstream
Run `npm install` in `web/`, then rebuild the desktop. The standalone output
is re-generated; no Electron code changes needed.

### Electron version upgrades
The main process is intentionally thin (< 300 lines, no native modules).
Upgrading Electron only requires bumping the version in `desktop/package.json`.

---

## Security posture

| Setting | Value | Reason |
|---|---|---|
| `contextIsolation` | `true` | Isolates renderer from main process |
| `nodeIntegration` | `false` | Renderer cannot access Node.js APIs |
| `sandbox` | `true` | Renderer runs in Chrome sandbox |
| No preload IPC | — | Web app handles all its own state; no native bridge needed in phase 1 |
| `setWindowOpenHandler` | deny external, allow local | External links open in system browser |
| `will-navigate` guard | prevents navigation away | Stops the app from loading arbitrary URLs |
| `will-attach-webview` | prevented | No `<webview>` tags allowed |
| Server binds to `127.0.0.1` | `HOSTNAME=127.0.0.1` | Not accessible from the network |

---

## Known assumptions and risks (Phase 1)

| Risk | Mitigation |
|---|---|
| Requires Node.js 22+ installed on system (production mode) | Startup check + user-friendly error dialog |
| `better-sqlite3` native module must match system Node.js ABI | Documented in README; same Node used to build and run |
| Secure Exec / V8 isolates require specific native binaries | These are in the standalone's bundled node_modules; same ABI requirement as above |
| macOS: `node` may not be in Dock-launched app's PATH | `resolveNodeBinary()` checks common locations as fallback |
| No auto-update in phase 1 | Planned for phase 2 using `electron-updater` |
| No code signing / notarisation config | Developer must add signing credentials before distributing |

---

## Phase 2 extension points

The following features are deliberately excluded from phase 1 but the architecture
supports them without changing the desktop-layer contract:

- **Auto-update**: add `electron-updater`; the server process is separate so updates
  can be applied without touching user data.
- **Settings panel**: expose a native settings window; persist to a JSON file in
  `app.getPath('userData')`.
- **File export / import**: use `dialog.showSaveDialog` + IPC; web app sends data
  over a preload bridge (`electron/preload.js`) added in phase 2.
- **Tray icon**: add `new Tray(...)` in `main.js`; keep running in background.
- **Dashboard export to PDF/image**: use `webContents.printToPDF` or the Chromium
  screenshot API – no web app changes required.
- **Bundled Node.js**: ship a pinned Node.js binary using `@yao-pkg/pkg` or by
  including a Node.js distribution in `extraResources` to remove the runtime
  dependency on system Node.js.
