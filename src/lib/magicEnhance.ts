import type { ImageQuality, ImageStyle } from '../types'
import type { IconName } from '../icons'
import { compose, scoreDoc, type ComposeResult } from './promptCompose'
import { lintPrompt } from './promptLint'
import { parsePrompt, requiredSlotsFor } from './promptParser'
import {
  SLOT_ORDER,
  type EnhanceIntent,
  type EnhanceLevel,
  type EnhanceMode,
  type LintIssue,
  type PromptContext,
  type PromptDoc,
  type SlotName,
} from './promptDoc'

export type EnhanceDimension =
  | 'lighting'
  | 'color'
  | 'composition'
  | 'material'
  | 'atmosphere'
  | 'lens'

export type { EnhanceLevel, EnhanceMode, EnhanceIntent }

type MetricState = 'strong' | 'weak' | 'missing'

export interface EnhanceDimensionMeta {
  id: EnhanceDimension
  label: string
  icon: IconName
}

export interface EnhanceModeMeta {
  id: EnhanceMode
  label: string
  hint: string
  icon: IconName
}

export interface EnhanceIntentMeta {
  id: EnhanceIntent
  label: string
  hint: string
  icon: IconName
}

export interface PromptMetric {
  id: string
  label: string
  score: number
  state: MetricState
  hint: string
}

export interface PromptAnalysis {
  doc: PromptDoc
  presentSlots: SlotName[]
  missingSlots: SlotName[]
  presentDimensions: Set<EnhanceDimension>
  missingDimensions: EnhanceDimension[]
  subjectType: string
  subjectLabel: string
  score: number
  language: 'zh' | 'en'
  metrics: PromptMetric[]
  strengths: string[]
  issues: string[]
  lintIssues: LintIssue[]
  recommendedLevel: EnhanceLevel
  recommendedMode: EnhanceMode
  recommendedIntent: EnhanceIntent
  estimatedTokens: number
}

export interface EnhanceResult {
  enhanced: string
  addedParts: string[]
  dimensions: EnhanceDimension[]
  dimensionLabels: string[]
  level: EnhanceLevel
  mode: EnhanceMode
  intent: EnhanceIntent
  original: string
  scoreBefore: number
  scoreAfter: number
  summary: string
  filledSlots: SlotName[]
  preserveList: string[]
  forbidList: string[]
  lintIssues: LintIssue[]
  renderMode: ComposeResult['renderMode']
}

export interface PromptVariant {
  id: string
  label: string
  hint: string
  result: EnhanceResult
}

export const enhanceDimensions: EnhanceDimensionMeta[] = [
  { id: 'lighting', label: '光影', icon: 'sun' },
  { id: 'color', label: '色调', icon: 'palette' },
  { id: 'composition', label: '构图', icon: 'frame' },
  { id: 'material', label: '材质', icon: 'layers' },
  { id: 'atmosphere', label: '氛围', icon: 'wind' },
  { id: 'lens', label: '镜头', icon: 'aperture' },
]

export const enhanceLevelMeta: Record<EnhanceLevel, { label: string; hint: string }> = {
  light: { label: '轻修', hint: '只补关键短板' },
  standard: { label: '精修', hint: '完整成片感' },
  heavy: { label: '重构', hint: '重做表达层次' },
}

export const enhanceModeMeta: Record<EnhanceMode, EnhanceModeMeta> = {
  balanced: { id: 'balanced', label: '均衡', hint: '保留原意，补齐画面', icon: 'sparkle' },
  faithful: { id: 'faithful', label: '精准', hint: '少发挥，强约束', icon: 'focus' },
  commercial: { id: 'commercial', label: '商业', hint: '干净、可交付', icon: 'star' },
  cinematic: { id: 'cinematic', label: '电影', hint: '镜头感与叙事', icon: 'camera' },
  experimental: { id: 'experimental', label: '创意', hint: '更大胆的视觉', icon: 'palette' },
}

