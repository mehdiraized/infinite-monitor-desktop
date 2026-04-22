import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * POST /api/registry/submit
 *
 * Two-step widget submission:
 *  1. Save locally so the widget appears in the user's own marketplace immediately
 *  2. Forward to Supabase DB for admin review on the widget-admin dashboard
 *
 * The admin opens the GitHub Pages dashboard, reviews submissions,
 * copies the JSON of approved widgets and adds them to the public registry.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

export async function POST(request: NextRequest) {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const { id, name, description, category, author, widget } = body as {
		id: string;
		name: string;
		description: string;
		category: string;
		author: string;
		widget: {
			title: string;
			description: string;
			code: string;
			files: Record<string, string>;
			layoutJson: string;
		};
	};

	// Validate required fields
	if (!id || !name || !widget?.code) {
		return NextResponse.json(
			{ error: "Missing required fields: id, name, widget.code" },
			{ status: 400 },
		);
	}

	// Validate id format (only slug chars allowed)
	if (!/^[a-z0-9-]+$/.test(id)) {
		return NextResponse.json(
			{
				error:
					"Invalid id format — must be lowercase alphanumeric with hyphens",
			},
			{ status: 400 },
		);
	}

	// ── Step 1: Save locally ───────────────────────────────────────────

	const candidates = [
		path.resolve(process.cwd(), "..", "data"),
		path.resolve(process.cwd(), "data"),
	];

	let dataDir: string | null = null;
	for (const dir of candidates) {
		const registryPath = path.join(dir, "registry.json");
		if (fs.existsSync(registryPath)) {
			dataDir = dir;
			break;
		}
	}

	let finalId = id;

	if (dataDir) {
		const widgetsDir = path.join(dataDir, "widgets");
		const registryPath = path.join(dataDir, "registry.json");

		fs.mkdirSync(widgetsDir, { recursive: true });

		// Check for duplicate id
		if (fs.existsSync(path.join(widgetsDir, `${finalId}.json`))) {
			finalId = `${id}-${Date.now().toString(36)}`;
		}

		// Save widget file
		const widgetFile = {
			id: finalId,
			name,
			description: description || `${name} widget`,
			category: category || "tools",
			author: author || "Anonymous",
			widget: {
				title: widget.title || name,
				description: widget.description || "",
				code: widget.code,
				files: widget.files || {},
				layoutJson: widget.layoutJson || '{"x":0,"y":0,"w":4,"h":3}',
			},
		};

		fs.writeFileSync(
			path.join(widgetsDir, `${finalId}.json`),
			JSON.stringify(widgetFile, null, 2),
			"utf-8",
		);

		// Update registry
		const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
		registry.widgets.unshift({
			id: finalId,
			name,
			description: description || `${name} widget`,
			category: category || "tools",
			author: author || "Anonymous",
			stars: 0,
			tags: [category || "tools", "community"],
			createdAt: new Date().toISOString().split("T")[0],
			updatedAt: new Date().toISOString().split("T")[0],
		});
		registry.lastUpdated = new Date().toISOString();
		fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), "utf-8");
	}

	// ── Step 2: Forward to Supabase (async, non-blocking) ────────────

	if (SUPABASE_URL && SUPABASE_ANON_KEY) {
		const row = {
			widget_id: finalId,
			name,
			description: description || `${name} widget`,
			category: category || "tools",
			author: author || "Anonymous",
			widget_data: {
				title: widget.title || name,
				description: widget.description || "",
				code: widget.code,
				files: widget.files || {},
				layoutJson: widget.layoutJson || '{"x":0,"y":0,"w":4,"h":3}',
			},
			status: "pending",
		};

		// Fire-and-forget — don't block the user response
		fetch(`${SUPABASE_URL}/rest/v1/widget_submissions`, {
			method: "POST",
			headers: {
				apikey: SUPABASE_ANON_KEY,
				Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
				"Content-Type": "application/json",
				Prefer: "return=minimal",
			},
			body: JSON.stringify(row),
		}).catch((err) => {
			console.error("[registry/submit] Supabase insert failed:", err.message);
		});
	}

	return NextResponse.json({
		success: true,
		id: finalId,
		message: "Widget shared successfully",
	});
}
