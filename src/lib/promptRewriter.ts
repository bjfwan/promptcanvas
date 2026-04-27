import type { ImageSize, ImageStyle } from '../types'

export const SYSTEM_PROMPT = `你是一名世界级的图像提示词架构师 (image prompt architect)，专门为 OpenAI gpt-image-1、DALL·E、Flux 等顶级文生图模型撰写精确、可视化、可执行的提示词。

# 任务
用户会给你一段画面想法（可能短到只有几个字，也可能是一段描述），以及风格、画幅、张数等元信息。你要把它重写成一段结构清晰、视觉信息密集的最终提示词，直接交给图像模型。

# 输出格式（5 段固定，缺一不可，每段一行）
画面: <场景、时间、环境、氛围>
主体: <谁/什么是主角，正在做什么，处于什么状态>
关键细节: <材质、纹理、衣着、光线方向、镜头/视角、构图、色调、情绪>
用途: <editorial photo / product mockup / poster / UI mock / concept frame / character sheet / logo design 中选一个，要与风格匹配>
避免: <必须不出现的元素，如水印、错字、多余文字、畸形手指、卡通化、品牌字样等>

# 重写硬规则
1. 保留用户原意：用户描述的主体、动作、场景一律忠实保留；你只是补充视觉信息，不更换主题。
2. 视觉事实优先于空话：禁止使用"高清、超清、8K、惊艳、史诗、大师作品、ultra-detailed、masterpiece、award-winning、photoreal masterpiece"这类无视觉信息的词；改用具体的镜头、光线、材质语言。
3. 风格标签必须配视觉目标：不能只写"极简"，要补"奶油色背景 + 单一主体 + 大留白 + 衬线字体"。
4. 摄影类必须包含：镜头焦段（24mm 广角 / 35mm 纪实 / 50mm 标准 / 85mm 中焦）、光圈感（f/1.8 / f/2.8 / f/8）、光线（侧逆光 / 顶光 / 窗光 / 黄金时刻 / 霓虹冷暖对比）、景深（浅景深 / 全景深）。
5. 设计类必须包含：构图（居中 / 黄金分割 / 对称）、负空间留白比例、配色（最多三色，给具体色名如"米白 / 焦糖棕 / 墨黑"）、字体类型（衬线 / 无衬线 / 等宽）。
6. 语言一致：用户用中文 → 输出中文；用户用英文 → 输出英文。
7. 只输出 5 段提示词本身：不要解释、不要前缀（如"好的，以下是..."）、不要 markdown 标题、不要代码块、不要任何附加说明。
8. 总长度控制：中文 ≤ 320 字符 / 英文 ≤ 700 字符，避免过载。
9. 用户输入若已是结构化 5 段格式，做精简优化即可，不要二次膨胀。
10. 如果用户输入涉及真人姓名、品牌商标、违法或有害内容：保留主体描述但抽象化（如"一位中年男演员"代替具体名字），并在"避免"段补"不指向任何真实人物或注册商标"。

# 风格 → 视觉目标映射（用户选了对应风格时，按此优先填充关键细节）
- natural（自然写实）：35mm 纪实视角 / 自然光 / f/2.0 浅景深 / 真实色彩 / 避免塑料感
- poster（电影海报）：主视觉居中 / 大留白预留标题 / 双色调 / 衬线或粗体无衬线 / 印刷感
- product（产品摄影）：无缝纸背景 / 柔光箱主光 + 蜂窝反射补光 / 干净反光 / 中央构图占 60%
- portrait（人物肖像）：85mm 中焦 / f/1.8-2.0 浅景深 / 窗光主光 / 焦点锐利落在眼睛 / 保留毛孔细节
- anime（动画插画）：赛璐璐线稿 / 三色色块 / 干净轮廓 / 光影分明 / 避免线稿杂乱
- cinematic（电影镜头）：2.39:1 宽银幕 / 戏剧侧光 / 冷暖对比 / 35mm 镜头感 / 胶片颗粒
- logo（品牌标志）：纯白背景 / 单色或双色几何抽象 / 无渐变无阴影 / 线粗一致 / 32px 仍可辨识 / 不输出文字
- interior（室内空间）：24mm 广角不畸变 / 自然窗光 / 真实材质 / 居住痕迹 / 空间纵深

# 画幅 → 构图提示
- 1:1（方图）：中央构图，主体占画面 60-70%，四向留白均衡
- 2:3（竖图）：纵向构图，主体偏上 1/3 或居中，下方可留出标题/小字位置
- 3:2（横图）：横向构图，可用三分法，主体偏左或偏右，预留环境纵深

# 示例

[输入]
风格: cinematic
画幅: 3:2
用户画面想法: 一只猫

[输出]
画面: 雨后东亚都市深夜的旧巷，霓虹招牌在湿漉漉的青砖墙上投下冷光。
主体: 一只虎斑橘猫蹲坐在便利店门口的纸箱上，绿眼睛在霓虹倒影中清晰可见，尾巴轻轻摆动。
关键细节: 35mm 镜头，f/2.0 浅景深，侧后方暖橙霓虹与远处冷青蓝路灯形成冷暖对比，沥青地面有水洼反射光斑，空气中可见细密水雾，胶片颗粒与柔和色彩分级，2.39:1 宽银幕构图主体偏画面右侧。
用途: cinematic still / 电影截图。
避免: 卡通化、人脸特写、品牌字样、画面文字、水印、过度后期。

[输入]
风格: logo
画幅: 1:1
用户画面想法: 一个咖啡店的标志，叫"Slow Bean"

[输出]
画面: 纯白背景，单一图形居中。
主体: 一颗抽象咖啡豆与一缕极简蒸汽线条组合，蒸汽线在豆子上方绕成一个柔和的"S"轮廓。
关键细节: 单色深咖啡棕（#3B2412），无渐变无阴影，线条粗细一致 4pt，几何抽象，整体可缩小到 32×32 像素仍可辨识，预留下方 1/4 区域用于品牌字样但本图不输出文字。
用途: logo design / 品牌标志。
避免: 渐变、阴影、3D 立体感、写实咖啡杯、英文字母"Slow Bean"出现在图中、多色配色。`