export const enhanceIntentMeta: Record<EnhanceIntent, EnhanceIntentMeta> = {
  create: { id: 'create', label: '生图', hint: '从文字生成画面', icon: 'sparkle' },
  edit: { id: 'edit', label: 'P图', hint: '保留原图，只改目标', icon: 'pencil' },
  retouch: { id: 'retouch', label: '修图', hint: '光色、质感、细节', icon: 'sliders' },
  product: { id: 'product', label: '产品', hint: '商品图与棚拍', icon: 'camera' },
  poster: { id: 'poster', label: '海报', hint: '版式与视觉层级', icon: 'template' },
  portrait: { id: 'portrait', label: '人物', hint: '脸、服装、姿态', icon: 'focus' },
  logo: { id: 'logo', label: 'Logo', hint: '图形标识', icon: 'star' },
}

const subjectLabels: Record<string, string> = {
  person: '人物',
  animal: '动物',
  landscape: '风景',
  object: '物件',
  abstract: '抽象',
  architecture: '建筑',
  food: '食物',
  general: '通用',
}

const slotToDimensionMap: Partial<Record<SlotName, EnhanceDimension>> = {
  lighting: 'lighting',
  palette: 'color',
  composition: 'composition',
  material: 'material',
  mood: 'atmosphere',
  camera: 'lens',
}

const dimensionToSlotMap: Record<EnhanceDimension, SlotName> = {
  lighting: 'lighting',
  color: 'palette',
  composition: 'composition',
  material: 'material',
  atmosphere: 'mood',
  lens: 'camera',
}

function recommendedModeFor(style: ImageStyle): EnhanceMode {
  if (style === 'product' || style === 'poster') return 'commercial'
  if (style === 'cinematic') return 'cinematic'
  if (style === 'logo' || style === 'raw') return 'faithful'
  if (style === 'anime') return 'experimental'
  return 'balanced'
}

function recommendedIntentFor(style: ImageStyle): EnhanceIntent {
  if (style === 'product') return 'product'
  if (style === 'poster') return 'poster'
  if (style === 'portrait') return 'portrait'
  if (style === 'logo') return 'logo'
  return 'create'
}

export function inferEnhanceIntent(style: ImageStyle, hasReferenceImages = false): EnhanceIntent {
  if (hasReferenceImages) return 'edit'
  return recommendedIntentFor(style)
}

function tokenEstimate(text: string): number {
  if (!text) return 0
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  const ascii = text.replace(/[\u4e00-\u9fff]/g, ' ').trim().split(/\s+/).filter(Boolean).length
  return Math.round(cjk * 1.3 + ascii * 1.3)
}

function metricStateFromScore(score: number): MetricState {
  if (score >= 78) return 'strong'
  if (score >= 42) return 'weak'
  return 'missing'
}

function dimensionLabel(dim: EnhanceDimension): string {
  return enhanceDimensions.find((item) => item.id === dim)?.label ?? dim
}

function slotsToDimensions(slots: SlotName[]): EnhanceDimension[] {
  const out: EnhanceDimension[] = []
  for (const slot of slots) {
    const dim = slotToDimensionMap[slot]
    if (dim && !out.includes(dim)) out.push(dim)
  }
  return out
}

interface AnalyzeArgs {
  prompt: string
  style: ImageStyle
  size?: string
  quality?: ImageQuality
  intent?: EnhanceIntent
  modelName?: string
  hasReferenceImages?: boolean
  count?: number
}

export function buildPromptDoc(args: AnalyzeArgs): PromptDoc {
  const intent = args.intent ?? inferEnhanceIntent(args.style, args.hasReferenceImages)
  return parsePrompt({
    prompt: args.prompt,
    style: args.style,
    size: args.size ?? '1024x1024',
    quality: args.quality ?? 'auto',
    intent,
    modelName: args.modelName,
    count: args.count,
  })
}

