import { onMounted, onUnmounted, ref } from 'vue'
import { rafThrottle } from '../lib/rafThrottle'

export function useMobileViewport() {
  const viewportHeight = ref<number | null>(null)
  const keyboardInset = ref(0)

  function sync() {
    if (typeof window === 'undefined') return

    if (window.innerWidth >= 1024) {
      viewportHeight.value = null
      keyboardInset.value = 0
      return
    }

    const visualViewport = window.visualViewport
    const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0
    const visualH = visualViewport?.height ?? layoutHeight
    const offsetTop = visualViewport?.offsetTop ?? 0
    const nextViewportHeight = Math.round(visualH + offsetTop)
    const nextKeyboardInset = Math.max(layoutHeight - visualH - offsetTop, 0)

    viewportHeight.value = nextViewportHeight > 0 ? nextViewportHeight : null
    keyboardInset.value = nextKeyboardInset > 88 ? Math.round(nextKeyboardInset) : 0
  }

  const throttledSync = rafThrottle(sync)

  onMounted(() => {
    sync()
    window.addEventListener('resize', throttledSync, { passive: true })
    window.addEventListener('orientationchange', throttledSync, { passive: true })
    window.visualViewport?.addEventListener('resize', throttledSync, { passive: true })
    window.visualViewport?.addEventListener('scroll', throttledSync, { passive: true })
  })

  onUnmounted(() => {
    window.removeEventListener('resize', throttledSync)
    window.removeEventListener('orientationchange', throttledSync)
    window.visualViewport?.removeEventListener('resize', throttledSync)
    window.visualViewport?.removeEventListener('scroll', throttledSync)
    throttledSync.cancel()
  })

  return { viewportHeight, keyboardInset }
}
