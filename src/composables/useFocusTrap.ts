import { nextTick, onBeforeUnmount, watch, type Ref, type WatchSource } from 'vue'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    if (element.hasAttribute('disabled')) return false
    if (element.getAttribute('aria-hidden') === 'true') return false
    const style = window.getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden'
  })
}

export function useFocusTrap(open: WatchSource<boolean>, container: Ref<HTMLElement | null>) {
  let previouslyFocused: HTMLElement | null = null

  function focusInitial() {
    const target = container.value
    if (!target) return
    const focusable = getFocusable(target)
    const first = focusable[0] ?? target
    first.focus({ preventScroll: true })
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return
    const target = container.value
    if (!target) return
    const focusable = getFocusable(target)
    if (!focusable.length) {
      event.preventDefault()
      target.focus({ preventScroll: true })
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus({ preventScroll: true })
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus({ preventScroll: true })
    }
  }

  watch(
    open,
    (isOpen) => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return
      if (isOpen) {
        previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
        window.addEventListener('keydown', handleKeydown, { capture: true })
        void nextTick(focusInitial)
      } else {
        window.removeEventListener('keydown', handleKeydown, { capture: true })
        previouslyFocused?.focus({ preventScroll: true })
        previouslyFocused = null
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeydown, { capture: true })
    }
  })
}
