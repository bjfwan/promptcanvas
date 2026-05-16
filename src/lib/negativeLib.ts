import type { ImageStyle } from '../types'
import type { LanguageMode, SubjectKind } from './promptDoc'

const universalNegativesEN = [
  'watermark',
  'signature',
  'text artifacts',
  'garbled text',
  'low quality',
  'blurry',
  'jpeg artifacts',
  'oversaturated',
  'banding',
]

const universalNegativesZH = [
  '水印',
  '签名',
  '错误文字',
  '乱码',
  '低清晰度',
  '模糊',
  '画面噪点',
  '色彩溢出',
  '色阶断层',
]

const subjectNegativesEN: Record<SubjectKind, string[]> = {
  person: [
    'extra fingers',
    'mutated hands',
    'distorted face',
    'plastic skin',
    'doll-like eyes',
    'asymmetric eyes',
    'over-smoothed skin',
  ],
  animal: ['extra limbs', 'malformed eyes', 'fused fur', 'plastic fur'],
  landscape: ['floating objects', 'broken horizon', 'cardboard sky'],
  object: ['warped geometry', 'rainbow chromatic aberration', 'cluttered background'],
  abstract: ['muddy gradients', 'jpeg banding'],
  architecture: ['warped verticals', 'impossible perspective', 'fish-eye distortion'],
  food: ['plastic food', 'oversaturated colors', 'unappetizing texture'],
  general: [],
}

const subjectNegativesZH: Record<SubjectKind, string[]> = {
  person: ['多指', '畸形手', '脸部畸变', '塑料皮肤', '玩偶眼神', '左右眼不对称', '过度磨皮'],
  animal: ['多余肢体', '畸形眼睛', '毛发糊一团', '塑料毛发'],
  landscape: ['漂浮元素', '断裂地平线', '纸板感天空'],
  object: ['形变', '彩虹色差', '杂乱背景'],
  abstract: ['脏渐变', '色阶断层'],
  architecture: ['垂直线歪斜', '不可能透视', '鱼眼畸变'],
  food: ['塑料感食物', '色彩溢出', '反胃质感'],
  general: [],
}

const styleNegativesEN: Partial<Record<ImageStyle, string[]>> = {
  natural: ['HDR effect', 'plastic skin', 'studio polish'],
  poster: ['cluttered layout', 'decorative noise'],
  product: ['rainbow reflections', 'plastic glare', 'busy background'],
  portrait: ['airbrushed plastic skin', 'over-smoothing'],
  anime: ['photorealistic blending', 'muddy colors'],
  cinematic: ['flat lighting', 'video quality'],
  logo: ['photo', 'gradient', 'drop shadow', 'glow', 'realistic texture', 'extra text'],
  interior: ['CG plastic surfaces', 'fish-eye distortion'],
  raw: [],
}

const styleNegativesZH: Partial<Record<ImageStyle, string[]>> = {
  natural: ['HDR 效果', '塑料皮肤', '过度棚拍感'],
  poster: ['版面杂乱', '装饰噪点'],
  product: ['彩虹反光', '塑料反光', '杂乱背景'],
  portrait: ['磨皮塑料感', '过度光滑'],
  anime: ['照片级混合', '脏色'],
  cinematic: ['平光', '视频质感'],
  logo: ['真实照片', '渐变', '投影', '发光', '写实纹理', '多余文字'],
  interior: ['CG 塑料感表面', '鱼眼畸变'],
  raw: [],
}

function joinList(values: string[], lang: LanguageMode): string {
  if (!values.length) return ''
  return values.join(lang === 'zh' ? '、' : ', ')
}

export interface DerivedNegativeOptions {
  style: ImageStyle
  subject: SubjectKind
  language: LanguageMode
  userNegative?: string
}

export function deriveNegativePrompt(options: DerivedNegativeOptions): string {
  const lang = options.language
  const universal = lang === 'zh' ? universalNegativesZH : universalNegativesEN
  const subjectList = lang === 'zh' ? subjectNegativesZH[options.subject] : subjectNegativesEN[options.subject]
  const styleMap = lang === 'zh' ? styleNegativesZH : styleNegativesEN
  const styleList = styleMap[options.style] ?? []
  const merged = [...universal, ...(subjectList ?? []), ...styleList]
  const seen = new Set<string>()
  const dedup = merged.filter((item) => {
    const key = item.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const userPart = (options.userNegative ?? '').trim()
  if (userPart) {
    dedup.unshift(userPart)
  }
  return joinList(dedup, lang)
}
