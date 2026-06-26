<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import DevelopingFrame from './DevelopingFrame.vue'
import { resolveImageSource } from '../api'
import { useI18n } from '../lib/i18n'
import { useShare } from '../composables/useShare'
import { useToast } from '../composables/useToast'
import {
  computeProgress,
  estimateTargetSeconds,
  formatRemainingLabel,
  stageLabelForProgress,
} from '../lib/generationEta'
import type {
  GeneratedImage,
  GenerationHistoryItem,
  ChatProgressOverride,
  ImageQuality,
  ImageSize,
} from '../types'

interface Props {
  images: GeneratedImage[]
  activeImageIndex: number
  isGenerating: boolean
  elapsedSeconds: number
  errorMessage: string
  lastRequestId: string
  progressOverride?: ChatProgressOverride
  size: ImageSize
  promptPreview: string
  promptText?: string
  hasPrompt: boolean
  modelLabel?: string
  modelName?: string
  quality?: ImageQuality
  count?: number
  history?: GenerationHistoryItem[]
  providerConfigured?: boolean
  canAcceptDrop?: boolean
  canEditImages?: boolean
  imageEditDisabledReason?: string
}

const props = withDefaults(defineProps<Props>(), {
  providerConfigured: true,
  canAcceptDrop: true,
  canEditImages: true,
  imageEditDisabledReason: '',
  modelName: '',
  quality: 'auto',
  count: 1,
  history: () => [] as GenerationHistoryItem[],
})

