import { onMounted, ref } from 'vue'

/**
 * Registers /sw.js after first load, exposes:
 *  - `updateAvailable` — a fresh worker is waiting; show a toast / button
 *  - `applyUpdate()`   — tell the new SW to skipWaiting & reload
 *
 * Disabled in dev (Vite serves modules HMR-style) and when the browser
 * lacks Service Worker support.
 */
export function useServiceWorker() {
  const updateAvailable = ref(false)
  const ready = ref(false)
  let waitingWorker: ServiceWorker | null = null

  function applyUpdate() {
    if (!waitingWorker) {
      window.location.reload()
      return
    }
    waitingWorker.postMessage('SKIP_WAITING')
  }

  function trackInstalling(worker: ServiceWorker | null) {
    if (!worker) return
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        waitingWorker = worker
        updateAvailable.value = true
      }
    })
  }

  onMounted(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (import.meta.env.DEV) return

    // Defer registration until the page has settled — never compete with
    // the first paint or initial generation request.
    const start = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          ready.value = true

          if (registration.waiting && navigator.serviceWorker.controller) {
            waitingWorker = registration.waiting
            updateAvailable.value = true
          }

          registration.addEventListener('updatefound', () => {
            trackInstalling(registration.installing)
          })

          // Force-check periodically so long-lived tabs eventually pick up new builds.
          window.setInterval(
            () => {
              registration.update().catch(() => undefined)
            },
            60 * 60 * 1000, // 1h
          )
        })
        .catch(() => {
          // Registration failed (CSP, private mode, etc.) — silently degrade.
        })

      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return
        refreshing = true
        window.location.reload()
      })
    }

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(start, { timeout: 4000 })
    } else {
      window.setTimeout(start, 1500)
    }
  })

  return { updateAvailable, ready, applyUpdate }
}
