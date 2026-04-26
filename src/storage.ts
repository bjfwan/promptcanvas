import type { GenerationHistoryItem } from './types'

const historyKey = 'promptcanvas:generation-history'
const maxHistoryItems = 8

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
