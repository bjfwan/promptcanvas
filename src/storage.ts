import { decryptString, encryptString, isEncrypted } from './lib/crypto'
import type { GeneratedImage, GenerationHistoryItem, ProviderConfig } from './types'

const historyKey = 'promptcanvas:generation-history'
const draftKey = 'promptcanvas:draft-v1'
const providerKey = 'promptcanvas:provider-v1'
const maxHistoryItems = 12
const imageDbName = 'promptcanvas-history-images'
const imageStoreName = 'images'

interface HistoryImageRecord {
  key: string
  source: string
  mimeType: string | null
  revisedPrompt: string | null
  createdAt: string
}

let imageDbPromise: Promise<IDBDatabase> | null = null

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

function canUseIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

function openImageDb(): Promise<IDBDatabase> {
  if (!canUseIndexedDb()) {
    return Promise.reject(new Error('IndexedDB unavailable'))
  }

  if (imageDbPromise) return imageDbPromise

  imageDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(imageDbName, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(imageStoreName)) {
        db.createObjectStore(imageStoreName, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'))
    request.onblocked = () => reject(new Error('IndexedDB blocked'))
  })

  return imageDbPromise
}

async function withImageStore<T>(
  mode: IDBTransactionMode,
  task: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openImageDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(imageStoreName, mode)
    const store = tx.objectStore(imageStoreName)
    const request = task(store)
    let result: T | undefined

    if (request) {
      request.onsuccess = () => {
        result = request.result
      }
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
    }

    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'))
  })
}

function dataUrlFromBase64(image: GeneratedImage) {
  if (!image.b64Json) return ''
  return `data:${image.mimeType || 'image/png'};base64,${image.b64Json}`
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error || new Error('Blob read failed'))
    reader.readAsDataURL(blob)
  })
}

async function resolvePersistableSource(image: GeneratedImage): Promise<string> {
  const inlineSource = dataUrlFromBase64(image)
  if (inlineSource) return inlineSource

  const source = image.url || ''
  if (!source) return ''
  if (source.startsWith('data:')) return source

  if (/^(blob|https?):/i.test(source)) {
    try {
      const response = await fetch(source, { cache: 'force-cache' })
      if (!response.ok) return ''
      return await blobToDataUrl(await response.blob())
    } catch {
      return ''
    }
  }

  return ''
}

function historyImageKey(item: GenerationHistoryItem, image: GeneratedImage, index: number) {
  return image.storageKey || `${item.id}:${image.id || index}`
}

function normalizeHistoryItem(item: GenerationHistoryItem): GenerationHistoryItem {
  const images = item.images
    ?.filter((image) => image.url || image.b64Json || image.storageKey)
    .map((image, index) => ({
      id: image.id,
      url: image.url && !/^(data|blob):/i.test(image.url) ? image.url : null,
      b64Json: null,
      mimeType: image.mimeType || null,
      revisedPrompt: image.revisedPrompt || null,
      storageKey: historyImageKey(item, image, index),
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
  const attempts = [normalized, normalized.map((item) => trimImages(item, 2)), normalized.map(withoutImages)]

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

async function writeHistoryImages(item: GenerationHistoryItem) {
  if (!item.images?.length) return

  await Promise.all(
    item.images.map(async (image, index) => {
      const source = await resolvePersistableSource(image)
      if (!source) return

      const record: HistoryImageRecord = {
        key: historyImageKey(item, image, index),
        source,
        mimeType: image.mimeType || null,
        revisedPrompt: image.revisedPrompt || null,
        createdAt: item.createdAt,
      }

      await withImageStore('readwrite', (store) => store.put(record))
    }),
  )
}

async function pruneHistoryImages(items: GenerationHistoryItem[]) {
  const keep = new Set(
    items.flatMap((item) =>
      (item.images ?? [])
        .map((image, index) => historyImageKey(item, image, index))
        .filter(Boolean),
    ),
  )

  try {
    const keys = await withImageStore<IDBValidKey[]>('readonly', (store) => store.getAllKeys())
    if (!keys?.length) return

    await Promise.all(
      keys
        .map((key) => String(key))
        .filter((key) => !keep.has(key))
        .map((key) => withImageStore('readwrite', (store) => store.delete(key))),
    )
  } catch {}
}

export async function hydrateHistoryImages(items: GenerationHistoryItem[]) {
  if (!items.length) return items

  const hydrated = await Promise.all(
    items.map(async (item) => {
      if (!item.images?.length) return item

      const images = await Promise.all(
        item.images.map(async (image, index) => {
          if (image.url || image.b64Json) return image

          const key = historyImageKey(item, image, index)

          try {
            const record = await withImageStore<HistoryImageRecord>('readonly', (store) => store.get(key))
            if (!record?.source) return image

            return {
              ...image,
              url: record.source,
              mimeType: image.mimeType || record.mimeType,
              revisedPrompt: image.revisedPrompt || record.revisedPrompt,
              storageKey: key,
            }
          } catch {
            return image
          }
        }),
      )

      const usableImages = images.filter((image) => image.url || image.b64Json)
      return { ...item, images: usableImages.length ? usableImages : undefined }
    }),
  )

  return hydrated
}

export async function prependHistory(item: GenerationHistoryItem) {
  const next = persistHistory([item, ...loadHistory()])
  await writeHistoryImages(item).catch(() => undefined)
  await pruneHistoryImages(next)
  return hydrateHistoryImages(next)
}

export function clearHistory() {
  try {
    localStorage.removeItem(historyKey)
    void withImageStore('readwrite', (store) => store.clear()).catch(() => undefined)
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
