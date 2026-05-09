type AnyArgs = unknown[]

export function rafThrottle<T extends (...args: AnyArgs) => void>(fn: T): T & { cancel: () => void } {
  let frameId: number | null = null
  let lastArgs: Parameters<T> | null = null
  let lastThis: unknown = null

  const hasRaf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'

  function schedule() {
    if (frameId !== null) return
    if (hasRaf) {
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        if (lastArgs) {
          const args = lastArgs
          const ctx = lastThis
          lastArgs = null
          lastThis = null
          fn.apply(ctx, args)
        }
      })
    } else {
      frameId = (setTimeout(() => {
        frameId = null
        if (lastArgs) {
          const args = lastArgs
          const ctx = lastThis
          lastArgs = null
          lastThis = null
          fn.apply(ctx, args)
        }
      }, 16) as unknown) as number
    }
  }

  function throttled(this: unknown, ...args: Parameters<T>) {
    lastArgs = args
    lastThis = this
    schedule()
  }

  ;(throttled as T & { cancel: () => void }).cancel = () => {
    if (frameId !== null) {
      if (hasRaf) {
        window.cancelAnimationFrame(frameId)
      } else {
        clearTimeout(frameId as unknown as number)
      }
      frameId = null
    }
    lastArgs = null
    lastThis = null
  }

  return throttled as T & { cancel: () => void }
}
