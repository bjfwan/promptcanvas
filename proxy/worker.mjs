import { DurableObject } from 'cloudflare:workers'

const VERSION = '0.3.0'

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
  'user-agent',
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

// ============================================================
// PairCode 后端（阶段3-B）
// 状态存 Durable Object（强一致 + alarm TTL），IP 限流用 KV 计数器
// ============================================================

const PAIR_PREFIX = '/pair/'
const PAIR_TTL_MS_DEFAULT = 300000
const PAIR_MAX_ATTEMPTS_DEFAULT = 3
const PAIR_RATE_LIMIT_INIT_DEFAULT = 3
const PAIR_RATE_LIMIT_JOIN_DEFAULT = 5
const PAIR_RATE_LIMIT_WINDOW_MS_DEFAULT = 600000

// 模块级 IP hash 密钥：env.PC_PAIR_SECRET 为空时随机生成。
// 注意：随机密钥仅在单个 isolate 内稳定，跨 isolate 可能不一致；
// 生产环境建议通过 `wrangler secret put PC_PAIR_SECRET` 注入固定值。
let _pairSecret = null
function getPairSecret(env) {
  if (env && env.PC_PAIR_SECRET && env.PC_PAIR_SECRET.length > 0) return env.PC_PAIR_SECRET
  if (!_pairSecret) {
    const buf = new Uint8Array(32)
    crypto.getRandomValues(buf)
    _pairSecret = bytesToHex(buf)
  }
  return _pairSecret
}

