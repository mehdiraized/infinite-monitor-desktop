"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
	AlertTriangle,
	RefreshCw,
	Key,
	WifiOff,
	X,
	CheckCircle2,
} from "lucide-react";
import { useSettingsStore } from "@/store/settings-store";
import {
	parseModelString,
	isCustomProvider,
	CUSTOM_PROVIDER_PREFIX,
} from "@/lib/model-registry";

type HealthStatus =
	| { state: "idle" }
	| { state: "checking" }
	| { state: "ok" }
	| { state: "error"; error: string; message: string };

/**
 * Checks AI provider connectivity in the background and shows an
 * actionable banner if the API key is missing, invalid, or the
 * provider cannot be reached.
 *
 * Runs automatically:
 *   - On first load
 *   - When the selected model changes
 *   - When an API key is added/removed
 *
 * Dismissible — re-appears only when state actually changes.
 */
export function ApiStatusBanner() {
	const [status, setStatus] = useState<HealthStatus>({ state: "idle" });
	const [dismissed, setDismissed] = useState(false);
	const [showSuccess, setShowSuccess] = useState(false);
	const prevKeyRef = useRef<string | undefined>(undefined);

	const selectedModel = useSettingsStore((s) => s.selectedModel);
	const apiKeys = useSettingsStore((s) => s.apiKeys);
	const customApis = useSettingsStore((s) => s.customApis);

	const { providerId } = parseModelString(selectedModel);

	const currentApiKey = isCustomProvider(providerId)
		? (() => {
				const afterPrefix = selectedModel.slice(CUSTOM_PROVIDER_PREFIX.length);
				const colonIdx = afterPrefix.indexOf(":");
				const customApiId =
					colonIdx === -1 ? afterPrefix : afterPrefix.slice(0, colonIdx);
				return customApis.find((c) => c.id === customApiId)?.apiKey;
			})()
		: apiKeys[providerId];

	const checkHealth = useCallback(async () => {
		setStatus({ state: "checking" });
		setDismissed(false);

		// Quick client-side check: no API key set?
		if (!currentApiKey && !isCustomProvider(providerId)) {
			setStatus({
				state: "error",
				error: "no_api_key",
				message: `No API key for ${providerId}. Open the model selector (bottom of chat) and enter your key.`,
			});
			return;
		}

		try {
			const customApiConfig = selectedModel.startsWith(CUSTOM_PROVIDER_PREFIX)
				? (() => {
						const afterPrefix = selectedModel.slice(
							CUSTOM_PROVIDER_PREFIX.length,
						);
						const colonIdx = afterPrefix.indexOf(":");
						const customApiId =
							colonIdx === -1 ? afterPrefix : afterPrefix.slice(0, colonIdx);
						return customApis.find((c) => c.id === customApiId);
					})()
				: undefined;

			const res = await fetch("/api/health", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: selectedModel,
					apiKey: currentApiKey,
					...(customApiConfig ? { customApi: customApiConfig } : {}),
				}),
				signal: AbortSignal.timeout(20000),
			});

			const data = await res.json();

			if (data.ok) {
				setStatus({ state: "ok" });
				setShowSuccess(true);
				setTimeout(() => setShowSuccess(false), 3000);
			} else {
				setStatus({
					state: "error",
					error: data.error ?? "unknown",
					message: data.message ?? "Unknown connectivity issue",
				});
			}
		} catch {
			setStatus({
				state: "error",
				error: "check_failed",
				message:
					"Could not reach the app server. Try restarting the application.",
			});
		}
	}, [selectedModel, currentApiKey, providerId, customApis]);

	// Run health check on model or key change
	useEffect(() => {
		// Skip the initial idle render — run on mount
		const keyChanged = prevKeyRef.current !== currentApiKey;
		prevKeyRef.current = currentApiKey;

		// Small delay to avoid checking before the server is fully ready
		const timer = setTimeout(
			() => {
				checkHealth();
			},
			keyChanged ? 500 : 2000,
		);

		return () => clearTimeout(timer);
	}, [selectedModel, currentApiKey, checkHealth]);

	// Don't render anything while idle or after dismissal
	if (status.state === "idle") return null;
	if (dismissed && status.state !== "checking") return null;

	// Brief success flash
	if (status.state === "ok" && showSuccess) {
		return (
			<div
				role="status"
				className="fixed bottom-0 inset-x-0 flex items-center gap-2.5 px-5 py-2 bg-emerald-950/90 border-t border-emerald-800/60 text-emerald-200 text-xs select-none z-50 transition-opacity duration-500"
			>
				<CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
				<span>AI connection verified — {providerId} is ready</span>
			</div>
		);
	}

	if (status.state === "ok") return null;

	if (status.state === "checking") {
		return (
			<div
				role="status"
				className="fixed bottom-0 inset-x-0 flex items-center gap-2.5 px-5 py-2 bg-zinc-900/90 border-t border-zinc-700/60 text-zinc-400 text-xs select-none z-50"
			>
				<RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
				<span>Checking AI connection…</span>
			</div>
		);
	}

	// Error state
	const icon =
		status.error === "no_api_key" || status.error === "invalid_api_key" ? (
			<Key className="h-3.5 w-3.5 shrink-0 text-amber-400" />
		) : status.error === "no_internet" ||
		  status.error === "provider_unreachable" ? (
			<WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-400" />
		) : (
			<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
		);

	return (
		<div
			role="alert"
			className="fixed bottom-0 inset-x-0 flex items-center gap-2.5 px-5 py-2.5 bg-amber-950/90 border-t border-amber-800/60 text-amber-200 text-xs select-none z-50"
		>
			{icon}
			<span className="flex-1 min-w-0">{status.message}</span>
			<button
				type="button"
				onClick={() => checkHealth()}
				className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider bg-amber-900/60 hover:bg-amber-800/60 border border-amber-700/40 transition-colors"
			>
				<RefreshCw className="h-3 w-3" />
				Retry
			</button>
			<button
				type="button"
				onClick={() => setDismissed(true)}
				className="shrink-0 p-0.5 text-amber-400/60 hover:text-amber-200 transition-colors"
			>
				<X className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}