const DEFAULT_REWRITE_TIMEOUT_MS = 20_000

export interface RewriteOptions {
  prompt: string
  style: ImageStyle
  size: ImageSize
  count: number
  negativePrompt?: string
  baseUrl: string
  apiKey: string
  model: string
  proxyUrl?: string
  timeoutMs?: number
  signal?: AbortSignal
}

export interface RewriteSuccess {
  ok: true
  rewrittenPrompt: string
  durationMs: number
  model: string
}

export interface RewriteFailure {
  ok: false
  reason: string
  code: 'INVALID_CONFIG' | 'TIMEOUT' | 'NETWORK' | 'UPSTREAM_ERROR' | 'EMPTY_RESPONSE' | 'ABORTED'
  durationMs: number
}

export type RewriteResult = RewriteSuccess | RewriteFailure

const SIZE_TO_ASPECT: Record<ImageSize, '1:1（方图）' | '2:3（竖图）' | '3:2（横图）'> = {
  '1024x1024': '1:1（方图）',
  '1024x1536': '2:3（竖图）',
  '1536x1024': '3:2（横图）',
}

function buildUserMessage(input: Pick<RewriteOptions, 'prompt' | 'style' | 'size' | 'count' | 'negativePrompt'>): string {
  const lines = [
    `风格: ${input.style}`,
    `画幅: ${SIZE_TO_ASPECT[input.size]}`,
    `张数: ${input.count}`,
  ]
  if (input.negativePrompt && input.negativePrompt.trim()) {
    lines.push(`用户已声明的避免要素: ${input.negativePrompt.trim()}`)
  }
  lines.push('', '用户画面想法:', input.prompt.trim())
  lines.push('', '请按系统说明的 5 段格式输出最终提示词，不要任何附加说明。')
  return lines.join('\n')
}

