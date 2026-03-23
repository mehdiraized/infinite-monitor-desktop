import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the desktop app: produces a self-contained server in .next/standalone/
  // This has no effect on normal web deployments (Railway, Vercel, etc.).
  output: "standalone",
  // Allow hot-reload WebSocket connections from 127.0.0.1 (Electron dev mode).
  // Safe: this only applies in development; has no effect in production builds.
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["just-bash", "bash-tool", "node-liblzma", "@mongodb-js/zstd", "@secure-exec/node", "@secure-exec/core", "isolated-vm", "esbuild"],
  // Set the standalone output file tracing root to web/ itself.
  // Without this, Next.js uses the pnpm workspace root (desktop/) as the tracing root,
  // which causes server.js to be nested at web/server.js inside the standalone output
  // instead of at the root — breaking the Electron production launcher.
  outputFileTracingRoot: path.resolve(__dirname),
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
