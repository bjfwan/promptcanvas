import { snapshotProviderConfig } from './composables/useProviderConfig'
import {
  buildPrompt,
  ensurePngBlob,
  normalizeImages,
  payloadToValidated,
  resolveOpenAIError,
} from './lib/imagesApi'
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

async function buildEditFormData(payload: {
  prompt: string
  size: string
  count: number
  outputFormat: string
  quality: string
  model: string
  referenceImages: Array<{
    name: string
    file?: File
  }>
}, requestId: string) {
  const formData = new FormData()

  formData.set('prompt', payload.prompt)
  formData.set('size', payload.size)
  formData.set('n', String(payload.count))
  formData.set('user', requestId)

  // 移除非标准的 quality 和 outputFormat (response_format)
  // OpenAI 官方编辑接口不支持 quality，response_format 只支持 url/b64_json
  // 我们默认使用 url (即不传该参数)

  if (payload.model) {
    formData.set('model', payload.model)
  }

  if (payload.referenceImages.length > 0) {
    const firstImage = payload.referenceImages[0]
    if (firstImage.file) {
      const pngBlob = await ensurePngBlob(firstImage.file)
      formData.append('image', pngBlob, 'image.png')
    }

    if (payload.referenceImages.length > 1) {
      for (const image of payload.referenceImages.slice(1)) {
        if (image.file) {
          const pngBlob = await ensurePngBlob(image.file)
          formData.append('image[]', pngBlob, 'image.png')
        }
      }
    }
  }

  return formData
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

export async function generateImage(payload: GenerateImageRequest): Promise<GenerateImageResponse> {
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

    const validation = payloadToValidated(payload)
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
    const upstreamRequest: Record<string, unknown> = {
      prompt: promptText,
      size: validated.size,
      n: validated.count,
      output_format: validated.outputFormat,
      quality: validated.quality,
      user: requestId,
    }
    if (validated.model) {
      upstreamRequest.model = validated.model
    }

    const built = hasReferenceImages
      ? buildRequest(baseUrl, proxyUrl, '/images/edits', {
          Authorization: `Bearer ${apiKey}`,
        })
      : buildRequest(baseUrl, proxyUrl, '/images/generations', {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        })
    const requestBody = hasReferenceImages
      ? await buildEditFormData(
          {
            prompt: promptText,
            size: validated.size,
            count: validated.count,
            outputFormat: validated.outputFormat,
            quality: validated.quality,
            model: validated.model,
            referenceImages: validated.referenceImages,
          },
          requestId,
        )
      : JSON.stringify(upstreamRequest)
    group.log(`route via ${built.via}`)
    group.log('upstream targetUrl', built.url)
    group.log('upstream method', 'POST')
    group.log('upstream headers', {
      ...built.headers,
      Authorization: `Bearer ${maskKey(apiKey)}`,
    })
    group.log('request mode', hasReferenceImages ? 'reference-edit' : 'text-generate')
    if (hasReferenceImages) {
      group.log('reference images', summarizeReferenceImages(validated.referenceImages))
      group.log('upstream body (fields)', {
        prompt: promptText,
        size: validated.size,
        n: validated.count,
        output_format: validated.outputFormat,
        quality: validated.quality,
        user: requestId,
        model: validated.model || undefined,
      })
    } else {
      group.log('upstream body (parsed)', upstreamRequest)
      group.log('upstream body (json)', JSON.stringify(upstreamRequest))
    }

    const t0 = nowMs()
    let upstream: Response
    try {
      upstream = await fetch(built.url, {
        method: 'POST',
        headers: built.headers,
        body: requestBody,
      })
    } catch (error) {
      const err = error as Error
      const elapsedMs = Math.round(nowMs() - t0)
      group.error(`fetch threw after ${elapsedMs}ms`, {
        name: err?.name,
        message: err?.message,
      })
      group.error(
        '↑ TypeError on cross-origin fetch usually means: ' +
          '(a) preflight failed (no Access-Control-Allow-Origin on OPTIONS) or ' +
          '(b) actual response missing Access-Control-Allow-Origin. ' +
          '上游可能仍处理了请求并扣费，浏览器只是不让 JS 读响应。',
      )
      const mapped = resolveOpenAIError({
        name: err?.name,
        message: err?.message,
      })
      throw new ApiRequestError(mapped.message, mapped.code, requestId)
    }

    const elapsedMs = Math.round(nowMs() - t0)
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
      group.error('upstream returned non-ok', {
        status: upstream.status,
        body: errorBody || htmlError,
      })
      const mapped = resolveOpenAIError({
        status: upstream.status,
        code: errorBody?.error?.code,
        message: htmlError || errorBody?.error?.message,
      })
      throw new ApiRequestError(mapped.message, mapped.code, requestId)
    }

    const data = await readJson<{ data?: unknown }>(upstream)
    const dataArray = Array.isArray((data as { data?: unknown })?.data)
      ? ((data as { data: unknown[] }).data)
      : []
    group.log('response.body items', dataArray.length)
    if (dataArray.length > 0) {
      const sample = dataArray[0] as Record<string, unknown>
      const summary = sample
        ? {
            hasUrl: typeof sample.url === 'string' && sample.url.length > 0,
            hasB64: typeof sample.b64_json === 'string' && (sample.b64_json as string).length > 0,
            urlPreview: typeof sample.url === 'string' ? (sample.url as string).slice(0, 80) : null,
            b64Bytes: typeof sample.b64_json === 'string' ? (sample.b64_json as string).length : 0,
            keys: Object.keys(sample),
          }
        : null
      group.log('first item summary', summary)
    }

    const images = normalizeImages(data, validated.outputFormat)
    group.log('normalized images', images.length)

    if (!images.length) {
      group.warn('upstream returned empty images array')
      throw new ApiRequestError(
        '上游没有返回图片，请稍后再试',
        'OPENAI_REQUEST_FAILED',
        requestId,
      )
    }

    group.log('✓ generateImage success', { imageCount: images.length, elapsedMs })

    return {
      requestId,
      images,
      usage: { model: validated.model || undefined },
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
  warnings: string[]
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

    const data = await readJson<{ data?: Array<{ id?: unknown } | string> }>(response)
    const rawList = Array.isArray(data?.data) ? data.data : []
    const models = rawList
      .map((entry) => {
        if (typeof entry === 'string') return entry
        const id = (entry as { id?: unknown })?.id
        return typeof id === 'string' ? id : ''
      })
      .filter((id) => id.length > 0)
    const modelCount = models.length || (Array.isArray(data?.data) ? data.data.length : undefined)
    group.log('/models parsed count', modelCount)
    group.log('/models first 10 ids', models.slice(0, 10))

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

    if (!probe.ok) {
      warnings.push(
        '/images/generations 路径缺少 CORS 头：浏览器可以发起预检与请求，但读不到响应正文。这意味着上游会照常计费但前端拿不到图。请联系中转站运维补 Access-Control-Allow-Origin（或换一个 CORS 完整的服务商）。',
      )
    }

    const baseMessage = modelCount !== undefined
      ? `已读取 ${modelCount} 个模型 · ${totalMs}ms`
      : `连接成功 · ${totalMs}ms`

    const message = probe.ok
      ? `连接成功 · ${baseMessage}`
      : `部分通过 · ${baseMessage}（生成路径 CORS 缺失，会失败）`

    group.log('summary', {
      modelsOk: true,
      modelCount,
      generationsCorsOk: probe.ok,
      generationsProbeStatus: probe.status,
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
      warnings,
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
