import type { GeneratedImage, GenerateImageRequest } from '../types'

export const allowedSizes: ReadonlySet<string> = new Set([
  '1024x1024',
  '1024x1536',
  '1536x1024',
])

export const allowedFormats: ReadonlySet<string> = new Set(['png', 'jpeg', 'webp'])

export const allowedQualities: ReadonlySet<string> = new Set([
  'auto',
  'low',
  'medium',
  'high',
])

export const mimeTypes: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

// 每条会在生图时作为「风格指引」并到用户提示词后面。
// 设计原则：具体镜头/光位/材质 + 明确 avoid 清单 + 适度中英混用以提高可识别性。
// raw = 空字符串：不拼接任何风格指引，原样发送用户提示词。
export const stylePrompts: Record<string, string> = {
  natural:
    '自然写实摄影 · 35mm f/2 真实日光，侧逆主光带方向性阴影，色彩真实但层次细腻；纪实候机式构图，主体浅景深锐利，背景自然虚化。Avoid: plastic skin, HDR look, over-saturation, posterized colors',
  poster:
    '编辑级海报排版 · 主视觉聚焦 + 30–40% 负空间留给标题区，受控2–3 色配色（其中一色作 accent），非对称平衡构图与明确视觉层次，印刷级对比度与色调深度。Avoid: cluttered layout, decorative noise, weak focal hierarchy',
  product:
    '高端商业产品摄影 · 100mm macro f/8，大柔光箱主光 + 反光板补光 + 轻微 rim light，无缝纸或亚克力台面，材质保留真实反光与高光细节；紧凑裁切产品占主体，下方柔和椭圆阴影。Avoid: rainbow reflections, plastic glare, busy background',
  portrait:
    '杂志级人物肖像 · 85mm f/1.8 头肩构图，窗光 30–45° 主光 + 柔和反光板补光，焦点锐利落在近端眼睛；皮肤保留毛孔、雀斑、微表情，克制调色，姿态从容。Avoid: airbrushed plastic skin, over-smoothing, doll-like eyes',
  anime:
    '现代日系赛璐璐动画插画 · 干净一致的线稿粗细，每个色域 3–4 块平涂色，明确的光影分离与克制的高光点缀，角色表情生动但结构准确。Avoid: muddy colors, messy linework, photoreal blending, derivative anime tropes',
  cinematic:
    '2.39:1 宽银幕电影截图 · 40mm 变形镜头质感与水平镜头眩光 + 椭圆 bokeh，方向性主光与深阴影，根据情绪选 teal-and-amber 或 muted pastel 调色，35mm 胶片颗粒与空气透视；A24 式构图，留白克制。Avoid: flat lighting, forced symmetry, over-detailed clutter',
  logo:
    '极简品牌标志 · 纯色背景 + 单一前景色（或克制的双色配对），纯平面向量美学，无渐变、无阴影、无发光；线条粗细一致，缩到 16×16 像素仍可辨识；本图不渲染任何文字或字母。Avoid: gradients, drop shadow, glow, photoreal texture',
  interior:
    '建筑内部摄影 · 24mm 广角直线镜头校正垂直线，主光为窗光自然采光 + 柔和环境补光，材质真实（实木纹理、织物经纬、哑光石材），机位胯高营造人本视角，画面有刻意负空间与生活痕迹（叠好的毯子、半读的书）。Avoid: CG plastic surfaces, impossible perspective, fish-eye distortion',
  raw: '',
}

export interface ValidatedPayload {
  prompt: string
  style: string
  size: string
  count: number
  outputFormat: string
  negativePrompt: string
  quality: string
  creativity: number | null
  seed: string
  model: string
}

export interface ValidationResult {
  error?: string
  value?: ValidatedPayload
}

