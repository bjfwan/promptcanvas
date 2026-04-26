import crypto from 'node:crypto'
import http from 'node:http'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import OpenAI from 'openai'

dotenv.config()

const currentFilePath = fileURLToPath(import.meta.url)
const startedAt = new Date()
const packageVersion = process.env.npm_package_version || '0.0.0'
const port = Number(process.env.PORT || 8787)
const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
const openaiTimeoutMs = parsePositiveInteger(process.env.OPENAI_TIMEOUT_MS, 120_000)
const accessLogEnabled = String(process.env.ACCESS_LOG ?? 'true').trim().toLowerCase() !== 'false'
const allowedSizes = new Set(['1024x1024', '1024x1536', '1536x1024'])
const allowedFormats = new Set(['png', 'jpeg', 'webp'])
const allowedQualities = new Set(['auto', 'low', 'medium', 'high'])
const mimeTypes = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}
const stylePrompts = {
  natural: '自然写实风格，光线真实，色彩协调',
  poster: '电影海报风格，主体突出，排版有冲击力',
  product: '商业产品摄影风格，干净背景，质感清晰',
  portrait: '高质量人物肖像风格，面部自然，细节丰富',
  anime: '精致动漫插画风格，线条清晰，色彩鲜明',
  cinematic: '电影感视觉风格，戏剧化光影，构图完整',
}
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000)
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 20)
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value)

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed
  }

  return fallback
}

function isDirectRun() {
  if (!process.argv[1]) {
    return false
  }

  return path.resolve(process.argv[1]).toLowerCase() === currentFilePath.toLowerCase()
}

function isMissingApiKey(apiKey) {
  const value = typeof apiKey === 'string' ? apiKey.trim() : ''

  return !value || value === 'sk-xxxx'
}

function logWith(logger, level, payload) {
  const fn = typeof logger?.[level] === 'function' ? logger[level] : null

  if (!fn) {
    return
  }

  try {
    fn.call(logger, payload)
  } catch {
    // ignore logger failures so they never affect responses
  }
}

function sendError(res, status, code, message, requestId) {
  const body = {
    error: {
      code,
      message,
    },
  }

  if (requestId) {
    body.requestId = requestId
  }

  return res.status(status).json(body)
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for']

  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim()
  }

  return req.ip || req.socket.remoteAddress || 'unknown'
}

function createRateLimit({ max, windowMs }) {
  const requestBuckets = new Map()
  const cleanupTimer = setInterval(() => {
    const now = Date.now()

    for (const [ip, bucket] of requestBuckets.entries()) {
      if (now >= bucket.resetAt) {
        requestBuckets.delete(ip)
      }
    }
  }, Math.max(windowMs, 60_000))

  cleanupTimer.unref()

  return function rateLimit(req, res, next) {
    const now = Date.now()
    const ip = getClientIp(req)
    const bucket = requestBuckets.get(ip)

    if (!bucket || now >= bucket.resetAt) {
      requestBuckets.set(ip, {
        count: 1,
        resetAt: now + windowMs,
      })
      next()
      return
    }

    if (bucket.count >= max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      sendError(res, 429, 'RATE_LIMITED', '请求太频繁，请稍后再试', req.requestId)
      return
    }

    bucket.count += 1
    next()
  }
}

