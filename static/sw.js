// E-TIPS Service Worker v1.2
// Handles background sync, push notifications, and offline caching

const CACHE_NAME = 'etips-v1.2';
const STATIC_ASSETS = [
    '/',
    '/static/js/app.js',
    '/static/css/style.css'
];

// ── Install & Cache ───────────────────────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// ── Push Notification Handler ────────────────────────────────────────────────
self.addEventListener('push', event => {
    let data = { title: 'E-TIPS Alert', body: 'New earthquake detected near you!', icon: '/static/images/icon-192.png' };
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

// ── Notification Click → Open App ───────────────────────────────────────────
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

// ── Background Sync (fetch & notify) ────────────────────────────────────────
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
        const nearest = quakes.reduce((a, b) => a.distance < b.distance ? a : b);
        const severity = nearest.magnitude >= 5.0 ? 'STRONG'
                       : nearest.magnitude >= 4.0 ? 'MODERATE'
                       : nearest.magnitude >= 3.0 ? 'MINOR' : null;
        if (!severity) return;
        await self.registration.showNotification(`⚠️ ${severity} EARTHQUAKE — M${nearest.magnitude}`, {
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
