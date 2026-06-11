import type { GeneratedImage, GenerateImageRequest, ModelSelectionMode, ReferenceImageAttachment } from '../types'
import { t } from './i18n.js'

export const allowedSizes: ReadonlySet<string> = new Set([
  '1024x1024',
  '1024x1536',
  '1536x1024',
  '2048x2048',
  '2048x3072',
  '3072x2048',
  '4096x4096',
  '4096x6144',
  '6144x4096',
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
  modelSelection: ModelSelectionMode
  mode: GenerateImageRequest['mode']
  responseModel: string
  imageToolModel: string
  stream: boolean | undefined
  streamingWait: boolean | undefined
  transparentBackground: boolean
  partialPreview: boolean
  partialImages: number | undefined
  referenceImages: ReferenceImageAttachment[]
  /** PNG mask for inpainting. Black = keep, white = edit. */
  inpaintMask?: Blob | string
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
  const modelSelection = typeof raw.modelSelection === 'string' ? raw.modelSelection.trim() : (model ? 'explicit' : 'auto')
  const mode = typeof raw.mode === 'string' ? raw.mode.trim() : undefined
  const responseModel = typeof raw.responseModel === 'string' ? raw.responseModel.trim() : ''
  const imageToolModel = typeof raw.imageToolModel === 'string' ? raw.imageToolModel.trim() : ''
  const stream = raw.stream === undefined ? undefined : raw.stream
  const streamingWait = raw.streamingWait === undefined ? undefined : raw.streamingWait
  const transparentBackground = raw.transparentBackground === undefined ? false : raw.transparentBackground
  const partialPreview = raw.partialPreview === undefined ? true : raw.partialPreview
  const partialImages = raw.partialImages === undefined ? undefined : raw.partialImages
  const partialImagesValue = typeof partialImages === 'number' ? partialImages : undefined
  const allowResponsesImageInputs = isResponsesImageModel(model)
    || mode === 'responses_tool'
    || mode === 'responses_text_data_url'
    || isResponsesImageModel(responseModel)
  const referenceImages = raw.referenceImages === undefined
    ? []
    : (Array.isArray(raw.referenceImages) ? raw.referenceImages : null)

  if (!prompt) {
    return { error: 'prompt 不能为空' }
  }

  if (referenceImages === null) {
    return { error: 'referenceImages 必须是数组' }
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

  if (model.length > 200) {
    return { error: 'model 不能超过 200 个字符' }
  }

  if (model && !/^[A-Za-z0-9._\-/]+$/.test(model)) {
    return { error: 'model 只允许字母、数字、点、下划线、横线、斜杠' }
  }

  if (
    modelSelection !== 'auto'
    && modelSelection !== 'none'
    && modelSelection !== 'explicit'
  ) {
    return { error: 'modelSelection 只支持 auto、none 或 explicit' }
  }

  if (
    mode !== undefined
    && mode !== 'images_generations'
    && mode !== 'responses_tool'
    && mode !== 'responses_text_data_url'
  ) {
    return { error: 'mode 只支持 images_generations、responses_tool 或 responses_text_data_url' }
  }

  for (const [field, value] of [
    ['responseModel', responseModel],
    ['imageToolModel', imageToolModel],
  ] as const) {
    if (raw[field] !== undefined && typeof raw[field] !== 'string') {
      return { error: `${field} 必须是字符串` }
    }
    if (value.length > 200) {
      return { error: `${field} 不能超过 200 个字符` }
    }
    if (value && !/^[A-Za-z0-9._\-/]+$/.test(value)) {
      return { error: `${field} 只允许字母、数字、点、下划线、横线、斜杠` }
    }
  }

  if (stream !== undefined && typeof stream !== 'boolean') {
    return { error: 'stream 必须是布尔值' }
  }

  if (streamingWait !== undefined && typeof streamingWait !== 'boolean') {
    return { error: 'streamingWait 必须是布尔值' }
  }

  if (typeof transparentBackground !== 'boolean') {
    return { error: 'transparentBackground 必须是布尔值' }
  }

  if (typeof partialPreview !== 'boolean') {
    return { error: 'partialPreview 必须是布尔值' }
  }

  if (
    partialImages !== undefined
    && (partialImagesValue === undefined || !Number.isInteger(partialImagesValue) || partialImagesValue < 0 || partialImagesValue > 3)
  ) {
    return { error: 'partialImages 必须是 0 到 3 的整数' }
  }

  if (referenceImages.length > maxReferenceImages) {
    return { error: `referenceImages 最多支持 ${maxReferenceImages} 张` }
  }

  const normalizedReferenceImages: ReferenceImageAttachment[] = []

  for (const entry of referenceImages) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { error: 'referenceImages 项格式不正确' }
    }

    const attachment = entry as ReferenceImageAttachment & Record<string, unknown>
    const file = attachment.file
    const mimeType = typeof attachment.mimeType === 'string' ? attachment.mimeType.trim().toLowerCase() : ''
    const previewUrl = resolveReferenceImageInputUrl(attachment)
    const name = typeof attachment.name === 'string' ? attachment.name.trim() : ''
    const sizeBytes = typeof attachment.sizeBytes === 'number' ? attachment.sizeBytes : Number.NaN
    const hasFile = typeof File !== 'undefined' && file instanceof File
    const hasResponsesStringInput = allowResponsesImageInputs
      && typeof previewUrl === 'string'
      && isUsableImageInputString(previewUrl)

    if (!hasFile && !hasResponsesStringInput) {
      return { error: 'referenceImages 必须包含可上传的图片文件' }
    }

    const resolvedMimeType = hasFile
      ? (file.type || mimeType).trim().toLowerCase()
      : (mimeType || inferImageMimeTypeFromInput(previewUrl)).trim().toLowerCase()
    if (!allowedReferenceImageMimeTypes.has(resolvedMimeType)) {
      return { error: '参考图只支持 PNG、JPEG、WEBP、GIF' }
    }

    if (!name) {
      return { error: '参考图文件名不能为空' }
    }

    if (!previewUrl) {
      return { error: '参考图预览地址不能为空' }
    }

    const resolvedSizeBytes = Number.isFinite(sizeBytes) && sizeBytes > 0
      ? sizeBytes
      : estimateImageInputSizeBytes(previewUrl)
    if (!Number.isFinite(resolvedSizeBytes) || resolvedSizeBytes <= 0) {
      return { error: '参考图大小无效' }
    }

    if (resolvedSizeBytes > maxReferenceImageSizeBytes) {
      return { error: `单张参考图不能超过 ${Math.round(maxReferenceImageSizeBytes / 1024 / 1024)}MB` }
    }

    normalizedReferenceImages.push({
      ...attachment,
      file: hasFile ? file : undefined,
      name,
      mimeType: resolvedMimeType,
      previewUrl,
      sizeBytes: resolvedSizeBytes,
    })
  }

  if (!allowedSizes.has(size)) {
    return { error: 'size 不在支持范围内' }
  }

  if (!Number.isInteger(count) || count < 1 || count > 4) {
    return { error: 'count 必须是 1 到 4 的整数' }
  }

  if (!allowedFormats.has(outputFormat)) {
    return { error: 'outputFormat 只支持 png、jpeg、webp' }
  }

  const inpaintMaskRaw = raw.inpaintMask
  let inpaintMask: Blob | string | undefined
  if (inpaintMaskRaw !== undefined && inpaintMaskRaw !== null) {
    if (typeof Blob !== 'undefined' && inpaintMaskRaw instanceof Blob) {
      inpaintMask = inpaintMaskRaw
    } else if (
      allowResponsesImageInputs
      && typeof inpaintMaskRaw === 'string'
      && isUsableImageInputString(inpaintMaskRaw)
    ) {
      inpaintMask = inpaintMaskRaw.trim()
    } else {
      return { error: allowResponsesImageInputs ? 'inpaintMask 必须是 Blob、data URL 或 base64 字符串' : 'inpaintMask 必须是 Blob' }
    }
  }

  if (inpaintMask && normalizedReferenceImages.length !== 1) {
    return { error: '蒙版编辑需要恰好一张原图作为参考图' }
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
      modelSelection: modelSelection as ModelSelectionMode,
      mode,
      responseModel,
      imageToolModel,
      stream,
      streamingWait: streamingWait as boolean | undefined,
      transparentBackground,
      partialPreview,
      partialImages: partialImagesValue,
      referenceImages: normalizedReferenceImages,
      inpaintMask,
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

export async function ensurePngBlob(file: File): Promise<Blob> {
  if (file.type === 'image/png') {
    return file
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('无法创建 Canvas 上下文'))
        return
      }
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Canvas 转换 PNG 失败'))
        }
      }, 'image/png')
    }
    img.onerror = () => reject(new Error('图片加载失败，无法转换为 PNG'))
    img.src = URL.createObjectURL(file)
  })
}

