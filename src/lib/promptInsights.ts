/**
 * Lightweight bilingual keyword detection on a free-form prompt.
 * Used to render visual chips so writers can see which "dimensions"
 * their prompt already covers and which are missing.
 *
 * The dimensions are intentionally aligned with the magic-enhance vocab:
 * subject / lighting / lens / composition / material / mood / palette.
 *
 * Pure regex matching, no LLM. Robust to mixed CN/EN sentences.
 */

export type InsightDim =
  | 'subject'
  | 'lighting'
  | 'lens'
  | 'composition'
  | 'material'
  | 'mood'
  | 'palette'

export interface InsightDimSpec {
  id: InsightDim
  label: string
  hint: string
  keywords: RegExp
  /** semantic color token: forest / accent / ochre / blueprint / sage */
  tone: 'forest' | 'accent' | 'ochre' | 'blueprint' | 'sage' | 'clay'
}

/**
 * NB: keep patterns case-insensitive and match Chinese fragments without word boundaries.
 * Patterns favour recall over precision — false positives are cheap, false negatives hurt UX.
 */
export const insightDims: InsightDimSpec[] = [
  {
    id: 'subject',
    label: '主体',
    hint: '画面里的人 / 物 / 景',
    tone: 'forest',
    keywords:
      /(人|女(性|生|孩)?|男(性|生|孩)?|孩子|动物|猫|狗|建筑|城市|街道|森林|海|山|花|食物|产品|瓶子|杯子|图标|logo|标志|界面|portrait|person|man|woman|character|cat|dog|animal|building|city|street|forest|ocean|mountain|food|product|bottle|cup|icon|logo)/i,
  },
  {
    id: 'lighting',
    label: '光线',
    hint: '主光、阴影、光质',
    tone: 'ochre',
    keywords:
      /(光线|侧光|逆光|顶光|轮廓光|柔光|硬光|高光|低光|窗光|阴影|hdr|ambient|sunset|sunrise|daylight|backlight|rim\s?light|softbox|natural\s?light|moon\s?light|key\s?light|fill\s?light|cinematic\s?light|golden\s?hour|blue\s?hour|chiaroscuro|spotlight|reflection)/i,
  },
  {
    id: 'lens',
    label: '镜头',
    hint: '焦段、视角、机位',
    tone: 'blueprint',
    keywords:
      /(\b\d{2,3}\s?mm\b|f\/\s?\d|焦段|焦距|镜头|广角|长焦|标准镜头|微距|特写|大光圈|景深|wide\s?angle|telephoto|macro|portrait\s?lens|close[- ]?up|bokeh|tilt[- ]?shift|fish\s?eye|dof|depth\s?of\s?field|aerial|low\s?angle|high\s?angle)/i,
  },
  {
    id: 'composition',
    label: '构图',
    hint: '取景、留白、视觉重心',
    tone: 'sage',
    keywords:
      /(三分法|对称|居中|留白|前景|纵深|斜对角|框架构图|引导线|对角线|视觉中心|negative\s?space|rule\s?of\s?thirds|symmetr|centered|composition|framing|leading\s?lines|foreground|midground|background|depth|perspective)/i,
  },
  {
    id: 'material',
    label: '材质',
    hint: '表面、质感、纹理',
    tone: 'clay',
    keywords:
      /(质感|材质|纹理|金属|玻璃|皮肤|毛发|皮革|木|大理石|混凝土|布料|羊绒|丝绸|陶|釉|颗粒|噪点|胶片颗粒|texture|material|metal|glass|wood|marble|concrete|fabric|silk|leather|skin|fur|grain|matte|glossy|reflective|translucent|film\s?grain)/i,
  },
  {
    id: 'mood',
    label: '氛围',
    hint: '情绪、气氛、叙事',
    tone: 'accent',
    keywords:
      /(氛围|情绪|安静|喧闹|孤独|温暖|冷峻|戏剧|奇幻|压抑|空灵|宁静|肃穆|轻盈|忧郁|怀旧|未来|赛博朋克|cyberpunk|dreamlike|ethereal|nostalgic|cinematic\s?mood|dramatic|melancholy|serene|mysterious|playful|surreal|futuristic|atmospheric|moody|romantic|tense|peaceful)/i,
  },
  {
    id: 'palette',
    label: '色彩',
    hint: '色调、配色、对比',
    tone: 'ochre',
    keywords:
      /(色调|配色|主色|双色调|冷暖|高饱和|低饱和|莫兰迪|大地色|青橙|monochrome|monotone|duotone|teal\s?and\s?orange|earth\s?tone|pastel|muted|vibrant|saturated|warm\s?palette|cool\s?palette|color\s?grading|complementary|analogous|navy|crimson|emerald|cream|charcoal)/i,
  },
]

export interface PromptInsight {
  dim: InsightDimSpec
  matched: boolean
}

export function analysePrompt(text: string): PromptInsight[] {
  const sample = text || ''
  return insightDims.map((dim) => ({
    dim,
    matched: dim.keywords.test(sample),
  }))
}

export function summariseInsights(text: string): {
  matched: number
  total: number
  missing: InsightDimSpec[]
} {
  const result = analysePrompt(text)
  const missing = result.filter((entry) => !entry.matched).map((entry) => entry.dim)
  return {
    matched: result.length - missing.length,
    total: result.length,
    missing,
  }
}
