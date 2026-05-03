import type { ImageStyle } from '../types'
import type { IconName } from '../icons'
import { detectSubjectType } from './imagesApi'

export type EnhanceLevel = 'light' | 'standard' | 'heavy'

export type EnhanceDimension =
  | 'lighting'
  | 'color'
  | 'composition'
  | 'material'
  | 'atmosphere'
  | 'lens'

export interface EnhanceDimensionMeta {
  id: EnhanceDimension
  label: string
  icon: IconName
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
  light: { label: '轻柔', hint: '补 1-2 个维度' },
  standard: { label: '标准', hint: '补 3-4 个维度' },
  heavy: { label: '强力', hint: '全面补全' },
}

const dimensionVocabulary: Record<EnhanceDimension, Record<string, string>> = {
  lighting: {
    zh: '自然侧逆光，柔和方向性阴影，光质通透',
    en: 'natural side-back lighting, soft directional shadows, luminous quality',
  },
  color: {
    zh: '克制双色调配色，主色与点缀色形成和谐对比',
    en: 'controlled dual-tone palette, harmonious contrast between primary and accent colors',
  },
  composition: {
    zh: '三分法构图，视觉重心明确，层次分明',
    en: 'rule of thirds composition, clear visual anchor, layered depth',
  },
  material: {
    zh: '真实材质纹理，表面细节可触可感',
    en: 'authentic material textures, tactile surface detail',
  },
  atmosphere: {
    zh: '沉浸式氛围，画面有叙事张力',
    en: 'immersive atmosphere, narrative tension in the frame',
  },
  lens: {
    zh: '35mm 纪实视角，浅景深，焦点锐利',
    en: '35mm documentary perspective, shallow depth of field, sharp focus',
  },
}

const subjectDimensionPriority: Record<string, EnhanceDimension[]> = {
  person: ['lighting', 'lens', 'atmosphere', 'color', 'material', 'composition'],
  landscape: ['composition', 'atmosphere', 'lighting', 'color', 'lens', 'material'],
  object: ['material', 'lighting', 'composition', 'color', 'lens', 'atmosphere'],
  abstract: ['color', 'composition', 'atmosphere', 'material', 'lighting', 'lens'],
  architecture: ['composition', 'lens', 'lighting', 'material', 'atmosphere', 'color'],
  food: ['material', 'lighting', 'color', 'composition', 'atmosphere', 'lens'],
  general: ['lighting', 'composition', 'color', 'atmosphere', 'material', 'lens'],
}

const styleSuffixByLevel: Record<EnhanceLevel, Record<ImageStyle, string>> = {
  light: {
    natural: 'natural ambient light, honest textures',
    poster: 'strong composition, elegant negative space',
    product: 'studio-grade lighting, clean reflections',
    portrait: 'expressive eyes, refined skin texture',
    anime: 'clean cel shading, crisp linework',
    cinematic: 'anamorphic framing, dramatic lighting',
    logo: 'minimal vector geometry, balanced negative space',
    interior: 'architectural composition, layered natural light',
    raw: '',
  },
  standard: {
    natural: 'natural ambient light, honest textures, documentary realism, subtle color grading',
    poster: 'strong poster composition, cinematic hierarchy, elegant negative space, premium editorial typography area',
    product: 'studio-grade lighting, clean reflections, crisp material detail, premium commercial photography',
    portrait: 'expressive eyes, refined skin texture, editorial portrait lighting, shallow depth of field',
    anime: 'clean cel shading, expressive character design, crisp linework, vibrant yet controlled palette',
    cinematic: 'anamorphic framing, dramatic practical lighting, atmospheric depth, film still composition',
    logo: 'minimal vector geometry, scalable silhouette, balanced negative space, no text',
    interior: 'architectural composition, layered natural light, warm material palette, lived-in spatial detail',
    raw: '',
  },
  heavy: {
    natural: 'natural ambient light with soft directional shadows, honest textures preserving material imperfections, documentary realism with candid atmosphere, subtle color grading with authentic tonal depth, 35mm lens shallow depth of field',
    poster: 'strong poster composition with clear visual hierarchy, cinematic framing with dramatic lighting contrast, elegant negative space reserved for typography, premium editorial aesthetic with controlled dual-tone palette, print-quality tonal depth',
    product: 'studio-grade lighting with large softbox key and reflector fill, clean specular reflections on polished surfaces, crisp material detail with authentic texture rendering, premium commercial photography with seamless background, tight crop with product occupying 60% of frame',
    portrait: 'expressive eyes with natural catchlights, refined skin texture preserving pores and micro-detail, editorial portrait lighting with window-light quality, shallow depth of field with creamy bokeh background, 85mm lens at f/1.8 with focus on near eye',
    anime: 'clean cel shading with consistent line weight, expressive character design with lively features, crisp linework with no artifacts, vibrant yet controlled palette with clear light-shadow separation, simplified geometric background with atmospheric depth',
    cinematic: 'anamorphic framing with 2.39:1 widescreen aspect, dramatic practical lighting with deep shadows, atmospheric depth with 35mm film grain, film still composition with A24-style restraint, horizontal lens flare and elliptical bokeh',
    logo: 'minimal vector geometry with pure flat aesthetics, scalable silhouette recognizable at 16px, balanced negative space with strong visual weight, no text no gradients no shadows, contemporary brand mark suitable for digital and print',
    interior: 'architectural composition with corrected verticals, layered natural light from window sources, warm material palette with authentic textures, lived-in spatial detail with personal traces, 24mm wide-angle with waist-level perspective',
    raw: '',
  },
}

