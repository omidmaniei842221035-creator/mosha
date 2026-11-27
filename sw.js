const CACHE = 'shahr-advisor-pc-v36';
const APP_CACHE_PREFIX = 'shahr-advisor-pc-';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './pdf.min.js',
  './pdf.worker.min.js',
  './ocr-core.js',
  './ocr-fas.js',
  './speech-tool.css',
  './speech-tool.js',
  './local-chat.css',
  './local-chat.js',
  './local-llm/web-llm.mjs',
  './local-llm/web-llm-worker.mjs',
  './local-llm/README.md',
  './local-llm/LICENSE-APACHE-2.0.txt',
  './speech-vendor/espeak-ng.mjs',
  './speech-vendor/espeak-ng.wasm',
  './speech-vendor/espeak-core.mjs',
  './speech-vendor/espeak-worker.mjs',
  './speech-vendor/README.md',
  './speech-vendor/LICENSE-GPL-3.0.txt'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      // Preserve WebLLM's own caches (webllm/* and tvmjs-cos-hash-meta) across app updates.
      .then(keys => Promise.all(keys.filter(key => key.startsWith(APP_CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
      return await fetch(request);
    } catch (error) {
      if (request.mode === 'navigate') {
        const appShell = await caches.match('./index.html');
        if (appShell) return appShell;
      }
      throw error;
    }
  })());
});
