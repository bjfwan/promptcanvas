<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import DevelopingFrame from './DevelopingFrame.vue'
import { resolveImageSource } from '../api'
import { useI18n } from '../lib/i18n'
import { useShare } from '../composables/useShare'
import { useToast } from '../composables/useToast'
import type { GeneratedImage, ImageSize } from '../types'

interface QuickPromptCard {
  title: string
  prompt: string
}

interface Props {
  images: GeneratedImage[]
  activeImageIndex: number
  isGenerating: boolean
  elapsedSeconds: number
  errorMessage: string
  lastRequestId: string
  size: ImageSize
  styleLabel: string
  promptPreview: string
  hasPrompt: boolean
  modelLabel?: string
  quickPrompts?: QuickPromptCard[]
  providerConfigured?: boolean
  canAcceptDrop?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  providerConfigured: true,
  canAcceptDrop: true,
})

const emit = defineEmits<{
  (e: 'select', index: number): void
  (e: 'open-lightbox', index: number): void
  (e: 'download', image: GeneratedImage, index: number): void
  (e: 'open', image: GeneratedImage): void
  (e: 'copy', text: string, message: string): void
  (e: 'export'): void
  (e: 'go-compose'): void
  (e: 'pick-prompt', prompt: string): void
  (e: 'remix', image: GeneratedImage, index: number): void
  (e: 'generate'): void
  (e: 'abort'): void
  (e: 'open-settings'): void
  (e: 'drop-reference-images', files: File[]): void
}>()

const activeImage = computed(() => props.images[props.activeImageIndex])
const activeSrc = computed(() => (activeImage.value ? resolveImageSource(activeImage.value) : ''))
const revealedImageKeys = ref<Record<string, boolean>>({})
const { t } = useI18n()
const { supported: shareSupported, share } = useShare()
const toast = useToast()

async function shareActive() {
  if (!activeImage.value || !activeSrc.value) return
  const ext = activeImage.value.mimeType?.split('/')[1] || 'png'
  const filename = `promptcanvas-${Date.now()}.${ext}`
  let blob: Blob | null = null
  try {
    const response = await fetch(activeSrc.value)
    if (response.ok) blob = await response.blob()
  } catch {}
  const outcome = await share({
    title: t('app.title'),
    text: activeImage.value.revisedPrompt || props.promptPreview || undefined,
    url: activeSrc.value.startsWith('http') ? activeSrc.value : undefined,
    blob,
    filename,
  })
  if (outcome === 'shared') toast.success(t('toast.shareSuccess'))
  else if (outcome === 'fallback-copy') toast.info(t('toast.copied'))
  else if (outcome === 'unsupported') toast.error(t('toast.shareUnsupported'))
  else if (outcome === 'failed') toast.error(t('toast.shareFailed'))
}

const orient = computed<'portrait' | 'landscape' | 'square'>(() => {
  if (props.size === '1024x1536') return 'portrait'
  if (props.size === '1536x1024') return 'landscape'
  return 'square'
})

const dragActive = ref(false)
let dragDepth = 0

function hasFileDrag(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function imageFilesFrom(dataTransfer: DataTransfer | null) {
  if (!dataTransfer?.files?.length) return []
  return Array.from(dataTransfer.files).filter((file) => file.type.startsWith('image/'))
}

function handleDragEnter(event: DragEvent) {
  if (!props.canAcceptDrop || !hasFileDrag(event)) return
  event.preventDefault()
  dragDepth += 1
  dragActive.value = true
}

function handleDragOver(event: DragEvent) {
  if (!props.canAcceptDrop || !hasFileDrag(event)) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
  dragActive.value = true
}

function handleDragLeave() {
  if (!dragActive.value) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) {
    dragActive.value = false
  }
}

function handleDrop(event: DragEvent) {
  if (!props.canAcceptDrop) return
  event.preventDefault()
  dragDepth = 0
  dragActive.value = false
  const files = imageFilesFrom(event.dataTransfer)
  if (files.length) {
    emit('drop-reference-images', files)
  }
}

