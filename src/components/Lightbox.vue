<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useLightbox } from '../composables/useLightbox'
import { resolveImageSource } from '../api'
import { useFocusTrap } from '../composables/useFocusTrap'
import { useVibration } from '../composables/useVibration'
import Icon from './Icon.vue'

const lightbox = useLightbox()
const { vibrate } = useVibration()

const MIN_SCALE = 1
const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2

const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const gestureActive = ref(false)

const imageWrapRef = ref<HTMLDivElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const lightboxRef = ref<HTMLElement | null>(null)
const preloadedSources = new Set<string>()

let pinchStartDistance = 0
let pinchStartScale = 1
let pinchCenter: { x: number, y: number } | null = null
let pinchStartTranslate = { x: 0, y: 0 }
let panStart: { x: number, y: number, tx: number, ty: number } | null = null
let swipeStart: { x: number, y: number, time: number } | null = null
let lastTapTime = 0
let lastTapPos: { x: number, y: number } | null = null
let suppressNextClick = false

const activeImage = computed(() => lightbox.state.images[lightbox.state.index])
const activeSrc = computed(() => (activeImage.value ? resolveImageSource(activeImage.value) : ''))
const counter = computed(() =>
  lightbox.state.images.length > 1 ? `${lightbox.state.index + 1} / ${lightbox.state.images.length}` : '',
)
const isZoomed = computed(() => scale.value > 1.01)
const imageStyle = computed(() => ({
  transform: `translate3d(${translateX.value}px, ${translateY.value}px, 0) scale(${scale.value})`,
  transition: gestureActive.value ? 'none' : 'transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)',
  cursor: isZoomed.value ? 'zoom-out' : 'zoom-in',
}))

function resetTransform() {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
}

function clampPan() {
  const wrap = imageWrapRef.value
  const img = imageRef.value
  if (!wrap || !img) return
  const wrapRect = wrap.getBoundingClientRect()
  const imgRect = img.getBoundingClientRect()
  const overflowX = Math.max(0, (imgRect.width - wrapRect.width) / 2)
  const overflowY = Math.max(0, (imgRect.height - wrapRect.height) / 2)
  translateX.value = Math.max(-overflowX, Math.min(overflowX, translateX.value))
  translateY.value = Math.max(-overflowY, Math.min(overflowY, translateY.value))
}

function setScale(next: number, anchor?: { x: number, y: number }) {
  const wrap = imageWrapRef.value
  if (!wrap) {
    scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next))
    return
  }
  const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next))
  if (anchor) {
    const rect = wrap.getBoundingClientRect()
    const cx = anchor.x - rect.left - rect.width / 2
    const cy = anchor.y - rect.top - rect.height / 2
    const ratio = clamped / scale.value
    translateX.value = cx - (cx - translateX.value) * ratio
    translateY.value = cy - (cy - translateY.value) * ratio
  }
  scale.value = clamped
  if (clamped <= MIN_SCALE + 0.001) {
    translateX.value = 0
    translateY.value = 0
  } else {
    clampPan()
  }
}

function handleKey(event: KeyboardEvent) {
  if (!lightbox.state.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    lightbox.close()
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    lightbox.next()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    lightbox.prev()
  } else if (event.key === ' ') {
    event.preventDefault()
    setScale(isZoomed.value ? MIN_SCALE : DOUBLE_TAP_SCALE)
  } else if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    setScale(scale.value + 0.5)
  } else if (event.key === '-' || event.key === '_') {
    event.preventDefault()
    setScale(scale.value - 0.5)
  } else if (event.key === '0') {
    event.preventDefault()
    resetTransform()
  }
}

function preloadImageAt(index: number) {
  if (typeof window === 'undefined') return
  const total = lightbox.state.images.length
  if (total < 2) return
  const image = lightbox.state.images[(index + total) % total]
  if (!image) return
  const source = resolveImageSource(image)
  if (!source || preloadedSources.has(source)) return
  preloadedSources.add(source)
  const preload = new Image()
  preload.decoding = 'async'
  preload.src = source
}

function preloadAdjacentImages() {
  if (!lightbox.state.open) return
  preloadImageAt(lightbox.state.index - 1)
  preloadImageAt(lightbox.state.index + 1)
}

watch(
  () => lightbox.state.open,
  (isOpen) => {
    if (typeof document === 'undefined') return

    document.body.style.overflow = isOpen ? 'hidden' : ''
    if (isOpen) {
      window.addEventListener('keydown', handleKey)
      resetTransform()
    } else {
      window.removeEventListener('keydown', handleKey)
    }
  },
  { immediate: true },
)

watch(() => lightbox.state.index, () => {
  resetTransform()
  preloadAdjacentImages()
})

watch(
  () => [lightbox.state.open, lightbox.state.index, lightbox.state.images.length] as const,
  preloadAdjacentImages,
  { immediate: true },
)

useFocusTrap(() => lightbox.state.open, lightboxRef)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKey)
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
  }
})