const emit = defineEmits<{
  (e: 'select', index: number): void
  (e: 'open-lightbox', index: number): void
  (e: 'download', image: GeneratedImage, index: number): void
  (e: 'open', image: GeneratedImage): void
  (e: 'copy', text: string, message: string): void
  (e: 'export'): void
  (e: 'go-compose'): void
  (e: 'reuse-prompt', prompt: string): void
  (e: 'continue-image', index: number): void
  (e: 'open-inpaint', index: number): void
  (e: 'image-edit-unavailable', reason?: string): void
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

const canvasEta = computed(() =>
  estimateTargetSeconds(
    {
      size: props.size,
      quality: props.quality,
      count: props.count,
      model: props.modelName,
    },
    props.history,
  ),
)

const canvasProgress = computed(() => {
  if (!props.isGenerating) return 0
  if (typeof props.progressOverride?.progress === 'number') {
    return Math.max(0, Math.min(100, props.progressOverride.progress))
  }
  return computeProgress(props.elapsedSeconds, canvasEta.value.targetSeconds)
})

const canvasStageLabel = computed(() => props.progressOverride?.stage || stageLabelForProgress(canvasProgress.value))

const canvasRemainingLabel = computed(() =>
  props.progressOverride?.remainingLabel
    || formatRemainingLabel(props.elapsedSeconds, canvasEta.value.targetSeconds, {
      source: canvasEta.value.source,
    }),
)

const canvasPreviewUrl = computed(() => props.progressOverride?.previewUrl || '')

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

const imageEditUnavailableReason = computed(() => props.imageEditDisabledReason.trim())
const imageEditAriaDisabled = computed(() => props.canEditImages ? undefined : 'true')
const imageEditTitle = computed(() => props.canEditImages ? undefined : imageEditUnavailableReason.value || undefined)
const reusablePrompt = computed(() =>
  activeImage.value?.revisedPrompt?.trim()
  || props.promptText?.trim()
  || props.promptPreview.trim(),
)

function imageEditAriaLabel(label: string) {
  if (props.canEditImages || !imageEditUnavailableReason.value) return label
  return `${label}. ${imageEditUnavailableReason.value}`
}

function announceImageEditUnavailable() {
  emit('image-edit-unavailable', imageEditUnavailableReason.value || undefined)
}

function openInpaint(index: number) {
  if (!props.canEditImages) {
    announceImageEditUnavailable()
    return
  }
  emit('open-inpaint', index)
}

function continueImage(index: number) {
  if (!props.canEditImages) {
    announceImageEditUnavailable()
    return
  }
  emit('continue-image', index)
}

function reuseActivePrompt() {
  if (!reusablePrompt.value) return
  emit('reuse-prompt', reusablePrompt.value)
}
</script>

<template>
  <section
    class="space-y-5 canvas-stage-root canvas-grid"
    :class="{ 'canvas-stage-root--dragging': dragActive }"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <Transition name="canvas-drop-fade">
      <div v-if="dragActive" class="canvas-drop-overlay" aria-hidden="true">
        <div class="canvas-drop-overlay__inner">
          <Icon name="upload" :size="22" />
          <p class="font-display text-xl italic">{{ t('canvas.drop.title') }}</p>
          <p class="font-mono text-[10px] uppercase tracking-[0.18em] opacity-70">
            {{ t('canvas.drop.formats') }}
          </p>
        </div>
      </div>
    </Transition>

    <header class="flex items-end justify-between gap-4">
      <div class="space-y-2">
        <p class="display-eyebrow">{{ t('canvas.eyebrow') }}</p>
        <h2 class="display-h2">{{ t('canvas.title') }}</h2>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-1.5">
        <span class="chip font-mono">{{ size }}</span>
        <span
          v-if="lastRequestId"
          class="chip cursor-pointer font-mono normal-case tracking-normal hover:border-line-strong"
          :title="t('canvas.requestId', { id: lastRequestId })"
          @click="emit('copy', lastRequestId, t('toast.copyRequestId'))"
        >
          {{ lastRequestId.slice(0, 12) }}…
        </span>
      </div>
    </header>

    <div
      v-if="errorMessage"
      class="reveal flex items-start gap-3 rounded-[var(--radius-panel)] border border-clay/30 bg-clay/[0.07] px-4 py-3 text-[13px] leading-6 text-clay backdrop-blur-glass"
      role="alert"
    >
      <Icon name="warning" :size="16" class="mt-0.5 shrink-0" />
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
        :meta-label="size"
        :prompt-preview="promptPreview || 'untitled draft'"
        :preview-url="canvasPreviewUrl"
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
          :aria-label="t('canvas.tool.zoom')"
          @click="emit('open-lightbox', activeImageIndex)"
        >
          <div
            class="canvas-image-placeholder absolute inset-0"
            :class="{ 'canvas-image-placeholder--hiding': isImageReady(activeImage, activeImageIndex) }"
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
            :alt="t('canvas.imageGenerated', { n: activeImageIndex + 1 })"
            loading="eager"
            fetchpriority="high"
            decoding="async"
            class="result-image max-h-full max-w-full rounded-[var(--radius-panel)] object-contain shadow-glass"
            :class="isImageReady(activeImage, activeImageIndex) ? 'result-image--ready' : 'result-image--loading'"
            @load="markImageReady(activeImage, activeImageIndex)"
            @error="markImageReady(activeImage, activeImageIndex)"
          />
        </button>

        <div
          class="canvas-result-toolbar pointer-events-none absolute inset-x-3 bottom-3"
          :aria-label="t('canvas.actionsLabel')"
        >
          <button
            type="button"
            class="pointer-events-auto canvas-result-tool canvas-result-tool--primary"
            :aria-disabled="imageEditAriaDisabled"
            :aria-label="imageEditAriaLabel(t('canvas.action.continueLabel'))"
            :title="imageEditTitle"
            @click.stop="continueImage(activeImageIndex)"
          >
            <Icon name="sparkle" :size="14" />
            <span>{{ t('canvas.action.continue') }}</span>
          </button>
          <button
            type="button"
            class="pointer-events-auto canvas-result-tool"
            :aria-disabled="imageEditAriaDisabled"
            :aria-label="imageEditAriaLabel(t('canvas.action.inpaintLabel'))"
            :title="imageEditTitle"
            @click.stop="openInpaint(activeImageIndex)"
          >
            <Icon name="brush" :size="14" />
            <span>{{ t('canvas.action.inpaint') }}</span>
          </button>
          <button
            type="button"
            class="pointer-events-auto canvas-result-tool canvas-result-tool--icon"
            :aria-label="t('canvas.tool.download')"
            :title="t('canvas.tool.download')"
            @click.stop="emit('download', activeImage, activeImageIndex)"
          >
            <Icon name="download" :size="14" />
          </button>
          <button
            type="button"
            class="pointer-events-auto canvas-result-tool canvas-result-tool--icon"
            :aria-label="t('canvas.tool.zoom')"
            :title="t('canvas.tool.zoom')"
            @click.stop="emit('open-lightbox', activeImageIndex)"
          >
            <Icon name="zoomIn" :size="14" />
          </button>
          <button
            type="button"
            class="pointer-events-auto canvas-result-tool canvas-result-tool--icon"
            :aria-label="t('canvas.action.reusePrompt')"
            :title="t('canvas.action.reusePrompt')"
            @click.stop="reuseActivePrompt"
          >
            <Icon name="upload" :size="14" />
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
        :aria-label="t('canvas.mosaic.label')"
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
              ? t('canvas.mosaic.activeHint', { n: index + 1 })
              : t('canvas.mosaic.selectHint', { n: index + 1 })"
            @click="activeImageIndex === index
              ? emit('open-lightbox', index)
              : emit('select', index)"
          >
            <div
              class="canvas-image-placeholder absolute inset-0"
              :class="{ 'canvas-image-placeholder--hiding': isImageReady(image, index) }"
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
              :alt="t('canvas.imageGenerated', { n: index + 1 })"
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
              :aria-disabled="imageEditAriaDisabled"
              :aria-label="imageEditAriaLabel(t('canvas.action.continueLabel'))"
              :title="imageEditTitle || t('canvas.action.continue')"
              @click.stop="continueImage(index)"
            >
              <Icon name="sparkle" :size="13" />
            </button>
            <button
              type="button"
              class="pointer-events-auto canvas-mosaic__tool"
              :aria-disabled="imageEditAriaDisabled"
              :aria-label="imageEditAriaLabel(t('canvas.action.inpaintLabel'))"
              :title="imageEditTitle || t('canvas.action.inpaint')"
              @click.stop="openInpaint(index)"
            >
              <Icon name="brush" :size="13" />
            </button>
            <button
              type="button"
              class="pointer-events-auto canvas-mosaic__tool"
              :aria-label="t('canvas.tool.zoom')"
              :title="t('canvas.tool.zoom')"
              @click.stop="emit('open-lightbox', index)"
            >
              <Icon name="zoomIn" :size="13" />
            </button>
            <button
              type="button"
              class="pointer-events-auto canvas-mosaic__tool"
              :aria-label="t('canvas.tool.download')"
              :title="t('canvas.tool.download')"
              @click.stop="emit('download', image, index)"
            >
              <Icon name="download" :size="13" />
            </button>
          </div>
        </div>
      </div>

      <div class="canvas-action-grid">
        <button
          type="button"
          class="canvas-action canvas-action--primary"
          :aria-disabled="imageEditAriaDisabled"
          :aria-label="imageEditAriaLabel(t('canvas.action.continueLabel'))"
          :title="imageEditTitle"
          @click="continueImage(activeImageIndex)"
        >
          <Icon name="sparkle" :size="14" />
          {{ t('canvas.action.continue') }}
        </button>
        <button
          type="button"
          class="canvas-action"
          :aria-disabled="imageEditAriaDisabled"
          :aria-label="imageEditAriaLabel(t('canvas.action.inpaintLabel'))"
          :title="imageEditTitle"
          @click="openInpaint(activeImageIndex)"
        >
          <Icon name="brush" :size="14" />
          {{ t('canvas.action.inpaint') }}
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
          @click="reuseActivePrompt"
        >
          <Icon name="upload" :size="14" />
          {{ t('canvas.action.reusePrompt') }}
        </button>
        <button
          type="button"
          class="canvas-action"
          @click="emit('copy', reusablePrompt, t('toast.copyPrompt'))"
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
            @click="emit('copy', activeImage.revisedPrompt!, t('toast.copyPrompt'))"
          >
            {{ t('lightbox.copy') }}
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
        <div class="canvas-empty-content px-5 sm:px-6">
          <template v-if="!providerConfigured">
            <div
              class="canvas-hero__badge mx-auto mb-5 grid h-14 w-14 place-items-center rounded-[var(--radius-card)]"
              aria-hidden="true"
            >
              <Icon name="settings" :size="22" />
            </div>
            <p class="font-display text-2xl italic tracking-tightish text-ink/85 sm:text-3xl">{{ t('canvas.empty.unconfigured.title') }}</p>
            <p class="mt-3 text-[13px] leading-6 text-muted">
              {{ t('canvas.empty.unconfigured.body') }}
            </p>
            <div class="mt-6 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center">
              <button
                type="button"
                class="btn-primary px-5"
                @click="emit('open-settings')"
              >
                <Icon name="settings" :size="14" />
                <span>{{ t('canvas.empty.unconfigured.cta') }}</span>
                <Icon name="arrowRight" :size="14" />
              </button>
            </div>
            <p class="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted/70">
              {{ t('canvas.empty.proxy') }}
            </p>
          </template>

          <template v-else>
            <div
              class="canvas-hero__badge mx-auto mb-5 grid h-14 w-14 place-items-center rounded-[var(--radius-card)]"
              aria-hidden="true"
            >
              <img src="/brand/promptcanvas-icon-96.png" alt="" width="56" height="56" decoding="async" />
            </div>
            <p class="font-display text-2xl italic tracking-tightish text-ink/85 sm:text-3xl">{{ t('canvas.empty.title') }}</p>
            <p class="mt-3 text-[13px] leading-6 text-muted">
              {{ t('canvas.empty.body') }}
            </p>

            <div class="mt-6 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center">
              <button
                v-if="hasPrompt"
                type="button"
                class="btn-primary px-5"
                @click="emit('generate')"
              >
                <Icon name="lightning" :size="14" />
                <span>{{ t('canvas.empty.generate') }}</span>
              </button>
              <button
                v-else
                type="button"
                class="btn-secondary px-4 lg:hidden"
                @click="emit('go-compose')"
              >
                <Icon name="textCursor" :size="14" />
                {{ t('canvas.empty.compose') }}
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
    grid-template-columns: repeat(auto-fit, minmax(7.25rem, 1fr));
  }
}