const canvasProgress = computed(() => {
  const elapsed = Math.max(0, props.elapsedSeconds)
  if (elapsed <= 0) return 6
  if (elapsed < 8) return Math.round(6 + elapsed * 6.5)
  if (elapsed < 22) return Math.round(58 + (elapsed - 8) * 2.1)
  return Math.min(96, Math.round(88 + (1 - Math.exp(-(elapsed - 22) / 14)) * 8))
})
const canvasStageLabel = computed(() => {
  if (canvasProgress.value < 26) return '拆解提示词'
  if (canvasProgress.value < 58) return '组织构图'
  if (canvasProgress.value < 84) return '生成细节'
  return '等待返回'
})

const canvasEstimatedDuration = computed(() => {
  let seconds = 11
  if (props.size !== '1024x1024') seconds += 2
  return Math.max(8, seconds)
})
const canvasRemainingLabel = computed(() => {
  const elapsed = Math.max(0, props.elapsedSeconds)
  const target = canvasEstimatedDuration.value
  const remain = Math.max(0, target - elapsed)
  if (elapsed >= target) return '已超出预估，仍在等上游回包'
  if (remain <= 1) return '即将出图'
  return `约 ${remain}s`
})

function imageSource(image: GeneratedImage) {
  return resolveImageSource(image)
}

function imageStateKey(image: GeneratedImage, index: number) {
  return `${image.id || index}:${imageSource(image)}`
}

function markImageReady(image: GeneratedImage, index: number) {
  revealedImageKeys.value[imageStateKey(image, index)] = true
}

function isImageReady(image: GeneratedImage, index: number) {
  return !!revealedImageKeys.value[imageStateKey(image, index)]
}
</script>

