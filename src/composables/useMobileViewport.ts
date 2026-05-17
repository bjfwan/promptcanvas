import { onMounted, onUnmounted, ref } from 'vue'
import { rafThrottle } from '../lib/rafThrottle'

const KEYBOARD_DETECT_THRESHOLD = 88
// Hysteresis: ignore sub-threshold visualViewport noise (iOS scrolls textarea
// triggers tiny offsetTop oscillations that would otherwise jitter the dock).
const KEYBOARD_HYSTERESIS = 24
// Stabilize quick bursts of resize/scroll events from visualViewport — only
// commit changes when the value stops moving for ~60ms.
const COMMIT_DELAY_MS = 60

export function useMobileViewport() {
  const viewportHeight = ref<number | null>(null)
  const keyboardInset = ref(0)

  let lastCommittedInset = 0
  let pendingHeight: number | null = null
  let pendingInset = 0
  let stableTimer: ReturnType<typeof setTimeout> | undefined

  function syncCssVar(value: number) {
    if (typeof document === 'undefined') return
    document.documentElement.style.setProperty('--keyboard-inset', `${value}px`)
  }

  function commitNow() {
    if (stableTimer) {
      clearTimeout(stableTimer)
      stableTimer = undefined
    }
    if (pendingHeight !== viewportHeight.value) viewportHeight.value = pendingHeight
    if (pendingInset !== lastCommittedInset) {
      lastCommittedInset = pendingInset
      keyboardInset.value = pendingInset
      syncCssVar(pendingInset)
    }
  }

  function scheduleCommit() {
    if (stableTimer) clearTimeout(stableTimer)
    stableTimer = setTimeout(() => {
      stableTimer = undefined
      commitNow()
    }, COMMIT_DELAY_MS)
  }

  function sync() {
    if (typeof window === 'undefined') return

    if (window.innerWidth >= 1024) {
      pendingHeight = null
      pendingInset = 0
      commitNow()
      return
    }

    const visualViewport = window.visualViewport
    const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0
    const visualH = visualViewport?.height ?? layoutHeight
    const offsetTop = visualViewport?.offsetTop ?? 0
    const nextViewportHeight = Math.round(visualH + offsetTop)

    const rawInset = layoutHeight - visualH - offsetTop
    const detectedInset = rawInset > KEYBOARD_DETECT_THRESHOLD ? Math.round(rawInset) : 0

    pendingHeight = nextViewportHeight > 0 ? nextViewportHeight : null

    // Apply hysteresis: small fluctuations don't trigger updates, but state
    // transitions (open ↔ close) always pass through.
    const crossingZero =
      (lastCommittedInset === 0 && detectedInset > 0) ||
      (lastCommittedInset > 0 && detectedInset === 0)
    const meaningfulChange = Math.abs(detectedInset - lastCommittedInset) > KEYBOARD_HYSTERESIS

    if (crossingZero || meaningfulChange) {
      pendingInset = detectedInset
    } else {
      pendingInset = lastCommittedInset
    }

    scheduleCommit()
  }

  const throttledSync = rafThrottle(sync)

  onMounted(() => {
    sync()
    commitNow()
    window.addEventListener('resize', throttledSync, { passive: true })
    window.addEventListener('orientationchange', throttledSync, { passive: true })
    window.visualViewport?.addEventListener('resize', throttledSync, { passive: true })
    window.visualViewport?.addEventListener('scroll', throttledSync, { passive: true })
  })

  onUnmounted(() => {
    if (stableTimer) {
      clearTimeout(stableTimer)
      stableTimer = undefined
    }
    window.removeEventListener('resize', throttledSync)
    window.removeEventListener('orientationchange', throttledSync)
    window.visualViewport?.removeEventListener('resize', throttledSync)
    window.visualViewport?.removeEventListener('scroll', throttledSync)
    throttledSync.cancel()
    if (typeof document !== 'undefined') {
      document.documentElement.style.removeProperty('--keyboard-inset')
    }
  })

  return { viewportHeight, keyboardInset }
}
