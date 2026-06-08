<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { useMaskCanvas, type MaskTool } from '../composables/useMaskCanvas'
import Icon from './Icon.vue'

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

// ─── Refs ──────────────────────────────────────────────────────────────────
const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const imageEl = ref<HTMLImageElement | null>(null)
const promptInput = ref<HTMLTextAreaElement | null>(null)

const promptText = ref('')
const isSubmitting = ref(false)
const imageLoaded = ref(false)

// Canvas display dimensions (CSS px, responsive to container)
const displayWidth = ref(0)
const displayHeight = ref(0)

// ─── Mask canvas composable ────────────────────────────────────────────────
const mask = useMaskCanvas()

const toolOptions: { value: MaskTool; icon: string; label: string }[] = [
  { value: 'brush', icon: 'brush', label: '画笔' },
  { value: 'rect', icon: 'rectSelect', label: '矩形选区' },
]

// ─── Responsively size the canvas to fit the container ─────────────────────
let resizeObserver: ResizeObserver | null = null

function recalcLayout() {
  const container = containerRef.value
  if (!container) return

  const maxW = container.clientWidth
  const maxH = container.clientHeight

  if (!maxW || !maxH) return

  const aspect = props.imageWidth / props.imageHeight
  let w: number, h: number

  if (maxW / maxH > aspect) {
    // Container is wider than image — height-constrained
    h = maxH
    w = h * aspect
  } else {
    // Width-constrained
    w = maxW
    h = w / aspect
  }

  displayWidth.value = Math.round(w)
  displayHeight.value = Math.round(h)
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

// When image loads, update natural dimensions and layout
function onImageLoad() {
  imageLoaded.value = true
  if (imageEl.value) {
    // Override with actual natural dimensions for precision
    const nw = imageEl.value.naturalWidth
    const nh = imageEl.value.naturalHeight
    if (nw && nh) {
      ;(props as any).imageWidth = nw
      ;(props as any).imageHeight = nh
    }
  }
  nextTick(recalcLayout)
}

// Attach mask canvas when canvas element is ready and sized
watch([canvasRef, displayWidth, displayHeight], ([canvas, w, h]) => {
  if (canvas && w && h) {
    mask.attach(canvas, w, h)
  }
})

// ─── Pointer events (unified mouse + touch) ───────────────────────────────
function getCanvasCoords(event: PointerEvent): { x: number; y: number } {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

let activePointerId: number | null = null

function onPointerDown(event: PointerEvent) {
  if (activePointerId !== null) return // single-touch only
  const canvas = canvasRef.value
  if (!canvas) return

  activePointerId = event.pointerId
  canvas.setPointerCapture(event.pointerId)

  const coords = getCanvasCoords(event)
  mask.startStroke(coords.x, coords.y)
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerId !== activePointerId) return
  const coords = getCanvasCoords(event)
  mask.continueStroke(coords.x, coords.y)
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerId !== activePointerId) return
  const canvas = canvasRef.value
  if (canvas) canvas.releasePointerCapture(event.pointerId)
  activePointerId = null
  mask.endStroke()
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
    const maskBlob = await mask.exportMask(props.imageWidth, props.imageHeight)
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
const brushSizes = [16, 32, 48, 72, 100, 120]
const brushSizeIndex = ref(2) // default 48

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
          @click="mask.setTool(opt.value)"
        >
          <Icon :name="(opt.icon as any)" :size="15" />
          <span class="inpaint-toolbar__btn-label">{{ opt.label }}</span>
        </button>
      </div>

      <div v-if="mask.activeTool.value === 'brush'" class="inpaint-toolbar__size">
        <span class="inpaint-toolbar__size-label">{{ brushSizes[brushSizeIndex] }}px</span>
        <input
          type="range"
          :min="0"
          :max="brushSizes.length - 1"
          step="1"
          :value="brushSizeIndex"
          class="inpaint-toolbar__slider"
          aria-label="画笔大小"
          @input="brushSizeIndex = Number(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="inpaint-toolbar__actions">
        <button
          type="button"
          class="inpaint-toolbar__btn"
          :disabled="!mask.canUndo.value"
          aria-label="撤销"
          @click="handleUndo"
        >
          <Icon name="undo" :size="14" />
        </button>
        <button
          type="button"
          class="inpaint-toolbar__btn"
          :disabled="!mask.hasContent.value"
          aria-label="清除全部"
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
          :width="displayWidth"
          :height="displayHeight"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        ></canvas>

        <!-- Visual cursor preview for brush mode (desktop only) -->
        <div
          v-if="mask.activeTool.value === 'brush'"
          class="inpaint-cursor-ring"
          :style="{
            width: brushSizes[brushSizeIndex] + 'px',
            height: brushSizes[brushSizeIndex] + 'px',
          }"
          aria-hidden="true"
        ></div>
      </div>

      <!-- No-mask hint -->
      <div v-if="!mask.hasContent.value && imageLoaded" class="inpaint-hint" aria-live="polite">
        <Icon name="brush" :size="14" />
        <span>涂抹或框选你想编辑的区域</span>
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
          placeholder="描述选中区域要变成什么…"
          @keydown="handleKeydown"
        ></textarea>
        <button
          type="button"
          class="inpaint-prompt-bar__cancel"
          aria-label="取消编辑"
          @click="emit('cancel')"
        >
          取消
        </button>
        <button
          type="button"
          class="inpaint-prompt-bar__submit"
          :disabled="!canSubmit || isSubmitting"
          aria-label="生成编辑"
          @click="handleSubmit"
        >
          <Icon name="sparkle" :size="14" />
          <span>生成</span>
        </button>
      </div>
      <p class="inpaint-prompt-bar__hint">
        <kbd>⌘↵</kbd> 发送 · 用画笔涂要改的区域，再描述目标
      </p>
    </footer>
  </div>
