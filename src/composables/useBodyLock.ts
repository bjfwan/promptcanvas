import { onBeforeUnmount, watch, type WatchSource } from 'vue'

let locks = 0
let previousOverflow = ''
let previousPosition = ''
let previousTop = ''
let previousWidth = ''
let previousScrollY = 0

function applyLock() {
  if (typeof document === 'undefined') return
  if (locks === 0) {
    previousScrollY = typeof window !== 'undefined' ? window.scrollY : 0
    previousOverflow = document.body.style.overflow
    previousPosition = document.body.style.position
    previousTop = document.body.style.top
    previousWidth = document.body.style.width
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${previousScrollY}px`
    document.body.style.width = '100%'
  }
  locks += 1
}

function releaseLock() {
  if (typeof document === 'undefined' || locks === 0) return
  locks -= 1
  if (locks === 0) {
    document.body.style.overflow = previousOverflow
    document.body.style.position = previousPosition
    document.body.style.top = previousTop
    document.body.style.width = previousWidth
    if (typeof window !== 'undefined') window.scrollTo(0, previousScrollY)
    previousOverflow = ''
    previousPosition = ''
    previousTop = ''
    previousWidth = ''
    previousScrollY = 0
  }
}

export function useBodyLock(active: WatchSource<boolean>) {
  let locked = false

  watch(
    active,
    (value) => {
      if (value && !locked) {
        applyLock()
        locked = true
      } else if (!value && locked) {
        releaseLock()
        locked = false
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    if (!locked) return
    releaseLock()
    locked = false
  })
}
