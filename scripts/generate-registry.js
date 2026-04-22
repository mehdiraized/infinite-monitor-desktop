#!/usr/bin/env node
"use strict";

/**
 * generate-registry.js
 *
 * Reads the bundled template JSONs from web/src/templates/ and extracts each
 * widget into its own file under data/widgets/.  It also produces a lightweight
 * registry index at data/registry.json that the marketplace UI fetches first
 * (no code, ~5 KB).
 *
 * Usage:
 *   node scripts/generate-registry.js
 *
 * Output:
 *   data/registry.json
 *   data/widgets/<slug>.json   (one per widget)
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATES_DIR = path.join(ROOT, "web", "src", "templates");
const OUT_DIR = path.join(ROOT, "data", "widgets");
const REGISTRY_OUT = path.join(ROOT, "data", "registry.json");

// ── Category mapping for each template ──────────────────────────────────

const TEMPLATE_CATEGORY = {
	"crypto-trader": "crypto",
	"prediction-markets": "finance",
	"world-conflicts": "geopolitics",
};

const CATEGORIES = [
	{
		id: "crypto",
		name: "Crypto",
		icon: "trending-up",
		description: "Cryptocurrency prices, charts, and market data",
	},
	{
		id: "finance",
		name: "Finance",
		icon: "dollar-sign",
		description: "Financial data, prediction markets, and analytics",
	},
	{
		id: "geopolitics",
		name: "Geopolitics",
		icon: "globe",
		description: "World conflicts, geopolitical data, and news",
	},
	{
		id: "analytics",
		name: "Analytics",
		icon: "bar-chart-3",
		description: "Data analytics and visualization tools",
	},
	{
		id: "tools",
		name: "Tools",
		icon: "wrench",
		description: "Utility widgets and developer tools",
	},
];

// ── Helpers ──────────────────────────────────────────────────────────────

function slugify(str) {
	return str
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

// ── Main ─────────────────────────────────────────────────────────────────

function main() {
	fs.mkdirSync(OUT_DIR, { recursive: true });

	const templateFiles = fs
		.readdirSync(TEMPLATES_DIR)
		.filter((f) => f.endsWith(".json"));
	const registryWidgets = [];
	let starBase = 50;

	for (const file of templateFiles) {
		const templateSlug = file.replace(/\.json$/, "");
		const category = TEMPLATE_CATEGORY[templateSlug] || "tools";
		const template = JSON.parse(
			fs.readFileSync(path.join(TEMPLATES_DIR, file), "utf-8"),
		);

		for (const widget of template.widgets) {
			const id = slugify(widget.title);

			// Full widget file (with code)
			const widgetFile = {
				id,
				name: widget.title,
				description:
					widget.description ||
					`${widget.title} widget from ${template.name} template`,
				category,
				author: "Infinite Monitor",
				widget: {
					title: widget.title,
					description: widget.description || "",
					code: widget.code,
					files: widget.files || {},
					layoutJson: widget.layoutJson || '{"x":0,"y":0,"w":4,"h":3}',
				},
			};

			fs.writeFileSync(
				path.join(OUT_DIR, `${id}.json`),
				JSON.stringify(widgetFile, null, 2),
				"utf-8",
			);

			// Lightweight registry entry (no code)
			registryWidgets.push({
				id,
				name: widget.title,
				description:
					widget.description ||
					`${widget.title} widget from ${template.name} template`,
				category,
				author: "Infinite Monitor",
				stars: starBase,
				tags: [category, template.name.toLowerCase().replace(/\s+/g, "-")],
				createdAt: new Date().toISOString().split("T")[0],
				updatedAt: new Date().toISOString().split("T")[0],
			});

			starBase = Math.max(5, starBase - 3);
		}
	}

	// Sort by stars descending
	registryWidgets.sort((a, b) => b.stars - a.stars);

	const registry = {
		version: 1,
		lastUpdated: new Date().toISOString(),
		categories: CATEGORIES,
		widgets: registryWidgets,
	};

	fs.writeFileSync(REGISTRY_OUT, JSON.stringify(registry, null, 2), "utf-8");

	console.log(
		`\n✓ Generated ${registryWidgets.length} widget files in data/widgets/`,
	);
	console.log(`✓ Generated registry index at data/registry.json\n`);
}

main();