<template>
  <section
    class="space-y-5 canvas-stage-root canvas-grid"
    :class="{ 'canvas-stage-root--dragging': dragActive, 'canvas-scan': !isGenerating }"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <Transition name="canvas-drop-fade">
      <div v-if="dragActive" class="canvas-drop-overlay" aria-hidden="true">
        <div class="canvas-drop-overlay__inner">
          <Icon name="upload" :size="22" />
          <p class="font-display text-xl italic">松手添加为参考图</p>
          <p class="font-mono text-[10px] uppercase tracking-[0.18em] opacity-70">
            支持 PNG · JPEG · WEBP · GIF
          </p>
        </div>
      </div>
    </Transition>

    <header class="flex items-end justify-between gap-4">
      <div class="space-y-2">
        <p class="display-eyebrow">02 · Canvas</p>
        <h2 class="display-h2">制版画布</h2>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-1.5">
        <span class="chip">{{ styleLabel }}</span>
        <span class="chip font-mono">{{ size }}</span>
        <span
          v-if="lastRequestId"
          class="chip cursor-pointer font-mono normal-case tracking-normal hover:border-line-strong"
          :title="`点击复制完整 request id: ${lastRequestId}`"
          @click="emit('copy', lastRequestId, '已复制 request id')"
        >
          {{ lastRequestId.slice(0, 12) }}…
        </span>
      </div>
    </header>

    <div
      v-if="errorMessage"
      class="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/[0.06] px-4 py-3 text-[13px] leading-6 text-accent"
      role="alert"
    >
      <Icon name="warning" :size="16" class="mt-0.5" />
      <span>{{ errorMessage }}</span>
    </div>

    <div
      v-if="isGenerating"
      class="canvas-frame canvas-manifest surface-2"
      :data-orient="orient"
      role="status"
      aria-live="polite"
    >
      <DevelopingFrame
        :progress="canvasProgress"
        :elapsed-seconds="elapsedSeconds"
        :stage="canvasStageLabel"
        :remaining-label="canvasRemainingLabel"
        :meta-label="`${size} · ${styleLabel}`"
        :prompt-preview="promptPreview || 'untitled draft'"
        :ring-size="200"
        @cancel="emit('abort')"
      />
    </div>

    <div v-else-if="activeImage" class="space-y-5">
      <!-- Single image: keep the original full-canvas presentation. -->
      <div
        v-if="images.length === 1"
        class="canvas-frame surface-2 group bg-paper-soft"
        :data-orient="orient"
      >
        <button
          type="button"
          class="absolute inset-0 grid place-items-center p-3 transition focus-visible:outline-none sm:p-5"
          aria-label="放大查看图片"
          @click="emit('open-lightbox', activeImageIndex)"
        >
          <div
            v-if="!isImageReady(activeImage, activeImageIndex)"
            class="canvas-image-placeholder absolute inset-0"
            aria-hidden="true"
          >
            <div class="canvas-image-placeholder__glow"></div>
            <div class="canvas-image-placeholder__loader">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
          <img
            :src="activeSrc"
            alt="生成图片"
            loading="eager"
            fetchpriority="high"
            decoding="async"
            class="result-image max-h-full max-w-full rounded-xl object-contain shadow-paper-1"
            :class="isImageReady(activeImage, activeImageIndex) ? 'result-image--ready' : 'result-image--loading'"
            @load="markImageReady(activeImage, activeImageIndex)"
            @error="markImageReady(activeImage, activeImageIndex)"
          />
        </button>

        <div
          class="canvas-tool-cluster pointer-events-none absolute right-3 top-3"
          aria-label="图片操作"
        >
          <button
            type="button"
            class="pointer-events-auto canvas-tool-btn"
            aria-label="放大"
            @click.stop="emit('open-lightbox', activeImageIndex)"
          >
            <Icon name="zoomIn" :size="14" />
          </button>
          <button
            type="button"
            class="pointer-events-auto canvas-tool-btn"
            aria-label="新窗口打开"
            @click.stop="emit('open', activeImage)"
          >
            <Icon name="external" :size="14" />
          </button>
          <button
            type="button"
            class="pointer-events-auto canvas-tool-btn"
            aria-label="下载"
            @click.stop="emit('download', activeImage, activeImageIndex)"
          >
            <Icon name="download" :size="14" />
          </button>
        </div>
      </div>

      <!-- Multi image: mosaic doubles as selector + preview. -->
      <div
        v-else
        class="canvas-mosaic surface-2"
        :class="`canvas-mosaic--${images.length}`"
        :data-orient="orient"
        role="listbox"
        aria-label="生成结果"
      >
        <div
          v-for="(image, index) in images"
          :key="image.id || index"
          class="canvas-mosaic__cell"
          :class="{ 'canvas-mosaic__cell--active': activeImageIndex === index }"
          :data-cell="index"
          role="option"
          :aria-selected="activeImageIndex === index"
        >
          <button
            type="button"
            class="canvas-mosaic__surface"
            :aria-label="activeImageIndex === index
              ? `第 ${index + 1} 张已激活，点击放大`
              : `选中第 ${index + 1} 张`"
            @click="activeImageIndex === index
              ? emit('open-lightbox', index)
              : emit('select', index)"
          >
            <div
              v-if="!isImageReady(image, index)"
              class="canvas-image-placeholder absolute inset-0"
              aria-hidden="true"
            >
              <div class="canvas-image-placeholder__glow"></div>
              <div class="canvas-image-placeholder__loader">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
            <img
              :src="imageSource(image)"
              :alt="`生成图片 ${index + 1}`"
              :loading="index < 2 ? 'eager' : 'lazy'"
              :fetchpriority="activeImageIndex === index ? 'high' : 'auto'"
              decoding="async"
              class="canvas-mosaic__img"
              :class="isImageReady(image, index) ? 'canvas-mosaic__img--ready' : 'canvas-mosaic__img--loading'"
              @load="markImageReady(image, index)"
              @error="markImageReady(image, index)"
            />
            <span class="canvas-mosaic__index" aria-hidden="true">
              {{ index + 1 }}<span class="opacity-60">/{{ images.length }}</span>
            </span>
            <span
              v-if="activeImageIndex === index"
              class="canvas-mosaic__active-mark"
              aria-hidden="true"
            >
              <Icon name="check" :size="12" />
            </span>
          </button>

          <div
            class="canvas-mosaic__tools pointer-events-none"
            :aria-hidden="activeImageIndex !== index"
          >
            <button
              type="button"
              class="pointer-events-auto canvas-mosaic__tool"
              aria-label="放大"
              @click.stop="emit('open-lightbox', index)"
            >
              <Icon name="zoomIn" :size="13" />
            </button>
            <button
              type="button"
              class="pointer-events-auto canvas-mosaic__tool"
              aria-label="下载"
              @click.stop="emit('download', image, index)"
            >
              <Icon name="download" :size="13" />
            </button>
          </div>
        </div>
      </div>

      <div class="canvas-action-grid">
        <button type="button" class="canvas-action canvas-action--primary" @click="emit('remix', activeImage, activeImageIndex)">
          <Icon name="sparkle" :size="14" />
          {{ t('canvas.action.continue') }}
        </button>
        <button type="button" class="canvas-action" @click="emit('download', activeImage, activeImageIndex)">
          <Icon name="download" :size="14" />
          {{ t('canvas.action.download') }}
        </button>
        <button
          v-if="shareSupported"
          type="button"
          class="canvas-action"
          @click="shareActive"
        >
          <Icon name="share" :size="14" />
          {{ t('canvas.action.share') }}
        </button>
        <button type="button" class="canvas-action" @click="emit('open-lightbox', activeImageIndex)">
          <Icon name="zoomIn" :size="14" />
          {{ t('canvas.action.zoom') }}
        </button>
        <button
          type="button"
          class="canvas-action"
          @click="emit('copy', activeImage.revisedPrompt || promptPreview, t('toast.copyPrompt'))"
        >
          <Icon name="copy" :size="14" />
          {{ t('canvas.action.copyPrompt') }}
        </button>
        <button type="button" class="canvas-action" @click="emit('export')">
          <Icon name="share" :size="14" />
          {{ t('canvas.action.export') }}
        </button>
      </div>

      <div
        v-if="activeImage.revisedPrompt"
        class="surface-1 p-4 reveal"
      >
        <div class="mb-2 flex items-center justify-between">
          <p class="display-eyebrow">Revised prompt</p>
          <button
            type="button"
            class="font-mono text-[10px] uppercase tracking-[0.18em] text-muted transition hover:text-ink"
            @click="emit('copy', activeImage.revisedPrompt!, '已复制提示词')"
          >
            复制
          </button>
        </div>
        <p class="text-[13px] leading-6 text-ink/80">{{ activeImage.revisedPrompt }}</p>
      </div>
    </div>

    <div
      v-else
      class="canvas-frame surface-1 bg-cream/60 canvas-hero"
      :data-orient="orient"
    >
      <div class="absolute inset-0 grid place-items-center text-center">
        <div class="max-w-md px-6">
          <template v-if="!providerConfigured">
            <div
              class="canvas-hero__badge mx-auto mb-5 grid h-14 w-14 place-items-center rounded-[1.15rem]"
              aria-hidden="true"
            >
              <Icon name="settings" :size="22" />
            </div>
            <p class="font-display text-2xl italic tracking-tightish text-ink/85 sm:text-3xl">先配一下 API</p>
            <p class="mt-3 text-[13px] leading-6 text-muted">
              填入 OpenAI 或兼容中转站的 API 端点和 Key，请求会自动经内置反代中转，避免 CORS 与超时问题。
            </p>
            <div class="mt-6 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center">
              <button
                type="button"
                class="btn-primary px-5"
                @click="emit('open-settings')"
              >
                <Icon name="settings" :size="14" />
                <span>打开设置</span>
                <Icon name="arrowRight" :size="14" />
              </button>
            </div>
            <p class="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted/70">
              proxy · likeyou.qzz.io · 透明转发
            </p>
          </template>

          <template v-else>
            <div
              class="canvas-hero__badge mx-auto mb-5 grid h-14 w-14 place-items-center rounded-[1.15rem]"
              aria-hidden="true"
            >
              <img src="/brand/promptcanvas-icon-96.png" alt="" width="56" height="56" decoding="async" />
            </div>
            <p class="font-display text-2xl italic tracking-tightish text-ink/85 sm:text-3xl">空白画布</p>
            <p class="mt-3 text-[13px] leading-6 text-muted">
              写下一段画面描述，或挑一个起点。
              <kbd class="canvas-hero__kbd">⌘K</kbd> 唤出命令面板。
            </p>

            <div
              v-if="quickPrompts?.length"
              class="mt-6 grid gap-2 text-left sm:grid-cols-3"
            >
              <button
                v-for="item in quickPrompts"
                :key="item.title"
                type="button"
                class="canvas-prompt-card"
                @click="emit('pick-prompt', item.prompt)"
              >
                <span class="block font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{{ item.title }}</span>
                <span class="mt-1 block truncate-2 text-[12px] leading-5 text-ink/75">{{ item.prompt }}</span>
              </button>
            </div>

            <div class="mt-6 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center">
              <button
                v-if="hasPrompt"
                type="button"
                class="btn-primary px-5"
                @click="emit('generate')"
              >
                <Icon name="lightning" :size="14" />
                <span>立即生成</span>
              </button>
              <button
                v-else
                type="button"
                class="btn-secondary px-4 lg:hidden"
                @click="emit('go-compose')"
              >
                <Icon name="textCursor" :size="14" />
                去写提示词
                <Icon name="arrowRight" :size="14" />
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.canvas-action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