export async function buildImagesEditsFormData(payload: {
  prompt: string
  size: string
  count: number
  outputFormat: string
  quality: string
  model: string
  referenceImages: ReferenceImageAttachment[]
  /**
   * Optional inpainting mask (PNG). Black pixels = keep, white pixels = edit.
   * When supplied, only one referenceImage is used (the first) as the source.
   */
  mask?: Blob
}, requestId: string): Promise<FormData> {
  const formData = new FormData()

  formData.set('prompt', payload.prompt)
  formData.set('size', payload.size)
  formData.set('n', String(payload.count))
  formData.set('user', requestId)
  formData.set('output_format', payload.outputFormat)
  formData.set('quality', payload.quality)
  // OpenAI-compatible relays vary here. normalizeImages accepts either url or
  // b64_json, so this remains a soft preference rather than a parser contract.
  formData.set('response_format', 'url')

  if (payload.model) {
    formData.set('model', payload.model)
  }

  if (payload.referenceImages.length > 0) {
    const firstImage = payload.referenceImages[0]
    if (firstImage.file) {
      const pngBlob = await ensurePngBlob(firstImage.file)
      formData.append('image', pngBlob, 'image.png')
    }

    if (!payload.mask && payload.referenceImages.length > 1) {
      for (const image of payload.referenceImages.slice(1)) {
        if (image.file) {
          const pngBlob = await ensurePngBlob(image.file)
          formData.append('image[]', pngBlob, 'image.png')
        }
      }
    }
  }

  if (payload.mask) {
    formData.append('mask', payload.mask, 'mask.png')
  }

  return formData
}

