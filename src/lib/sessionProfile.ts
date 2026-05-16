import type { GenerationHistoryItem } from '../types'
import {
  detectModelFamily,
  emptySessionProfile,
  type EnhanceIntent,
  type EnhanceMode,
  type SessionProfile,
  type SubjectKind,
} from './promptDoc'
import { detectSubjectType } from './imagesApi'
import { loadLearnedPreference, summarizeLearnedPreference } from './preferenceLearner'

const focalRegex = /(\d{2,3})\s*mm/gi

const colorTones: Array<{ regex: RegExp; label: string }> = [
  { regex: /(暖色|暖调|warm tones?)/i, label: '暖色调' },
  { regex: /(冷色|冷调|cool tones?)/i, label: '冷色调' },
  { regex: /(青橙|teal[- ]and[- ]amber)/i, label: '青橙双色调' },
  { regex: /(低饱和|desaturated|muted palette)/i, label: '低饱和' },
  { regex: /(莫兰迪|morandi)/i, label: '莫兰迪色' },
  { regex: /(黑白|monochrom|grayscale)/i, label: '黑白' },
]

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

function topNFromMap<T extends string>(counts: Map<T, number>, n: number): T[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map((entry) => entry[0])
}

function tokenize(text: string): string[] {
  if (!text) return []
  const cleaned = text
    .replace(/[，。.,!！?？;；:：、\n\r"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []
  return cleaned.split(' ').filter((token) => token.length >= 2 && token.length <= 12)
}

const stopwords = new Set<string>([
  'the', 'and', 'with', 'this', 'that', 'into', 'from', 'shot', 'image', 'photo',
  '一个', '一只', '一条', '一张', '一些', '画面', '图片', '拍摄', '生成', '请', '让', '使',
])

export function buildSessionProfile(history: GenerationHistoryItem[]): SessionProfile {
  if (!history.length) return emptySessionProfile()
  const profile = emptySessionProfile()
  const focalCounts = new Map<string, number>()
  const toneCounts = new Map<string, number>()
  const modeCounts = new Map<EnhanceMode, number>()
  const intentCounts = new Map<EnhanceIntent, number>()
  const subjectCounts = new Map<SubjectKind, number>()
  const tokenCounts = new Map<string, number>()

  history.slice(0, 12).forEach((item, index) => {
    const decay = Math.pow(0.85, index)
    const prompt = item.prompt || ''

    const focals = prompt.match(focalRegex)
    if (focals) {
      for (const focal of focals) {
        const norm = focal.replace(/\s+/g, '').toLowerCase()
        focalCounts.set(norm, (focalCounts.get(norm) ?? 0) + decay)
      }
    }

    for (const tone of colorTones) {
      if (tone.regex.test(prompt)) {
        toneCounts.set(tone.label, (toneCounts.get(tone.label) ?? 0) + decay)
      }
    }

    const mode = inferMode(item)
    modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + decay)

    const intent = inferIntent(item)
    intentCounts.set(intent, (intentCounts.get(intent) ?? 0) + decay)

    const subject = detectSubjectType(prompt) as SubjectKind
    subjectCounts.set(subject, (subjectCounts.get(subject) ?? 0) + decay)

    for (const token of tokenize(prompt)) {
      if (stopwords.has(token.toLowerCase())) continue
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + decay)
    }

    void detectModelFamily(item.model)
  })

  profile.preferredFocalLengths = topNFromMap(focalCounts, 3)
  profile.preferredColorTones = topNFromMap(toneCounts, 3)
  profile.preferredModes = topNFromMap(modeCounts, 2)
  profile.preferredIntents = topNFromMap(intentCounts, 2)
  profile.recentSubjects = topNFromMap(subjectCounts, 3)
  profile.topTokens = topNFromMap(tokenCounts, 12)
  profile.sampleSize = Math.min(history.length, 12)

  return profile
}

function mergeStrings(primary: string[], secondary: Array<{ value: string; count: number }>, max: number): string[] {
  const out = [...primary]
  for (const entry of secondary) {
    if (!out.includes(entry.value)) out.push(entry.value)
    if (out.length >= max) break
  }
  return out.slice(0, max)
}

function mergeTyped<T extends string>(
  primary: T[],
  secondary: Array<{ value: T; count: number }>,
  max: number,
): T[] {
  const out = [...primary]
  for (const entry of secondary) {
    if (!out.includes(entry.value)) out.push(entry.value)
    if (out.length >= max) break
  }
  return out.slice(0, max)
}

export function buildSessionProfileWithLongTerm(history: GenerationHistoryItem[]): SessionProfile {
  const profile = buildSessionProfile(history)
  const learned = summarizeLearnedPreference(loadLearnedPreference())
  if (!learned.totalSamples) return profile

  return {
    ...profile,
    preferredFocalLengths: mergeStrings(profile.preferredFocalLengths, learned.topFocals, 4),
    preferredColorTones: mergeStrings(profile.preferredColorTones, learned.topTones, 4),
    preferredModes: mergeTyped<EnhanceMode>(profile.preferredModes, learned.topModes, 3),
    preferredIntents: mergeTyped<EnhanceIntent>(profile.preferredIntents, learned.topIntents, 3),
    recentSubjects: mergeTyped<SubjectKind>(profile.recentSubjects, learned.topSubjects, 4),
    topTokens: mergeStrings(profile.topTokens, learned.topTokens, 16),
    sampleSize: profile.sampleSize + learned.totalSamples,
  }
}