export function analyzePromptDoc(args: AnalyzeArgs): PromptAnalysis {
  const doc = buildPromptDoc(args)
  const presentSlots = SLOT_ORDER.filter((slot) => Boolean(doc.slots[slot]?.value))
  const required = requiredSlotsFor(doc.meta.intent)
  const missingSlots = required.filter((slot) => !doc.slots[slot]?.value)
  const presentDimensions = new Set<EnhanceDimension>(slotsToDimensions(presentSlots))
  const missingDimensions = slotsToDimensions(missingSlots)
  const score = scoreDoc(doc)
  const lintIssues = lintPrompt(doc)
  const tokens = tokenEstimate(doc.raw)

  const lengthScore = doc.raw.length < 24
    ? 30
    : doc.raw.length < 80
      ? 65
      : doc.raw.length < 260
        ? 90
        : doc.raw.length < 620
          ? 84
          : 60
  const slotScore = Math.round((presentSlots.length / SLOT_ORDER.length) * 100)
  const subjectScore = doc.slots.subject?.value ? 90 : 30
  const controlScore = doc.slots.composition?.value && doc.slots.lighting?.value
    ? 90
    : doc.slots.composition?.value || doc.slots.lighting?.value
      ? 65
      : 32
  const finishScore = doc.constraints.forbid.length || lintIssues.every((issue) => issue.severity !== 'error')
    ? 78
    : 48

  const metrics: PromptMetric[] = [
    {
      id: 'clarity',
      label: '清晰度',
      score: lengthScore,
      state: metricStateFromScore(lengthScore),
      hint: doc.raw.length < 24 ? '主体或场景偏短' : '表达长度合适',
    },
    {
      id: 'slots',
      label: '槽位完整',
      score: slotScore,
      state: metricStateFromScore(slotScore),
      hint: missingSlots.length
        ? `缺 ${missingSlots.slice(0, 2).map((slot) => dimensionLabel(slotToDimensionMap[slot] ?? 'lighting')).join('、')}`
        : '关键槽位齐了',
    },
    {
      id: 'subject',
      label: '主体识别',
      score: subjectScore,
      state: metricStateFromScore(subjectScore),
      hint: subjectLabels[doc.meta.subjectType] ?? '通用',
    },
    {
      id: 'control',
      label: '可控性',
      score: controlScore,
      state: metricStateFromScore(controlScore),
      hint: controlScore >= 78 ? '光位与构图明确' : '建议补光位或构图',
    },
    {
      id: 'finish',
      label: '成片度',
      score: finishScore,
      state: metricStateFromScore(finishScore),
      hint: doc.constraints.forbid.length ? '避免项已设' : '建议补避免项',
    },
  ]

  const strengths: string[] = []
  if (doc.meta.subjectType !== 'general') strengths.push(`${subjectLabels[doc.meta.subjectType]}主体`)
  for (const slot of presentSlots.slice(0, 3)) {
    const dim = slotToDimensionMap[slot]
    if (dim) strengths.push(dimensionLabel(dim))
  }

  const issues: string[] = []
  if (doc.raw.length < 8) issues.push('提示词过短，生成稳定性偏低')
  if (missingSlots.length) {
    issues.push(`优先补 ${missingSlots.slice(0, 3).map((slot) => dimensionLabel(slotToDimensionMap[slot] ?? 'lighting')).join('、')}`)
  }
  for (const lint of lintIssues) {
    if (lint.severity === 'error') issues.push(lint.message)
  }

  const recommendedLevel: EnhanceLevel = score < 52 ? 'heavy' : score < 76 ? 'standard' : 'light'

  return {
    doc,
    presentSlots,
    missingSlots,
    presentDimensions,
    missingDimensions,
    subjectType: doc.meta.subjectType,
    subjectLabel: subjectLabels[doc.meta.subjectType] ?? subjectLabels.general,
    score,
    language: doc.meta.language,
    metrics,
    strengths,
    issues,
    lintIssues,
    recommendedLevel,
    recommendedMode: recommendedModeFor(args.style),
    recommendedIntent: recommendedIntentFor(args.style),
    estimatedTokens: tokens,
  }
}

export function analyzePrompt(prompt: string, style: ImageStyle = 'raw'): PromptAnalysis {
  return analyzePromptDoc({ prompt, style })
}

