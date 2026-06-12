import assert from 'node:assert/strict'
import test from 'node:test'
import { File } from 'node:buffer'
import {
  buildImagesEditsFormData,
  buildResponsesImageRequest,
  buildResponsesTextDataUrlRequest,
  validatePayload,
  normalizeImages,
  parseResponsesImageSse,
  parseResponsesImageSseBlock,
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

test('Responses SSE parser falls back to event names when data omits type', () => {
  const sse = [
    'event: response.output_item.done',
    'data: {"item":{"id":"ig_event_name","type":"image_generation_call","result":"BASE64_FROM_EVENT_NAME"}}',
    '',
    'data: [DONE]',
    '',
  ].join('\n')

  const parsed = parseResponsesImageSse(sse)
  const images = normalizeImages(parsed, 'png')

  assert.equal(images.length, 1)
  assert.equal(images[0].b64Json, 'BASE64_FROM_EVENT_NAME')

  const previewEvent = parseResponsesImageSseBlock([
    'event: response.image_generation_call.partial_image',
    'data: {"partial_image_b64":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"}',
  ].join('\n'))
  const preview = responsesImageProgressFromEvent(previewEvent, 'png')

  assert.equal(preview?.stage, 'preview')
  assert.equal(preview?.partialImage?.b64Json, 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB')
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

test('normalizes data URL image payloads returned in b64 fields', () => {
  const traditional = normalizeImages({
    data: [{
      id: 'relay_data_url',
      b64_json: 'data:image/jpeg;base64,/9j/RELAY_IMAGE',
    }],
  }, 'png')

  assert.equal(traditional[0].b64Json, '/9j/RELAY_IMAGE')
  assert.equal(traditional[0].mimeType, 'image/jpeg')

  const responses = normalizeImages({
    output: [{
      id: 'responses_data_url',
      type: 'image_generation_call',
      result: 'data:image/webp;base64,UklGRRESPONSES_IMAGE',
    }],
  }, 'png')

  assert.equal(responses[0].b64Json, 'UklGRRESPONSES_IMAGE')
  assert.equal(responses[0].mimeType, 'image/webp')
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

test('Responses tool payload gates partial_images on streaming previews', async () => {
  const basePayload = {
    prompt: 'A red circle centered on white.',
    size: '1024x1024',
    count: 1,
    outputFormat: 'png',
    quality: 'low',
    model: 'gpt-image-2-chat',
    responseModel: 'gpt-image-2-chat',
    imageToolModel: 'gpt-image-2',
    referenceImages: [],
    partialImages: 3,
  }

  const previewRequest = await buildResponsesImageRequest({
    ...basePayload,
    stream: true,
    partialPreview: true,
  })
  assert.equal(previewRequest.tools[0].partial_images, 3)

  const waitOnlyRequest = await buildResponsesImageRequest({
    ...basePayload,
    stream: true,
    partialPreview: false,
  })
  assert.equal(waitOnlyRequest.tools[0].partial_images, 0)

  const nonStreamingRequest = await buildResponsesImageRequest({
    ...basePayload,
    stream: false,
    partialPreview: true,
  })
  assert.equal(nonStreamingRequest.tools[0].partial_images, 0)
})

test('Responses tool payload attaches references, mask, transparent background, and preview defaults', async () => {
  const request = await buildResponsesImageRequest({
    prompt: 'Edit the foreground subject.',
    size: '1024x1536',
    count: 2,
    outputFormat: 'png',
    quality: 'medium',
    model: 'gpt-image-2-chat',
    referenceImages: [{
      id: 'ref_1',
      name: 'reference.webp',
      mimeType: 'image/webp',
      sizeBytes: 24,
      previewUrl: 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA',
    }],
    mask: 'data:image/png;base64, MASK_DATA ',
    stream: true,
    transparentBackground: true,
    partialPreview: true,
  })

  assert.equal(request.model, 'gpt-image-2-chat')
  assert.equal(request.stream, true)
  assert.equal(request.tools[0].model, 'gpt-image-2')
  assert.equal(request.tools[0].background, 'transparent')
  assert.equal(request.tools[0].partial_images, 2)

  const content = request.input[0].content
  assert.equal(content.length, 3)
  assert.equal(content[1].type, 'input_image')
  assert.equal(content[1].image_url, 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA')
  assert.equal(content[2].type, 'input_image')
  assert.equal(content[2].image_url, 'data:image/png;base64,MASK_DATA')
  assert.match(content[0].text, /inpainting mask/)
})

test('Responses tool payload keeps transparent background png-only', async () => {
  const request = await buildResponsesImageRequest({
    prompt: 'A product photo.',
    size: '1024x1024',
    count: 1,
    outputFormat: 'jpeg',
    quality: 'high',
    model: 'gpt-image-2-chat',
    referenceImages: [],
    stream: false,
    transparentBackground: true,
    partialPreview: true,
    partialImages: 3,
  })

  assert.equal(request.tools[0].partial_images, 0)
  assert.equal(request.tools[0].background, undefined)
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

test('validation accepts string image inputs only for Responses-compatible modes', () => {
  const basePayload = {
    prompt: 'Use the reference image.',
    style: '',
    size: '1024x1024',
    count: 1,
    outputFormat: 'png',
    quality: 'auto',
    modelSelection: 'explicit',
    referenceImages: [{
      id: 'ref_1',
      name: 'reference.png',
      mimeType: 'image/png',
      sizeBytes: 0,
      image_url: {
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
      },
    }],
    inpaintMask: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
  }

  const responsesPayload = validatePayload({
    ...basePayload,
    model: 'gpt-image-2-chat',
    responseModel: 'gpt-image-2-chat',
    mode: 'responses_tool',
  })

  assert.equal(responsesPayload.error, undefined)
  assert.equal(responsesPayload.value.referenceImages[0].previewUrl, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB')
  assert.equal(responsesPayload.value.referenceImages[0].sizeBytes, 24)
  assert.equal(responsesPayload.value.inpaintMask, 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB')

  const imageGenerationsPayload = validatePayload({
    ...basePayload,
    model: 'gpt-image-2',
    responseModel: '',
    mode: 'images_generations',
  })

  assert.match(imageGenerationsPayload.error, /referenceImages/)
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

test('Responses image progress parses nested relay partial preview fields', () => {
  const preview = responsesImageProgressFromEvent({
    type: 'response.image_generation_call.partial_image',
    output_format: 'webp',
    delta: {
      partialImageB64: 'data:image/webp;base64, UklGRiQAAABXRUJQ ',
    },
  }, 'png')

  assert.equal(preview?.stage, 'preview')
  assert.equal(preview?.partialImage?.mimeType, 'image/webp')
  assert.equal(preview?.partialImage?.b64Json, 'UklGRiQAAABXRUJQ')
})

test('Responses image progress parses official partial_image_b64 events', () => {
  const preview = responsesImageProgressFromEvent({
    type: 'response.image_generation_call.partial_image',
    partial_image_b64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
    partial_image_index: 0,
  }, 'png')

  assert.equal(preview?.stage, 'preview')
  assert.equal(preview?.partialImage?.mimeType, 'image/png')
  assert.equal(preview?.partialImage?.b64Json, 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB')
})

test('Responses SSE parser handles CRLF, multi-line data fields, and duplicate outputs', () => {
  const sse = [
    ': keepalive\r\n',
    'event: response.completed\r\n',
    'data: {"type":"response.completed","response":{"output":[\r\n',
    'data: {"id":"ig_1","type":"image_generation_call","b64_json":"B64_ONE"},\r\n',
    'data: {"id":"ig_1","type":"image_generation_call","b64_json":"B64_ONE"}\r\n',
    'data: ]}}\r\n',
    '\r\n',
    'data: [DONE]\r\n',
    '\r\n',
  ].join('')

  const parsed = parseResponsesImageSse(sse)
  const images = normalizeImages(parsed, 'png')

  assert.equal(images.length, 1)
  assert.equal(images[0].id, 'ig_1')
  assert.equal(images[0].b64Json, 'B64_ONE')
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

  const disconnected = resolveOpenAIError({
    status: 502,
    message: 'upstream socket hang up before response completed',
    model: 'gpt-image-2-chat',
  })
  assert.equal(disconnected.code, 'PROXY_GATEWAY_ERROR')
  assert.match(disconnected.message, /request ID/)
})

test('error resolver classifies size, timeout, and browser network failures', () => {
  assert.equal(resolveOpenAIError({
    status: 400,
    message: 'size not supported by this model',
  }).code, 'SIZE_NOT_SUPPORTED')

  assert.equal(resolveOpenAIError({
    name: 'TimeoutError',
    code: 'ETIMEDOUT',
    message: 'request timed out',
  }).status, 504)

  assert.equal(resolveOpenAIError({
    name: 'TypeError',
    message: 'Failed to fetch',
  }).code, 'NETWORK_ERROR')
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
