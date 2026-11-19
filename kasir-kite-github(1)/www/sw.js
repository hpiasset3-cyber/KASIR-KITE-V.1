// Service worker Kasir Kite. Naikkan nomor CACHE bila ingin memaksa penyegaran cache lama.
const CACHE = 'kasir-kite-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

const store = (req, res) => caches.open(CACHE).then(c => c.put(req, res));

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') {
        return;
    }
    const url = new URL(req.url);
    if (url.origin === location.origin) {
        // Jaringan dulu agar versi terbaru langsung terpakai; offline memakai salinan tersimpan.
        e.respondWith(fetch(req)
            .then(res => { if (res.ok) { store(req, res.clone()); } return res; })
            .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
    } else if (url.hostname === 'cdn.jsdelivr.net') {
        // Library XLSX: disimpan setelah pertama kali dimuat supaya ekspor tetap jalan offline.
        e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { store(req, res.clone()); return res; })));
    }
});
