// 小王子 Agent PWA Service Worker
// Network-first for API calls, cache-first for static assets
const CACHE_NAME = 'littleprince-agent-v1'
const STATIC_CACHE = 'littleprince-agent-static-v1'

// Brain UI static assets to pre-cache on install
const STATIC_ASSETS = [
  '/brain-ui',
  '/src/ui/brain-ui/styles.css',
  '/src/ui/brain-ui/app.js',
  '/src/ui/brain-ui/api-client.js',
  '/src/ui/brain-ui/app-shell.js',
  '/src/ui/brain-ui/chat.js',
  '/src/ui/brain-ui/thought-stream.js',
  '/src/ui/brain-ui/voice-panel.js',
  '/src/ui/brain-ui/tts-fx.js',
  '/src/ui/brain-ui/hotspot.js',
  '/src/ui/brain-ui/hotspot-panel.js',
  '/src/ui/brain-ui/hotspot-earth.js',
  '/src/ui/brain-ui/person-card.js',
  '/src/ui/brain-ui/person-card-panel.js',
  '/src/ui/brain-ui/doc.js',
  '/src/ui/brain-ui/doc-panel.js',
  '/src/ui/brain-ui/wechat-popup.js',
  '/src/ui/brain-ui/panel-collapse.js',
  '/src/ui/brain-ui/markdown.js',
  '/src/ui/brain-ui/acui/bootstrap.js',
  '/vendor/d3/d3.min.js',
  '/manifest.json',
]

// API path prefixes — always fetch from network, never cache
const API_PATHS = [
  '/events', '/message', '/memories', '/conversations', '/status',
  '/settings', '/activate', '/admin', '/social', '/hotspot',
  '/docs', '/tts', '/media', '/aivideo', '/voice', '/acui',
  '/quota', '/agent-profile', '/activation-status', '/system-prompt-preview',
]

function isApiRequest(url) {
  return API_PATHS.some(prefix => url.pathname.startsWith(prefix))
}

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Some static assets failed to cache:', err)
      })
    })
  )
  // Activate immediately, don't wait for old SW to close
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

// Fetch: network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return

  // WebSocket connections — skip
  if (request.mode === 'websocket') return

  // API calls — network only (no cache)
  if (isApiRequest(url)) return

  // SSE EventSource requests — network only
  if (request.destination === '' && url.pathname === '/events') return

  // Static assets — cache-first, network fallback with cache update
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone))
        }
        return response
      }).catch(() => cached)

      return cached || fetchPromise
    })
  )
})
