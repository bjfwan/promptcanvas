import { decryptString, encryptString, isEncrypted } from './lib/crypto'
import type { EnhanceConfig, GenerationHistoryItem, ProviderConfig } from './types'

const historyKey = 'promptcanvas:generation-history'
const draftKey = 'promptcanvas:draft-v1'
const providerKey = 'promptcanvas:provider-v1'
const enhanceKey = 'promptcanvas:enhance-v1'
const maxHistoryItems = 8

export interface DraftPayload {
  prompt?: string
  negativePrompt?: string
  style?: string
  size?: string
  count?: number
  outputFormat?: string
  quality?: string
  creativity?: number
  seed?: string
  modelChoice?: string
  customModel?: string
}

export function loadDraft(): DraftPayload | null {
  try {
    const raw = localStorage.getItem(draftKey)

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw)

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as DraftPayload
    }

    return null
  } catch {
    return null
  }
}

export function saveDraft(draft: DraftPayload) {
  try {
    localStorage.setItem(draftKey, JSON.stringify(draft))
  } catch {}
}

export function clearDraft() {
  try {
    localStorage.removeItem(draftKey)
  } catch {}
}

export function loadHistory(): GenerationHistoryItem[] {
  try {
    const raw = localStorage.getItem(historyKey)

    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.slice(0, maxHistoryItems)
  } catch {
    return []
  }
}

export function saveHistory(items: GenerationHistoryItem[]) {
  localStorage.setItem(historyKey, JSON.stringify(items.slice(0, maxHistoryItems)))
}

export function prependHistory(item: GenerationHistoryItem) {
  const nextItems = [item, ...loadHistory()].slice(0, maxHistoryItems)
  saveHistory(nextItems)
  return nextItems
}

export function clearHistory() {
  localStorage.removeItem(historyKey)
}

const emptyProvider: ProviderConfig = { baseUrl: '', apiKey: '', proxyUrl: '' }

interface StoredProviderEntry {
  baseUrl?: unknown
  apiKey?: unknown
  proxyUrl?: unknown
}

function readRawEntry(): StoredProviderEntry | null {
  try {
    const raw = localStorage.getItem(providerKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as StoredProviderEntry
  } catch {
    return null
  }
}

export async function loadProviderConfig(): Promise<ProviderConfig> {
  const entry = readRawEntry()
  if (!entry) return { ...emptyProvider }

  const baseUrl = typeof entry.baseUrl === 'string' ? entry.baseUrl : ''
  const apiKeyField = typeof entry.apiKey === 'string' ? entry.apiKey : ''
  const proxyUrl = typeof entry.proxyUrl === 'string' ? entry.proxyUrl : ''

  if (!apiKeyField) {
    return { baseUrl, apiKey: '', proxyUrl }
  }

  try {
    const apiKey = await decryptString(apiKeyField)
    return { baseUrl, apiKey, proxyUrl }
  } catch {
    return { baseUrl, apiKey: '', proxyUrl }
  }
}

export async function saveProviderConfig(config: ProviderConfig) {
  try {
    const baseUrl = config.baseUrl ?? ''
    const plaintextKey = (config.apiKey ?? '').trim()
    const apiKey = plaintextKey ? await encryptString(plaintextKey) : ''
    const proxyUrl = (config.proxyUrl ?? '').trim()
    localStorage.setItem(providerKey, JSON.stringify({ baseUrl, apiKey, proxyUrl }))
  } catch {}
}

export function clearProviderConfig() {
  try {
    localStorage.removeItem(providerKey)
  } catch {}
}

export function isProviderConfigured(config: ProviderConfig): boolean {
  return Boolean(config.baseUrl?.trim()) && Boolean(config.apiKey?.trim())
}

export function rawApiKeyIsEncrypted(): boolean {
  const entry = readRawEntry()
  if (!entry) return true
  const apiKeyField = typeof entry.apiKey === 'string' ? entry.apiKey : ''
  if (!apiKeyField) return true
  return isEncrypted(apiKeyField)
}

const emptyEnhance: EnhanceConfig = {
  enabled: true,
  baseUrl: '',
  apiKey: '',
  model: 'gpt-4o-mini',
}

interface StoredEnhanceEntry {
  enabled?: unknown
  baseUrl?: unknown
  apiKey?: unknown
  model?: unknown
}

function readRawEnhanceEntry(): StoredEnhanceEntry | null {
  try {
    const raw = localStorage.getItem(enhanceKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as StoredEnhanceEntry
  } catch {
    return null
  }
}

export async function loadEnhanceConfig(): Promise<EnhanceConfig> {
  const entry = readRawEnhanceEntry()
  if (!entry) return { ...emptyEnhance }

  const enabled = typeof entry.enabled === 'boolean' ? entry.enabled : emptyEnhance.enabled
  const baseUrl = typeof entry.baseUrl === 'string' ? entry.baseUrl : ''
  const apiKeyField = typeof entry.apiKey === 'string' ? entry.apiKey : ''
  const model = typeof entry.model === 'string' && entry.model.trim()
    ? entry.model.trim()
    : emptyEnhance.model

  if (!apiKeyField) {
    return { enabled, baseUrl, apiKey: '', model }
  }

  try {
    const apiKey = await decryptString(apiKeyField)
    return { enabled, baseUrl, apiKey, model }
  } catch {
    return { enabled, baseUrl, apiKey: '', model }
  }
}

export async function saveEnhanceConfig(config: EnhanceConfig) {
  try {
    const enabled = Boolean(config.enabled)
    const baseUrl = (config.baseUrl ?? '').trim()
    const plaintextKey = (config.apiKey ?? '').trim()
    const apiKey = plaintextKey ? await encryptString(plaintextKey) : ''
    const model = (config.model ?? '').trim() || emptyEnhance.model
    localStorage.setItem(enhanceKey, JSON.stringify({ enabled, baseUrl, apiKey, model }))
  } catch {}
}

export function clearEnhanceConfig() {
  try {
    localStorage.removeItem(enhanceKey)
  } catch {}
}

export function rawEnhanceKeyIsEncrypted(): boolean {
  const entry = readRawEnhanceEntry()
  if (!entry) return true
  const apiKeyField = typeof entry.apiKey === 'string' ? entry.apiKey : ''
  if (!apiKeyField) return true
  return isEncrypted(apiKeyField)
}
