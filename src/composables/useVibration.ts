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
    }
  }

  function stop() {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    try {
      navigator.vibrate(0)
    } catch {
    }
  }

  return { vibrate, stop }
}
