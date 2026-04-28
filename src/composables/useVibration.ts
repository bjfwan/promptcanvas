// 轻量震动反馈封装：仅在支持的设备 / 用户未关闭 reduce-motion 时触发。
// 不同模式对应不同震动模式（短促、双击、错误模式）。

type VibrationPattern = 'tap' | 'double' | 'success' | 'error' | 'long'

const patterns: Record<VibrationPattern, number | number[]> = {
  tap: 10,
  double: [8, 32, 8],
  success: [12, 40, 18],
  error: [22, 60, 22, 60, 22],
  long: 30,
}

let prefersReducedMotion = false
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  prefersReducedMotion = media.matches
  // 不订阅 listener：用户偏好变化属于罕见场景，每次 vibrate 调用前实时读 matchMedia 也行；
  // 这里保持轻量，挂一次即可。
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', (event) => {
      prefersReducedMotion = event.matches
    })
  }
}

function canVibrate(): boolean {
  if (typeof navigator === 'undefined') return false
  if (typeof navigator.vibrate !== 'function') return false
  if (prefersReducedMotion) return false
  return true
}

export function useVibration() {
  function vibrate(pattern: VibrationPattern = 'tap') {
    if (!canVibrate()) return
    try {
      navigator.vibrate(patterns[pattern])
    } catch {
      // 某些 WebView 在限定上下文里会抛错，忽略。
    }
  }

  function stop() {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    try {
      navigator.vibrate(0)
    } catch {
      // 同上。
    }
  }

  return { vibrate, stop }
}
