import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Surfaces the PWA install prompt as a programmatic action.
 *
 * Browser support: Chrome/Edge/Brave on desktop & Android (`beforeinstallprompt`).
 * Safari iOS / macOS doesn't fire the event — `available` stays false there,
 * so any Install UI hides automatically.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function useInstallPrompt() {
  const available = ref(false)
  const installed = ref(false)
  let deferred: BeforeInstallPromptEvent | null = null

  function onBeforeInstall(event: Event) {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    available.value = true
  }

  function onInstalled() {
    installed.value = true
    available.value = false
    deferred = null
  }

  async function prompt() {
    if (!deferred) return 'unsupported' as const
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      deferred = null
      available.value = false
      return choice.outcome
    } catch {
      return 'dismissed' as const
    }
  }

  onMounted(() => {
    if (typeof window === 'undefined') return
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    // If already running in standalone, treat as installed.
    if (
      window.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone
    ) {
      installed.value = true
    }
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    window.removeEventListener('appinstalled', onInstalled)
  })

  return { available, installed, prompt }
}
