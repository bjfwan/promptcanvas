import type { ImageStyle } from '../types'
import type { IconName } from '../icons'
import { detectSubjectType } from './imagesApi'
import { getVocab, type SK, type Dim } from './enhanceVocab'

export type EnhanceLevel = 'light' | 'standard' | 'heavy'
export type EnhanceMode = 'balanced' | 'faithful' | 'commercial' | 'cinematic' | 'experimental'
export type EnhanceIntent = 'create' | 'edit' | 'retouch' | 'product' | 'poster' | 'portrait' | 'logo'

export type EnhanceDimension =
  | 'lighting'
  | 'color'
  | 'composition'
  | 'material'
  | 'atmosphere'
  | 'lens'

type MetricState = 'strong' | 'weak' | 'missing'
type LanguageMode = 'zh' | 'en'

interface BilingualText {
  z: string
  e: string
}

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
  present: Set<EnhanceDimension>
  missing: EnhanceDimension[]
  subjectType: string
  subjectLabel: string
  suggestedOrder: EnhanceDimension[]
  score: number
  language: LanguageMode
  metrics: PromptMetric[]
  strengths: string[]
  issues: string[]
  recommendedLevel: EnhanceLevel
  recommendedMode: EnhanceMode
  recommendedIntent: EnhanceIntent
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
  light: { label: '轻修', hint: '补关键短板' },
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

