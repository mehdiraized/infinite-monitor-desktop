import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * GET /api/registry
 *
 * Serves the widget marketplace registry index.
 *
 * Priority:
 *  1. Fetch from GitHub (mehdiraized/infinite-monitor-widgets) — the public source of truth
 *  2. Fall back to local data/registry.json (bundled defaults)
 *
 * The two registries are MERGED: GitHub widgets come first (sorted by stars),
 * then any local-only widgets that aren't on GitHub yet.
 */

const GITHUB_REGISTRY_URL =
	"https://raw.githubusercontent.com/mehdiraized/infinite-monitor-widgets/main/registry.json";

function readLocalRegistry(): Record<string, unknown> | null {
	const candidates = [
		path.resolve(process.cwd(), "..", "data", "registry.json"),
		path.resolve(process.cwd(), "data", "registry.json"),
	];
	for (const filePath of candidates) {
		if (fs.existsSync(filePath)) {
			return JSON.parse(fs.readFileSync(filePath, "utf-8"));
		}
	}
	return null;
}

export async function GET() {
	const localRegistry = readLocalRegistry() as {
		categories?: unknown[];
		widgets?: { id: string }[];
	} | null;

	// Try fetching from GitHub
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);
		const res = await fetch(GITHUB_REGISTRY_URL, {
			signal: controller.signal,
			next: { revalidate: 3600 },
		});
		clearTimeout(timeout);

		if (res.ok) {
			const github = (await res.json()) as {
				categories?: unknown[];
				widgets?: { id: string }[];
				[key: string]: unknown;
			};

			// Merge: GitHub + local-only widgets
			if (localRegistry?.widgets && github.widgets) {
				const githubIds = new Set(github.widgets.map((w) => w.id));
				const localOnly = localRegistry.widgets.filter(
					(w) => !githubIds.has(w.id),
				);
				github.widgets = [...github.widgets, ...localOnly];
			}

			// Merge categories
			if (localRegistry?.categories && github.categories) {
				const ghCatIds = new Set(
					(github.categories as { id: string }[]).map((c) => c.id),
				);
				const localOnlyCats = (
					localRegistry.categories as { id: string }[]
				).filter((c) => !ghCatIds.has(c.id));
				github.categories = [...github.categories, ...localOnlyCats];
			}

			return NextResponse.json(github, {
				headers: { "Cache-Control": "public, max-age=3600" },
			});
		}
	} catch {
		// GitHub fetch failed — fall through to local
	}

	// Fallback to local registry
	if (localRegistry) {
		return NextResponse.json(localRegistry, {
			headers: { "Cache-Control": "public, max-age=3600" },
		});
	}

	return NextResponse.json({ error: "Registry not found" }, { status: 404 });
}
