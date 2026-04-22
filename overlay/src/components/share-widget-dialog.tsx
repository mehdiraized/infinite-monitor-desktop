"use client";

import { useState, useEffect } from "react";
import { Share2, Check, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from "@/components/ui/dialog";
import { useWidgetStore, type Widget } from "@/store/widget-store";

// ── Types ────────────────────────────────────────────────────────────────

interface ShareWidgetDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const CATEGORIES = [
	{ id: "crypto", name: "Crypto" },
	{ id: "finance", name: "Finance" },
	{ id: "geopolitics", name: "Geopolitics" },
	{ id: "analytics", name: "Analytics" },
	{ id: "tools", name: "Tools" },
];

const AUTHOR_KEY = "im-share-author-name";

function slugify(str: string) {
	return str
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

// ── Component ────────────────────────────────────────────────────────────

export function ShareWidgetDialog({
	open,
	onOpenChange,
}: ShareWidgetDialogProps) {
	const widgets = useWidgetStore((s) => s.widgets);
	const readyWidgets = widgets.filter((w) => w.code);

	const [selectedWidgetId, setSelectedWidgetId] = useState<string>("");
	const [category, setCategory] = useState("tools");
	const [authorName, setAuthorName] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Load saved author name
	useEffect(() => {
		const saved = localStorage.getItem(AUTHOR_KEY);
		if (saved) setAuthorName(saved);
	}, []);

	// Auto-select first widget when dialog opens
	useEffect(() => {
		if (open && readyWidgets.length > 0 && !selectedWidgetId) {
			setSelectedWidgetId(readyWidgets[0].id);
		}
		if (open) {
			setSubmitted(false);
			setError(null);
		}
	}, [open, readyWidgets, selectedWidgetId]);

	const selectedWidget = widgets.find((w) => w.id === selectedWidgetId);

	const handleSubmit = async () => {
		if (!selectedWidget || !selectedWidget.code) return;
		setSubmitting(true);
		setError(null);

		// Save author name for next time
		if (authorName.trim()) {
			localStorage.setItem(AUTHOR_KEY, authorName.trim());
		}

		const id = slugify(selectedWidget.title);

		const payload = {
			id,
			name: selectedWidget.title,
			description:
				selectedWidget.description || `${selectedWidget.title} widget`,
			category,
			author: authorName.trim() || "Anonymous",
			widget: {
				title: selectedWidget.title,
				description: selectedWidget.description || "",
				code: selectedWidget.code,
				files: selectedWidget.files || {},
				layoutJson: JSON.stringify({
					x: 0,
					y: 0,
					w: selectedWidget.layout.w,
					h: selectedWidget.layout.h,
				}),
			},
		};

		try {
			// Step 1: Submit to remote Worker (for admin review via GitHub Issues)
			const remoteRes = await fetch("/api/registry/submit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!remoteRes.ok) {
				const data = await remoteRes.json().catch(() => ({}));
				throw new Error(data.error || `HTTP ${remoteRes.status}`);
			}

			setSubmitted(true);

			// Clear localStorage cache so marketplace refreshes
			localStorage.removeItem("im-widget-registry-cache");
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Submission failed";
			setError(message);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-700 text-zinc-100">
				<DialogHeader>
					<DialogTitle className="text-zinc-100">
						Share Widget to Store
					</DialogTitle>
					<DialogDescription className="text-zinc-400">
						Share your widget so others can use it too.
					</DialogDescription>
				</DialogHeader>

				{submitted ? (
					<div className="flex flex-col items-center gap-3 py-6">
						<div className="flex items-center justify-center w-12 h-12 bg-emerald-900/30 border border-emerald-800/50">
							<Check className="h-6 w-6 text-emerald-400" />
						</div>
						<p className="text-sm text-zinc-300 text-center">
							Widget shared successfully!
						</p>
						<p className="text-xs text-zinc-500 text-center">
							It&apos;s now available in the Widget Store.
						</p>
						<DialogClose
							render={
								<Button
									size="sm"
									className="mt-2 bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 text-xs uppercase tracking-wider"
								/>
							}
						>
							Done
						</DialogClose>
					</div>
				) : readyWidgets.length === 0 ? (
					<div className="flex flex-col items-center gap-3 py-6">
						<p className="text-sm text-zinc-400 text-center">
							No widgets with code to share yet.
						</p>
						<p className="text-xs text-zinc-500 text-center">
							Build a widget first using the AI chat, then come back here.
						</p>
					</div>
				) : (
					<>
						<div className="flex flex-col gap-4">
							{/* Widget selector */}
							<div className="flex flex-col gap-1.5">
								<label className="text-[11px] text-zinc-500 uppercase tracking-wider">
									Widget
								</label>
								<div className="relative">
									<select
										value={selectedWidgetId}
										onChange={(e) => setSelectedWidgetId(e.target.value)}
										className="w-full appearance-none bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 pr-8 focus:outline-none focus:border-zinc-500"
									>
										{readyWidgets.map((w) => (
											<option key={w.id} value={w.id}>
												{w.title}
											</option>
										))}
									</select>
									<ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
								</div>
							</div>

							{/* Category selector */}
							<div className="flex flex-col gap-1.5">
								<label className="text-[11px] text-zinc-500 uppercase tracking-wider">
									Category
								</label>
								<div className="flex flex-wrap gap-1.5">
									{CATEGORIES.map((cat) => (
										<button
											key={cat.id}
											onClick={() => setCategory(cat.id)}
											className={`px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
												category === cat.id
													? "bg-zinc-700 text-zinc-100 border border-zinc-600"
													: "bg-zinc-800/50 text-zinc-400 border border-zinc-800 hover:border-zinc-700"
											}`}
										>
											{cat.name}
										</button>
									))}
								</div>
							</div>

							{/* Author name */}
							<div className="flex flex-col gap-1.5">
								<label className="text-[11px] text-zinc-500 uppercase tracking-wider">
									Your Name
								</label>
								<input
									type="text"
									value={authorName}
									onChange={(e) => setAuthorName(e.target.value)}
									placeholder="Anonymous"
									maxLength={50}
									className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
								/>
							</div>

							{/* Error */}
							{error && (
								<div className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 px-3 py-2">
									{error}
								</div>
							)}
						</div>

						<DialogFooter className="bg-zinc-900 border-zinc-800">
							<Button
								size="sm"
								onClick={handleSubmit}
								disabled={submitting || !selectedWidgetId}
								className="gap-1.5 bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 text-xs uppercase tracking-wider"
							>
								{submitting ? (
									<>
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
										Sharing...
									</>
								) : (
									<>
										<Share2 className="h-3.5 w-3.5" />
										Share Widget
									</>
								)}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
