import type { GenerationHistoryItem } from './types'

const historyKey = 'promptcanvas:generation-history'
const draftKey = 'promptcanvas:draft-v1'
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
  } catch {
    // 存储不可用（隐私模式 / 容量超限）时静默忽略
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(draftKey)
  } catch {
    // 同上
  }
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
