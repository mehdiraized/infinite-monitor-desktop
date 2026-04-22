"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
	Search,
	Star,
	Plus,
	Check,
	Loader2,
	Share2,
	TrendingUp,
	DollarSign,
	Globe,
	BarChart3,
	Wrench,
	Package,
	RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWidgetStore } from "@/store/widget-store";
import { scheduleSyncToServer } from "@/lib/sync-db";
import { ShareWidgetDialog } from "@/components/share-widget-dialog";

// ── Types ────────────────────────────────────────────────────────────────

interface RegistryCategory {
	id: string;
	name: string;
	icon: string;
	description: string;
}

interface RegistryWidget {
	id: string;
	name: string;
	description: string;
	category: string;
	author: string;
	stars: number;
	tags: string[];
	createdAt: string;
	updatedAt: string;
}

interface Registry {
	version: number;
	lastUpdated: string;
	categories: RegistryCategory[];
	widgets: RegistryWidget[];
}

interface WidgetFile {
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
}

// ── Constants ────────────────────────────────────────────────────────────

const CACHE_KEY = "im-widget-registry-cache";
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const CATEGORY_ICONS: Record<string, typeof TrendingUp> = {
	"trending-up": TrendingUp,
	"dollar-sign": DollarSign,
	globe: Globe,
	"bar-chart-3": BarChart3,
	wrench: Wrench,
};

// ── Cache helpers ────────────────────────────────────────────────────────

function getCachedRegistry(): Registry | null {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const { data, timestamp } = JSON.parse(raw);
		if (Date.now() - timestamp > CACHE_TTL) return null;
		return data;
	} catch {
		return null;
	}
}

function setCachedRegistry(data: Registry) {
	try {
		localStorage.setItem(
			CACHE_KEY,
			JSON.stringify({ data, timestamp: Date.now() }),
		);
	} catch {
		// localStorage full — ignore
	}
}

// ── Component ────────────────────────────────────────────────────────────

