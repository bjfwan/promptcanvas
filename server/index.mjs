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
import {
  buildPrompt,
  isMissingApiKey,
  normalizeImages,
  resolveOpenAIError,
  validatePayload,
} from './lib.mjs'

export { buildPrompt, isMissingApiKey, normalizeImages, resolveOpenAIError, validatePayload }

dotenv.config()

const currentFilePath = fileURLToPath(import.meta.url)
const startedAt = new Date()
const packageVersion = process.env.npm_package_version || '0.0.0'
const port = Number(process.env.PORT || 8787)
const UPSTREAM_TIMEOUT_MS = 120_000
const accessLogEnabled = String(process.env.ACCESS_LOG ?? 'true').trim().toLowerCase() !== 'false'
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
    accessLog: options.accessLog ?? accessLogEnabled,
    clientOrigins: options.clientOrigins ?? clientOrigins,
    logger: options.logger ?? console,
    // 测试可注入一个共享 mock client，绕过真实凭据。
    // 生产环境此项为 null，每个请求按 body 里的 apiKey/baseUrl 临时建一个客户端。
    openaiClient: options.openaiClient ?? null,
    openaiTimeoutMs: options.openaiTimeoutMs ?? UPSTREAM_TIMEOUT_MS,
    rateLimitMax: options.rateLimitMax ?? parsePositiveInteger(rateLimitMax, 20),
    rateLimitWindowMs: options.rateLimitWindowMs ?? parsePositiveInteger(rateLimitWindowMs, 10 * 60 * 1000),
  }

  function getOpenAIClient(payload) {
    if (config.openaiClient) {
      return config.openaiClient
    }

    return new OpenAI({
      apiKey: payload.apiKey,
      baseURL: payload.baseUrl || undefined,
      timeout: config.openaiTimeoutMs,
    })
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
      // 后端不再持有任何模型/凭据信息，model 字段保留位置但置空，
      // 实际模型由前端 Settings 决定
      model: null,
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

    const payload = validation.value

    // 凭据由前端 Settings 通过 body 注入；测试用例可注入 openaiClient mock 绕过
    if (!config.openaiClient && (!payload.apiKey || !payload.baseUrl)) {
      sendError(
        res,
        400,
        'PROVIDER_NOT_CONFIGURED',
        '请求未携带 API 凭据，请在前端「设置」中填写 API 端点和 Key',
        req.requestId,
      )
      return
    }

    const openai = getOpenAIClient(payload)
    const effectiveModel = payload.model || ''

    try {
      const upstreamArgs = {
        prompt: buildPrompt(payload),
        size: payload.size,
        n: payload.count,
        output_format: payload.outputFormat,
        quality: payload.quality,
      }
      // 没填 model 时，让上游按自己的默认值走，不强行注入字段
      if (effectiveModel) {
        upstreamArgs.model = effectiveModel
      }

      const response = await openai.images.generate(upstreamArgs)
      const images = normalizeImages(response, payload.outputFormat)

      if (!images.length) {
        sendError(res, 502, 'OPENAI_REQUEST_FAILED', '上游没有返回图片，请稍后再试', req.requestId)
        return
      }

      res.json({
        requestId: req.requestId,
        images,
        usage: {
          model: effectiveModel || null,
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
  // OpenAI 凭据已迁移至前端 Settings，由访客在 localStorage 自行配置；
  // 此处只剩对开发用 CORS 的提醒。
  if (clientOrigins.includes('*')) {
    logger.warn('[backend] CLIENT_ORIGIN 包含 "*"，已允许所有来源访问，仅建议本地开发使用')
  }
}

export function startServer(appToStart = app, listenPort = port, options = {}) {
  const logger = options.logger ?? console
  const handleSignals = options.handleSignals ?? true
  const server = http.createServer(appToStart)

  server.requestTimeout = UPSTREAM_TIMEOUT_MS + 30_000
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