function bytesToHex(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

async function hashIp(ip, secret) {
  const data = new TextEncoder().encode(`${ip}:${secret}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(digest)
}

function getClientIp(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('forwarded') ||
    '0.0.0.0'
  )
}

function base64urlEncode(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (const b of arr) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str) {
  let s = String(str).replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function generateSessionId() {
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  return base64urlEncode(buf)
}

function generateShortCode() {
  const buf = new Uint8Array(4)
  crypto.getRandomValues(buf)
  const num = (buf[0] * 0x10000 + buf[1] * 0x100 + buf[2]) % 1000000
  return num.toString().padStart(6, '0')
}

// P-256 raw 公钥：base64 解码后必须精确 65 字节且以 0x04 开头
function validatePubkey(pubkey) {
  if (typeof pubkey !== 'string' || pubkey.length === 0) return false
  let bytes
  try {
    bytes = base64urlDecode(pubkey)
  } catch {
    return false
  }
  return bytes.length === 65 && bytes[0] === 0x04
}

function validateShortCode(code) {
  return typeof code === 'string' && /^\d{6}$/.test(code)
}

// 密文必须以 pcpair:v1: 开头
function validateCiphertext(ciphertext) {
  return typeof ciphertext === 'string' && ciphertext.startsWith('pcpair:v1:')
}

function toNum(envVal, def) {
  const n = Number(envVal)
  return Number.isFinite(n) && n > 0 ? n : def
}

// IP 限流：KV 计数器，带 TTL 窗口
async function checkRateLimit(env, ipHash, action) {
  if (!env || !env.PC_PAIR_KV) return { ok: true }
  const limit = toNum(
    action === 'init' ? env.PC_PAIR_RATE_LIMIT_INIT : env.PC_PAIR_RATE_LIMIT_JOIN,
    action === 'init' ? PAIR_RATE_LIMIT_INIT_DEFAULT : PAIR_RATE_LIMIT_JOIN_DEFAULT,
  )
  const windowMs = toNum(env.PC_PAIR_RATE_LIMIT_WINDOW_MS, PAIR_RATE_LIMIT_WINDOW_MS_DEFAULT)
  const key = `rl:${action}:${ipHash}`
  const raw = await env.PC_PAIR_KV.get(key)
  const count = raw ? parseInt(raw, 10) || 0 : 0
  if (count >= limit) return { ok: false, limit, windowMs }
  await env.PC_PAIR_KV.put(key, String(count + 1), {
    expirationTtl: Math.ceil(windowMs / 1000),
  })
  return { ok: true }
}

// 把 DO 的 JSON 响应转发给客户端，并补上 CORS 头
async function forwardDo(doResp) {
  const body = await doResp.text()
  return new Response(body, {
    status: doResp.status,
    headers: {
      ...BASE_CORS,
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function doRequest(pathname, body) {
  return new Request(`https://pair.do/${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function handlePair(request, env, url) {
  const path = url.pathname.slice(PAIR_PREFIX.length)
  if (path === 'init' && request.method === 'POST') return pairInit(request, env)
  if (path === 'join' && request.method === 'POST') return pairJoin(request, env)
  if (path === 'exchange' && request.method === 'POST') return pairExchange(request, env)
  if (path === 'status' && request.method === 'GET') return pairStatus(request, env, url)
  if (path === 'cancel' && request.method === 'DELETE') return pairCancel(request, env)
  return jsonError(404, 'PAIR_NOT_FOUND', '未知的 pair 端点')
}

// POST /pair/init —— 设备 A 发起配对
async function pairInit(request, env) {
  if (!env || !env.PC_PAIR_KV) {
    return jsonError(503, 'KV_NOT_CONFIGURED', 'Worker 未绑 KV namespace')
  }
  if (!env || !env.PC_PAIR_DO) {
    return jsonError(503, 'DO_NOT_CONFIGURED', 'Worker 未绑 Durable Object')
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_BODY', '请求体不是合法 JSON')
  }
  const { initiator_pubkey } = body || {}
  if (!validatePubkey(initiator_pubkey)) {
    return jsonError(400, 'INVALID_PUBKEY', '公钥格式不合法')
  }

  const secret = getPairSecret(env)
  const ipHash = await hashIp(getClientIp(request), secret)

  const rl = await checkRateLimit(env, ipHash, 'init')
  if (!rl.ok) {
    return jsonError(429, 'INIT_RATE_LIMITED', '同 IP 10 分钟内 init 超过上限')
  }

  const ttlMs = toNum(env.PC_PAIR_TTL_MS, PAIR_TTL_MS_DEFAULT)
  const sessionId = generateSessionId()

  // 生成 6 位短码并避免碰撞（最多重试 5 次）
  let shortCode = null
  for (let i = 0; i < 5; i++) {
    const candidate = generateShortCode()
    const existing = await env.PC_PAIR_KV.get(`sc:${candidate}`)
    if (!existing) {
      shortCode = candidate
      break
    }
  }
  if (!shortCode) {
    return jsonError(500, 'SHORT_CODE_COLLISION', '短码生成失败，请重试')
  }

  // short_code → session_id 映射，TTL 与 session 一致
  await env.PC_PAIR_KV.put(`sc:${shortCode}`, sessionId, {
    expirationTtl: Math.ceil(ttlMs / 1000),
  })

  const id = env.PC_PAIR_DO.idFromName(sessionId)
  const stub = env.PC_PAIR_DO.get(id)
  const doResp = await stub.fetch(
    doRequest('init', {
      action: 'init',
      session_id: sessionId,
      short_code: shortCode,
      initiator_pubkey: initiator_pubkey,
      initiator_ip_hash: ipHash,
      ttl_ms: ttlMs,
    }),
  )
  return forwardDo(doResp)
}

// POST /pair/join —— 设备 B 加入配对
async function pairJoin(request, env) {
  if (!env || !env.PC_PAIR_KV) {
    return jsonError(503, 'KV_NOT_CONFIGURED', 'Worker 未绑 KV namespace')
  }
  if (!env || !env.PC_PAIR_DO) {
    return jsonError(503, 'DO_NOT_CONFIGURED', 'Worker 未绑 Durable Object')
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_BODY', '请求体不是合法 JSON')
  }
  const { short_code, joiner_pubkey } = body || {}
  if (!validateShortCode(short_code)) {
    return jsonError(400, 'INVALID_SHORT_CODE', '短码必须是 6 位数字')
  }
  if (!validatePubkey(joiner_pubkey)) {
    return jsonError(400, 'INVALID_PUBKEY', '公钥格式不合法')
  }

  const secret = getPairSecret(env)
  const ipHash = await hashIp(getClientIp(request), secret)

  const rl = await checkRateLimit(env, ipHash, 'join')
  if (!rl.ok) {
    return jsonError(429, 'JOIN_RATE_LIMITED', '同 IP 10 分钟内 join 超过上限')
  }

  // 短码查 session_id（KV 自动过期，防枚举统一 404）
  const sessionId = await env.PC_PAIR_KV.get(`sc:${short_code}`)
  if (!sessionId) {
    return jsonError(404, 'SESSION_NOT_FOUND', '短码无对应 session 或已过期')
  }

  const id = env.PC_PAIR_DO.idFromName(sessionId)
  const stub = env.PC_PAIR_DO.get(id)
  const doResp = await stub.fetch(
    doRequest('join', {
      action: 'join',
      joiner_pubkey,
      joiner_ip_hash: ipHash,
      max_attempts: toNum(env.PC_PAIR_MAX_ATTEMPTS, PAIR_MAX_ATTEMPTS_DEFAULT),
    }),
  )
  return forwardDo(doResp)
}

// POST /pair/exchange —— 设备 A 上传密文
async function pairExchange(request, env) {
  if (!env || !env.PC_PAIR_DO) {
    return jsonError(503, 'DO_NOT_CONFIGURED', 'Worker 未绑 Durable Object')
  }
  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_BODY', '请求体不是合法 JSON')
  }
  const { session_id, iv, ciphertext } = body || {}
  if (typeof session_id !== 'string' || session_id.length === 0) {
    return jsonError(404, 'SESSION_NOT_FOUND', 'session 不存在')
  }
  if (typeof iv !== 'string' || iv.length === 0) {
    return jsonError(400, 'INVALID_CIPHERTEXT', 'iv 不合法')
  }
  if (!validateCiphertext(ciphertext)) {
    return jsonError(400, 'INVALID_CIPHERTEXT', '密文必须以 pcpair:v1: 开头')
  }

  const secret = getPairSecret(env)
  const ipHash = await hashIp(getClientIp(request), secret)

  const id = env.PC_PAIR_DO.idFromName(session_id)
  const stub = env.PC_PAIR_DO.get(id)
  const doResp = await stub.fetch(
    doRequest('exchange', {
      action: 'exchange',
      iv,
      ciphertext,
      initiator_ip_hash: ipHash,
    }),
  )
  return forwardDo(doResp)
}

// GET /pair/status?session_id=... —— 双方轮询
async function pairStatus(request, env, url) {
  if (!env || !env.PC_PAIR_DO) {
    return jsonError(503, 'DO_NOT_CONFIGURED', 'Worker 未绑 Durable Object')
  }
  const sessionId = url.searchParams.get('session_id')
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return jsonError(404, 'SESSION_NOT_FOUND', 'session 不存在')
  }
  const id = env.PC_PAIR_DO.idFromName(sessionId)
  const stub = env.PC_PAIR_DO.get(id)
  const doResp = await stub.fetch(new Request('https://pair.do/status', { method: 'GET' }))
  return forwardDo(doResp)
}

