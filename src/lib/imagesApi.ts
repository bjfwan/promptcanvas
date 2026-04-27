import type { GeneratedImage, GenerateImageRequest, ReferenceImageAttachment } from '../types'

export const allowedSizes: ReadonlySet<string> = new Set([
  '1024x1024',
  '1024x1536',
  '1536x1024',
])

export const allowedFormats: ReadonlySet<string> = new Set(['png', 'jpeg', 'webp'])

export const allowedReferenceImageMimeTypes: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

export const maxReferenceImages = 4
export const maxReferenceImageSizeBytes = 20 * 1024 * 1024

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
  natural:
    'Photorealistic documentary photography captured with a 35mm lens at f/2, featuring natural daylight with side-back lighting that creates directional shadows. The composition uses shallow depth of field with sharp focus on the subject while the background naturally blurs into bokeh. Colors are authentic with subtle tonal depth, preserving honest textures like skin pores, fabric weave, and material imperfections. The atmosphere feels candid and unposed, as if captured by a street photographer. Avoid: plastic skin, HDR effects, over-saturation, posterized colors, artificial lighting, studio polish',
  poster:
    'Editorial poster design with a strong focal point occupying the visual center, framed by 30-40% negative space reserved for title typography. The color palette is controlled with 2-3 hues where one serves as an accent, creating asymmetric balance with clear visual hierarchy. Contrast and tonal depth meet print-quality standards. Typography uses geometric sans-serif or elegant serif fonts with generous letter spacing. The overall aesthetic feels contemporary and intentional, suitable for advertising or editorial use. Avoid: cluttered layout, decorative noise, weak focal hierarchy, poor color harmony, inconsistent typography',
  product:
    'Premium commercial product photography shot with a 100mm macro lens at f/8 for maximum sharpness. Lighting uses a large softbox as the main light source with a reflector for fill and a subtle rim light to define edges. The surface is seamless paper or acrylic, showcasing authentic material reflections and highlight details. The product occupies 60% of the frame with a tight crop, sitting on a soft elliptical shadow below. Every material texture is rendered with precision—glass reflections, metal sheen, fabric weave. The result feels like a high-end magazine advertisement. Avoid: rainbow reflections, plastic glare, busy background, harsh shadows, unrealistic materials',
  portrait:
    'Magazine-quality portrait shot with an 85mm lens at f/1.8 in head-and-shoulders composition. Window light from 30-45° serves as the main light, supplemented by a soft reflector fill. Focus is razor-sharp on the near eye while the background melts into creamy bokeh. Skin texture is preserved with visible pores, freckles, and micro-expressions—no airbrushing or over-smoothing. Color grading is restrained and natural. The subject wears a relaxed, authentic expression with natural posture. The overall quality rivals professional editorial photography. Avoid: airbrushed plastic skin, over-smoothing, doll-like eyes, unnatural skin texture, over-processed look',
  anime:
    'Modern Japanese cel-shaded anime illustration featuring clean consistent line weight throughout. Each color area uses 3-4 flat color blocks with clear light-shadow separation and restrained highlight accents. Character anatomy is accurate with lively expressive faces. The style references contemporary anime aesthetics without derivative tropes. Backgrounds use simplified geometric shapes with atmospheric depth. Line art is crisp with no artifacts. Color palette is vibrant but harmonious, avoiding muddy tones. The result feels like professional animation key art or character design sheets. Avoid: muddy colors, messy linework, photorealistic blending, derivative anime tropes, inconsistent line quality',
  cinematic:
    'Cinematic still frame captured with a 2.39:1 widescreen aspect ratio, featuring the optical quality of a 40mm anamorphic lens with horizontal lens flare and elliptical bokeh. Directional key light creates deep shadows with strong contrast. Color grading uses teal-and-amber or muted pastel palettes depending on mood, with subtle 35mm film grain and atmospheric perspective. Composition follows A24-style aesthetics with restrained negative space and intentional framing. The image feels extracted from a high-budget film, with dramatic tension and visual storytelling. Avoid: flat lighting, forced symmetry, over-detailed clutter, digital look, video quality',
  logo:
    'Minimalist brand logo design using pure flat vector aesthetics. The mark sits on a solid color background with a single foreground color or restrained two-color pairing. No gradients, shadows, or glow effects—clean geometric shapes only. Line weight is consistent throughout, ensuring the logo remains recognizable when scaled down to 16×16 pixels. The design emphasizes strong silhouette and balanced negative space. No text, letters, or typographic elements are rendered. The aesthetic is contemporary, scalable, and suitable for both digital and print applications. Avoid: gradients, drop shadows, glow effects, photorealistic textures, complex details, decorative elements',
  interior:
    'Architectural interior photography shot with a 24mm wide-angle lens with corrected vertical lines. Natural window light serves as the primary source with soft ambient fill to balance shadows. All materials are rendered authentically—wood grain, fabric weave, matte stone, brushed metal. Camera height is at waist level to create a human-centered perspective. The composition includes intentional negative space and lived-in details like a folded blanket, half-read book, or steaming coffee cup. The atmosphere feels inviting and genuinely inhabited, not staged. Avoid: CG plastic surfaces, impossible perspective, fish-eye distortion, artificial materials, sterile emptiness',
  raw: '',
}

