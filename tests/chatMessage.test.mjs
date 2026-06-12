import assert from 'node:assert/strict'
import test from 'node:test'
import { collectMessageReferenceImages } from '../.test-dist/lib/chatMessage.js'

test('collects only user message reference images', () => {
  const refA = {
    id: 'ref-a',
    name: 'a.png',
    mimeType: 'image/png',
    sizeBytes: 10,
    previewUrl: 'blob:ref-a',
  }
  const refB = {
    id: 'ref-b',
    name: 'b.png',
    mimeType: 'image/png',
    sizeBytes: 20,
    previewUrl: 'blob:ref-b',
  }

  const collected = collectMessageReferenceImages([
    {
      id: 'user-1',
      role: 'user',
      content: 'use these',
      createdAt: '2026-06-12T00:00:00.000Z',
      meta: { style: 'raw', size: '1024x1024', count: 1, outputFormat: 'png' },
      referenceImages: [refA, refB],
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      status: 'success',
      content: 'done',
      createdAt: '2026-06-12T00:00:01.000Z',
      meta: { style: 'raw', size: '1024x1024', count: 1, outputFormat: 'png' },
      images: [{ url: 'https://example.test/out.png' }],
    },
  ])

  assert.deepEqual(collected, [refA, refB])
})
