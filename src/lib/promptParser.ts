import type { ImageQuality, ImageStyle } from '../types'
import { detectSubjectType } from './imagesApi'
import {
  aspectRatioFromSize,
  detectModelFamily,
  type EnhanceIntent,
  type LanguageMode,
  type PromptDoc,
  type Slot,
  type SlotName,
  type SubjectKind,
} from './promptDoc'

interface ParseInput {
  prompt: string
  style: ImageStyle
  size: string
  quality: ImageQuality
  intent: EnhanceIntent
  modelName?: string
  count?: number
}

const slotPatterns: Record<SlotName, RegExp[]> = {
  subject: [],
  action: [
    /(?:正在|站|坐|走|奔跑|跳跃|凝视|看向|抱着|举着|手持|戴着|穿着|斜倚|蹲|趴|跨)/,
    /\b(running|standing|sitting|walking|gazing|holding|wearing|kneeling|leaning|jumping|posing)\b/i,
  ],
  environment: [
    /(?:在|位于|背景是|场景是|窗外|室内|室外|街角|海边|山顶|森林|沙漠|城市|乡村|工作室|摄影棚|餐厅|厨房|客厅|卧室|月球|宇宙)/,
    /\b(indoor|outdoor|background|scene|street|forest|desert|studio|kitchen|bedroom|cafe|moon|space|in front of|behind)\b/i,
  ],
  lighting: [
    /(?:光|阴影|侧光|逆光|背光|柔光|硬光|顶光|环境光|自然光|日光|阳光|月光|霓虹|灯光|窗光|轮廓光|伦勃朗光|黄金时刻)/,
    /\b(lighting|light|backlit|backlight|rim ?light|key ?light|fill ?light|softbox|soft ?light|hard ?light|sunlight|moonlight|neon|golden hour|blue hour)\b/i,
  ],
  camera: [
    /(?:\d{1,3}\s*mm|f\/?\d|焦距|景深|长焦|广角|微距|镜头|视角|机位|俯拍|仰拍|平视|浅景深|大光圈|哈苏|徕卡|sony|canon|nikon|arri)/i,
    /\b(\d{1,3}\s*mm|f\/?\d|focal|depth of field|bokeh|telephoto|wide-?angle|macro|lens|tilt-?shift|hasselblad|leica|arri|sony|canon|nikon|fujifilm)\b/i,
  ],
  composition: [
    /(?:构图|三分|居中|对称|留白|前景|背景|纵深|层次|引导线|框架|裁切|特写|半身|全身|2:3|3:2|1:1|竖版|横版|方图)/,
    /\b(composition|framing|rule of thirds|symmetr|leading line|negative space|crop|close-?up|wide ?shot|medium ?shot|portrait orientation|landscape orientation|aspect ratio|2:3|3:2|1:1)\b/i,
  ],
  palette: [
    /(?:色调|配色|暖色|冷色|双色调|莫兰迪|低饱和|高饱和|红|橙|黄|绿|青|蓝|紫|粉|米白|奶白|焦糖|灰|金|银|铜|奶油|墨色|赭石|霓虹色)/,
    /\b(palette|color (?:scheme|grading)|warm tones|cool tones|monochrom\w*|teal[- ]and[- ]amber|pastel|vibrant|desaturated|muted)\b/i,
  ],
  material: [
    /(?:材质|纹理|质感|金属|玻璃|木|布|皮|石|丝|绒|亚麻|陶瓷|羊毛|棉|毛发|皮肤纹理|反光|高光|哑光|磨砂)/,
    /\b(material|texture|metal|glass|wood|leather|silk|velvet|linen|ceramic|wool|cotton|fur|skin texture|matte|glossy|sheen|reflection)\b/i,
  ],
  mood: [
    /(?:氛围|情绪|安静|宁静|温暖|冷峻|神秘|浪漫|紧张|戏剧|忧郁|怀旧|怀古|未来|赛博|科幻|优雅|朴素|庄重)/,
    /\b(mood|atmosphere|serene|tranquil|warm|cold|mysterious|romantic|tense|dramatic|melancholic|nostalgic|futuristic|elegant)\b/i,
  ],
  styleAnchor: [
    /(?:风格|质感|杂志|广告|海报|电影截图|cel-?shaded|赛璐璐|illustration|插画|手绘|油画|水彩|3d|blender|渲染|矢量|极简|包豪斯|新艺术)/i,
    /\b(style|in the style of|magazine|editorial|cinematic still|cel[- ]shaded|illustration|hand-?drawn|oil painting|watercolor|3d render|vector|minimalist|bauhaus|art nouveau)\b/i,
  ],
}

const cjkRegex = /[\u4e00-\u9fff]/g

const sentenceSeparator = /[。.！!？?；;\n]+/

const clauseSeparator = /[，,、]+/

function detectLanguage(prompt: string): LanguageMode {
  const cjk = prompt.match(cjkRegex)?.length ?? 0
  const total = prompt.replace(/\s/g, '').length || 1
  return cjk / total > 0.25 ? 'zh' : 'en'
}

