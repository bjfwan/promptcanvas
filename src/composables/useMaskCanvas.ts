import { shallowRef } from 'vue'

export type MaskTool = 'brush' | 'rect'

export interface CanvasPoint {
  x: number
  y: number
}

interface CanvasSize {
  width: number
  height: number
}

interface ClientRectLike {
  left: number
  top: number
  width: number
  height: number
}

interface UnitPoint {
  x: number
  y: number
}

interface BrushStroke {
  tool: 'brush'
  points: UnitPoint[]
  radiusX: number
  radiusY: number
}

interface RectStroke {
  tool: 'rect'
  rect: { x: number; y: number; w: number; h: number }
}

type Stroke = BrushStroke | RectStroke

const DISPLAY_FILL = 'rgba(255, 60, 80, 0.38)'
const DISPLAY_STROKE = 'rgba(255, 60, 80, 0.55)'
const MASK_FILL = '#ffffff'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function safeSize(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1
}

export function mapClientPointToCanvas(
  point: { clientX: number; clientY: number },
  rect: ClientRectLike,
  size: CanvasSize,
): CanvasPoint {
  const width = safeSize(size.width)
  const height = safeSize(size.height)
  const rectWidth = safeSize(rect.width)
  const rectHeight = safeSize(rect.height)

  return {
    x: clamp(((point.clientX - rect.left) / rectWidth) * width, 0, width),
    y: clamp(((point.clientY - rect.top) / rectHeight) * height, 0, height),
  }
}

/**
 * Paints inpainting masks on a canvas and exports a full-resolution mask.
 * Geometry is stored in image-relative coordinates, so DPR changes, mobile
 * resizes, and mask export all use the same selected region.
 */
