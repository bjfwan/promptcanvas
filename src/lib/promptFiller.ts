import type { ImageQuality, ImageStyle } from '../types'
import { pickCameraRecipe } from './cameraLookbook'
import { getVocab, type Dim, type SK } from './enhanceVocab'
import type {
  EnhanceIntent,
  EnhanceMode,
  LanguageMode,
  PromptContext,
  PromptDoc,
  Slot,
  SlotName,
  SubjectKind,
} from './promptDoc'

interface FillerArgs {
  doc: PromptDoc
  slot: SlotName
  mode: EnhanceMode
  context?: PromptContext
  seed?: string
}

const styleAnchorByStyle: Record<ImageStyle, { z: string; e: string }> = {
  natural: {
    z: '纪实摄影质感，自然色彩还原，细节克制',
    e: 'documentary photography feel, natural color rendering, restrained detail',
  },
  poster: {
    z: '海报级视觉层级，强焦点，标题区留白干净',
    e: 'poster-grade visual hierarchy, strong focal point, clean title-safe negative space',
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
    z: '现代日式 cel-shaded 设定稿，线条干净，色块层次清楚',
    e: 'modern Japanese cel-shaded key art, clean linework, clear color blocks',
  },
  cinematic: {
    z: '电影剧照质感，叙事张力明确，画面有时间感',
    e: 'cinematic film still, clear narrative tension, sense of time',
  },
  logo: {
    z: '极简扁平图形标识，强轮廓，缩小可识别',
    e: 'minimal flat graphic mark, strong silhouette, scalable',
  },
  interior: {
    z: '建筑摄影质感，垂直校正，材质真实',
    e: 'architectural photography feel, corrected verticals, authentic materials',
  },
  raw: {
    z: '',
    e: '',
  },
}

const compositionByAspect: Record<'1:1' | '2:3' | '3:2', { z: string; e: string }> = {
  '1:1': {
    z: '方图均衡构图，主体居中或三分法偏中',
    e: 'square balanced composition, subject centered or rule-of-thirds-centric',
  },
  '2:3': {
    z: '竖版海报构图，主体落在画面上 1/3，下方留白预留信息',
    e: 'vertical poster composition, hero subject in upper third, copy room below',
  },
  '3:2': {
    z: '横版宽屏构图，三分法 + 引导线，留出大气透视',
    e: 'wide cinematic composition, rule of thirds with leading lines, room for aerial perspective',
  },
}

const moodByIntent: Record<EnhanceIntent, { z: string; e: string }> = {
  create: {
    z: '画面情绪明确，主体与环境形成关系',
    e: 'clear emotional tone, relationship between subject and environment',
  },
  edit: {
    z: '保留原图情绪，仅替换被指定区域',
    e: 'preserve original mood, only swap the specified region',
  },
  retouch: {
    z: '修饰自然克制，不改变情绪基调',
    e: 'natural restrained retouch, mood preserved',
  },
  product: {
    z: '克制高级，仪式感与可读性并存',
    e: 'refined and premium, ritualistic yet readable',
  },
  poster: {
    z: '强烈氛围引导观众视线落在主体',
    e: 'strong mood guiding the eye to the hero subject',
  },
  portrait: {
    z: '人物神情松弛，与画面情绪一致',
    e: 'relaxed expression aligned with overall mood',
  },
  logo: {
    z: '中性现代，去叙事化，仅传达品牌识别',
    e: 'neutral modern feel, narrative-free, brand recognition only',
  },
}

const paletteByModeZh: Record<EnhanceMode, string> = {
  balanced: '克制双色调，主色与点缀色和谐',
  faithful: '与原描述色彩一致，不引入新色',
  commercial: '低饱和高级感，主色不超过三种',
  cinematic: '青橙双色调，明度层次分明',
  experimental: '大胆撞色，但保留可读色块边界',
}

const paletteByModeEn: Record<EnhanceMode, string> = {
  balanced: 'controlled dual-tone, primary and accent in harmony',
  faithful: 'palette consistent with the original description, no new hues',
  commercial: 'desaturated premium look, no more than three dominant colors',
  cinematic: 'teal-and-amber duotone, clear lightness layering',
  experimental: 'bold clashing colors with readable color-block boundaries',
}

const subjectFallbackZH: Record<SubjectKind, string> = {
  person: '一个具有清晰身份特征的人物，姿态自然',
  animal: '一只动物，姿态自然',
  landscape: '一处自然或人造景观，主体景物明确',
  object: '一个清晰的核心物体，作为画面主角',
  abstract: '一组抽象几何形状或图案',
  architecture: '一座建筑或室内空间，结构清晰',
  food: '一道食物或饮品，作为画面焦点',
  general: '一个清晰的核心主体',
}

const subjectFallbackEN: Record<SubjectKind, string> = {
  person: 'a person with clear identity features, natural posture',
  animal: 'an animal in a natural posture',
  landscape: 'a natural or man-made scene with a clear focal landform',
  object: 'a single hero object at the visual center',
  abstract: 'a set of abstract geometric shapes or patterns',
  architecture: 'a building or interior space with clear structure',
  food: 'a dish or beverage as the visual focus',
  general: 'a single clear hero subject',
}