const subjectDimensionPriority: Record<string, EnhanceDimension[]> = {
  person: ['lighting', 'lens', 'atmosphere', 'color', 'material', 'composition'],
  animal: ['material', 'lighting', 'lens', 'atmosphere', 'composition', 'color'],
  landscape: ['composition', 'atmosphere', 'lighting', 'color', 'lens', 'material'],
  object: ['material', 'lighting', 'composition', 'color', 'lens', 'atmosphere'],
  abstract: ['color', 'composition', 'atmosphere', 'material', 'lighting', 'lens'],
  architecture: ['composition', 'lens', 'lighting', 'material', 'atmosphere', 'color'],
  food: ['material', 'lighting', 'color', 'composition', 'atmosphere', 'lens'],
  general: ['lighting', 'composition', 'color', 'atmosphere', 'material', 'lens'],
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

const qualityKeywords = [
  '高清', '清晰', '锐利', '真实', '稳定', '细节', '无水印', '避免', '不要', '禁止',
  'high quality', 'sharp', 'realistic', 'stable', 'detail', 'avoid', 'no watermark',
]

const structureKeywords = [
  '主体', 'subject', 'main', '中心', '焦点', 'focus', '环境', '背景', 'foreground',
  'background', '动作', 'pose', '位置', '比例', 'scale',
]

const keywordMap: Record<EnhanceDimension, string[]> = {
  lighting: lightingKeywords,
  color: colorKeywords,
  composition: compositionKeywords,
  material: materialKeywords,
  atmosphere: atmosphereKeywords,
  lens: lensKeywords,
}

const styleQualityTag: Record<ImageStyle, BilingualText> = {
  natural: {
    z: '纪实真实感，自然色彩还原，细节不过度修饰',
    e: 'documentary realism, natural color grading, restrained detail polish',
  },
  poster: {
    z: '海报级视觉层级，主体醒目，文字区域预留干净',
    e: 'poster-grade visual hierarchy, strong focal point, clean typography-safe space',
  },
  product: {
    z: '商业棚拍质感，背景干净，产品边缘锐利',
    e: 'commercial studio quality, clean background, sharp product edges',
  },
  portrait: {
    z: '杂志人像质感，皮肤纹理真实，眼神焦点清晰',
    e: 'editorial portrait quality, real skin texture, clear eye focus',
  },
  anime: {
    z: '专业动画设定稿质感，线条干净，色块层次清晰',
    e: 'professional anime key art quality, clean linework, clear color blocks',
  },
  cinematic: {
    z: '电影剧照质感，叙事张力明确，画面有时间感',
    e: 'cinematic film still quality, clear narrative tension, sense of time',
  },
  logo: {
    z: '极简品牌标识，轮廓强，缩小后仍可识别',
    e: 'minimal brand mark, strong silhouette, readable at small sizes',
  },
  interior: {
    z: '建筑摄影质感，垂直线校正，材质真实',
    e: 'architectural photography quality, corrected verticals, authentic materials',
  },
  raw: { z: '', e: '' },
}

const modeTags: Record<EnhanceMode, BilingualText> = {
  balanced: {
    z: '保持原始主题不变，补齐画面信息，整体自然可信',
    e: 'keep the original subject unchanged, complete visual information, natural and credible',
  },
  faithful: {
    z: '严格保留原始主体、动作与数量，不添加无关元素',
    e: 'strictly preserve original subject, action, and count, no unrelated additions',
  },
  commercial: {
    z: '可交付商业成片，主体干净，背景克制，细节高级',
    e: 'delivery-ready commercial finish, clean subject, restrained background, premium detail',
  },
  cinematic: {
    z: '电影镜头语言，明确光源方向，画面带叙事悬念',
    e: 'cinematic camera language, clear light direction, narrative suspense',
  },
  experimental: {
    z: '大胆视觉实验，构图更具张力，色彩关系更鲜明',
    e: 'bold visual experiment, more tension in composition, stronger color relationships',
  },
}

const intentTags: Record<EnhanceIntent, BilingualText> = {
  create: {
    z: '从文字直接生成完整画面，主体、环境、光线与风格统一',
    e: 'generate a complete image from text, with unified subject, environment, lighting, and style',
  },
  edit: {
    z: 'P图改图任务：严格保留原图主体身份、姿态、透视和构图，只修改用户指定内容，新增区域与原图边缘自然融合',
    e: 'image editing task: strictly preserve the original subject identity, pose, perspective, and composition, change only the requested content, blend new areas naturally with original edges',
  },
  retouch: {
    z: '修图任务：保持原图结构不变，优化曝光、色温、对比、皮肤或材质细节，效果自然不过度',
    e: 'retouching task: keep original structure unchanged, improve exposure, color temperature, contrast, skin or material details, natural and not overprocessed',
  },
  product: {
    z: '产品图任务：商品轮廓清晰，材质真实，背景干净，反光受控，适合电商或品牌展示',
    e: 'product image task: clear product silhouette, authentic material, clean background, controlled reflections, suitable for e-commerce or brand display',
  },
  poster: {
    z: '海报任务：主体醒目，视觉层级清楚，预留标题与信息区域，版式具有传播感',
    e: 'poster task: strong focal subject, clear hierarchy, reserved title and copy area, layout with campaign impact',
  },
  portrait: {
    z: '人物任务：身份特征稳定，脸部比例自然，服装和姿态合理，保留真实皮肤纹理',
    e: 'portrait task: stable identity features, natural facial proportions, reasonable clothing and pose, preserve real skin texture',
  },
  logo: {
    z: 'Logo任务：扁平图形标识，轮廓简洁，负形清楚，不生成真实照片、复杂背景或多余文字',
    e: 'logo task: flat graphic mark, simple silhouette, clear negative space, no realistic photo, complex background, or extra text',
  },
}

const stabilityTags: Record<LanguageMode, string> = {
  zh: '主体边缘干净，结构稳定，避免水印、乱码文字、畸形细节',
  en: 'clean subject edges, stable structure, avoid watermark, garbled text, distorted details',
}

const directorTags: Record<EnhanceIntent, BilingualText> = {
  create: {
    z: '画面以一个清晰主视觉为核心，背景信息服务主体，不喧宾夺主',
    e: 'one clear hero visual, background information supports the subject without stealing focus',
  },
  edit: {
    z: '只改变用户要求的区域，原图未提及区域保持不变，边缘、阴影、透视自然衔接',
    e: 'change only the requested area, keep all unspecified regions unchanged, match edges, shadows, and perspective naturally',
  },
  retouch: {
    z: '修饰幅度自然克制，保留真实纹理，不改变身份、结构和构图',
    e: 'natural restrained retouching, preserve real texture, do not change identity, structure, or composition',
  },
  product: {
    z: '商品信息优先，轮廓、比例、材质、反光与品牌调性全部可交付',
    e: 'product information first, deliverable silhouette, proportion, material, reflection, and brand tone',
  },
  poster: {
    z: '强化标题区、主体区、留白区的层级关系，适合后期加字与传播',
    e: 'strengthen title zone, subject zone, and negative-space hierarchy for copy placement and campaign use',
  },
  portrait: {
    z: '五官比例自然，身份特征稳定，服装、姿态、表情与光线统一',
    e: 'natural facial proportions, stable identity features, clothing, pose, expression, and lighting aligned',
  },
  logo: {
    z: '保持纯图形标识逻辑，强轮廓、少元素、可缩放，不做真实摄影或复杂场景',
    e: 'pure graphic mark logic, strong silhouette, few elements, scalable, no realistic photo or complex scene',
  },
}

const finishTags: Record<EnhanceMode, BilingualText> = {
  balanced: {
    z: '输出应像完整成片，而不是关键词堆叠',
    e: 'the result should feel like a finished image, not a keyword pile',
  },
  faithful: {
    z: '所有新增描述都必须服务原始语义，不改变主体数量、动作和核心关系',
    e: 'all additions must serve the original meaning without changing subject count, action, or core relationships',
  },
  commercial: {
    z: '画面干净、可用于封面或商品详情页，边缘锐利、噪点低、背景可控',
    e: 'clean enough for cover or product detail use, sharp edges, low noise, controlled background',
  },
  cinematic: {
    z: '镜头具有时间感和场面调度，光源、人物或物体运动方向明确',
    e: 'camera has a sense of time and staging, with clear light source and movement direction',
  },
  experimental: {
    z: '创意变化要有视觉逻辑，保持主色、形状和空间关系的可读性',
    e: 'creative variation must have visual logic while keeping color, shape, and spatial relationships readable',
  },
}

const rescueTags: Record<LanguageMode, string> = {
  zh: '先保证主体识别、画面主次、光源方向和透视一致，再增加装饰细节',
  en: 'prioritize subject recognition, visual hierarchy, light direction, and perspective consistency before adding decorative detail',
}

function promptContainsAny(prompt: string, keywords: string[]): boolean {
  const lower = prompt.toLowerCase()
  return keywords.some((kw) => lower.includes(kw.toLowerCase()))
}

function isChinese(prompt: string): boolean {
  const cjk = prompt.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  const total = prompt.replace(/\s/g, '').length || 1
  return cjk / total > 0.25
}

function toSK(s: string): SK {
  if (['person', 'animal', 'landscape', 'object', 'abstract', 'architecture', 'food'].includes(s)) return s as SK
  return 'general'
}

function toDim(d: EnhanceDimension): Dim {
  return d as Dim
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getDimensionLabel(dim: EnhanceDimension): string {
  return enhanceDimensions.find((d) => d.id === dim)?.label ?? dim
}

function stateFromScore(score: number): MetricState {
  if (score >= 78) return 'strong'
  if (score >= 42) return 'weak'
  return 'missing'
}

function measureLengthScore(length: number): number {
  if (length < 8) return 8
  if (length < 24) return 45
  if (length < 80) return 72
  if (length < 260) return 92
  if (length < 620) return 86
  return 62
}

function uniqueParts(parts: string[], source: string): string[] {
  const lowerSource = source.toLowerCase()
  const seen = new Set<string>()
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const key = part.toLowerCase()
      if (seen.has(key) || lowerSource.includes(key)) return false
      seen.add(key)
      return true
    })
}

