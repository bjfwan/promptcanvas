// 纯函数单测：脱离 Express，确保 lib 层在任何 runtime（Node/Workers）都行为一致。

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildPrompt,
  isMissingApiKey,
  normalizeImages,
  resolveCreativityInstruction,
  resolveOpenAIError,
  validatePayload,
} from './lib.mjs'

function validBody(overrides = {}) {
  return {
    prompt: '一只穿着宇航服的橘猫',
    style: 'poster',
    size: '1024x1024',
    count: 1,
    outputFormat: 'png',
    ...overrides,
  }
}

test('validatePayload accepts a minimal valid body and applies defaults', () => {
  const result = validatePayload(validBody())

  assert.equal(result.error, undefined)
  assert.equal(result.value.prompt, '一只穿着宇航服的橘猫')
  assert.equal(result.value.outputFormat, 'png')
  assert.equal(result.value.quality, 'auto')
  assert.equal(result.value.creativity, null)
  assert.equal(result.value.negativePrompt, '')
  assert.equal(result.value.seed, '')
})

test('validatePayload rejects non-object bodies', () => {
  assert.equal(validatePayload(null).error, '请求体必须是 JSON 对象')
  assert.equal(validatePayload('hi').error, '请求体必须是 JSON 对象')
  assert.equal(validatePayload([]).error, '请求体必须是 JSON 对象')
})

test('validatePayload enforces field-level rules', () => {
  const cases = [
    [validBody({ prompt: '' }), 'prompt 不能为空'],
    [validBody({ prompt: 'a'.repeat(1001) }), 'prompt 不能超过 1000 个字符'],
    [validBody({ style: 'a'.repeat(81) }), 'style 不能超过 80 个字符'],
    [validBody({ negativePrompt: 'a'.repeat(501) }), 'negativePrompt 不能超过 500 个字符'],
    [validBody({ size: '512x512' }), 'size 只支持 1024x1024、1024x1536、1536x1024'],
    [validBody({ count: 0 }), 'count 必须是 1 到 4 的整数'],
    [validBody({ count: 5 }), 'count 必须是 1 到 4 的整数'],
    [validBody({ count: 1.5 }), 'count 必须是 1 到 4 的整数'],
    [validBody({ outputFormat: 'gif' }), 'outputFormat 只支持 png、jpeg、webp'],
    [validBody({ quality: 'ultra' }), 'quality 只支持 auto、low、medium、high'],
    [validBody({ creativity: 0 }), 'creativity 必须是 1 到 10 的数字'],
    [validBody({ creativity: 11 }), 'creativity 必须是 1 到 10 的数字'],
    [validBody({ creativity: 'high' }), 'creativity 必须是 1 到 10 的数字'],
    [validBody({ seed: 'a'.repeat(121) }), 'seed 不能超过 120 个字符'],
  ]

  for (const [body, message] of cases) {
    assert.equal(validatePayload(body).error, message, `expected error for ${JSON.stringify(body)}`)
  }
})

test('buildPrompt composes prompt with all advanced fields', () => {
  const text = buildPrompt({
    prompt: '一只猫',
    style: 'poster',
    outputFormat: 'webp',
    negativePrompt: '低清晰度',
    creativity: 8,
    seed: 'cat-v1',
  })

  assert.match(text, /用户提示词：一只猫/)
  assert.match(text, /风格要求：电影海报风格/)
  assert.match(text, /避免内容：低清晰度/)
  assert.match(text, /创意强度：8\/10/)
  assert.match(text, /一致性标记：cat-v1/)
  assert.match(text, /输出格式：WEBP/)
})

test('buildPrompt skips empty optional segments', () => {
  const text = buildPrompt({
    prompt: '一只猫',
    style: '',
    outputFormat: 'png',
    negativePrompt: '',
    creativity: null,
    seed: '',
  })

  assert.match(text, /用户提示词：一只猫/)
  assert.doesNotMatch(text, /风格要求/)
  assert.doesNotMatch(text, /避免内容/)
  assert.doesNotMatch(text, /创意强度/)
  assert.doesNotMatch(text, /一致性标记/)
})

test('resolveCreativityInstruction maps tiers and ignores nullish', () => {
  assert.equal(resolveCreativityInstruction(null), null)
  assert.equal(resolveCreativityInstruction(undefined), null)
  assert.match(resolveCreativityInstruction(2), /优先忠实还原/)
  assert.match(resolveCreativityInstruction(5), /增强画面表现力/)
  assert.match(resolveCreativityInstruction(9), /更大胆的构图/)
})

test('normalizeImages maps url and base64 fields and applies mime types', () => {
  const result = normalizeImages({
    data: [
      { url: 'https://example.com/a.png', revised_prompt: 'r1' },
      { b64_json: 'AAAA' },
      { id: 'custom', b64Json: 'BBBB', revisedPrompt: 'r3' },
    ],
  }, 'jpeg')

  assert.equal(result.length, 3)
  assert.deepEqual(result[0], {
    id: 'img_1',
    url: 'https://example.com/a.png',
    b64Json: null,
    mimeType: 'image/jpeg',
    revisedPrompt: 'r1',
  })
  assert.equal(result[1].b64Json, 'AAAA')
  assert.equal(result[2].id, 'custom')
  assert.equal(result[2].b64Json, 'BBBB')
})

test('normalizeImages tolerates missing or malformed data', () => {
  assert.deepEqual(normalizeImages({}, 'png'), [])
  assert.deepEqual(normalizeImages({ data: null }, 'png'), [])
  assert.deepEqual(normalizeImages(null, 'png'), [])
})

test('isMissingApiKey detects missing or placeholder keys', () => {
  assert.equal(isMissingApiKey(undefined), true)
  assert.equal(isMissingApiKey(''), true)
  assert.equal(isMissingApiKey('   '), true)
  assert.equal(isMissingApiKey('sk-xxxx'), true)
  assert.equal(isMissingApiKey('sk-real-key'), false)
})

test('resolveOpenAIError maps status and code permutations', () => {
  assert.equal(resolveOpenAIError({ status: 401 }).code, 'OPENAI_REQUEST_FAILED')
  assert.equal(resolveOpenAIError({ code: 'invalid_api_key' }).status, 500)
  assert.equal(resolveOpenAIError({ code: 'insufficient_quota' }).status, 429)
  assert.equal(resolveOpenAIError({ status: 429 }).code, 'RATE_LIMITED')
  assert.equal(resolveOpenAIError({ code: 'content_policy_violation' }).code, 'INVALID_REQUEST')
  assert.equal(resolveOpenAIError({ status: 400, message: 'bad' }).message, 'bad')
  assert.equal(resolveOpenAIError({ name: 'APIConnectionTimeoutError' }).status, 504)
  assert.equal(resolveOpenAIError({}).status, 502)
})
