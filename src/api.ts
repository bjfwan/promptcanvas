import { snapshotProviderConfig } from './composables/useProviderConfig'
import { detectResolutionTiers, type ResolutionTierDetection } from './composables/useDiscoveredModels'
import {
  buildPrompt,
  buildImagesEditsFormData,
  buildResponsesImageRequest,
  buildResponsesTextDataUrlRequest,
  imageGenerationsModelFor,
  isResponsesImageModel,
  normalizeImages,
  parseResponsesImageSseBlock,
  parseResponsesImageSse,
  payloadToValidated,
  responsesImageProgressFromEvent,
  resolveOpenAIError,
  visitResponsesImageSseEvents,
  type ResponsesImageProgress,
} from './lib/imagesApi'
import {
  detectImageGenerationConfig,
  modelIdsFromEntries,
  normalizeImageGenerationConfig,
  parseOpenAIModelsResponse,
} from './lib/imageGenerationDetection'
import {
  logBanner,
  logGroup,
  maskKey,
  nowMs,
  safeHostname,
  snapshotResponseHeaders,
} from './lib/debugLog'
import type {
  GenerateImageRequest,
  GenerateImageResponse,
  HealthResponse,
  ImageGenerationConfig,
} from './types'

export const PROVIDER_NOT_CONFIGURED = 'PROVIDER_NOT_CONFIGURED'

export class ApiRequestError extends Error {
  code?: string
  requestId?: string

  constructor(message: string, code?: string, requestId?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code
    this.requestId = requestId
  }
}

const MINUTE_MS = 60_000

// Client-side generation timeout, scaled by resolution tier. 4K relays can
// legitimately take 10+ minutes, so keep this well above the expected render
// time; aborting early is worse because the upstream may still bill the call.
function timeoutForSize(size: string): number {
  if (/^(4096|6144)/.test(size)) return 25 * MINUTE_MS
  if (/^(2048|3072)/.test(size)) return 12 * MINUTE_MS
  return 180_000
}