// DELETE /pair/cancel —— 任一方取消
async function pairCancel(request, env) {
  if (!env || !env.PC_PAIR_DO) {
    return jsonError(503, 'DO_NOT_CONFIGURED', 'Worker 未绑 Durable Object')
  }
  let body
  try {
    body = await request.json()
  } catch {
    return jsonError(400, 'INVALID_BODY', '请求体不是合法 JSON')
  }
  const { session_id } = body || {}
  if (typeof session_id !== 'string' || session_id.length === 0) {
    return jsonError(404, 'SESSION_NOT_FOUND', 'session 不存在')
  }
  const id = env.PC_PAIR_DO.idFromName(session_id)
  const stub = env.PC_PAIR_DO.get(id)
  const doResp = await stub.fetch(new Request('https://pair.do/cancel', { method: 'DELETE' }))
  return forwardDo(doResp)
}

// ============================================================
// PairSession Durable Object
// 每个 session_id 对应一个独立 DO 实例，单线程 + input gate 自动串行
// ============================================================

export class PairSession extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url)
    const action = url.pathname.replace(/^\/+/, '')
    try {
      if (action === 'init' && request.method === 'POST') return await this.handleInit(request)
      if (action === 'join' && request.method === 'POST') return await this.handleJoin(request)
      if (action === 'exchange' && request.method === 'POST') return await this.handleExchange(request)
      if (action === 'status' && request.method === 'GET') return await this.handleStatus()
      if (action === 'cancel' && request.method === 'DELETE') return await this.handleCancel()
      return this.doJson(404, 'PAIR_NOT_FOUND', '未知的 pair 操作')
    } catch (err) {
      console.error('PairSession error:', err)
      return this.doJson(500, 'INTERNAL', '内部错误')
    }
  }

  // alarm 触发 = TTL 到期，清理全部状态
  async alarm() {
    try {
      await this.ctx.storage.deleteAll()
      await this.ctx.storage.deleteAlarm()
    } catch (err) {
      console.error('PairSession alarm error:', err)
    }
  }

  doJson(status, code, message, payload) {
    const body = code
      ? JSON.stringify({ error: { code, message } })
      : JSON.stringify(payload || {})
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  async handleInit(request) {
    const body = await request.json()
    const existing = await this.ctx.storage.get('session')
    if (existing) {
      // 已存在（重复 init）：返回当前 session 信息
      return this.doJson(200, null, null, {
        session_id: existing.session_id,
        short_code: existing.short_code,
        expires_at: existing.expires_at,
        ttl_ms: Math.max(0, existing.expires_at - Date.now()),
      })
    }
    const now = Date.now()
    const ttlMs = Number(body.ttl_ms) > 0 ? Number(body.ttl_ms) : PAIR_TTL_MS_DEFAULT
    const expiresAt = now + ttlMs
    const session = {
      session_id: body.session_id,
      short_code: body.short_code,
      initiator_pubkey: body.initiator_pubkey,
      initiator_ip_hash: body.initiator_ip_hash,
      joiner_pubkey: null,
      joiner_ip_hash: null,
      iv: null,
      ciphertext: null,
      status: 'waiting_join',
      join_attempts: 0,
      created_at: now,
      expires_at: expiresAt,
      version: 1,
    }
    await this.ctx.storage.put('session', session)
    await this.ctx.storage.setAlarm(expiresAt)
    return this.doJson(200, null, null, {
      session_id: session.session_id,
      short_code: session.short_code,
      expires_at: expiresAt,
      ttl_ms: ttlMs,
    })
  }

  async handleJoin(request) {
    const body = await request.json()
    const maxAttempts = Number(body.max_attempts) > 0 ? Number(body.max_attempts) : PAIR_MAX_ATTEMPTS_DEFAULT
    const session = await this.ctx.storage.get('session')
    if (!session) return this.doJson(404, 'SESSION_NOT_FOUND', 'session 不存在')
    // 防枚举：过期也返回 404（与不存在一致）
    if (Date.now() > session.expires_at) return this.doJson(404, 'SESSION_NOT_FOUND', 'session 不存在')
    if (session.join_attempts >= maxAttempts) {
      return this.doJson(429, 'JOIN_RATE_LIMITED', '该 session join 尝试次数超限')
    }
    session.join_attempts += 1
    await this.ctx.storage.put('session', session)
    if (session.status !== 'waiting_join') {
      return this.doJson(409, 'SESSION_NOT_JOINABLE', 'session 当前状态不可加入')
    }
    // 公钥槽一次性写入，join 后不可覆盖
    session.joiner_pubkey = body.joiner_pubkey
    session.joiner_ip_hash = body.joiner_ip_hash
    session.status = 'joined'
    await this.ctx.storage.put('session', session)
    return this.doJson(200, null, null, {
      session_id: session.session_id,
      initiator_pubkey: session.initiator_pubkey,
      expires_at: session.expires_at,
    })
  }

  async handleExchange(request) {
    const body = await request.json()
    const session = await this.ctx.storage.get('session')
    if (!session) return this.doJson(404, 'SESSION_NOT_FOUND', 'session 不存在')
    if (Date.now() > session.expires_at) return this.doJson(410, 'SESSION_EXPIRED', 'session 已过期')
    // 鉴权优先：非发起者一律拒绝
    if (body.initiator_ip_hash !== session.initiator_ip_hash) {
      return this.doJson(403, 'NOT_INITIATOR', 'IP 哈希不匹配')
    }
    if (session.status !== 'joined') {
      return this.doJson(409, 'SESSION_NOT_JOINED', '还没 B 加入')
    }
    session.iv = body.iv
    session.ciphertext = body.ciphertext
    session.status = 'exchanged'
    await this.ctx.storage.put('session', session)
    return this.doJson(200, null, null, { ok: true })
  }

  async handleStatus() {
    const session = await this.ctx.storage.get('session')
    if (!session) return this.doJson(404, 'SESSION_NOT_FOUND', 'session 不存在')
    if (Date.now() > session.expires_at) return this.doJson(410, 'SESSION_EXPIRED', 'session 已过期')
    if (session.status === 'waiting_join') {
      return this.doJson(200, null, null, { status: 'waiting_join', expires_at: session.expires_at })
    }
    if (session.status === 'joined') {
      return this.doJson(200, null, null, {
        status: 'joined',
        joiner_pubkey: session.joiner_pubkey,
        expires_at: session.expires_at,
      })
    }
    if (session.status === 'exchanged') {
      return this.doJson(200, null, null, {
        status: 'exchanged',
        iv: session.iv,
        ciphertext: session.ciphertext,
        expires_at: session.expires_at,
      })
    }
    return this.doJson(404, 'SESSION_NOT_FOUND', 'session 不存在')
  }

  async handleCancel() {
    const session = await this.ctx.storage.get('session')
    if (!session) return this.doJson(404, 'SESSION_NOT_FOUND', 'session 不存在')
    await this.ctx.storage.deleteAll()
    await this.ctx.storage.deleteAlarm()
    return this.doJson(200, null, null, { ok: true, status: 'cancelled' })
  }
}

// ============================================================
// 默认导出：反代 + PairCode 路由
// ============================================================

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
        timestamp: new Date().toISOString(),
      })
    }

    // PairCode 路由：插在 health 之后、反代 fallthrough 之前
    if (url.pathname.startsWith(PAIR_PREFIX)) {
      return handlePair(request, env, url)
    }

    const upstreamBase = request.headers.get('x-upstream-base')
    if (!upstreamBase || !upstreamBase.trim()) {
      return jsonError(
        400,
        'MISSING_UPSTREAM',
        '请求头缺少 X-Upstream-Base，前端「设置」里填代理 URL 后会自动携带这个头',
      )
    }

    const requestId = (request.headers.get('x-pc-request-id') || '').trim()

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
      forwardHeaders.set(name, value)
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
      console.error(`proxy fetch failed: ${request.method} ${upstreamUrl.host} → ${message}${requestId ? ` [${requestId}]` : ''}`)
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
