// 端到端契约测试：mock globalThis.fetch 模拟 OpenAI 响应，
// 验证 onRequestPost 与 Express 版返回结构、错误码完全一致。
// Node 24 默认 strip types，可以直接动态 import .ts 文件。
//
// 自 v2 起：后端不再读 env vars，apiKey/baseUrl 由前端通过 body 注入。

import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'

const { onRequestPost } = await import('../api/images/generate.ts')

const originalFetch = globalThis.fetch

function mockFetch(impl) {
  globalThis.fetch = impl
}

function createContext({ body, requestId = 'req_test_123', env = {} } = {}) {
  return {
    request: new Request('https://example.com/api/images/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
    data: { requestId },
  }
}

function validBody(overrides = {}) {
  return {
    prompt: '一只猫',
    style: 'poster',
    size: '1024x1024',
    count: 1,
    outputFormat: 'png',
    apiKey: 'sk-test',
    baseUrl: 'https://api.openai.com/v1',
    ...overrides,
  }
}

beforeEach(() => {
  mockFetch(originalFetch)
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('returns INVALID_REQUEST on malformed JSON body', async () => {
  const response = await onRequestPost(createContext({ body: '{not json' }))
  const data = await response.json()

  assert.equal(response.status, 400)
  assert.equal(data.error.code, 'INVALID_REQUEST')
  assert.equal(data.error.message, '请求体不是合法 JSON')
  assert.equal(data.requestId, 'req_test_123')
})

test('returns INVALID_REQUEST when payload validation fails', async () => {
  const response = await onRequestPost(createContext({ body: validBody({ prompt: '' }) }))
  const data = await response.json()

  assert.equal(response.status, 400)
  assert.equal(data.error.code, 'INVALID_REQUEST')
  assert.equal(data.error.message, 'prompt 不能为空')
})

test('returns PROVIDER_NOT_CONFIGURED when apiKey missing from body', async () => {
  const response = await onRequestPost(createContext({
    body: validBody({ apiKey: '' }),
  }))
  const data = await response.json()

  assert.equal(response.status, 400)
  assert.equal(data.error.code, 'PROVIDER_NOT_CONFIGURED')
  assert.match(data.error.message, /API 凭据/)
})

test('returns PROVIDER_NOT_CONFIGURED when baseUrl missing from body', async () => {
  const response = await onRequestPost(createContext({
    body: validBody({ baseUrl: '' }),
  }))
  const data = await response.json()

  assert.equal(response.status, 400)
  assert.equal(data.error.code, 'PROVIDER_NOT_CONFIGURED')
})

test('rejects placeholder apiKey sk-xxxx', async () => {
  const response = await onRequestPost(createContext({
    body: validBody({ apiKey: 'sk-xxxx' }),
  }))
  const data = await response.json()

  assert.equal(response.status, 400)
  assert.equal(data.error.code, 'INVALID_REQUEST')
  assert.match(data.error.message, /apiKey/)
})

test('rejects baseUrl that is not a valid URL', async () => {
  const response = await onRequestPost(createContext({
    body: validBody({ baseUrl: 'not-a-url' }),
  }))
  const data = await response.json()

  assert.equal(response.status, 400)
  assert.equal(data.error.code, 'INVALID_REQUEST')
  assert.match(data.error.message, /baseUrl/)
})

test('rejects baseUrl with non-http(s) protocol', async () => {
  const response = await onRequestPost(createContext({
    body: validBody({ baseUrl: 'ftp://example.com/v1' }),
  }))
  const data = await response.json()

  assert.equal(response.status, 400)
  assert.equal(data.error.code, 'INVALID_REQUEST')
  assert.match(data.error.message, /http/)
})

test('forwards validated payload to upstream and normalizes response', async () => {
  const captured = []

  mockFetch(async (url, init) => {
    captured.push({ url, init })
    return new Response(JSON.stringify({
      data: [{ b64_json: 'AAAA', revised_prompt: 'r' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  const response = await onRequestPost(createContext({
    body: validBody({
      outputFormat: 'webp',
      quality: 'high',
      negativePrompt: '低清晰度',
      creativity: 8,
      seed: 'cat-v1',
      model: 'dall-e-3',
    }),
  }))
  const data = await response.json()

  assert.equal(response.status, 200)
  assert.equal(captured.length, 1)
  assert.equal(captured[0].url, 'https://api.openai.com/v1/images/generations')
  assert.equal(captured[0].init.method, 'POST')
  assert.equal(captured[0].init.headers.Authorization, 'Bearer sk-test')

  const upstreamBody = JSON.parse(captured[0].init.body)
  assert.equal(upstreamBody.model, 'dall-e-3')
  assert.equal(upstreamBody.size, '1024x1024')
  assert.equal(upstreamBody.n, 1)
  assert.equal(upstreamBody.output_format, 'webp')
  assert.equal(upstreamBody.quality, 'high')
  assert.equal(upstreamBody.user, 'req_test_123')
  assert.match(upstreamBody.prompt, /避免内容：低清晰度/)
  assert.match(upstreamBody.prompt, /创意强度：8\/10/)
  assert.match(upstreamBody.prompt, /一致性标记：cat-v1/)

  assert.equal(data.images.length, 1)
  assert.equal(data.images[0].b64Json, 'AAAA')
  assert.equal(data.images[0].mimeType, 'image/webp')
  assert.equal(data.images[0].revisedPrompt, 'r')
  assert.equal(data.usage.model, 'dall-e-3')
})

test('omits model field from upstream when payload.model is empty', async () => {
  const captured = []

  mockFetch(async (_url, init) => {
    captured.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ data: [{ b64_json: 'AAAA' }] }), { status: 200 })
  })

  const response = await onRequestPost(createContext({
    body: validBody(),
  }))
  const data = await response.json()

  assert.equal(response.status, 200)
  assert.equal('model' in captured[0], false)
  assert.equal(data.usage.model, null)
})

test('treats blank model string as not provided and omits from upstream', async () => {
  const captured = []

  mockFetch(async (_url, init) => {
    captured.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ data: [{ b64_json: 'AAAA' }] }), { status: 200 })
  })

  const response = await onRequestPost(createContext({
    body: validBody({ model: '   ' }),
  }))

  assert.equal(response.status, 200)
  assert.equal('model' in captured[0], false)
})

test('rejects model containing illegal characters', async () => {
  const response = await onRequestPost(createContext({
    body: validBody({ model: 'evil model with spaces' }),
  }))
  const data = await response.json()

  assert.equal(response.status, 400)
  assert.equal(data.error.code, 'INVALID_REQUEST')
  assert.match(data.error.message, /model/)
})

test('rejects model longer than 64 characters', async () => {
  const response = await onRequestPost(createContext({
    body: validBody({ model: 'a'.repeat(65) }),
  }))
  const data = await response.json()

  assert.equal(response.status, 400)
  assert.equal(data.error.code, 'INVALID_REQUEST')
  assert.match(data.error.message, /model/)
})

test('returns 502 OPENAI_REQUEST_FAILED when upstream returns no images', async () => {
  mockFetch(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))

  const response = await onRequestPost(createContext({ body: validBody() }))
  const data = await response.json()

  assert.equal(response.status, 502)
  assert.equal(data.error.code, 'OPENAI_REQUEST_FAILED')
})

test('maps upstream insufficient_quota into 429 OPENAI_REQUEST_FAILED', async () => {
  mockFetch(async () => new Response(JSON.stringify({
    error: { code: 'insufficient_quota', message: 'over quota' },
  }), { status: 429 }))

  const response = await onRequestPost(createContext({ body: validBody() }))
  const data = await response.json()

  assert.equal(response.status, 429)
  assert.equal(data.error.code, 'OPENAI_REQUEST_FAILED')
  assert.equal(data.error.message, 'OpenAI 额度不足或账单受限，请检查账户余额')
})

test('maps upstream content_policy_violation into 400 INVALID_REQUEST', async () => {
  mockFetch(async () => new Response(JSON.stringify({
    error: { code: 'content_policy_violation', message: 'blocked' },
  }), { status: 400 }))

  const response = await onRequestPost(createContext({ body: validBody() }))
  const data = await response.json()

  assert.equal(response.status, 400)
  assert.equal(data.error.code, 'INVALID_REQUEST')
  assert.equal(data.error.message, '提示词触发了内容安全限制，请调整后再试')
})

test('maps upstream 401/403 into OPENAI_REQUEST_FAILED with key/permission hint', async () => {
  mockFetch(async () => new Response(JSON.stringify({
    error: { code: 'invalid_api_key', message: 'Invalid API key' },
  }), { status: 401 }))

  const response = await onRequestPost(createContext({ body: validBody() }))
  const data = await response.json()

  assert.equal(response.status, 500)
  assert.equal(data.error.code, 'OPENAI_REQUEST_FAILED')
  assert.match(data.error.message, /API Key/)
})

test('returns 504 when upstream fetch aborts (timeout)', async () => {
  // 这个用例不修改超时（默认 120s），改为直接抛 AbortError 模拟超时
  mockFetch(async () => {
    const err = new Error('aborted')
    err.name = 'AbortError'
    throw err
  })

  const response = await onRequestPost(createContext({
    body: validBody(),
  }))
  const data = await response.json()

  assert.equal(response.status, 504)
  assert.equal(data.error.code, 'OPENAI_REQUEST_FAILED')
  assert.equal(data.error.message, '上游响应超时，请稍后再试')
})

test('uses body.baseUrl as upstream root (third-party gateway scenario)', async () => {
  const captured = []

  mockFetch(async (url, init) => {
    captured.push({ url, init })
    return new Response(JSON.stringify({
      data: [{ b64_json: 'AAAA' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })

  const response = await onRequestPost(createContext({
    body: validBody({ baseUrl: 'https://api.chshapi.cn/v1' }),
  }))

  assert.equal(response.status, 200)
  assert.equal(captured[0].url, 'https://api.chshapi.cn/v1/images/generations')
})

test('strips trailing slashes from body.baseUrl before joining path', async () => {
  const captured = []

  mockFetch(async (url) => {
    captured.push(url)
    return new Response(JSON.stringify({ data: [{ b64_json: 'AAAA' }] }), { status: 200 })
  })

  await onRequestPost(createContext({
    body: validBody({ baseUrl: 'https://api.chshapi.cn/v1///' }),
  }))

  assert.equal(captured[0], 'https://api.chshapi.cn/v1/images/generations')
})

test('preserves requestId from context.data on success', async () => {
  mockFetch(async () => new Response(JSON.stringify({
    data: [{ url: 'https://example.com/x.png' }],
  }), { status: 200 }))

  const response = await onRequestPost(createContext({
    body: validBody(),
    requestId: 'req_custom_xyz',
  }))
  const data = await response.json()

  assert.equal(data.requestId, 'req_custom_xyz')
})

test('does not include apiKey in upstream request body (only in Authorization header)', async () => {
  const captured = []

  mockFetch(async (_url, init) => {
    captured.push({ headers: init.headers, body: JSON.parse(init.body) })
    return new Response(JSON.stringify({ data: [{ b64_json: 'AAAA' }] }), { status: 200 })
  })

  await onRequestPost(createContext({
    body: validBody({ apiKey: 'sk-secret-123' }),
  }))

  assert.equal(captured[0].headers.Authorization, 'Bearer sk-secret-123')
  assert.equal('apiKey' in captured[0].body, false)
  assert.equal('baseUrl' in captured[0].body, false)
})
