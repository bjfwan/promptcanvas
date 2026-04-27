import { computed, reactive, watch } from 'vue'
import {
  isProviderConfigured as checkConfigured,
  loadProviderConfig,
  rawApiKeyIsEncrypted,
  saveProviderConfig,
} from '../storage'
import type { ProviderConfig } from '../types'

const state = reactive<ProviderConfig>({ baseUrl: '', apiKey: '', proxyUrl: '' })

const ready = { value: false } as { value: boolean }
let saveTimer: number | undefined

async function hydrate() {
  if (typeof window === 'undefined') return
  try {
    const loaded = await loadProviderConfig()
    state.baseUrl = loaded.baseUrl
    state.apiKey = loaded.apiKey
    state.proxyUrl = loaded.proxyUrl ?? ''

    if (loaded.apiKey && !rawApiKeyIsEncrypted()) {
      await saveProviderConfig(loaded)
    }
  } catch {
    // ignore
  } finally {
    ready.value = true
  }
}

void hydrate()

watch(
  () => ({ baseUrl: state.baseUrl, apiKey: state.apiKey, proxyUrl: state.proxyUrl }),
  (next) => {
    if (typeof window === 'undefined') return
    if (!ready.value) return
    if (saveTimer) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      void saveProviderConfig(next)
    }, 300)
  },
  { deep: true },
)

const configured = computed(() => checkConfigured(state))

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function snapshotProviderConfig(): ProviderConfig {
  return {
    baseUrl: normalizeBaseUrl(state.baseUrl ?? ''),
    apiKey: (state.apiKey ?? '').trim(),
    proxyUrl: normalizeBaseUrl(state.proxyUrl ?? ''),
  }
}

export function useProviderConfig() {
  return {
    state,
    isConfigured: configured,
    update(next: Partial<ProviderConfig>) {
      if (typeof next.baseUrl === 'string') state.baseUrl = next.baseUrl
      if (typeof next.apiKey === 'string') state.apiKey = next.apiKey
      if (typeof next.proxyUrl === 'string') state.proxyUrl = next.proxyUrl
    },
    snapshot: snapshotProviderConfig,
    reset() {
      state.baseUrl = ''
      state.apiKey = ''
      state.proxyUrl = ''
    },
  }
}

export type ProviderConfigStore = ReturnType<typeof useProviderConfig>
