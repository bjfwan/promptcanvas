import { snapshotProviderConfig } from './composables/useProviderConfig'
import {
  buildPrompt,
  normalizeImages,
  payloadToValidated,
  resolveOpenAIError,
} from './lib/imagesApi'
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

interface UpstreamErrorBody {
  error?: {
    code?: string
    message?: string
    type?: string
  }
}

export async function generateImage(payload: GenerateImageRequest): Promise<GenerateImageResponse> {
  const provider = snapshotProviderConfig()
  const apiKey = (payload.apiKey ?? provider.apiKey ?? '').trim()
  const baseUrl = (payload.baseUrl ?? provider.baseUrl ?? '').trim().replace(/\/+$/, '')
  const requestId = generateRequestId()

  if (!apiKey || !baseUrl) {
    throw new ApiRequestError(
      '尚未配置 API 服务商，请打开右上角「设置」填入 API 端点和 API Key。',
      PROVIDER_NOT_CONFIGURED,
      requestId,
    )
  }

  if (apiKey === 'sk-xxxx') {
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
    throw new ApiRequestError('baseUrl 不是合法 URL', 'INVALID_REQUEST', requestId)
  }
  if (parsedBaseUrl.protocol !== 'https:' && parsedBaseUrl.protocol !== 'http:') {
    throw new ApiRequestError('baseUrl 必须是 http(s) 协议', 'INVALID_REQUEST', requestId)
  }

  const validation = payloadToValidated(payload)
  if (validation.error || !validation.value) {
    throw new ApiRequestError(
      validation.error ?? '请求参数校验失败',
      'INVALID_REQUEST',
      requestId,
    )
  }

  const validated = validation.value
  const upstreamRequest: Record<string, unknown> = {
    prompt: buildPrompt(validated),
    size: validated.size,
    n: validated.count,
    output_format: validated.outputFormat,
    quality: validated.quality,
    user: requestId,
  }
  if (validated.model) {
    upstreamRequest.model = validated.model
  }

  let upstream: Response
  try {
    upstream = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamRequest),
    })
  } catch (error) {
    const err = error as Error
    const mapped = resolveOpenAIError({
      name: err?.name,
      message: err?.message,
    })
    throw new ApiRequestError(mapped.message, mapped.code, requestId)
  }

  if (!upstream.ok) {
    const errorBody = await readJson<UpstreamErrorBody>(upstream)
    const mapped = resolveOpenAIError({
      status: upstream.status,
      code: errorBody?.error?.code,
      message: errorBody?.error?.message,
    })
    throw new ApiRequestError(mapped.message, mapped.code, requestId)
  }

  const data = await readJson<{ data?: unknown }>(upstream)
  const images = normalizeImages(data, validated.outputFormat)
  if (!images.length) {
    throw new ApiRequestError(
      '上游没有返回图片，请稍后再试',
      'OPENAI_REQUEST_FAILED',
      requestId,
    )
  }

  return {
    requestId,
    images,
    usage: { model: validated.model || undefined },
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
  message: string
}

export async function testProvider(override?: {
  baseUrl?: string
  apiKey?: string
}): Promise<TestProviderResult> {
  const provider = snapshotProviderConfig()
  const apiKey = (override?.apiKey ?? provider.apiKey ?? '').trim()
  const baseUrl = (override?.baseUrl ?? provider.baseUrl ?? '').trim().replace(/\/+$/, '')
  const requestId = generateRequestId()

  if (!apiKey || !baseUrl) {
    throw new ApiRequestError(
      '请先填写 API 端点和 API Key',
      PROVIDER_NOT_CONFIGURED,
      requestId,
    )
  }

  if (apiKey === 'sk-xxxx') {
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
    throw new ApiRequestError('baseUrl 不是合法 URL', 'INVALID_REQUEST', requestId)
  }
  if (parsedBaseUrl.protocol !== 'https:' && parsedBaseUrl.protocol !== 'http:') {
    throw new ApiRequestError('baseUrl 必须是 http(s) 协议', 'INVALID_REQUEST', requestId)
  }

  const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
  let response: Response
  try {
    response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
  } catch (error) {
    const err = error as Error
    const mapped = resolveOpenAIError({
      name: err?.name,
      message: err?.message,
    })
    throw new ApiRequestError(mapped.message, mapped.code, requestId)
  }

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const durationMs = Math.round(now - start)

  if (!response.ok) {
    const errorBody = await readJson<UpstreamErrorBody>(response)
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

  const data = await readJson<{ data?: unknown[] }>(response)
  const modelCount = Array.isArray(data?.data) ? data.data.length : undefined

  return {
    ok: true,
    durationMs,
    modelCount,
    message: modelCount !== undefined
      ? `连接成功 · ${modelCount} 个模型 · ${durationMs}ms`
      : `连接成功 · ${durationMs}ms`,
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
