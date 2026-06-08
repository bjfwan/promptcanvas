/**
 * Generation ETA / progress estimator.
 *
 * Two parts:
 *   - `estimateTargetSeconds` returns a per-request expected duration in
 *     seconds. It blends a prior (size / quality / count rules of thumb)
 *     with the median of similar recent successful generations from the
 *     user's history, so the estimate gets calibrated to the actual
 *     provider speed within a few uses.
 *   - `computeProgress` maps elapsed seconds to a 0–98 percent value using
 *     a logistic curve. Past the expected target, it eases towards 96–98
 *     instead of locking — the bar never stalls completely.
 *   - `formatRemainingLabel` turns elapsed/target into a humanised hint
 *     across several contextual buckets (over-budget, almost done, etc).
 */

import type { GenerationHistoryItem, ImageQuality, ImageSize } from '../types'

export interface EtaInput {
  size?: ImageSize
  quality?: ImageQuality
  count?: number
  model?: string
}

const MIN_SAMPLES_FOR_LEARNED_TARGET = 2
const MAX_SAMPLE_AGE_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

const SIZE_OVERHEAD: Record<string, number> = {
  '1024x1024': 0,
  '1024x1536': 3,
  '1536x1024': 3,
  '2048x2048': 8,
  '2048x3072': 12,
  '3072x2048': 12,
  '4096x4096': 22,
  '4096x6144': 30,
  '6144x4096': 30,
}

const QUALITY_OVERHEAD: Record<string, number> = {
  low: -1,
  auto: 0,
  medium: 1,
  high: 4,
}

function priorTargetSeconds(input: EtaInput): number {
  let seconds = 11
  seconds += SIZE_OVERHEAD[input.size ?? '1024x1024'] ?? 0
  seconds += QUALITY_OVERHEAD[input.quality ?? 'auto'] ?? 0
  seconds += Math.max(0, (input.count ?? 1) - 1) * 4
  return Math.max(6, seconds)
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function similarityScore(a: EtaInput, b: GenerationHistoryItem): number {
  let score = 0
  if (b.model && a.model && b.model === a.model) score += 5
  // Same model family (matching prefix before first slash or dash) is still
  // useful — e.g. `gpt-image-1` vs `gpt-image-1-preview` share runtime.
  if (b.model && a.model && b.model !== a.model) {
    const aFamily = a.model.split(/[\s\-/]/)[0]
    const bFamily = b.model.split(/[\s\-/]/)[0]
    if (aFamily && bFamily && aFamily === bFamily) score += 3
  }
  if (b.size === a.size) score += 2
  if (b.quality === a.quality) score += 2
  if (b.count === a.count) score += 1
  return score
}

/**
 * Pick up to `limit` history items that resemble the upcoming request, and
 * return their elapsedSeconds. Older entries decay so a model swap from a
 * month ago doesn't bias today's estimate.
 */
function gatherSimilarSamples(input: EtaInput, history: GenerationHistoryItem[], limit = 6): number[] {
  const now = Date.now()
  const candidates = history
    .filter((item) => typeof item.elapsedSeconds === 'number' && item.elapsedSeconds! > 0)
    .map((item) => {
      const age = now - new Date(item.createdAt).getTime()
      const recencyOk = age <= MAX_SAMPLE_AGE_MS
      return {
        item,
        score: similarityScore(input, item),
        ageMs: age,
        recencyOk,
      }
    })
    .filter((entry) => entry.recencyOk && entry.score > 0)
    .sort((a, b) => b.score - a.score || a.ageMs - b.ageMs)
    .slice(0, limit)

  return candidates.map((entry) => entry.item.elapsedSeconds!)
}

export interface EtaEstimate {
  targetSeconds: number
  source: 'prior' | 'learned' | 'blended'
  sampleSize: number
}

export function estimateTargetSeconds(input: EtaInput, history: GenerationHistoryItem[] = []): EtaEstimate {
  const prior = priorTargetSeconds(input)
  const samples = gatherSimilarSamples(input, history)

  if (samples.length === 0) {
    return { targetSeconds: prior, source: 'prior', sampleSize: 0 }
  }

  const learned = median(samples)
  if (samples.length < MIN_SAMPLES_FOR_LEARNED_TARGET) {
    // Trust learned a little, but anchor in the prior to avoid wild swings
    // from a single outlier (e.g. a freezing 60s call after a 10s one).
    const blended = Math.round(prior * 0.55 + learned * 0.45)
    return { targetSeconds: Math.max(5, blended), source: 'blended', sampleSize: samples.length }
  }

  // Add a small safety margin so the bar doesn't always overshoot 100%.
  const padded = Math.max(5, Math.round(learned * 1.05))
  return { targetSeconds: padded, source: 'learned', sampleSize: samples.length }
}

/**
 * Map elapsed seconds onto a smooth 4–98 progress curve. The curve is
 * a logistic centred on the target, so it accelerates around mid-progress
 * and asymptotes toward 96 when on schedule. Past the target the bar keeps
 * inching up (96 → 98) rather than freezing.
 */
export function computeProgress(elapsedSeconds: number, targetSeconds: number): number {
  if (targetSeconds <= 0) return 0
  const elapsed = Math.max(0, elapsedSeconds)

  // Logistic: f(t) = L / (1 + e^(-k*(t - midpoint))). We tune k so that
  // f(0) ≈ 4 and f(target) ≈ 92.
  const midpoint = targetSeconds * 0.55
  const k = 4.6 / targetSeconds
  const baseline = 100 / (1 + Math.exp(k * midpoint))
  const value = 100 / (1 + Math.exp(-k * (elapsed - midpoint)))
  // Re-scale so progress starts near 4 instead of `baseline`.
  let scaled = ((value - baseline) / (100 - baseline)) * 96 + 4

  if (elapsed > targetSeconds) {
    // Asymptote from 92 → 98 over the next 1.5 × target seconds.
    const overflow = elapsed - targetSeconds
    const tail = (1 - Math.exp(-overflow / (targetSeconds * 0.75))) * 6
    scaled = Math.max(scaled, 92 + tail)
  }

  return Math.max(2, Math.min(98, Math.round(scaled)))
}

/** Discrete stage label derived from progress. */
export function stageLabelForProgress(progress: number): string {
  if (progress < 22) return '解析提示词'
  if (progress < 50) return '搭建构图'
  if (progress < 78) return '渲染细节'
  if (progress < 94) return '准备出图'
  return '等待返回'
}

export interface RemainingLabelOptions {
  /** When `learned`, we can show "比平时快/慢" copy. */
  source?: EtaEstimate['source']
}

/** Produce the human label rendered next to the progress ring. */
export function formatRemainingLabel(
  elapsedSeconds: number,
  targetSeconds: number,
  options: RemainingLabelOptions = {},
): string {
  const elapsed = Math.max(0, Math.round(elapsedSeconds))
  const target = Math.max(1, Math.round(targetSeconds))
  const remain = target - elapsed

  if (elapsed === 0) {
    return `预计 ${target}s`
  }

  if (remain >= 4) {
    return `约 ${remain}s`
  }

  if (remain >= 1) {
    return '即将出图'
  }

  if (remain === 0) {
    return '即将出图'
  }

  // Past the budget. Frame it constructively rather than alarmist.
  const overshoot = elapsed - target
  if (overshoot <= 4) {
    return options.source === 'learned' ? '比平时稍慢一点' : '稍超预估，马上回包'
  }
  if (overshoot <= target) {
    return '上游较忙，仍在生成'
  }
  return '上游响应缓慢，可随时取消'
}
