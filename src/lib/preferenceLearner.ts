import type { GenerationHistoryItem } from '../types'
import { detectSubjectType } from './imagesApi'
import { detectModelFamily, type EnhanceIntent, type EnhanceMode, type SubjectKind } from './promptDoc'

const STORAGE_KEY = 'promptcanvas:long-term-prefs-v1'
const MAX_TRACKED = 600

export interface LearnedPreference {
  focalLengths: Record<string, number>
  colorTones: Record<string, number>
  modes: Record<EnhanceMode, number>
  intents: Record<EnhanceIntent, number>
  subjects: Record<SubjectKind, number>
  modelFamilies: Record<string, number>
  styleAnchors: Record<string, number>
  totalSamples: number
  firstSeenAt: number
  lastSeenAt: number
  recentTokens: Record<string, number>
}

function emptyPref(): LearnedPreference {
  return {
    focalLengths: {},
    colorTones: {},
    modes: {} as Record<EnhanceMode, number>,
    intents: {} as Record<EnhanceIntent, number>,
    subjects: {} as Record<SubjectKind, number>,
    modelFamilies: {},
    styleAnchors: {},
    totalSamples: 0,
    firstSeenAt: 0,
    lastSeenAt: 0,
    recentTokens: {},
  }
}

const focalRegex = /(\d{2,3})\s*mm/gi

const colorTones: Array<{ regex: RegExp; label: string }> = [
  { regex: /(暖色|暖调|warm tones?)/i, label: '暖色调' },
  { regex: /(冷色|冷调|cool tones?)/i, label: '冷色调' },
  { regex: /(青橙|teal[- ]and[- ]amber)/i, label: '青橙双色调' },
  { regex: /(低饱和|desaturated|muted palette)/i, label: '低饱和' },
  { regex: /(莫兰迪|morandi)/i, label: '莫兰迪色' },
  { regex: /(黑白|monochrom|grayscale)/i, label: '黑白' },
]

const styleAnchorPatterns: Array<{ regex: RegExp; label: string }> = [
  { regex: /cel-?shaded|赛璐璐/i, label: '赛璐璐' },
  { regex: /cinematic still|电影截图|film still/i, label: '电影截图' },
  { regex: /editorial|杂志/i, label: '杂志风' },
  { regex: /minimalist|极简/i, label: '极简' },
  { regex: /bauhaus|包豪斯/i, label: '包豪斯' },
  { regex: /art nouveau|新艺术/i, label: '新艺术' },
  { regex: /3d render|blender|渲染/i, label: '3D 渲染' },
  { regex: /watercolor|水彩/i, label: '水彩' },
  { regex: /oil painting|油画/i, label: '油画' },
  { regex: /vector|矢量|平面图形/i, label: '矢量' },
]

const stopwords = new Set<string>([
  'the', 'and', 'with', 'this', 'that', 'into', 'from', 'shot', 'image', 'photo',
  '一个', '一只', '一条', '一张', '一些', '画面', '图片', '拍摄', '生成', '请', '让', '使',
])

function tokenize(text: string): string[] {
  if (!text) return []
  const cleaned = text
    .replace(/[，。.,!！?？;；:：、\n\r"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []
  return cleaned.split(' ').filter((token) => token.length >= 2 && token.length <= 12)
}

export function loadLearnedPreference(): LearnedPreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyPref()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyPref()
    const base = emptyPref()
    return {
      ...base,
      ...(parsed as object),
      focalLengths: { ...base.focalLengths, ...((parsed as { focalLengths?: object }).focalLengths ?? {}) },
      colorTones: { ...base.colorTones, ...((parsed as { colorTones?: object }).colorTones ?? {}) },
      modes: { ...base.modes, ...((parsed as { modes?: object }).modes ?? {}) },
      intents: { ...base.intents, ...((parsed as { intents?: object }).intents ?? {}) },
      subjects: { ...base.subjects, ...((parsed as { subjects?: object }).subjects ?? {}) },
      modelFamilies: { ...base.modelFamilies, ...((parsed as { modelFamilies?: object }).modelFamilies ?? {}) },
      styleAnchors: { ...base.styleAnchors, ...((parsed as { styleAnchors?: object }).styleAnchors ?? {}) },
      recentTokens: { ...base.recentTokens, ...((parsed as { recentTokens?: object }).recentTokens ?? {}) },
    }
  } catch {
    return emptyPref()
  }
}

export function saveLearnedPreference(pref: LearnedPreference) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref))
  } catch {}
}

export function clearLearnedPreference() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

