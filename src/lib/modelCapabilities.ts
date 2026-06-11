import type { ResolutionTier } from '../types'

/**
 * 模型能力画像。
 *
 * 背景：OpenAI 兼容的 `/models` 接口**只返回模型 id**，规范里没有任何
 * "能力描述"字段——中转站不会告诉你某个模型最大支持多少分辨率、是否支持
 * 图生图、是否接受 mask。所以"凭 url+key 自动问出能力"在协议层面做不到，
 * 除非真的发一张图去试（会计费、会慢，本项目明确不做）。
 *
 * 因此能力检测分三层，可靠性递增：
 *   1. 关键词猜测（最弱，名字里没线索就漏判，如 `gpt-image-2-chat` 猜不出 4K）
 *   2. 已知能力表（本文件）——对常见模型族给出"中转站通常放行的尺度"
 *   3. 真实结果自学习（见 useResolutionSupport 的 learnFromGeneration）——
 *      用户真实生成时，成功的尺寸/能力会被永久解锁，被上游拒绝的会被锁定。
 *
 * 这张表刻意偏"中转站常见放行尺度"而非"模型论文里的原生分辨率"：
 * 大量中转站会在后端做超分/放大，gpt-image / flux / imagen 这类成熟图片模型
 * 在中转站普遍能出 2K，多数也放行 4K。命中表 → 直接点亮对应档；没命中 →
 * 退回关键词猜；任何一层猜错，自学习都会在第一次真实生成后纠正。
 */

export interface ModelCapability {
  /** 最高分辨率档。'4k' 蕴含 2K 与 1K 都可用。 */
  maxTier: ResolutionTier
  /** 是否支持 /images/edits（图生图 / 参考图）。 */
  supportsEdits: boolean
  /** 是否支持 inpaint mask（蒙版重绘）。需要 supportsEdits 为前提。 */
  supportsMask: boolean
  /** 上游能接受的输出格式。空数组表示"未知，按默认 png 处理"。 */
  outputFormats: Array<'png' | 'jpeg' | 'webp'>
  /** 是否接受 quality 参数（low/medium/high）。 */
  supportsQuality: boolean
}

/**
 * 一条规则：模型 id（小写）命中 `match` 中任意子串即套用 `capability`。
 * 顺序从具体到宽泛——先匹配 `seedream-4` 再匹配 `seedream`，命中即停。
 */
interface CapabilityRule {
  match: string[]
  capability: ModelCapability
}

const FULL_FORMATS: ModelCapability['outputFormats'] = ['png', 'jpeg', 'webp']

