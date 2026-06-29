export const KEYBOARD_DETECT_THRESHOLD = 88
export const KEYBOARD_HYSTERESIS = 24
export const KEYBOARD_VISIBLE_RATIO = 0.82
const RESIZED_LAYOUT_TOLERANCE = 32

export interface MobileViewportMeasurement {
  viewportWidth: number
  layoutHeight: number
  visualHeight: number
  offsetTop: number
  keyboardBaselineHeight: number
  lastCommittedInset: number
  isDesktop: boolean
}

export interface MobileViewportState {
  viewportHeight: number | null
  keyboardInset: number
  keyboardOpen: boolean
  layoutResizedByKeyboard: boolean
  rawKeyboardInset: number
}

export function resolveMobileViewportState(measurement: MobileViewportMeasurement): MobileViewportState {
  const baselineHeight = Math.max(0, Math.round(measurement.keyboardBaselineHeight || measurement.layoutHeight || 0))
  const layoutHeight = Math.max(0, Math.round(measurement.layoutHeight || 0))
  const visualHeight = Math.max(0, Math.round(measurement.visualHeight || layoutHeight || 0))
  const offsetTop = Math.max(0, Math.round(measurement.offsetTop || 0))
  const visibleBottom = visualHeight + offsetTop
  const rawKeyboardInset = Math.max(0, Math.round(baselineHeight - visibleBottom))
  const visualKeyboardLikely =
    rawKeyboardInset > KEYBOARD_DETECT_THRESHOLD
    && visibleBottom < baselineHeight * KEYBOARD_VISIBLE_RATIO
  const layoutResizedByKeyboard =
    visualKeyboardLikely
    && layoutHeight < baselineHeight - KEYBOARD_DETECT_THRESHOLD
    && Math.abs(layoutHeight - visibleBottom) <= RESIZED_LAYOUT_TOLERANCE
  const detectedManualInset = visualKeyboardLikely && !layoutResizedByKeyboard ? rawKeyboardInset : 0

  return {
    viewportHeight: measurement.isDesktop ? null : visualHeight,
    keyboardInset: applyKeyboardInsetHysteresis(detectedManualInset, measurement.lastCommittedInset),
    keyboardOpen: visualKeyboardLikely,
    layoutResizedByKeyboard,
    rawKeyboardInset,
  }
}

function applyKeyboardInsetHysteresis(detectedInset: number, lastCommittedInset: number): number {
  const lastInset = Math.max(0, Math.round(lastCommittedInset || 0))
  const nextInset = Math.max(0, Math.round(detectedInset || 0))
  const crossingZero = (lastInset === 0 && nextInset > 0) || (lastInset > 0 && nextInset === 0)
  const meaningfulChange = Math.abs(nextInset - lastInset) > KEYBOARD_HYSTERESIS

  return crossingZero || meaningfulChange ? nextInset : lastInset
}
