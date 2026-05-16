import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Global "?" hotkey to open the shortcuts dialog.
 * Mirrors common conventions (GitHub, Linear, Slack, …).
 */
export function useShortcutsDialog() {
  const open = ref(false)

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    return target.isContentEditable
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== '?') return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (isEditableTarget(event.target)) return
    event.preventDefault()
    open.value = true
  }

  onMounted(() => {
    window.addEventListener('keydown', onKey)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
  })

  return { open }
}
