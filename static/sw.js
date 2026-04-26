// E-TIPS Service Worker v2.0
// Full offline support: caches app shell + last earthquake data

const CACHE_NAME = 'etips-v2.0';
const DATA_CACHE = 'etips-data-v2.0';

// All static assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/static/js/app.js',
    '/static/css/style.css',
    '/static/manifest.json',
    '/static/images/icon-192.png',
    '/static/images/icon-512.png',
    '/static/images/hero-family.jpg',
    '/static/images/before-earthquake.jpg',
    '/static/images/during-earthquake.jpg',
    '/static/images/after-earthquake.jpg'
];

// ── Install: cache all static assets ────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ── Activate: clear old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME && k !== DATA_CACHE)
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: smart caching strategy ───────────────────────────────────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // API requests: network first, fallback to cached data
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirstWithCache(event.request));
        return;
    }

    // Static assets: cache first, then network
    event.respondWith(cacheFirstWithNetwork(event.request));
});

// Network first (for API data) — saves response to cache for offline use
async function networkFirstWithCache(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(DATA_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        // Offline — return cached data if available
        const cached = await caches.match(request);
        if (cached) return cached;

        // No cached data — return offline message for API
        const path = new URL(request.url).pathname;
        if (path === '/api/earthquakes') {
            return new Response(JSON.stringify([]), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        if (path === '/api/alerts') {
            return new Response(JSON.stringify([{
                id: 'offline-1',
                type: 'info',
                severity: 'info',
                title: 'You are offline',
                message: 'Connect to the internet to see live earthquake data and alerts.',
                timestamp: new Date().toISOString(),
                isRead: false,
                earthquakeData: null
            }]), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    }
}

// Cache first (for static assets) — fast load, updates in background
async function cacheFirstWithNetwork(request) {
    const cached = await caches.match(request);
    if (cached) {
        // Update cache in background
        fetch(request).then(response => {
            if (response && response.ok) {
                caches.open(CACHE_NAME).then(cache => cache.put(request, response));
            }
        }).catch(() => {});
        return cached;
    }
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        // Return offline page if main page fails
        if (request.mode === 'navigate') {
            const offlinePage = await caches.match('/');
            return offlinePage || new Response('<h1>E-TIPS is offline</h1><p>Connect to internet to use the app.</p>', {
                headers: { 'Content-Type': 'text/html' }
            });
        }
        return new Response('', { status: 503 });
    }
}

// ── Push Notification Handler ────────────────────────────────────────────────
self.addEventListener('push', event => {
    let data = {
        title: 'E-TIPS Alert',
        body: 'New earthquake detected near you!',
        icon: '/static/images/icon-192.png'
    };
    if (event.data) {
        try { data = { ...data, ...event.data.json() }; } catch(e) {}
    }
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon || '/static/images/icon-192.png',
            badge: '/static/images/icon-192.png',
            vibrate: [300, 100, 300, 100, 600],
            tag: 'etips-earthquake',
            renotify: true,
            requireInteraction: data.critical || false,
            data: { url: data.url || '/', quakeId: data.quakeId }
        })
    );
});

// ── Notification Click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.postMessage({ type: 'SHOW_ALERTS' });
                    return client.focus();
                }
            }
            return clients.openWindow(targetUrl);
        })
    );
});

// ── Background Sync ──────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
    if (event.tag === 'check-earthquakes') {
        event.waitUntil(checkEarthquakesInBackground());
    }
});

async function checkEarthquakesInBackground() {
    try {
        const res = await fetch('/api/earthquakes');
        const quakes = await res.json();
        if (!quakes || quakes.length === 0) return;

        // Cache for offline use
        const cache = await caches.open(DATA_CACHE);
        cache.put('/api/earthquakes', new Response(JSON.stringify(quakes), {
            headers: { 'Content-Type': 'application/json' }
        }));

        const nearest = quakes.reduce((a, b) => a.distance < b.distance ? a : b);
        const severity = nearest.magnitude >= 5.0 ? 'STRONG'
                       : nearest.magnitude >= 4.0 ? 'MODERATE'
                       : nearest.magnitude >= 3.0 ? 'MINOR' : null;
        if (!severity) return;

        await self.registration.showNotification(
            `&#x26A0;&#xFE0F; ${severity} EARTHQUAKE — M${nearest.magnitude}`, {
            body: `${nearest.location} — ${nearest.distance.toFixed(1)}km from you. Depth: ${nearest.depth}km.`,
            icon: '/static/images/icon-192.png',
            vibrate: [400, 100, 400, 100, 800],
            tag: 'etips-bg-quake',
            renotify: true,
            requireInteraction: nearest.magnitude >= 5.0,
            data: { url: '/?view=alerts', quakeId: nearest.id }
        });
    } catch(e) {}
}