type SubjectType = 'person' | 'landscape' | 'object' | 'abstract' | 'architecture' | 'food' | 'general'

const subjectKeywords: Record<SubjectType, string[]> = {
  person: ['person', 'man', 'woman', 'girl', 'boy', 'child', 'people', 'face', 'portrait', 'human', 'character', '人', '男人', '女人', '女孩', '男孩', '孩子', '人物', '脸', '肖像'],
  landscape: ['landscape', 'mountain', 'ocean', 'sea', 'sky', 'forest', 'river', 'lake', 'beach', 'sunset', 'sunrise', 'nature', 'scenery', 'view', '风景', '山', '海', '天空', '森林', '河流', '湖泊', '海滩', '日落', '日出', '自然'],
  object: ['product', 'bottle', 'cup', 'chair', 'table', 'car', 'phone', 'computer', 'watch', 'shoe', 'bag', '物品', '产品', '瓶子', '杯子', '椅子', '桌子', '车', '手机', '电脑', '手表', '鞋', '包'],
  abstract: ['abstract', 'pattern', 'texture', 'geometric', 'shapes', 'design', 'artistic', 'conceptual', '抽象', '图案', '纹理', '几何', '形状', '设计', '艺术', '概念'],
  architecture: ['building', 'house', 'architecture', 'interior', 'room', 'city', 'street', 'bridge', 'tower', '建筑', '房子', '室内', '房间', '城市', '街道', '桥', '塔'],
  food: ['food', 'meal', 'dish', 'restaurant', 'cooking', 'fruit', 'vegetable', 'bread', 'cake', 'coffee', '食物', '餐', '菜', '餐厅', '烹饪', '水果', '蔬菜', '面包', '蛋糕', '咖啡'],
  general: [],
}

export function detectSubjectType(prompt: string): SubjectType {
  const lowerPrompt = prompt.toLowerCase()
  
  for (const [type, keywords] of Object.entries(subjectKeywords)) {
    if (type === 'general') continue
    for (const keyword of keywords) {
      if (lowerPrompt.includes(keyword)) {
        return type as SubjectType
      }
    }
  }
  
  return 'general'
}

const adaptiveEnhancements: Record<SubjectType, string> = {
  person: 'Natural skin texture and realistic proportions preferred',
  landscape: 'Natural atmospheric depth and environmental details',
  object: 'Authentic material textures and lighting',
  abstract: 'Cohesive composition and color harmony',
  architecture: 'Correct perspective and authentic materials',
  food: 'Natural textures and appetizing appearance',
  general: '',
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
  referenceImages: ReferenceImageAttachment[]
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
  const referenceImages = raw.referenceImages === undefined
    ? []
    : (Array.isArray(raw.referenceImages) ? raw.referenceImages : null)

  if (!prompt) {
    return { error: 'prompt 不能为空' }
  }

  if (referenceImages === null) {
    return { error: 'referenceImages 必须是数组' }
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

  if (referenceImages.length > maxReferenceImages) {
    return { error: `referenceImages 最多支持 ${maxReferenceImages} 张` }
  }

  const normalizedReferenceImages: ReferenceImageAttachment[] = []

  for (const entry of referenceImages) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { error: 'referenceImages 项格式不正确' }
    }

    const attachment = entry as ReferenceImageAttachment
    const file = attachment.file
    const mimeType = typeof attachment.mimeType === 'string' ? attachment.mimeType.trim().toLowerCase() : ''
    const previewUrl = typeof attachment.previewUrl === 'string' ? attachment.previewUrl.trim() : ''
    const name = typeof attachment.name === 'string' ? attachment.name.trim() : ''
    const sizeBytes = typeof attachment.sizeBytes === 'number' ? attachment.sizeBytes : Number.NaN

    if (!(typeof File !== 'undefined' && file instanceof File)) {
      return { error: 'referenceImages 必须包含可上传的图片文件' }
    }

    const resolvedMimeType = (file.type || mimeType).trim().toLowerCase()
    if (!allowedReferenceImageMimeTypes.has(resolvedMimeType)) {
      return { error: '参考图只支持 PNG、JPEG、WEBP、GIF' }
    }

    if (!name) {
      return { error: '参考图文件名不能为空' }
    }

    if (!previewUrl) {
      return { error: '参考图预览地址不能为空' }
    }

    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return { error: '参考图大小无效' }
    }

    if (sizeBytes > maxReferenceImageSizeBytes) {
      return { error: `单张参考图不能超过 ${Math.round(maxReferenceImageSizeBytes / 1024 / 1024)}MB` }
    }

    normalizedReferenceImages.push({
      ...attachment,
      file,
      name,
      mimeType: resolvedMimeType,
      previewUrl,
      sizeBytes,
    })
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
      referenceImages: normalizedReferenceImages,
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
  const styleInstruction = stylePrompts[payload.style] ?? payload.style
  const subjectType = detectSubjectType(payload.prompt)
  const adaptiveEnhancement = adaptiveEnhancements[subjectType]

  return [
    `画面内容：${payload.prompt}`,
    styleInstruction ? `风格指引：${styleInstruction}` : null,
    adaptiveEnhancement ? `主体优化：${adaptiveEnhancement}` : null,
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
    referenceImages: payload.referenceImages,
  })
}