function toSK(subject: SubjectKind): SK {
  if (subject === 'general') return 'general'
  return subject
}

function pickFromVocab(slot: SlotName, doc: PromptDoc, seed: string): string | undefined {
  const dim = slotToDim(slot)
  if (!dim) return undefined
  return getVocab(dim, toSK(doc.meta.subjectType), doc.meta.language === 'zh', seed)
}

function slotToDim(slot: SlotName): Dim | undefined {
  switch (slot) {
    case 'lighting':
      return 'lighting'
    case 'palette':
      return 'color'
    case 'composition':
      return 'composition'
    case 'material':
      return 'material'
    case 'mood':
      return 'atmosphere'
    case 'camera':
      return 'lens'
    default:
      return undefined
  }
}

function brandHint(slot: SlotName, context?: PromptContext): string | undefined {
  const brand = context?.brand
  if (!brand?.enabled) return undefined
  if (slot === 'palette') return brand.signaturePalette.trim() || undefined
  if (slot === 'camera') return brand.signatureCamera.trim() || undefined
  if (slot === 'lighting') return brand.signatureLighting.trim() || undefined
  return undefined
}

function sessionHint(slot: SlotName, context?: PromptContext): string | undefined {
  const session = context?.session
  if (!session || session.sampleSize < 2) return undefined
  if (slot === 'camera' && session.preferredFocalLengths.length) {
    return session.preferredFocalLengths[0]
  }
  if (slot === 'palette' && session.preferredColorTones.length) {
    return session.preferredColorTones[0]
  }
  return undefined
}

function continuationHint(slot: SlotName, context?: PromptContext): string | undefined {
  const cont = context?.continuation
  if (!cont) return undefined
  return cont.slots[slot]?.value
}

export function fillSlot(args: FillerArgs): Slot | null {
  const { doc, slot, mode, context, seed = '' } = args
  const lang = doc.meta.language

  const fromContinuation = continuationHint(slot, context)
  if (fromContinuation) {
    return { value: fromContinuation, source: 'continuation', confidence: 0.92 }
  }

  const fromBrand = brandHint(slot, context)
  if (fromBrand) {
    return { value: fromBrand, source: 'brand', confidence: 0.88 }
  }

  const fromSession = sessionHint(slot, context)
  if (fromSession) {
    return { value: fromSession, source: 'session', confidence: 0.7 }
  }

  if (slot === 'subject') {
    const fallback = lang === 'zh' ? subjectFallbackZH[doc.meta.subjectType] : subjectFallbackEN[doc.meta.subjectType]
    return { value: fallback, source: 'engine', confidence: 0.4 }
  }

  if (slot === 'styleAnchor') {
    const anchor = styleAnchorByStyle[doc.meta.styleId]
    const value = lang === 'zh' ? anchor.z : anchor.e
    if (!value) return null
    return { value, source: 'engine', confidence: 0.62 }
  }

  if (slot === 'composition') {
    const aspect = compositionByAspect[doc.meta.aspectRatio]
    const value = lang === 'zh' ? aspect.z : aspect.e
    return { value, source: 'engine', confidence: 0.65 }
  }

  if (slot === 'mood') {
    const value = lang === 'zh' ? moodByIntent[doc.meta.intent].z : moodByIntent[doc.meta.intent].e
    return { value, source: 'engine', confidence: 0.55 }
  }

  if (slot === 'palette') {
    const fromVocab = pickFromVocab(slot, doc, `${seed}|palette`)
    if (fromVocab) return { value: fromVocab, source: 'engine', confidence: 0.68 }
    const value = lang === 'zh' ? paletteByModeZh[mode] : paletteByModeEn[mode]
    return { value, source: 'engine', confidence: 0.6 }
  }

  if (slot === 'camera') {
    const recipe = pickCameraRecipe(doc.meta.intent, doc.meta.subjectType, lang, `${seed}|camera`)
    if (recipe) return { value: recipe, source: 'engine', confidence: 0.7 }
  }

  const vocabValue = pickFromVocab(slot, doc, `${seed}|${slot}`)
  if (vocabValue) {
    return { value: vocabValue, source: 'engine', confidence: 0.6 }
  }

  return null
}

export function qualityHints(quality: ImageQuality, language: LanguageMode): string {
  if (quality === 'high') {
    return language === 'zh'
      ? '编辑级精修，微观细节锐利，无 jpeg 噪点'
      : 'editorial-grade polish, sharp micro-detail, no jpeg artifacts'
  }
  if (quality === 'low') {
    return language === 'zh' ? '草稿质量，控制 token 预算' : 'draft-grade output, conservative token budget'
  }
  if (quality === 'medium') {
    return language === 'zh' ? '标准成片质量，轮廓干净' : 'standard finish, clean silhouette'
  }
  return ''
}
