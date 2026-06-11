import { computed, ref } from 'vue'
import { customModelSentinel, modelOptions as presetModelOptions } from '../presets'
import { aggregateCapabilities, type AggregatedCapability } from '../lib/modelCapabilities'

const STORAGE_KEY = 'promptcanvas:discovered-models-v1'
const MAX_MODELS = 200

const imageHints = [
  'image',
  'dall-e',
  'dalle',
  'flux',
  'midjourney',
  'mj-',
  'stable-diffusion',
  'stablediffusion',
  'sdxl',
  'sd-',
  'sd_',
  'sd3',
  'imagen',
  'ideogram',
  'playground',
  'kling',
  'recraft',
  'fooocus',
  'wuerstchen',
  'photon',
  'pony',
  'illustrious',
  'pixart',
  'cog-',
  'cogview',
  'janus',
  'qwen-image',
  'doubao-image',
  'volcengine-image',
  'glm-image',
  'wanx',
  'hidream',
  'hunyuan-image',
  'lumina',
  'kandinsky',
]

const textBlacklist = [
  'embedding',
  'text-embedding',
  'whisper',
  'tts',
  'audio',
  'moderation',
  'reranker',
  'rerank',
  'classifier',
]

function isLikelyImageModel(id: string): boolean {
  const lower = id.toLowerCase()
  if (textBlacklist.some((b) => lower.includes(b))) return false
  return imageHints.some((h) => lower.includes(h))
}

export interface ResolutionTierDetection {
  supports2k: boolean
  supports4k: boolean
}

/**
 * Scan discovered model ids for resolution capability.
 *
 * Now backed by the model capability table (see lib/modelCapabilities.ts):
 * known model families resolve to their real tier, unknown ids fall back to
 * name-keyword guessing. This fixes cases like `gpt-image-2-chat` where the
 * name has no "4k"/"4096" token but the family does support 4K on most relays.
 */
export function detectResolutionTiers(models: string[]): ResolutionTierDetection {
  const aggregate = aggregateCapabilities(models)
  return { supports2k: aggregate.supports2k, supports4k: aggregate.supports4k }
}

/** Full capability aggregate (resolution + edits/mask/formats/quality). */
export function detectCapabilities(models: string[]): AggregatedCapability {
  return aggregateCapabilities(models)
}

function loadInitial(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string').slice(0, MAX_MODELS)
  } catch {
    return []
  }
}

const discovered = ref<string[]>(loadInitial())

function persist(models: string[]) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(models))
  } catch {}
}

const discoveredImageOnly = computed(() => discovered.value.filter(isLikelyImageModel))

const mergedModelOptions = computed<Array<{ value: string; label: string; hint: string }>>(() => {
  const presetIds = new Set(presetModelOptions.map((option) => option.value))
  const sentinelIndex = presetModelOptions.findIndex((option) => option.value === customModelSentinel)
  const baseList = sentinelIndex >= 0 ? presetModelOptions.slice(0, sentinelIndex) : [...presetModelOptions]
  const tail = sentinelIndex >= 0 ? presetModelOptions.slice(sentinelIndex) : []

  const additions: Array<{ value: string; label: string; hint: string }> = []
  const seen = new Set<string>(presetIds)

  for (const id of discoveredImageOnly.value) {
    if (seen.has(id)) continue
    seen.add(id)
    additions.push({ value: id, label: id, hint: '中转站发现' })
  }

  return [...baseList, ...additions, ...tail]
})

export function useDiscoveredModels() {
  return {
    all: computed(() => discovered.value),
    imageOnly: discoveredImageOnly,
    mergedModelOptions,
    setModels(models: string[]) {
      const cleaned: string[] = []
      const seen = new Set<string>()
      for (const entry of models) {
        if (typeof entry !== 'string') continue
        const trimmed = entry.trim()
        if (!trimmed || seen.has(trimmed)) continue
        seen.add(trimmed)
        cleaned.push(trimmed)
        if (cleaned.length >= MAX_MODELS) break
      }
      discovered.value = cleaned
      persist(cleaned)
    },
    clear() {
      discovered.value = []
      persist([])
    },
  }
}