export function validatePayload(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: '请求体必须是对象' }
  }

  const raw = body as Record<string, unknown>

  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : ''
  const style = typeof raw.style === 'string' ? raw.style.trim() : ''
  const size = typeof raw.size === 'string' ? raw.size.trim() : ''
  const outputFormat = typeof raw.outputFormat === 'string' && raw.outputFormat.trim()
    ? raw.outputFormat.trim().toLowerCase()
    : 'png'
  const count = typeof raw.count === 'number' ? raw.count : Number.NaN
  const negativePrompt = typeof raw.negativePrompt === 'string' ? raw.negativePrompt.trim() : ''
  const quality = typeof raw.quality === 'string' && raw.quality.trim()
    ? raw.quality.trim().toLowerCase()
    : 'auto'
  const creativity = raw.creativity === undefined ? null : (raw.creativity as number | null)
  const seed = typeof raw.seed === 'string' ? raw.seed.trim() : ''
  const model = typeof raw.model === 'string' ? raw.model.trim() : ''

  if (!prompt) {
    return { error: 'prompt 不能为空' }
  }

  if (prompt.length > 1000) {
    return { error: 'prompt 不能超过 1000 个字符' }
  }

  if (style.length > 80) {
    return { error: 'style 不能超过 80 个字符' }
  }

  if (raw.negativePrompt !== undefined && typeof raw.negativePrompt !== 'string') {
    return { error: 'negativePrompt 必须是字符串' }
  }

  if (negativePrompt.length > 500) {
    return { error: 'negativePrompt 不能超过 500 个字符' }
  }

  if (raw.quality !== undefined && typeof raw.quality !== 'string') {
    return { error: 'quality 必须是字符串' }
  }

  if (!allowedQualities.has(quality)) {
    return { error: 'quality 只支持 auto、low、medium、high' }
  }

  if (creativity !== null && (!Number.isFinite(creativity) || (creativity as number) < 1 || (creativity as number) > 10)) {
    return { error: 'creativity 必须是 1 到 10 的数字' }
  }

  if (raw.seed !== undefined && typeof raw.seed !== 'string') {
    return { error: 'seed 必须是字符串' }
  }

  if (seed.length > 120) {
    return { error: 'seed 不能超过 120 个字符' }
  }

  if (raw.model !== undefined && typeof raw.model !== 'string') {
    return { error: 'model 必须是字符串' }
  }

  if (model.length > 64) {
    return { error: 'model 不能超过 64 个字符' }
  }

  if (model && !/^[A-Za-z0-9._\-/]+$/.test(model)) {
    return { error: 'model 只允许字母、数字、点、下划线、横线、斜杠' }
  }

  if (!allowedSizes.has(size)) {
    return { error: 'size 只支持 1024x1024、1024x1536、1536x1024' }
  }

  if (!Number.isInteger(count) || count < 1 || count > 4) {
    return { error: 'count 必须是 1 到 4 的整数' }
  }

  if (!allowedFormats.has(outputFormat)) {
    return { error: 'outputFormat 只支持 png、jpeg、webp' }
  }

  return {
    value: {
      prompt,
      style,
      size,
      count,
      outputFormat,
      negativePrompt,
      quality,
      creativity,
      seed,
      model,
    },
  }
}

export function resolveCreativityInstruction(creativity: number | null): string | null {
  if (creativity === null || creativity === undefined) {
    return null
  }

  if (creativity <= 3) {
    return `创意强度：${creativity}/10 · 忠实还原描述，禁止主观发挥与额外要素`
  }

  if (creativity <= 7) {
    return `创意强度：${creativity}/10 · 主题严格准确，但加强光影、构图与氛围`
  }

  return `创意强度：${creativity}/10 · 可大胆扩展构图、光线与细节，强化视觉戏剧性`
}