export function isResponsesImageModel(model?: string | null): boolean {
  return String(model || '').toLowerCase().includes('gpt-image-2-chat')
}

export function imageGenerationsModelFor(model?: string | null): string {
  const raw = String(model || '').trim()
  if (!raw) return ''
  return raw.replace(/gpt-image-2-chat/ig, 'gpt-image-2')
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function resolveReferenceImageInputUrl(
  attachment: ReferenceImageAttachment & Record<string, unknown>,
): string {
  const imageUrl = attachment.image_url
  const imageUrlString = typeof imageUrl === 'string' ? imageUrl : ''
  const imageUrlObjectString = imageUrl && typeof imageUrl === 'object'
    ? firstString((imageUrl as Record<string, unknown>).url)
    : ''

  return firstString(
    attachment.previewUrl,
    attachment.imageUrl,
    imageUrlString,
    imageUrlObjectString,
    attachment.url,
    attachment.b64Json,
    attachment.b64_json,
    attachment.b64,
    attachment.data,
  )
}

function cleanBase64Body(value: string): string {
  return value.replace(/\s+/g, '')
}

function getBase64BodyFromImageInput(value: string): string | null {
  const trimmed = value.trim()
  const dataUrlMatch = trimmed.match(/^data:image\/[a-z0-9.+-]+;base64,([\s\S]+)$/i)
  if (dataUrlMatch) return cleanBase64Body(dataUrlMatch[1])

  const bare = trimmed.replace(/^base64,/i, '')
  return looksLikeBase64ImageBody(bare) ? cleanBase64Body(bare) : null
}

function looksLikeBase64ImageBody(value: string): boolean {
  const body = cleanBase64Body(value.replace(/^base64,/i, ''))
  return body.length >= 32 && /^[A-Za-z0-9+/]+={0,2}$/.test(body)
}

function inferImageMimeTypeFromBase64(base64: string): string {
  const body = cleanBase64Body(base64)
  if (body.startsWith('iVBORw0KGgo')) return 'image/png'
  if (body.startsWith('/9j/')) return 'image/jpeg'
  if (body.startsWith('UklGR')) return 'image/webp'
  if (body.startsWith('R0lGOD')) return 'image/gif'
  return 'image/png'
}

function inferImageMimeTypeFromInput(value: string): string {
  const dataUrlMime = value.trim().match(/^data:(image\/[a-z0-9.+-]+);base64,/i)?.[1]
  if (dataUrlMime) return dataUrlMime.toLowerCase()

  const base64Body = getBase64BodyFromImageInput(value)
  return base64Body ? inferImageMimeTypeFromBase64(base64Body) : 'image/png'
}

function isUsableImageInputString(value: string): boolean {
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed)
    || /^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)
    || looksLikeBase64ImageBody(trimmed)
}