function summarizeResult(filledSlots: SlotName[], mode: EnhanceMode, intent: EnhanceIntent, before: number, after: number): string {
  const dimensions = slotsToDimensions(filledSlots).slice(0, 3)
  const dimText = dimensions.map(dimensionLabel).join('、')
  const scoreText = after > before ? `${before}→${after}` : `${after}`
  if (dimText) return `${enhanceIntentMeta[intent].label} · ${enhanceModeMeta[mode].label} · ${dimText} · ${scoreText}`
  return `${enhanceIntentMeta[intent].label} · ${enhanceModeMeta[mode].label} · ${scoreText}`
}

export interface EnhanceArgs extends AnalyzeArgs {
  level?: EnhanceLevel
  mode?: EnhanceMode
  targetDimensions?: EnhanceDimension[]
  targetSlots?: SlotName[]
  axisSlot?: SlotName
  context?: PromptContext
  seed?: string
  slotOverrides?: Partial<Record<SlotName, { value: string; source?: 'user' | 'engine' }>>
}

export function enhancePromptDoc(args: EnhanceArgs): EnhanceResult {
  const trimmed = args.prompt.trim()
  if (!trimmed) {
    return {
      enhanced: '',
      addedParts: [],
      dimensions: [],
      dimensionLabels: [],
      level: args.level ?? 'standard',
      mode: args.mode ?? recommendedModeFor(args.style),
      intent: args.intent ?? recommendedIntentFor(args.style),
      original: args.prompt,
      scoreBefore: 0,
      scoreAfter: 0,
      summary: '',
      filledSlots: [],
      preserveList: [],
      forbidList: [],
      lintIssues: [],
      renderMode: 'structured',
    }
  }

  const intent = args.intent ?? inferEnhanceIntent(args.style, args.hasReferenceImages)
  const mode = args.mode ?? recommendedModeFor(args.style)
  const level = args.level ?? 'standard'
  const doc = buildPromptDoc({ ...args, intent })

  const targetSlots = args.targetSlots
    ?? (args.targetDimensions
      ? args.targetDimensions.map((dim) => dimensionToSlotMap[dim])
      : undefined)

  const composition = compose(doc, {
    level,
    mode,
    context: args.context,
    forceSlots: targetSlots,
    axisFocus: args.axisSlot,
    seed: args.seed,
    slotOverrides: args.slotOverrides
      ? Object.fromEntries(
        Object.entries(args.slotOverrides)
          .filter(([, override]) => override?.value)
          .map(([slot, override]) => [
            slot,
            { value: override!.value, source: (override!.source ?? 'user') as 'user' | 'engine', confidence: 0.95 },
          ]),
      )
      : undefined,
  })

  const filledSlots = composition.finalSlots
    .filter((record) => record.origin !== 'user')
    .map((record) => record.slot)
  const dimensions = slotsToDimensions(filledSlots)
  const addedParts = composition.finalSlots
    .filter((record) => record.origin !== 'user')
    .map((record) => record.filled.value)

  return {
    enhanced: composition.rendered,
    addedParts,
    dimensions,
    dimensionLabels: dimensions.map(dimensionLabel),
    level,
    mode,
    intent,
    original: args.prompt,
    scoreBefore: composition.scoreBefore,
    scoreAfter: composition.scoreAfter,
    summary: summarizeResult(filledSlots, mode, intent, composition.scoreBefore, composition.scoreAfter),
    filledSlots,
    preserveList: composition.preserveList,
    forbidList: composition.forbidList,
    lintIssues: composition.issuesAfter,
    renderMode: composition.renderMode,
  }
}

export function enhancePrompt(
  prompt: string,
  style: ImageStyle,
  level: EnhanceLevel,
  targetDimensions?: EnhanceDimension[],
  mode?: EnhanceMode,
  intent?: EnhanceIntent,
): EnhanceResult {
  return enhancePromptDoc({
    prompt,
    style,
    level,
    mode,
    intent,
    targetDimensions,
  })
}

export function enhanceSingleDimension(
  prompt: string,
  style: ImageStyle,
  dimension: EnhanceDimension,
  mode?: EnhanceMode,
  intent?: EnhanceIntent,
): EnhanceResult {
  return enhancePromptDoc({
    prompt,
    style,
    level: 'light',
    mode,
    intent,
    targetDimensions: [dimension],
    axisSlot: dimensionToSlotMap[dimension],
  })
}