function joinSeparator(lang: LanguageMode): string {
  return lang === 'zh' ? '，' : ', '
}

function splitClauses(prompt: string): string[] {
  return prompt
    .split(sentenceSeparator)
    .flatMap((sentence) => sentence.split(clauseSeparator))
    .map((clause) => clause.trim())
    .filter(Boolean)
}

function clauseMatches(clause: string, slot: SlotName): boolean {
  return slotPatterns[slot].some((pattern) => pattern.test(clause))
}

function classifyClause(clause: string): SlotName[] {
  const matched: SlotName[] = []
  for (const slot of Object.keys(slotPatterns) as SlotName[]) {
    if (slot === 'subject') continue
    if (clauseMatches(clause, slot)) matched.push(slot)
  }
  return matched
}

function inferSubjectClause(prompt: string, clauses: string[]): string {
  const first = clauses[0] ?? prompt.trim()
  if (!first) return prompt.trim()
  const tags = classifyClause(first)
  if (tags.length === 0) return first
  for (const clause of clauses) {
    const clauseTags = classifyClause(clause)
    if (clauseTags.length === 0) return clause
  }
  return first
}

function uniqueClauses(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const key = value.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function extractForbids(prompt: string): string[] {
  const forbids: string[] = []
  const zhMatches = prompt.match(/(?:避免|不要|禁止|不出现|去除|去掉)[^，。.；;\n]+/g)
  if (zhMatches) forbids.push(...zhMatches)
  const enMatches = prompt.match(/\b(?:no|without|avoid|never|exclude)[^,.;\n]+/gi)
  if (enMatches) forbids.push(...enMatches)
  return uniqueClauses(forbids)
}

function clauseHasForbid(clause: string): boolean {
  return /(?:避免|不要|禁止|不出现|去除|去掉)/.test(clause) || /\b(no|without|avoid|never|exclude)\b/i.test(clause)
}

function isLikelySubjectClause(clause: string): boolean {
  if (!clause) return false
  if (clauseHasForbid(clause)) return false
  return classifyClause(clause).length === 0
}

export function parsePrompt(input: ParseInput): PromptDoc {
  const raw = input.prompt
  const trimmed = raw.trim()
  const language = detectLanguage(trimmed)
  const subjectType = detectSubjectType(trimmed) as SubjectKind
  const aspectRatio = aspectRatioFromSize(input.size)
  const modelFamily = detectModelFamily(input.modelName)
  const clauses = splitClauses(trimmed)
  const slots: Partial<Record<SlotName, Slot>> = {}
  const slotBuckets: Record<SlotName, string[]> = {
    subject: [],
    action: [],
    environment: [],
    lighting: [],
    camera: [],
    composition: [],
    palette: [],
    material: [],
    mood: [],
    styleAnchor: [],
  }
  const subjectClauses: string[] = []

  for (const clause of clauses) {
    if (clauseHasForbid(clause)) continue
    const tags = classifyClause(clause)
    if (tags.length === 0) {
      if (isLikelySubjectClause(clause)) subjectClauses.push(clause)
      continue
    }
    for (const tag of tags) {
      slotBuckets[tag].push(clause)
    }
  }

  const subjectValue = subjectClauses.length
    ? subjectClauses.join(joinSeparator(language))
    : inferSubjectClause(trimmed, clauses)

  if (subjectValue) {
    slots.subject = { value: subjectValue, source: 'user', confidence: 0.78 }
  }

  for (const slot of Object.keys(slotBuckets) as SlotName[]) {
    if (slot === 'subject') continue
    const bucket = uniqueClauses(slotBuckets[slot])
    if (bucket.length) {
      slots[slot] = {
        value: bucket.join(joinSeparator(language)),
        source: 'user',
        confidence: 0.72,
      }
    }
  }

  return {
    raw: trimmed,
    slots,
    constraints: {
      preserve: [],
      change: [],
      forbid: extractForbids(trimmed),
    },
    meta: {
      language,
      subjectType,
      intent: input.intent,
      aspectRatio,
      quality: input.quality,
      styleId: input.style,
      modelFamily,
      count: input.count ?? 1,
    },
  }
}

export function missingSlots(doc: PromptDoc, required: SlotName[]): SlotName[] {
  return required.filter((slot) => !doc.slots[slot]?.value)
}

export const REQUIRED_SLOTS_BY_INTENT: Record<EnhanceIntent, SlotName[]> = {
  create: ['subject', 'environment', 'lighting', 'camera', 'composition', 'palette'],
  edit: ['subject', 'lighting', 'composition'],
  retouch: ['subject', 'lighting', 'palette', 'material'],
  product: ['subject', 'material', 'lighting', 'composition', 'palette'],
  poster: ['subject', 'composition', 'palette', 'styleAnchor'],
  portrait: ['subject', 'lighting', 'camera', 'mood', 'material'],
  logo: ['subject', 'composition', 'palette', 'styleAnchor'],
}

export function requiredSlotsFor(intent: EnhanceIntent): SlotName[] {
  return REQUIRED_SLOTS_BY_INTENT[intent] ?? REQUIRED_SLOTS_BY_INTENT.create
}
