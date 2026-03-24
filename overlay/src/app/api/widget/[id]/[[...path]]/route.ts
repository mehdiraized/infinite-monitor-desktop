import { NextRequest } from "next/server";
import { ensureWidget, fetchFromWidget } from "@/lib/widget-runner";
import { getWidgetCode } from "@/db/widgets";

const LOADING_HTML = `<!DOCTYPE html>
<html class="dark">
<head><meta charset="UTF-8"><meta http-equiv="refresh" content="2"></head>
<body style="margin:0;background:#27272a;display:flex;align-items:center;justify-content:center;height:100vh;font-family:ui-monospace,monospace;color:#71717a;font-size:12px;">
<div style="text-align:center">
<div style="animation:spin 1s linear infinite;display:inline-block;width:16px;height:16px;border:2px solid #52525b;border-top-color:#a1a1aa;border-radius:50%;margin-bottom:8px"></div>
<div>Building widget…</div>
</div>
<style>@keyframes spin{to{transform:rotate(360deg)}}</style>
</body>
</html>`;

function errorHtml(message: string): string {
	const escaped = message
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	return `<!DOCTYPE html>
<html class="dark">
<head><meta charset="UTF-8"></head>
<body style="margin:0;background:#27272a;display:flex;align-items:center;justify-content:center;height:100vh;font-family:ui-monospace,monospace;color:#71717a;font-size:12px;padding:16px;">
<div style="text-align:center;max-width:90%">
<div style="color:#f87171;font-size:14px;margin-bottom:8px">Build failed</div>
<div style="background:#1c1c1e;border:1px solid #3f3f46;border-radius:4px;padding:12px;text-align:left;white-space:pre-wrap;word-break:break-word;max-height:60vh;overflow:auto;font-size:11px;color:#a1a1aa;margin-bottom:12px">${escaped}</div>
<div style="color:#52525b">Fix the code in the chat and rebuild</div>
</div>
</body>
</html>`;
}

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string; path?: string[] }> },
) {
	const { id, path: pathSegments } = await params;

	const code = getWidgetCode(id);
	if (!code) {
		return new Response(LOADING_HTML, {
			status: 200,
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	}

	const widget = await ensureWidget(id);

	if (widget.status === "error") {
		return new Response(
			errorHtml(widget.errorMessage ?? "Unknown build error"),
			{
				status: 200,
				headers: { "Content-Type": "text/html; charset=utf-8" },
			},
		);
	}

	if (widget.status !== "ready") {
		return new Response(LOADING_HTML, {
			status: 200,
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	}

	const subPath = pathSegments?.join("/") ?? "";

	try {
		const result = await fetchFromWidget(id, subPath, {
			Accept: req.headers.get("accept") ?? "*/*",
		});

		if (!result) {
			return new Response(LOADING_HTML, {
				status: 200,
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});
		}

		if (!subPath && result.contentType.includes("text/html")) {
			const baseTag = `<base href="/api/widget/${id}/">`;
			const patched = result.body.replace("<head>", `<head>${baseTag}`);
			return new Response(patched, {
				status: result.status,
				headers: {
					"Content-Type": "text/html; charset=utf-8",
					"Cache-Control": "no-store",
				},
			});
		}

		return new Response(result.body, {
			status: result.status,
			headers: {
				"Content-Type": result.contentType,
				"Cache-Control": "no-store",
			},
		});
	} catch {
		return new Response(LOADING_HTML, {
			status: 200,
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	}
}
