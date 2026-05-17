const VERSION = '0.2.1'

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
  'x-pc-identity',
  'x-pc-builtin',
  'origin',
  'referer',
  'cookie',
  'user-agent',
])

// Headers we additionally strip ONLY when running in BUILTIN mode, because
// in that mode we replace Authorization with the env-stored key.
const FORBIDDEN_FORWARD_BUILTIN_ONLY = new Set([
  'authorization',
])

const IDENTITY_PROFILES = {
  kilocode: {
    'user-agent': 'Kilo-Code/4.0.0',
    'http-referer': 'https://kilocode.ai',
    'x-title': 'Kilo Code',
  },
}

// Built-in AI rewrite credentials live ONLY here, in Worker env vars.
// Frontend sends X-Pc-Builtin: 1 (no Authorization, no upstream base) and we
// fill in everything from env. This way the project pays for AI rewrite and
// no visitor ever sees the key.
//
// Required env vars when BUILTIN mode is used:
//   PC_BUILTIN_BASE_URL   e.g. https://agentrouter.org/v1
//   PC_BUILTIN_API_KEY    e.g. sk-...
//   PC_BUILTIN_IDENTITY   optional, e.g. kilocode
//
// Without these vars, X-Pc-Builtin requests get 503 with a clear message.

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
  async fetch(request, env) {
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
        builtinReady: Boolean(env?.PC_BUILTIN_BASE_URL && env?.PC_BUILTIN_API_KEY),
        timestamp: new Date().toISOString(),
      })
    }

    // ── BUILTIN mode ──
    // Frontend sets X-Pc-Builtin: 1 to use the project-paid AI rewrite key.
    // We enforce this is ONLY for /chat/completions to limit blast radius.
    const isBuiltin = (request.headers.get('x-pc-builtin') || '').trim() === '1'

    let upstreamBase
    if (isBuiltin) {
      if (url.pathname !== '/chat/completions' && url.pathname !== '/v1/chat/completions') {
        return jsonError(
          403,
          'BUILTIN_PATH_NOT_ALLOWED',
          '内置改写凭据仅允许用于 /chat/completions',
        )
      }
      const base = String(env?.PC_BUILTIN_BASE_URL || '').trim()
      const key = String(env?.PC_BUILTIN_API_KEY || '').trim()
      if (!base || !key) {
        return jsonError(
          503,
          'BUILTIN_NOT_CONFIGURED',
          '反代未配置内置改写凭据（PC_BUILTIN_BASE_URL / PC_BUILTIN_API_KEY）',
        )
      }
      upstreamBase = base
    } else {
      upstreamBase = request.headers.get('x-upstream-base')
      if (!upstreamBase || !upstreamBase.trim()) {
        return jsonError(
          400,
          'MISSING_UPSTREAM',
          '请求头缺少 X-Upstream-Base，前端「设置」里填代理 URL 后会自动携带这个头',
        )
      }
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
      const lower = name.toLowerCase()
      if (FORBIDDEN_FORWARD.has(lower)) continue
      if (isBuiltin && FORBIDDEN_FORWARD_BUILTIN_ONLY.has(lower)) continue
      forwardHeaders.set(name, value)
    }

    if (isBuiltin) {
      // Replace Authorization with the env-stored key.
      forwardHeaders.set('authorization', `Bearer ${String(env?.PC_BUILTIN_API_KEY || '').trim()}`)
      // Apply identity from env if provided.
      const builtinIdentity = String(env?.PC_BUILTIN_IDENTITY || '').trim().toLowerCase()
      const builtinProfile = builtinIdentity && IDENTITY_PROFILES[builtinIdentity]
      if (builtinProfile) {
        for (const [headerName, headerValue] of Object.entries(builtinProfile)) {
          forwardHeaders.set(headerName, headerValue)
        }
      }
    } else {
      // Caller-driven identity hint (still requires a profile to take effect).
      const identityHint = (request.headers.get('x-pc-identity') || '').trim().toLowerCase()
      const profile = identityHint && IDENTITY_PROFILES[identityHint]
      if (profile) {
        for (const [headerName, headerValue] of Object.entries(profile)) {
          forwardHeaders.set(headerName, headerValue)
        }
      }
    }

    let upstreamBody = undefined
    if (request.method !== 'GET' && request.method !== 'HEAD') {
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