.canvas-action {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 44px;
  border-radius: var(--radius-field);
  border: 1px solid rgb(var(--color-line) / 0.82);
  background: rgb(var(--color-surface) / 0.98);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  color: rgb(var(--color-ink));
  font-size: 12px;
  font-weight: 720;
  box-shadow: var(--shadow-inner-glass);
  transition: transform 160ms var(--motion-press), background-color 160ms var(--motion-soft), border-color 160ms var(--motion-soft), box-shadow 180ms var(--motion-soft), color 160ms var(--motion-soft);
}

.canvas-result-toolbar {
  z-index: 4;
  display: flex;
  justify-content: center;
  gap: 0.4rem;
  opacity: 1;
  transform: translateY(0);
  transition: opacity 180ms var(--motion-soft), transform 180ms var(--motion-soft);
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

.canvas-result-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.38rem;
  min-width: 38px;
  height: 38px;
  max-width: 11rem;
  padding: 0 0.78rem;
  border-radius: 9px;
  border: 1px solid rgb(var(--color-paper) / 0.2);
  background: rgb(18 24 25 / 0.76);
  color: rgb(255 255 255 / 0.94);
  font-size: 11px;
  font-weight: 740;
  box-shadow: 0 8px 18px -14px rgb(0 0 0 / 0.66), inset 0 1px 0 rgb(255 255 255 / 0.14);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  transition: transform 150ms var(--motion-press), background-color 150ms var(--motion-soft), border-color 150ms ease, box-shadow 170ms var(--motion-soft), opacity 150ms var(--motion-soft);
}

