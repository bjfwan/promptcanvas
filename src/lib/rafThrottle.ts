// 基于 requestAnimationFrame 的事件节流：
// - 适合高频触发（resize / scroll / visualViewport.resize 等）
// - 同一帧内只调用一次，多余触发被合并
// - 退出页签或不支持 rAF 时退化为微小的 setTimeout
//
// 与传统 leading/trailing setTimeout 节流相比，rAF 节流不会拖慢响应也不会
// 在帧间空转：浏览器空闲（如标签页隐藏）时 rAF 会被自动暂停，避免后台浪费。

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
