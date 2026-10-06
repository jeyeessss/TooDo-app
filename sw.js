const SHELL_CACHE = 'todo-shell-v1';
const RUNTIME_CACHE = 'todo-runtime-v1';
const APP_ASSETS = [
    './',
    './index.html',
    './trash.html',
    './style.css',
    './script.js',
    './trash.js',
    './task-storage.js',
    './supabase-client.js',
    './manifest.webmanifest',
    './icon.png'
];
const CDN_ASSETS = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdn.jsdelivr.net/npm/chrono-node@2.8.0/+esm',
    'https://cdn.jsdelivr.net/npm/dayjs@1.11.13/+esm',
    'https://cdn.jsdelivr.net/npm/dayjs@1.11.13/plugin/quarterOfYear.js/+esm'
];

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const shellCache = await caches.open(SHELL_CACHE);
        await Promise.all(APP_ASSETS.map(asset => shellCache.add(asset).catch(error => {
            console.warn('Could not cache app asset:', asset, error);
        })));

        const runtimeCache = await caches.open(RUNTIME_CACHE);
        await Promise.all(CDN_ASSETS.map(asset => runtimeCache.add(new Request(asset, { mode: 'cors' })).catch(error => {
            console.warn('Could not cache offline dependency:', asset, error);
        })));

        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames
            .filter(name => ![SHELL_CACHE, RUNTIME_CACHE].includes(name))
            .map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const requestUrl = new URL(request.url);
    if (requestUrl.hostname.endsWith('.supabase.co')) return;

    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).then(response => {
            const responseCopy = response.clone();
            caches.open(SHELL_CACHE).then(cache => cache.put(request, responseCopy));
            return response;
        }).catch(async () => {
            const cachedPage = await caches.match(request);
            return cachedPage || caches.match('./index.html');
        }));
        return;
    }

    const isLocalAsset = requestUrl.origin === self.location.origin;
    const isCdnAsset = requestUrl.hostname === 'cdn.jsdelivr.net';
    if (!isLocalAsset && !isCdnAsset) return;

    event.respondWith(caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
            if (response.ok || response.type === 'opaque') {
                const cacheName = isLocalAsset ? SHELL_CACHE : RUNTIME_CACHE;
                caches.open(cacheName).then(cache => cache.put(request, response.clone()));
            }
            return response;
        });
    }));
});