.canvas-result-tool span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.canvas-result-tool--icon {
  width: 38px;
  padding: 0;
}

.canvas-result-tool--primary {
  background: rgb(var(--color-action) / 0.9);
}

@media (hover: hover) and (pointer: fine) {
  .canvas-result-tool:hover {
    background: rgb(var(--color-action) / 0.92);
    border-color: rgb(255 255 255 / 0.34);
    box-shadow: 0 10px 22px -16px rgb(0 0 0 / 0.72), inset 0 1px 0 rgb(255 255 255 / 0.18);
    transform: translateY(-1px);
  }
}

.canvas-result-tool:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgb(255 255 255 / 0.92), 0 0 0 4px rgb(var(--color-action) / 0.64);
}

.canvas-result-tool:active {
  transform: translateY(0);
}

.canvas-result-tool[aria-disabled='true'] {
  cursor: help;
  opacity: 0.62;
  filter: saturate(0.5);
}

@media (hover: hover) and (pointer: fine) {
  .canvas-frame:hover .canvas-result-toolbar,
  .canvas-frame:focus-within .canvas-result-toolbar {
    opacity: 1;
    transform: translateY(0);
  }

  .canvas-result-toolbar {
    opacity: 0;
    transform: translateY(6px);
  }
}

@media (max-width: 520px) {
  .canvas-result-toolbar {
    inset-inline: 0.55rem;
    justify-content: flex-end;
  }

  .canvas-result-tool:not(.canvas-result-tool--primary) span {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .canvas-result-toolbar,
  .canvas-result-tool {
    transition: none;
  }
}

@media (hover: hover) and (pointer: fine) {
  .canvas-action:hover {
    transform: translateY(-1px);
    border-color: rgb(var(--color-line-strong) / 0.7);
    background: rgb(var(--color-surface-raised) / 1);
    box-shadow: var(--shadow-glass-sm), var(--shadow-inner-glass);
  }
}

.canvas-action:active {
  transform: scale(0.97);
}

.canvas-action--primary {
  border: none;
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: var(--shadow-glass-sm), inset 0 1px 0 rgb(255 255 255 / 0.16);
}

@media (hover: hover) and (pointer: fine) {
  .canvas-action--primary:hover {
    background: var(--gradient-primary);
    box-shadow: var(--shadow-glass), inset 0 1px 0 rgb(255 255 255 / 0.18);
  }
}

.canvas-action[aria-disabled='true'] {
  cursor: help;
  color: rgb(var(--color-muted));
  border-color: rgb(var(--color-line) / 0.54);
  background: rgb(var(--color-surface-muted) / 0.76);
  box-shadow: var(--shadow-inner-glass);
  opacity: 0.62;
}

/* Disabled reset — :active and the non-hover primary selector must apply on
   touch too; only the :hover variants are gated behind hover capability. */
.canvas-action[aria-disabled='true']:active,
.canvas-action--primary[aria-disabled='true'] {
  color: rgb(var(--color-muted));
  border: 1px solid rgb(var(--color-line) / 0.54);
  background: rgb(var(--color-surface-muted) / 0.76);
  transform: none;
  box-shadow: var(--shadow-inner-glass);
}

@media (hover: hover) and (pointer: fine) {
  .canvas-action[aria-disabled='true']:hover,
  .canvas-action--primary[aria-disabled='true']:hover {
    color: rgb(var(--color-muted));
    border: 1px solid rgb(var(--color-line) / 0.54);
    background: rgb(var(--color-surface-muted) / 0.76);
    transform: none;
    box-shadow: var(--shadow-inner-glass);
  }
}

@media (prefers-reduced-motion: reduce) {
  .canvas-action {
    transition: none;
  }
}

.canvas-image-placeholder {
  display: grid;
  place-items: center;
  pointer-events: none;
  opacity: 1;
  background:
    radial-gradient(78% 68% at 24% 72%, rgb(var(--color-accent) / 0.14), transparent 64%),
    radial-gradient(62% 58% at 82% 18%, rgb(var(--color-clay) / 0.08), transparent 66%),
    linear-gradient(132deg, rgb(var(--color-surface-raised) / 0.96), rgb(var(--color-vellum) / 0.72) 48%, rgb(var(--color-paper-soft) / 0.86));
  background-size: 170% 170%;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  transition: opacity 720ms var(--motion-snap);
  animation: canvas-placeholder-gradient 7s ease-in-out infinite;
}

.canvas-image-placeholder--hiding {
  opacity: 0;
}

.canvas-image-placeholder__glow {
  position: absolute;
  width: min(44%, 220px);
  height: min(44%, 220px);
  border-radius: 999px;
  background:
    radial-gradient(circle at 34% 32%, rgb(255 255 255 / 0.78), transparent 24%),
    radial-gradient(circle, rgb(var(--color-accent) / 0.28), rgb(var(--color-blueprint) / 0.14) 58%, transparent 76%);
  filter: blur(18px) saturate(1.2);
  animation: canvas-placeholder-orb 4.8s var(--motion-soft) infinite;
}

.canvas-image-placeholder__loader {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0.56rem 0.76rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.6);
  background: rgb(var(--color-surface-raised) / 0.74);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-glass-sm), var(--shadow-inner-glass);
}