@media (min-width: 640px) {
  .canvas-action-grid {
    grid-template-columns: minmax(8rem, 1.25fr) repeat(4, minmax(0, 1fr));
  }
}

.canvas-action {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 44px;
  border-radius: 13px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-ivory) / 0.6);
  color: rgb(var(--color-ink));
  font-size: 12px;
  font-weight: 720;
  box-shadow: var(--shadow-inner-paper);
  transition: transform 160ms var(--motion-press), background-color 160ms var(--motion-soft), border-color 160ms var(--motion-soft), box-shadow 180ms var(--motion-soft), color 160ms var(--motion-soft);
}

.canvas-tool-cluster {
  display: flex;
  gap: 0.4rem;
  z-index: 4;
  /* Permanent. We add a soft halo so it remains legible against bright images. */
  opacity: 1;
  transform: translateY(0);
  transition: opacity 200ms var(--motion-soft), transform 200ms var(--motion-soft);
}

.canvas-image-pager {
  position: absolute;
  inset: auto 0 0.7rem 0;
  z-index: 3;
  display: flex;
  justify-content: center;
  gap: 0.35rem;
  pointer-events: none;
}

.canvas-image-pager__dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: rgb(var(--color-paper) / 0.5);
  box-shadow: 0 0 0 1px rgb(var(--color-ink) / 0.18);
  transition: width 220ms var(--motion-soft), background 220ms var(--motion-soft);
}

