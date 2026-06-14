<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { mapClientPointToCanvas, useMaskCanvas, type MaskTool } from '../composables/useMaskCanvas'
import Icon from './Icon.vue'
import { useI18n } from '../lib/i18n'

interface Props {
  /** Source image URL (data: or http) to paint over */
  imageSrc: string
  /** Natural width of the source image */
  imageWidth?: number
  /** Natural height of the source image */
  imageHeight?: number
}

const props = withDefaults(defineProps<Props>(), {
  imageWidth: 1024,
  imageHeight: 1024,
})

const emit = defineEmits<{
  (e: 'submit', payload: { mask: Blob; prompt: string }): void
  (e: 'cancel'): void
}>()
const { t } = useI18n()

// ─── Refs ──────────────────────────────────────────────────────────────────
const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const imageEl = ref<HTMLImageElement | null>(null)
const promptInput = ref<HTMLTextAreaElement | null>(null)

const promptText = shallowRef('')
const isSubmitting = shallowRef(false)
const imageLoaded = shallowRef(false)

const sourceWidth = shallowRef(props.imageWidth)
const sourceHeight = shallowRef(props.imageHeight)

// Canvas display dimensions (CSS px, responsive to container)
const displayWidth = shallowRef(0)
const displayHeight = shallowRef(0)

// ─── Mask canvas composable ────────────────────────────────────────────────
const mask = useMaskCanvas()

const toolOptions = computed<Array<{ value: MaskTool; icon: string; label: string }>>(() => [
  { value: 'brush', icon: 'brush', label: t('inpaint.tool.brush') },
  { value: 'eraser', icon: 'eraser', label: t('inpaint.tool.eraser') },
  { value: 'rect', icon: 'rectSelect', label: t('inpaint.tool.rect') },
])

const brushSizes = [16, 32, 48, 72, 100, 120]
const brushSizeIndex = shallowRef(2) // default 48
const sourceAspect = computed(() => (sourceHeight.value > 0 ? sourceWidth.value / sourceHeight.value : 1))
const usesRoundTool = computed(() => mask.activeTool.value === 'brush' || mask.activeTool.value === 'eraser')
const cursorPreview = ref({ x: 0, y: 0, visible: false })
const cursorRingStyle = computed(() => ({
  width: `${brushSizes[brushSizeIndex.value]}px`,
  height: `${brushSizes[brushSizeIndex.value]}px`,
  transform: `translate(${cursorPreview.value.x}px, ${cursorPreview.value.y}px) translate(-50%, -50%)`,
  opacity: cursorPreview.value.visible ? 1 : 0,
}))
const cursorRingClass = computed(() => ({
  'inpaint-cursor-ring--eraser': mask.activeTool.value === 'eraser',
}))

// ─── Responsively size the canvas to fit the container ─────────────────────
let resizeObserver: ResizeObserver | null = null

function recalcLayout() {
  const container = containerRef.value
  if (!container) return

  const rect = container.getBoundingClientRect()
  const style = window.getComputedStyle(container)
  const maxW = rect.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  const maxH = rect.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)

  if (!maxW || !maxH) return

  const aspect = sourceAspect.value
  let w: number, h: number

  if (maxW / maxH > aspect) {
    // Container is wider than image, so height constrains the canvas.
    h = maxH
    w = h * aspect
  } else {
    // Width-constrained
    w = maxW
    h = w / aspect
  }

  displayWidth.value = Math.max(1, Math.round(w))
  displayHeight.value = Math.max(1, Math.round(h))
}

onMounted(() => {
  recalcLayout()
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(recalcLayout)
    resizeObserver.observe(containerRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  mask.destroy()
})

function setSourceSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
  sourceWidth.value = Math.round(width)
  sourceHeight.value = Math.round(height)
}

// When image loads, update natural dimensions and layout
function onImageLoad() {
  const img = imageEl.value
  if (img?.naturalWidth && img.naturalHeight) {
    setSourceSize(img.naturalWidth, img.naturalHeight)
  }
  imageLoaded.value = true
  nextTick(recalcLayout)
}