function onTouchStart(event: TouchEvent) {
  if (event.touches.length === 2) {
    const t1 = event.touches[0]
    const t2 = event.touches[1]
    pinchStartDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
    pinchStartScale = scale.value
    pinchCenter = {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    }
    pinchStartTranslate = { x: translateX.value, y: translateY.value }
    panStart = null
    swipeStart = null
    gestureActive.value = true
    suppressNextClick = true
  } else if (event.touches.length === 1) {
    const t = event.touches[0]
    if (isZoomed.value) {
      panStart = { x: t.clientX, y: t.clientY, tx: translateX.value, ty: translateY.value }
      swipeStart = null
      gestureActive.value = true
    } else {
      swipeStart = { x: t.clientX, y: t.clientY, time: Date.now() }
      panStart = null
    }
  }
}

function onTouchMove(event: TouchEvent) {
  if (event.touches.length === 2 && pinchStartDistance > 0) {
    event.preventDefault()
    const t1 = event.touches[0]
    const t2 = event.touches[1]
    const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
    const ratio = distance / pinchStartDistance
    const nextScale = Math.max(MIN_SCALE * 0.85, Math.min(MAX_SCALE * 1.05, pinchStartScale * ratio))
    if (pinchCenter && imageWrapRef.value) {
      const rect = imageWrapRef.value.getBoundingClientRect()
      const cx = pinchCenter.x - rect.left - rect.width / 2
      const cy = pinchCenter.y - rect.top - rect.height / 2
      const baseRatio = nextScale / pinchStartScale
      translateX.value = cx - (cx - pinchStartTranslate.x) * baseRatio
      translateY.value = cy - (cy - pinchStartTranslate.y) * baseRatio
    }
    scale.value = Math.max(MIN_SCALE * 0.85, Math.min(MAX_SCALE, nextScale))
  } else if (event.touches.length === 1 && panStart) {
    event.preventDefault()
    const t = event.touches[0]
    translateX.value = panStart.tx + (t.clientX - panStart.x)
    translateY.value = panStart.ty + (t.clientY - panStart.y)
    clampPan()
  }
}

function onTouchEnd(event: TouchEvent) {
  if (event.touches.length === 0) {
    gestureActive.value = false
  }

  if (scale.value < MIN_SCALE) {
    setScale(MIN_SCALE)
  } else if (scale.value > MAX_SCALE) {
    setScale(MAX_SCALE)
  } else if (isZoomed.value) {
    clampPan()
  }

  if (event.touches.length >= 1 && pinchStartDistance > 0) {
    pinchStartDistance = 0
    pinchCenter = null
    return
  }
  if (event.touches.length === 0 && pinchStartDistance > 0) {
    pinchStartDistance = 0
    pinchCenter = null
    panStart = null
    return
  }

  if (panStart && event.touches.length === 0) {
    panStart = null
    suppressNextClick = true
    return
  }

  if (swipeStart && event.changedTouches.length === 1 && event.touches.length === 0) {
    const t = event.changedTouches[0]
    const dx = t.clientX - swipeStart.x
    const dy = t.clientY - swipeStart.y
    const dist = Math.hypot(dx, dy)
    const dt = Date.now() - swipeStart.time

    if (dist < 12 && dt < 280) {
      const now = Date.now()
      if (lastTapPos && now - lastTapTime < 320 && Math.hypot(t.clientX - lastTapPos.x, t.clientY - lastTapPos.y) < 32) {
        if (isZoomed.value) {
          resetTransform()
        } else {
          setScale(DOUBLE_TAP_SCALE, { x: t.clientX, y: t.clientY })
        }
        vibrate('tap')
        lastTapTime = 0
        lastTapPos = null
        suppressNextClick = true
      } else {
        lastTapTime = now
        lastTapPos = { x: t.clientX, y: t.clientY }
      }
    } else if (!isZoomed.value && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) lightbox.next()
      else lightbox.prev()
      suppressNextClick = true
    }
    swipeStart = null
  }
}

function onImageClick(event: MouseEvent) {
  if (suppressNextClick) {
    suppressNextClick = false
    return
  }
  if (event.detail > 0) {
    if (isZoomed.value) {
      resetTransform()
    } else {
      setScale(DOUBLE_TAP_SCALE, { x: event.clientX, y: event.clientY })
    }
  }
}

function onWheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey && !isZoomed.value) return
  event.preventDefault()
  const delta = -event.deltaY * 0.0025
  setScale(scale.value * (1 + delta), { x: event.clientX, y: event.clientY })
}

async function copyPrompt() {
  if (!activeImage.value?.revisedPrompt) return
  try {
    await navigator.clipboard.writeText(activeImage.value.revisedPrompt)
  } catch {
  }
}