export function useMaskCanvas() {
  const activeTool = shallowRef<MaskTool>('brush')
  const hasContent = shallowRef(false)
  const canUndo = shallowRef(false)

  let canvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null
  let canvasW = 0
  let canvasH = 0
  let dpr = 1

  let strokes: Stroke[] = []
  let currentStroke: Stroke | null = null
  let rectStart: UnitPoint | null = null

  let brushRadius = 24

  function attach(el: HTMLCanvasElement, w: number, h: number) {
    canvas = el
    dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
    canvasW = Math.max(1, Math.round(w))
    canvasH = Math.max(1, Math.round(h))

    canvas.width = Math.max(1, Math.round(canvasW * dpr))
    canvas.height = Math.max(1, Math.round(canvasH * dpr))
    canvas.style.width = `${canvasW}px`
    canvas.style.height = `${canvasH}px`

    ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    redraw()
  }

  function destroy() {
    canvas = null
    ctx = null
    strokes = []
    currentStroke = null
    rectStart = null
    syncState()
  }

  function getCanvasSize(): CanvasSize {
    return { width: canvasW, height: canvasH }
  }

  function setTool(t: MaskTool) {
    activeTool.value = t
  }

  function setBrushSize(size: number) {
    brushRadius = clamp(size / 2, 1, 500)
  }

  function startStroke(x: number, y: number) {
    const point = toUnitPoint(x, y)

    if (activeTool.value === 'brush') {
      currentStroke = {
        tool: 'brush',
        points: [point],
        radiusX: brushRadius / safeSize(canvasW),
        radiusY: brushRadius / safeSize(canvasH),
      }
    } else {
      rectStart = point
      currentStroke = {
        tool: 'rect',
        rect: { x: point.x, y: point.y, w: 0, h: 0 },
      }
    }

    redraw()
  }

  function continueStroke(x: number, y: number) {
    if (!currentStroke) return

    const point = toUnitPoint(x, y)

    if (currentStroke.tool === 'brush') {
      currentStroke.points.push(point)
    } else if (rectStart) {
      currentStroke.rect = {
        x: Math.min(rectStart.x, point.x),
        y: Math.min(rectStart.y, point.y),
        w: Math.abs(point.x - rectStart.x),
        h: Math.abs(point.y - rectStart.y),
      }
    }

    redraw()
  }

  function endStroke() {
    if (!currentStroke) return

    let valid = false
    if (currentStroke.tool === 'brush' && currentStroke.points.length > 0) {
      valid = true
    } else if (currentStroke.tool === 'rect') {
      valid = currentStroke.rect.w * canvasW > 3 && currentStroke.rect.h * canvasH > 3
    }

    if (valid) {
      strokes.push(currentStroke)
      syncState()
    }

    currentStroke = null
    rectStart = null
    redraw()
  }

  function undo() {
    if (strokes.length === 0) return
    strokes.pop()
    syncState()
    redraw()
  }

  function clear() {
    strokes = []
    currentStroke = null
    rectStart = null
    syncState()
    redraw()
  }

  async function exportMask(imageWidth: number, imageHeight: number): Promise<Blob> {
    const outputW = Math.max(1, Math.round(imageWidth))
    const outputH = Math.max(1, Math.round(imageHeight))
    const offscreen = document.createElement('canvas')
    offscreen.width = outputW
    offscreen.height = outputH

    const oc = offscreen.getContext('2d')
    if (!oc) throw new Error('Failed to create mask canvas')

    oc.fillStyle = '#000000'
    oc.fillRect(0, 0, outputW, outputH)

    for (const stroke of strokes) {
      drawStroke(oc, stroke, outputW, outputH, true)
    }

    return new Promise<Blob>((resolve, reject) => {
      offscreen.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to export mask'))
      }, 'image/png')
    })
  }

  function redraw() {
    if (!ctx || !canvas) return

    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvasW, canvasH)

    for (const stroke of strokes) {
      drawStroke(ctx, stroke, canvasW, canvasH, false)
    }

    if (currentStroke) {
      drawStroke(ctx, currentStroke, canvasW, canvasH, false)
    }

    ctx.restore()
  }

  function drawStroke(
    c: CanvasRenderingContext2D,
    stroke: Stroke,
    targetW: number,
    targetH: number,
    maskMode: boolean,
  ) {
    c.fillStyle = maskMode ? MASK_FILL : DISPLAY_FILL
    c.strokeStyle = maskMode ? MASK_FILL : DISPLAY_STROKE

    if (stroke.tool === 'brush') {
      const rx = Math.max(0.5, stroke.radiusX * targetW)
      const ry = Math.max(0.5, stroke.radiusY * targetH)

      c.beginPath()
      for (const p of stroke.points) {
        const px = p.x * targetW
        const py = p.y * targetH
        c.moveTo(px + rx, py)
        c.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2)
      }
      c.fill()

      if (stroke.points.length > 1) {
        c.lineWidth = Math.max(1, rx + ry)
        c.lineCap = 'round'
        c.lineJoin = 'round'
        c.strokeStyle = maskMode ? MASK_FILL : DISPLAY_FILL
        c.beginPath()
        c.moveTo(stroke.points[0].x * targetW, stroke.points[0].y * targetH)
        for (let i = 1; i < stroke.points.length; i++) {
          c.lineTo(stroke.points[i].x * targetW, stroke.points[i].y * targetH)
        }
        c.stroke()
      }

      return
    }

    const { x, y, w, h } = stroke.rect
    const px = x * targetW
    const py = y * targetH
    const pw = w * targetW
    const ph = h * targetH
    c.fillRect(px, py, pw, ph)

    if (!maskMode) {
      c.lineWidth = 1.5
      c.strokeRect(px, py, pw, ph)
    }
  }

  function toUnitPoint(x: number, y: number): UnitPoint {
    return {
      x: clamp(x / safeSize(canvasW), 0, 1),
      y: clamp(y / safeSize(canvasH), 0, 1),
    }
  }

  function syncState() {
    hasContent.value = strokes.length > 0
    canUndo.value = strokes.length > 0
  }

  return {
    activeTool,
    hasContent,
    canUndo,

    attach,
    destroy,
    getCanvasSize,
    setTool,
    setBrushSize,

    startStroke,
    continueStroke,
    endStroke,

    undo,
    clear,
    exportMask,
  }
}