const CAPABILITY_RULES: CapabilityRule[] = [
  // ── 4K 档：明确以高分辨率著称，或名字直接带 4k/4096 ──
  {
    match: ['seedream-4', 'seedream4', 'seedream'],
    capability: {
      maxTier: '4k',
      supportsEdits: true,
      supportsMask: false,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
  {
    match: ['4k', '4096', 'ultra-hd', 'ultrahd'],
    capability: {
      maxTier: '4k',
      supportsEdits: true,
      supportsMask: false,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
  {
    // gpt-image 系列：OpenAI 原生 + 中转站普遍放大到 4K；支持 edits、mask、quality。
    match: ['gpt-image', 'gptimage'],
    capability: {
      maxTier: '4k',
      supportsEdits: true,
      supportsMask: true,
      outputFormats: FULL_FORMATS,
      supportsQuality: true,
    },
  },
  {
    // flux 全家（含 flux-pro / flux.1）：成熟图片模型，中转站普遍 2K，常放行 4K。
    match: ['flux'],
    capability: {
      maxTier: '4k',
      supportsEdits: true,
      supportsMask: true,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
  {
    match: ['imagen', 'imagen-3', 'imagen3'],
    capability: {
      maxTier: '4k',
      supportsEdits: true,
      supportsMask: false,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
  {
    match: ['ideogram'],
    capability: {
      maxTier: '4k',
      supportsEdits: true,
      supportsMask: true,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
  {
    match: ['recraft'],
    capability: {
      maxTier: '4k',
      supportsEdits: true,
      supportsMask: true,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
  // ── 2K 档：稳定支持 2K，4K 不确定（留给自学习去解锁）──
  {
    match: ['hidream'],
    capability: {
      maxTier: '2k',
      supportsEdits: true,
      supportsMask: false,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
  {
    match: ['qwen-image', 'qwen_image'],
    capability: {
      maxTier: '2k',
      supportsEdits: true,
      supportsMask: false,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
  {
    match: ['hunyuan-image', 'hunyuan_image'],
    capability: {
      maxTier: '2k',
      supportsEdits: true,
      supportsMask: false,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
  {
    match: ['nano-banana', 'nano_banana', 'nanobanana'],
    capability: {
      maxTier: '2k',
      supportsEdits: true,
      supportsMask: false,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
  {
    match: ['doubao', 'volcengine-image'],
    capability: {
      maxTier: '2k',
      supportsEdits: true,
      supportsMask: false,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
  {
    match: ['kolors'],
    capability: {
      maxTier: '2k',
      supportsEdits: true,
      supportsMask: false,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
  {
    match: ['glm-image', 'cogview', 'cog-view'],
    capability: {
      maxTier: '2k',
      supportsEdits: false,
      supportsMask: false,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
  {
    match: ['2k', '2048'],
    capability: {
      maxTier: '2k',
      supportsEdits: false,
      supportsMask: false,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
  // ── 1K 档：经典 SD 系 / DALL·E 2，原生最高 1024 ──
  {
    match: ['dall-e-2', 'dalle-2', 'dall-e-3', 'dalle-3'],
    capability: {
      maxTier: '1k',
      supportsEdits: true,
      supportsMask: true,
      outputFormats: ['png'],
      supportsQuality: true,
    },
  },
  {
    match: ['sdxl', 'sd-xl', 'stable-diffusion-xl'],
    capability: {
      maxTier: '1k',
      supportsEdits: true,
      supportsMask: true,
      outputFormats: FULL_FORMATS,
      supportsQuality: false,
    },
  },
]

const TIER_RANK: Record<ResolutionTier, number> = { '1k': 0, '2k': 1, '4k': 2 }

/** 取两个档位里更高的那个。 */
export function maxTier(a: ResolutionTier, b: ResolutionTier): ResolutionTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b
}

/** 查单个模型 id 的能力。命中能力表返回画像，未命中返回 null（交给关键词猜测兜底）。 */
export function lookupModelCapability(modelId: string): ModelCapability | null {
  const lower = modelId.toLowerCase()
  for (const rule of CAPABILITY_RULES) {
    if (rule.match.some((needle) => lower.includes(needle))) {
      return rule.capability
    }
  }
  return null
}

export interface AggregatedCapability {
  /** 该 provider 下所有模型里观察到的最高分辨率档。 */
  maxTier: ResolutionTier
  supports2k: boolean
  supports4k: boolean
  /** 任一模型支持图生图。 */
  supportsEdits: boolean
  /** 任一模型支持蒙版。 */
  supportsMask: boolean
  /** 所有命中模型支持的输出格式并集。 */
  outputFormats: Array<'png' | 'jpeg' | 'webp'>
  /** 任一模型接受 quality 参数。 */
  supportsQuality: boolean
  /** 命中能力表的模型数量（用于 UI 区分"已知"与"纯靠猜"）。 */
  knownModelCount: number
}

// 关键词兜底：能力表没命中时，沿用旧的纯名字猜测，避免比改造前更差。
const KEYWORD_TIER_4K = ['4k', '4096', 'seedream-4', 'seedream4', 'ultra-hd', 'ultrahd']
const KEYWORD_TIER_2K = [
  '2k',
  '2048',
  'seedream',
  'doubao',
  'hunyuan-image',
  'flux',
  'imagen',
  'ideogram',
  'recraft',
  'gpt-image',
  'hidream',
  'qwen-image',
  'nano-banana',
  'kolors',
]

/**
 * 聚合一批模型 id 的能力。能力表命中优先，未命中退回关键词猜测。
 * 这是连接测试后写入 detected 状态的数据源。
 */
export function aggregateCapabilities(models: string[]): AggregatedCapability {
  let tier: ResolutionTier = '1k'
  let supportsEdits = false
  let supportsMask = false
  let supportsQuality = false
  const formats = new Set<'png' | 'jpeg' | 'webp'>()
  let knownModelCount = 0

  for (const id of models) {
    const cap = lookupModelCapability(id)
    if (cap) {
      knownModelCount += 1
      tier = maxTier(tier, cap.maxTier)
      if (cap.supportsEdits) supportsEdits = true
      if (cap.supportsMask) supportsMask = true
      if (cap.supportsQuality) supportsQuality = true
      for (const fmt of cap.outputFormats) formats.add(fmt)
      continue
    }
    // 关键词兜底
    const lower = id.toLowerCase()
    if (KEYWORD_TIER_4K.some((h) => lower.includes(h))) tier = maxTier(tier, '4k')
    else if (KEYWORD_TIER_2K.some((h) => lower.includes(h))) tier = maxTier(tier, '2k')
  }

  const supports2k = TIER_RANK[tier] >= TIER_RANK['2k']
  const supports4k = TIER_RANK[tier] >= TIER_RANK['4k']

  return {
    maxTier: tier,
    supports2k,
    supports4k,
    supportsEdits,
    supportsMask,
    outputFormats: formats.size ? [...formats] : ['png'],
    supportsQuality,
    knownModelCount,
  }
}
