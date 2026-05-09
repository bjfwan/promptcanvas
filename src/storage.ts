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

function normalizeHistoryItem(item: GenerationHistoryItem): GenerationHistoryItem {
  const images = item.images
    ?.filter((image) => image.url || image.b64Json)
    .map((image) => ({
      id: image.id,
      url: image.url || null,
      b64Json: image.b64Json || null,
      mimeType: image.mimeType || null,
      revisedPrompt: image.revisedPrompt || null,
    }))

  return {
    ...item,
    images: images?.length ? images : undefined,
  }
}

function withoutImages(item: GenerationHistoryItem): GenerationHistoryItem {
  const { images, ...rest } = item
  void images
  return rest
}

function trimImages(item: GenerationHistoryItem, count: number): GenerationHistoryItem {
  if (!item.images?.length) return item
  return {
    ...item,
    images: item.images.slice(0, count),
  }
}

function persistHistory(items: GenerationHistoryItem[]): GenerationHistoryItem[] {
  const normalized = items.slice(0, maxHistoryItems).map(normalizeHistoryItem)
  const attempts = [
    normalized,
    normalized.map((item, index) => (index < 2 ? trimImages(item, 2) : withoutImages(item))),
    normalized.map((item, index) => (index === 0 ? trimImages(item, 1) : withoutImages(item))),
    normalized.map(withoutImages),
    normalized.slice(0, 1).map(withoutImages),
  ]

  for (const candidate of attempts) {
    try {
      localStorage.setItem(historyKey, JSON.stringify(candidate))
      return candidate
    } catch {}
  }

  return normalized
}

export function saveHistory(items: GenerationHistoryItem[]) {
  persistHistory(items)
}

export function prependHistory(item: GenerationHistoryItem) {
  return persistHistory([item, ...loadHistory()])
}

export function clearHistory() {
  try {
    localStorage.removeItem(historyKey)
  } catch {}
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
