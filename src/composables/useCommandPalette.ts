import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Global ⌘K / Ctrl+K command palette open state.
 * Mounted once at the App level. The shortcut also opens with `/` when
 * focus is not inside an editable element.
 */
export function useCommandPalette() {
  const open = ref(false)

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    return target.isContentEditable
  }

  function onKey(event: KeyboardEvent) {
    const key = event.key.toLowerCase()
    if ((event.metaKey || event.ctrlKey) && key === 'k') {
      event.preventDefault()
      open.value = !open.value
      return
    }
    // `/` opens the palette when focus is outside any editor — Vim-ish.
    if (key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      open.value = true
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKey)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
  })

  return { open }
}