async function downloadCurrent() {
  if (!activeImage.value || !activeSrc.value) return
  const ext = activeImage.value.mimeType?.split('/')[1] || 'png'
  const filename = `promptcanvas-${Date.now()}.${ext}`

  try {
    const response = await fetch(activeSrc.value)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    const anchor = document.createElement('a')
    anchor.href = activeSrc.value
    anchor.download = filename
    anchor.target = '_blank'
    anchor.click()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="lb-fade">
      <div
        v-if="lightbox.state.open"
        ref="lightboxRef"
        class="fixed inset-0 z-lightbox flex flex-col bg-ink/90 text-paper backdrop-blur"
        role="dialog"
        aria-modal="true"
        aria-label="图片详情"
        @click="lightbox.close"
      >
        <header class="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top,0px),1rem)]" @click.stop>
          <div class="flex items-center gap-2 text-paper/85">
            <span class="grid h-7 w-7 place-items-center rounded-full border border-paper/25 font-display text-sm">P</span>
            <span class="font-mono text-[10px] uppercase tracking-[0.24em]">{{ counter || 'Canvas · 1' }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="grid h-11 w-11 place-items-center rounded-full border border-paper/20 text-paper transition hover:bg-paper/10"
              :aria-pressed="isZoomed"
              aria-label="切换缩放"
              @click="isZoomed ? resetTransform() : setScale(DOUBLE_TAP_SCALE)"
            >
              <Icon :name="isZoomed ? 'shrink' : 'expand'" :size="16" />
            </button>
            <button
              type="button"
              class="grid h-11 w-11 place-items-center rounded-full border border-paper/20 text-paper transition hover:bg-paper/10"
              aria-label="下载图片"
              @click="downloadCurrent"
            >
              <Icon name="download" :size="16" />
            </button>
            <button
              type="button"
              class="grid h-11 w-11 place-items-center rounded-full border border-paper/20 text-paper transition hover:bg-paper/10"
              aria-label="关闭详情"
              @click="lightbox.close"
            >
              <Icon name="close" :size="16" />
            </button>
          </div>
        </header>

        <div
          ref="imageWrapRef"
          class="lb-stage relative flex-1 select-none overflow-hidden"
          @click.stop
          @touchstart="onTouchStart"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
          @touchcancel="onTouchEnd"
          @wheel="onWheel"
        >
          <Transition name="lb-zoom">
            <img
              v-if="activeSrc"
              ref="imageRef"
              :key="lightbox.state.index"
              :src="activeSrc"
              alt="生成图片详情"
              loading="eager"
              decoding="async"
              draggable="false"
              class="absolute inset-0 m-auto max-h-full max-w-full object-contain p-3 will-change-transform sm:p-8"
              :style="imageStyle"
              @click="onImageClick"
            />
          </Transition>

          <button
            v-if="lightbox.state.images.length > 1 && !isZoomed"
            type="button"
            class="absolute left-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-paper/20 bg-ink/40 text-paper transition hover:bg-paper/15"
            aria-label="上一张"
            @click="lightbox.prev"
          >
            <Icon name="arrowLeft" :size="18" />
          </button>
          <button
            v-if="lightbox.state.images.length > 1 && !isZoomed"
            type="button"
            class="absolute right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-paper/20 bg-ink/40 text-paper transition hover:bg-paper/15"
            aria-label="下一张"
            @click="lightbox.next"
          >
            <Icon name="arrowRight" :size="18" />
          </button>
        </div>

        <footer class="px-4 pb-[max(env(safe-area-inset-bottom,0px),1rem)] pt-2" @click.stop>
          <div
            v-if="activeImage?.revisedPrompt"
            class="mx-auto max-w-3xl rounded-2xl border border-paper/15 bg-paper/5 px-4 py-3 text-[12px] leading-5 text-paper/75 backdrop-blur"
          >
            <div class="mb-1 flex items-center justify-between">
              <p class="font-mono text-[10px] uppercase tracking-[0.24em] text-paper/55">Revised prompt</p>
              <button
                type="button"
                class="font-mono text-[10px] uppercase tracking-[0.18em] text-paper/65 transition hover:text-paper"
                @click="copyPrompt"
              >
                复制
              </button>
            </div>
            <p class="truncate-2">{{ activeImage.revisedPrompt }}</p>
          </div>
          <p
            v-if="lightbox.state.images.length > 1"
            class="mt-2 hidden text-center font-mono text-[10px] uppercase tracking-[0.24em] text-paper/55 sm:block"
          >
            ← →&nbsp;切换 · Space 缩放 · +/- 缩放 · 0 复位 · Esc 关闭
          </p>
          <p
            v-else-if="isZoomed"
            class="mt-2 hidden text-center font-mono text-[10px] uppercase tracking-[0.24em] text-paper/55 sm:block"
          >
            双指缩放 · 单指拖动 · 双击复位
          </p>
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lb-fade-enter-from,
.lb-fade-leave-to {
  opacity: 0;
}
.lb-fade-enter-active,
.lb-fade-leave-active {
  transition: opacity 0.24s ease-out;
}

.lb-zoom-enter-from {
  opacity: 0;
}
.lb-zoom-leave-to {
  opacity: 0;
}
.lb-zoom-enter-active,
.lb-zoom-leave-active {
  transition: opacity 0.32s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .lb-fade-enter-active,
  .lb-fade-leave-active,
  .lb-zoom-enter-active,
  .lb-zoom-leave-active {
    transition: none;
  }
}

.lb-stage {
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
</style>