export function buildPrompt(payload: {
  prompt: string
  style: string
  outputFormat: string
  negativePrompt: string
  creativity: number | null
  seed: string
}): string {
  // 用 ?? 而非 ||：raw 风格明确设为空字符串 → 不附加风格指引；仅在未定义时才 fallback 到 style 字面量
  const styleInstruction = stylePrompts[payload.style] ?? payload.style

  return [
    `画面内容：${payload.prompt}`,
    styleInstruction ? `风格指引：${styleInstruction}` : null,
    payload.negativePrompt ? `避免要素：${payload.negativePrompt}` : null,
    resolveCreativityInstruction(payload.creativity),
    payload.seed ? `一致性参考：${payload.seed}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

interface RawUpstreamImage {
  id?: string
  url?: string
  b64_json?: string
  b64Json?: string
  revised_prompt?: string
  revisedPrompt?: string
}

export function normalizeImages(response: unknown, outputFormat: string): GeneratedImage[] {
  const data = Array.isArray((response as { data?: unknown })?.data)
    ? ((response as { data: RawUpstreamImage[] }).data)
    : []

  return data.map((image, index) => ({
    id: image.id || `img_${index + 1}`,
    url: image.url || null,
    b64Json: image.b64_json || image.b64Json || null,
    mimeType: mimeTypes[outputFormat] || 'image/png',
    revisedPrompt: image.revised_prompt || image.revisedPrompt || null,
  }))
}

export interface ResolvedError {
  status: number
  code: string
  message: string
}

export function resolveOpenAIError(error: {
  status?: number
  code?: string
  message?: string
  name?: string
}): ResolvedError {
  const status = error?.status
  const upstreamCode = error?.code

  if (status === 401 || status === 403 || upstreamCode === 'invalid_api_key') {
    return {
      status: 401,
      code: 'OPENAI_REQUEST_FAILED',
      message: 'API Key 无效或无权限，请检查「设置」中的 baseUrl 与 Key',
    }
  }

  if (upstreamCode === 'insufficient_quota' || upstreamCode === 'billing_hard_limit_reached') {
    return {
      status: 429,
      code: 'OPENAI_REQUEST_FAILED',
      message: '上游额度不足或账单受限，请检查账户余额',
    }
  }

  if (status === 429 || upstreamCode === 'rate_limit_exceeded') {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message: '上游请求频率过高，请稍后再试',
    }
  }

  if (
    upstreamCode === 'content_policy_violation'
    || upstreamCode === 'moderation_blocked'
    || upstreamCode === 'safety_violation'
  ) {
    return {
      status: 400,
      code: 'INVALID_REQUEST',
      message: '提示词触发了内容安全限制，请调整后再试',
    }
  }

  if (status === 400) {
    return {
      status: 400,
      code: 'INVALID_REQUEST',
      message: error?.message || '上游拒绝了当前图片生成参数',
    }
  }

  if (
    error?.name === 'AbortError'
    || error?.name === 'TimeoutError'
    || upstreamCode === 'ETIMEDOUT'
    || upstreamCode === 'ECONNRESET'
    || upstreamCode === 'ECONNABORTED'
  ) {
    return {
      status: 504,
      code: 'OPENAI_REQUEST_FAILED',
      message: '上游响应超时，请稍后再试',
    }
  }

  if (error?.name === 'TypeError') {
    return {
      status: 502,
      code: 'NETWORK_ERROR',
      message: '无法连接到上游服务，请检查 baseUrl、网络与中转站的 CORS 配置',
    }
  }

  return {
    status: 502,
    code: 'OPENAI_REQUEST_FAILED',
    message: error?.message || '图片生成失败，请稍后再试',
  }
}

export function payloadToValidated(payload: GenerateImageRequest): ValidationResult {
  return validatePayload({
    prompt: payload.prompt,
    style: payload.style,
    size: payload.size,
    count: payload.count,
    outputFormat: payload.outputFormat,
    negativePrompt: payload.negativePrompt,
    quality: payload.quality,
    creativity: payload.creativity,
    seed: payload.seed,
    model: payload.model,
  })
}