const lightingKeywords = [
  '光', 'light', 'shadow', '阴影', '侧光', '逆光', '背光', '柔光', '硬光', '自然光',
  '日光', '阳光', '月光', '灯光', '霓虹', 'rim light', 'key light', 'backlight',
  'side light', 'soft light', 'ambient', 'directional',
]

const colorKeywords = [
  '色', 'color', '色调', '配色', 'palette', 'hue', '饱和', 'saturat', '暖色', '冷色',
  '对比', '双色调', 'monochrom', 'grad', '渐变', 'pastel', 'vibrant', 'muted',
]

const compositionKeywords = [
  '构图', 'composit', 'framing', '三分', '居中', '对称', '留白', 'negative space',
  '层次', '纵深', 'depth', '前景', '背景', '视角', 'perspective', '俯视', '仰视',
  '特写', '全景', '裁切', 'crop',
]

const materialKeywords = [
  '材质', 'material', '纹理', 'texture', '表面', 'surface', '质感', '反光', 'reflect',
  '金属', '玻璃', '木', '布', '皮', '石', '丝', '绒', '亚麻', '陶瓷',
]

const atmosphereKeywords = [
  '氛围', 'atmosphere', 'mood', '情绪', '感觉', '宁静', '温暖', '冷峻', '神秘',
  '浪漫', '紧张', '松弛', '戏剧', 'dramat', 'tension', 'narrat', '故事', '叙事',
  '雾', 'rain', '雨', '烟', '尘', '光尘',
]

const lensKeywords = [
  '镜头', 'lens', '焦距', 'focal', '景深', 'depth of field', 'bokeh', '虚化',
  '35mm', '50mm', '85mm', '100mm', '24mm', '微距', 'macro', '广角', 'wide',
  '长焦', 'telephoto', 'f/', '光圈', 'aperture',
]

function promptContainsAny(prompt: string, keywords: string[]): boolean {
  const lower = prompt.toLowerCase()
  return keywords.some((kw) => lower.includes(kw.toLowerCase()))
}

export interface PromptAnalysis {
  present: Set<EnhanceDimension>
  missing: EnhanceDimension[]
  subjectType: string
  suggestedOrder: EnhanceDimension[]
}

export function analyzePrompt(prompt: string): PromptAnalysis {
  const subjectType = detectSubjectType(prompt)
  const present = new Set<EnhanceDimension>()

  if (promptContainsAny(prompt, lightingKeywords)) present.add('lighting')
  if (promptContainsAny(prompt, colorKeywords)) present.add('color')
  if (promptContainsAny(prompt, compositionKeywords)) present.add('composition')
  if (promptContainsAny(prompt, materialKeywords)) present.add('material')
  if (promptContainsAny(prompt, atmosphereKeywords)) present.add('atmosphere')
  if (promptContainsAny(prompt, lensKeywords)) present.add('lens')

  const priority = subjectDimensionPriority[subjectType] ?? subjectDimensionPriority.general
  const missing = priority.filter((d) => !present.has(d))
  const suggestedOrder = priority

  return { present, missing, subjectType, suggestedOrder }
}

export function pickDimensionsForLevel(
  missing: EnhanceDimension[],
  level: EnhanceLevel,
): EnhanceDimension[] {
  if (level === 'light') return missing.slice(0, 2)
  if (level === 'standard') return missing.slice(0, 4)
  return missing.slice()
}

export interface EnhanceResult {
  enhanced: string
  addedParts: string[]
  dimensions: EnhanceDimension[]
  level: EnhanceLevel
  original: string
}

function isChinese(prompt: string): boolean {
  const cjk = prompt.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  const total = prompt.replace(/\s/g, '').length || 1
  return cjk / total > 0.25
}

export function enhancePrompt(
  prompt: string,
  style: ImageStyle,
  level: EnhanceLevel,
  targetDimensions?: EnhanceDimension[],
): EnhanceResult {
  const trimmed = prompt.trim()
  if (!trimmed) {
    return { enhanced: '', addedParts: [], dimensions: [], level, original: prompt }
  }

  const analysis = analyzePrompt(trimmed)
  const missing = targetDimensions
    ? targetDimensions.filter((d) => analysis.missing.includes(d))
    : analysis.missing

  const dims = pickDimensionsForLevel(missing, level)
  const useZh = isChinese(trimmed)
  const langKey = useZh ? 'zh' : 'en'

  const addedParts: string[] = []

  const styleSuffix = styleSuffixByLevel[level][style]
  if (styleSuffix && !trimmed.includes(styleSuffix)) {
    addedParts.push(styleSuffix)
  }

  for (const dim of dims) {
    const vocab = dimensionVocabulary[dim]?.[langKey]
    if (vocab && !trimmed.includes(vocab)) {
      addedParts.push(vocab)
    }
  }

  if (!addedParts.length) {
    return { enhanced: trimmed, addedParts: [], dimensions: dims, level, original: prompt }
  }

  const enhanced = `${trimmed}, ${addedParts.join(', ')}`
  return { enhanced, addedParts, dimensions: dims, level, original: prompt }
}

export function enhanceSingleDimension(
  prompt: string,
  style: ImageStyle,
  dimension: EnhanceDimension,
): EnhanceResult {
  return enhancePrompt(prompt, style, 'light', [dimension])
}

export function undoEnhance(result: EnhanceResult): string {
  return result.original
}

export function getDimensionLabel(dim: EnhanceDimension): string {
  return enhanceDimensions.find((d) => d.id === dim)?.label ?? dim
}

export function getMissingLabel(missing: EnhanceDimension[]): string {
  if (!missing.length) return '提示词已很完整'
  const labels = missing.slice(0, 3).map(getDimensionLabel)
  const suffix = missing.length > 3 ? `等${missing.length}项` : ''
  return `可补充：${labels.join('、')}${suffix}`
}