function estimateImageInputSizeBytes(value: string): number {
  if (/^https?:\/\//i.test(value.trim())) return 1

  const base64Body = getBase64BodyFromImageInput(value)
  if (!base64Body) return Number.NaN

  const padding = (base64Body.match(/=+$/)?.[0].length ?? 0)
  return Math.max(1, Math.floor((base64Body.length * 3) / 4) - padding)
}

export function normalizeImageInputUrl(input: string, fallbackMimeType = 'image/png'): string {
  const trimmed = input.trim()
  if (!trimmed) return ''

  if (/^https?:\/\//i.test(trimmed)) return trimmed

  const dataUrlMatch = trimmed.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i)
  if (dataUrlMatch) {
    return `data:${dataUrlMatch[1].toLowerCase()};base64,${cleanBase64Body(dataUrlMatch[2])}`
  }

  const base64Body = getBase64BodyFromImageInput(trimmed)
  if (base64Body) {
    const mimeType = fallbackMimeType || inferImageMimeTypeFromBase64(base64Body)
    return `data:${mimeType};base64,${base64Body}`
  }

  return trimmed
}

export async function blobToDataUrl(blob: Blob, fallbackMimeType = 'image/png'): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })

  return normalizeImageInputUrl(dataUrl, blob.type || fallbackMimeType)
}

export async function resolveResponsesImageUrl(
  input: Blob | string,
  fallbackMimeType = 'image/png',
): Promise<string> {
  if (typeof input === 'string') {
    return normalizeImageInputUrl(input, fallbackMimeType)
  }

  return blobToDataUrl(input, fallbackMimeType)
}

async function referenceImageToResponsesImageUrl(image: ReferenceImageAttachment): Promise<string> {
  if (image.file) {
    return resolveResponsesImageUrl(image.file, image.mimeType)
  }

  return resolveResponsesImageUrl(image.previewUrl, image.mimeType)
}

export interface BuildResponsesImageRequestPayload {
  prompt: string
  size: string
  count: number
  outputFormat: string
  quality: string
  model: string
  responseModel?: string
  imageToolModel?: string
  referenceImages: ReferenceImageAttachment[]
  mask?: Blob | string
  stream?: boolean
  transparentBackground?: boolean
  partialPreview?: boolean
  partialImages?: number
}

export async function buildResponsesImageRequest(
  payload: BuildResponsesImageRequestPayload,
): Promise<Record<string, unknown>> {
  const imageCount = Math.max(1, payload.count)
  const content: Array<Record<string, string>> = []
  const instructionLines = [
    `Use the image_generation tool to generate exactly ${imageCount} ${imageCount === 1 ? 'image' : 'images'}.`,
    'Do not answer with only text.',
  ]

  if (payload.prompt) {
    instructionLines.push(`Prompt:\n${payload.prompt}`)
  }
  if (payload.referenceImages.length > 0) {
    instructionLines.push('Use the attached input images as visual references for the generation.')
  }
  if (payload.mask) {
    instructionLines.push('The final attached input image is an inpainting mask: black pixels keep the source image, white pixels mark the area to edit.')
  }

  content.push({ type: 'input_text', text: instructionLines.join('\n') })

  for (const image of payload.referenceImages) {
    content.push({
      type: 'input_image',
      image_url: await referenceImageToResponsesImageUrl(image),
    })
  }

  if (payload.mask) {
    content.push({
      type: 'input_image',
      image_url: await resolveResponsesImageUrl(payload.mask, 'image/png'),
    })
  }

  const responseModel = payload.responseModel?.trim() || payload.model
  const imageToolModel = payload.imageToolModel?.trim() || imageGenerationsModelFor(responseModel)
  const stream = payload.stream ?? false
  const tool: Record<string, unknown> = {
    type: 'image_generation',
    output_format: payload.outputFormat,
    quality: payload.quality,
    size: payload.size,
    partial_images: stream && payload.partialPreview ? (payload.partialImages ?? 2) : 0,
  }

  if (imageToolModel) tool.model = imageToolModel
  if (payload.transparentBackground && payload.outputFormat === 'png') {
    tool.background = 'transparent'
  }

  const request: Record<string, unknown> = {
    input: [{ role: 'user', content }],
    tools: [tool],
    instructions: 'You are a helpful assistant. Always call image_generation when the user asks for an image. Do not answer with only text.',
    tool_choice: { type: 'image_generation' },
    stream,
    store: false,
  }

  if (responseModel) request.model = responseModel

  return request
}

export interface BuildResponsesTextDataUrlRequestPayload {
  prompt: string
  size: string
  count: number
  outputFormat: string
  quality: string
  model: string
  responseModel?: string
  referenceImages: ReferenceImageAttachment[]
  mask?: Blob | string
  stream?: boolean
  transparentBackground?: boolean
}

