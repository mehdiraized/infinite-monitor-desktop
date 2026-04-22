#!/usr/bin/env node
"use strict";

/**
 * Local Mac App Store build + upload script.
 * Reads config from .env.store (gitignored), builds the .pkg locally,
 * then uploads to App Store Connect via Fastlane.
 *
 * Usage:
 *   pnpm run submit:store
 *   node scripts/submit-to-store.js [--build-only] [--upload-only]
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, ".env.store");
const BUILD_ONLY = process.argv.includes("--build-only");
const UPLOAD_ONLY = process.argv.includes("--upload-only");

// ── Load .env.store ────────────────────────────────────────────────────────
function loadEnvStore() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error("✗  .env.store not found. Copy it from .env.store.example");
    process.exit(1);
  }

  const lines = fs.readFileSync(ENV_FILE, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Validation ─────────────────────────────────────────────────────────────
function validate() {
  const profile = process.env.MAS_PROVISIONING_PROFILE;
  if (!profile || !fs.existsSync(profile)) {
    console.error(
      `✗  MAS_PROVISIONING_PROFILE not found: "${profile}"\n` +
        "   Check the path in .env.store"
    );
    process.exit(1);
  }

  // Copy provisioning profile to /tmp to avoid spaces-in-path issues with electron-builder
  const tmpProfile = "/tmp/mas.provisionprofile";
  fs.copyFileSync(profile, tmpProfile);
  process.env.MAS_PROVISIONING_PROFILE = tmpProfile;

  const keyPath = process.env.APP_STORE_CONNECT_API_KEY_PATH;
  if (!keyPath || !fs.existsSync(keyPath)) {
    console.error(
      `✗  APP_STORE_CONNECT_API_KEY_PATH not found: "${keyPath}"\n` +
        "   Check the path in .env.store"
    );
    process.exit(1);
  }

  // Pass raw .p8 content to Fastlane
  process.env.APP_STORE_CONNECT_API_KEY = fs.readFileSync(keyPath, "utf8").trim();

  console.log("✓  .env.store loaded and validated");
}

// ── Helpers ────────────────────────────────────────────────────────────────
function run(cmd, label) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`▶  ${label}`);
  console.log(`${"─".repeat(60)}\n`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

/**
 * Uses productbuild to create a signed MAS installer .pkg from the
 * already MAS-signed .app produced by electron-builder's `mas` target.
 * Returns the path of the produced .pkg file.
 */
function createMasPkg(version) {
  // Find the Mac App Store installer signing identity
  const identities = execSync("security find-identity -v", { encoding: "utf8" });
  const matchInstaller = identities.match(/"(3rd Party Mac Developer Installer:[^"]+)"/);
  const matchAppleDist = identities.match(/"(Apple Distribution:[^"]+)"/);
  const identity = matchInstaller?.[1] || matchAppleDist?.[1];

  if (!identity) {
    console.error(
      "✗  No Mac App Store installer signing identity found in keychain.\n" +
      "   Import your '3rd Party Mac Developer Installer' certificate and try again."
    );
    process.exit(1);
  }

  const appPath = path.join(ROOT, "dist/mas-arm64/Infinite Monitor.app");
  const pkgOutput = path.join(ROOT, `dist/infinite-monitor-${version}-mas-arm64.pkg`);

  if (!fs.existsSync(appPath)) {
    console.error(`✗  MAS-signed app not found at: ${appPath}`);
    process.exit(1);
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`▶  Signing installer package with productbuild`);
  console.log(`${"─".repeat(60)}\n`);
  console.log(`   Identity : ${identity}`);
  console.log(`   App      : ${appPath}`);
  console.log(`   Output   : ${pkgOutput}\n`);

  execSync(
    `productbuild --component "${appPath}" /Applications --sign "${identity}" "${pkgOutput}"`,
    { cwd: ROOT, stdio: "inherit" }
  );

  console.log(`\n✓  Signed pkg: ${path.basename(pkgOutput)}`);
  // Tell Fastlane the exact path so it doesn't accidentally pick up old builds
  process.env.MAS_PKG_PATH = pkgOutput;
  return pkgOutput;
}

// ── Main ───────────────────────────────────────────────────────────────────
loadEnvStore();
validate();

const pkg = require(path.join(ROOT, "package.json"));
console.log(`\n━━━ submit-to-store: v${pkg.version} ━━━\n`);

if (!UPLOAD_ONLY) {
  run("pnpm run build:mac:store", "Building .app for Mac App Store");
  createMasPkg(pkg.version);
}

if (!BUILD_ONLY) {
  run("bundle exec fastlane upload_mas", "Uploading to App Store Connect");
}

console.log("\n✓  Done! Check App Store Connect → TestFlight → macOS\n");
