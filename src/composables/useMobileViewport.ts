import { onMounted, onUnmounted, ref } from 'vue'
import { rafThrottle } from '../lib/rafThrottle'

const KEYBOARD_DETECT_THRESHOLD = 88
// Hysteresis: ignore sub-threshold visualViewport noise (iOS scrolls textarea
// triggers tiny offsetTop oscillations that would otherwise jitter the dock).
const KEYBOARD_HYSTERESIS = 24
const KEYBOARD_VISIBLE_RATIO = 0.82
// Stabilize quick bursts of resize/scroll events from visualViewport — only
// commit changes when the value stops moving for ~16ms.
const COMMIT_DELAY_MS = 16

// Same breakpoint as App.vue's isDesktop = useMediaQuery('(min-width: 1024px)').
// Kept on matchMedia (CSS px) so the JS gate agrees with the CSS-driven layout
// switch even when page zoom shifts layout px away from CSS px.
const DESKTOP_BREAKPOINT = '(min-width: 1024px)'

let desktopMediaList: MediaQueryList | null = null
function isDesktopViewport(): boolean {
  if (typeof window === 'undefined') return false
  if (!desktopMediaList) desktopMediaList = window.matchMedia(DESKTOP_BREAKPOINT)
  return desktopMediaList.matches
}

export function useMobileViewport() {
  const viewportHeight = ref<number | null>(null)
  const keyboardInset = ref(0)

  let lastCommittedInset = 0
  let pendingHeight: number | null = null
  let pendingInset = 0
  let stableTimer: ReturnType<typeof setTimeout> | undefined
  let layoutHeightBaseline = 0
  let lastViewportWidth = 0

  function syncCssVars(keyboardValue: number, heightValue: number | null) {
    if (typeof document === 'undefined') return
    document.documentElement.style.setProperty('--keyboard-inset', `${keyboardValue}px`)
    if (heightValue && heightValue > 0) {
      document.documentElement.style.setProperty('--mobile-viewport-height', `${heightValue}px`)
    } else {
      document.documentElement.style.removeProperty('--mobile-viewport-height')
    }
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
    }
    syncCssVars(lastCommittedInset, pendingHeight)
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

    const visualViewport = window.visualViewport
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
    const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0
    const visualH = visualViewport?.height ?? layoutHeight
    const offsetTop = visualViewport?.offsetTop ?? 0
    const nextViewportHeight = Math.round(visualH + offsetTop)

    const orientationChanged = Math.abs(viewportWidth - lastViewportWidth) > 24
    if (!layoutHeightBaseline || orientationChanged || (lastCommittedInset === 0 && layoutHeight > layoutHeightBaseline)) {
      layoutHeightBaseline = layoutHeight
      lastViewportWidth = viewportWidth
    }

    const baseHeight = Math.max(layoutHeight, layoutHeightBaseline)
    const rawInset = baseHeight - visualH - offsetTop
    const keyboardLikely = rawInset > KEYBOARD_DETECT_THRESHOLD && visualH < baseHeight * KEYBOARD_VISIBLE_RATIO
    const detectedInset = keyboardLikely ? Math.round(rawInset) : 0

    // Desktop (incl. iPad landscape) now runs keyboard detection too, so
    // PromptComposer can lift itself via --keyboard-inset. Desktop must NOT
    // publish --mobile-viewport-height: the four dialogs that consume it fall
    // back to 100dvh, and a px value here would shrink them on real desktops.
    const desktopViewport = isDesktopViewport()
    pendingHeight = desktopViewport ? null : (nextViewportHeight > 0 ? nextViewportHeight : null)

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
      document.documentElement.style.removeProperty('--mobile-viewport-height')
    }
  })

  return { viewportHeight, keyboardInset }
}