.canvas-image-placeholder__loader span {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgb(var(--color-accent)), rgb(var(--color-blueprint) / 0.9));
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
  background: var(--gradient-primary);
  box-shadow: none;
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
  transform: translateY(10px) scale(0.986);
  filter: blur(14px) saturate(0.86);
  transition: opacity 820ms var(--motion-snap), transform 900ms var(--motion-snap), filter 920ms var(--motion-snap);
  will-change: opacity, transform, filter;
}

.result-image--ready {
  opacity: 1;
  transform: translateY(0) scale(1);
  filter: blur(0) saturate(1);
  animation: result-settle 920ms var(--motion-snap) both;
}

.result-image--loading {
  opacity: 0;
  filter: blur(14px) saturate(0.86);
}

@keyframes result-settle {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.986);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes canvas-placeholder-gradient {
  0%, 100% { background-position: 0% 54%; }
  50% { background-position: 100% 46%; }
}

@keyframes canvas-placeholder-orb {
  0%, 100% { transform: translate3d(-18px, 12px, 0) scale(0.94); opacity: 0.78; }
  42% { transform: translate3d(22px, -16px, 0) scale(1.08); opacity: 0.96; }
  72% { transform: translate3d(18px, 18px, 0) scale(1); opacity: 0.86; }
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
  .canvas-image-placeholder,
  .canvas-image-placeholder__glow,
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
    linear-gradient(180deg, rgb(var(--color-surface-raised) / 0.98) 0%, rgb(var(--color-surface) / 0.98) 56%, rgb(var(--color-surface-muted) / 0.94) 100%);
  box-shadow:
    var(--shadow-glass),
    var(--shadow-inner-glass),
    inset 0 -1px 0 rgb(var(--color-line) / 0.28);
}

