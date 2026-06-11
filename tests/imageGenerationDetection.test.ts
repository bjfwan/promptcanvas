import assert from 'node:assert/strict'
import {
  buildImageGenerationProbeCandidates,
  detectImageGenerationConfig,
  inferImageGenerationConfigFromModels,
  normalizeImageGenerationConfig,
  parseOpenAIModelsResponse,
} from '../src/lib/imageGenerationDetection.ts'

const detectedAt = '2026-06-11T00:00:00.000Z'

{
  const config = inferImageGenerationConfigFromModels([
    { id: 'gpt-image-2' },
    { id: 'gpt-image-2-chat' },
    { id: 'gpt-image-2-chat-priority' },
    { id: 'gpt-image-2-codex' },
  ], { detectedAt })

  assert.equal(config.mode, 'responses_tool')
  assert.equal(config.responseModel, 'gpt-image-2-chat')
  assert.equal(config.imageToolModel, 'gpt-image-2')
  assert.equal(config.traditionalModel, 'gpt-image-2')
  assert.equal(config.stream, true)
  assert.equal(config.detectionSource, 'models_hint')
}

{
  const config = inferImageGenerationConfigFromModels([
    { id: 'dall-e-3', supported_endpoint_types: ['/v1/images/generations'] },
  ], { detectedAt })

  assert.equal(config.mode, 'images_generations')
  assert.equal(config.traditionalModel, 'dall-e-3')
  assert.equal(config.responseModel, undefined)
  assert.equal(config.stream, false)
}

{
  const entries = parseOpenAIModelsResponse({
    data: [
      { id: 'relay-image', supported_endpoint_types: ['images/generations'] },
      'gpt-image-2-chat',
      { id: '' },
    ],
  })

  assert.deepEqual(entries.map((entry) => entry.id), ['relay-image', 'gpt-image-2-chat'])
}

{
  const normalized = normalizeImageGenerationConfig({
    mode: 'responses_tool',
    responseModel: ' gpt-image-2-chat ',
    imageToolModel: ' gpt-image-2 ',
    stream: true,
    detectedAt,
    detectionSource: 'probe',
  })

  assert.deepEqual(normalized, {
    mode: 'responses_tool',
    responseModel: 'gpt-image-2-chat',
    imageToolModel: 'gpt-image-2',
    stream: true,
    detectedAt,
    detectionSource: 'probe',
  })
}

{
  const config = await detectImageGenerationConfig({
    detectedAt,
    models: [{ id: 'gpt-image-2' }, { id: 'gpt-image-2-chat' }],
    probe: async (candidate) => ({
      ok: candidate.endpoint === '/responses',
      candidate,
    }),
  })

  assert.equal(config.mode, 'responses_tool')
  assert.equal(config.detectionSource, 'probe')
}

{
  const candidates = buildImageGenerationProbeCandidates({
    mode: 'responses_tool',
    responseModel: 'gpt-image-2-chat',
    imageToolModel: 'gpt-image-2',
    traditionalModel: 'gpt-image-2',
    stream: true,
  })

  assert.deepEqual(candidates.map((candidate) => candidate.endpoint), ['/responses', '/images/generations'])
}