export function validatePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: '请求体必须是 JSON 对象' }
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const style = typeof body.style === 'string' ? body.style.trim() : ''
  const size = typeof body.size === 'string' ? body.size.trim() : ''
  const outputFormat = typeof body.outputFormat === 'string' && body.outputFormat.trim()
    ? body.outputFormat.trim().toLowerCase()
    : 'png'
  const count = typeof body.count === 'number' ? body.count : Number.NaN
  const negativePrompt = typeof body.negativePrompt === 'string' ? body.negativePrompt.trim() : ''
  const quality = typeof body.quality === 'string' && body.quality.trim()
    ? body.quality.trim().toLowerCase()
    : 'auto'
  const creativity = body.creativity === undefined ? null : body.creativity
  const seed = typeof body.seed === 'string' ? body.seed.trim() : ''

  if (!prompt) {
    return { error: 'prompt 不能为空' }
  }

  if (prompt.length > 1000) {
    return { error: 'prompt 不能超过 1000 个字符' }
  }

  if (style.length > 80) {
    return { error: 'style 不能超过 80 个字符' }
  }

  if (body.negativePrompt !== undefined && typeof body.negativePrompt !== 'string') {
    return { error: 'negativePrompt 必须是字符串' }
  }

  if (negativePrompt.length > 500) {
    return { error: 'negativePrompt 不能超过 500 个字符' }
  }

  if (body.quality !== undefined && typeof body.quality !== 'string') {
    return { error: 'quality 必须是字符串' }
  }

  if (!allowedQualities.has(quality)) {
    return { error: 'quality 只支持 auto、low、medium、high' }
  }

  if (creativity !== null && (!Number.isFinite(creativity) || creativity < 1 || creativity > 10)) {
    return { error: 'creativity 必须是 1 到 10 的数字' }
  }

  if (body.seed !== undefined && typeof body.seed !== 'string') {
    return { error: 'seed 必须是字符串' }
  }

  if (seed.length > 120) {
    return { error: 'seed 不能超过 120 个字符' }
  }

  if (!allowedSizes.has(size)) {
    return { error: 'size 只支持 1024x1024、1024x1536、1536x1024' }
  }

  if (!Number.isInteger(count) || count < 1 || count > 4) {
    return { error: 'count 必须是 1 到 4 的整数' }
  }

  if (!allowedFormats.has(outputFormat)) {
    return { error: 'outputFormat 只支持 png、jpeg、webp' }
  }

  return {
    value: {
      prompt,
      style,
      size,
      count,
      outputFormat,
      negativePrompt,
      quality,
      creativity,
      seed,
    },
  }
}

function resolveCreativityInstruction(creativity) {
  if (creativity === null || creativity === undefined) {
    return null
  }

  if (creativity <= 3) {
    return `创意强度：${creativity}/10，优先忠实还原用户提示词，避免过度发散`
  }

  if (creativity <= 7) {
    return `创意强度：${creativity}/10，在保持主题准确的基础上增强画面表现力`
  }

  return `创意强度：${creativity}/10，可以加入更大胆的构图、光影和视觉细节`
}

export function buildPrompt({ prompt, style, outputFormat, negativePrompt, creativity, seed }) {
  const styleInstruction = stylePrompts[style] || style

  return [
    `用户提示词：${prompt}`,
    styleInstruction ? `风格要求：${styleInstruction}` : null,
    negativePrompt ? `避免内容：${negativePrompt}` : null,
    resolveCreativityInstruction(creativity),
    seed ? `一致性标记：${seed}` : null,
    `输出格式：${outputFormat.toUpperCase()}`,
    '输出要求：高质量、构图完整、细节清晰',
  ].filter(Boolean).join('\n')
}

export function normalizeImages(response, outputFormat) {
  const data = Array.isArray(response?.data) ? response.data : []

  return data.map((image, index) => ({
    id: image.id || `img_${index + 1}`,
    url: image.url || null,
    b64Json: image.b64_json || image.b64Json || null,
    mimeType: mimeTypes[outputFormat] || 'image/png',
    revisedPrompt: image.revised_prompt || image.revisedPrompt || null,
  }))
}

