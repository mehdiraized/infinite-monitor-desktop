'use strict';

/**
 * Infinite Monitor – Offline Service Worker
 *
 * Strategy: Network-first with cache fallback for all cross-origin GET requests
 * (i.e., external API calls made by widget iframes to sources like CoinGecko,
 * fear-greed index APIs, etc.).
 *
 * Same-origin requests (Next.js pages, API routes, widget iframes) pass through
 * untouched so we don't interfere with the app's own server.
 *
 * Cache limits:
 *   – Entries older than MAX_AGE_MS are pruned on cleanup.
 *   – If total origin storage exceeds MAX_BYTES, oldest entries are evicted
 *     until usage drops to 80 % of the limit.
 *   – Cleanup runs at most once every CLEANUP_INTERVAL_MS to avoid overhead.
 */

const DATA_CACHE = 'im-widget-data-v1';
const META_CACHE = 'im-widget-meta-v1'; // stores timestamp per cached URL

const MAX_BYTES         = 200 * 1024 * 1024; // 200 MB
const MAX_AGE_MS        = 30 * 24 * 3600 * 1000; // 30 days
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;  // at most every 5 minutes

let lastCleanup = 0;

// ── Lifecycle ──────────────────────────────────────────────────────────────────

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Remove caches from old SW versions
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((n) => n !== DATA_CACHE && n !== META_CACHE)
            .map((n) => caches.delete(n))
        )
      ),
    ])
  );
});

// ── Fetch interception ─────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only cache cross-origin GET requests (external data APIs from widgets)
  if (request.method !== 'GET') return;

  let requestOrigin;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return; // malformed URL – let it pass
  }

  if (requestOrigin === self.location.origin) return; // same-origin → pass through

  event.respondWith(networkFirst(request));
});

// ── Network-first strategy ─────────────────────────────────────────────────────

async function networkFirst(request) {
  const [dataCache, metaCache] = await Promise.all([
    caches.open(DATA_CACHE),
    caches.open(META_CACHE),
  ]);

  try {
    const response = await fetch(request);

    if (response.ok) {
      // Store a clone in cache and record the timestamp separately
      dataCache.put(request, response.clone());
      metaCache.put(request, new Response(String(Date.now())));
      // Kick off cleanup without blocking the response
      maybeCleanup(dataCache, metaCache);
    }

    return response;
  } catch {
    // Network unavailable – fall back to cached version
    const cached = await dataCache.match(request);
    if (cached) return cached;

    // No cache entry: return a structured offline error the widget can detect
    return new Response(
      JSON.stringify({ error: 'offline', message: 'No cached data available' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'X-SW-Offline': '1' },
      }
    );
  }
}

// ── Cache cleanup ─────────────────────────────────────────────────────────────

function maybeCleanup(dataCache, metaCache) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  cleanup(dataCache, metaCache).catch(() => {});
}

async function cleanup(dataCache, metaCache) {
  const now = Date.now();
  const keys = await metaCache.keys();
  const entries = [];

  for (const req of keys) {
    const meta = await metaCache.match(req);
    const ts = meta ? parseInt(await meta.text(), 10) : 0;

    if (now - ts > MAX_AGE_MS) {
      // Expired – delete immediately
      await dataCache.delete(req);
      await metaCache.delete(req);
    } else {
      entries.push({ req, ts });
    }
  }

  // Check total storage usage; evict oldest entries if over the cap
  if (!self.navigator?.storage?.estimate) return;

  const { usage = 0 } = await self.navigator.storage.estimate();
  if (usage <= MAX_BYTES) return;

  entries.sort((a, b) => a.ts - b.ts); // oldest first

  for (const { req } of entries) {
    const { usage: current = 0 } = await self.navigator.storage.estimate();
    if (current <= MAX_BYTES * 0.8) break; // evict down to 80 % of limit
    await dataCache.delete(req);
    await metaCache.delete(req);
  }
}