export async function buildResponsesTextDataUrlRequest(
  payload: BuildResponsesTextDataUrlRequestPayload,
): Promise<Record<string, unknown>> {
  const imageCount = Math.max(1, payload.count)
  const content: Array<Record<string, string>> = []
  const instructionLines = [
    `Generate exactly ${imageCount} ${imageCount === 1 ? 'image' : 'images'} from the prompt.`,
    `Target size: ${payload.size}.`,
    `Output format: ${payload.outputFormat}.`,
    `Quality: ${payload.quality}.`,
    'If this relay returns images through text, return the image as an HTML <img> tag whose src is a data:image/*;base64 URL.',
  ]

  if (payload.prompt) {
    instructionLines.push(`Prompt:\n${payload.prompt}`)
  }
  if (payload.referenceImages.length > 0) {
    instructionLines.push('Use the attached input images as visual references for the generation or edit.')
  }
  if (payload.mask) {
    instructionLines.push('The final attached input image is an inpainting mask: black pixels keep the source image, white pixels mark the area to edit.')
  }

  content.push({ type: 'input_text', text: instructionLines.join('\n') })

  for (const image of payload.referenceImages) {
    content.push({
      type: 'input_image',
      image_url: await referenceImageToResponsesImageUrl(image),
    })
  }

  if (payload.mask) {
    content.push({
      type: 'input_image',
      image_url: await resolveResponsesImageUrl(payload.mask, 'image/png'),
    })
  }

  const responseModel = payload.responseModel?.trim() || payload.model

  const request: Record<string, unknown> = {
    input: [{ role: 'user', content }],
    stream: payload.stream ?? false,
    store: false,
  }

  if (responseModel) request.model = responseModel

  return request
}

export function buildPrompt(payload: {
  prompt: string
  style: string
  outputFormat: string
  negativePrompt: string
  creativity: number | null
  seed: string
  size?: string
  quality?: string
  model?: string
  referenceImages?: Array<unknown>
}): string {
  const trimmedPrompt = payload.prompt.trim()
  return trimmedPrompt
}

interface RawUpstreamImage {
  id?: string
  url?: string
  b64_json?: string
  b64Json?: string
  revised_prompt?: string
  revisedPrompt?: string
}