export function resolveOpenAIError(error) {
  const status = error?.status || error?.response?.status
  const upstreamCode = error?.code || error?.error?.code

  if (status === 401 || status === 403 || upstreamCode === 'invalid_api_key') {
    return {
      status: 500,
      code: 'OPENAI_REQUEST_FAILED',
      message: 'OpenAI API Key 无效或无权限，请检查后端配置',
    }
  }

  if (upstreamCode === 'insufficient_quota' || upstreamCode === 'billing_hard_limit_reached') {
    return {
      status: 429,
      code: 'OPENAI_REQUEST_FAILED',
      message: 'OpenAI 额度不足或账单受限，请检查账户余额',
    }
  }

  if (status === 429 || upstreamCode === 'rate_limit_exceeded') {
    return {
      status: 429,
      code: 'RATE_LIMITED',
      message: 'OpenAI 请求频率过高或额度不足，请稍后再试',
    }
  }

  if (
    upstreamCode === 'content_policy_violation'
    || upstreamCode === 'moderation_blocked'
    || upstreamCode === 'safety_violation'
  ) {
    return {
      status: 400,
      code: 'INVALID_REQUEST',
      message: '提示词触发了内容安全限制，请调整后再试',
    }
  }

  if (status === 400) {
    return {
      status: 400,
      code: 'INVALID_REQUEST',
      message: error?.message || 'OpenAI 拒绝了当前图片生成参数',
    }
  }

  if (
    error?.name === 'APIConnectionTimeoutError'
    || error?.code === 'ETIMEDOUT'
    || error?.code === 'ECONNRESET'
    || error?.code === 'ECONNABORTED'
  ) {
    return {
      status: 504,
      code: 'OPENAI_REQUEST_FAILED',
      message: 'OpenAI 响应超时，请稍后再试',
    }
  }

  return {
    status: 502,
    code: 'OPENAI_REQUEST_FAILED',
    message: '图片生成失败，请稍后再试',
  }
}

function applySecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  next()
}

function createAccessLogger(logger) {
  return function accessLogger(req, res, next) {
    const startTime = performance.now()

    res.on('finish', () => {
      const durationMs = Math.round(performance.now() - startTime)

      logWith(logger, 'info', {
        type: 'access',
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs,
        ip: getClientIp(req),
        requestId: req.requestId,
      })
    })

    next()
  }
}

