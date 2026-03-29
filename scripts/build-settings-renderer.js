#!/usr/bin/env node
"use strict";

const path = require("path");
const fs = require("fs");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "..");
const ENTRY = path.join(ROOT, "electron", "settings-app.jsx");
const OUTFILE = path.join(ROOT, "electron", "settings-renderer.js");

if (!fs.existsSync(ENTRY)) {
	console.error(`[build-settings-renderer] ERROR: entry not found: ${ENTRY}`);
	process.exit(1);
}

async function main() {
	await esbuild.build({
		entryPoints: [ENTRY],
		bundle: true,
		platform: "browser",
		format: "iife",
		target: ["chrome141"],
		jsx: "automatic",
		outfile: OUTFILE,
		logLevel: "info",
		legalComments: "none",
		sourcemap: false,
		minify: false,
		define: {
			"process.env.NODE_ENV": JSON.stringify(
				process.env.NODE_ENV || "production",
			),
		},
	});

	console.log(
		`\n[build-settings-renderer] Wrote ${path.relative(ROOT, OUTFILE)}`,
	);
}

main().catch((error) => {
	console.error("[build-settings-renderer] Build failed:");
	console.error(error);
	process.exit(1);
});