// Attach mask canvas when canvas element is ready and sized
watch([canvasRef, displayWidth, displayHeight], ([canvas, w, h]) => {
  if (canvas && w && h) {
    mask.attach(canvas, w, h)
  }
}, { flush: 'post' })

watch(() => [props.imageWidth, props.imageHeight] as const, ([w, h]) => {
  if (!imageLoaded.value) {
    setSourceSize(w, h)
    nextTick(recalcLayout)
  }
})

watch(() => props.imageSrc, () => {
  activePointerId = null
  imageLoaded.value = false
  cursorPreview.value = { x: 0, y: 0, visible: false }
  setSourceSize(props.imageWidth, props.imageHeight)
  mask.clear()
  nextTick(recalcLayout)
})

// ─── Pointer events (unified mouse + touch) ───────────────────────────────
function getCanvasCoords(event: PointerEvent): { x: number; y: number } {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  const size = mask.getCanvasSize()

  return mapClientPointToCanvas(event, rect, {
    width: size.width || displayWidth.value,
    height: size.height || displayHeight.value,
  })
}

let activePointerId: number | null = null

function updateCursorPreview(coords: { x: number; y: number }, visible: boolean) {
  cursorPreview.value = {
    x: coords.x,
    y: coords.y,
    visible: visible && usesRoundTool.value,
  }
}

function hideCursorPreview() {
  cursorPreview.value = { ...cursorPreview.value, visible: false }
}

function onPointerDown(event: PointerEvent) {
  if (activePointerId !== null) return // single-touch only
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const canvas = canvasRef.value
  if (!canvas) return

  event.preventDefault()
  activePointerId = event.pointerId
  canvas.setPointerCapture(event.pointerId)

  const coords = getCanvasCoords(event)
  updateCursorPreview(coords, event.pointerType !== 'touch')
  mask.startStroke(coords.x, coords.y)
}

function onPointerMove(event: PointerEvent) {
  const coords = getCanvasCoords(event)
  updateCursorPreview(coords, activePointerId === null || event.pointerType !== 'touch')

  if (event.pointerId !== activePointerId) return
  event.preventDefault()
  mask.continueStroke(coords.x, coords.y)
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerId !== activePointerId) return
  const canvas = canvasRef.value
  const coords = getCanvasCoords(event)

  event.preventDefault()
  mask.continueStroke(coords.x, coords.y)

  if (canvas?.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId)
  }
  activePointerId = null
  mask.endStroke()

  if (event.pointerType === 'touch') {
    hideCursorPreview()
  } else {
    updateCursorPreview(coords, true)
  }
}

function onPointerLeave() {
  if (activePointerId === null) hideCursorPreview()
}

function onPointerEnter(event: PointerEvent) {
  updateCursorPreview(getCanvasCoords(event), true)
}

function onLostPointerCapture(event: PointerEvent) {
  if (event.pointerId !== activePointerId) return
  activePointerId = null
  mask.endStroke()
  hideCursorPreview()
}

// ─── Actions ──────────────────────────────────────────────────────────────
function handleUndo() {
  mask.undo()
}

function handleClear() {
  mask.clear()
}

async function handleSubmit() {
  if (!promptText.value.trim() || !mask.hasContent.value) return
  isSubmitting.value = true
  try {
    const maskBlob = await mask.exportMask(sourceWidth.value, sourceHeight.value)
    emit('submit', { mask: maskBlob, prompt: promptText.value.trim() })
  } finally {
    isSubmitting.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    handleSubmit()
  }
}

// ─── Brush size slider ─────────────────────────────────────────────────────
watch(brushSizeIndex, (index) => {
  mask.setBrushSize(brushSizes[index])
}, { immediate: true })

const canSubmit = computed(() => promptText.value.trim().length > 0 && mask.hasContent.value)
</script>

