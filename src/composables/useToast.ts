import { reactive } from 'vue'

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastAction {
  label: string
  ariaLabel?: string
  /** Returns true to keep the toast open (rare — almost always `void`). */
  handler: () => void | Promise<void>
}

export interface ToastItem {
  id: number
  text: string
  kind: ToastKind
  hint?: string
  duration: number
  action?: ToastAction
}

interface ToastState {
  items: ToastItem[]
}

const state = reactive<ToastState>({ items: [] })
let nextId = 1
const timers = new Map<number, number>()

function dismiss(id: number) {
  const index = state.items.findIndex((item) => item.id === id)
  if (index !== -1) {
    state.items.splice(index, 1)
  }

  const timer = timers.get(id)
  if (timer) {
    window.clearTimeout(timer)
    timers.delete(id)
  }
}

function push(
  text: string,
  options: { kind?: ToastKind; hint?: string; duration?: number; action?: ToastAction } = {},
) {
  const id = nextId++
  // Toasts with an action linger longer so the user can actually click them.
  const actionAwareDefault = options.action ? 6200 : options.kind === 'error' ? 4200 : 2400
  const duration = options.duration ?? actionAwareDefault
  const item: ToastItem = {
    id,
    text,
    kind: options.kind ?? 'info',
    hint: options.hint,
    duration,
    action: options.action,
  }

  state.items.push(item)

  while (state.items.length > 4) {
    const oldest = state.items.shift()
    if (oldest) {
      const timer = timers.get(oldest.id)
      if (timer) {
        window.clearTimeout(timer)
        timers.delete(oldest.id)
      }
    }
  }

  if (duration > 0) {
    const timer = window.setTimeout(() => dismiss(id), duration)
    timers.set(id, timer)
  }

  return id
}

async function runAction(id: number) {
  const item = state.items.find((entry) => entry.id === id)
  if (!item || !item.action) return
  try {
    await item.action.handler()
  } finally {
    dismiss(id)
  }
}

export function useToast() {
  return {
    items: state.items,
    push,
    dismiss,
    runAction,
    success: (text: string, hint?: string, action?: ToastAction) =>
      push(text, { kind: 'success', hint, action }),
    error: (text: string, hint?: string, action?: ToastAction) =>
      push(text, { kind: 'error', hint, action }),
    info: (text: string, hint?: string, action?: ToastAction) =>
      push(text, { kind: 'info', hint, action }),
  }
}