export function createPromptVariants(
  prompt: string,
  style: ImageStyle,
  mode?: EnhanceMode,
  intent?: EnhanceIntent,
  context?: PromptContext,
): PromptVariant[] {
  const analysis = analyzePromptDoc({ prompt, style, intent })
  const baseMode = mode ?? recommendedModeFor(style)
  const baseIntent = intent ?? analysis.recommendedIntent

  const candidates: PromptVariant[] = [
    {
      id: 'recommended',
      label: '智能推荐',
      hint: `${enhanceIntentMeta[baseIntent].label} · ${enhanceLevelMeta[analysis.recommendedLevel].label}`,
      result: enhancePromptDoc({
        prompt,
        style,
        level: analysis.recommendedLevel,
        mode: baseMode,
        intent: baseIntent,
        context,
      }),
    },
    {
      id: 'faithful',
      label: '精准保真',
      hint: '少发挥',
      result: enhancePromptDoc({
        prompt,
        style,
        level: 'light',
        mode: 'faithful',
        intent: baseIntent,
        context,
      }),
    },
    {
      id: 'delivery',
      label: '成片交付',
      hint: '商业完成度',
      result: enhancePromptDoc({
        prompt,
        style,
        level: 'standard',
        mode: 'commercial',
        intent: baseIntent,
        context,
      }),
    },
    {
      id: 'impact',
      label: style === 'cinematic' ? '电影调度' : '视觉冲击',
      hint: style === 'cinematic' ? '叙事增强' : '更强画面',
      result: enhancePromptDoc({
        prompt,
        style,
        level: 'heavy',
        mode: style === 'cinematic' ? 'cinematic' : baseMode,
        intent: baseIntent,
        context,
      }),
    },
    {
      id: 'bold',
      label: '创意探索',
      hint: '大胆但可控',
      result: enhancePromptDoc({
        prompt,
        style,
        level: 'heavy',
        mode: 'experimental',
        intent: baseIntent,
        context,
      }),
    },
  ]

  const seen = new Set<string>()
  return candidates.filter((item) => {
    const value = item.result.enhanced.trim()
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

const axisSlotMap: Record<'lighting' | 'camera' | 'palette' | 'mood' | 'composition', SlotName> = {
  lighting: 'lighting',
  camera: 'camera',
  palette: 'palette',
  mood: 'mood',
  composition: 'composition',
}

export function createAxisVariants(
  prompt: string,
  style: ImageStyle,
  axis: 'lighting' | 'camera' | 'palette' | 'mood' | 'composition',
  intent?: EnhanceIntent,
  context?: PromptContext,
): PromptVariant[] {
  const slot = axisSlotMap[axis]
  const seeds = ['axis-1', 'axis-2', 'axis-3', 'axis-4']
  const labels: Record<typeof axis, string[]> = {
    lighting: ['黄金时刻', '柔光棚拍', '夜景霓虹', '阴天柔光'],
    camera: ['85mm 浅景深', '35mm 纪实', '24mm 广角', '100mm 微距'],
    palette: ['青橙双色', '低饱和奶油', '黑白单色', '高饱和撞色'],
    mood: ['克制安静', '戏剧张力', '怀旧胶片', '未来冷感'],
    composition: ['三分偏右', '居中对称', '低机位仰拍', '俯视平铺'],
  } as Record<typeof axis, string[]>

  return seeds.map((seed, index) => ({
    id: `axis-${axis}-${index}`,
    label: labels[axis][index] ?? `变体 ${index + 1}`,
    hint: `${axis} 变体`,
    result: enhancePromptDoc({
      prompt,
      style,
      level: 'standard',
      intent,
      targetSlots: [slot],
      axisSlot: slot,
      seed,
      context,
    }),
  }))
}

export function undoEnhance(result: EnhanceResult): string {
  return result.original
}

export function getMissingLabel(missing: EnhanceDimension[]): string {
  if (!missing.length) return '提示词已很完整'
  const labels = missing.slice(0, 3).map(dimensionLabel)
  const suffix = missing.length > 3 ? `等${missing.length}项` : ''
  return `可补充：${labels.join('、')}${suffix}`
}

export function pickDimensionsForLevel(missing: EnhanceDimension[], level: EnhanceLevel): EnhanceDimension[] {
  if (level === 'light') return missing.slice(0, 2)
  if (level === 'standard') return missing.slice(0, 4)
  return missing.slice()
}

const slotIcons: Record<SlotName, IconName> = {
  subject: 'focus',
  action: 'pulse',
  environment: 'image',
  lighting: 'sun',
  camera: 'camera',
  composition: 'frame',
  palette: 'palette',
  material: 'layers',
  mood: 'wind',
  styleAnchor: 'star',
}

const slotLabelsZh: Record<SlotName, string> = {
  subject: '主体',
  action: '动作',
  environment: '环境',
  lighting: '光位',
  camera: '镜头',
  composition: '构图',
  palette: '色彩',
  material: '材质',
  mood: '氛围',
  styleAnchor: '风格',
}

export interface SlotCard {
  slot: SlotName
  label: string
  icon: IconName
  value: string
  source: 'user' | 'inferred' | 'engine' | 'brand' | 'session' | 'continuation'
  confidence: number
  isMissing: boolean
}

export function buildSlotCards(analysis: PromptAnalysis): SlotCard[] {
  const out: SlotCard[] = []
  for (const slot of SLOT_ORDER) {
    const filled = analysis.doc.slots[slot]
    out.push({
      slot,
      label: slotLabelsZh[slot],
      icon: slotIcons[slot],
      value: filled?.value ?? '',
      source: filled?.source ?? 'engine',
      confidence: filled?.confidence ?? 0,
      isMissing: !filled?.value,
    })
  }
  return out
}

export function dimensionToSlotName(dim: EnhanceDimension): SlotName {
  return dimensionToSlotMap[dim]
}

function removeMatches(text: string, patterns: string[]): string {
  let result = text
  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern, 'gi')
      result = result.replace(regex, '')
    } catch {}
  }
  return result.replace(/\s{2,}/g, ' ').replace(/[，,]\s*[，,]/g, '，').trim()
}