.canvas-image-pager__dot--active {
  width: 16px;
  background: rgb(var(--color-paper));
  box-shadow: 0 0 0 1px rgb(var(--color-ink) / 0.32);
}

.canvas-tool-btn {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-paper) / 0.6);
  background: rgb(var(--color-ink) / 0.62);
  color: rgb(var(--color-paper));
  box-shadow: 0 14px 28px -16px rgb(0 0 0 / 0.56);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  transition: transform 160ms var(--motion-press), background-color 160ms var(--motion-soft), border-color 160ms ease;
}

.canvas-tool-btn:hover {
  background: rgb(var(--color-ink) / 0.82);
  border-color: rgb(var(--color-paper) / 0.8);
  transform: translateY(-1px);
}

.canvas-tool-btn:active {
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .canvas-tool-cluster,
  .canvas-tool-btn {
    transition: none;
  }
}

.canvas-action:hover {
  transform: translateY(-1px);
  border-color: rgb(var(--color-line-strong));
  background: rgb(var(--color-vellum));
  box-shadow: var(--shadow-paper-1), var(--shadow-inner-paper);
}

.canvas-action:active {
  transform: translateY(0);
}

.canvas-action--primary {
  border-color: rgb(var(--color-ink));
  background:
    linear-gradient(135deg, rgb(var(--color-ink)), rgb(var(--color-blueprint))),
    rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  box-shadow: var(--shadow-paper-2);
}

