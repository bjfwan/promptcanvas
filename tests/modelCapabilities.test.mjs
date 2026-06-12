import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregateCapabilities,
  lookupModelCapability,
  maxTier,
} from '../.test-dist/lib/modelCapabilities.js'

test('known image models expose expected generation capability hints', () => {
  const capability = lookupModelCapability('gpt-image-2-chat-priority')

  assert.equal(capability?.maxTier, '4k')
  assert.equal(capability?.supportsEdits, true)
  assert.equal(capability?.supportsMask, true)
  assert.equal(capability?.supportsQuality, true)
  assert.deepEqual(capability?.outputFormats, ['png', 'jpeg', 'webp'])
})

test('aggregates the strongest known model capabilities across a provider', () => {
  const capability = aggregateCapabilities([
    'dall-e-3',
    'unknown-2048-image-model',
  ])

  assert.equal(capability.maxTier, '2k')
  assert.equal(capability.supports2k, true)
  assert.equal(capability.supports4k, false)
  assert.equal(capability.supportsEdits, true)
  assert.equal(capability.supportsMask, true)
  assert.equal(capability.supportsQuality, true)
  assert.deepEqual(capability.outputFormats, ['png', 'jpeg', 'webp'])
  assert.equal(capability.knownModelCount, 2)
})

test('maxTier keeps the highest resolution tier regardless of order', () => {
  assert.equal(maxTier('1k', '4k'), '4k')
  assert.equal(maxTier('4k', '2k'), '4k')
})