function createCorsOptions(origins) {
  return {
    origin(origin, callback) {
      if (!origin || origins.includes('*') || origins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(null, false)
    },
  }
}

export function createApp(options = {}) {
  const app = express()
  const config = {
    apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
    accessLog: options.accessLog ?? accessLogEnabled,
    clientOrigins: options.clientOrigins ?? clientOrigins,
    logger: options.logger ?? console,
    model: options.model ?? model,
    openaiClient: options.openaiClient ?? null,
    openaiTimeoutMs: options.openaiTimeoutMs ?? openaiTimeoutMs,
    rateLimitMax: options.rateLimitMax ?? parsePositiveInteger(rateLimitMax, 20),
    rateLimitWindowMs: options.rateLimitWindowMs ?? parsePositiveInteger(rateLimitWindowMs, 10 * 60 * 1000),
  }
  let cachedOpenAIClient = config.openaiClient

  function getOpenAIClient() {
    if (!cachedOpenAIClient) {
      cachedOpenAIClient = new OpenAI({
        apiKey: config.apiKey,
        timeout: config.openaiTimeoutMs,
      })
    }

    return cachedOpenAIClient
  }

  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use((req, res, next) => {
    const requestId = typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].trim()
      ? req.headers['x-request-id'].trim()
      : `req_${crypto.randomUUID()}`

    req.requestId = requestId
    res.setHeader('X-Request-Id', requestId)
    next()
  })
  app.use(applySecurityHeaders)

  if (config.accessLog) {
    app.use(createAccessLogger(config.logger))
  }

  app.use(cors(createCorsOptions(config.clientOrigins)))
  app.use(express.json({ limit: '64kb' }))

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      model: config.model,
      version: packageVersion,
      uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
      startedAt: startedAt.toISOString(),
      requestId: req.requestId,
    })
  })

  app.post('/api/images/generate', createRateLimit({
    max: config.rateLimitMax,
    windowMs: config.rateLimitWindowMs,
  }), async (req, res) => {
    const validation = validatePayload(req.body)

    if (validation.error) {
      sendError(res, 400, 'INVALID_REQUEST', validation.error, req.requestId)
      return
    }

    if (!config.openaiClient && isMissingApiKey(config.apiKey)) {
      sendError(res, 500, 'MISSING_API_KEY', '后端没有配置 OPENAI_API_KEY', req.requestId)
      return
    }

    const payload = validation.value
    const openai = getOpenAIClient()

    try {
      const response = await openai.images.generate({
        model: config.model,
        prompt: buildPrompt(payload),
        size: payload.size,
        n: payload.count,
        output_format: payload.outputFormat,
        quality: payload.quality,
      })
      const images = normalizeImages(response, payload.outputFormat)

      if (!images.length) {
        sendError(res, 502, 'OPENAI_REQUEST_FAILED', 'OpenAI 没有返回图片，请稍后再试', req.requestId)
        return
      }

      res.json({
        requestId: req.requestId,
        images,
        usage: {
          model: config.model,
        },
      })
    } catch (error) {
      logWith(config.logger, 'error', {
        type: 'openai_error',
        requestId: req.requestId,
        message: error?.message,
        code: error?.code,
        status: error?.status,
      })
      const resolvedError = resolveOpenAIError(error)
      sendError(res, resolvedError.status, resolvedError.code, resolvedError.message, req.requestId)
    }
  })

  app.use('/api', (req, res) => {
    sendError(res, 404, 'INVALID_REQUEST', '接口不存在', req.requestId)
  })

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error)
      return
    }

    if (error?.type === 'entity.too.large') {
      sendError(res, 413, 'INVALID_REQUEST', '请求体不能超过 64KB', req.requestId)
      return
    }

    if (error instanceof SyntaxError && 'body' in error) {
      sendError(res, 400, 'INVALID_REQUEST', '请求体不是合法 JSON', req.requestId)
      return
    }

    logWith(config.logger, 'error', {
      type: 'unhandled_error',
      requestId: req.requestId,
      message: error?.message,
      stack: error?.stack,
    })
    sendError(res, 500, 'INTERNAL_ERROR', '服务器内部错误', req.requestId)
  })

  return app
}

export const app = createApp()

function warnOnSuspiciousConfig(logger = console) {
  if (isMissingApiKey(process.env.OPENAI_API_KEY)) {
    logger.warn('[backend] OPENAI_API_KEY 未配置或仍为占位值，POST /api/images/generate 将返回 MISSING_API_KEY')
  }

  if (clientOrigins.includes('*')) {
    logger.warn('[backend] CLIENT_ORIGIN 包含 "*"，已允许所有来源访问，仅建议本地开发使用')
  }
}

export function startServer(appToStart = app, listenPort = port, options = {}) {
  const logger = options.logger ?? console
  const handleSignals = options.handleSignals ?? true
  const server = http.createServer(appToStart)

  server.requestTimeout = openaiTimeoutMs + 30_000
  server.headersTimeout = 65_000
  server.keepAliveTimeout = 5_000

  server.listen(listenPort, () => {
    warnOnSuspiciousConfig(logger)
    logger.log(`Image backend listening on http://localhost:${listenPort}`)
  })

  let shuttingDown = false

  function shutdown(signal) {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    logger.log(`[backend] Received ${signal}, shutting down gracefully`)

    const forceExitTimer = setTimeout(() => {
      logger.warn('[backend] Forced exit after 10s graceful timeout')
      process.exit(1)
    }, 10_000)

    forceExitTimer.unref()

    server.close((error) => {
      if (error) {
        logger.error('[backend] Failed to close HTTP server cleanly', error)
        process.exit(1)
        return
      }

      process.exit(0)
    })
  }

  if (handleSignals) {
    process.once('SIGINT', () => shutdown('SIGINT'))
    process.once('SIGTERM', () => shutdown('SIGTERM'))
  }

  return server
}

if (isDirectRun()) {
  startServer()
}
