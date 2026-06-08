import { ref } from 'vue'

export type MaskTool = 'brush' | 'rect'

interface BrushStroke {
  tool: 'brush'
  points: Array<{ x: number; y: number }>
  radius: number // in canvas px
}

interface RectStroke {
  tool: 'rect'
  rect: { x: number; y: number; w: number; h: number } // canvas px
}

type Stroke = BrushStroke | RectStroke

/**
 * Composable for painting inpainting masks on a <canvas>.
 * Designed to work at display resolution; exports full-res mask PNG.
 * Mobile-friendly: pointer events only, no hover dependency.
 */
export function useMaskCanvas() {
  const activeTool = ref<MaskTool>('brush')
  const hasContent = ref(false)
  const canUndo = ref(false)

  let canvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null
  let canvasW = 0
  let canvasH = 0

  // Stroke history
  let strokes: Stroke[] = []
  let currentStroke: Stroke | null = null
  let rectStart: { x: number; y: number } | null = null

  // Brush settings
  let brushRadius = 24 // CSS px

  // DPR handling
  let dpr = 1

  function attach(el: HTMLCanvasElement, w: number, h: number) {
    canvas = el
    dpr = window.devicePixelRatio || 1
    canvasW = w
    canvasH = h

    // Set canvas buffer size accounting for DPR
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'

    ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
    }
    redraw()
  }

  function setTool(t: MaskTool) {
    activeTool.value = t
  }

  function setBrushSize(size: number) {
    brushRadius = size / 2
  }

  // ─── Drawing ─────────────────────────────────────────────────────────────

  function startStroke(x: number, y: number) {
    if (activeTool.value === 'brush') {
      currentStroke = {
        tool: 'brush',
        points: [{ x, y }],
        radius: brushRadius,
      }
    } else {
      rectStart = { x, y }
      currentStroke = {
        tool: 'rect',
        rect: { x, y, w: 0, h: 0 },
      }
    }
    redraw()
  }

  function continueStroke(x: number, y: number) {
    if (!currentStroke) return

    if (currentStroke.tool === 'brush') {
      currentStroke.points.push({ x, y })
    } else if (rectStart) {
      currentStroke.rect = {
        x: Math.min(rectStart.x, x),
        y: Math.min(rectStart.y, y),
        w: Math.abs(x - rectStart.x),
        h: Math.abs(y - rectStart.y),
      }
    }
    redraw()
  }

  function endStroke() {
    if (!currentStroke) return

    // Validate meaningful content
    let valid = false
    if (currentStroke.tool === 'brush' && currentStroke.points.length > 0) {
      valid = true
    } else if (currentStroke.tool === 'rect') {
      valid = currentStroke.rect.w > 3 && currentStroke.rect.h > 3
    }

    if (valid) {
      strokes.push(currentStroke)
      syncState()
    }

    currentStroke = null
    rectStart = null
    redraw()
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

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

  function destroy() {
    canvas = null
    ctx = null
    strokes = []
    currentStroke = null
  }

  // ─── Rendering ───────────────────────────────────────────────────────────

  function redraw() {
    if (!ctx || !canvas) return

    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvasW, canvasH)

    // Draw committed strokes
    for (const stroke of strokes) {
      drawStroke(ctx, stroke)
    }

    // Draw in-progress stroke
    if (currentStroke) {
      drawStroke(ctx, currentStroke)
    }

    ctx.restore()
  }

  function drawStroke(c: CanvasRenderingContext2D, stroke: Stroke) {
    c.fillStyle = 'rgba(255, 60, 80, 0.38)'
    c.strokeStyle = 'rgba(255, 60, 80, 0.55)'

    if (stroke.tool === 'brush') {
      const r = stroke.radius

      // Draw filled circles at each point
      c.beginPath()
      for (const p of stroke.points) {
        c.moveTo(p.x + r, p.y)
        c.arc(p.x, p.y, r, 0, Math.PI * 2)
      }
      c.fill()

      // Connect with thick line for smooth coverage
      if (stroke.points.length > 1) {
        c.lineWidth = r * 2
        c.lineCap = 'round'
        c.lineJoin = 'round'
        c.strokeStyle = 'rgba(255, 60, 80, 0.38)'
        c.beginPath()
        c.moveTo(stroke.points[0].x, stroke.points[0].y)
        for (let i = 1; i < stroke.points.length; i++) {
          c.lineTo(stroke.points[i].x, stroke.points[i].y)
        }
        c.stroke()
      }
    } else if (stroke.tool === 'rect') {
      const { x, y, w, h } = stroke.rect
      c.fillRect(x, y, w, h)
      c.lineWidth = 1.5
      c.strokeRect(x, y, w, h)
    }
  }

  // ─── Export ──────────────────────────────────────────────────────────────

  /**
   * Export the mask as a full-resolution PNG Blob.
   * Black = keep, White = edit zone (OpenAI mask format).
   */
  async function exportMask(imageWidth: number, imageHeight: number): Promise<Blob> {
    const offscreen = document.createElement('canvas')
    offscreen.width = imageWidth
    offscreen.height = imageHeight
    const oc = offscreen.getContext('2d')!

    // Fill black (untouched areas)
    oc.fillStyle = '#000000'
    oc.fillRect(0, 0, imageWidth, imageHeight)

    // Scale factor from display canvas to full res
    const sx = imageWidth / canvasW
    const sy = imageHeight / canvasH

    // Draw mask regions in white
    oc.fillStyle = '#ffffff'
    oc.strokeStyle = '#ffffff'

    for (const stroke of strokes) {
      if (stroke.tool === 'brush') {
        const r = stroke.radius * sx

        oc.beginPath()
        for (const p of stroke.points) {
          const px = p.x * sx
          const py = p.y * sy
          oc.moveTo(px + r, py)
          oc.arc(px, py, r, 0, Math.PI * 2)
        }
        oc.fill()

        if (stroke.points.length > 1) {
          oc.lineWidth = r * 2
          oc.lineCap = 'round'
          oc.lineJoin = 'round'
          oc.beginPath()
          oc.moveTo(stroke.points[0].x * sx, stroke.points[0].y * sy)
          for (let i = 1; i < stroke.points.length; i++) {
            oc.lineTo(stroke.points[i].x * sx, stroke.points[i].y * sy)
          }
          oc.stroke()
        }
      } else if (stroke.tool === 'rect') {
        const { x, y, w, h } = stroke.rect
        oc.fillRect(x * sx, y * sy, w * sx, h * sy)
      }
    }

    return new Promise<Blob>((resolve, reject) => {
      offscreen.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to export mask'))
      }, 'image/png')
    })
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

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