<template>
  <div class="inpaint-editor">
    <!-- Toolbar -->
    <header class="inpaint-toolbar">
      <div class="inpaint-toolbar__tools">
        <button
          v-for="opt in toolOptions"
          :key="opt.value"
          type="button"
          class="inpaint-toolbar__btn"
          :class="{ 'inpaint-toolbar__btn--active': mask.activeTool.value === opt.value }"
          :aria-label="opt.label"
          :aria-pressed="mask.activeTool.value === opt.value"
          :title="opt.label"
          @click="mask.setTool(opt.value)"
        >
          <Icon :name="(opt.icon as any)" :size="15" />
          <span class="inpaint-toolbar__btn-label">{{ opt.label }}</span>
        </button>
      </div>

      <div v-if="usesRoundTool" class="inpaint-toolbar__size">
        <span class="inpaint-toolbar__size-label">{{ brushSizes[brushSizeIndex] }}px</span>
        <input
          type="range"
          :min="0"
          :max="brushSizes.length - 1"
          step="1"
          :value="brushSizeIndex"
          class="inpaint-toolbar__slider"
          :aria-label="t('inpaint.toolSize')"
          :title="t('inpaint.toolSize')"
          @input="brushSizeIndex = Number(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="inpaint-toolbar__actions">
        <button
          type="button"
          class="inpaint-toolbar__btn"
          :disabled="!mask.canUndo.value"
          :aria-label="t('inpaint.undo')"
          :title="t('inpaint.undo')"
          @click="handleUndo"
        >
          <Icon name="undo" :size="14" />
        </button>
        <button
          type="button"
          class="inpaint-toolbar__btn"
          :disabled="!mask.hasContent.value"
          :aria-label="t('inpaint.clear')"
          :title="t('inpaint.clear')"
          @click="handleClear"
        >
          <Icon name="trash" :size="14" />
        </button>
      </div>
    </header>

    <!-- Canvas area -->
    <div ref="containerRef" class="inpaint-canvas-area">
      <div
        class="inpaint-canvas-wrap"
        :style="{ width: displayWidth + 'px', height: displayHeight + 'px' }"
      >
        <img
          ref="imageEl"
          :src="imageSrc"
          alt=""
          class="inpaint-canvas-wrap__image"
          draggable="false"
          @load="onImageLoad"
        />
        <canvas
          ref="canvasRef"
          class="inpaint-canvas-wrap__canvas"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @pointerenter="onPointerEnter"
          @pointerleave="onPointerLeave"
          @lostpointercapture="onLostPointerCapture"
          @contextmenu.prevent
        ></canvas>

        <!-- Visual cursor preview for brush mode (desktop only) -->
        <div
          v-if="usesRoundTool"
          class="inpaint-cursor-ring"
          :class="cursorRingClass"
          :style="cursorRingStyle"
          aria-hidden="true"
        ></div>
      </div>

      <!-- No-mask hint -->
      <div v-if="!mask.hasContent.value && imageLoaded" class="inpaint-hint" aria-live="polite">
        <Icon name="brush" :size="14" />
        <span>{{ t('inpaint.hint') }}</span>
      </div>
    </div>

    <!-- Bottom prompt bar -->
    <footer class="inpaint-prompt-bar">
      <div class="inpaint-prompt-bar__inner">
        <textarea
          ref="promptInput"
          v-model="promptText"
          class="inpaint-prompt-bar__input"
          rows="1"
          :placeholder="t('inpaint.placeholder')"
          enterkeyhint="send"
          autocomplete="off"
          @keydown="handleKeydown"
        ></textarea>
        <button
          type="button"
          class="inpaint-prompt-bar__cancel"
          :aria-label="t('inpaint.cancelAria')"
          @click="emit('cancel')"
        >
          {{ t('inpaint.cancel') }}
        </button>
        <button
          type="button"
          class="inpaint-prompt-bar__submit"
          :disabled="!canSubmit || isSubmitting"
          :aria-label="t('inpaint.generateAria')"
          @click="handleSubmit"
        >
          <Icon name="sparkle" :size="14" />
          <span>{{ t('inpaint.generate') }}</span>
        </button>
      </div>
      <p class="inpaint-prompt-bar__hint">
        <kbd>⌘↵</kbd> {{ t('inpaint.shortcutHint') }}
      </p>
    </footer>
  </div>
</template>

