import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Required for the desktop app: produces a self-contained server in .next/standalone/
	// This has no effect on normal web deployments (Railway, Vercel, etc.).
	output: "standalone",
	// Allow hot-reload WebSocket connections from 127.0.0.1 (Electron dev mode).
	// Safe: this only applies in development; has no effect in production builds.
	allowedDevOrigins: ["127.0.0.1"],
	// Only keep native / binary packages external.  Pure-JS packages like
	// just-bash and bash-tool are bundled because Turbopack adds a hash suffix
	// to external names (e.g. "bash-tool-958b1adf8a67bcf9") that Node.js
	// cannot resolve at runtime in the standalone build.
	// The no-oped packages (@secure-exec/*, isolated-vm) are handled by the
	// overlay instrumentation.ts which prevents them from being imported.
	serverExternalPackages: [
		"node-liblzma",
		"@mongodb-js/zstd",
		"@secure-exec/node",
		"@secure-exec/core",
		"isolated-vm",
		"esbuild",
	],
	// Set the Turbopack workspace root to desktop/ (one level above web/).
	// With pnpm workspaces, all node_modules live in desktop/node_modules/ and
	// web/node_modules/ contains symlinks pointing up to desktop/node_modules/.pnpm/.
	// Turbopack must have its root set to desktop/ so it can follow those symlinks —
	// it refuses to access files outside its root for security reasons.
	turbopack: {
		root: path.resolve(__dirname, ".."),
	},
};

export default nextConfig;
