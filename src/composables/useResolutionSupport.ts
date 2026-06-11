import { computed, reactive } from 'vue'
import type { ResolutionTier } from '../types'
import type { AggregatedCapability } from '../lib/modelCapabilities'

const STORAGE_KEY = 'promptcanvas:capability-support-v2'
const LEGACY_KEY = 'promptcanvas:resolution-support-v1'

// Tri-state per capability:
//   - `detected*`  : set by the heuristic / capability table during a connection test
//   - `manual*`    : user override — 'auto' defers to detection, 'on' forces unlock
//   - learned (success/blocked): set by real generation outcomes, highest authority
type ManualOverride = 'auto' | 'on'

type OutputFormat = 'png' | 'jpeg' | 'webp'

interface CapabilityState {
  // resolution — detected from capability table, learned from real generations
  detected2k: boolean
  detected4k: boolean
  manual2k: ManualOverride
  manual4k: ManualOverride
  // a tier the upstream actually accepted (real generation 200) — sticky unlock
  learned2k: boolean
  learned4k: boolean
  // a tier the upstream rejected as unsupported size — sticky lock, overrides detect/manual
  blocked2k: boolean
  blocked4k: boolean
  // other capability dimensions (detection only; informational + light gating)
  supportsEdits: boolean
  supportsMask: boolean
  supportsQuality: boolean
  outputFormats: OutputFormat[]
  knownModelCount: number
}

/**
 * Capability is scoped per provider baseUrl. Switching url/key must NOT inherit
 * the previous relay's unlocked tiers — that was a real bug in v1 where the
 * module-level state stuck across providers.
 */
interface PersistShape {
  // keyed by normalized baseUrl
  byProvider: Record<string, CapabilityState>
}

function emptyState(): CapabilityState {
  return {
    detected2k: false,
    detected4k: false,
    manual2k: 'auto',
    manual4k: 'auto',
    learned2k: false,
    learned4k: false,
    blocked2k: false,
    blocked4k: false,
    supportsEdits: false,
    supportsMask: false,
    supportsQuality: false,
    outputFormats: ['png'],
    knownModelCount: 0,
  }
}

function normalizeProviderKey(baseUrl: string | undefined | null): string {
  return (baseUrl ?? '').trim().replace(/\/+$/, '').toLowerCase()
}

function coerceState(raw: unknown): CapabilityState {
  const base = emptyState()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>
  return {
    detected2k: Boolean(r.detected2k),
    detected4k: Boolean(r.detected4k),
    manual2k: r.manual2k === 'on' ? 'on' : 'auto',
    manual4k: r.manual4k === 'on' ? 'on' : 'auto',
    learned2k: Boolean(r.learned2k),
    learned4k: Boolean(r.learned4k),
    blocked2k: Boolean(r.blocked2k),
    blocked4k: Boolean(r.blocked4k),
    supportsEdits: Boolean(r.supportsEdits),
    supportsMask: Boolean(r.supportsMask),
    supportsQuality: Boolean(r.supportsQuality),
    outputFormats: Array.isArray(r.outputFormats)
      ? (r.outputFormats.filter((f): f is OutputFormat => f === 'png' || f === 'jpeg' || f === 'webp'))
      : ['png'],
    knownModelCount: typeof r.knownModelCount === 'number' ? r.knownModelCount : 0,
  }
}

function loadPersist(): PersistShape {
  if (typeof localStorage === 'undefined') return { byProvider: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && parsed.byProvider && typeof parsed.byProvider === 'object') {
        const byProvider: Record<string, CapabilityState> = {}
        for (const [key, value] of Object.entries(parsed.byProvider as Record<string, unknown>)) {
          byProvider[key] = coerceState(value)
        }
        return { byProvider }
      }
    }
    // one-time migration from the old global v1 shape into a wildcard bucket
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const parsed = JSON.parse(legacy)
      const migrated = coerceState(parsed)
      return { byProvider: { '*': migrated } }
    }
  } catch {}
  return { byProvider: {} }
}

const persisted: PersistShape = loadPersist()

// The reactive state always points at the *current provider's* bucket.
const state = reactive<CapabilityState>(emptyState())
let activeProviderKey = ''

