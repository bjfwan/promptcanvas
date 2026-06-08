import { computed, reactive } from 'vue'
import type { ResolutionTier } from '../types'

const STORAGE_KEY = 'promptcanvas:resolution-support-v1'

// Tri-state per tier:
//   - `detected*`  : set by the heuristic during a connection test
//   - `manual*`    : user override — 'auto' defers to detection, 'on' forces unlock
type ManualOverride = 'auto' | 'on'

interface ResolutionState {
  detected2k: boolean
  detected4k: boolean
  manual2k: ManualOverride
  manual4k: ManualOverride
}

function loadInitial(): ResolutionState {
  const fallback: ResolutionState = {
    detected2k: false,
    detected4k: false,
    manual2k: 'auto',
    manual4k: 'auto',
  }
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return fallback
    return {
      detected2k: Boolean(parsed.detected2k),
      detected4k: Boolean(parsed.detected4k),
      manual2k: parsed.manual2k === 'on' ? 'on' : 'auto',
      manual4k: parsed.manual4k === 'on' ? 'on' : 'auto',
    }
  } catch {
    return fallback
  }
}

const state = reactive<ResolutionState>(loadInitial())

function persist() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        detected2k: state.detected2k,
        detected4k: state.detected4k,
        manual2k: state.manual2k,
        manual4k: state.manual4k,
      }),
    )
  } catch {}
}

// 4K unlock implies 2K is also available.
const unlocked4k = computed(() => state.detected4k || state.manual4k === 'on')
const unlocked2k = computed(
  () => unlocked4k.value || state.detected2k || state.manual2k === 'on',
)

function isTierUnlocked(tier: ResolutionTier): boolean {
  if (tier === '1k') return true
  if (tier === '2k') return unlocked2k.value
  return unlocked4k.value
}

export function useResolutionSupport() {
  return {
    state,
    unlocked2k,
    unlocked4k,
    isTierUnlocked,
    /** Record heuristic results from a connection test. */
    setDetected(detection: { supports2k: boolean; supports4k: boolean }) {
      state.detected2k = detection.supports2k
      state.detected4k = detection.supports4k
      persist()
    },
    setManual2k(value: ManualOverride) {
      state.manual2k = value
      persist()
    },
    setManual4k(value: ManualOverride) {
      state.manual4k = value
      persist()
    },
  }
}

export type ResolutionSupportStore = ReturnType<typeof useResolutionSupport>
