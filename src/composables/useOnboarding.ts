import { ref } from 'vue'

const ONBOARDING_KEY = 'promptcanvas:onboarded-v1'

function loadCompleted(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === '1'
  } catch {
    return true
  }
}

function persistCompleted(value: boolean) {
  if (typeof window === 'undefined') return
  try {
    if (value) window.localStorage.setItem(ONBOARDING_KEY, '1')
    else window.localStorage.removeItem(ONBOARDING_KEY)
  } catch {}
}

const completed = ref(loadCompleted())
const active = ref(false)

/**
 * Onboarding tour state — first-visit auto-start, manual replay via command palette.
 * Single source of truth across the app.
 */
export function useOnboarding() {
  function startIfNeeded() {
    if (typeof window === 'undefined') return
    if (completed.value) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      // Respect users who turned off motion — they can replay via ⌘K → "查看引导"
      completed.value = true
      persistCompleted(true)
      return
    }
    // Wait a beat so layout is settled and lazy components have warmed
    window.setTimeout(() => {
      active.value = true
    }, 600)
  }

  function start() {
    active.value = true
  }

  function finish() {
    active.value = false
    completed.value = true
    persistCompleted(true)
  }

  function dismiss() {
    active.value = false
    completed.value = true
    persistCompleted(true)
  }

  function reset() {
    completed.value = false
    persistCompleted(false)
  }

  return { active, completed, startIfNeeded, start, finish, dismiss, reset }
}