.canvas-action--primary:hover {
  border-color: rgb(var(--color-ink));
  background:
    linear-gradient(135deg, rgb(var(--color-ink)), rgb(var(--color-forest))),
    rgb(var(--color-ink));
}

.canvas-prompt-card {
  position: relative;
  display: block;
  min-height: 128px;
  overflow: hidden;
  border-radius: 17px;
  border: 1px solid rgb(var(--color-line));
  background:
    linear-gradient(135deg, rgb(var(--color-ivory) / 0.7), rgb(var(--color-vellum) / 0.44)),
    rgb(var(--color-cream) / 0.26);
  padding: 0.75rem;
  text-align: left;
  box-shadow: var(--shadow-inner-paper);
  transition: transform 160ms var(--motion-press), background-color 160ms var(--motion-soft), border-color 160ms var(--motion-soft), box-shadow 180ms var(--motion-soft);
}

.canvas-prompt-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: rgb(var(--color-forest));
  opacity: 0.7;
}

.canvas-prompt-card:hover {
  transform: translateY(-1px);
  border-color: rgb(var(--color-line-strong));
  background: rgb(var(--color-ivory) / 0.78);
  box-shadow: var(--shadow-paper-1), var(--shadow-inner-paper);
}

@media (prefers-reduced-motion: reduce) {
  .canvas-action,
  .canvas-prompt-card {
    transition: none;
  }
}

.canvas-image-placeholder {
  display: grid;
  place-items: center;
  pointer-events: none;
  background: linear-gradient(180deg, rgb(var(--color-vellum) / 0.94), rgb(var(--color-paper) / 0.62));
}

.canvas-image-placeholder__glow {
  position: absolute;
  width: min(44%, 220px);
  height: min(44%, 220px);
  border-radius: 999px;
  background: radial-gradient(circle, rgb(var(--color-vellum) / 0.96), rgb(var(--color-vellum) / 0) 70%);
  filter: blur(8px);
}

.canvas-image-placeholder__loader {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0.7rem 0.95rem;
  border-radius: 999px;
  background: rgb(var(--color-vellum) / 0.88);
  box-shadow: 0 24px 40px -30px rgb(var(--color-ink) / 0.5);
}

.canvas-image-placeholder__loader span {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgb(var(--color-ink) / 0.58);
  animation: canvas-image-loader 1.15s ease-in-out infinite;
}

.canvas-progress {
  position: relative;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(var(--color-ink) / 0.08);
}

.canvas-progress span {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--progress, 0%);
  border-radius: inherit;
  background: linear-gradient(90deg, rgb(var(--color-forest) / 0.72), rgb(var(--color-accent) / 0.82));
  box-shadow: 0 0 18px rgb(var(--color-accent) / 0.18);
  transition: width 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.canvas-image-placeholder__loader span:nth-child(2) {
  animation-delay: 0.14s;
}

.canvas-image-placeholder__loader span:nth-child(3) {
  animation-delay: 0.28s;
}

.result-image {
  opacity: 0;
  transform: translateY(8px) scale(0.992);
  filter: blur(8px);
  transition: opacity 420ms var(--motion-snap), transform 520ms var(--motion-snap), filter 200ms var(--motion-snap);
  will-change: opacity, transform, filter;
}

.result-image--ready {
  opacity: 1;
  transform: translateY(0) scale(1);
  filter: blur(0);
  animation: result-settle 720ms var(--motion-snap) both;
}

.result-image--loading {
  opacity: 0;
  filter: blur(8px);
}

@keyframes result-settle {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.988);
  }
  62% {
    opacity: 1;
    transform: translateY(-1px) scale(1.002);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes canvas-image-loader {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }

  50% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .canvas-image-placeholder__loader span,
  .result-image,
  .canvas-progress span {
    animation: none;
    transition: none;
    transform: none;
  }
}

.canvas-hero {
  position: relative;
  overflow: hidden;
  border-style: solid;
  background:
    radial-gradient(140% 90% at 30% 0%, rgb(var(--color-ivory) / 0.9), transparent 62%),
    rgb(var(--color-vellum));
}

