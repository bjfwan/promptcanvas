import type { ImageQuality, ImageStyle } from '../types'

export type LanguageMode = 'zh' | 'en'

export type SubjectKind =
  | 'person'
  | 'animal'
  | 'landscape'
  | 'object'
  | 'abstract'
  | 'architecture'
  | 'food'
  | 'general'

export type SlotName =
  | 'subject'
  | 'action'
  | 'environment'
  | 'lighting'
  | 'camera'
  | 'composition'
  | 'palette'
  | 'material'
  | 'mood'
  | 'styleAnchor'

export type SlotSource =
  | 'user'
  | 'inferred'
  | 'engine'
  | 'brand'
  | 'session'
  | 'continuation'

export type EnhanceLevel = 'light' | 'standard' | 'heavy'

export type EnhanceMode = 'balanced' | 'faithful' | 'commercial' | 'cinematic' | 'experimental'

export type EnhanceIntent = 'create' | 'edit' | 'retouch' | 'product' | 'poster' | 'portrait' | 'logo'

export type ModelFamily = 'gpt-image' | 'dalle' | 'midjourney' | 'sd' | 'flux' | 'imagen' | 'unknown'

export type RenderMode = 'structured' | 'narrative' | 'compact'

export type EnhanceAxis = 'auto' | 'lighting' | 'camera' | 'palette' | 'mood' | 'composition'

export interface Slot {
  value: string
  source: SlotSource
  confidence: number
}

export interface PromptConstraints {
  preserve: string[]
  change: string[]
  forbid: string[]
}

export interface PromptDocMeta {
  language: LanguageMode
  subjectType: SubjectKind
  intent: EnhanceIntent
  aspectRatio: '1:1' | '2:3' | '3:2'
  quality: ImageQuality
  styleId: ImageStyle
  modelFamily: ModelFamily
  count: number
}

export interface PromptDoc {
  raw: string
  slots: Partial<Record<SlotName, Slot>>
  constraints: PromptConstraints
  meta: PromptDocMeta
}

export interface BrandKit {
  enabled: boolean
  alwaysInclude: string
  neverInclude: string
  signaturePalette: string
  signatureCamera: string
  signatureLighting: string
}

export interface SessionProfile {
  preferredFocalLengths: string[]
  preferredColorTones: string[]
  preferredModes: EnhanceMode[]
  preferredIntents: EnhanceIntent[]
  topTokens: string[]
  recentSubjects: SubjectKind[]
  sampleSize: number
}

export interface PromptContext {
  brand?: BrandKit | null
  session?: SessionProfile | null
  continuation?: PromptDoc | null
}

export type LintSeverity = 'error' | 'warning' | 'info'

export type LintFixKind =
  | 'pick-one-of'
  | 'remove-pattern'
  | 'set-slot-from-vocab'
  | 'set-subject'

export interface LintFix {
  kind: LintFixKind
  label: string
  options?: Array<{ id: string; label: string; remove: string[] }>
  removePatterns?: string[]
  slot?: SlotName
}

export interface LintIssue {
  id: string
  severity: LintSeverity
  message: string
  slot?: SlotName
  hint?: string
  fix?: LintFix
}

export const SLOT_ORDER: SlotName[] = [
  'subject',
  'action',
  'environment',
  'composition',
  'camera',
  'lighting',
  'material',
  'palette',
  'mood',
  'styleAnchor',
]

export const SLOT_LABELS_ZH: Record<SlotName, string> = {
  subject: '主体',
  action: '动作',
  environment: '环境',
  lighting: '光影',
  camera: '镜头',
  composition: '构图',
  palette: '色彩',
  material: '材质',
  mood: '氛围',
  styleAnchor: '风格锚点',
}

export const SLOT_LABELS_EN: Record<SlotName, string> = {
  subject: 'Subject',
  action: 'Action',
  environment: 'Environment',
  lighting: 'Lighting',
  camera: 'Camera',
  composition: 'Composition',
  palette: 'Palette',
  material: 'Material',
  mood: 'Mood',
  styleAnchor: 'Style',
}

export function slotLabel(slot: SlotName, lang: LanguageMode = 'zh'): string {
  return lang === 'zh' ? SLOT_LABELS_ZH[slot] : SLOT_LABELS_EN[slot]
}

export const EMPTY_BRAND_KIT: BrandKit = {
  enabled: false,
  alwaysInclude: '',
  neverInclude: '',
  signaturePalette: '',
  signatureCamera: '',
  signatureLighting: '',
}

export function emptySessionProfile(): SessionProfile {
  return {
    preferredFocalLengths: [],
    preferredColorTones: [],
    preferredModes: [],
    preferredIntents: [],
    topTokens: [],
    recentSubjects: [],
    sampleSize: 0,
  }
}

export function detectModelFamily(modelName: string | undefined | null): ModelFamily {
  const id = (modelName || '').toLowerCase().trim()
  if (!id) return 'gpt-image'
  if (/gpt-?image|sora/.test(id)) return 'gpt-image'
  if (/dall.?e/.test(id)) return 'dalle'
  if (/midjourney|mj[-_]/.test(id)) return 'midjourney'
  if (/^sd|stable|sdxl|sd3/.test(id)) return 'sd'
  if (/flux/.test(id)) return 'flux'
  if (/imagen|gemini/.test(id)) return 'imagen'
  return 'unknown'
}

export function aspectRatioFromSize(size: string): '1:1' | '2:3' | '3:2' {
  if (size === '1024x1536') return '2:3'
  if (size === '1536x1024') return '3:2'
  return '1:1'
}

export function pickRenderMode(family: ModelFamily, intent: EnhanceIntent): RenderMode {
  if (family === 'dalle') return 'narrative'
  if (family === 'midjourney' || family === 'sd' || family === 'flux') return 'compact'
  if (intent === 'logo') return 'compact'
  return 'structured'
}

export function isHexColor(value: string): boolean {
  return /^#?[0-9a-f]{3,8}$/i.test(value.trim())
}
