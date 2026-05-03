import { onMounted, ref, watch } from 'vue'

export type ThemeMode = 'paper' | 'night'

const storageKey = 'promptcanvas:theme-v1'
const theme = ref<ThemeMode>('paper')
let initialised = false
let transitionTimer: number | undefined

function detectInitial(): ThemeMode {
  if (typeof window === 'undefined') return 'paper'

  try {
    const stored = window.localStorage.getItem(storageKey)
    if (stored === 'paper' || stored === 'night') return stored
  } catch {
  }

  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'night'
  }

  return 'paper'
}

function applyTheme(value: ThemeMode) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.classList.toggle('theme-night', value === 'night')
  root.dataset.theme = value

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) {
    meta.content = value === 'night' ? '#121413' : '#f4f0e7'
  }
}

function startThemeTransition() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const root = document.documentElement
  root.classList.add('theme-transition')
  if (transitionTimer) {
    window.clearTimeout(transitionTimer)
  }
  transitionTimer = window.setTimeout(() => {
    root.classList.remove('theme-transition')
    transitionTimer = undefined
  }, 220)
}

export function useTheme() {
  if (!initialised && typeof window !== 'undefined') {
    initialised = true
    theme.value = detectInitial()
    applyTheme(theme.value)
  }

  onMounted(() => {
    applyTheme(theme.value)
  })

  watch(theme, (next) => {
    startThemeTransition()
    applyTheme(next)
    try {
      window.localStorage.setItem(storageKey, next)
    } catch {
    }
  })

  function toggle() {
    theme.value = theme.value === 'paper' ? 'night' : 'paper'
  }

  function set(next: ThemeMode) {
    theme.value = next
  }

  return { theme, toggle, set }
}