.canvas-hero__badge {
  border: 1px solid rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-vellum));
  color: rgb(var(--color-ink));
  box-shadow: var(--shadow-inner-paper), var(--shadow-paper-2);
  overflow: hidden;
}

.canvas-hero__badge img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.canvas-hero__kbd {
  display: inline-flex;
  align-items: center;
  padding: 0.08rem 0.42rem;
  border-radius: 6px;
  border: 1px solid rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-vellum));
  color: rgb(var(--color-muted));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.04em;
  vertical-align: middle;
  margin-inline: 0.18rem;
}

.canvas-stage-root {
  position: relative;
}

/* ---------- Canvas mosaic (multi-image desktop) ---------- */

.canvas-mosaic {
  position: relative;
  width: 100%;
  display: grid;
  gap: 0.6rem;
  padding: 0.7rem;
  border-radius: 22px;
  border: 1px solid rgb(var(--color-line));
  background:
    linear-gradient(180deg, rgb(var(--color-ivory) / 0.6), rgb(var(--color-vellum) / 0.34)),
    rgb(var(--color-cream) / 0.18);
  box-shadow: var(--shadow-paper-2), var(--shadow-inner-paper);
}

.canvas-mosaic[data-orient="portrait"]   { aspect-ratio: 4 / 5; max-height: 70dvh; }
.canvas-mosaic[data-orient="landscape"]  { aspect-ratio: 16 / 10; max-height: 60dvh; }
.canvas-mosaic[data-orient="square"]     { aspect-ratio: 5 / 4; max-height: 64dvh; }

.canvas-mosaic--2 {
  grid-template-columns: 1fr 1fr;
}

.canvas-mosaic--3 {
  grid-template-columns: 1.55fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.canvas-mosaic--3 > .canvas-mosaic__cell:nth-child(1) {
  grid-column: 1 / 2;
  grid-row: 1 / 3;
}
.canvas-mosaic--3 > .canvas-mosaic__cell:nth-child(2) {
  grid-column: 2 / 3;
  grid-row: 1 / 2;
}
.canvas-mosaic--3 > .canvas-mosaic__cell:nth-child(3) {
  grid-column: 2 / 3;
  grid-row: 2 / 3;
}

.canvas-mosaic--4 {
  grid-template-columns: 1.45fr 1fr;
  grid-template-rows: 1fr 1fr 1fr;
}

.canvas-mosaic--4 > .canvas-mosaic__cell:nth-child(1) {
  grid-column: 1 / 2;
  grid-row: 1 / 4;
}
.canvas-mosaic--4 > .canvas-mosaic__cell:nth-child(2) { grid-column: 2 / 3; grid-row: 1 / 2; }
.canvas-mosaic--4 > .canvas-mosaic__cell:nth-child(3) { grid-column: 2 / 3; grid-row: 2 / 3; }
.canvas-mosaic--4 > .canvas-mosaic__cell:nth-child(4) { grid-column: 2 / 3; grid-row: 3 / 4; }

.canvas-mosaic__cell {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-paper-soft));
  box-shadow: var(--shadow-inner-paper);
  transition: border-color 200ms var(--motion-soft), box-shadow 220ms var(--motion-soft), transform 200ms var(--motion-press);
}

.canvas-mosaic__cell:hover {
  border-color: rgb(var(--color-line-strong));
  transform: translateY(-1px);
  box-shadow: var(--shadow-paper-1), var(--shadow-inner-paper);
}

.canvas-mosaic__cell--active {
  border-color: rgb(var(--color-ink));
  box-shadow: 0 0 0 2px rgb(var(--color-ink) / 0.16), var(--shadow-paper-2);
}

.canvas-mosaic__cell--active:hover {
  transform: translateY(0);
}

.canvas-mosaic__surface {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  appearance: none;
  padding: 0;
}

.canvas-mosaic__surface:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.canvas-mosaic__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0;
  transform: scale(1.005);
  filter: blur(8px);
  transition: opacity 360ms var(--motion-snap), transform 480ms var(--motion-snap), filter 200ms var(--motion-snap);
}

