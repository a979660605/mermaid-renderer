var CACHE = 'mermaid-editor-v9';
var URLS = [
  'index.html',
  'style.css?v=9',
  'app.js?v=9',
  'modules/sanitizer.js?v=9',
  'modules/export.js?v=9',
  'marked.min.js',
  'mermaid.min.js',
  'highlight.min.js',
  'html-docx.js',
  'purify.min.js?v=9',
  'manifest.json'
];

function shouldCache(request, response) {
  if (request.method !== 'GET') return false;
  if (!response || !response.ok) return false;
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(URLS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        if (key !== CACHE) return caches.delete(key);
      }));
    }).then(function() {
      return clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request).then(function(response) {
      if (shouldCache(e.request, response)) {
        var copy = response.clone();
        caches.open(CACHE).then(function(cache) {
          cache.put(e.request, copy);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