.canvas-hero__badge {
  border: 1px solid rgb(var(--color-line) / 0.8);
  border-radius: var(--radius-card);
  background: var(--gradient-glass);
  color: rgb(var(--color-ink));
  box-shadow: var(--shadow-glass), var(--shadow-inner-glass);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  overflow: hidden;
}

.canvas-hero__badge img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.canvas-empty-content {
  width: min(100%, 42rem);
  max-height: 100%;
  overflow-y: auto;
  padding-block: 1rem;
  scrollbar-width: thin;
  scrollbar-color: rgb(var(--color-line-strong) / 0.32) transparent;
}

.canvas-frame[data-orient="portrait"] .canvas-empty-content {
  width: min(100%, 23rem);
}

@media (max-height: 720px) and (min-width: 1024px) {
  .canvas-empty-content {
    padding-block: 0.65rem;
  }

  .canvas-hero__badge {
    width: 46px;
    height: 46px;
    margin-bottom: 0.75rem;
  }
}

.canvas-stage-root {
  position: relative;
  overflow: hidden;
  padding: clamp(0.85rem, 1.45vw, 1.2rem);
  border: 1px solid rgb(var(--color-line) / 0.72);
  box-shadow:
    inset 0 1px 0 rgb(var(--color-surface-raised) / 0.68),
    0 16px 34px -30px rgb(var(--color-shadow) / 0.48);
}

.canvas-stage-root::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    linear-gradient(180deg, rgb(var(--color-surface-raised) / 0.28), transparent 34%),
    linear-gradient(90deg, rgb(var(--color-shadow) / 0.04), transparent 18%, transparent 82%, rgb(var(--color-shadow) / 0.045));
  pointer-events: none;
}

.canvas-stage-root > * {
  position: relative;
  z-index: 1;
}

.canvas-stage-root--dragging {
  border-color: rgb(var(--color-forest) / 0.44);
  box-shadow:
    inset 0 1px 0 rgb(var(--color-surface-raised) / 0.72),
    0 0 0 2px rgb(var(--color-forest) / 0.12),
    0 16px 34px -30px rgb(var(--color-shadow) / 0.48);
}

.canvas-stage-root .display-h2 {
  font-size: 1.85rem;
  line-height: 1.08;
}

@media (max-height: 760px) and (min-width: 1024px) {
  .canvas-stage-root .canvas-frame[data-orient="portrait"] {
    max-height: 42vh;
    max-width: calc(42vh * 2 / 3);
  }

  .canvas-stage-root .canvas-frame[data-orient="landscape"] {
    max-height: 36vh;
    max-width: calc(36vh * 3 / 2);
  }

  .canvas-stage-root .canvas-frame[data-orient="square"] {
    max-height: 40vh;
    max-width: 40vh;
  }
}

/* ---------- Canvas mosaic (multi-image desktop) ---------- */

.canvas-mosaic {
  position: relative;
  width: 100%;
  display: grid;
  gap: 0.6rem;
  padding: 0.7rem;
  border-radius: var(--radius-card);
  border: 1px solid rgb(var(--color-line) / 0.78);
  background: var(--gradient-surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-glass), var(--shadow-inner-glass);
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
  border-radius: var(--radius-panel);
  border: 1px solid rgb(var(--color-line) / 0.72);
  background: rgb(var(--color-surface-muted) / 0.92);
  box-shadow: var(--shadow-inner-glass);
  transition: border-color 200ms var(--motion-soft), box-shadow 220ms var(--motion-soft), transform 200ms var(--motion-press);
}