interface RawResponsesImageCall {
  id?: string
  type?: string
  status?: string
  result?: string
  b64_json?: string
  b64Json?: string
  image_base64?: string
  imageBase64?: string
  revised_prompt?: string
  revisedPrompt?: string
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

function hasResponseImagePayload(item: unknown): item is RawResponsesImageCall {
  if (!item || typeof item !== 'object') return false
  const record = item as RawResponsesImageCall
  return record.type === 'image_generation_call'
    && Boolean(pickFirstString(
      record.result,
      record.b64_json,
      record.b64Json,
      record.image_base64,
      record.imageBase64,
    ))
}

function pushUniqueImageCall(
  images: RawResponsesImageCall[],
  item: unknown,
): void {
  if (!hasResponseImagePayload(item)) return

  const id = item.id || ''
  const b64 = pickFirstString(item.result, item.b64_json, item.b64Json, item.image_base64, item.imageBase64) || ''
  const alreadySeen = images.some((existing) => {
    const existingB64 = pickFirstString(
      existing.result,
      existing.b64_json,
      existing.b64Json,
      existing.image_base64,
      existing.imageBase64,
    )
    return (id && existing.id === id) || existingB64 === b64
  })
  if (!alreadySeen) images.push(item)
}

function responseOutputItems(value: unknown): unknown[] {
  const record = value as { output?: unknown; response?: { output?: unknown } }
  if (Array.isArray(record?.output)) return record.output
  if (Array.isArray(record?.response?.output)) return record.response.output
  return []
}

export type ResponsesImageProgressStage =
  | 'connected'
  | 'processing'
  | 'tool-started'
  | 'generating'
  | 'preview'
  | 'finalizing'
  | 'completed'

export interface ResponsesImageProgress {
  eventType: string
  stage: ResponsesImageProgressStage
  label: string
  progress: number
  partialImage?: {
    b64Json: string
    mimeType: string
  }
}

const responsesProgressMap: Record<string, Omit<ResponsesImageProgress, 'eventType' | 'partialImage'>> = {
  'response.created': {
    stage: 'connected',
    label: '正在连接绘图引擎',
    progress: 8,
  },
  'response.in_progress': {
    stage: 'processing',
    label: '正在理解画面',
    progress: 20,
  },
  'response.output_item.added': {
    stage: 'tool-started',
    label: '开始绘制',
    progress: 34,
  },
  'response.image_generation_call.in_progress': {
    stage: 'tool-started',
    label: '开始绘制',
    progress: 42,
  },
  'response.image_generation_call.generating': {
    stage: 'generating',
    label: '细节生成中',
    progress: 66,
  },
  'response.image_generation_call.partial_image': {
    stage: 'preview',
    label: '收到预览，继续打磨',
    progress: 76,
  },
  'response.output_item.done': {
    stage: 'finalizing',
    label: '整理最终图片',
    progress: 92,
  },
  'response.completed': {
    stage: 'completed',
    label: '生成完成',
    progress: 100,
  },
}

const responsesProgressLabelKeys: Record<string, string> = {
  'response.created': 'generation.progress.connected',
  'response.in_progress': 'generation.progress.processing',
  'response.output_item.added': 'generation.progress.toolStarted',
  'response.image_generation_call.in_progress': 'generation.progress.toolStarted',
  'response.image_generation_call.generating': 'generation.progress.generating',
  'response.image_generation_call.partial_image': 'generation.progress.preview',
  'response.output_item.done': 'generation.progress.finalizing',
  'response.completed': 'generation.progress.completed',
}

function pickBase64LikeString(value: unknown, depth = 0): string | null {
  if (typeof value === 'string' && value.trim()) {
    const dataUrlMatch = value.match(/^data:image\/[a-z0-9.+-]+;base64,([\s\S]+)$/i)
    return dataUrlMatch ? cleanBase64Body(dataUrlMatch[1]) : cleanBase64Body(value)
  }
  if (!value || typeof value !== 'object' || depth > 2) return null

  const record = value as Record<string, unknown>
  const direct = pickFirstString(
    record.partial_image,
    record.partialImage,
    record.image_base64,
    record.imageBase64,
    record.b64_json,
    record.b64Json,
    record.data,
  )
  if (direct) return pickBase64LikeString(direct, depth + 1)

  for (const key of ['partial_image', 'partialImage', 'image', 'item', 'delta'] as const) {
    const nested = pickBase64LikeString(record[key], depth + 1)
    if (nested) return nested
  }

  return null
}

function inferMimeTypeFromProgressEvent(event: Record<string, unknown>, outputFormat: string): string {
  const direct = pickFirstString(event.mime_type, event.mimeType, event.output_format, event.outputFormat)
  if (direct && direct.includes('/')) return direct
  if (direct && mimeTypes[direct]) return mimeTypes[direct]
  return mimeTypes[outputFormat] || 'image/png'
}

function decodeMinimalHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function extractDataUrlImagesFromText(text: string): Array<{ b64Json: string; mimeType: string }> {
  const decoded = decodeMinimalHtmlEntities(text)
  const images: Array<{ b64Json: string; mimeType: string }> = []
  const seen = new Set<string>()
  const dataUrlPattern = /data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/_=-]+)/gi

  for (const match of decoded.matchAll(dataUrlPattern)) {
    const mimeType = match[1].toLowerCase()
    const b64Json = cleanBase64Body(match[2])
    if (!b64Json || seen.has(`${mimeType}:${b64Json}`)) continue
    seen.add(`${mimeType}:${b64Json}`)
    images.push({ b64Json, mimeType })
  }

  return images
}

function collectOutputText(value: unknown, depth = 0): string[] {
  if (!value || depth > 6) return []

  if (typeof value === 'string') {
    return /data:image\/[a-z0-9.+-]+;base64,/i.test(value) ? [value] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectOutputText(entry, depth + 1))
  }

  if (typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const texts: string[] = []
  for (const key of ['output_text', 'outputText', 'text', 'delta'] as const) {
    const text = record[key]
    if (typeof text === 'string') {
      texts.push(text)
    }
  }

  for (const key of ['response', 'output', 'content', 'item', 'message'] as const) {
    texts.push(...collectOutputText(record[key], depth + 1))
  }

  return texts
}

export function responsesImageProgressFromEvent(
  event: unknown,
  outputFormat = 'png',
): ResponsesImageProgress | null {
  if (!event || typeof event !== 'object') return null

  const record = event as Record<string, unknown>
  const eventType = typeof record.type === 'string' ? record.type : ''
  const mapped = responsesProgressMap[eventType]
  if (!mapped) return null

  const progress: ResponsesImageProgress = {
    eventType,
    ...mapped,
    label: t(responsesProgressLabelKeys[eventType] ?? 'generation.progress.generating'),
  }

  if (eventType === 'response.image_generation_call.partial_image') {
    const b64Json = pickBase64LikeString(record)
    if (b64Json) {
      progress.partialImage = {
        b64Json,
        mimeType: inferMimeTypeFromProgressEvent(record, outputFormat),
      }
    }
  }

  return progress
}

export function parseResponsesImageSseBlock(block: string): unknown | null {
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''))
    }
  }

  const data = dataLines.join('\n').trim()
  if (!data || data === '[DONE]') return null

  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

