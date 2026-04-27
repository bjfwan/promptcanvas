// 纯函数与常量层：必须保持无 Node-only 依赖，
// 这样 Cloudflare Pages Functions 可以直接 import 复用。

export const allowedSizes = new Set(['1024x1024', '1024x1536', '1536x1024'])
export const allowedFormats = new Set(['png', 'jpeg', 'webp'])
export const allowedQualities = new Set(['auto', 'low', 'medium', 'high'])

export const mimeTypes = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export const stylePrompts = {
  natural: '自然写实风格，光线真实，色彩协调',
  poster: '电影海报风格，主体突出，排版有冲击力',
  product: '商业产品摄影风格，干净背景，质感清晰',
  portrait: '高质量人物肖像风格，面部自然，细节丰富',
  anime: '精致动漫插画风格，线条清晰，色彩鲜明',
  cinematic: '电影感视觉风格，戏剧化光影，构图完整',
}

export function isMissingApiKey(apiKey) {
  const value = typeof apiKey === 'string' ? apiKey.trim() : ''

  return !value || value === 'sk-xxxx'
}

export function validatePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: '请求体必须是 JSON 对象' }
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const style = typeof body.style === 'string' ? body.style.trim() : ''
  const size = typeof body.size === 'string' ? body.size.trim() : ''
  const outputFormat = typeof body.outputFormat === 'string' && body.outputFormat.trim()
    ? body.outputFormat.trim().toLowerCase()
    : 'png'
  const count = typeof body.count === 'number' ? body.count : Number.NaN
  const negativePrompt = typeof body.negativePrompt === 'string' ? body.negativePrompt.trim() : ''
  const quality = typeof body.quality === 'string' && body.quality.trim()
    ? body.quality.trim().toLowerCase()
    : 'auto'
  const creativity = body.creativity === undefined ? null : body.creativity
  const seed = typeof body.seed === 'string' ? body.seed.trim() : ''
  const model = typeof body.model === 'string' ? body.model.trim() : ''

  if (!prompt) {
    return { error: 'prompt 不能为空' }
  }

  if (prompt.length > 1000) {
    return { error: 'prompt 不能超过 1000 个字符' }
  }

  if (style.length > 80) {
    return { error: 'style 不能超过 80 个字符' }
  }

  if (body.negativePrompt !== undefined && typeof body.negativePrompt !== 'string') {
    return { error: 'negativePrompt 必须是字符串' }
  }

  if (negativePrompt.length > 500) {
    return { error: 'negativePrompt 不能超过 500 个字符' }
  }

  if (body.quality !== undefined && typeof body.quality !== 'string') {
    return { error: 'quality 必须是字符串' }
  }

  if (!allowedQualities.has(quality)) {
    return { error: 'quality 只支持 auto、low、medium、high' }
  }

  if (creativity !== null && (!Number.isFinite(creativity) || creativity < 1 || creativity > 10)) {
    return { error: 'creativity 必须是 1 到 10 的数字' }
  }

  if (body.seed !== undefined && typeof body.seed !== 'string') {
    return { error: 'seed 必须是字符串' }
  }

  if (seed.length > 120) {
    return { error: 'seed 不能超过 120 个字符' }
  }

  if (body.model !== undefined && typeof body.model !== 'string') {
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

export function resolveCreativityInstruction(creativity) {
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

export function buildPrompt({ prompt, style, outputFormat, negativePrompt, creativity, seed }) {
  const styleInstruction = stylePrompts[style] || style

  return [
    `用户提示词：${prompt}`,
    styleInstruction ? `风格要求：${styleInstruction}` : null,
    negativePrompt ? `避免内容：${negativePrompt}` : null,
    resolveCreativityInstruction(creativity),
    seed ? `一致性标记：${seed}` : null,
    `输出格式：${outputFormat.toUpperCase()}`,
    '输出要求：高质量、构图完整、细节清晰',
  ].filter(Boolean).join('\n')
}

export function normalizeImages(response, outputFormat) {
  const data = Array.isArray(response?.data) ? response.data : []

  return data.map((image, index) => ({
    id: image.id || `img_${index + 1}`,
    url: image.url || null,
    b64Json: image.b64_json || image.b64Json || null,
    mimeType: mimeTypes[outputFormat] || 'image/png',
    revisedPrompt: image.revised_prompt || image.revisedPrompt || null,
  }))
}

export function resolveOpenAIError(error) {
  const status = error?.status || error?.response?.status
  const upstreamCode = error?.code || error?.error?.code

  if (status === 401 || status === 403 || upstreamCode === 'invalid_api_key') {
    return {
      status: 500,
      code: 'OPENAI_REQUEST_FAILED',
      message: 'OpenAI API Key 无效或无权限，请检查后端配置',
    }
  }

  if (upstreamCode === 'insufficient_quota' || upstreamCode === 'billing_hard_limit_reached') {
    return {
      status: 429,
      code: 'OPENAI_REQUEST_FAILED',
      message: 'OpenAI 额度不足或账单受限，请检查账户余额',
    }
  }

  if (status === 429 || upstreamCode === 'rate_limit_exceeded') {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message: 'OpenAI 请求频率过高或额度不足，请稍后再试',
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
      message: error?.message || 'OpenAI 拒绝了当前图片生成参数',
    }
  }

  if (
    error?.name === 'APIConnectionTimeoutError'
    || error?.code === 'ETIMEDOUT'
    || error?.code === 'ECONNRESET'
    || error?.code === 'ECONNABORTED'
  ) {
    return {
      status: 504,
      code: 'OPENAI_REQUEST_FAILED',
      message: 'OpenAI 响应超时，请稍后再试',
    }
  }

  return {
    status: 502,
    code: 'OPENAI_REQUEST_FAILED',
    message: '图片生成失败，请稍后再试',
  }
}
