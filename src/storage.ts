import { decryptString, encryptString, isEncrypted } from './lib/crypto'
import type { GenerationHistoryItem, ProviderConfig } from './types'

const historyKey = 'promptcanvas:generation-history'
const draftKey = 'promptcanvas:draft-v1'
const providerKey = 'promptcanvas:provider-v1'
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
