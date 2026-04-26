// POST /api/images/generate：
// - 校验请求体（与 Express 同源，复用 server/lib.mjs）
// - 直接 fetch OpenAI REST，避免引入 Node SDK 强依赖
// - 错误码与 Express 完全对齐
// - 速率限制由 Cloudflare WAF 在 Dashboard 配置，函数层不再实现内存版

import {
  buildPrompt,
  isMissingApiKey,
  normalizeImages,
  resolveOpenAIError,
  validatePayload,
} from '../../../server/lib.mjs'
import { jsonError } from '../../_lib'

interface Env {
  OPENAI_API_KEY: string
  OPENAI_IMAGE_MODEL?: string
  OPENAI_TIMEOUT_MS?: string
}

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
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
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

  if (isMissingApiKey(context.env.OPENAI_API_KEY)) {
    return jsonError(500, 'MISSING_API_KEY', '后端没有配置 OPENAI_API_KEY', requestId)
  }

  const payload = validation.value
  const model = context.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
  const timeoutMs = parsePositiveInteger(context.env.OPENAI_TIMEOUT_MS, 120_000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const upstream = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${context.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: buildPrompt(payload),
        size: payload.size,
        n: payload.count,
        output_format: payload.outputFormat,
        quality: payload.quality,
        user: requestId || undefined,
      }),
    })

    if (!upstream.ok) {
      const errorBody = await safeJson(upstream)
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
      return jsonError(502, 'OPENAI_REQUEST_FAILED', 'OpenAI 没有返回图片，请稍后再试', requestId)
    }

    return Response.json({
      requestId,
      images,
      usage: { model },
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      return jsonError(504, 'OPENAI_REQUEST_FAILED', 'OpenAI 响应超时，请稍后再试', requestId)
    }

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

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed
  }

  return fallback
}
