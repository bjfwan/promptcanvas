import { reactive } from 'vue'

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  text: string
  kind: ToastKind
  hint?: string
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

function push(text: string, options: { kind?: ToastKind; hint?: string; duration?: number } = {}) {
  const id = nextId++
  const item: ToastItem = {
    id,
    text,
    kind: options.kind ?? 'info',
    hint: options.hint,
  }

  state.items.push(item)

  // 限制最多 4 条同时显示
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

  const duration = options.duration ?? (item.kind === 'error' ? 4200 : 2400)

  if (duration > 0) {
    const timer = window.setTimeout(() => dismiss(id), duration)
    timers.set(id, timer)
  }

  return id
}

export function useToast() {
  return {
    items: state.items,
    push,
    dismiss,
    success: (text: string, hint?: string) => push(text, { kind: 'success', hint }),
    error: (text: string, hint?: string) => push(text, { kind: 'error', hint }),
    info: (text: string, hint?: string) => push(text, { kind: 'info', hint }),
  }
}
