"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, Package } from "lucide-react";
import { DashboardGrid } from "@/components/dashboard-grid";
import { ChatSidebar } from "@/components/chat-sidebar";
import { AddMenu } from "@/components/add-menu";
import { DashboardPicker } from "@/components/dashboard-picker";
import { Onboarding } from "@/components/onboarding";
import { WidgetMarketplace } from "@/components/widget-marketplace";

type View = "dashboard" | "widgets";

export default function Home() {
	const [view, setView] = useState<View>("dashboard");

	// Detect macOS desktop app to add left padding for native traffic-light buttons.
	// Runs only after hydration to avoid SSR/CSR mismatch.
	const [macApp, setMacApp] = useState(false);
	useEffect(() => {
		const ua = navigator.userAgent;
		setMacApp(
			ua.includes("Electron") &&
				(navigator.platform.startsWith("Mac") || ua.includes("Mac")),
		);
	}, []);

	return (
		<div className="flex h-screen overflow-hidden bg-zinc-900">
			<Onboarding />
			<div className="flex flex-col flex-1 min-w-0">
				{/*
          Header is the window drag region on macOS (frameless window).
          - The entire header drags the window.
          - Interactive elements inside get -webkit-app-region: no-drag so they stay clickable.
          - Left padding reserves space for the macOS traffic-light buttons (close/minimize/zoom).
        */}
				<header
					className="flex items-center justify-end gap-2 px-5 py-3"
					style={{
						paddingLeft: macApp ? 82 : undefined,
						// @ts-expect-error — Electron-specific CSS property not in React's CSSProperties
						WebkitAppRegion: "drag",
					}}
				>
					<div
						className="flex shrink-0 flex-wrap items-center gap-2"
						style={{
							// @ts-expect-error — Electron-specific CSS property
							WebkitAppRegion: "no-drag",
						}}
					>
						{/* View toggle */}
						<div className="flex items-center border border-zinc-700 bg-zinc-800">
							<button
								data-view-dashboard
								onClick={() => setView("dashboard")}
								className={`flex items-center gap-1.5 px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
									view === "dashboard"
										? "bg-zinc-700 text-zinc-100"
										: "text-zinc-400 hover:text-zinc-200"
								}`}
							>
								<LayoutGrid className="h-3.5 w-3.5" />
								Dashboard
							</button>
							<button
								data-view-widgets
								onClick={() => setView("widgets")}
								className={`flex items-center gap-1.5 px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
									view === "widgets"
										? "bg-zinc-700 text-zinc-100"
										: "text-zinc-400 hover:text-zinc-200"
								}`}
							>
								<Package className="h-3.5 w-3.5" />
								Widgets
							</button>
						</div>

						{view === "dashboard" && (
							<>
								<DashboardPicker />
								<AddMenu />
							</>
						)}
					</div>
				</header>

				{view === "dashboard" ? (
					<DashboardGrid />
				) : (
					<WidgetMarketplace onSwitchToDashboard={() => setView("dashboard")} />
				)}
			</div>
			{view === "dashboard" && <ChatSidebar />}
		</div>
	);
}
