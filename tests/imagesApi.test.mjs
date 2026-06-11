import assert from 'node:assert/strict'
import test from 'node:test'
import { File } from 'node:buffer'
import {
  buildImagesEditsFormData,
  buildResponsesImageRequest,
  buildResponsesTextDataUrlRequest,
  normalizeImages,
  parseResponsesImageSse,
  responsesImageProgressFromEvent,
  resolveOpenAIError,
} from '../.test-dist/lib/imagesApi.js'

test('Responses SSE parser extracts image base64 from final events', () => {
  const sse = [
    ': keepalive',
    '',
    'event: response.output_item.done',
    'data: {"type":"response.output_item.done","item":{"id":"ig_result","type":"image_generation_call","result":"BASE64_RESULT"}}',
    '',
    'event: response.output_item.done',
    'data: {"type":"response.output_item.done","item":{"id":"ig_image_base64","type":"image_generation_call","image_base64":"BASE64_IMAGE"}}',
    '',
    'event: response.completed',
    'data: {"type":"response.completed","response":{"output":[{"id":"ig_b64_json","type":"image_generation_call","b64_json":"BASE64_B64_JSON"}]}}',
    '',
    'data: [DONE]',
    '',
  ].join('\n')

  const parsed = parseResponsesImageSse(sse)
  const images = normalizeImages(parsed, 'png')

  assert.deepEqual(
    images.map((image) => image.b64Json).sort(),
    ['BASE64_B64_JSON', 'BASE64_IMAGE', 'BASE64_RESULT'],
  )
})

test('normalizes supported image return formats without leaking transport details', () => {
  assert.equal(
    normalizeImages({ data: [{ id: 'b64', b64_json: 'B64_JSON_IMAGE' }] }, 'png')[0].b64Json,
    'B64_JSON_IMAGE',
  )
  assert.equal(
    normalizeImages({ data: [{ id: 'url', url: 'https://img.example/out.png' }] }, 'png')[0].url,
    'https://img.example/out.png',
  )
  assert.equal(
    normalizeImages({
      output: [{ id: 'result', type: 'image_generation_call', result: 'VSL_RESULT_IMAGE' }],
    }, 'png')[0].b64Json,
    'VSL_RESULT_IMAGE',
  )
  assert.equal(
    normalizeImages({
      output: [{ id: 'base64', type: 'image_generation_call', image_base64: 'VSL_IMAGE_BASE64' }],
    }, 'png')[0].b64Json,
    'VSL_IMAGE_BASE64',
  )
  assert.equal(
    normalizeImages({
      output: [{ id: 'b64json', type: 'image_generation_call', b64_json: 'VSL_B64_JSON' }],
    }, 'png')[0].b64Json,
    'VSL_B64_JSON',
  )

  const tdEe = normalizeImages({
    output: [{
      type: 'message',
      content: [{
        type: 'output_text',
        text: '<p>done</p><img src="data:image/png;base64,TD_EE_OUTPUT_TEXT_IMAGE">',
      }],
    }],
  }, 'webp')

  assert.equal(tdEe[0].b64Json, 'TD_EE_OUTPUT_TEXT_IMAGE')
  assert.equal(tdEe[0].mimeType, 'image/png')
})

test('Responses SSE parser extracts ai.td.ee output_text data URL images', () => {
  const sse = [
    'event: response.created',
    'data: {"type":"response.created"}',
    '',
    'event: response.completed',
    'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"<img src=\\"data:image/png;base64,TD_EE_STREAM_IMAGE\\">"}]}]}}',
    '',
    'data: [DONE]',
    '',
  ].join('\n')

  const parsed = parseResponsesImageSse(sse)
  const images = normalizeImages(parsed, 'png')

  assert.equal(images.length, 1)
  assert.equal(images[0].b64Json, 'TD_EE_STREAM_IMAGE')
  assert.equal(images[0].mimeType, 'image/png')
})

test('Responses tool payload uses configured response and image tool models', async () => {
  const request = await buildResponsesImageRequest({
    prompt: 'A red circle centered on white.',
    size: '1024x1024',
    count: 1,
    outputFormat: 'png',
    quality: 'low',
    model: 'gpt-image-2-chat',
    responseModel: 'gpt-image-2-chat',
    imageToolModel: 'gpt-image-2',
    referenceImages: [],
    stream: true,
    partialImages: 0,
  })

  assert.equal(request.model, 'gpt-image-2-chat')
  assert.equal(request.stream, true)
  assert.equal(request.store, false)
  assert.deepEqual(request.tool_choice, { type: 'image_generation' })
  assert.equal(request.tools[0].type, 'image_generation')
  assert.equal(request.tools[0].model, 'gpt-image-2')
  assert.equal(request.tools[0].output_format, 'png')
  assert.equal(request.tools[0].quality, 'low')
  assert.equal(request.tools[0].partial_images, 0)
  assert.match(request.input[0].content[0].text, /Use the image_generation tool/)
})

