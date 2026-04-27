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

export const stylePrompts: Record<string, string> = {
  natural: '自然写实风格，光线真实，色彩协调',
  poster: '电影海报风格，主体突出，排版有冲击力',
  product: '商业产品摄影风格，干净背景，质感清晰',
  portrait: '高质量人物肖像风格，面部自然，细节丰富',
  anime: '精致动漫插画风格，线条清晰，色彩鲜明',
  cinematic: '电影感视觉风格，戏剧化光影，构图完整',
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
    return `创意强度：${creativity}/10，优先忠实还原用户提示词，避免过度发散`
  }

  if (creativity <= 7) {
    return `创意强度：${creativity}/10，在保持主题准确的基础上增强画面表现力`
  }

  return `创意强度：${creativity}/10，可以加入更大胆的构图、光影和视觉细节`
}

export function buildPrompt(payload: {
  prompt: string
  style: string
  outputFormat: string
  negativePrompt: string
  creativity: number | null
  seed: string
}): string {
  const styleInstruction = stylePrompts[payload.style] || payload.style

  return [
    `用户提示词：${payload.prompt}`,
    styleInstruction ? `风格要求：${styleInstruction}` : null,
    payload.negativePrompt ? `避免内容：${payload.negativePrompt}` : null,
    resolveCreativityInstruction(payload.creativity),
    payload.seed ? `一致性标记：${payload.seed}` : null,
    `输出格式：${payload.outputFormat.toUpperCase()}`,
    '输出要求：高质量、构图完整、细节清晰',
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