export function visitResponsesImageSseEvents(
  text: string,
  visitor: (event: unknown) => void,
): void {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = normalized.split(/\n\n+/)

  for (const block of blocks) {
    const event = parseResponsesImageSseBlock(block)
    if (event) visitor(event)
  }
}

export function parseResponsesImageSse(text: string): Record<string, unknown> {
  const output: RawResponsesImageCall[] = []
  const outputTexts: string[] = []

  visitResponsesImageSseEvents(text, (event) => {
    const record = event as {
      type?: string
      item?: unknown
      response?: unknown
    }

    if (record.type === 'response.output_item.done') {
      pushUniqueImageCall(output, record.item)
    }

    if (record.type === 'response.completed') {
      for (const item of responseOutputItems(record.response)) {
        pushUniqueImageCall(output, item)
      }
    }

    for (const item of responseOutputItems(record)) {
      pushUniqueImageCall(output, item)
    }

    for (const outputText of collectOutputText(record)) {
      if (!outputTexts.includes(outputText)) {
        outputTexts.push(outputText)
      }
    }
  })

  return { output, output_text: outputTexts.join('\n') }
}

function normalizeResponsesImages(response: unknown, outputFormat: string): GeneratedImage[] {
  const output = responseOutputItems(response)

  return output
    .filter(hasResponseImagePayload)
    .map((item, index) => ({
      id: item.id || `img_${index + 1}`,
      url: null,
      b64Json: pickFirstString(item.result, item.b64_json, item.b64Json, item.image_base64, item.imageBase64),
      mimeType: mimeTypes[outputFormat] || 'image/png',
      revisedPrompt: item.revised_prompt || item.revisedPrompt || null,
    }))
    .filter((image) => Boolean(image.b64Json))
}

