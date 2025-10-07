const CACHE_NAME = 'inventory-app-cache-v6';
const urlsToCache = [
    '/InventarioAPP/',
    '/InventarioAPP/index.html',
    '/InventarioAPP/script.js',
    '/InventarioAPP/style.css',
    '/InventarioAPP/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/bootstrap-icons/1.10.0/font/bootstrap-icons.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});