import type { LintFix } from './promptDoc'
import { fillSlot as fillSlotInternal } from './promptFiller'

export interface LintFixOutcome {
  nextPrompt?: string
  slotOverride?: { slot: SlotName; value: string }
}

export function applyLintFix(args: {
  prompt: string
  style: ImageStyle
  size?: string
  intent?: EnhanceIntent
  modelName?: string
  hasReferenceImages?: boolean
  issue: LintIssue
  optionId?: string
  context?: PromptContext
}): LintFixOutcome {
  const issue = args.issue
  const fix: LintFix | undefined = issue.fix
  if (!fix) return {}

  if (fix.kind === 'remove-pattern' && fix.removePatterns?.length) {
    return { nextPrompt: removeMatches(args.prompt, fix.removePatterns) }
  }

  if (fix.kind === 'pick-one-of' && fix.options?.length) {
    const option = (args.optionId
      ? fix.options.find((item) => item.id === args.optionId)
      : fix.options[0]) ?? fix.options[0]
    return { nextPrompt: removeMatches(args.prompt, option.remove) }
  }

  if (fix.kind === 'set-slot-from-vocab' && fix.slot) {
    const intent = args.intent ?? inferEnhanceIntent(args.style, args.hasReferenceImages)
    const doc = buildPromptDoc({
      prompt: args.prompt,
      style: args.style,
      size: args.size,
      intent,
      modelName: args.modelName,
      hasReferenceImages: args.hasReferenceImages,
    })
    const filled = fillSlotInternal({
      doc,
      slot: fix.slot,
      mode: recommendedModeFor(args.style),
      context: args.context,
      seed: args.prompt,
    })
    if (filled?.value) {
      return { slotOverride: { slot: fix.slot, value: filled.value } }
    }
  }

  return {}
}
