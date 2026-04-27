// 端到端契约测试：mock globalThis.fetch 模拟 OpenAI 响应，
// 验证 onRequestPost 与 Express 版返回结构、错误码完全一致。
// Node 24 默认 strip types，可以直接动态 import .ts 文件。

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
    env: {
      OPENAI_API_KEY: 'sk-test',
      OPENAI_IMAGE_MODEL: 'gpt-image-1',
      ...env,
    },
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

test('returns MISSING_API_KEY when key is empty or placeholder', async () => {
  const response = await onRequestPost(createContext({
    body: validBody(),
    env: { OPENAI_API_KEY: 'sk-xxxx' },
  }))
  const data = await response.json()

  assert.equal(response.status, 500)
  assert.equal(data.error.code, 'MISSING_API_KEY')
})

test('forwards validated payload to OpenAI and normalizes response', async () => {
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
    }),
  }))
  const data = await response.json()

  assert.equal(response.status, 200)
  assert.equal(captured.length, 1)
  assert.equal(captured[0].url, 'https://api.openai.com/v1/images/generations')
  assert.equal(captured[0].init.method, 'POST')
  assert.equal(captured[0].init.headers.Authorization, 'Bearer sk-test')

  const upstreamBody = JSON.parse(captured[0].init.body)
  assert.equal(upstreamBody.model, 'gpt-image-1')
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
  assert.equal(data.usage.model, 'gpt-image-1')
})

test('returns 502 OPENAI_REQUEST_FAILED when upstream returns no images', async () => {
  mockFetch(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))

  const response = await onRequestPost(createContext({ body: validBody() }))
  const data = await response.json()

  assert.equal(response.status, 502)
  assert.equal(data.error.code, 'OPENAI_REQUEST_FAILED')
})

test('maps OpenAI insufficient_quota into 429 OPENAI_REQUEST_FAILED', async () => {
  mockFetch(async () => new Response(JSON.stringify({
    error: { code: 'insufficient_quota', message: 'over quota' },
  }), { status: 429 }))

  const response = await onRequestPost(createContext({ body: validBody() }))
  const data = await response.json()

  assert.equal(response.status, 429)
  assert.equal(data.error.code, 'OPENAI_REQUEST_FAILED')
  assert.equal(data.error.message, 'OpenAI 额度不足或账单受限，请检查账户余额')
})

test('maps OpenAI content_policy_violation into 400 INVALID_REQUEST', async () => {
  mockFetch(async () => new Response(JSON.stringify({
    error: { code: 'content_policy_violation', message: 'blocked' },
  }), { status: 400 }))

  const response = await onRequestPost(createContext({ body: validBody() }))
  const data = await response.json()

  assert.equal(response.status, 400)
  assert.equal(data.error.code, 'INVALID_REQUEST')
  assert.equal(data.error.message, '提示词触发了内容安全限制，请调整后再试')
})

test('returns 504 when upstream fetch aborts (timeout)', async () => {
  mockFetch(async (_url, init) => {
    await new Promise((resolve, reject) => {
      const onAbort = () => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        reject(err)
      }

      if (init?.signal?.aborted) {
        onAbort()
        return
      }

      init?.signal?.addEventListener('abort', onAbort, { once: true })
    })
    throw new Error('unreachable')
  })

  const response = await onRequestPost(createContext({
    body: validBody(),
    env: { OPENAI_API_KEY: 'sk-test', OPENAI_TIMEOUT_MS: '20' },
  }))
  const data = await response.json()

  assert.equal(response.status, 504)
  assert.equal(data.error.code, 'OPENAI_REQUEST_FAILED')
  assert.equal(data.error.message, 'OpenAI 响应超时，请稍后再试')
})

test('respects OPENAI_BASE_URL for OpenAI-compatible proxies', async () => {
  const captured = []

  mockFetch(async (url, init) => {
    captured.push({ url, init })
    return new Response(JSON.stringify({
      data: [{ b64_json: 'AAAA' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })

  const response = await onRequestPost(createContext({
    body: validBody(),
    env: { OPENAI_BASE_URL: 'https://api.chshapi.cn/v1/' },
  }))

  assert.equal(response.status, 200)
  assert.equal(captured[0].url, 'https://api.chshapi.cn/v1/images/generations')
})

test('falls back to default OpenAI base url when OPENAI_BASE_URL is blank', async () => {
  const captured = []

  mockFetch(async (url) => {
    captured.push(url)
    return new Response(JSON.stringify({ data: [{ b64_json: 'AAAA' }] }), { status: 200 })
  })

  await onRequestPost(createContext({
    body: validBody(),
    env: { OPENAI_API_KEY: 'sk-test', OPENAI_BASE_URL: '   ' },
  }))

  assert.equal(captured[0], 'https://api.openai.com/v1/images/generations')
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
