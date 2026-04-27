import { snapshotProviderConfig } from './composables/useProviderConfig'
import type { ApiErrorResponse, GenerateImageRequest, GenerateImageResponse, HealthResponse } from './types'

const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

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

async function readJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null)
}

function resolveErrorMessage(data: ApiErrorResponse | null, fallback: string) {
  return data?.error?.message || fallback
}

export async function generateImage(payload: GenerateImageRequest): Promise<GenerateImageResponse> {
  const provider = snapshotProviderConfig()
  const apiKey = (payload.apiKey ?? provider.apiKey ?? '').trim()
  const providerBaseUrl = (payload.baseUrl ?? provider.baseUrl ?? '').trim().replace(/\/+$/, '')

  if (!apiKey || !providerBaseUrl) {
    throw new ApiRequestError(
      '尚未配置 API 服务商，请打开右上角「设置」填入 API 端点和 API Key。',
      PROVIDER_NOT_CONFIGURED,
    )
  }

  const body = {
    ...payload,
    apiKey,
    baseUrl: providerBaseUrl,
  }

  const response = await fetch(`${baseUrl}/api/images/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await readJson<GenerateImageResponse & ApiErrorResponse>(response)

  if (!response.ok) {
    const message = resolveErrorMessage(data, `请求失败，状态码：${response.status}`)
    throw new ApiRequestError(message, data?.error?.code, data?.requestId)
  }

  if (!data?.images?.length) {
    throw new Error('后端没有返回图片，请检查接口返回格式。')
  }

  return data
}

export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${baseUrl}/api/health`)
  const data = await readJson<HealthResponse & ApiErrorResponse>(response)

  if (!response.ok) {
    const message = resolveErrorMessage(data, `后端状态检查失败，状态码：${response.status}`)
    throw new ApiRequestError(message, data?.error?.code, data?.requestId)
  }

  if (!data?.ok) {
    throw new ApiRequestError('后端未返回健康状态。', undefined, data?.requestId)
  }

  return data
}

export function resolveImageSource(image: { url?: string | null; b64Json?: string | null; mimeType?: string | null }) {
  if (image.url) {
    return image.url
  }

  if (image.b64Json) {
    return `data:${image.mimeType || 'image/png'};base64,${image.b64Json}`
  }

  return ''
}