function normalizeOutputTextDataUrlImages(response: unknown): GeneratedImage[] {
  const textImages = collectOutputText(response)
    .flatMap(extractDataUrlImagesFromText)

  const seen = new Set<string>()
  return textImages
    .filter((image) => {
      const key = `${image.mimeType}:${image.b64Json}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((image, index) => ({
      id: `img_text_${index + 1}`,
      url: null,
      b64Json: image.b64Json,
      mimeType: image.mimeType,
      revisedPrompt: null,
    }))
}

export function normalizeImages(response: unknown, outputFormat: string): GeneratedImage[] {
  const data = Array.isArray((response as { data?: unknown })?.data)
    ? ((response as { data: RawUpstreamImage[] }).data)
    : []

  if (data.length > 0) {
    return data.map((image, index) => ({
      id: image.id || `img_${index + 1}`,
      url: image.url || null,
      b64Json: image.b64_json || image.b64Json || null,
      mimeType: mimeTypes[outputFormat] || 'image/png',
      revisedPrompt: image.revised_prompt || image.revisedPrompt || null,
    }))
  }

  const responsesImages = normalizeResponsesImages(response, outputFormat)
  if (responsesImages.length > 0) return responsesImages

  return normalizeOutputTextDataUrlImages(response)
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
  model?: string
}): ResolvedError {
  const status = error?.status
  const upstreamCode = error?.code
  const upstreamMessage = (error?.message ?? '').toLowerCase()
  const model = error?.model ?? ''
  const isPriorityModel = model.toLowerCase().includes('priority')
  const modelAdvice = model.toLowerCase().includes('priority')
    ? '当前使用的是 priority 模型/通道，建议先切回普通模型再试。'
    : (model
      ? '如果该模型持续失败，请换一个普通模型或在中转站后台确认该模型的图片额度。'
      : '如果当前没有显式指定模型，请先指定一个已在 /models 中出现的可用模型。')
  const isQuotaError =
    upstreamCode === 'insufficient_quota'
    || upstreamCode === 'billing_hard_limit_reached'
    || upstreamCode === 'billing_limit_user_error'
    || upstreamMessage.includes('billing hard limit')
    || upstreamMessage.includes('insufficient')
    || upstreamMessage.includes('quota')
    || upstreamMessage.includes('no credit')
    || upstreamMessage.includes('credit')
    || upstreamMessage.includes('balance')
    || upstreamMessage.includes('额度')
    || upstreamMessage.includes('余额')

  if (isQuotaError) {
    return {
      status: 429,
      code: isPriorityModel ? 'PRIORITY_QUOTA_INSUFFICIENT' : 'INSUFFICIENT_QUOTA',
      message: `中转站提示额度、余额或账单限制。这不一定代表 Key 整体无效；可能只是当前模型、图片额度、priority 渠道或上游线路没有额度。${modelAdvice} 请在中转站后台核对 Key 所属账号、模型权限和请求 ID。`,
    }
  }

  // 上游中转站"背后真实供应商全部熔断/无可用线路"——常见于负载型中转站，
  // 表现为 503 + "no available upstream"。这不是 key/url/CORS/分辨率问题，
  // 而是该模型在中转站侧当前无货。给出可操作建议：换模型或稍后再试。
  if (
    status === 503
    || upstreamCode === 'bad_response_status_code'
    || upstreamMessage.includes('no available upstream')
    || upstreamMessage.includes('all cooled')
  ) {
    return {
      status: 503,
      code: 'UPSTREAM_UNAVAILABLE',
      message: `中转站暂时没有可用的上游线路（该模型线路全部熔断、冷却中或当前通道无额度）。这不一定代表 Key 整体无效。${modelAdvice} 也可以稍后重试。`,
    }
  }

  if (status === 401 || status === 403 || upstreamCode === 'invalid_api_key') {
    return {
      status: 401,
      code: 'INVALID_API_KEY',
      message: 'API Key 无效或无权限，请检查「设置」中的 baseUrl 与 Key',
    }
  }

  if (
    upstreamCode === 'model_not_found'
    || upstreamCode === 'invalid_model'
    || upstreamMessage.includes('invalid model')
    || upstreamMessage.includes('model not found')
    || upstreamMessage.includes('model does not exist')
    || upstreamMessage.includes('unknown model')
    || upstreamMessage.includes('unsupported model')
    || upstreamMessage.includes('not support this model')
    || upstreamMessage.includes('not supported model')
  ) {
    return {
      status: status ?? 400,
      code: 'MODEL_NOT_SUPPORTED',
      message: `当前模型不被这个中转站、渠道或端点支持。${modelAdvice}`,
    }
  }

  if (
    status === 404
    || status === 405
    || status === 415
    || status === 501
    || upstreamMessage.includes('endpoint')
    || upstreamMessage.includes('route')
    || upstreamMessage.includes('path not found')
    || upstreamMessage.includes('method not allowed')
    || upstreamMessage.includes('/responses')
    || upstreamMessage.includes('/images/generations')
  ) {
    return {
      status: status ?? 400,
      code: 'ENDPOINT_NOT_SUPPORTED',
      message: '当前中转站不支持所选图片调用端点。请切换生成模式，或在自动检测后使用该站实际可用的图片路径。',
    }
  }

  // 上游明确拒绝了请求尺寸（如 4096 不被该模型/中转站支持）。
  // 交给调用方据此触发自学习：锁定对应分辨率档。
  if (
    upstreamMessage.includes('invalid size')
    || upstreamMessage.includes('unsupported size')
    || upstreamMessage.includes('size not supported')
    || upstreamMessage.includes('size is not')
    || (upstreamMessage.includes('size') && upstreamMessage.includes('not supported'))
  ) {
    return {
      status: 400,
      code: 'SIZE_NOT_SUPPORTED',
      message: '上游不支持当前选择的尺寸，已为你记住并在该中转站下隐藏这一档。请换用更低的分辨率。',
    }
  }

  if (status === 429 || upstreamCode === 'rate_limit_exceeded') {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message: `上游请求频率过高或当前通道被临时限流。请稍后再试；如果反复出现，${modelAdvice}`,
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
      message: `${error?.message || '上游拒绝了当前图片生成参数'}。请确认当前模式、模型和端点匹配：传统模式使用 /images/generations，Responses tool 模式使用 /responses + image_generation。${modelAdvice}`,
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
      message: '连接已中断或上游响应超时。请求可能已经被中转站接收并计费，请先用 request ID 核对后台；随后可降低分辨率、切换普通模型或稍后重试。',
    }
  }

  if (error?.name === 'TypeError') {
    return {
      status: 502,
      code: 'NETWORK_ERROR',
      message: '连接中断，浏览器无法读取上游响应；请求可能已被上游接收并计费。请先核对 request ID，再检查 baseUrl、网络与中转站的 CORS/TLS 配置。',
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
    modelSelection: payload.modelSelection,
    mode: payload.mode,
    responseModel: payload.responseModel,
    imageToolModel: payload.imageToolModel,
    stream: payload.stream,
    streamingWait: payload.streamingWait,
    transparentBackground: payload.transparentBackground,
    partialPreview: payload.partialPreview,
    partialImages: payload.partialImages,
    referenceImages: payload.referenceImages,
    inpaintMask: payload.inpaintMask,
  })
}
