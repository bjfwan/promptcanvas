const VERSION = '0.1.0'

const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
])

const FORBIDDEN_FORWARD = new Set([
  ...HOP_BY_HOP,
  'x-upstream-base',
  'origin',
  'referer',
  'cookie',
])

const BASE_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*',
  'access-control-max-age': '86400',
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...BASE_CORS,
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  })
}

function jsonError(status, code, message) {
  return jsonResponse({ error: { code, message } }, status)
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: BASE_CORS })
    }

    const url = new URL(request.url)

    if (
      request.method === 'GET'
      && (url.pathname === '/' || url.pathname === '/health' || url.pathname === '/healthz')
    ) {
      return jsonResponse({
        ok: true,
        name: 'promptcanvas-proxy',
        runtime: 'cloudflare-workers',
        version: VERSION,
        timestamp: new Date().toISOString(),
      })
    }

    const upstreamBase = request.headers.get('x-upstream-base')
    if (!upstreamBase || !upstreamBase.trim()) {
      return jsonError(
        400,
        'MISSING_UPSTREAM',
        '请求头缺少 X-Upstream-Base，前端「设置」里填代理 URL 后会自动携带这个头',
      )
    }

    let upstreamUrl
    try {
      const cleanBase = upstreamBase.trim().replace(/\/+$/, '')
      upstreamUrl = new URL(cleanBase + url.pathname + url.search)
      if (upstreamUrl.protocol !== 'http:' && upstreamUrl.protocol !== 'https:') {
        throw new Error('upstream must be http or https')
      }
    } catch (error) {
      return jsonError(
        400,
        'INVALID_UPSTREAM',
        `X-Upstream-Base 不是合法 URL：${(error instanceof Error ? error.message : String(error))}`,
      )
    }

    const forwardHeaders = new Headers()
    for (const [name, value] of request.headers.entries()) {
      if (!FORBIDDEN_FORWARD.has(name.toLowerCase())) {
        forwardHeaders.set(name, value)
      }
    }

    let upstreamBody = undefined
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      // Read body as ArrayBuffer to preserve multipart/form-data boundary intact.
      // Passing request.body (ReadableStream) directly can corrupt the boundary
      // in Cloudflare Workers, causing upstream to fail with 500 on /images/edits.
      upstreamBody = await request.arrayBuffer()
    }

    let upstreamResp
    try {
      upstreamResp = await fetch(upstreamUrl.toString(), {
        method: request.method,
        headers: forwardHeaders,
        body: upstreamBody,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`proxy fetch failed: ${request.method} ${upstreamUrl.host} → ${message}`)
      return jsonError(502, 'PROXY_FETCH_FAILED', `代理转发到上游失败：${message}`)
    }

    const responseHeaders = new Headers()
    for (const [name, value] of upstreamResp.headers.entries()) {
      const lower = name.toLowerCase()
      if (HOP_BY_HOP.has(lower)) continue
      if (lower.startsWith('access-control-')) continue
      responseHeaders.set(name, value)
    }
    for (const [name, value] of Object.entries(BASE_CORS)) {
      responseHeaders.set(name, value)
    }

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: responseHeaders,
    })
  },
}