test('Responses text-data-url payload keeps model role separate from image tool model', async () => {
  const request = await buildResponsesTextDataUrlRequest({
    prompt: 'A red circle centered on white.',
    size: '1024x1024',
    count: 1,
    outputFormat: 'png',
    quality: 'low',
    model: 'gpt-image-2',
    responseModel: 'gpt-image-2',
    referenceImages: [],
    stream: true,
  })

  assert.equal(request.model, 'gpt-image-2')
  assert.equal(request.stream, true)
  assert.equal(request.store, false)
  assert.equal(request.tools, undefined)
  assert.match(request.input[0].content[0].text, /Generate exactly 1 image/)
})

test('images edits multipart payload includes image, optional mask, and model fields', async () => {
  const image = new File([new Uint8Array([1, 2, 3])], 'source.png', { type: 'image/png' })
  const mask = new Blob([new Uint8Array([4, 5, 6])], { type: 'image/png' })
  const formData = await buildImagesEditsFormData({
    prompt: 'Replace the sky.',
    size: '1024x1024',
    count: 1,
    outputFormat: 'png',
    quality: 'low',
    model: 'gpt-image-2',
    referenceImages: [{
      id: 'ref_1',
      name: 'source.png',
      mimeType: 'image/png',
      sizeBytes: 3,
      previewUrl: 'data:image/png;base64,AAA=',
      file: image,
    }],
    mask,
  }, 'req_test')

  assert.equal(formData.get('prompt'), 'Replace the sky.')
  assert.equal(formData.get('size'), '1024x1024')
  assert.equal(formData.get('n'), '1')
  assert.equal(formData.get('output_format'), 'png')
  assert.equal(formData.get('quality'), 'low')
  assert.equal(formData.get('model'), 'gpt-image-2')
  assert.equal(formData.get('user'), 'req_test')
  assert.ok(formData.get('image') instanceof Blob)
  assert.ok(formData.get('mask') instanceof Blob)
})

test('Responses image SSE events map to user-facing progress states', () => {
  const events = [
    ['response.created', '正在连接绘图引擎', 8],
    ['response.in_progress', '正在理解画面', 20],
    ['response.image_generation_call.in_progress', '开始绘制', 42],
    ['response.image_generation_call.generating', '细节生成中', 66],
    ['response.output_item.done', '整理最终图片', 92],
    ['response.completed', '生成完成', 100],
  ]

  for (const [type, label, progress] of events) {
    const mapped = responsesImageProgressFromEvent({ type }, 'png')
    assert.equal(mapped?.label, label)
    assert.equal(mapped?.progress, progress)
  }

  const preview = responsesImageProgressFromEvent({
    type: 'response.image_generation_call.partial_image',
    partial_image: {
      b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
    },
  }, 'png')

  assert.equal(preview?.label, '收到预览，继续打磨')
  assert.equal(preview?.partialImage?.mimeType, 'image/png')
  assert.equal(preview?.partialImage?.b64Json, 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB')
})

test('error resolver classifies common relay failures for UI handling', () => {
  assert.equal(resolveOpenAIError({
    status: 401,
    code: 'invalid_api_key',
    message: 'invalid api key',
  }).code, 'INVALID_API_KEY')

  assert.equal(resolveOpenAIError({
    status: 400,
    message: 'model does not exist',
    model: 'gpt-image-2',
  }).code, 'MODEL_NOT_SUPPORTED')

  assert.equal(resolveOpenAIError({
    status: 404,
    message: 'endpoint not found: /v1/responses',
  }).code, 'ENDPOINT_NOT_SUPPORTED')

  assert.equal(resolveOpenAIError({
    status: 503,
    message: 'no available upstream',
  }).code, 'UPSTREAM_UNAVAILABLE')

  const gatewayError = resolveOpenAIError({
    status: 520,
    message: 'error code: 520',
    model: 'gpt-image-2-chat',
  })
  assert.equal(gatewayError.code, 'PROXY_GATEWAY_ERROR')
  assert.match(gatewayError.message, /代理|网关/)
  assert.match(gatewayError.message, /Responses tool/)
})

test('priority quota errors are distinct from generic invalid key failures', () => {
  const resolved = resolveOpenAIError({
    status: 429,
    code: 'insufficient_quota',
    message: 'insufficient quota for image generation',
    model: 'gpt-image-2-chat-priority',
  })

  assert.equal(resolved.code, 'PRIORITY_QUOTA_INSUFFICIENT')
  assert.match(resolved.message, /不一定代表 Key 整体无效/)
  assert.match(resolved.message, /priority/)
  assert.match(resolved.message, /普通模型/)
})