function formatDurationMs(ms: number): string {
  if (ms >= MINUTE_MS) return `${Math.round(ms / MINUTE_MS)} 分钟`
  return `${Math.round(ms / 1000)} 秒`
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `req_${crypto.randomUUID()}`
  }
  return `req_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

async function readJson<T = unknown>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

export type GenerationProgressEvent =
  | { stage: 'awaiting' }
  | { stage: 'downloading'; bytesReceived: number; bytesTotal?: number }
  | { stage: 'finalizing' }
  | { stage: 'responses_sse'; progress: ResponsesImageProgress }

async function readTextStreamed(
  response: Response,
  onBytes?: (bytesReceived: number, bytesTotal?: number) => void,
): Promise<string> {
  const reader = response.body?.getReader?.()
  if (!reader) {
    return readText(response)
  }

  const contentLengthHeader = response.headers.get('content-length')
  const parsedLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : Number.NaN
  const bytesTotal = Number.isFinite(parsedLength) && parsedLength > 0 ? parsedLength : undefined

  const chunks: Uint8Array[] = []
  let received = 0
  onBytes?.(0, bytesTotal)

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value && value.byteLength > 0) {
      chunks.push(value)
      received += value.byteLength
      onBytes?.(received, bytesTotal)
    }
  }

  if (chunks.length === 0) return ''

  const combined = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder('utf-8').decode(combined)
}

async function readJsonStreamed<T = unknown>(
  response: Response,
  onBytes?: (bytesReceived: number, bytesTotal?: number) => void,
): Promise<T | null> {
  const text = await readTextStreamed(response, onBytes)
  if (!text) return null

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function readResponsesBodyStreamed(
  response: Response,
  onBytes?: (bytesReceived: number, bytesTotal?: number) => void,
  onResponsesEvent?: (event: unknown) => void,
): Promise<unknown> {
  const reader = response.body?.getReader?.()
  if (!reader) {
    const text = await readText(response)
    visitResponsesImageSseEvents(text, onResponsesEvent ?? (() => {}))
    if (!text) return null

    try {
      return JSON.parse(text)
    } catch {
      return parseResponsesImageSse(text)
    }
  }

  const contentLengthHeader = response.headers.get('content-length')
  const parsedLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : Number.NaN
  const bytesTotal = Number.isFinite(parsedLength) && parsedLength > 0 ? parsedLength : undefined

  const decoder = new TextDecoder('utf-8')
  const chunks: string[] = []
  let received = 0
  let pending = ''
  onBytes?.(0, bytesTotal)

  const dispatchBlock = (block: string) => {
    const event = parseResponsesImageSseBlock(block)
    if (!event) return
    onResponsesEvent?.(event)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value || value.byteLength === 0) continue

    received += value.byteLength
    onBytes?.(received, bytesTotal)

    const chunk = decoder.decode(value, { stream: true })
    chunks.push(chunk)
    pending += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    const blocks = pending.split(/\n\n+/)
    pending = blocks.pop() ?? ''
    for (const block of blocks) {
      dispatchBlock(block)
    }
  }

  const tail = decoder.decode()
  if (tail) {
    chunks.push(tail)
    pending += tail.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  }
  if (pending.trim()) {
    dispatchBlock(pending)
  }

  const text = chunks.join('')
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return parseResponsesImageSse(text)
  }
}

async function readText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

interface UpstreamErrorBody {
  error?: {
    code?: string
    message?: string
    type?: string
  }
}

interface BuiltRequest {
  url: string
  headers: Record<string, string>
  via: 'direct' | 'proxy'
  upstreamBase: string
  pathOnUpstream: string
}

interface GenerationRequestCandidate {
  built: BuiltRequest
  requestBody: BodyInit
  requestMode: string
  responsesRequest: Record<string, unknown> | null
  imageRequest?: Record<string, unknown>
  editFields?: Record<string, unknown>
  canRetryWithNextRoute: boolean
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function isRouteCompatibilityError(status: number, mapped: { code: string }, rawMessage?: string): boolean {
  if (mapped.code === 'SIZE_NOT_SUPPORTED') return false
  if (status === 404 || status === 405 || status === 415 || status === 501) return true
  if (status !== 400) return false

  const message = (rawMessage || '').toLowerCase()
  return (
    message.includes('invalid model')
    || message.includes('model not found')
    || message.includes('model does not exist')
    || message.includes('unknown model')
    || message.includes('unsupported model')
    || message.includes('not support this model')
    || message.includes('not supported model')
    || message.includes('endpoint')
    || message.includes('route')
    || message.includes('path')
    || message.includes('/responses')
    || message.includes('/images/generations')
  )
}

function summarizeReferenceImages(
  referenceImages: Array<{
    id: string
    name: string
    mimeType: string
    sizeBytes: number
  }>,
) {
  return referenceImages.map((image, index) => ({
    index,
    id: image.id,
    name: image.name,
    mimeType: image.mimeType,
    sizeKb: Math.round(image.sizeBytes / 1024),
  }))
}

function summarizeResponsesRequestBody(body: Record<string, unknown>) {
  const input = Array.isArray(body.input) ? body.input : []
  const content = input.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const maybeContent = (entry as { content?: unknown }).content
    return Array.isArray(maybeContent) ? maybeContent : []
  })
  const inputImages = content.filter((item) => {
    return Boolean(item && typeof item === 'object' && (item as { type?: unknown }).type === 'input_image')
  })
  const inputText = content.find((item) => {
    return Boolean(item && typeof item === 'object' && (item as { type?: unknown }).type === 'input_text')
  }) as { text?: unknown } | undefined

  return {
    ...body,
    input: [{
      role: 'user',
      content: [
        {
          type: 'input_text',
          textPreview: typeof inputText?.text === 'string' ? inputText.text.slice(0, 240) : '',
        },
        ...inputImages.map((item, index) => {
          const imageUrl = (item as { image_url?: unknown }).image_url
          const url = typeof imageUrl === 'string' ? imageUrl : ''
          return {
            type: 'input_image',
            index,
            isDataUrl: /^data:/i.test(url),
            isHttpUrl: /^https?:\/\//i.test(url),
            length: url.length,
            preview: url.slice(0, 48),
          }
        }),
      ],
    }],
  }
}

function summarizeResponseImages(data: unknown) {
  const imageData = Array.isArray((data as { data?: unknown })?.data)
    ? ((data as { data: unknown[] }).data)
    : []
  if (imageData.length > 0) {
    return {
      responseShape: 'images',
      itemCount: imageData.length,
      firstItem: summarizeImageItem(imageData[0]),
    }
  }

  const output = Array.isArray((data as { output?: unknown })?.output)
    ? ((data as { output: unknown[] }).output)
    : (Array.isArray((data as { response?: { output?: unknown } })?.response?.output)
      ? ((data as { response: { output: unknown[] } }).response.output)
      : [])
  const imageCalls = output.filter((item) => {
    return Boolean(item && typeof item === 'object' && (item as { type?: unknown }).type === 'image_generation_call')
  })

  return {
    responseShape: 'responses',
    itemCount: imageCalls.length,
    firstItem: summarizeImageItem(imageCalls[0]),
  }
}

function summarizeImageItem(item: unknown) {
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, unknown>
  const b64 = typeof record.result === 'string'
    ? record.result
    : (typeof record.b64_json === 'string'
      ? record.b64_json
      : (typeof record.image_base64 === 'string' ? record.image_base64 : ''))
  return {
    hasUrl: typeof record.url === 'string' && record.url.length > 0,
    hasB64: b64.length > 0,
    urlPreview: typeof record.url === 'string' ? record.url.slice(0, 80) : null,
    b64Bytes: b64.length,
    keys: Object.keys(record),
  }
}

async function getHtmlErrorMessage(response: Response): Promise<string | null> {
  try {
    const text = await response.text()
    if (!/<html[\s>]/i.test(text)) return null
    
    const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (titleMatch && titleMatch[1].trim()) return titleMatch[1].trim()
    
    const h1Match = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    if (h1Match && h1Match[1].trim()) return h1Match[1].trim()
    
    return `HTTP ${response.status} (HTML Response)`
  } catch {
    return null
  }
}

function buildRequest(
  baseUrl: string,
  proxyUrl: string,
  path: string,
  baseHeaders: Record<string, string>,
): BuiltRequest {
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const cleanProxy = proxyUrl.trim().replace(/\/+$/, '')

  if (cleanProxy) {
    return {
      url: `${cleanProxy}${cleanPath}`,
      headers: {
        ...baseHeaders,
        'X-Upstream-Base': cleanBase,
      },
      via: 'proxy',
      upstreamBase: cleanBase,
      pathOnUpstream: cleanPath,
    }
  }

  return {
    url: `${cleanBase}${cleanPath}`,
    headers: { ...baseHeaders },
    via: 'direct',
    upstreamBase: cleanBase,
    pathOnUpstream: cleanPath,
  }
}

function applyImageGenerationDefaults(
  payload: GenerateImageRequest,
  provider: ReturnType<typeof snapshotProviderConfig>,
): GenerateImageRequest {
  const config = normalizeImageGenerationConfig(provider.imageGeneration)
  const modelSelection = payload.modelSelection ?? (payload.model ? 'explicit' : 'auto')
  const useDetectedModels = modelSelection === 'auto'
  const explicitModel = modelSelection === 'explicit' ? payload.model : undefined
  const configuredMode = config.generationMode || config.mode
  const inferredMode = configuredMode === 'auto'
    ? (config.responseModel && config.imageToolModel
      ? 'responses_tool'
      : (config.responseModel && config.returnFormat === 'output_text_data_url'
        ? 'responses_text_data_url'
        : (config.traditionalModel ? 'images_generations' : undefined)))
    : configuredMode

  if (!inferredMode) return payload

  if (inferredMode === 'responses_tool') {
    const responseModel = payload.responseModel
      || explicitModel
      || (useDetectedModels ? config.responseModel : undefined)
    return {
      ...payload,
      modelSelection,
      mode: payload.mode ?? 'responses_tool',
      model: explicitModel || (useDetectedModels ? responseModel : undefined),
      responseModel: useDetectedModels || explicitModel ? responseModel : payload.responseModel,
      imageToolModel: payload.imageToolModel || (useDetectedModels ? config.imageToolModel : undefined),
      stream: payload.stream ?? config.stream,
    }
  }

  if (inferredMode === 'responses_text_data_url') {
    const responseModel = payload.responseModel
      || explicitModel
      || (useDetectedModels ? (config.responseModel || config.traditionalModel) : undefined)
    return {
      ...payload,
      modelSelection,
      mode: payload.mode ?? 'responses_text_data_url',
      model: explicitModel || (useDetectedModels ? (config.traditionalModel || responseModel) : undefined),
      responseModel: useDetectedModels || explicitModel ? responseModel : payload.responseModel,
      stream: payload.stream ?? config.stream,
    }
  }

  return {
    ...payload,
    modelSelection,
    mode: payload.mode ?? 'images_generations',
    model: explicitModel || (useDetectedModels ? config.traditionalModel : undefined),
    stream: payload.stream ?? config.stream,
  }
}

export async function generateImage(
  payload: GenerateImageRequest,
  options?: {
    signal?: AbortSignal
    onProgress?: (event: GenerationProgressEvent) => void
  },
): Promise<GenerateImageResponse> {
  const provider = snapshotProviderConfig()
  const apiKey = (payload.apiKey ?? provider.apiKey ?? '').trim()
  const baseUrl = (payload.baseUrl ?? provider.baseUrl ?? '').trim().replace(/\/+$/, '')
  const proxyUrl = (provider.proxyUrl ?? '').trim().replace(/\/+$/, '')
  const requestId = generateRequestId()

  const group = logGroup(`generateImage → ${safeHostname(baseUrl)} · ${requestId}`)
  group.log('requestId', requestId)
  group.log('baseUrl', baseUrl)
  group.log('apiKey', maskKey(apiKey))
  group.log('proxyUrl', proxyUrl || '<direct, no proxy>')
  group.log('inbound payload', payload)

  let timeoutTimer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  let onExternalAbort: (() => void) | undefined

  try {
    if (!apiKey || !baseUrl) {
      group.warn('missing credentials → throwing PROVIDER_NOT_CONFIGURED')
      throw new ApiRequestError(
        '尚未配置 API 服务商，请打开右上角「设置」填入 API 端点和 API Key。',
        PROVIDER_NOT_CONFIGURED,
        requestId,
      )
    }

    if (apiKey === 'sk-xxxx') {
      group.warn('apiKey is sk-xxxx placeholder → throwing INVALID_REQUEST')
      throw new ApiRequestError(
        'apiKey 不能是占位值 sk-xxxx，请填写真实 Key',
        'INVALID_REQUEST',
        requestId,
      )
    }

    let parsedBaseUrl: URL
    try {
      parsedBaseUrl = new URL(baseUrl)
    } catch {
      group.error('baseUrl is not a valid URL')
      throw new ApiRequestError('baseUrl 不是合法 URL', 'INVALID_REQUEST', requestId)
    }
    if (parsedBaseUrl.protocol !== 'https:' && parsedBaseUrl.protocol !== 'http:') {
      group.error(`baseUrl protocol "${parsedBaseUrl.protocol}" is not http(s)`)
      throw new ApiRequestError('baseUrl 必须是 http(s) 协议', 'INVALID_REQUEST', requestId)
    }

    const validation = payloadToValidated(applyImageGenerationDefaults(payload, provider))
    if (validation.error || !validation.value) {
      group.warn('validation failed', validation.error)
      throw new ApiRequestError(
        validation.error ?? '请求参数校验失败',
        'INVALID_REQUEST',
        requestId,
      )
    }

    const validated = validation.value
    const promptText = buildPrompt(validated)
    const hasReferenceImages = validated.referenceImages.length > 0
    const configuredGeneration = provider.imageGeneration
    const normalizedGeneration = normalizeImageGenerationConfig(configuredGeneration)
    const configuredMode = normalizedGeneration.generationMode === 'responses_tool'
      || normalizedGeneration.generationMode === 'images_generations'
      || normalizedGeneration.generationMode === 'responses_text_data_url'
      ? normalizedGeneration.generationMode
      : undefined
    const selectedMode = validated.mode ?? configuredMode
    const explicitMode = selectedMode !== undefined
    const useModelDefaults = validated.modelSelection !== 'none'
    const useResponsesToolApi = selectedMode === 'responses_tool'
      || (!selectedMode && isResponsesImageModel(validated.responseModel || normalizedGeneration.responseModel || validated.model))
    const useResponsesTextDataUrlApi = selectedMode === 'responses_text_data_url'
    const responsesModel = validated.responseModel
      || validated.model
      || (useModelDefaults ? normalizedGeneration.responseModel : '')
      || (useModelDefaults ? normalizedGeneration.traditionalModel : '')
      || ''
    const traditionalModel = validated.model || (useModelDefaults ? normalizedGeneration.traditionalModel : '') || ''
    const imageToolModel = validated.imageToolModel
      || (useModelDefaults ? normalizedGeneration.imageToolModel : '')
      || (useModelDefaults ? imageGenerationsModelFor(responsesModel) : '')
      || ''
    const baseImageRequest: Record<string, unknown> = {
      prompt: promptText,
      size: validated.size,
      n: validated.count,
      output_format: validated.outputFormat,
      quality: validated.quality,
      // Some OpenAI-compatible relays reject response_format for gpt-image-*.
      // normalizeImages accepts either b64_json or url, so let the relay choose
      // its default response shape.
      user: requestId,
    }

    if (validated.transparentBackground && validated.outputFormat === 'png') {
      baseImageRequest.background = 'transparent'
    }

    const buildImageRequest = (model: string) => {
      const request = { ...baseImageRequest }
      if (model) request.model = model
      return request
    }

    const requestCandidates: GenerationRequestCandidate[] = []
    const addTextGenerationCandidate = (model: string, requestMode: string, canRetryWithNextRoute: boolean) => {
      const imageRequest = buildImageRequest(model)
      requestCandidates.push({
        built: buildRequest(baseUrl, proxyUrl, '/images/generations', {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Pc-Request-Id': requestId,
        }),
        requestBody: JSON.stringify(imageRequest),
        requestMode,
        responsesRequest: null,
        imageRequest,
        canRetryWithNextRoute,
      })
    }

    const addResponsesToolCandidate = async (requestMode: string, canRetryWithNextRoute: boolean) => {
      const responsesRequest = await buildResponsesImageRequest({
          prompt: promptText,
          size: validated.size,
          count: validated.count,
          outputFormat: validated.outputFormat,
          quality: validated.quality,
          model: responsesModel,
          responseModel: responsesModel,
          imageToolModel,
          referenceImages: validated.referenceImages,
          mask: validated.inpaintMask,
          stream: validated.stream ?? normalizedGeneration.stream ?? true,
          transparentBackground: validated.transparentBackground,
          partialPreview: validated.partialPreview,
          partialImages: validated.partialImages,
        })
      requestCandidates.push({
        built: buildRequest(baseUrl, proxyUrl, '/responses', {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Pc-Request-Id': requestId,
        }),
        requestBody: JSON.stringify(responsesRequest),
        requestMode,
        responsesRequest,
        canRetryWithNextRoute,
      })
    }

    const addResponsesTextDataUrlCandidate = async (requestMode: string, canRetryWithNextRoute: boolean) => {
      const responsesRequest = await buildResponsesTextDataUrlRequest({
        prompt: promptText,
        size: validated.size,
        count: validated.count,
        outputFormat: validated.outputFormat,
        quality: validated.quality,
        model: responsesModel || traditionalModel,
        responseModel: responsesModel || traditionalModel,
        referenceImages: validated.referenceImages,
        mask: validated.inpaintMask,
        stream: validated.stream ?? normalizedGeneration.stream ?? true,
        transparentBackground: validated.transparentBackground,
      })
      requestCandidates.push({
        built: buildRequest(baseUrl, proxyUrl, '/responses', {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Pc-Request-Id': requestId,
        }),
        requestBody: JSON.stringify(responsesRequest),
        requestMode,
        responsesRequest,
        canRetryWithNextRoute,
      })
    }

    const addImagesEditCandidate = async (canRetryWithNextRoute: boolean) => {
      const editFields = {
        prompt: promptText,
        size: validated.size,
        n: validated.count,
        output_format: validated.outputFormat,
        quality: validated.quality,
        user: requestId,
        model: traditionalModel || undefined,
      }
      requestCandidates.push({
        built: buildRequest(baseUrl, proxyUrl, '/images/edits', {
          Authorization: `Bearer ${apiKey}`,
          'X-Pc-Request-Id': requestId,
        }),
        requestBody: await buildImagesEditsFormData(
          {
            prompt: promptText,
            size: validated.size,
            count: validated.count,
            outputFormat: validated.outputFormat,
            quality: validated.quality,
            model: traditionalModel,
            referenceImages: validated.referenceImages,
            mask: typeof validated.inpaintMask === 'string' ? undefined : validated.inpaintMask,
          },
          requestId,
        ),
        requestMode: 'reference-edit',
        responsesRequest: null,
        editFields,
        canRetryWithNextRoute,
      })
    }

    if (useResponsesToolApi && !hasReferenceImages && !validated.inpaintMask) {
      await addResponsesToolCandidate('responses-text-generate', true)
      if (!explicitMode) {
        const imageModels = uniqueStrings([
          imageGenerationsModelFor(responsesModel),
          responsesModel,
        ])
        imageModels.forEach((model, index) => {
          addTextGenerationCandidate(
            model,
            model === responsesModel ? 'text-generate-chat-model' : 'text-generate-model-alias',
            index < imageModels.length - 1,
          )
        })
      }
    } else if (useResponsesToolApi) {
      await addResponsesToolCandidate(
        hasReferenceImages ? 'responses-reference-edit' : 'responses-text-generate',
        false,
      )
    } else if (useResponsesTextDataUrlApi) {
      if (hasReferenceImages && traditionalModel && typeof validated.inpaintMask !== 'string') {
        await addImagesEditCandidate(false)
      } else {
        await addResponsesTextDataUrlCandidate(
          hasReferenceImages ? 'responses-text-data-url-reference' : 'responses-text-data-url-generate',
          false,
        )
      }
    } else {
      if (hasReferenceImages) {
        await addImagesEditCandidate(false)
      } else {
        addTextGenerationCandidate(traditionalModel, 'text-generate', false)
      }
    }

    const logCandidate = (candidate: GenerationRequestCandidate, index: number) => {
      group.log(`route via ${candidate.built.via}`)
      if (requestCandidates.length > 1) {
        group.log('route candidate', `${index + 1}/${requestCandidates.length}`)
      }
      group.log('upstream targetUrl', candidate.built.url)
      group.log('upstream method', 'POST')
      group.log('upstream headers', {
        ...candidate.built.headers,
        Authorization: `Bearer ${maskKey(apiKey)}`,
      })
      group.log('request mode', candidate.requestMode)
      if (candidate.responsesRequest) {
        group.log('upstream body (parsed)', summarizeResponsesRequestBody(candidate.responsesRequest))
        group.log('upstream body (json)', JSON.stringify(summarizeResponsesRequestBody(candidate.responsesRequest)))
      } else if (candidate.editFields) {
        group.log('reference images', summarizeReferenceImages(validated.referenceImages))
        group.log('inpaint mask', validated.inpaintMask && typeof validated.inpaintMask !== 'string' ? `${Math.round(validated.inpaintMask.size / 1024)}KB` : 'none')
        group.log('upstream body (fields)', candidate.editFields)
      } else {
        group.log('upstream body (parsed)', candidate.imageRequest)
        group.log('upstream body (json)', JSON.stringify(candidate.imageRequest))
      }
    }

    // Merge the caller's abort signal with our own resolution-scaled timeout.
    // Either firing aborts the fetch; we distinguish the two so a timeout shows
    // billing-safe recovery copy rather than the silent "已取消" path.
    const timeoutMs = timeoutForSize(validated.size)
    const localController = new AbortController()
    onExternalAbort = () => localController.abort()
    if (options?.signal) {
      if (options.signal.aborted) localController.abort()
      else options.signal.addEventListener('abort', onExternalAbort, { once: true })
    }
    timeoutTimer = setTimeout(() => {
      timedOut = true
      localController.abort()
    }, timeoutMs)
    group.log('client timeout (ms)', timeoutMs)

    const requestStartedAt = nowMs()
    options?.onProgress?.({ stage: 'awaiting' })
    let upstream: Response | null = null
    let successfulCandidate: GenerationRequestCandidate | null = null

    for (let candidateIndex = 0; candidateIndex < requestCandidates.length; candidateIndex += 1) {
      const candidate = requestCandidates[candidateIndex]
      logCandidate(candidate, candidateIndex)
      const attemptStartedAt = nowMs()
      try {
        upstream = await fetch(candidate.built.url, {
          method: 'POST',
          headers: candidate.built.headers,
          body: candidate.requestBody,
          signal: localController.signal,
        })
      } catch (error) {
        const err = error as Error
        const elapsedMs = Math.round(nowMs() - requestStartedAt)

      if (timedOut) {
        group.warn(`fetch aborted by client timeout after ${elapsedMs}ms`)
        throw new ApiRequestError(
          `生成等待超过 ${formatDurationMs(timeoutMs)} 已停止等待。上游可能已经出图并计费——请凭请求 ID 到中转站后台核对，重试是安全的。`,
          'CLIENT_TIMEOUT',
          requestId,
        )
      }

      if (err?.name === 'AbortError' || options?.signal?.aborted) {
        group.warn(`fetch aborted by user after ${elapsedMs}ms`)
        throw new ApiRequestError('已取消生成', 'ABORTED', requestId)
      }

      group.error(`fetch threw after ${elapsedMs}ms`, {
        name: err?.name,
        message: err?.message,
        requestMode: candidate.requestMode,
      })
      group.error(
        '↑ Browser fetch failed before JS could read the response. This can be CORS, TLS/proxy abort, ' +
          'or a gateway timeout. The upstream may still have accepted and billed the request; ' +
          'check the request ID before retrying.',
      )
      const mapped = resolveOpenAIError({
        name: err?.name,
        message: err?.message,
        model: responsesModel || traditionalModel,
      })
      throw new ApiRequestError(mapped.message, mapped.code, requestId)
    }

    // Headers arrived — the upstream is responding. Clear the wait timeout so a
    // slow but progressing download isn't killed mid-stream; the streaming
    // progress UI and manual cancel (still wired to the external signal) cover
    // this phase.
    const elapsedMs = Math.round(nowMs() - attemptStartedAt)
    group.log(
      `response.status ${upstream.status} ${upstream.statusText} (${elapsedMs}ms)`,
    )
    group.log('response.headers (visible to JS)', snapshotResponseHeaders(upstream))
    group.log('response.type', upstream.type)
    group.log('response.url', upstream.url)
    group.log(
      'note',
      'Access-Control-Allow-Origin 通常对 JS 不可读，但只要 fetch 没抛 TypeError，就说明浏览器侧 CORS 通过',
    )

    if (!upstream.ok) {
      const htmlError = await getHtmlErrorMessage(upstream.clone())
      const errorBody = htmlError ? null : await readJson<UpstreamErrorBody>(upstream)
      const rawMessage = htmlError || errorBody?.error?.message || ''
      group.error('upstream returned non-ok', {
        status: upstream.status,
        body: errorBody || htmlError,
      })
      const mapped = resolveOpenAIError({
        status: upstream.status,
        code: errorBody?.error?.code,
        message: rawMessage,
        model: candidate.responsesRequest
          ? String(candidate.responsesRequest.model || imageToolModel)
          : String(candidate.imageRequest?.model || traditionalModel || ''),
      })
      const shouldTryNext =
        candidate.canRetryWithNextRoute
        && candidateIndex < requestCandidates.length - 1
        && isRouteCompatibilityError(upstream.status, mapped, rawMessage)

      if (shouldTryNext) {
        group.warn('route candidate rejected before generation; trying next candidate', {
          status: upstream.status,
          code: mapped.code,
          requestMode: candidate.requestMode,
        })
        upstream = null
        continue
      }

      throw new ApiRequestError(mapped.message, mapped.code, requestId)
    }

      // Headers arrived and this is the successful route. Clear the wait
      // timeout so a slow but progressing download is not killed mid-stream.
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
        timeoutTimer = undefined
      }
      successfulCandidate = candidate
      break
    }

    if (!upstream) {
      throw new ApiRequestError('上游没有可用的图片生成路径，请检查模型与中转站接口配置', 'OPENAI_REQUEST_FAILED', requestId)
    }

    const elapsedMs = Math.round(nowMs() - requestStartedAt)

    const data = successfulCandidate?.responsesRequest
      ? await readResponsesBodyStreamed(upstream, undefined, (event) => {
          const progress = responsesImageProgressFromEvent(event, validated.outputFormat)
          if (progress) {
            options?.onProgress?.({ stage: 'responses_sse', progress })
          }
        })
      : await readJsonStreamed<{ data?: unknown }>(upstream, (bytesReceived, bytesTotal) => {
      options?.onProgress?.({ stage: 'downloading', bytesReceived, bytesTotal })
        })
    options?.onProgress?.({ stage: 'finalizing' })
    group.log('response.body summary', summarizeResponseImages(data))

    const images = normalizeImages(data, validated.outputFormat)
    group.log('normalized images', images.length)

    if (!images.length) {
      group.warn('upstream returned empty images array')
      throw new ApiRequestError(
        '上游返回成功，但图片返回格式无法识别。已支持 b64_json、url、image_generation_call 和 output_text data URL；请切换中转站模式或重新自动检测。',
        'RETURN_FORMAT_UNRECOGNIZED',
        requestId,
      )
    }

    group.log('✓ generateImage success', { imageCount: images.length, elapsedMs })

    return {
      requestId,
      images,
      usage: { model: (successfulCandidate?.responsesRequest ? responsesModel : traditionalModel) || undefined },
    }
  } catch (error) {
    if (error instanceof ApiRequestError) {
      group.error('generateImage rejected with ApiRequestError', {
        code: error.code,
        message: error.message,
      })
    } else {
      group.error('generateImage rejected with unexpected error', error)
    }
    throw error
  } finally {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer)
      timeoutTimer = undefined
    }
    if (options?.signal && onExternalAbort) {
      options.signal.removeEventListener('abort', onExternalAbort)
    }
    group.end()
  }
}

export async function checkHealth(): Promise<HealthResponse> {
  const provider = snapshotProviderConfig()
  if (!provider.baseUrl || !provider.apiKey) {
    throw new ApiRequestError(
      '尚未配置 API 服务商，请在「设置」中填入 API 端点和 API Key',
      PROVIDER_NOT_CONFIGURED,
    )
  }

  return {
    ok: true,
    requestId: generateRequestId(),
  }
}

export interface TestProviderResult {
  ok: true
  durationMs: number
  modelCount?: number
  models: string[]
  message: string
  modelsOk: boolean
  generationsCorsOk: boolean
  generationsProbeStatus?: number
  generationRouteOk: boolean
  warnings: string[]
  resolution: ResolutionTierDetection
  imageGeneration: ImageGenerationConfig
}

interface ProbeOutcome {
  ok: boolean
  status?: number
  message?: string
  responseHeaders?: Record<string, string>
  responseBodyPreview?: string
  elapsedMs: number
}

async function probeGenerationsCors(
  baseUrl: string,
  proxyUrl: string,
): Promise<ProbeOutcome> {
  const built = buildRequest(baseUrl, proxyUrl, '/images/generations', {
    'Content-Type': 'text/plain',
  })
  const t0 = nowMs()
  try {
    const response = await fetch(built.url, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: built.headers,
      body: 'cors-probe',
    })
    const elapsedMs = Math.round(nowMs() - t0)
    const responseBodyPreview = (await readText(response)).slice(0, 200)
    return {
      ok: true,
      status: response.status,
      responseHeaders: snapshotResponseHeaders(response),
      responseBodyPreview,
      elapsedMs,
    }
  } catch (error) {
    const elapsedMs = Math.round(nowMs() - t0)
    const err = error as Error
    return {
      ok: false,
      message: err?.message || 'CORS probe failed',
      elapsedMs,
    }
  }
}

export async function testProvider(override?: {
  baseUrl?: string
  apiKey?: string
  proxyUrl?: string
}): Promise<TestProviderResult> {
  const provider = snapshotProviderConfig()
  const apiKey = (override?.apiKey ?? provider.apiKey ?? '').trim()
  const baseUrl = (override?.baseUrl ?? provider.baseUrl ?? '').trim().replace(/\/+$/, '')
  const proxyUrl = (override?.proxyUrl ?? provider.proxyUrl ?? '').trim().replace(/\/+$/, '')
  const requestId = generateRequestId()

  const group = logGroup(`testProvider → ${safeHostname(baseUrl)} · ${requestId}`)
  group.log('requestId', requestId)
  group.log('baseUrl', baseUrl)
  group.log('apiKey', maskKey(apiKey))
  group.log('proxyUrl', proxyUrl || '<direct, no proxy>')

  try {
    if (!apiKey || !baseUrl) {
      group.warn('missing credentials')
      throw new ApiRequestError(
        '请先填写 API 端点和 API Key',
        PROVIDER_NOT_CONFIGURED,
        requestId,
      )
    }

    if (apiKey === 'sk-xxxx') {
      group.warn('apiKey is sk-xxxx placeholder')
      throw new ApiRequestError(
        'apiKey 不能是占位值 sk-xxxx',
        'INVALID_REQUEST',
        requestId,
      )
    }

    let parsedBaseUrl: URL
    try {
      parsedBaseUrl = new URL(baseUrl)
    } catch {
      group.error('baseUrl invalid URL')
      throw new ApiRequestError('baseUrl 不是合法 URL', 'INVALID_REQUEST', requestId)
    }
    if (parsedBaseUrl.protocol !== 'https:' && parsedBaseUrl.protocol !== 'http:') {
      group.error('baseUrl protocol invalid')
      throw new ApiRequestError('baseUrl 必须是 http(s) 协议', 'INVALID_REQUEST', requestId)
    }

    const start = nowMs()

    group.log('---- step 1: GET /models ----')
    const modelsBuilt = buildRequest(baseUrl, proxyUrl, '/models', {
      Authorization: `Bearer ${apiKey}`,
    })
    group.log(`route via ${modelsBuilt.via}`)
    group.log('modelsUrl', modelsBuilt.url)
    group.log('headers', { ...modelsBuilt.headers, Authorization: `Bearer ${maskKey(apiKey)}` })

    let response: Response
    const stepStart = nowMs()
    try {
      response = await fetch(modelsBuilt.url, {
        method: 'GET',
        headers: modelsBuilt.headers,
      })
    } catch (error) {
      const err = error as Error
      const dt = Math.round(nowMs() - stepStart)
      group.error(`/models fetch threw after ${dt}ms`, {
        name: err?.name,
        message: err?.message,
      })
      group.error(
        '↑ /models 阶段就失败了，通常是：DNS 错 / 域名不通 / 中转站完全没开 CORS。',
      )
      const mapped = resolveOpenAIError({
        name: err?.name,
        message: err?.message,
      })
      throw new ApiRequestError(mapped.message, mapped.code, requestId)
    }

    const modelsElapsed = Math.round(nowMs() - stepStart)
    group.log(
      `/models response ${response.status} ${response.statusText} (${modelsElapsed}ms)`,
    )
    group.log('/models headers', snapshotResponseHeaders(response))

    if (!response.ok) {
      const errorBody = await readJson<UpstreamErrorBody>(response)
      group.error('/models returned non-ok', {
        status: response.status,
        body: errorBody,
      })
      const mapped = resolveOpenAIError({
        status: response.status,
        code: errorBody?.error?.code,
        message: errorBody?.error?.message,
      })
      throw new ApiRequestError(
        `${mapped.message}（HTTP ${response.status}）`,
        mapped.code,
        requestId,
      )
    }

    const data = await readJson<{ data?: Array<Record<string, unknown> | string> }>(response)
    const modelEntries = parseOpenAIModelsResponse(data)
    const models = modelIdsFromEntries(modelEntries)
    const modelCount = models.length || (Array.isArray(data?.data) ? data.data.length : undefined)
    group.log('/models parsed count', modelCount)
    group.log('/models first 10 ids', models.slice(0, 10))
    const imageGeneration = await detectImageGenerationConfig({
      models: modelEntries,
      detectedAt: new Date().toISOString(),
    })
    group.log('image generation capability', imageGeneration)

    group.log('---- step 2: POST /images/generations CORS probe (no auth, text/plain) ----')
    group.log(
      'note',
      'simple-request POST：Content-Type=text/plain + 无 Authorization → 浏览器不发预检、上游收到无凭证请求会立刻返回 4xx，不会扣费。',
    )

    const probe = await probeGenerationsCors(baseUrl, proxyUrl)
    if (probe.ok) {
      group.log(
        `probe response ${probe.status} (${probe.elapsedMs}ms)`,
      )
      group.log('probe headers', probe.responseHeaders)
      group.log('probe body preview', probe.responseBodyPreview)
      group.log(
        '✓ probe 收到响应 → /images/generations 错误响应路径的 CORS 工作正常。但仍无法验证 200 成功响应路径的 CORS。',
      )
    } else {
      group.error(`probe fetch threw after ${probe.elapsedMs}ms`, probe.message)
      group.error(
        '↑ /images/generations 路径完全没 CORS 头：浏览器拦截了响应。生成请求会以同样方式失败（且上游可能扣费）。',
      )
    }

    const totalMs = Math.round(nowMs() - start)
    const warnings: string[] = []

    const resolution = detectResolutionTiers(models)
    group.log('resolution heuristic', resolution)
    const selectedGenerationRouteOk = imageGeneration.mode === 'responses_tool'
      || imageGeneration.mode === 'responses_text_data_url'
      || probe.ok

    if (
      !probe.ok
      && imageGeneration.mode !== 'responses_tool'
      && imageGeneration.mode !== 'responses_text_data_url'
    ) {
      warnings.push(
        '/images/generations 路径缺少 CORS 头：浏览器可以发起预检与请求，但读不到响应正文。这意味着上游会照常计费但前端拿不到图。请联系中转站运维补 Access-Control-Allow-Origin（或换一个 CORS 完整的服务商）。',
      )
    }

    const baseMessage = modelCount !== undefined
      ? `已读取 ${modelCount} 个模型 · ${totalMs}ms`
      : `连接成功 · ${totalMs}ms`

    const message = selectedGenerationRouteOk
      ? `连接成功 · ${baseMessage}`
      : `部分通过 · ${baseMessage}（生成路径 CORS 缺失，会失败）`

    group.log('summary', {
      modelsOk: true,
      modelCount,
      generationsCorsOk: probe.ok,
      generationsProbeStatus: probe.status,
      imageGeneration,
      selectedGenerationRouteOk,
      totalMs,
    })

    return {
      ok: true,
      durationMs: totalMs,
      modelCount,
      models,
      message,
      modelsOk: true,
      generationsCorsOk: probe.ok,
      generationsProbeStatus: probe.status,
      generationRouteOk: selectedGenerationRouteOk,
      warnings,
      resolution,
      imageGeneration,
    }
  } catch (error) {
    if (error instanceof ApiRequestError) {
      group.error('testProvider rejected with ApiRequestError', {
        code: error.code,
        message: error.message,
      })
    } else {
      group.error('testProvider rejected with unexpected error', error)
    }
    throw error
  } finally {
    group.end()
  }
}

export function resolveImageSource(image: {
  url?: string | null
  b64Json?: string | null
  mimeType?: string | null
}) {
  if (image.url) {
    return image.url
  }

  if (image.b64Json) {
    return `data:${image.mimeType || 'image/png'};base64,${image.b64Json}`
  }

  return ''
}

if (typeof window !== 'undefined') {
  logBanner('debug logs ON · 关闭：localStorage.setItem("promptcanvas:debug","false") 然后刷新')
}
