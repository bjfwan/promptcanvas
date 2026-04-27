import {
  buildPrompt,
  normalizeImages,
  resolveOpenAIError,
  validatePayload,
} from '../../../server/lib.mjs'
import { jsonError } from '../../_lib.ts'

const UPSTREAM_TIMEOUT_MS = 120_000

interface ValidatedPayload {
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
  apiKey: string
  baseUrl: string
}

export const onRequestPost: PagesFunction = async (context) => {
  const requestId = (context.data.requestId as string | undefined) ?? ''

  let body: unknown

  try {
    body = await context.request.json()
  } catch {
    return jsonError(400, 'INVALID_REQUEST', '请求体不是合法 JSON', requestId)
  }

  const validation = validatePayload(body) as { error?: string; value?: ValidatedPayload }

  if (validation.error || !validation.value) {
    return jsonError(400, 'INVALID_REQUEST', validation.error ?? '请求体校验失败', requestId)
  }

  const payload = validation.value

  if (!payload.apiKey || !payload.baseUrl) {
    return jsonError(
      400,
      'PROVIDER_NOT_CONFIGURED',
      '请求未携带 API 凭据，请在前端「设置」中填写 API 端点和 Key',
      requestId,
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const upstreamRequest: Record<string, unknown> = {
      prompt: buildPrompt(payload),
      size: payload.size,
      n: payload.count,
      output_format: payload.outputFormat,
      quality: payload.quality,
      user: requestId || undefined,
    }
    if (payload.model) {
      upstreamRequest.model = payload.model
    }

    const upstream = await fetch(`${payload.baseUrl}/images/generations`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${payload.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamRequest),
    })

    if (!upstream.ok) {
      const errorBody = await safeJson(upstream)
      console.error('[generate] upstream error', {
        requestId,
        host: hostFromBaseUrl(payload.baseUrl),
        status: upstream.status,
        upstreamCode: errorBody?.error?.code,
        upstreamMessage: errorBody?.error?.message,
      })
      const mapped = resolveOpenAIError({
        status: upstream.status,
        code: errorBody?.error?.code,
        message: errorBody?.error?.message,
      })
      return jsonError(mapped.status, mapped.code, mapped.message, requestId)
    }

    const data = await upstream.json()
    const images = normalizeImages(data, payload.outputFormat)

    if (!images.length) {
      return jsonError(502, 'OPENAI_REQUEST_FAILED', '上游没有返回图片，请稍后再试', requestId)
    }

    return Response.json({
      requestId,
      images,
      usage: { model: payload.model || null },
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      return jsonError(504, 'OPENAI_REQUEST_FAILED', '上游响应超时，请稍后再试', requestId)
    }

    console.error('[generate] unexpected error', {
      requestId,
      host: hostFromBaseUrl(payload.baseUrl),
      message: (error as Error)?.message,
      name: (error as Error)?.name,
    })
    const mapped = resolveOpenAIError(error)
    return jsonError(mapped.status, mapped.code, mapped.message, requestId)
  } finally {
    clearTimeout(timer)
  }
}

async function safeJson(response: Response): Promise<{ error?: { code?: string; message?: string } } | null> {
  try {
    return (await response.json()) as { error?: { code?: string; message?: string } }
  } catch {
    return null
  }
}

function hostFromBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl)
    return `${url.protocol}//${url.host}`
  } catch {
    return 'invalid-url'
  }
}
