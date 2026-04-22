#!/usr/bin/env node
"use strict";

/**
 * scripts/prepare-node.js
 *
 * Downloads the official Node.js 22 binary for the current platform/arch
 * and places it at node-bin/node  (node-bin/node.exe on Windows).
 *
 * This binary is bundled with the Electron app via extraResources so that
 * end-users do NOT need Node.js installed on their systems.
 *
 * The binary is gitignored (node-bin/) and must be downloaded before each build.
 * It is automatically called as part of all build:* scripts.
 *
 * Usage:
 *   node scripts/prepare-node.js
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");

// ── Version ───────────────────────────────────────────────────────────────────
// Keep in sync with .nvmrc and the ABI used to compile native modules.
const NODE_MAJOR = 22;
const NODE_VERSION = "22.16.0";

// ── Platform detection ────────────────────────────────────────────────────────
function getPlatformInfo() {
  const platform = process.platform;
  // electron-builder passes the target arch via npm_config_arch or
  // ELECTRON_BUILDER_ARCH; fall back to the host arch so local builds work.
  const arch =
    process.env.npm_config_arch ||
    process.env.ELECTRON_BUILDER_ARCH ||
    process.arch;

  if (platform === "darwin") {
    const nodeArch = arch === "arm64" ? "arm64" : "x64";
    const dirName = `node-v${NODE_VERSION}-darwin-${nodeArch}`;
    return {
      url: `https://nodejs.org/dist/v${NODE_VERSION}/${dirName}.tar.gz`,
      archiveSuffix: ".tar.gz",
      extract: (archive, destDir) => {
        execSync(
          `tar -xzf "${archive}" --strip-components=2 -C "${destDir}" "${dirName}/bin/node"`,
          { stdio: "inherit" },
        );
      },
      destName: "node",
    };
  }

  if (platform === "win32") {
    const dirName = `node-v${NODE_VERSION}-win-x64`;
    return {
      url: `https://nodejs.org/dist/v${NODE_VERSION}/${dirName}.zip`,
      archiveSuffix: ".zip",
      extract: (archive, destDir) => {
        const tmpExtract = path.join(os.tmpdir(), `node-extract-${Date.now()}`);
        // PowerShell Expand-Archive is available on Windows 10+
        execSync(
          `powershell -Command "Expand-Archive -Force -Path '${archive}' -DestinationPath '${tmpExtract}'"`,
          { stdio: "inherit" },
        );
        const src = path.join(tmpExtract, dirName, "node.exe");
        fs.copyFileSync(src, path.join(destDir, "node.exe"));
        fs.rmSync(tmpExtract, { recursive: true, force: true });
      },
      destName: "node.exe",
    };
  }

  // Linux
  const nodeArch = arch === "arm64" ? "arm64" : "x64";
  const dirName = `node-v${NODE_VERSION}-linux-${nodeArch}`;
  return {
    url: `https://nodejs.org/dist/v${NODE_VERSION}/${dirName}.tar.xz`,
    archiveSuffix: ".tar.xz",
    extract: (archive, destDir) => {
      execSync(
        `tar -xJf "${archive}" --strip-components=2 -C "${destDir}" "${dirName}/bin/node"`,
        { stdio: "inherit" },
      );
    },
    destName: "node",
  };
}

// ── Download helper ───────────────────────────────────────────────────────────
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    function get(requestUrl) {
      https
        .get(
          requestUrl,
          { headers: { "User-Agent": "infinite-monitor-desktop-build/1.0" } },
          (res) => {
            // Follow redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
              get(res.headers.location);
              return;
            }
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode} downloading ${requestUrl}`));
              return;
            }

            const total = parseInt(res.headers["content-length"] || "0", 10);
            let downloaded = 0;

            res.on("data", (chunk) => {
              downloaded += chunk.length;
              if (total > 0) {
                const pct = Math.round((downloaded / total) * 100);
                process.stdout.write(
                  `\r  Downloading... ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`,
                );
              } else {
                process.stdout.write(
                  `\r  Downloading... ${(downloaded / 1024 / 1024).toFixed(1)} MB`,
                );
              }
            });

            res.pipe(file);
            file.on("finish", () => {
              file.close();
              process.stdout.write("\n");
              resolve();
            });
            file.on("error", reject);
          },
        )
        .on("error", reject);
    }

    get(url);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const outDir = path.join(ROOT, "node-bin");
  const { url, archiveSuffix, extract, destName } = getPlatformInfo();
  const destBin = path.join(outDir, destName);

  // Already present — skip download
  if (fs.existsSync(destBin)) {
    console.log(
      `  ✓ Node.js v${NODE_VERSION} binary already present at node-bin/${destName}`,
    );
    return;
  }

  console.log(`\n━━━ prepare-node: bundling Node.js v${NODE_VERSION} ━━━\n`);
  console.log(`  Platform : ${process.platform}  Arch : ${process.arch}`);
  console.log(`  URL      : ${url}`);

  fs.mkdirSync(outDir, { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prepare-node-"));
  const archivePath = path.join(tmpDir, `node${archiveSuffix}`);

  try {
    await downloadFile(url, archivePath);

    console.log(`  Extracting node binary...`);
    extract(archivePath, outDir);

    // Ensure the binary is executable on Unix
    if (process.platform !== "win32") {
      fs.chmodSync(destBin, 0o755);
    }

    console.log(`  ✓ Node.js binary ready: node-bin/${destName}\n`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`\n✗ prepare-node failed: ${err.message}`);
  process.exit(1);
});
