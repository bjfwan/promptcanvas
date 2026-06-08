<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useLightbox } from '../composables/useLightbox'
import { resolveImageSource } from '../api'
import { useFocusTrap } from '../composables/useFocusTrap'
import { useVibration } from '../composables/useVibration'
import { useBodyLock } from '../composables/useBodyLock'
import { useI18n } from '../lib/i18n'
import { useShare } from '../composables/useShare'
import { useToast } from '../composables/useToast'
import Icon from './Icon.vue'

const lightbox = useLightbox()
const { t } = useI18n()
const { supported: shareSupported, share } = useShare()
const toast = useToast()
const { vibrate } = useVibration()

const MIN_SCALE = 1
const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2

const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const gestureActive = ref(false)
const infoOpen = ref(false)

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
  } else if (event.key.toLowerCase() === 'i') {
    event.preventDefault()
    infoOpen.value = !infoOpen.value
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
useBodyLock(() => lightbox.state.open)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKey)
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
    } else if (!isZoomed.value && dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      vibrate('tap')
      lightbox.close()
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

async function shareCurrent() {
  if (!activeImage.value || !activeSrc.value) return
  const ext = activeImage.value.mimeType?.split('/')[1] || 'png'
  const filename = `promptcanvas-${Date.now()}.${ext}`

  let blob: Blob | null = null
  try {
    const response = await fetch(activeSrc.value)
    if (response.ok) blob = await response.blob()
  } catch {
    // CORS or network failure — try text-only share below.
  }

  const outcome = await share({
    title: t('app.title'),
    text: activeImage.value.revisedPrompt || undefined,
    url: activeSrc.value.startsWith('http') ? activeSrc.value : undefined,
    blob,
    filename,
  })

  if (outcome === 'shared') {
    toast.success(t('toast.shareSuccess'))
  } else if (outcome === 'fallback-copy') {
    toast.info(t('toast.copied'))
  } else if (outcome === 'unsupported') {
    toast.error(t('toast.shareUnsupported'))
  } else if (outcome === 'failed') {
    toast.error(t('toast.shareFailed'))
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="lb-fade">
      <div
        v-if="lightbox.state.open"
        ref="lightboxRef"
        class="lightbox-shell fixed inset-0 z-lightbox flex flex-col text-paper backdrop-blur"
        role="dialog"
        aria-modal="true"
        :aria-label="t('lightbox.label')"
        @click="lightbox.close"
      >
        <header class="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top,0px),1rem)]" @click.stop>
          <div class="flex items-center gap-2 text-paper/85">
            <span class="grid h-8 w-8 place-items-center overflow-hidden rounded-xl border border-paper/20 bg-paper/10">
              <img src="/brand/favicon.png" alt="" width="32" height="32" decoding="async" />
            </span>
            <span class="font-mono text-[10px] uppercase tracking-[0.24em]">{{ counter || 'Canvas · 1' }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="grid h-11 w-11 place-items-center rounded-full border border-paper/20 text-paper transition hover:bg-paper/10"
              :aria-pressed="infoOpen"
              :aria-label="infoOpen ? t('lightbox.info.close') : t('lightbox.info.expand')"
              @click="infoOpen = !infoOpen"
            >
              <Icon name="info" :size="16" />
            </button>
            <button
              type="button"
              class="grid h-11 w-11 place-items-center rounded-full border border-paper/20 text-paper transition hover:bg-paper/10"
              :aria-pressed="isZoomed"
              :aria-label="t('lightbox.toggleZoom')"
              @click="isZoomed ? resetTransform() : setScale(DOUBLE_TAP_SCALE)"
            >
              <Icon :name="isZoomed ? 'shrink' : 'expand'" :size="16" />
            </button>
            <button
              type="button"
              class="grid h-11 w-11 place-items-center rounded-full border border-paper/20 text-paper transition hover:bg-paper/10"
              :aria-label="t('lightbox.download')"
              @click="downloadCurrent"
            >
              <Icon name="download" :size="16" />
            </button>
            <button
              v-if="shareSupported"
              type="button"
              class="grid h-11 w-11 place-items-center rounded-full border border-paper/20 text-paper transition hover:bg-paper/10"
              :aria-label="t('lightbox.share')"
              @click="shareCurrent"
            >
              <Icon name="share" :size="16" />
            </button>
            <button
              type="button"
              class="grid h-11 w-11 place-items-center rounded-full border border-paper/20 text-paper transition hover:bg-paper/10"
              :aria-label="t('lightbox.close')"
              @click="lightbox.close"
            >
              <Icon name="close" :size="16" />
            </button>
          </div>
        </header>

        <div class="lb-stage-row relative flex flex-1 min-h-0">
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
              :alt="t('lightbox.label')"
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
            :aria-label="t('lightbox.prev')"
            @click="lightbox.prev"
          >
            <Icon name="arrowLeft" :size="18" />
          </button>
          <button
            v-if="lightbox.state.images.length > 1 && !isZoomed"
            type="button"
            class="absolute right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-paper/20 bg-ink/40 text-paper transition hover:bg-paper/15"
            :aria-label="t('lightbox.next')"
            @click="lightbox.next"
          >
            <Icon name="arrowRight" :size="18" />
          </button>
          </div>

          <Transition name="lb-info">
            <aside
              v-if="infoOpen"
              class="lb-info"
              role="complementary"
              :aria-label="t('lightbox.info.metadata')"
              @click.stop
            >
              <header class="lb-info__head">
                <span class="font-mono text-[10px] uppercase tracking-[0.22em] text-paper/55">Metadata</span>
                <button
                  type="button"
                  class="grid h-8 w-8 place-items-center rounded-full text-paper/70 transition hover:bg-paper/10 hover:text-paper"
                  :aria-label="t('lightbox.info.close')"
                  @click="infoOpen = false"
                >
                  <Icon name="close" :size="13" />
                </button>
              </header>

              <dl class="lb-info__body">
                <div v-if="activeImage?.revisedPrompt" class="lb-info__group">
                  <dt class="lb-info__label">
                    <span>{{ t('lightbox.info.revisedPrompt') }}</span>
                    <button
                      type="button"
                      class="text-paper/65 transition hover:text-paper"
                      @click="copyPrompt"
                    >{{ t('lightbox.copy') }}</button>
                  </dt>
                  <dd class="lb-info__prompt">{{ activeImage.revisedPrompt }}</dd>
                </div>

                <div class="lb-info__group">
                  <dt class="lb-info__label"><span>{{ t('lightbox.info.image') }}</span></dt>
                  <dd class="lb-info__rows">
                    <span><em>{{ t('lightbox.info.type') }}</em><b>{{ activeImage?.mimeType || '—' }}</b></span>
                    <span><em>{{ t('lightbox.info.index') }}</em><b class="font-mono">{{ lightbox.state.index + 1 }} / {{ lightbox.state.images.length }}</b></span>
                  </dd>
                </div>

                <div v-if="counter" class="lb-info__group">
                  <dt class="lb-info__label"><span>{{ t('lightbox.info.tip') }}</span></dt>
                  <dd class="lb-info__hint">
                    {{ t('lightbox.info.tipText') }}
                  </dd>
                </div>
              </dl>
            </aside>
          </Transition>
        </div>

        <footer class="px-4 pb-[max(env(safe-area-inset-bottom,0px),1rem)] pt-2" @click.stop>
          <p
            v-if="lightbox.state.images.length > 1"
            class="hidden text-center font-mono text-[10px] uppercase tracking-[0.24em] text-paper/55 sm:block"
            v-html="t('lightbox.foot.tipMulti')"
          ></p>
          <p
            v-else-if="isZoomed"
            class="hidden text-center font-mono text-[10px] uppercase tracking-[0.24em] text-paper/55 sm:block"
          >
            {{ t('lightbox.foot.tipZoomed') }}
          </p>
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lightbox-shell {
  background:
    radial-gradient(circle at 18% 0%, rgb(47 70 84 / 0.34), transparent 34%),
    radial-gradient(circle at 82% 100%, rgb(176 127 48 / 0.22), transparent 38%),
    rgb(14 17 16 / 0.96);
}

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

.lb-stage-row {
  gap: 0;
}

.lb-info {
  width: min(360px, 86vw);
  max-width: 360px;
  flex-shrink: 0;
  border-left: 1px solid rgb(var(--color-paper) / 0.12);
  background:
    linear-gradient(180deg, rgb(0 0 0 / 0.32), rgb(0 0 0 / 0.18));
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (max-width: 640px) {
  .lb-info {
    width: 100%;
    max-width: none;
    border-left: none;
    border-top: 1px solid rgb(var(--color-paper) / 0.12);
  }

  .lb-stage-row {
    flex-direction: column;
  }
}

.lb-info__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem 0.6rem;
  border-bottom: 1px solid rgb(var(--color-paper) / 0.08);
}

.lb-info__body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  scrollbar-width: thin;
  scrollbar-color: rgb(var(--color-paper) / 0.18) transparent;
}

.lb-info__body::-webkit-scrollbar {
  width: 5px;
}

.lb-info__body::-webkit-scrollbar-thumb {
  background: rgb(var(--color-paper) / 0.18);
  border-radius: 999px;
}

.lb-info__group {
  display: flex;
  flex-direction: column;
  gap: 0.42rem;
}

.lb-info__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgb(var(--color-paper) / 0.55);
}

.lb-info__label button {
  font-size: 10px;
  letter-spacing: 0.18em;
}

.lb-info__prompt {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: rgb(var(--color-paper) / 0.92);
  white-space: pre-wrap;
  word-break: break-word;
}

.lb-info__rows {
  margin: 0;
  display: grid;
  gap: 0.32rem;
}

.lb-info__rows span {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: rgb(var(--color-paper) / 0.85);
}

.lb-info__rows em {
  font-style: normal;
  color: rgb(var(--color-paper) / 0.55);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.lb-info__rows b {
  font-weight: 500;
  color: rgb(var(--color-paper));
}

.lb-info__hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: rgb(var(--color-paper) / 0.6);
}

.lb-info-enter-from,
.lb-info-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.lb-info-enter-active,
.lb-info-leave-active {
  transition: opacity 220ms ease-out, transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (max-width: 640px) {
  .lb-info-enter-from,
  .lb-info-leave-to {
    transform: translateY(20px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lb-info-enter-active,
  .lb-info-leave-active {
    transition: none;
  }
}
</style>