function joinPrompt(trimmed: string, addedParts: string[], language: LanguageMode): string {
  const clean = trimmed.replace(/[，,\s]+$/g, '')
  const separator = language === 'zh' ? '，' : ', '
  return [clean, ...addedParts].join(separator)
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

function summarizeResult(dimensions: EnhanceDimension[], mode: EnhanceMode, intent: EnhanceIntent, before: number, after: number): string {
  const dimText = dimensions.slice(0, 3).map(getDimensionLabel).join('、')
  const scoreText = after > before ? `${before}→${after}` : `${after}`
  if (dimText) return `${enhanceIntentMeta[intent].label} · ${enhanceModeMeta[mode].label} · ${dimText} · ${scoreText}`
  return `${enhanceIntentMeta[intent].label} · ${enhanceModeMeta[mode].label} · ${scoreText}`
}

export function inferEnhanceIntent(style: ImageStyle, hasReferenceImages = false): EnhanceIntent {
  if (hasReferenceImages) return 'edit'
  return recommendedIntentFor(style)
}

export function analyzePrompt(prompt: string, style: ImageStyle = 'raw'): PromptAnalysis {
  const trimmed = prompt.trim()
  const subjectType = detectSubjectType(trimmed)
  const present = new Set<EnhanceDimension>()

  for (const dim of enhanceDimensions) {
    if (promptContainsAny(trimmed, keywordMap[dim.id])) present.add(dim.id)
  }

  const priority = subjectDimensionPriority[subjectType] ?? subjectDimensionPriority.general
  const missing = priority.filter((d) => !present.has(d))
  const language: LanguageMode = isChinese(trimmed) ? 'zh' : 'en'
  const lengthScore = measureLengthScore(trimmed.length)
  const dimensionScore = Math.round((present.size / enhanceDimensions.length) * 100)
  const subjectScore = subjectType === 'general' ? (trimmed.length >= 12 ? 55 : 28) : 88
  const hasQualityControl = promptContainsAny(trimmed, qualityKeywords)
  const hasStructureControl = promptContainsAny(trimmed, structureKeywords)
  const controlScore = present.has('composition') && present.has('lighting')
    ? (hasStructureControl ? 94 : 86)
    : present.has('composition') || present.has('lighting')
      ? (hasStructureControl ? 72 : 62)
      : (hasStructureControl ? 48 : 32)
  const finishScore = clamp(
    Math.round(
      (hasQualityControl ? 82 : 42)
      + (present.has('material') ? 8 : 0)
      + (present.has('lens') ? 6 : 0)
      + (trimmed.length >= 80 ? 4 : 0),
    ),
    0,
    100,
  )
  const score = clamp(
    Math.round(lengthScore * 0.2 + dimensionScore * 0.28 + subjectScore * 0.18 + controlScore * 0.2 + finishScore * 0.14),
    0,
    100,
  )
  const metrics: PromptMetric[] = [
    {
      id: 'clarity',
      label: '清晰度',
      score: lengthScore,
      state: stateFromScore(lengthScore),
      hint: trimmed.length < 24 ? '主体、动作或场景还偏短' : '表达长度合适',
    },
    {
      id: 'visual',
      label: '画面维度',
      score: dimensionScore,
      state: stateFromScore(dimensionScore),
      hint: missing.length ? `缺 ${missing.slice(0, 2).map(getDimensionLabel).join('、')}` : '关键维度完整',
    },
    {
      id: 'subject',
      label: '主体识别',
      score: subjectScore,
      state: stateFromScore(subjectScore),
      hint: subjectLabels[subjectType] ?? '通用',
    },
    {
      id: 'control',
      label: '可控性',
      score: controlScore,
      state: stateFromScore(controlScore),
      hint: controlScore >= 78 ? '光位与构图约束明确' : '建议补光位或构图',
    },
    {
      id: 'finish',
      label: '成片度',
      score: finishScore,
      state: stateFromScore(finishScore),
      hint: hasQualityControl ? '质量边界明确' : '建议补质量与排除项',
    },
  ]
  const strengths = [
    subjectType !== 'general' ? `${subjectLabels[subjectType]}主体` : '',
    ...Array.from(present).slice(0, 3).map(getDimensionLabel),
    hasQualityControl ? '质量控制' : '',
  ].filter(Boolean)
  const issues = [
    trimmed.length < 8 ? '提示词过短，生成稳定性偏低' : '',
    missing.length ? `优先补 ${missing.slice(0, 3).map(getDimensionLabel).join('、')}` : '',
    score < 60 ? '画面约束不足，模型会自由发挥' : '',
    !hasQualityControl ? '缺少质量、边缘、文字、水印等成片约束' : '',
    trimmed.length > 620 ? '提示词偏长，建议收紧层级' : '',
  ].filter(Boolean)
  const recommendedLevel: EnhanceLevel = score < 52 ? 'heavy' : score < 76 ? 'standard' : 'light'

  return {
    present,
    missing,
    subjectType,
    subjectLabel: subjectLabels[subjectType] ?? subjectLabels.general,
    suggestedOrder: priority,
    score,
    language,
    metrics,
    strengths,
    issues,
    recommendedLevel,
    recommendedMode: recommendedModeFor(style),
    recommendedIntent: recommendedIntentFor(style),
  }
}

export function pickDimensionsForLevel(
  missing: EnhanceDimension[],
  level: EnhanceLevel,
): EnhanceDimension[] {
  if (level === 'light') return missing.slice(0, 2)
  if (level === 'standard') return missing.slice(0, 4)
  return missing.slice()
}

export function enhancePrompt(
  prompt: string,
  style: ImageStyle,
  level: EnhanceLevel,
  targetDimensions?: EnhanceDimension[],
  mode: EnhanceMode = recommendedModeFor(style),
  intent: EnhanceIntent = recommendedIntentFor(style),
): EnhanceResult {
  const trimmed = prompt.trim()
  if (!trimmed) {
    return {
      enhanced: '',
      addedParts: [],
      dimensions: [],
      dimensionLabels: [],
      level,
      mode,
      intent,
      original: prompt,
      scoreBefore: 0,
      scoreAfter: 0,
      summary: '',
    }
  }

  const analysis = analyzePrompt(trimmed, style)
  const dims = targetDimensions?.length
    ? targetDimensions
    : pickDimensionsForLevel(analysis.missing, level)
  const sk = toSK(analysis.subjectType)
  const addedParts: string[] = []

  for (const dim of dims) {
    const phrase = getVocab(toDim(dim), sk, analysis.language === 'zh', `${trimmed}|${style}|${level}|${mode}|${intent}|${dim}`)
    if (phrase) addedParts.push(phrase)
  }

  if (level !== 'light') {
    const styleTag = styleQualityTag[style][analysis.language === 'zh' ? 'z' : 'e']
    if (styleTag) addedParts.push(styleTag)
  }

  if (level === 'standard' || level === 'heavy' || mode !== 'balanced') {
    addedParts.push(modeTags[mode][analysis.language === 'zh' ? 'z' : 'e'])
  }

  if (level !== 'light') {
    addedParts.push(directorTags[intent][analysis.language === 'zh' ? 'z' : 'e'])
    addedParts.push(finishTags[mode][analysis.language === 'zh' ? 'z' : 'e'])
  }

  addedParts.push(intentTags[intent][analysis.language === 'zh' ? 'z' : 'e'])

  if (analysis.score < 58 || level === 'heavy') {
    addedParts.push(rescueTags[analysis.language])
  }

  if (level === 'heavy') {
    addedParts.push(stabilityTags[analysis.language])
  }

  const cleanParts = uniqueParts(addedParts, trimmed)
  const enhanced = cleanParts.length ? joinPrompt(trimmed, cleanParts, analysis.language) : trimmed
  const nextAnalysis = analyzePrompt(enhanced, style)

  return {
    enhanced,
    addedParts: cleanParts,
    dimensions: dims,
    dimensionLabels: dims.map(getDimensionLabel),
    level,
    mode,
    intent,
    original: prompt,
    scoreBefore: analysis.score,
    scoreAfter: nextAnalysis.score,
    summary: summarizeResult(dims, mode, intent, analysis.score, nextAnalysis.score),
  }
}

export function enhanceSingleDimension(
  prompt: string,
  style: ImageStyle,
  dimension: EnhanceDimension,
  mode: EnhanceMode = recommendedModeFor(style),
  intent: EnhanceIntent = recommendedIntentFor(style),
): EnhanceResult {
  return enhancePrompt(prompt, style, 'light', [dimension], mode, intent)
}

export function createPromptVariants(
  prompt: string,
  style: ImageStyle,
  mode: EnhanceMode = recommendedModeFor(style),
  intent: EnhanceIntent = recommendedIntentFor(style),
): PromptVariant[] {
  const analysis = analyzePrompt(prompt, style)
  const candidates: PromptVariant[] = [
    {
      id: 'recommended',
      label: '智能推荐',
      hint: `${enhanceIntentMeta[intent].label} · ${enhanceLevelMeta[analysis.recommendedLevel].label}`,
      result: enhancePrompt(prompt, style, analysis.recommendedLevel, undefined, mode, intent),
    },
    {
      id: 'faithful',
      label: '精准保真',
      hint: '少发挥',
      result: enhancePrompt(prompt, style, 'light', undefined, 'faithful', intent),
    },
    {
      id: 'delivery',
      label: '成片交付',
      hint: '商业完成度',
      result: enhancePrompt(prompt, style, 'standard', undefined, 'commercial', intent),
    },
    {
      id: 'impact',
      label: style === 'cinematic' ? '电影调度' : '视觉冲击',
      hint: style === 'cinematic' ? '叙事增强' : '更强画面',
      result: enhancePrompt(prompt, style, 'heavy', undefined, style === 'cinematic' ? 'cinematic' : mode, intent),
    },
    {
      id: 'bold',
      label: '创意探索',
      hint: '大胆但可控',
      result: enhancePrompt(prompt, style, 'heavy', undefined, 'experimental', intent),
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

export function undoEnhance(result: EnhanceResult): string {
  return result.original
}

export function getMissingLabel(missing: EnhanceDimension[]): string {
  if (!missing.length) return '提示词已很完整'
  const labels = missing.slice(0, 3).map(getDimensionLabel)
  const suffix = missing.length > 3 ? `等${missing.length}项` : ''
  return `可补充：${labels.join('、')}${suffix}`
}
