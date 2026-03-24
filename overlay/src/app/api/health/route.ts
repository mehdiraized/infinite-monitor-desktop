import { NextRequest } from "next/server";
import { createModel } from "@/lib/create-model";
import type { CustomApiConfig } from "@/store/settings-store";

/**
 * GET /api/health?provider=anthropic&apiKey=sk-...&model=anthropic:claude-sonnet-4-6
 *
 * Validates that the selected AI provider is reachable and the API key is valid.
 * Returns JSON: { ok, provider, error?, details? }
 */
export async function POST(request: NextRequest) {
	const body = await request.json().catch(() => ({}));
	const {
		model: modelStr,
		apiKey,
		customApi,
	} = body as {
		model?: string;
		apiKey?: string;
		customApi?: CustomApiConfig;
	};

	const selectedModel = modelStr ?? "anthropic:claude-sonnet-4-6";
	const idx = selectedModel.indexOf(":");
	const providerId = idx === -1 ? "anthropic" : selectedModel.slice(0, idx);

	// 1. Check basic internet connectivity
	try {
		await fetch("https://httpbin.org/get", {
			signal: AbortSignal.timeout(5000),
		});
	} catch {
		return Response.json(
			{
				ok: false,
				provider: providerId,
				error: "no_internet",
				message: "No internet connection. Check your network and try again.",
			},
			{ status: 200 },
		);
	}

	// 2. Check if API key is provided
	if (!apiKey && !customApi?.apiKey && !selectedModel.startsWith("custom:")) {
		return Response.json(
			{
				ok: false,
				provider: providerId,
				error: "no_api_key",
				message: `No API key set for ${providerId}. Click the model selector and enter your API key.`,
			},
			{ status: 200 },
		);
	}

	// 3. Try a minimal API call to validate the key
	try {
		const customConfig: CustomApiConfig | undefined = customApi || undefined;
		const model = createModel(selectedModel, apiKey, customConfig);

		// Use the Vercel AI SDK's doGenerate for a lightweight validation call
		const response = await model.doGenerate({
			inputFormat: "messages",
			mode: { type: "regular" },
			prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
			maxTokens: 1,
			abortSignal: AbortSignal.timeout(15000),
		});

		if (response) {
			return Response.json({ ok: true, provider: providerId }, { status: 200 });
		}
	} catch (err) {
		const errStr = String(err);

		// Parse common error patterns
		if (
			errStr.includes("401") ||
			errStr.includes("Unauthorized") ||
			errStr.includes("invalid_api_key") ||
			errStr.includes("Invalid API Key") ||
			errStr.includes("authentication")
		) {
			return Response.json(
				{
					ok: false,
					provider: providerId,
					error: "invalid_api_key",
					message: `Invalid API key for ${providerId}. Please update your API key.`,
				},
				{ status: 200 },
			);
		}

		if (
			errStr.includes("429") ||
			errStr.includes("rate_limit") ||
			errStr.includes("Rate limit")
		) {
			return Response.json(
				{
					ok: false,
					provider: providerId,
					error: "rate_limited",
					message: `Rate limited by ${providerId}. Wait a moment and try again.`,
				},
				{ status: 200 },
			);
		}

		if (
			errStr.includes("402") ||
			errStr.includes("insufficient_quota") ||
			errStr.includes("billing")
		) {
			return Response.json(
				{
					ok: false,
					provider: providerId,
					error: "quota_exceeded",
					message: `Quota exceeded for ${providerId}. Check your billing and usage limits.`,
				},
				{ status: 200 },
			);
		}

		if (
			errStr.includes("ENOTFOUND") ||
			errStr.includes("ECONNREFUSED") ||
			errStr.includes("fetch failed") ||
			errStr.includes("network")
		) {
			return Response.json(
				{
					ok: false,
					provider: providerId,
					error: "provider_unreachable",
					message: `Cannot reach ${providerId} API. Check your network or try again later.`,
				},
				{ status: 200 },
			);
		}

		return Response.json(
			{
				ok: false,
				provider: providerId,
				error: "unknown",
				message: errStr.length > 200 ? errStr.slice(0, 200) + "…" : errStr,
			},
			{ status: 200 },
		);
	}

	return Response.json({ ok: true, provider: providerId }, { status: 200 });
}
