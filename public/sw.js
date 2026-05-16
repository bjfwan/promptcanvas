/**
 * PromptCanvas service worker — offline shell + smart runtime cache.
 *
 * Strategy:
 *  - Precache static shell (manifest, icons, fallback index)
 *  - Hashed Vite asset bundles → cache-first with background revalidate
 *  - Same-origin GET HTML / CSS / JS / image → stale-while-revalidate
 *  - API / cross-origin / proxy traffic → network-only (never cached)
 *
 * Bumping CACHE_VERSION invalidates everything. The client gets a
 * `controllerchange` event and can show a "reload to upgrade" toast.
 */

const CACHE_VERSION = 'pc-v1'
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/brand/favicon.png',
  '/brand/promptcanvas-icon-96.png',
  '/brand/promptcanvas-icon-192.png',
  '/brand/promptcanvas-icon.png',
  '/brand/apple-touch-icon.png',
]

/** API hosts that must never hit the cache — generation calls. */
const NEVER_CACHE_HOSTNAMES = new Set([
  'api.openai.com',
])

const NEVER_CACHE_PATHS = [
  /\/v1\/images\//,
  /\/v1\/chat\//,
  /\/v1\/models/,
  /\/health$/,
  /\/healthz$/,
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // Use individual fetches so a single 404 doesn't abort the whole install.
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
        ),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

function shouldBypass(url, request) {
  if (request.method !== 'GET') return true
  if (NEVER_CACHE_HOSTNAMES.has(url.hostname)) return true
  if (NEVER_CACHE_PATHS.some((pattern) => pattern.test(url.pathname))) return true
  // Anything that looks like an upstream API call — generation, models, etc.
  if (request.headers.has('X-Upstream-Base')) return true
  if (request.headers.get('Authorization')?.startsWith('Bearer ')) return true
  return false
}

function isHashedAsset(url) {
  // Vite emits /assets/<name>-<hash>.<ext>; the hash makes them safe to cache forever.
  return /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|ttf|otf|svg|png|jpg|jpeg|webp|gif|ico)$/i.test(
    url.pathname,
  )
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone()).catch(() => undefined)
      }
      return response
    })
    .catch(() => undefined)

  if (cached) {
    // Revalidate in background, return cached immediately.
    void networkPromise
    return cached
  }

  const network = await networkPromise
  if (network) return network
  // Last resort: shell index for navigations.
  const shell = await caches.open(SHELL_CACHE)
  const fallback = await shell.match('/index.html')
  return fallback ?? Response.error()
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response && response.status === 200 && response.type === 'basic') {
      cache.put(request, response.clone()).catch(() => undefined)
    }
    return response
  } catch {
    return Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (url.origin !== self.location.origin) {
    // Cross-origin: only cache same-origin assets. Skip everything else.
    return
  }

  if (shouldBypass(url, request)) return

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE))
    return
  }

  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(request)
          if (network && network.status === 200) {
            const cache = await caches.open(SHELL_CACHE)
            cache.put('/index.html', network.clone()).catch(() => undefined)
          }
          return network
        } catch {
          const shell = await caches.open(SHELL_CACHE)
          const fallback = await shell.match('/index.html')
          return fallback ?? Response.error()
        }
      })(),
    )
    return
  }

  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE))
})