function buildRewriteRequest(baseUrl: string, proxyUrl: string, apiKey: string) {
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const cleanProxy = proxyUrl.trim().replace(/\/+$/, '')
  const path = '/chat/completions'
  if (cleanProxy) {
    return {
      url: `${cleanProxy}${path}`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Upstream-Base': cleanBase,
      } as Record<string, string>,
    }
  }
  return {
    url: `${cleanBase}${path}`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    } as Record<string, string>,
  }
}

function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const raw = payload as { choices?: Array<{ message?: { content?: unknown } }> }
  const message = raw.choices?.[0]?.message
  if (!message) return ''
  const content = message.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: unknown }).text
          return typeof text === 'string' ? text : ''
        }
        return ''
      })
      .filter(Boolean)
      .join('')
      .trim()
  }
  return ''
}

function sanitizeRewritten(raw: string): string {
  let text = raw.trim()
  text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim()
  text = text.replace(/^(好的|当然|没问题|以下是|这是|Sure|Here(?:'s|\s+is))[，,：:]?[\s\S]*?\n/i, '').trim()
  return text
}

export async function rewritePrompt(options: RewriteOptions): Promise<RewriteResult> {
  const start = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, '')
  const apiKey = options.apiKey.trim()
  const model = options.model.trim()
  const userPrompt = options.prompt.trim()

  if (!baseUrl || !apiKey || !model) {
    return {
      ok: false,
      reason: '改写服务商未完整配置（baseUrl / apiKey / model 必填）',
      code: 'INVALID_CONFIG',
      durationMs: 0,
    }
  }
  if (!userPrompt) {
    return {
      ok: false,
      reason: '提示词为空，无需改写',
      code: 'INVALID_CONFIG',
      durationMs: 0,
    }
  }

  const built = buildRewriteRequest(baseUrl, options.proxyUrl ?? '', apiKey)
  const userMessage = buildUserMessage({
    prompt: userPrompt,
    style: options.style,
    size: options.size,
    count: options.count,
    negativePrompt: options.negativePrompt,
  })

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 600,
    stream: false,
  }

  const controller = new AbortController()
  const externalSignal = options.signal
  if (externalSignal) {
    if (externalSignal.aborted) {
      return {
        ok: false,
        reason: '用户已取消改写',
        code: 'ABORTED',
        durationMs: 0,
      }
    }
    externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_REWRITE_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(built.url, {
      method: 'POST',
      headers: built.headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timer)
    const elapsed = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start)
    const err = error as Error
    if (err.name === 'AbortError') {
      if (externalSignal?.aborted) {
        return { ok: false, reason: '已取消', code: 'ABORTED', durationMs: elapsed }
      }
      return { ok: false, reason: `改写超时（>${Math.round(timeoutMs / 1000)}s）`, code: 'TIMEOUT', durationMs: elapsed }
    }
    return {
      ok: false,
      reason: err.message || '网络错误',
      code: 'NETWORK',
      durationMs: elapsed,
    }
  }
  clearTimeout(timer)

  const elapsed = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start)

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const text = await response.text()
      const parsed = text ? JSON.parse(text) : null
      const msg = parsed?.error?.message
      if (typeof msg === 'string' && msg) detail = `${detail} · ${msg}`
    } catch {
      // ignore
    }
    return {
      ok: false,
      reason: `改写服务返回错误：${detail}`,
      code: 'UPSTREAM_ERROR',
      durationMs: elapsed,
    }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return {
      ok: false,
      reason: '改写服务响应不是合法 JSON',
      code: 'UPSTREAM_ERROR',
      durationMs: elapsed,
    }
  }

  const rawContent = extractContent(payload)
  const cleaned = sanitizeRewritten(rawContent)

  if (!cleaned) {
    return {
      ok: false,
      reason: '改写服务返回空内容',
      code: 'EMPTY_RESPONSE',
      durationMs: elapsed,
    }
  }

  return {
    ok: true,
    rewrittenPrompt: cleaned,
    durationMs: elapsed,
    model,
  }
}
