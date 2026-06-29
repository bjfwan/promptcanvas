import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzePairTransferPayload,
  applyPairTransferSelection,
  buildPairTransferBundle,
  defaultPairTransferSelection,
} from '../.test-dist/lib/pairTransferBundle.js'

const imageGeneration = {
  mode: 'auto',
  textToImage: 'supported',
  imageEdit: 'unsupported',
  responsesTool: 'unsupported',
  sseStream: 'unsupported',
  partialPreview: 'unsupported',
  generationMode: 'auto',
  returnFormat: 'b64_json',
}

test('builds a pair transfer bundle with current provider and all saved relays', () => {
  const currentProvider = {
    baseUrl: 'https://relay-a.example/v1',
    apiKey: 'key-current',
    proxyUrl: 'https://proxy.example',
    imageGeneration,
  }
  const providerPresets = [
    {
      id: 'preset-a',
      label: 'Relay A',
      baseUrl: 'https://relay-a.example/v1',
      apiKey: 'key-current',
      proxyUrl: 'https://proxy.example',
    },
    {
      id: 'preset-b',
      label: 'Relay B',
      baseUrl: 'https://relay-b.example/v1',
      apiKey: 'key-b',
      proxyUrl: 'https://proxy.example',
    },
  ]

  const bundle = buildPairTransferBundle({ currentProvider, providerPresets, now: () => '2026-06-29T00:00:00.000Z' })

  assert.equal(bundle.kind, 'promptcanvas.pair-transfer')
  assert.equal(bundle.version, 2)
  assert.equal(bundle.provider?.baseUrl, 'https://relay-a.example/v1')
  assert.equal(bundle.providerPresets.length, 2)
  assert.deepEqual(bundle.providerPresets.map((preset) => preset.label), ['Relay A', 'Relay B'])
})

test('analyzes incoming relays, marks duplicates, and defaults to new relays only', () => {
  const payload = buildPairTransferBundle({
    currentProvider: {
      baseUrl: 'https://relay-current.example/v1',
      apiKey: 'key-current',
      proxyUrl: 'https://proxy.example',
      imageGeneration,
    },
    providerPresets: [
      {
        id: 'incoming-duplicate',
        label: 'Already here',
        baseUrl: 'https://relay-existing.example/v1',
        apiKey: 'key-existing',
        proxyUrl: 'https://proxy.example',
      },
      {
        id: 'incoming-same-endpoint',
        label: 'Second account',
        baseUrl: 'https://relay-shared.example/v1',
        apiKey: 'key-other',
        proxyUrl: 'https://proxy.example',
      },
      {
        id: 'incoming-new',
        label: 'Fresh relay',
        baseUrl: 'https://relay-fresh.example/v1',
        apiKey: 'key-fresh',
        proxyUrl: 'https://proxy.example',
      },
    ],
    now: () => '2026-06-29T00:00:00.000Z',
  })

  const plan = analyzePairTransferPayload(payload, {
    currentProvider: {
      baseUrl: 'https://relay-current-local.example/v1',
      apiKey: 'key-local',
      proxyUrl: 'https://proxy.example',
      imageGeneration,
    },
    existingPresets: [
      {
        id: 'existing-duplicate',
        label: 'Existing relay',
        baseUrl: 'https://relay-existing.example/v1/',
        apiKey: 'key-existing',
        proxyUrl: 'https://proxy.example/',
      },
      {
        id: 'existing-same-endpoint',
        label: 'Shared endpoint',
        baseUrl: 'https://relay-shared.example/v1',
        apiKey: 'key-shared',
        proxyUrl: 'https://proxy.example',
      },
    ],
  })

  assert.equal(plan.candidates.length, 4)
  assert.equal(plan.summary.newCount, 2)
  assert.equal(plan.summary.exactDuplicateCount, 1)
  assert.equal(plan.summary.endpointDuplicateCount, 1)

  const byLabel = new Map(plan.candidates.map((candidate) => [candidate.label, candidate]))
  assert.equal(byLabel.get('Already here')?.duplicateKind, 'exact')
  assert.equal(byLabel.get('Second account')?.duplicateKind, 'endpoint')
  assert.equal(byLabel.get('Fresh relay')?.duplicateKind, 'none')

  const selected = defaultPairTransferSelection(plan)
  assert.deepEqual(
    selected.map((key) => plan.candidates.find((candidate) => candidate.importKey === key)?.label),
    ['Current config', 'Fresh relay'],
  )
})

test('applies selected relays without adding exact duplicates and can apply sender current config', () => {
  const payload = buildPairTransferBundle({
    currentProvider: {
      baseUrl: 'https://relay-current.example/v1',
      apiKey: 'key-current',
      proxyUrl: 'https://proxy.example',
      imageGeneration,
    },
    providerPresets: [
      {
        id: 'incoming-duplicate',
        label: 'Already here',
        baseUrl: 'https://relay-existing.example/v1',
        apiKey: 'key-existing',
        proxyUrl: 'https://proxy.example',
      },
      {
        id: 'incoming-new',
        label: 'Fresh relay',
        baseUrl: 'https://relay-fresh.example/v1',
        apiKey: 'key-fresh',
        proxyUrl: 'https://proxy.example',
      },
    ],
    now: () => '2026-06-29T00:00:00.000Z',
  })
  const existingPresets = [
    {
      id: 'existing-duplicate',
      label: 'Existing relay',
      baseUrl: 'https://relay-existing.example/v1/',
      apiKey: 'key-existing',
      proxyUrl: 'https://proxy.example/',
    },
  ]
  const plan = analyzePairTransferPayload(payload, {
    currentProvider: {
      baseUrl: 'https://relay-local.example/v1',
      apiKey: 'key-local',
      proxyUrl: 'https://proxy.example',
      imageGeneration,
    },
    existingPresets,
  })

  const selectedKeys = plan.candidates
    .filter((candidate) => candidate.label === 'Current config' || candidate.label === 'Fresh relay' || candidate.label === 'Already here')
    .map((candidate) => candidate.importKey)
  const result = applyPairTransferSelection({
    plan,
    existingPresets,
    selectedKeys,
    createId: (() => {
      let index = 0
      return () => `created-${++index}`
    })(),
  })

  assert.equal(result.importedCount, 2)
  assert.equal(result.skippedExactDuplicateCount, 1)
  assert.equal(result.appliedProvider?.baseUrl, 'https://relay-current.example/v1')
  assert.deepEqual(
    result.presets.map((preset) => [preset.id, preset.label, preset.baseUrl]),
    [
      ['existing-duplicate', 'Existing relay', 'https://relay-existing.example/v1'],
      ['created-1', undefined, 'https://relay-current.example/v1'],
      ['created-2', 'Fresh relay', 'https://relay-fresh.example/v1'],
    ],
  )
})
