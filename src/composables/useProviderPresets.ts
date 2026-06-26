import { ref } from 'vue'
import { createId } from '../lib/id'
import {
  DEFAULT_PROXY_URL,
  loadProviderPresets,
  saveProviderPresets,
  type ProviderPreset,
} from '../storage'
import { useProviderConfig } from './useProviderConfig'

/**
 * 全局单例：管理多中转站预设。
 * - presets / activePresetId 在模块级声明，所有调用方共享同一份状态
 * - 写操作自动持久化（apiKey 走 storage.ts 的 AES-GCM 加密）
 * - 切换预设时调用 useProviderConfig().update，把当前 provider 切到目标预设
 */
const presets = ref<ProviderPreset[]>([])
const activePresetId = ref<string | null>(null)

const activePresetStorageKey = 'promptcanvas:provider-presets-active-v1'
let initialized = false

async function ensureInitialized() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  try {
    presets.value = await loadProviderPresets()
    const storedActive = window.localStorage.getItem(activePresetStorageKey)
    activePresetId.value =
      storedActive && presets.value.some((p) => p.id === storedActive) ? storedActive : null
  } catch {
    presets.value = []
  }
}

void ensureInitialized()

async function persist() {
  await saveProviderPresets(presets.value)
  try {
    if (activePresetId.value) {
      window.localStorage.setItem(activePresetStorageKey, activePresetId.value)
    } else {
      window.localStorage.removeItem(activePresetStorageKey)
    }
  } catch {}
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function addPreset(preset: Omit<ProviderPreset, 'id'> & { id?: string }): ProviderPreset {
  const item: ProviderPreset = {
    id: preset.id ?? createId(),
    label: preset.label?.trim() || undefined,
    baseUrl: normalizeBaseUrl(preset.baseUrl ?? ''),
    apiKey: (preset.apiKey ?? '').trim(),
    proxyUrl: normalizeBaseUrl(preset.proxyUrl ?? '') || DEFAULT_PROXY_URL,
  }
  presets.value = [...presets.value, item]
  void persist()
  return item
}

function removePreset(id: string) {
  presets.value = presets.value.filter((p) => p.id !== id)
  if (activePresetId.value === id) activePresetId.value = null
  void persist()
}

function updatePreset(id: string, patch: Partial<ProviderPreset>) {
  presets.value = presets.value.map((p) => {
    if (p.id !== id) return p
    const next: ProviderPreset = { ...p }
    if (typeof patch.label === 'string') {
      next.label = patch.label.trim() || undefined
    }
    if (typeof patch.baseUrl === 'string') {
      next.baseUrl = normalizeBaseUrl(patch.baseUrl)
    }
    if (typeof patch.apiKey === 'string') {
      next.apiKey = patch.apiKey.trim()
    }
    if (typeof patch.proxyUrl === 'string') {
      next.proxyUrl = normalizeBaseUrl(patch.proxyUrl) || DEFAULT_PROXY_URL
    }
    return next
  })
  void persist()
}

function switchToPreset(id: string) {
  const target = presets.value.find((p) => p.id === id)
  if (!target) return
  const provider = useProviderConfig()
  provider.update({
    baseUrl: target.baseUrl,
    apiKey: target.apiKey,
    proxyUrl: target.proxyUrl,
  })
  activePresetId.value = id
  void persist()
}

function importCurrentAsPreset(label?: string): ProviderPreset | null {
  const provider = useProviderConfig()
  const snapshot = provider.snapshot()
  const baseUrl = (snapshot.baseUrl ?? '').trim()
  const apiKey = (snapshot.apiKey ?? '').trim()
  if (!baseUrl || !apiKey) return null
  return addPreset({
    label,
    baseUrl,
    apiKey,
    proxyUrl: (snapshot.proxyUrl ?? '').trim() || DEFAULT_PROXY_URL,
  })
}

export function useProviderPresets() {
  return {
    presets,
    activePresetId,
    addPreset,
    removePreset,
    updatePreset,
    switchToPreset,
    importCurrentAsPreset,
  }
}