export function WidgetMarketplace({
	onSwitchToDashboard,
}: {
	onSwitchToDashboard: () => void;
}) {
	const [registry, setRegistry] = useState<Registry | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [activeCategory, setActiveCategory] = useState("all");
	const [addingId, setAddingId] = useState<string | null>(null);
	const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
	const [shareOpen, setShareOpen] = useState(false);

	// Store actions
	const addWidget = useWidgetStore((s) => s.addWidget);
	const setWidgetCode = useWidgetStore((s) => s.setWidgetCode);
	const setWidgetFile = useWidgetStore((s) => s.setWidgetFile);
	const renameWidget = useWidgetStore((s) => s.renameWidget);

	// ── Fetch registry ──────────────────────────────────────────────────

	const fetchRegistry = useCallback(async () => {
		setLoading(true);
		setError(null);

		// Try cache first
		const cached = getCachedRegistry();
		if (cached) {
			setRegistry(cached);
			setLoading(false);
			// Refresh in background
			fetch("/api/registry")
				.then((r) => r.json())
				.then((data: Registry) => {
					if (data.widgets) {
						setRegistry(data);
						setCachedRegistry(data);
					}
				})
				.catch(() => {});
			return;
		}

		try {
			const res = await fetch("/api/registry");
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data: Registry = await res.json();
			if (!data.widgets) throw new Error("Invalid registry data");
			setRegistry(data);
			setCachedRegistry(data);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Failed to load";
			setError(message);
			// Try expired cache as fallback
			try {
				const raw = localStorage.getItem(CACHE_KEY);
				if (raw) {
					const { data } = JSON.parse(raw);
					if (data?.widgets) {
						setRegistry(data);
						setError(null);
					}
				}
			} catch {
				// no fallback
			}
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchRegistry();
	}, [fetchRegistry]);

	// ── Filter & sort widgets ──────────────────────────────────────────

	const filteredWidgets = useMemo(() => {
		if (!registry) return [];
		let widgets = registry.widgets;

		// Category filter
		if (activeCategory !== "all") {
			widgets = widgets.filter((w) => w.category === activeCategory);
		}

		// Search filter
		if (search.trim()) {
			const q = search.toLowerCase();
			widgets = widgets.filter(
				(w) =>
					w.name.toLowerCase().includes(q) ||
					w.description.toLowerCase().includes(q) ||
					w.tags.some((t) => t.includes(q)),
			);
		}

		// Sort by stars
		return [...widgets].sort((a, b) => b.stars - a.stars);
	}, [registry, activeCategory, search]);

	// ── Add widget to dashboard ────────────────────────────────────────

	const handleAddWidget = useCallback(
		async (registryWidget: RegistryWidget) => {
			if (addingId || addedIds.has(registryWidget.id)) return;
			setAddingId(registryWidget.id);

			try {
				// Fetch full widget data
				const res = await fetch(
					`/api/registry/widget?id=${encodeURIComponent(registryWidget.id)}`,
				);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data: WidgetFile = await res.json();

				// Create widget in store using existing patterns
				const widgetId = addWidget(data.widget.title, data.widget.description);

				// Set the code
				if (data.widget.code) {
					setWidgetCode(widgetId, data.widget.code);
				}

				// Set additional files
				if (data.widget.files) {
					for (const [filePath, content] of Object.entries(data.widget.files)) {
						setWidgetFile(widgetId, filePath, content);
					}
				}

				// Bootstrap the widget build on the server
				fetch("/api/widgets/bootstrap", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						widgets: [
							{
								id: widgetId,
								title: data.widget.title,
								description: data.widget.description,
								code: data.widget.code,
								files: data.widget.files,
							},
						],
					}),
				}).catch(console.error);

				scheduleSyncToServer();
				setAddedIds((prev) => new Set(prev).add(registryWidget.id));
			} catch (err) {
				console.error("Failed to add widget:", err);
			} finally {
				setAddingId(null);
			}
		},
		[addWidget, setWidgetCode, setWidgetFile, addingId, addedIds],
	);

	// ── Render ─────────────────────────────────────────────────────────

	return (
		<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
			{/* Toolbar */}
			<div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800">
				{/* Search */}
				<div className="relative flex-1 max-w-md">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search widgets..."
						className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm pl-10 pr-4 py-2 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
					/>
				</div>

				{/* Share widget button */}
				<Button
					size="sm"
					variant="outline"
					className="gap-1.5 border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-xs uppercase tracking-wider shrink-0"
					onClick={() => setShareOpen(true)}
				>
					<Share2 className="h-3.5 w-3.5" />
					Share Widget
				</Button>
			</div>

			{/* Category pills */}
			<div className="flex items-center gap-2 px-6 py-3 border-b border-zinc-800 overflow-x-auto">
				<button
					onClick={() => setActiveCategory("all")}
					className={`shrink-0 px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
						activeCategory === "all"
							? "bg-zinc-700 text-zinc-100 border border-zinc-600"
							: "bg-zinc-800/50 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-300"
					}`}
				>
					All
				</button>
				{registry?.categories.map((cat) => {
					const Icon = CATEGORY_ICONS[cat.icon] || Package;
					return (
						<button
							key={cat.id}
							onClick={() => setActiveCategory(cat.id)}
							className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
								activeCategory === cat.id
									? "bg-zinc-700 text-zinc-100 border border-zinc-600"
									: "bg-zinc-800/50 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-300"
							}`}
						>
							<Icon className="h-3.5 w-3.5" />
							{cat.name}
						</button>
					);
				})}
			</div>

			{/* Widget grid */}
			<ScrollArea className="flex-1">
				<div className="p-6">
					{loading ? (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{Array.from({ length: 6 }).map((_, i) => (
								<div
									key={i}
									className="h-44 bg-zinc-800/30 border border-zinc-800 animate-pulse"
								/>
							))}
						</div>
					) : error ? (
						<div className="flex flex-col items-center justify-center py-20 gap-4">
							<p className="text-sm text-zinc-400">{error}</p>
							<Button
								size="sm"
								variant="outline"
								className="gap-1.5 border-zinc-700 text-zinc-300"
								onClick={fetchRegistry}
							>
								<RefreshCw className="h-3.5 w-3.5" />
								Retry
							</Button>
						</div>
					) : filteredWidgets.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-20 gap-2">
							<Package className="h-8 w-8 text-zinc-600" />
							<p className="text-sm text-zinc-400">No widgets found</p>
							{search && (
								<button
									onClick={() => setSearch("")}
									className="text-xs text-zinc-500 hover:text-zinc-300 underline"
								>
									Clear search
								</button>
							)}
						</div>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{filteredWidgets.map((widget) => {
								const catDef = registry?.categories.find(
									(c) => c.id === widget.category,
								);
								const CatIcon = catDef
									? CATEGORY_ICONS[catDef.icon] || Package
									: Package;
								const isAdding = addingId === widget.id;
								const isAdded = addedIds.has(widget.id);

								return (
									<div
										key={widget.id}
										className="group flex flex-col bg-zinc-900/30 border border-zinc-800 hover:border-zinc-600 transition-all overflow-hidden"
									>
										<div className="flex flex-col gap-3 p-5 flex-1">
											{/* Header */}
											<div className="flex items-start justify-between gap-2">
												<div className="flex items-center gap-2 min-w-0">
													<CatIcon className="h-4 w-4 text-zinc-500 shrink-0" />
													<span className="text-xs font-medium text-zinc-300 truncate">
														{widget.name}
													</span>
												</div>
												<div className="flex items-center gap-1 shrink-0 text-zinc-500">
													<Star className="h-3 w-3 fill-current" />
													<span className="text-[11px]">{widget.stars}</span>
												</div>
											</div>

											{/* Description */}
											<p className="text-[11px] text-zinc-500 leading-relaxed line-clamp-2">
												{widget.description}
											</p>

											{/* Meta */}
											<div className="flex items-center justify-between mt-auto pt-2">
												<div className="flex items-center gap-2">
													<span className="text-[10px] text-zinc-600 uppercase tracking-wider">
														{catDef?.name || widget.category}
													</span>
													<span className="text-[10px] text-zinc-700">·</span>
													<span className="text-[10px] text-zinc-600">
														{widget.author}
													</span>
												</div>
											</div>
										</div>

										{/* Add button */}
										<div className="px-5 pb-4">
											<button
												onClick={() => handleAddWidget(widget)}
												disabled={isAdding || isAdded}
												className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs uppercase tracking-wider transition-all ${
													isAdded
														? "bg-emerald-900/30 text-emerald-400 border border-emerald-800/50 cursor-default"
														: isAdding
															? "bg-zinc-800 text-zinc-400 border border-zinc-700 cursor-wait"
															: "bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600 cursor-pointer"
												}`}
											>
												{isAdded ? (
													<>
														<Check className="h-3.5 w-3.5" />
														Added
													</>
												) : isAdding ? (
													<>
														<Loader2 className="h-3.5 w-3.5 animate-spin" />
														Adding...
													</>
												) : (
													<>
														<Plus className="h-3.5 w-3.5" />
														Add to Dashboard
													</>
												)}
											</button>
										</div>
									</div>
								);
							})}
						</div>
					)}

					{/* Footer info */}
					{!loading && !error && filteredWidgets.length > 0 && (
						<div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-800">
							<span className="text-[10px] text-zinc-600">
								{filteredWidgets.length} widget
								{filteredWidgets.length !== 1 ? "s" : ""}
								{activeCategory !== "all" &&
									` in ${registry?.categories.find((c) => c.id === activeCategory)?.name}`}
							</span>
							<button
								onClick={() => setShareOpen(true)}
								className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
							>
								Share your widget →
							</button>
						</div>
					)}
				</div>
			</ScrollArea>

			{/* Share dialog */}
			<ShareWidgetDialog
				open={shareOpen}
				onOpenChange={(open) => {
					setShareOpen(open);
					// Refresh registry when dialog closes after a successful share
					if (!open) fetchRegistry();
				}}
			/>
		</div>
	);
}
