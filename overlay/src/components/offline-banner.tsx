"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Registers the service worker and shows a dismissible banner whenever
 * the browser's network connectivity is lost.
 *
 * The banner appears between the header and the dashboard so it never
 * overlaps dropdowns or widget iframes (no z-index conflicts).
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Register the service worker (caches external widget data for offline use)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {}); // non-fatal if SW registration fails
    }

    // Sync with current network state
    setOffline(!navigator.onLine);

    const handleOffline = () => {
      setOffline(true);
      setDismissed(false); // re-show banner if they previously dismissed it
    };
    const handleOnline = () => setOffline(false);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!offline || dismissed) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-2.5 px-5 py-2 bg-amber-950/80 border-b border-amber-800/60 text-amber-200 text-xs select-none"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-400" />
      <span className="flex-1">
        You&apos;re offline — widgets are displaying cached data. Check your connection.
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-amber-500 hover:text-amber-300 transition-colors leading-none"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
