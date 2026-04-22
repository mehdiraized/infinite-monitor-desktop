#!/usr/bin/env node
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const mode = process.argv[2] || "direct";
const ROOT = path.resolve(__dirname, "..");

function run(bin, args) {
	try {
		return execFileSync(bin, args, {
			cwd: ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (error) {
		const stderr = error.stderr ? String(error.stderr) : "";
		const stdout = error.stdout ? String(error.stdout) : "";
		throw new Error((stderr || stdout || error.message).trim());
	}
}

function hasIdentity(namePart) {
	try {
		const output = run("security", ["find-identity", "-v", "-p", "codesigning"]);
		return output.includes(namePart);
	} catch (_) {
		return false;
	}
}

// Installer certs are not codesigning certs — search all identities instead
function hasAnyIdentity(namePart) {
	try {
		const output = run("security", ["find-identity", "-v"]);
		return output.includes(namePart);
	} catch (_) {
		return false;
	}
}

function fileExists(maybePath) {
	return Boolean(maybePath) && fs.existsSync(path.resolve(ROOT, maybePath));
}

function envPresent(name) {
	return Boolean(process.env[name] && String(process.env[name]).trim());
}

function pickNotaryMethod() {
	const apiKey =
		envPresent("APPLE_API_KEY") &&
		envPresent("APPLE_API_KEY_ID") &&
		envPresent("APPLE_API_ISSUER");
	const appleId =
		envPresent("APPLE_ID") &&
		envPresent("APPLE_APP_SPECIFIC_PASSWORD") &&
		envPresent("APPLE_TEAM_ID");
	const keychain =
		envPresent("APPLE_KEYCHAIN") && envPresent("APPLE_KEYCHAIN_PROFILE");

	if (apiKey) return "App Store Connect API key";
	if (appleId) return "Apple ID + app-specific password";
	if (keychain) return "keychain profile";
	return null;
}

function printChecklist(title, lines) {
	console.log(`\n${title}`);
	for (const line of lines) {
		console.log(`  ${line}`);
	}
}

function fail(lines) {
	printChecklist("macOS signing preflight failed", lines);
	process.exit(1);
}

function warn(lines) {
	printChecklist("macOS signing warnings", lines);
}

if (process.platform !== "darwin") {
	fail(["These signing builds must run on macOS."]);
}

const warnings = [];

if (mode === "direct") {
	const notaryMethod = pickNotaryMethod();
	const problems = [];

	if (!hasIdentity("Developer ID Application")) {
		problems.push('Missing a "Developer ID Application" certificate in Keychain.');
	}
	if (!notaryMethod) {
		problems.push(
			"Missing notarization credentials. Set APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER or APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID.",
		);
	}

	if (problems.length) fail(problems);

	printChecklist("Direct distribution preflight passed", [
		'Certificate found: "Developer ID Application"',
		`Notarization auth found: ${notaryMethod}`,
		"Output will be a signed + notarized DMG/ZIP suitable for direct download.",
	]);
} else if (mode === "store") {
	const problems = [];

	if (!hasIdentity("Apple Distribution") && !hasIdentity("3rd Party Mac Developer Application")) {
		problems.push(
			'Missing an "Apple Distribution" (or legacy "3rd Party Mac Developer Application") certificate in Keychain.',
		);
	}
	if (
		!hasAnyIdentity("Mac Installer Distribution") &&
		!hasAnyIdentity("3rd Party Mac Developer Installer")
	) {
		problems.push(
			'Missing a "Mac Installer Distribution" (or legacy "3rd Party Mac Developer Installer") certificate in Keychain.',
		);
	}
	if (!envPresent("MAS_PROVISIONING_PROFILE")) {
		problems.push(
			"Missing MAS_PROVISIONING_PROFILE. Point it at your downloaded Mac App Store Connect provisioning profile.",
		);
	} else if (!fileExists(process.env.MAS_PROVISIONING_PROFILE)) {
		problems.push(
			`MAS provisioning profile was not found at ${process.env.MAS_PROVISIONING_PROFILE}.`,
		);
	}

	if (problems.length) fail(problems);

	warnings.push(
		"This project currently launches a separate Node.js 22 process in production (electron/main.js). That architecture is a likely Mac App Store review blocker and should be validated before upload.",
	);

	printChecklist("Mac App Store / TestFlight preflight passed", [
		'Certificate found: "Apple Distribution" (or legacy equivalent)',
		'Certificate found: "Mac Installer Distribution" (or legacy equivalent)',
		`Provisioning profile found: ${process.env.MAS_PROVISIONING_PROFILE}`,
		"Output will be a MAS-signed app plus PKG for Transporter/App Store Connect.",
	]);
} else if (mode === "store-dev") {
	const problems = [];

	if (!hasIdentity("Apple Development") && !hasIdentity("Mac Developer")) {
		problems.push(
			'Missing an "Apple Development" (or legacy "Mac Developer") certificate in Keychain.',
		);
	}
	if (!envPresent("MAS_DEV_PROVISIONING_PROFILE")) {
		problems.push(
			"Missing MAS_DEV_PROVISIONING_PROFILE. Point it at your local Mac App Store development provisioning profile.",
		);
	} else if (!fileExists(process.env.MAS_DEV_PROVISIONING_PROFILE)) {
		problems.push(
			`MAS development provisioning profile was not found at ${process.env.MAS_DEV_PROVISIONING_PROFILE}.`,
		);
	}

	if (problems.length) fail(problems);

	warnings.push(
		"`mas-dev` is only for local sandbox testing. TestFlight uploads should use the distribution build from build:mac:store.",
	);

	printChecklist("Mac App Store development preflight passed", [
		'Certificate found: "Apple Development" (or legacy equivalent)',
		`Provisioning profile found: ${process.env.MAS_DEV_PROVISIONING_PROFILE}`,
		"Output will be a local MAS development build for on-machine testing.",
	]);
} else {
	fail([`Unknown mode "${mode}". Use one of: direct, store, store-dev.`]);
}

if (warnings.length) {
	warn(warnings);
}
