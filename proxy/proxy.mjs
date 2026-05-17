import http from 'node:http'

const PORT = Number(process.env.PORT || 8080)
const VERSION = '0.2.0'

const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
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
  'authorization',
])
const IDENTITY_PROFILES = {
  kilocode: {
    'user-agent': 'Kilo-Code/4.0.0',
    'http-referer': 'https://kilocode.ai',
    'x-title': 'Kilo Code',
  },
}

const BUILTIN_BASE_URL = String(process.env.PC_BUILTIN_BASE_URL || '').trim()
const BUILTIN_API_KEY = String(process.env.PC_BUILTIN_API_KEY || '').trim()
const BUILTIN_IDENTITY = String(process.env.PC_BUILTIN_IDENTITY || '').trim().toLowerCase()

const BASE_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*',
  'access-control-max-age': '86400',
}

function jsonResponse(res, status, payload) {
  res.writeHead(status, {
    ...BASE_CORS_HEADERS,
    'content-type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(payload))
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now()

  if (req.method === 'OPTIONS') {
    res.writeHead(204, BASE_CORS_HEADERS)
    res.end()
    return
  }

  const url = req.url || '/'

  if (req.method === 'GET' && (url === '/' || url === '/health' || url === '/healthz')) {
    jsonResponse(res, 200, {
      ok: true,
      name: 'promptcanvas-proxy',
      version: VERSION,
      builtinReady: Boolean(BUILTIN_BASE_URL && BUILTIN_API_KEY),
      timestamp: new Date().toISOString(),
    })
    return
  }

  // ── BUILTIN mode ──
  // X-Pc-Builtin: 1 → use the project-paid env-stored AI rewrite key.
  // Restricted to /chat/completions to prevent abuse via image generation.
  const isBuiltin = String(req.headers['x-pc-builtin'] || '').trim() === '1'
  let upstreamBaseValue
  if (isBuiltin) {
    if (url !== '/chat/completions' && url !== '/v1/chat/completions') {
      jsonResponse(res, 403, {
        error: {
          code: 'BUILTIN_PATH_NOT_ALLOWED',
          message: '内置改写凭据仅允许用于 /chat/completions',
        },
      })
      return
    }
    if (!BUILTIN_BASE_URL || !BUILTIN_API_KEY) {
      jsonResponse(res, 503, {
        error: {
          code: 'BUILTIN_NOT_CONFIGURED',
          message: '反代未配置内置改写凭据（PC_BUILTIN_BASE_URL / PC_BUILTIN_API_KEY）',
        },
      })
      return
    }
    upstreamBaseValue = BUILTIN_BASE_URL
  } else {
    const headerValue = req.headers['x-upstream-base']
    if (typeof headerValue !== 'string' || !headerValue.trim()) {
      jsonResponse(res, 400, {
        error: {
          code: 'MISSING_UPSTREAM',
          message: '请求头缺少 X-Upstream-Base，前端「设置」里填代理 URL 后，会自动携带这个头',
        },
      })
      return
    }
    upstreamBaseValue = headerValue
  }

  let upstreamUrl
  try {
    const cleanBase = upstreamBaseValue.trim().replace(/\/+$/, '')
    const path = url.startsWith('/') ? url : `/${url}`
    upstreamUrl = new URL(cleanBase + path)
    if (upstreamUrl.protocol !== 'http:' && upstreamUrl.protocol !== 'https:') {
      throw new Error('upstream must be http or https')
    }
  } catch (error) {
    jsonResponse(res, 400, {
      error: {
        code: 'INVALID_UPSTREAM',
        message: `X-Upstream-Base 不是合法 URL：${(error instanceof Error ? error.message : String(error))}`,
      },
    })
    return
  }

  const headers = {}
  for (const [name, value] of Object.entries(req.headers)) {
    const lower = name.toLowerCase()
    if (FORBIDDEN_FORWARD.has(lower)) continue
    if (Array.isArray(value)) headers[name] = value.join(',')
    else if (value !== undefined) headers[name] = String(value)
  }
  headers.host = upstreamUrl.host

  if (isBuiltin) {
    headers.authorization = `Bearer ${BUILTIN_API_KEY}`
    const builtinProfile = BUILTIN_IDENTITY && IDENTITY_PROFILES[BUILTIN_IDENTITY]
    if (builtinProfile) {
      for (const [headerName, headerValue] of Object.entries(builtinProfile)) {
        headers[headerName] = headerValue
      }
    }
  } else {
    const identityHint = String(req.headers['x-pc-identity'] || '').trim().toLowerCase()
    const profile = identityHint && IDENTITY_PROFILES[identityHint]
    if (profile) {
      for (const [headerName, headerValue] of Object.entries(profile)) {
        headers[headerName] = headerValue
      }
    }
  }

  let body
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = []
    let total = 0
    for await (const chunk of req) {
      chunks.push(chunk)
      total += chunk.length
    }
    body = chunks.length > 0 ? Buffer.concat(chunks, total) : undefined
  }

  let upstream
  try {
    upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
    })
  } catch (error) {
    const elapsed = Date.now() - startedAt
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[proxy] ${req.method} ${upstreamUrl.host}${upstreamUrl.pathname} → fetch failed after ${elapsed}ms: ${message}`,
    )
    jsonResponse(res, 502, {
      error: {
        code: 'PROXY_FETCH_FAILED',
        message: `代理转发到上游失败：${message}`,
      },
    })
    return
  }

  const responseHeaders = { ...BASE_CORS_HEADERS }
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP.has(lower)) return
    if (lower.startsWith('access-control-')) return
    responseHeaders[key] = value
  })

  res.writeHead(upstream.status, responseHeaders)

  if (upstream.body) {
    const reader = upstream.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!res.write(value)) {
          await new Promise((resolve) => res.once('drain', resolve))
        }
      }
    } catch (error) {
      console.error(
        `[proxy] stream error on ${upstreamUrl.host}${upstreamUrl.pathname}:`,
        error instanceof Error ? error.message : error,
      )
    }
  }
  res.end()

  const elapsed = Date.now() - startedAt
  console.log(
    `[proxy] ${req.method} ${upstreamUrl.host}${upstreamUrl.pathname} → ${upstream.status} (${elapsed}ms)`,
  )
})

server.requestTimeout = 0
server.headersTimeout = 0
server.timeout = 0
server.keepAliveTimeout = 60_000

server.listen(PORT, () => {
  console.log(`[proxy] promptcanvas-proxy v${VERSION} listening on :${PORT}`)
})

function shutdown(signal) {
  console.log(`[proxy] received ${signal}, closing server`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