.canvas-mosaic__img--ready {
  opacity: 1;
  transform: scale(1);
  filter: blur(0);
}

/* Inactive cells get a subtle tonal dampening so the active one pops. */
.canvas-mosaic__cell:not(.canvas-mosaic__cell--active) .canvas-mosaic__img {
  filter: saturate(0.92) brightness(0.97);
}

.canvas-mosaic__cell:not(.canvas-mosaic__cell--active):hover .canvas-mosaic__img {
  filter: saturate(1) brightness(1);
}

.canvas-mosaic__index {
  position: absolute;
  top: 0.55rem;
  left: 0.55rem;
  display: inline-flex;
  align-items: center;
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  background: rgb(var(--color-ink) / 0.55);
  color: rgb(var(--color-paper));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.04em;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  pointer-events: none;
}

.canvas-mosaic__active-mark {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  box-shadow: 0 8px 18px -10px rgb(var(--color-ink) / 0.6);
  pointer-events: none;
  animation: canvas-mosaic-mark 320ms var(--motion-snap);
}

@keyframes canvas-mosaic-mark {
  0% { transform: scale(0.6); opacity: 0; }
  60% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.canvas-mosaic__tools {
  position: absolute;
  inset: auto 0.45rem 0.45rem auto;
  display: flex;
  gap: 0.32rem;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 180ms var(--motion-soft), transform 180ms var(--motion-soft);
}

.canvas-mosaic__cell--active .canvas-mosaic__tools,
.canvas-mosaic__cell:focus-within .canvas-mosaic__tools {
  opacity: 1;
  transform: translateY(0);
}

@media (hover: hover) and (pointer: fine) {
  .canvas-mosaic__cell:hover .canvas-mosaic__tools {
    opacity: 1;
    transform: translateY(0);
  }
}

.canvas-mosaic__tool {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-paper) / 0.6);
  background: rgb(var(--color-ink) / 0.6);
  color: rgb(var(--color-paper));
  box-shadow: 0 8px 18px -12px rgb(0 0 0 / 0.5);
  backdrop-filter: blur(8px) saturate(140%);
  -webkit-backdrop-filter: blur(8px) saturate(140%);
  cursor: pointer;
  transition: background-color 140ms ease, transform 140ms var(--motion-press);
}

.canvas-mosaic__tool:hover {
  background: rgb(var(--color-ink) / 0.82);
  transform: translateY(-1px);
}

@media (max-width: 1023px) {
  /* Mobile path doesn't render this component but defensive guards stay safe. */
  .canvas-mosaic[data-orient="portrait"],
  .canvas-mosaic[data-orient="landscape"],
  .canvas-mosaic[data-orient="square"] {
    max-height: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .canvas-mosaic__cell,
  .canvas-mosaic__img,
  .canvas-mosaic__active-mark,
  .canvas-mosaic__tools,
  .canvas-mosaic__tool {
    animation: none;
    transition: none;
  }
}

.canvas-drop-overlay {
  position: absolute;
  inset: -0.4rem;
  z-index: 30;
  display: grid;
  place-items: center;
  border-radius: 24px;
  border: 2px dashed rgb(var(--color-forest) / 0.55);
  background:
    radial-gradient(circle at 50% 50%, rgb(var(--color-forest) / 0.12), rgb(var(--color-vellum) / 0.6) 60%);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  pointer-events: none;
}

.canvas-drop-overlay__inner {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-radius: 20px;
  background: rgb(var(--color-vellum) / 0.94);
  border: 1px solid rgb(var(--color-forest) / 0.32);
  color: rgb(var(--color-forest));
  box-shadow: var(--shadow-paper-3);
}

.canvas-drop-fade-enter-from,
.canvas-drop-fade-leave-to {
  opacity: 0;
  transform: scale(0.985);
}

.canvas-drop-fade-enter-active,
.canvas-drop-fade-leave-active {
  transition: opacity 160ms ease-out, transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .canvas-drop-fade-enter-active,
  .canvas-drop-fade-leave-active {
    transition: none;
  }
}
</style>
