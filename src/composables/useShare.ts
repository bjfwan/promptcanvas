import { computed, ref } from 'vue'

/**
 * Web Share API wrapper.
 *
 * Modern: Share an actual `File` so iOS / Android / Chromium picker offers
 * Photos, AirDrop, Telegram, etc. Falls back to text-only share where files
 * aren't supported, then to clipboard, then to a hint that the OS doesn't
 * support sharing at all.
 */
export type ShareOutcome = 'shared' | 'fallback-copy' | 'cancelled' | 'unsupported' | 'failed'

export interface ShareTarget {
  title?: string
  text?: string
  url?: string
  /** Optional preloaded blob; we'll wrap it as a File. */
  blob?: Blob | null
  /** Filename when blob is provided. */
  filename?: string
}

const navIsAvailable = typeof navigator !== 'undefined'
const supportsShare = navIsAvailable && typeof navigator.share === 'function'
// Some browsers (Safari iOS) expose share() but not canShare(); guard both.
const supportsCanShare = navIsAvailable && typeof navigator.canShare === 'function'

export function useShare() {
  const lastOutcome = ref<ShareOutcome | null>(null)
  const supported = computed(() => supportsShare)

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard?.writeText(text)
      return true
    } catch {
      return false
    }
  }

  async function share(target: ShareTarget): Promise<ShareOutcome> {
    if (!supportsShare) {
      // No share at all; degrade to clipboard.
      const fallbackText = target.url || target.text || ''
      const ok = fallbackText ? await copyToClipboard(fallbackText) : false
      lastOutcome.value = ok ? 'fallback-copy' : 'unsupported'
      return lastOutcome.value
    }

    const data: ShareData = {
      title: target.title,
      text: target.text,
      url: target.url,
    }

    if (target.blob) {
      const file = new File(
        [target.blob],
        target.filename || 'promptcanvas.png',
        { type: target.blob.type || 'image/png' },
      )
      const withFile: ShareData & { files?: File[] } = { ...data, files: [file] }
      // canShare with files lets us know if the browser will accept this combo.
      if (!supportsCanShare || navigator.canShare?.(withFile as ShareData)) {
        try {
          await navigator.share(withFile as ShareData)
          lastOutcome.value = 'shared'
          return 'shared'
        } catch (err) {
          if ((err as DOMException)?.name === 'AbortError') {
            lastOutcome.value = 'cancelled'
            return 'cancelled'
          }
          // Fall through to text-only share below.
        }
      }
    }

    try {
      await navigator.share(data)
      lastOutcome.value = 'shared'
      return 'shared'
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') {
        lastOutcome.value = 'cancelled'
        return 'cancelled'
      }
      const fallbackText = target.url || target.text || ''
      const ok = fallbackText ? await copyToClipboard(fallbackText) : false
      lastOutcome.value = ok ? 'fallback-copy' : 'failed'
      return lastOutcome.value
    }
  }

  return { supported, share, lastOutcome }
}
