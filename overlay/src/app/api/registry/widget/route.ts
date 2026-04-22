import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * GET /api/registry/widget?id=<slug>
 *
 * Serves the full widget data (including code) for a single widget.
 *
 * Priority:
 *  1. Local data/widgets/<id>.json (bundled + user-submitted)
 *  2. GitHub raw (mehdiraized/infinite-monitor-widgets)
 */

const GITHUB_WIDGET_BASE =
	"https://raw.githubusercontent.com/mehdiraized/infinite-monitor-widgets/main/widgets";

export async function GET(request: NextRequest) {
	const id = request.nextUrl.searchParams.get("id");
	if (!id || !/^[a-z0-9-]+$/.test(id)) {
		return NextResponse.json({ error: "Invalid widget id" }, { status: 400 });
	}

	// Try local first
	const candidates = [
		path.resolve(process.cwd(), "..", "data", "widgets", `${id}.json`),
		path.resolve(process.cwd(), "data", "widgets", `${id}.json`),
	];

	for (const filePath of candidates) {
		if (fs.existsSync(filePath)) {
			const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
			return NextResponse.json(data, {
				headers: { "Cache-Control": "public, max-age=3600" },
			});
		}
	}

	// Try GitHub
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);
		const res = await fetch(`${GITHUB_WIDGET_BASE}/${id}.json`, {
			signal: controller.signal,
			next: { revalidate: 3600 },
		});
		clearTimeout(timeout);

		if (res.ok) {
			const data = await res.json();
			return NextResponse.json(data, {
				headers: { "Cache-Control": "public, max-age=3600" },
			});
		}
	} catch {
		// GitHub fetch failed
	}

	return NextResponse.json({ error: "Widget not found" }, { status: 404 });
}
