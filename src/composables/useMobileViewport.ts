import { onMounted, onUnmounted, shallowRef } from 'vue'
import { resolveMobileViewportState } from '../lib/mobileViewport'
import { rafThrottle } from '../lib/rafThrottle'

const COMMIT_DELAY_MS = 16
const DESKTOP_BREAKPOINT = '(min-width: 1024px)'
const ORIENTATION_WIDTH_DELTA = 24

let desktopMediaList: MediaQueryList | null = null

function isDesktopViewport(): boolean {
  if (typeof window === 'undefined') return false
  if (!desktopMediaList) desktopMediaList = window.matchMedia(DESKTOP_BREAKPOINT)
  return desktopMediaList.matches
}

export function useMobileViewport() {
  const viewportHeight = shallowRef<number | null>(null)
  const keyboardInset = shallowRef(0)
  const keyboardOpen = shallowRef(false)

  let lastCommittedInset = 0
  let pendingHeight: number | null = null
  let pendingInset = 0
  let pendingKeyboardOpen = false
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
    if (pendingKeyboardOpen !== keyboardOpen.value) keyboardOpen.value = pendingKeyboardOpen
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
    const visualHeight = visualViewport?.height ?? layoutHeight
    const offsetTop = visualViewport?.offsetTop ?? 0

    const orientationChanged = Math.abs(viewportWidth - lastViewportWidth) > ORIENTATION_WIDTH_DELTA
    if (
      !layoutHeightBaseline
      || orientationChanged
      || (!keyboardOpen.value && lastCommittedInset === 0 && layoutHeight > layoutHeightBaseline)
    ) {
      layoutHeightBaseline = layoutHeight
      lastViewportWidth = viewportWidth
    }

    const desktopViewport = isDesktopViewport()
    const state = resolveMobileViewportState({
      viewportWidth,
      layoutHeight,
      visualHeight,
      offsetTop,
      keyboardBaselineHeight: Math.max(layoutHeight, layoutHeightBaseline),
      lastCommittedInset,
      isDesktop: desktopViewport,
    })

    pendingHeight = state.viewportHeight && state.viewportHeight > 0 ? state.viewportHeight : null
    pendingInset = state.keyboardInset
    pendingKeyboardOpen = state.keyboardOpen

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

  return { viewportHeight, keyboardInset, keyboardOpen }
}