function bumpMap<T extends string>(map: Record<T, number>, key: T, delta = 1) {
  map[key] = (map[key] ?? 0) + delta
}

function trimSparseEntries<T extends string>(map: Record<T, number>, max = 80) {
  const keys = Object.keys(map) as T[]
  if (keys.length <= max) return
  const sorted = keys.sort((a, b) => map[a] - map[b])
  const drop = keys.length - max
  for (let i = 0; i < drop; i += 1) delete map[sorted[i]]
}

function inferIntent(item: GenerationHistoryItem): EnhanceIntent {
  if (item.referenceImageCount && item.referenceImageCount > 0) return 'edit'
  if (item.style === 'product') return 'product'
  if (item.style === 'poster') return 'poster'
  if (item.style === 'portrait') return 'portrait'
  if (item.style === 'logo') return 'logo'
  return 'create'
}

function inferMode(item: GenerationHistoryItem): EnhanceMode {
  if (item.style === 'product' || item.style === 'poster') return 'commercial'
  if (item.style === 'cinematic') return 'cinematic'
  if (item.style === 'logo' || item.style === 'raw') return 'faithful'
  if (item.style === 'anime') return 'experimental'
  return 'balanced'
}

export function recordGenerationToPreference(item: {
  prompt: string
  style: GenerationHistoryItem['style']
  size?: string
  referenceImageCount?: number
  model?: string
}): LearnedPreference {
  const pref = loadLearnedPreference()
  const now = Date.now()
  const prompt = item.prompt || ''

  const focals = prompt.match(focalRegex)
  if (focals) {
    for (const focal of focals) {
      const norm = focal.replace(/\s+/g, '').toLowerCase()
      bumpMap(pref.focalLengths, norm)
    }
  }

  for (const tone of colorTones) {
    if (tone.regex.test(prompt)) bumpMap(pref.colorTones, tone.label)
  }

  for (const anchor of styleAnchorPatterns) {
    if (anchor.regex.test(prompt)) bumpMap(pref.styleAnchors, anchor.label)
  }

  const intent = inferIntent({
    prompt,
    style: item.style,
    referenceImageCount: item.referenceImageCount,
  } as GenerationHistoryItem)
  bumpMap(pref.intents, intent)

  const mode = inferMode({
    prompt,
    style: item.style,
  } as GenerationHistoryItem)
  bumpMap(pref.modes, mode)

  const subject = detectSubjectType(prompt) as SubjectKind
  bumpMap(pref.subjects, subject)

  const family = detectModelFamily(item.model)
  bumpMap(pref.modelFamilies, family)

  for (const token of tokenize(prompt)) {
    if (stopwords.has(token.toLowerCase())) continue
    bumpMap(pref.recentTokens, token)
  }

  pref.totalSamples += 1
  if (!pref.firstSeenAt) pref.firstSeenAt = now
  pref.lastSeenAt = now

  trimSparseEntries(pref.focalLengths, 30)
  trimSparseEntries(pref.colorTones, 24)
  trimSparseEntries(pref.styleAnchors, 24)
  trimSparseEntries(pref.modelFamilies, 12)
  trimSparseEntries(pref.recentTokens, MAX_TRACKED)

  saveLearnedPreference(pref)
  return pref
}

export interface LearnedSummary {
  topFocals: Array<{ value: string; count: number }>
  topTones: Array<{ value: string; count: number }>
  topModes: Array<{ value: EnhanceMode; count: number }>
  topIntents: Array<{ value: EnhanceIntent; count: number }>
  topSubjects: Array<{ value: SubjectKind; count: number }>
  topStyleAnchors: Array<{ value: string; count: number }>
  topTokens: Array<{ value: string; count: number }>
  totalSamples: number
  firstSeenAt: number
  lastSeenAt: number
}

function topN<T extends string>(map: Record<T, number>, n: number): Array<{ value: T; count: number }> {
  return (Object.entries(map) as Array<[T, number]>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }))
}

export function summarizeLearnedPreference(pref: LearnedPreference): LearnedSummary {
  return {
    topFocals: topN(pref.focalLengths, 4),
    topTones: topN(pref.colorTones, 4),
    topModes: topN(pref.modes, 3),
    topIntents: topN(pref.intents, 3),
    topSubjects: topN(pref.subjects, 3),
    topStyleAnchors: topN(pref.styleAnchors, 4),
    topTokens: topN(pref.recentTokens, 12),
    totalSamples: pref.totalSamples,
    firstSeenAt: pref.firstSeenAt,
    lastSeenAt: pref.lastSeenAt,
  }
}
