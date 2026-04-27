import { computed, reactive, watch } from 'vue'
import {
  loadEnhanceConfig,
  rawEnhanceKeyIsEncrypted,
  saveEnhanceConfig,
} from '../storage'
import type { EnhanceConfig } from '../types'

const DEFAULT_MODEL = 'gpt-4o-mini'

const state = reactive<EnhanceConfig>({
  enabled: true,
  baseUrl: '',
  apiKey: '',
  model: DEFAULT_MODEL,
})

const ready = { value: false } as { value: boolean }
let saveTimer: number | undefined

async function hydrate() {
  if (typeof window === 'undefined') return
  try {
    const loaded = await loadEnhanceConfig()
    state.enabled = loaded.enabled
    state.baseUrl = loaded.baseUrl
    state.apiKey = loaded.apiKey
    state.model = loaded.model || DEFAULT_MODEL

    if (loaded.apiKey && !rawEnhanceKeyIsEncrypted()) {
      await saveEnhanceConfig(loaded)
    }
  } catch {
    // ignore
  } finally {
    ready.value = true
  }
}

void hydrate()

watch(
  () => ({
    enabled: state.enabled,
    baseUrl: state.baseUrl,
    apiKey: state.apiKey,
    model: state.model,
  }),
  (next) => {
    if (typeof window === 'undefined') return
    if (!ready.value) return
    if (saveTimer) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      void saveEnhanceConfig(next)
    }, 300)
  },
  { deep: true },
)

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export interface ResolvedEnhanceProvider {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
}

export function snapshotEnhanceConfig(fallback?: { baseUrl: string; apiKey: string }): ResolvedEnhanceProvider {
  const enabled = Boolean(state.enabled)
  const ownBaseUrl = normalizeBaseUrl(state.baseUrl ?? '')
  const ownApiKey = (state.apiKey ?? '').trim()
  const model = (state.model ?? '').trim() || DEFAULT_MODEL

  const fallbackBaseUrl = normalizeBaseUrl(fallback?.baseUrl ?? '')
  const fallbackApiKey = (fallback?.apiKey ?? '').trim()

  return {
    enabled,
    baseUrl: ownBaseUrl || fallbackBaseUrl,
    apiKey: ownApiKey || fallbackApiKey,
    model,
  }
}

export function useEnhanceConfig() {
  const isReady = computed(() => Boolean(state.baseUrl && state.apiKey && state.model))
  const isUsingFallback = computed(() => !state.baseUrl && !state.apiKey)

  return {
    state,
    isReady,
    isUsingFallback,
    update(next: Partial<EnhanceConfig>) {
      if (typeof next.enabled === 'boolean') state.enabled = next.enabled
      if (typeof next.baseUrl === 'string') state.baseUrl = next.baseUrl
      if (typeof next.apiKey === 'string') state.apiKey = next.apiKey
      if (typeof next.model === 'string') state.model = next.model
    },
    snapshot: snapshotEnhanceConfig,
    reset() {
      state.enabled = true
      state.baseUrl = ''
      state.apiKey = ''
      state.model = DEFAULT_MODEL
    },
    applyChatanywherePreset() {
      state.baseUrl = 'https://api.chatanywhere.tech/v1'
      state.model = 'gpt-4o-mini'
    },
    DEFAULT_MODEL,
  }
}

export type EnhanceConfigStore = ReturnType<typeof useEnhanceConfig>