<style scoped>
.inpaint-editor {
  --inpaint-bg: 14 17 16;
  --inpaint-fg: 236 237 240;

  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  color-scheme: dark;
  background: rgb(var(--inpaint-bg) / 0.98);
  color: rgb(var(--inpaint-fg));
  overflow: hidden;
}

/* ─── Toolbar ────────────────────────────────────────────────────────────── */
.inpaint-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid rgb(var(--inpaint-fg) / 0.1);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.inpaint-toolbar__tools {
  display: flex;
  gap: 0.3rem;
}

.inpaint-toolbar__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 36px;
  padding: 0.4rem 0.65rem;
  border-radius: 8px;
  border: 1px solid rgb(var(--inpaint-fg) / 0.15);
  background: transparent;
  color: rgb(var(--inpaint-fg) / 0.75);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  touch-action: manipulation;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.inpaint-toolbar__btn:hover:not(:disabled) {
  background: rgb(var(--inpaint-fg) / 0.08);
  color: rgb(var(--inpaint-fg));
}

.inpaint-toolbar__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.inpaint-toolbar__btn--active {
  background: rgb(var(--inpaint-fg) / 0.14);
  border-color: rgb(var(--inpaint-fg) / 0.35);
  color: rgb(var(--inpaint-fg));
}

.inpaint-toolbar__btn-label {
  display: none;
}

@media (min-width: 640px) {
  .inpaint-toolbar__btn-label {
    display: inline;
  }
}

.inpaint-toolbar__size {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: 0.25rem;
}

.inpaint-toolbar__size-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  color: rgb(var(--inpaint-fg) / 0.55);
  min-width: 3.5ch;
  text-align: right;
}

.inpaint-toolbar__slider {
  width: 96px;
  height: 28px;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  outline: none;
  cursor: pointer;
  touch-action: pan-x;
}

.inpaint-toolbar__slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: rgb(var(--inpaint-fg) / 0.18);
}

.inpaint-toolbar__slider::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: rgb(var(--inpaint-fg) / 0.18);
}

.inpaint-toolbar__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border-radius: 999px;
  background: rgb(var(--inpaint-fg));
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.4);
  cursor: pointer;
}

.inpaint-toolbar__slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: none;
  border-radius: 999px;
  background: rgb(var(--inpaint-fg));
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.4);
  cursor: pointer;
}

.inpaint-toolbar__actions {
  display: flex;
  gap: 0.3rem;
  margin-left: auto;
}

/* ─── Canvas area ────────────────────────────────────────────────────────── */
.inpaint-canvas-area {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  position: relative;
  padding: 0.5rem;
  overflow: hidden;
}

.inpaint-canvas-wrap {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 0 0 1px rgb(var(--inpaint-fg) / 0.1);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.inpaint-canvas-wrap__image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.inpaint-canvas-wrap__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}

/* Brush cursor ring — follows the pointer via CSS, desktop only */
.inpaint-cursor-ring {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 999px;
  border: 2px solid rgb(var(--inpaint-fg) / 0.7);
  pointer-events: none;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 120ms ease;
  will-change: transform, opacity;
}

.inpaint-cursor-ring--eraser {
  border-style: dashed;
  background: rgb(var(--inpaint-fg) / 0.08);
}

@media (hover: hover) and (pointer: fine) {
  .inpaint-canvas-wrap:hover .inpaint-cursor-ring {
    opacity: 1;
  }
}

/* ─── Hint overlay ───────────────────────────────────────────────────────── */
.inpaint-hint {
  position: absolute;
  bottom: 1.2rem;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  background: rgb(var(--inpaint-fg) / 0.12);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: rgb(var(--inpaint-fg) / 0.7);
  font-size: 12px;
  pointer-events: none;
}

/* ─── Bottom prompt bar ──────────────────────────────────────────────────── */
.inpaint-prompt-bar {
  flex-shrink: 0;
  padding: 0.6rem 0.75rem;
  padding-bottom: max(env(safe-area-inset-bottom, 0px), 0.6rem);
  border-top: 1px solid rgb(var(--inpaint-fg) / 0.1);
}

.inpaint-prompt-bar__inner {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  background: rgb(var(--inpaint-fg) / 0.06);
  border: 1px solid rgb(var(--inpaint-fg) / 0.15);
  border-radius: 14px;
  padding: 0.5rem 0.6rem;
}

