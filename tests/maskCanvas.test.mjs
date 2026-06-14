import assert from 'node:assert/strict'
import test from 'node:test'
import { drawMaskStroke } from '../.test-dist/composables/useMaskCanvas.js'

function createContextRecorder() {
  const calls = []
  let operation = 'source-over'

  return {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    get globalCompositeOperation() {
      return operation
    },
    set globalCompositeOperation(value) {
      calls.push(['globalCompositeOperation', value])
      operation = value
    },
    save() { calls.push(['save']) },
    restore() { calls.push(['restore']) },
    beginPath() { calls.push(['beginPath']) },
    moveTo(x, y) { calls.push(['moveTo', x, y]) },
    lineTo(x, y) { calls.push(['lineTo', x, y]) },
    ellipse(x, y, rx, ry) { calls.push(['ellipse', x, y, rx, ry]) },
    fill() { calls.push(['fill', this.fillStyle, this.globalCompositeOperation]) },
    stroke() { calls.push(['stroke', this.strokeStyle, this.globalCompositeOperation]) },
    fillRect(x, y, w, h) { calls.push(['fillRect', x, y, w, h, this.fillStyle]) },
    strokeRect(x, y, w, h) { calls.push(['strokeRect', x, y, w, h, this.strokeStyle]) },
  }
}

test('mask eraser removes display overlay instead of painting another red stroke', () => {
  const ctx = createContextRecorder()

  drawMaskStroke(ctx, {
    tool: 'eraser',
    points: [{ x: 0.5, y: 0.5 }],
    radiusX: 0.1,
    radiusY: 0.1,
  }, 100, 80, false)

  assert.ok(ctx.calls.some((call) => call[0] === 'globalCompositeOperation' && call[1] === 'destination-out'))
  assert.ok(ctx.calls.some((call) => call[0] === 'fill' && call[2] === 'destination-out'))
})

test('mask eraser exports black keep pixels for erased areas', () => {
  const ctx = createContextRecorder()

  drawMaskStroke(ctx, {
    tool: 'eraser',
    points: [{ x: 0.5, y: 0.5 }],
    radiusX: 0.1,
    radiusY: 0.1,
  }, 100, 80, true)

  assert.ok(ctx.calls.every((call) => !(call[0] === 'globalCompositeOperation' && call[1] === 'destination-out')))
  assert.ok(ctx.calls.some((call) => call[0] === 'fill' && call[1] === '#000000'))
})
