# macOS Distribution Playbook

This repository now supports three separate macOS release paths:

1. Direct download DMG
2. Mac App Store / TestFlight upload
3. Local MAS development testing

The paths use different certificates and should not be mixed.

## 1. Direct download DMG

Use this when you want a downloadable installer from your website.

Requirements:

- `Developer ID Application` certificate in Keychain
- Notarization credentials using one of:
  - `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
  - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
  - `APPLE_KEYCHAIN`, `APPLE_KEYCHAIN_PROFILE`

Command:

```bash
pnpm run build:mac:signed
```

Expected output:

- Signed `dmg`
- Signed `zip`
- Notarized artifacts suitable for Gatekeeper

## 2. Mac App Store / TestFlight upload

Use this for both:

- TestFlight internal/external testing
- Final App Store submission

Important:

- TestFlight does **not** use `mas-dev`
- TestFlight uses the same App Store distribution signing path as production
- The practical difference is your App Store Connect version/build train, not a different target type

Requirements:

- `Apple Distribution` certificate in Keychain
- `Mac Installer Distribution` certificate in Keychain
- `MAS_PROVISIONING_PROFILE` pointing to a downloaded **Mac App Store Connect** provisioning profile
- An App Store Connect app record with the correct bundle ID

Command:

```bash
export MAS_PROVISIONING_PROFILE="/absolute/path/InfiniteMonitor_AppStore.provisionprofile"
pnpm run build:mac:store
```

Expected output:

- MAS-signed app
- MAS installer `.pkg` ready for Transporter

Upload:

1. Open Transporter
2. Drag the generated `.pkg`
3. Upload to App Store Connect
4. In App Store Connect, assign the build to TestFlight or submit it for App Review

## 3. Local MAS development testing

Use this only to verify sandbox behavior locally before a store upload.

Requirements:

- `Apple Development` certificate in Keychain
- `MAS_DEV_PROVISIONING_PROFILE` pointing to a local development provisioning profile

Command:

```bash
export MAS_DEV_PROVISIONING_PROFILE="/absolute/path/InfiniteMonitor_Dev.provisionprofile"
pnpm run build:mac:store:dev
```

Important:

- This is **not** the build you upload to TestFlight

## Recommended branch strategy

Recommended workflow:

- `main`: App Store release candidate / production line
- `dev`: TestFlight line for internal testing

Suggested release flow:

1. Merge tested work into `dev`
2. Build with `pnpm run build:mac:store`
3. Upload the generated `.pkg` with Transporter
4. Validate in TestFlight
5. Merge `dev` into `main`
6. Build again with `pnpm run build:mac:store`
7. Upload the new production build and submit for App Review

## Current architectural blocker

The current desktop app launches a separate Node.js 22 process in production from [electron/main.js](/Users/mehdirezaei/Desktop/Project/infinite-monitor/desktop/electron/main.js:263).

That means:

- The direct-download path is fine with proper signing/notarization
- The Mac App Store path is still risky because App Sandbox and App Review are much stricter about embedded runtimes and spawned executables

Before you submit to App Store Connect, validate that this architecture is acceptable or refactor the runtime so the app does not depend on an external Node installation.
