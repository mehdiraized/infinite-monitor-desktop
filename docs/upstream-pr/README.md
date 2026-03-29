## Upstream README PR Bundle

This folder contains a ready-to-send documentation change for the upstream
Infinite Monitor repository.

Why this exists:

- `web/` is a git submodule in this desktop repo and must stay unmodified.
- The upstream README lives in that submodule, so the safe way to prepare a PR
  from this repo is to keep the proposed diff here.

Files:

- `add-desktop-app-to-readme.patch` — patch for the upstream `README.md`
- `pull-request.md` — suggested PR title and body

Suggested upstream README addition:

- Adds a short `Desktop app` section after the local development quick start.
- Links users to the desktop distribution repo and latest packaged releases.
- Describes the desktop build as community-maintained and separate from the main
  repository.

Usage:

```bash
git clone https://github.com/homanp/infinite-monitor.git
cd infinite-monitor
git checkout -b docs/add-desktop-app-readme
git apply /path/to/infinite-monitor-desktop/docs/upstream-pr/add-desktop-app-to-readme.patch
```

Then open `pull-request.md`, copy the title/body into GitHub, and submit the PR.
