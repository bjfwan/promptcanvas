import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCapabilityMatrixFromConfig,
  buildImageGenerationProbeCandidates,
  detectImageGenerationConfig,
  inferImageGenerationConfigFromModels,
  normalizeImageGenerationConfig,
  parseOpenAIModelsResponse,
} from '../.test-dist/lib/imageGenerationDetection.js'

const detectedAt = '2026-06-11T00:00:00.000Z'

test('infers vsllm-style Responses tool capability matrix from model hints', () => {
  const config = inferImageGenerationConfigFromModels([
    { id: 'gpt-image-2' },
    { id: 'gpt-image-2-chat' },
    { id: 'gpt-image-2-chat-priority' },
    { id: 'gpt-image-2-codex' },
  ], { detectedAt })

  assert.equal(config.mode, 'responses_tool')
  assert.equal(config.generationMode, 'responses_tool')
  assert.equal(config.returnFormat, 'image_generation_call')
  assert.equal(config.responseModel, 'gpt-image-2-chat')
  assert.equal(config.imageToolModel, 'gpt-image-2')
  assert.equal(config.traditionalModel, 'gpt-image-2')
  assert.equal(config.textToImage, 'supported')
  assert.equal(config.imageEdit, 'supported')
  assert.equal(config.responsesTool, 'supported')
  assert.equal(config.sseStream, 'supported')
  assert.equal(config.partialPreview, 'supported')
  assert.equal(config.detectionSource, 'models_hint')
})

test('normalizes ai.td.ee-style Responses text data URL capability matrix', () => {
  const config = normalizeImageGenerationConfig({
    mode: 'responses_text_data_url',
    traditionalModel: ' gpt-image-2 ',
    responseModel: ' gpt-image-2 ',
    stream: true,
    textToImage: 'supported',
    imageEdit: 'supported',
    responsesTool: 'partial',
    sseStream: 'supported',
    partialPreview: 'unsupported',
    returnFormat: 'output_text_data_url',
    detectedAt,
    detectionSource: 'probe',
  })

  assert.deepEqual(buildCapabilityMatrixFromConfig(config), {
    textToImage: 'supported',
    imageEdit: 'supported',
    responsesTool: 'partial',
    sseStream: 'supported',
    partialPreview: 'unsupported',
    transparentBackground: 'unsupported',
    generationMode: 'responses_text_data_url',
    returnFormat: 'output_text_data_url',
    traditionalModel: 'gpt-image-2',
    responseModel: 'gpt-image-2',
    imageToolModel: undefined,
  })
})

test('infers traditional image generation capability matrix from model hints', () => {
  const config = inferImageGenerationConfigFromModels([
    { id: 'dall-e-3', supported_endpoint_types: ['/v1/images/generations'] },
  ], { detectedAt })

  assert.equal(config.mode, 'images_generations')
  assert.equal(config.generationMode, 'images_generations')
  assert.equal(config.returnFormat, 'b64_json')
  assert.equal(config.traditionalModel, 'dall-e-3')
  assert.equal(config.responseModel, undefined)
  assert.equal(config.stream, false)
  assert.equal(config.responsesTool, 'unsupported')
})

test('parses OpenAI-compatible model response shapes', () => {
  const entries = parseOpenAIModelsResponse({
    data: [
      { id: 'relay-image', supported_endpoint_types: ['images/generations'] },
      'gpt-image-2-chat',
      { id: '' },
    ],
  })

  assert.deepEqual(entries.map((entry) => entry.id), ['relay-image', 'gpt-image-2-chat'])
})

test('probe result can upgrade hinted config without calling real providers in tests', async () => {
  const config = await detectImageGenerationConfig({
    detectedAt,
    models: [{ id: 'gpt-image-2' }, { id: 'gpt-image-2-chat' }],
    probe: async (candidate) => ({
      ok: candidate.endpoint === '/responses',
      candidate: {
        ...candidate,
        mode: 'responses_text_data_url',
        returnFormat: 'output_text_data_url',
        responsesTool: 'partial',
        partialPreview: false,
      },
    }),
  })

  assert.equal(config.mode, 'responses_text_data_url')
  assert.equal(config.returnFormat, 'output_text_data_url')
  assert.equal(config.responsesTool, 'partial')
  assert.equal(config.detectionSource, 'probe')
})

test('builds probe candidates for supported non-auto modes', () => {
  const candidates = buildImageGenerationProbeCandidates({
    mode: 'responses_tool',
    responseModel: 'gpt-image-2-chat',
    imageToolModel: 'gpt-image-2',
    traditionalModel: 'gpt-image-2',
    stream: true,
  })

  assert.deepEqual(candidates.map((candidate) => candidate.endpoint), ['/responses', '/images/generations'])
})
