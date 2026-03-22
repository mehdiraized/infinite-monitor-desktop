"use client";

import { useEffect, useState } from "react";
import { DashboardGrid } from "@/components/dashboard-grid";
import { ChatSidebar } from "@/components/chat-sidebar";
import { AddMenu } from "@/components/add-menu";
import { DashboardPicker } from "@/components/dashboard-picker";
import { Onboarding } from "@/components/onboarding";

export default function Home() {
  // Detect macOS desktop app to add left padding for native traffic-light buttons.
  // Runs only after hydration to avoid SSR/CSR mismatch.
  const [macApp, setMacApp] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    setMacApp(ua.includes("Electron") && (navigator.platform.startsWith("Mac") || ua.includes("Mac")));
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
            <DashboardPicker />
            <AddMenu />
          </div>
        </header>
        <DashboardGrid />
      </div>
      <ChatSidebar />
    </div>
  );
}
