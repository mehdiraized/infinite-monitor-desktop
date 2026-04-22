#!/usr/bin/env node

/**
 * setup-widget-repo.js
 *
 * Generates the initial content for the `infinite-monitor-widgets` GitHub repository.
 * Run this once, then push the output directory to GitHub.
 *
 * Usage:
 *   node scripts/setup-widget-repo.js [output-dir]
 *
 * Default output: ./widget-repo-output/
 */

const fs = require("fs");
const path = require("path");

const outDir =
	process.argv[2] || path.resolve(__dirname, "..", "widget-repo-output");
const dataDir = path.resolve(__dirname, "..", "data");
const templateDir = path.resolve(__dirname, "..", "widget-repo-template");

console.log(`\n📦 Setting up widget repo content in: ${outDir}\n`);

// ── Helpers ──────────────────────────────────────────────────────────────

function copyDir(src, dest) {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDir(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

// ── Create output directory ──────────────────────────────────────────────

fs.mkdirSync(outDir, { recursive: true });

// ── Copy registry.json ───────────────────────────────────────────────────

const registrySrc = path.join(dataDir, "registry.json");
if (fs.existsSync(registrySrc)) {
	fs.copyFileSync(registrySrc, path.join(outDir, "registry.json"));
	console.log("  ✅ registry.json");
} else {
	console.error(
		"  ❌ data/registry.json not found — run generate-registry.js first",
	);
	process.exit(1);
}

// ── Copy widgets/ ────────────────────────────────────────────────────────

const widgetsSrc = path.join(dataDir, "widgets");
if (fs.existsSync(widgetsSrc)) {
	copyDir(widgetsSrc, path.join(outDir, "widgets"));
	const count = fs
		.readdirSync(widgetsSrc)
		.filter((f) => f.endsWith(".json")).length;
	console.log(`  ✅ widgets/ (${count} files)`);
} else {
	fs.mkdirSync(path.join(outDir, "widgets"), { recursive: true });
	console.log("  ⚠️  widgets/ (empty — no widget files found)");
}

// ── Copy GitHub Action ───────────────────────────────────────────────────

const workflowSrc = path.join(
	templateDir,
	".github",
	"workflows",
	"process-submission.yml",
);
if (fs.existsSync(workflowSrc)) {
	const workflowDest = path.join(outDir, ".github", "workflows");
	fs.mkdirSync(workflowDest, { recursive: true });
	fs.copyFileSync(
		workflowSrc,
		path.join(workflowDest, "process-submission.yml"),
	);
	console.log("  ✅ .github/workflows/process-submission.yml");
} else {
	console.log("  ⚠️  GitHub Action template not found — skipping");
}

// ── Generate README.md ───────────────────────────────────────────────────

const readme = `# Infinite Monitor — Widget Registry

This repository is the **public widget registry** for [Infinite Monitor](https://github.com/mehdiraized/infinite-monitor).

## How it works

1. Users share widgets from within the Infinite Monitor desktop app
2. Each submission is automatically posted as a GitHub Issue (via Cloudflare Worker)
3. The maintainer reviews the Issue and adds the \`approved\` label
4. A GitHub Action processes the approved submission — saves the widget JSON and updates \`registry.json\`
5. The desktop app fetches \`registry.json\` from this repo to show the latest widgets

## Structure

\`\`\`
registry.json          ← index of all available widgets
widgets/
  widget-slug.json     ← full widget data (code, files, layout, metadata)
.github/workflows/
  process-submission.yml  ← GitHub Action that processes approved Issues
\`\`\`

## For maintainers

- Review pending submissions: [Issues labeled \`widget-submission\`](../../issues?q=is%3Aissue+label%3Awidget-submission+is%3Aopen)
- To approve: add the \`approved\` label → the Action will handle the rest
- To reject: close the issue with a comment explaining why

## Registry format

\`\`\`json
{
  "version": 1,
  "lastUpdated": "2025-...",
  "categories": [...],
  "widgets": [
    {
      "id": "widget-slug",
      "name": "Widget Name",
      "description": "...",
      "category": "crypto",
      "author": "AuthorName",
      "stars": 0,
      "tags": ["crypto", "community"]
    }
  ]
}
\`\`\`

## License

MIT
`;

fs.writeFileSync(path.join(outDir, "README.md"), readme, "utf-8");
console.log("  ✅ README.md");

// ── Generate .gitignore ──────────────────────────────────────────────────

fs.writeFileSync(
	path.join(outDir, ".gitignore"),
	"node_modules/\n.DS_Store\n",
	"utf-8",
);
console.log("  ✅ .gitignore");

// ── Done ─────────────────────────────────────────────────────────────────

console.log(`
✨ Done! To publish this repository:

  cd ${outDir}
  git init
  git add .
  git commit -m "feat: initial widget registry"
  git remote add origin https://github.com/mehdiraized/infinite-monitor-widgets.git
  git push -u origin main

Then:
  1. Create a "widget-submission" label in the repo (Issues → Labels → New)
  2. Create a "approved" label in the repo
  3. Deploy the Cloudflare Worker: cd workers/submit-widget && npx wrangler deploy
  4. Set the GITHUB_TOKEN secret: npx wrangler secret put GITHUB_TOKEN
`);