</template>

<style scoped>
.inpaint-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: rgb(14 17 16 / 0.98);
  color: rgb(var(--color-paper));
  overflow: hidden;
}

/* ─── Toolbar ────────────────────────────────────────────────────────────── */
.inpaint-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid rgb(var(--color-paper) / 0.1);
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
  padding: 0.4rem 0.65rem;
  border-radius: 9px;
  border: 1px solid rgb(var(--color-paper) / 0.15);
  background: transparent;
  color: rgb(var(--color-paper) / 0.75);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.inpaint-toolbar__btn:hover:not(:disabled) {
  background: rgb(var(--color-paper) / 0.08);
  color: rgb(var(--color-paper));
}

.inpaint-toolbar__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.inpaint-toolbar__btn--active {
  background: rgb(var(--color-paper) / 0.14);
  border-color: rgb(var(--color-paper) / 0.35);
  color: rgb(var(--color-paper));
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
  color: rgb(var(--color-paper) / 0.55);
  min-width: 3.5ch;
  text-align: right;
}

.inpaint-toolbar__slider {
  width: 80px;
  height: 4px;
  appearance: none;
  -webkit-appearance: none;
  background: rgb(var(--color-paper) / 0.18);
  border-radius: 999px;
  outline: none;
  cursor: pointer;
}

.inpaint-toolbar__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: rgb(var(--color-paper));
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.4);
  cursor: pointer;
}

.inpaint-toolbar__slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: none;
  border-radius: 999px;
  background: rgb(var(--color-paper));
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
  box-shadow: 0 0 0 1px rgb(var(--color-paper) / 0.1);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.inpaint-canvas-wrap__image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  border: 2px solid rgb(var(--color-paper) / 0.7);
  pointer-events: none;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 120ms ease;
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
  background: rgb(var(--color-paper) / 0.12);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: rgb(var(--color-paper) / 0.7);
  font-size: 12px;
  pointer-events: none;
}

/* ─── Bottom prompt bar ──────────────────────────────────────────────────── */
.inpaint-prompt-bar {
  flex-shrink: 0;
  padding: 0.6rem 0.75rem;
  padding-bottom: max(env(safe-area-inset-bottom, 0px), 0.6rem);
  border-top: 1px solid rgb(var(--color-paper) / 0.1);
}

.inpaint-prompt-bar__inner {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  background: rgb(var(--color-paper) / 0.06);
  border: 1px solid rgb(var(--color-paper) / 0.15);
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
  color: rgb(var(--color-paper));
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  font-family: inherit;
}

.inpaint-prompt-bar__input::placeholder {
  color: rgb(var(--color-paper) / 0.4);
}

.inpaint-prompt-bar__cancel {
  padding: 0.4rem 0.7rem;
  border-radius: 9px;
  border: 1px solid rgb(var(--color-paper) / 0.2);
  background: transparent;
  color: rgb(var(--color-paper) / 0.7);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 120ms ease, color 120ms ease;
}

.inpaint-prompt-bar__cancel:hover {
  background: rgb(var(--color-paper) / 0.08);
  color: rgb(var(--color-paper));
}

.inpaint-prompt-bar__submit {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.85rem;
  border-radius: 9px;
  border: none;
  background: rgb(var(--color-paper));
  color: rgb(14 17 16);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
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
  color: rgb(var(--color-paper) / 0.4);
}

.inpaint-prompt-bar__hint kbd {
  display: inline-flex;
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  border: 1px solid rgb(var(--color-paper) / 0.2);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
}

/* ─── Mobile adjustments ─────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .inpaint-toolbar {
    padding: 0.5rem 0.6rem;
    gap: 0.4rem;
  }

  .inpaint-toolbar__slider {
    width: 60px;
  }

  .inpaint-prompt-bar__inner {
    flex-wrap: wrap;
  }

  .inpaint-prompt-bar__input {
    width: 100%;
    flex: unset;
  }

  .inpaint-prompt-bar__cancel,
  .inpaint-prompt-bar__submit {
    flex: 1;
    justify-content: center;
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
