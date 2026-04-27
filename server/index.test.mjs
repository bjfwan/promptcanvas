import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPrompt, createApp, normalizeImages, resolveOpenAIError, validatePayload } from './index.mjs'

const silentLogger = {
  error() {},
  info() {},
  log() {},
  warn() {},
}

function createTestApp(options = {}) {
  return createApp({
    accessLog: false,
    logger: silentLogger,
    ...options,
  })
}

async function request(app, { method = 'GET', path = '/', body, headers = {} } = {}) {
  const server = app.listen(0)

  try {
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address()
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body === undefined
        ? headers
        : {
          'Content-Type': 'application/json',
          ...headers,
        },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    const data = text ? JSON.parse(text) : null

    return {
      data,
      headers: response.headers,
      status: response.status,
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }
}

function validPayload(overrides = {}) {
  return {
    prompt: '一只穿着宇航服的橘猫',
    style: 'poster',
    size: '1024x1024',
    count: 1,
    outputFormat: 'png',
    apiKey: 'sk-test',
    baseUrl: 'https://api.openai.com/v1',
    ...overrides,
  }
}

test('GET /api/health returns null model (后端不再持有凭据), version and request id', async () => {
  const app = createTestApp()
  const response = await request(app, { path: '/api/health' })

  assert.equal(response.status, 200)
  assert.equal(response.data.ok, true)
  assert.equal(response.data.model, null)
  assert.equal(typeof response.data.version, 'string')
  assert.ok(typeof response.data.uptimeSeconds === 'number' && response.data.uptimeSeconds >= 0)
  assert.match(response.headers.get('x-content-type-options'), /nosniff/)
  assert.equal(response.headers.get('x-frame-options'), 'DENY')
  assert.match(response.data.requestId, /^req_/)
  assert.match(response.headers.get('x-request-id'), /^req_/)
})

test('GET /api/health preserves caller request id', async () => {
  const app = createTestApp()
  const response = await request(app, {
    path: '/api/health',
    headers: {
      'X-Request-Id': 'req_custom_123',
    },
  })

  assert.equal(response.status, 200)
  assert.equal(response.data.requestId, 'req_custom_123')
  assert.equal(response.headers.get('x-request-id'), 'req_custom_123')
})

test('access log middleware records finished requests', async () => {
  const entries = []
  const recordingLogger = {
    error() {},
    info(payload) {
      entries.push(payload)
    },
    log() {},
    warn() {},
  }
  const app = createApp({
    accessLog: true,
    logger: recordingLogger,
  })

  await request(app, { path: '/api/health' })

  assert.equal(entries.length, 1)
  assert.equal(entries[0].type, 'access')
  assert.equal(entries[0].method, 'GET')
  assert.equal(entries[0].path, '/api/health')
  assert.equal(entries[0].status, 200)
  assert.ok(typeof entries[0].durationMs === 'number')
  assert.match(entries[0].requestId, /^req_/)
})

test('unknown API path returns contract error', async () => {
  const app = createTestApp()
  const response = await request(app, { path: '/api/unknown' })

  assert.equal(response.status, 404)
  assert.deepEqual(response.data.error, {
    code: 'INVALID_REQUEST',
    message: '接口不存在',
  })
  assert.match(response.data.requestId, /^req_/)
})

test('POST /api/images/generate validates invalid payload', async () => {
  const app = createTestApp()
  const response = await request(app, {
    method: 'POST',
    path: '/api/images/generate',
    body: {},
  })

  assert.equal(response.status, 400)
  assert.deepEqual(response.data.error, {
    code: 'INVALID_REQUEST',
    message: 'prompt 不能为空',
  })
})

test('POST /api/images/generate returns PROVIDER_NOT_CONFIGURED when body lacks credentials', async () => {
  const app = createTestApp()
  const response = await request(app, {
    method: 'POST',
    path: '/api/images/generate',
    body: validPayload({ apiKey: '', baseUrl: '' }),
  })

  assert.equal(response.status, 400)
  assert.equal(response.data.error.code, 'PROVIDER_NOT_CONFIGURED')
  assert.match(response.data.error.message, /API 凭据/)
})

test('POST /api/images/generate maps upstream response to frontend contract', async () => {
  const calls = []
  const app = createTestApp({
    openaiClient: {
      images: {
        async generate(payload) {
          calls.push(payload)

          return {
            data: [
              {
                b64_json: 'abc123',
                revised_prompt: 'A poster of an orange cat astronaut',
              },
            ],
          }
        },
      },
    },
  })
  const response = await request(app, {
    method: 'POST',
    path: '/api/images/generate',
    body: validPayload({
      outputFormat: 'webp',
      negativePrompt: '低清晰度、模糊、水印',
      quality: 'high',
      creativity: 8,
      seed: 'cat-poster-v1',
      model: 'dall-e-3',
    }),
  })

  assert.equal(response.status, 200)
  assert.match(response.data.requestId, /^req_/)
  assert.deepEqual(response.data.images, [
    {
      id: 'img_1',
      url: null,
      b64Json: 'abc123',
      mimeType: 'image/webp',
      revisedPrompt: 'A poster of an orange cat astronaut',
    },
  ])
  assert.deepEqual(response.data.usage, { model: 'dall-e-3' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].size, '1024x1024')
  assert.equal(calls[0].n, 1)
  assert.equal(calls[0].output_format, 'webp')
  assert.equal(calls[0].quality, 'high')
  assert.equal(calls[0].model, 'dall-e-3')
  assert.match(calls[0].prompt, /风格要求：电影海报风格/)
  assert.match(calls[0].prompt, /避免内容：低清晰度、模糊、水印/)
  assert.match(calls[0].prompt, /创意强度：8\/10/)
  assert.match(calls[0].prompt, /一致性标记：cat-poster-v1/)
})

test('POST /api/images/generate omits model field upstream when not specified', async () => {
  const calls = []
  const app = createTestApp({
    openaiClient: {
      images: {
        async generate(payload) {
          calls.push(payload)
          return { data: [{ b64_json: 'abc123' }] }
        },
      },
    },
  })

  const response = await request(app, {
    method: 'POST',
    path: '/api/images/generate',
    body: validPayload(),
  })

  assert.equal(response.status, 200)
  assert.equal('model' in calls[0], false)
  assert.equal(response.data.usage.model, null)
})

test('POST /api/images/generate validates advanced fields', async () => {
  const app = createTestApp()
  const invalidRequests = [
    {
      body: validPayload({ negativePrompt: 123 }),
      message: 'negativePrompt 必须是字符串',
    },
    {
      body: validPayload({ quality: 'ultra' }),
      message: 'quality 只支持 auto、low、medium、high',
    },
    {
      body: validPayload({ creativity: 11 }),
      message: 'creativity 必须是 1 到 10 的数字',
    },
    {
      body: validPayload({ seed: 123 }),
      message: 'seed 必须是字符串',
    },
    {
      body: validPayload({ baseUrl: 'not-a-url' }),
      message: 'baseUrl 不是合法 URL',
    },
    {
      body: validPayload({ apiKey: 'sk-xxxx' }),
      message: 'apiKey 不能是占位值 sk-xxxx',
    },
  ]

  for (const invalidRequest of invalidRequests) {
    const response = await request(app, {
      method: 'POST',
      path: '/api/images/generate',
      body: invalidRequest.body,
    })

    assert.equal(response.status, 400)
    assert.deepEqual(response.data.error, {
      code: 'INVALID_REQUEST',
      message: invalidRequest.message,
    })
  }
})

test('POST /api/images/generate applies rate limit', async () => {
  const app = createTestApp({
    openaiClient: {
      images: {
        async generate() {
          return { data: [{ b64_json: 'abc123' }] }
        },
      },
    },
    rateLimitMax: 1,
    rateLimitWindowMs: 60_000,
  })

  const first = await request(app, {
    method: 'POST',
    path: '/api/images/generate',
    body: validPayload(),
  })
  const second = await request(app, {
    method: 'POST',
    path: '/api/images/generate',
    body: validPayload(),
  })

  assert.equal(first.status, 200)
  assert.equal(second.status, 429)
  assert.deepEqual(second.data.error, {
    code: 'RATE_LIMITED',
    message: '请求太频繁，请稍后再试',
  })
})

test('POST /api/images/generate maps upstream errors', async () => {
  const app = createTestApp({
    openaiClient: {
      images: {
        async generate() {
          const error = new Error('quota exceeded')
          error.code = 'insufficient_quota'
          throw error
        },
      },
    },
  })
  const response = await request(app, {
    method: 'POST',
    path: '/api/images/generate',
    body: validPayload(),
  })

  assert.equal(response.status, 429)
  assert.deepEqual(response.data.error, {
    code: 'OPENAI_REQUEST_FAILED',
    message: 'OpenAI 额度不足或账单受限，请检查账户余额',
  })
})

test('POST /api/images/generate maps content policy violations', async () => {
  const app = createTestApp({
    openaiClient: {
      images: {
        async generate() {
          const error = new Error('blocked by safety system')
          error.code = 'content_policy_violation'
          error.status = 400
          throw error
        },
      },
    },
  })
  const response = await request(app, {
    method: 'POST',
    path: '/api/images/generate',
    body: validPayload(),
  })

  assert.equal(response.status, 400)
  assert.deepEqual(response.data.error, {
    code: 'INVALID_REQUEST',
    message: '提示词触发了内容安全限制，请调整后再试',
  })
})

test('POST /api/images/generate maps upstream timeout errors', async () => {
  const app = createTestApp({
    openaiClient: {
      images: {
        async generate() {
          const error = new Error('timeout')
          error.name = 'APIConnectionTimeoutError'
          throw error
        },
      },
    },
  })
  const response = await request(app, {
    method: 'POST',
    path: '/api/images/generate',
    body: validPayload(),
  })

  assert.equal(response.status, 504)
  assert.deepEqual(response.data.error, {
    code: 'OPENAI_REQUEST_FAILED',
    message: 'OpenAI 响应超时，请稍后再试',
  })
})

test('POST /api/images/generate maps upstream 401 invalid_api_key', async () => {
  const app = createTestApp({
    openaiClient: {
      images: {
        async generate() {
          const error = new Error('Invalid API key')
          error.code = 'invalid_api_key'
          error.status = 401
          throw error
        },
      },
    },
  })
  const response = await request(app, {
    method: 'POST',
    path: '/api/images/generate',
    body: validPayload(),
  })

  assert.equal(response.status, 500)
  assert.equal(response.data.error.code, 'OPENAI_REQUEST_FAILED')
  assert.match(response.data.error.message, /API Key/)
})

test('helper functions validate and normalize data', () => {
  assert.equal(validatePayload(validPayload()).value.count, 1)
  assert.equal(validatePayload(validPayload()).value.quality, 'auto')
  assert.equal(validatePayload(validPayload()).value.apiKey, 'sk-test')
  assert.equal(validatePayload(validPayload()).value.baseUrl, 'https://api.openai.com/v1')
  assert.equal(validatePayload(validPayload({ count: '1' })).error, 'count 必须是 1 到 4 的整数')
  assert.match(buildPrompt(validPayload({
    negativePrompt: '水印',
    creativity: 3,
    seed: 'abc',
  })), /创意强度：3\/10，优先忠实还原用户提示词/)
  assert.deepEqual(normalizeImages({ data: [{ url: 'https://example.com/a.png' }] }, 'png'), [
    {
      id: 'img_1',
      url: 'https://example.com/a.png',
      b64Json: null,
      mimeType: 'image/png',
      revisedPrompt: null,
    },
  ])
  assert.deepEqual(resolveOpenAIError({ status: 400, message: 'bad input' }), {
    status: 400,
    code: 'INVALID_REQUEST',
    message: 'bad input',
  })
})