.inpaint-prompt-bar__input {
  flex: 1;
  min-height: 36px;
  max-height: 100px;
  resize: none;
  border: none;
  background: transparent;
  color: rgb(var(--inpaint-fg));
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  font-family: inherit;
}

.inpaint-prompt-bar__input::placeholder {
  color: rgb(var(--inpaint-fg) / 0.4);
}

.inpaint-prompt-bar__cancel {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0.4rem 0.7rem;
  border-radius: 8px;
  border: 1px solid rgb(var(--inpaint-fg) / 0.2);
  background: transparent;
  color: rgb(var(--inpaint-fg) / 0.7);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  touch-action: manipulation;
  transition: background 120ms ease, color 120ms ease;
}

.inpaint-prompt-bar__cancel:hover {
  background: rgb(var(--inpaint-fg) / 0.08);
  color: rgb(var(--inpaint-fg));
}

.inpaint-prompt-bar__submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-height: 36px;
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  border: none;
  background: rgb(var(--inpaint-fg));
  color: rgb(var(--inpaint-bg));
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  touch-action: manipulation;
  transition: opacity 120ms ease, transform 120ms ease;
}

.inpaint-prompt-bar__submit:hover:not(:disabled) {
  transform: translateY(-1px);
}

.inpaint-prompt-bar__submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.inpaint-prompt-bar__hint {
  margin-top: 0.35rem;
  text-align: center;
  font-size: 11px;
  color: rgb(var(--inpaint-fg) / 0.4);
}

.inpaint-prompt-bar__hint kbd {
  display: inline-flex;
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  border: 1px solid rgb(var(--inpaint-fg) / 0.2);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
}

/* ─── Mobile adjustments ─────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .inpaint-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    padding: 0.55rem 0.65rem;
    gap: 0.45rem;
  }

  .inpaint-toolbar__tools {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.35rem;
    min-width: 0;
  }

  .inpaint-toolbar__tools .inpaint-toolbar__btn-label {
    display: inline;
  }

  .inpaint-toolbar__btn {
    justify-content: center;
    min-height: 44px;
    padding: 0.5rem 0.55rem;
    font-size: 13px;
  }

  .inpaint-toolbar__actions {
    margin-left: 0;
    gap: 0.35rem;
  }

  .inpaint-toolbar__actions .inpaint-toolbar__btn {
    width: 44px;
    padding: 0;
  }

  .inpaint-toolbar__size {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    width: 100%;
    margin-left: 0;
    gap: 0.65rem;
  }

  .inpaint-toolbar__slider {
    width: 100%;
    height: 34px;
  }

  .inpaint-toolbar__slider::-webkit-slider-runnable-track,
  .inpaint-toolbar__slider::-moz-range-track {
    height: 6px;
  }

  .inpaint-toolbar__slider::-webkit-slider-thumb {
    width: 22px;
    height: 22px;
    margin-top: -8px;
  }

  .inpaint-toolbar__slider::-moz-range-thumb {
    width: 22px;
    height: 22px;
  }

  .inpaint-canvas-area {
    padding: 0.4rem;
  }

  .inpaint-hint {
    bottom: 0.75rem;
    max-width: calc(100% - 1rem);
    border-radius: 8px;
    text-align: center;
    line-height: 1.35;
  }

  .inpaint-prompt-bar__inner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: stretch;
    padding: 0.55rem;
    border-radius: 12px;
  }

  .inpaint-prompt-bar__input {
    grid-column: 1 / -1;
    width: 100%;
    min-height: 48px;
    max-height: 120px;
    font-size: 16px;
  }

  .inpaint-prompt-bar__cancel,
  .inpaint-prompt-bar__submit {
    min-height: 44px;
    padding: 0 0.75rem;
    font-size: 14px;
  }

  .inpaint-prompt-bar__hint {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .inpaint-toolbar__btn,
  .inpaint-prompt-bar__submit,
  .inpaint-prompt-bar__cancel,
  .inpaint-cursor-ring {
    transition: none;
  }
}
</style>