function persist() {
  if (typeof localStorage === 'undefined') return
  try {
    if (activeProviderKey) {
      persisted.byProvider[activeProviderKey] = { ...state }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  } catch {}
}

function applyStateInto(target: CapabilityState, source: CapabilityState) {
  target.detected2k = source.detected2k
  target.detected4k = source.detected4k
  target.manual2k = source.manual2k
  target.manual4k = source.manual4k
  target.learned2k = source.learned2k
  target.learned4k = source.learned4k
  target.blocked2k = source.blocked2k
  target.blocked4k = source.blocked4k
  target.supportsEdits = source.supportsEdits
  target.supportsMask = source.supportsMask
  target.supportsQuality = source.supportsQuality
  target.outputFormats = [...source.outputFormats]
  target.knownModelCount = source.knownModelCount
}

/**
 * Point the reactive state at a given provider's bucket. Called whenever the
 * configured baseUrl changes (and once on init). Falls back to the migrated
 * wildcard bucket so existing users don't lose their unlock on first load.
 */
function selectProvider(baseUrl: string | undefined | null) {
  const key = normalizeProviderKey(baseUrl)
  if (key === activeProviderKey) return
  activeProviderKey = key
  const existing =
    persisted.byProvider[key] ??
    (persisted.byProvider['*'] ? { ...persisted.byProvider['*'] } : emptyState())
  applyStateInto(state, existing)
  // ensure a bucket exists for this provider going forward
  persisted.byProvider[key] = { ...state }
}

// 4K unlock implies 2K. Learned success and manual override both unlock;
// a learned block hard-locks the tier regardless of detection/manual.
const unlocked4k = computed(
  () => !state.blocked4k && (state.learned4k || state.detected4k || state.manual4k === 'on'),
)
const unlocked2k = computed(
  () =>
    unlocked4k.value ||
    (!state.blocked2k && (state.learned2k || state.detected2k || state.manual2k === 'on')),
)

function isTierUnlocked(tier: ResolutionTier): boolean {
  if (tier === '1k') return true
  if (tier === '2k') return unlocked2k.value
  return unlocked4k.value
}

function tierForSize(size: string): ResolutionTier {
  if (/^(4096|6144)/.test(size)) return '4k'
  if (/^(2048|3072)/.test(size)) return '2k'
  return '1k'
}

export function useResolutionSupport() {
  return {
    state,
    unlocked2k,
    unlocked4k,
    isTierUnlocked,

    /** Switch the active provider bucket (call when baseUrl changes). */
    selectProvider,

    /** Record capability-table + heuristic results from a connection test. */
    setDetected(detection: { supports2k: boolean; supports4k: boolean }) {
      state.detected2k = detection.supports2k
      state.detected4k = detection.supports4k
      persist()
    },

    /** Record the full capability aggregate from a connection test. */
    setCapabilities(aggregate: AggregatedCapability) {
      state.detected2k = aggregate.supports2k
      state.detected4k = aggregate.supports4k
      state.supportsEdits = aggregate.supportsEdits
      state.supportsMask = aggregate.supportsMask
      state.supportsQuality = aggregate.supportsQuality
      state.outputFormats = aggregate.outputFormats.length ? [...aggregate.outputFormats] : ['png']
      state.knownModelCount = aggregate.knownModelCount
      persist()
    },

    setManual2k(value: ManualOverride) {
      state.manual2k = value
      // an explicit manual unlock clears a stale learned block on that tier
      if (value === 'on') state.blocked2k = false
      persist()
    },
    setManual4k(value: ManualOverride) {
      state.manual4k = value
      if (value === 'on') state.blocked4k = false
      persist()
    },

    /**
     * Learn from a real generation that SUCCEEDED at a given size.
     * The tier the upstream actually rendered is permanently unlocked, and any
     * stale "blocked" flag for that tier is cleared. This is the highest-trust
     * signal — it beats both the capability table and keyword guessing.
     */
    learnSuccessfulSize(size: string) {
      const tier = tierForSize(size)
      if (tier === '4k') {
        state.learned4k = true
        state.blocked4k = false
        state.learned2k = true
        state.blocked2k = false
      } else if (tier === '2k') {
        state.learned2k = true
        state.blocked2k = false
      }
      persist()
    },

    /**
     * Learn from a real generation REJECTED by the upstream as an unsupported
     * size (e.g. 400 invalid_size on a 4096 request). Locks that tier so the UI
     * stops offering it. Returns true if a lock was newly applied.
     */
    learnBlockedSize(size: string): boolean {
      const tier = tierForSize(size)
      let changed = false
      if (tier === '4k' && !state.blocked4k) {
        state.blocked4k = true
        state.learned4k = false
        // 2K may still be fine; don't touch it
        changed = true
      } else if (tier === '2k' && !state.blocked2k) {
        state.blocked2k = true
        state.learned2k = false
        changed = true
      }
      if (changed) persist()
      return changed
    },
  }
}

export type ResolutionSupportStore = ReturnType<typeof useResolutionSupport>