@media (hover: hover) and (pointer: fine) {
  .canvas-mosaic__cell:hover {
    border-color: rgb(var(--color-line-strong) / 0.6);
    transform: translateY(-1px);
    box-shadow: var(--shadow-glass-sm), var(--shadow-inner-glass);
  }
}

.canvas-mosaic__cell--active {
  border-color: rgb(var(--color-accent) / 0.58);
  box-shadow: 0 0 0 2px rgb(var(--color-accent) / 0.18), var(--shadow-glass);
}

@media (hover: hover) and (pointer: fine) {
  .canvas-mosaic__cell--active:hover {
    transform: translateY(0);
  }
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
  transform: scale(1.018);
  filter: blur(14px) saturate(0.86);
  transition: opacity 780ms var(--motion-snap), transform 860ms var(--motion-snap), filter 880ms var(--motion-snap);
}

.canvas-mosaic__img--ready {
  opacity: 1;
  transform: scale(1);
  filter: blur(0) saturate(1);
}

.canvas-mosaic__img--loading {
  opacity: 0;
  transform: scale(1.018);
  filter: blur(14px) saturate(0.86);
}

/* Inactive cells get a subtle tonal dampening so the active one pops. */
.canvas-mosaic__cell:not(.canvas-mosaic__cell--active) .canvas-mosaic__img {
  filter: saturate(0.92) brightness(0.97);
}

.canvas-mosaic__cell:not(.canvas-mosaic__cell--active) .canvas-mosaic__img--loading {
  filter: blur(14px) saturate(0.86);
}

@media (hover: hover) and (pointer: fine) {
  .canvas-mosaic__cell:not(.canvas-mosaic__cell--active):hover .canvas-mosaic__img {
    filter: saturate(1) brightness(1);
  }
}

.canvas-mosaic__index {
  position: absolute;
  top: 0.55rem;
  left: 0.55rem;
  display: inline-flex;
  align-items: center;
  padding: 0.18rem 0.5rem;
  border-radius: 6px;
  border: 1px solid rgb(var(--color-surface-raised) / 0.2);
  background: rgb(var(--color-ink) / 0.62);
  color: rgb(var(--color-paper));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.04em;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
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
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: 0 8px 18px -14px rgb(0 0 0 / 0.6);
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
  border-radius: 8px;
  border: 1px solid rgb(var(--color-surface-raised) / 0.22);
  background: rgb(var(--color-ink) / 0.55);
  color: rgb(var(--color-paper));
  box-shadow: 0 8px 18px -12px rgb(0 0 0 / 0.5);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  cursor: pointer;
  transition: background-color 140ms var(--motion-soft), border-color 140ms var(--motion-soft), transform 140ms var(--motion-press);
}

@media (hover: hover) and (pointer: fine) {
  .canvas-mosaic__tool:hover {
    background: rgb(var(--color-accent) / 0.78);
    border-color: rgb(var(--color-surface-raised) / 0.4);
    transform: translateY(-1px);
  }
}

.canvas-mosaic__tool[aria-disabled='true'] {
  cursor: help;
  opacity: 0.58;
  filter: saturate(0.5);
}

.canvas-mosaic__tool[aria-disabled='true']:active {
  background: rgb(var(--color-ink) / 0.55);
  border-color: rgb(var(--color-surface-raised) / 0.22);
  transform: none;
}

@media (hover: hover) and (pointer: fine) {
  .canvas-mosaic__tool[aria-disabled='true']:hover {
    background: rgb(var(--color-ink) / 0.55);
    border-color: rgb(var(--color-surface-raised) / 0.22);
    transform: none;
  }
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
  border-radius: var(--radius-card);
  border: 2px dashed rgb(var(--color-forest) / 0.55);
  background:
    radial-gradient(circle at 50% 50%, rgb(var(--color-forest) / 0.12), rgb(var(--color-paper) / 0.82) 62%);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  pointer-events: none;
}

.canvas-drop-overlay__inner {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-radius: var(--radius-panel);
  background: rgb(var(--color-surface-raised) / 0.98);
  border: 1px solid rgb(var(--color-forest) / 0.32);
  color: rgb(var(--color-forest));
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
</style>
