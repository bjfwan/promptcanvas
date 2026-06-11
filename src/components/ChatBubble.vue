<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import DevelopingFrame from './DevelopingFrame.vue'
import { resolveImageSource } from '../api'
import { useI18n } from '../lib/i18n'
import {
  computeProgress,
  estimateTargetSeconds,
  formatRemainingLabel,
  stageLabelForProgress,
} from '../lib/generationEta'
import type { ChatAssistantMessage, ChatMessage, GeneratedImage, GenerationHistoryItem } from '../types'

interface Props {
  message: ChatMessage
  history?: GenerationHistoryItem[]
  canEditImages?: boolean
  imageEditDisabledReason?: string
}

const props = withDefaults(defineProps<Props>(), {
  history: () => [] as GenerationHistoryItem[],
  canEditImages: true,
  imageEditDisabledReason: '',
})
const { t, locale } = useI18n()

const emit = defineEmits<{
  (e: 'retry', id: string): void
  (e: 'open-image', images: GeneratedImage[], index: number): void
  (e: 'edit-image', images: GeneratedImage[], index: number): void
  (e: 'download', image: GeneratedImage, index: number): void
  (e: 'copy', text: string, message: string): void
  (e: 'image-edit-unavailable', reason?: string): void
  (e: 'scroll-to-message', id: string): void
  (e: 'abort', id: string): void
  (e: 'import-prompt', text: string): void
}>()

const imageEditUnavailableReason = computed(() => props.imageEditDisabledReason.trim())
const imageEditAriaDisabled = computed(() => props.canEditImages ? undefined : 'true')
const imageEditTitle = computed(() => props.canEditImages ? undefined : imageEditUnavailableReason.value || undefined)

function imageEditAriaLabel(label: string) {
  if (props.canEditImages || !imageEditUnavailableReason.value) return label
  return `${label}. ${imageEditUnavailableReason.value}`
}

function announceImageEditUnavailable() {
  emit('image-edit-unavailable', imageEditUnavailableReason.value || undefined)
}

function openImage(index: number) {
  if (props.message.role !== 'assistant') return
  const images = props.message.images ?? []
  if (!images.length) return
  emit('open-image', images, Math.max(0, Math.min(index, images.length - 1)))
}

function editImage(index: number) {
  if (props.message.role !== 'assistant') return
  const images = props.message.images ?? []
  if (!images.length) return
  if (!props.canEditImages) {
    announceImageEditUnavailable()
    return
  }
  emit('edit-image', images, Math.max(0, Math.min(index, images.length - 1)))
}

const isUser = computed(() => props.message.role === 'user')

const isReferenceMessage = computed(() => props.message.meta.generationMode === 'reference')

const timeLabel = computed(() => {
  try {
    return new Intl.DateTimeFormat(locale.value, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(props.message.createdAt))
  } catch {
    return ''
  }
})

const assistantMessage = computed<ChatAssistantMessage | null>(() =>
  props.message.role === 'assistant' ? (props.message as ChatAssistantMessage) : null,
)

const importablePrompt = computed(() => {
  const am = assistantMessage.value
  if (!am || am.status !== 'success') return ''
  const revised = am.images?.find((image) => image.revisedPrompt?.trim())?.revisedPrompt?.trim()
  return revised || (am.content || '').trim()
})

function pendingSizeLabel(size: ChatAssistantMessage['meta']['size']) {
  if (size === '1024x1536') return t('size.portrait')
  if (size === '1536x1024') return t('size.landscape')
  return t('size.square')
}

const pendingEta = computed(() => {
  const message = assistantMessage.value
  if (!message || message.status !== 'pending') {
    return { targetSeconds: 0, source: 'prior' as const, sampleSize: 0 }
  }
  return estimateTargetSeconds(
    {
      size: message.meta.size,
      quality: message.meta.quality,
      count: message.meta.count,
      model: message.meta.model,
    },
    props.history,
  )
})

const pendingProgress = computed(() => {
  const message = assistantMessage.value
  if (!message || message.status !== 'pending') return 0
  if (typeof message.progressOverride?.progress === 'number') {
    return Math.max(0, Math.min(100, message.progressOverride.progress))
  }
  return computeProgress(message.elapsedSeconds ?? 0, pendingEta.value.targetSeconds)
})

const pendingRemainingLabel = computed(() => {
  const message = assistantMessage.value
  if (!message || message.status !== 'pending') return ''
  const override = message.progressOverride?.remainingLabel
  if (override) return override
  return formatRemainingLabel(
    message.elapsedSeconds ?? 0,
    pendingEta.value.targetSeconds,
    { source: pendingEta.value.source },
  )
})

const pendingStageLabel = computed(() => {
  const override = assistantMessage.value?.progressOverride?.stage
  if (override) return override
  return stageLabelForProgress(pendingProgress.value)
})

const pendingMetaLabel = computed(() => {
  const message = assistantMessage.value
  if (!message || message.status !== 'pending') return ''
  return t('chat.pendingMeta', {
    count: message.meta.count,
    size: pendingSizeLabel(message.meta.size),
  })
})

const pendingPreviewUrl = computed(() => {
  const message = assistantMessage.value
  if (!message || message.status !== 'pending') return ''
  return message.progressOverride?.previewUrl || ''
})

const previewFrameClass = computed(() => {
  const size = props.message.meta.size
  if (size === '1024x1536') return 'aspect-[2/3]'
  if (size === '1536x1024') return 'aspect-[3/2]'
  return 'aspect-square'
})

const assistantImageGridClass = computed(() => {
  if (props.message.role !== 'assistant') return ''
  const total = props.message.images?.length ?? 0
  if (total <= 1) return 'chat-mosaic chat-mosaic--1'
  if (total === 2) return 'chat-mosaic chat-mosaic--2'
  if (total === 3) return 'chat-mosaic chat-mosaic--3'
  return 'chat-mosaic chat-mosaic--4'
})

const revealedImageKeys = ref<Record<string, boolean>>({})

function imageSource(image: GeneratedImage) {
  return resolveImageSource(image)
}

function imageStateKey(image: GeneratedImage, index: number) {
  return `${props.message.id}:${image.id || index}:${imageSource(image)}`
}

function markImageReady(image: GeneratedImage, index: number) {
  revealedImageKeys.value[imageStateKey(image, index)] = true
}

function isImageReady(image: GeneratedImage, index: number) {
  return !!revealedImageKeys.value[imageStateKey(image, index)]
}
</script>

<template>
  <article
    class="chat-bubble-row flex w-full"
    :class="isUser ? 'justify-end' : 'justify-start'"
    :data-role="message.role"
  >
    <div v-if="message.role === 'user'" class="chat-message-stack chat-message-stack--user flex max-w-[86%] flex-col items-end gap-1.5">
      <button
        v-if="message.continuedFrom"
        type="button"
        class="chat-continuation-chip self-end"
        :aria-label="t('chat.continueLabel', { n: message.continuedFrom.fromImageIndex + 1 })"
        @click="emit('scroll-to-message', message.continuedFrom.fromMessageId)"
      >
        <span class="chat-continuation-chip__thumb" aria-hidden="true">
          <img
            :src="message.continuedFrom.thumbnailUrl"
            alt=""
            loading="lazy"
            decoding="async"
          />
        </span>
        <span class="chat-continuation-chip__body">
          <span class="chat-continuation-chip__title">{{ t('chat.continueChip') }}</span>
          <span class="chat-continuation-chip__sub">{{ message.continuedFrom.promptPreview || t('chat.continueChipFallback') }}</span>
        </span>
        <Icon name="arrowUp" :size="11" class="chat-continuation-chip__arrow" />
      </button>

      <div
        v-if="(message.referenceImages?.length ?? 0) > 0"
        class="chat-reference-grid grid max-w-full gap-2 self-end"
        :class="(message.referenceImages?.length ?? 0) > 1 ? 'grid-cols-2' : 'grid-cols-1'"
      >
        <div
          v-for="image in message.referenceImages"
          :key="image.id"
          class="chat-reference-thumb chat-reference-thumb--user"
        >
          <img
            :src="image.previewUrl"
            :alt="image.name"
            loading="lazy"
            decoding="async"
            class="h-full w-full object-cover"
          />
          <span class="chat-reference-thumb__label">{{ image.name }}</span>
        </div>
      </div>
      <div
        class="chat-bubble-user rounded-[22px] rounded-br-[8px] px-4 py-3 text-[15px] leading-6 text-paper"
      >
        <p class="whitespace-pre-wrap break-words">{{ message.content }}</p>
      </div>
      <div class="chat-meta-row" :data-orientation="message.role">
        <span v-if="isReferenceMessage" class="chat-meta-row__chunk">{{ t('chat.referenceImages') }}</span>
        <span class="chat-meta-row__chunk">{{ message.meta.size }}</span>
        <span v-if="message.meta.count > 1" class="chat-meta-row__chunk">×{{ message.meta.count }}</span>
        <span v-if="message.meta.referenceImageCount" class="chat-meta-row__chunk">{{ t('chat.imageCount', { n: message.meta.referenceImageCount }) }}</span>
        <span v-if="timeLabel" class="chat-meta-row__chunk chat-meta-row__chunk--time">{{ timeLabel }}</span>
      </div>
    </div>

    <div v-else class="chat-message-stack chat-message-stack--assistant flex max-w-[92%] flex-col items-start gap-1.5">
      <div class="chat-meta-row chat-meta-row--assistant">
        <span
          class="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line-strong bg-vellum text-ink"
          aria-hidden="true"
        >
          <Icon name="sparkle" :size="11" />
        </span>
        <span class="chat-meta-row__chunk">{{ t('chat.canvas') }}</span>
        <span class="chat-meta-row__chunk">{{ message.meta.size }}</span>
        <span v-if="message.meta.referenceImageCount" class="chat-meta-row__chunk">{{ t('chat.refCount', { n: message.meta.referenceImageCount }) }}</span>
      </div>

      <div
        v-if="message.status === 'pending'"
        class="chat-bubble-assistant chat-bubble-assistant--pending relative w-full overflow-hidden rounded-[22px] rounded-bl-[8px]"
        :class="previewFrameClass"
        :data-size="message.meta.size"
        role="status"
        aria-live="polite"
      >
        <DevelopingFrame
          :progress="pendingProgress"
          :elapsed-seconds="message.elapsedSeconds ?? 0"
          :stage="pendingStageLabel"
          :remaining-label="pendingRemainingLabel"
          :meta-label="pendingMetaLabel"
          :prompt-preview="message.content"
          :preview-url="pendingPreviewUrl"
          :ring-size="148"
          compact
          @cancel="emit('abort', message.id)"
        />
      </div>

      <div
        v-else-if="message.status === 'error'"
        class="chat-bubble-assistant chat-bubble-assistant--error w-full rounded-[22px] rounded-bl-[8px] border border-accent/30 bg-accent/[0.06] px-4 py-3 text-[13px] leading-6 text-accent shadow-paper-1"
        role="alert"
      >
        <div class="flex items-start gap-2">
          <Icon name="warning" :size="14" class="mt-1 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ message.errorMessage || t('chat.errorFallback') }}</p>
            <p
              v-if="message.requestId"
              class="chat-error-request mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-accent/70"
            >
              req {{ message.requestId.slice(0, 12) }}
            </p>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="chat-retry-chip"
            :aria-label="t('chat.regenerate')"
            @click="emit('retry', message.replyTo)"
          >
            <Icon name="refresh" :size="12" />
            <span>{{ t('chat.retry') }}</span>
          </button>
          <button
            v-if="message.errorMessage"
            type="button"
            class="chat-retry-chip chat-retry-chip--quiet"
            :aria-label="t('chat.copyError')"
            @click="emit('copy', message.errorMessage, t('chat.copyErrorSuccess'))"
          >
            <Icon name="copy" :size="12" />
            <span>{{ t('chat.copy') }}</span>
          </button>
        </div>
      </div>

      <div
        v-else
        class="chat-bubble-assistant w-full rounded-[22px] rounded-bl-[8px] p-3"
      >
        <div
          v-if="(message.images?.length ?? 0) > 0"
          class="chat-mosaic-wrap"
          :class="assistantImageGridClass"
        >
          <div
            v-for="(image, index) in message.images"
            :key="image.id || index"
            class="chat-image-card group chat-mosaic__cell"
            :data-cell="index"
          >
            <button
              type="button"
              class="chat-image-card__surface"
              :class="previewFrameClass"
              :data-size="message.meta.size"
              :aria-label="t('chat.imageZoom', { n: index + 1 })"
              @click="openImage(index)"
            >
              <div
                class="chat-image-placeholder absolute inset-0"
                :class="{ 'chat-image-placeholder--hiding': isImageReady(image, index) }"
                aria-hidden="true"
              >
                <div class="chat-image-placeholder__glow"></div>
                <div class="chat-image-placeholder__loader">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <div class="chat-image-placeholder__caption">
                  <span class="skeleton block h-3 w-[45%] rounded-full"></span>
                  <span class="skeleton block h-3 w-full rounded-full"></span>
                </div>
              </div>
              <img
                :src="imageSource(image)"
                :alt="t('canvas.imageGenerated', { n: index + 1 })"
                :loading="index < 2 ? 'eager' : 'lazy'"
                :fetchpriority="index === 0 ? 'high' : 'auto'"
                decoding="async"
                class="chat-image-fade h-full w-full object-contain will-change-[opacity]"
                :class="isImageReady(image, index) ? 'chat-image-fade--ready' : 'chat-image-fade--loading'"
                @load="markImageReady(image, index)"
                @error="markImageReady(image, index)"
              />
              <span
                class="chat-image-card__index"
                aria-hidden="true"
              >{{ index + 1 }}<span v-if="(message.images?.length ?? 0) > 1" class="opacity-60"> / {{ message.images?.length }}</span></span>
            </button>

            <div class="chat-image-card__overlay" aria-hidden="false">
              <button
                type="button"
                class="chat-image-action chat-image-action--primary"
                :aria-disabled="imageEditAriaDisabled"
                :aria-label="imageEditAriaLabel(t('chat.actionEditImageLabel'))"
                :title="imageEditTitle"
                @click.stop="editImage(index)"
              >
                <Icon name="brush" :size="13" />
                <span>{{ t('chat.actionEditImage') }}</span>
              </button>
              <button
                type="button"
                class="chat-image-action"
                :aria-label="t('chat.actionDownload', { n: index + 1 })"
                @click.stop="emit('download', image, index)"
              >
                <Icon name="download" :size="13" />
              </button>
            </div>
          </div>
        </div>

        <div class="chat-result-actions mt-3">
          <button
            type="button"
            class="chat-action-chip"
            :aria-label="t('chat.actionRegenerateLabel')"
            @click="emit('retry', message.replyTo)"
          >
            <Icon name="refresh" :size="12" />
            <span>{{ t('chat.actionRetry') }}</span>
          </button>
          <button
            v-if="(message.images?.length ?? 0) > 0"
            type="button"
            class="chat-action-chip"
            :aria-disabled="imageEditAriaDisabled"
            :aria-label="imageEditAriaLabel(t('chat.actionFreeEditLabel'))"
            :title="imageEditTitle"
            @click="editImage(0)"
          >
            <Icon name="brush" :size="12" />
            <span>{{ t('chat.actionFreeEdit') }}</span>
          </button>
          <button
            type="button"
            class="chat-action-chip chat-action-chip--quiet"
            :aria-label="t('chat.actionCopyPrompt')"
            @click="emit('copy', message.content || '', t('toast.copyPrompt'))"
          >
            <Icon name="copy" :size="12" />
            <span>{{ t('chat.actionCopyPrompt') }}</span>
          </button>
          <button
            v-if="importablePrompt"
            type="button"
            class="chat-action-chip chat-action-chip--quiet"
            :aria-label="t('chat.actionImportPromptLabel')"
            @click="emit('import-prompt', importablePrompt)"
          >
            <Icon name="upload" :size="12" />
            <span>{{ t('chat.actionImportPrompt') }}</span>
          </button>
          <span class="chat-result-stamp font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            <span v-if="typeof message.elapsedSeconds === 'number'">{{ message.elapsedSeconds }}s</span>
            <span v-if="message.requestId" class="ml-1.5">· {{ message.requestId.slice(0, 8) }}</span>
          </span>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* ------------------------------------------------------------------
 * Mobile chat bubbles — glass / gradient language.
 * User: ink gradient pill with a faint accent sheen.
 * Assistant: translucent glass card, frosted over the gradient bg.
 * ------------------------------------------------------------------ */

.chat-bubble-user {
  position: relative;
  isolation: isolate;
  font-feature-settings: 'ss01', 'cv11';
  background:
    linear-gradient(135deg, rgb(var(--color-ink)) 0%, rgb(18 18 30) 100%);
  box-shadow:
    var(--shadow-glass),
    inset 0 1px 0 rgb(255 255 255 / 0.08);
}

/* iridescent top-edge sheen so the user pill reads as "AI", not flat black */
.chat-bubble-user::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(135deg, rgb(var(--color-accent) / 0.28), transparent 55%);
  opacity: 0.7;
  pointer-events: none;
  z-index: -1;
}

.chat-bubble-assistant {
  border: 1px solid rgb(var(--color-line) / 0.4);
  background: rgb(var(--color-ivory) / 0.5);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  box-shadow: var(--shadow-glass), var(--shadow-inner-glass);
}

.chat-bubble-assistant--pending {
  border-color: rgb(var(--color-accent) / 0.25);
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent), var(--shadow-inner-glass);
}

.chat-message-stack {
  min-width: 0;
}

.chat-result-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding-inline: 0.25rem;
}

.chat-result-stamp {
  margin-left: auto;
  white-space: nowrap;
}

.chat-bubble-assistant--error {
  overflow-wrap: anywhere;
}

.chat-error-request {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-meta-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
  padding-inline: 0.25rem;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: rgb(var(--color-muted));
  line-height: 1.2;
  min-width: 0;
}

.chat-meta-row[data-orientation="user"] {
  justify-content: flex-end;
}

.chat-meta-row--assistant {
  letter-spacing: 0.22em;
}

.chat-meta-row__chunk {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.chat-meta-row__chunk + .chat-meta-row__chunk::before {
  content: '·';
  margin-right: 0.5rem;
  color: rgb(var(--color-line));
  /* Separator stays glued to its chunk, so when it wraps the dot moves with it. */
}

.chat-meta-row--assistant .chat-meta-row__chunk + .chat-meta-row__chunk::before {
  margin-right: 0.45rem;
}

.chat-meta-row__chunk--time {
  letter-spacing: 0;
  text-transform: none;
}

.chat-reference-thumb {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-paper-soft));
  aspect-ratio: 1;
}

.chat-reference-thumb--user {
  max-width: 168px;
}

.chat-reference-thumb__label {
  position: absolute;
  inset: auto 0 0 0;
  padding: 0.35rem 0.5rem;
  background: linear-gradient(180deg, transparent, rgb(var(--color-ink) / 0.78));
  color: rgb(var(--color-paper));
  font-size: 10px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-image-placeholder {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0.75rem;
  pointer-events: none;
  opacity: 1;
  background:
    radial-gradient(78% 68% at 24% 72%, rgb(var(--color-accent) / 0.14), transparent 64%),
    radial-gradient(62% 58% at 82% 18%, rgb(var(--color-clay) / 0.08), transparent 66%),
    linear-gradient(132deg, rgb(var(--color-surface-raised) / 0.96), rgb(var(--color-vellum) / 0.72) 48%, rgb(var(--color-paper-soft) / 0.86));
  background-size: 170% 170%;
  transition: opacity 720ms var(--motion-snap);
  animation: chat-placeholder-gradient 7s ease-in-out infinite;
}

.chat-image-placeholder--hiding {
  opacity: 0;
}

.chat-image-placeholder__glow {
  align-self: center;
  width: min(56%, 168px);
  height: min(56%, 168px);
  border-radius: 999px;
  background:
    radial-gradient(circle at 34% 32%, rgb(255 255 255 / 0.78), transparent 24%),
    radial-gradient(circle, rgb(var(--color-accent) / 0.28), rgb(var(--color-blueprint) / 0.14) 58%, transparent 76%);
  filter: blur(17px) saturate(1.18);
  animation: chat-placeholder-orb 4.8s var(--motion-soft) infinite;
}

.chat-image-placeholder__loader {
  display: inline-flex;
  align-items: center;
  align-self: center;
  gap: 6px;
  padding: 0.5rem 0.72rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.55);
  background: rgb(var(--color-surface-raised) / 0.72);
  box-shadow: var(--shadow-glass-sm), var(--shadow-inner-glass);
}

.chat-image-placeholder__loader span {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgb(var(--color-accent)), rgb(var(--color-blueprint) / 0.9));
  animation: chat-image-loader 1.15s ease-in-out infinite;
}

.chat-image-placeholder__loader span:nth-child(2) {
  animation-delay: 0.14s;
}

.chat-image-placeholder__loader span:nth-child(3) {
  animation-delay: 0.28s;
}

.chat-image-placeholder__caption {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.chat-image-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgb(var(--color-line) / 0.7);
  background: rgb(var(--color-paper-soft));
  transition: border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease;
}

.chat-image-card:hover {
  border-color: rgb(var(--color-line-strong));
  transform: translateY(-1px);
  box-shadow: var(--shadow-paper-2);
}

.chat-image-card__surface {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  background: rgb(var(--color-paper) / 0.45);
  border-radius: inherit;
  overflow: hidden;
  border: none;
  cursor: zoom-in;
  -webkit-tap-highlight-color: transparent;
  appearance: none;
}

.chat-image-card__surface:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.chat-image-card__index {
  position: absolute;
  top: 0.55rem;
  left: 0.55rem;
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: rgb(var(--color-ink) / 0.55);
  color: rgb(var(--color-paper));
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  font-feature-settings: 'tnum';
  letter-spacing: 0.04em;
  backdrop-filter: blur(4px);
  pointer-events: none;
  opacity: 0;
  transition: opacity 200ms ease;
}

.chat-image-card:hover .chat-image-card__index,
.chat-image-card:focus-within .chat-image-card__index {
  opacity: 1;
}

.chat-image-card__overlay {
  position: absolute;
  inset: auto 0.5rem 0.5rem 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  pointer-events: none;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 220ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  z-index: 2;
}

.chat-image-card:hover .chat-image-card__overlay,
.chat-image-card:focus-within .chat-image-card__overlay {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

@media (hover: none), (max-width: 640px) {
  .chat-image-card__overlay {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .chat-image-card__index {
    opacity: 1;
  }
}

.chat-image-action {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  height: 36px;
  min-width: 36px;
  padding: 0 0.85rem;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 0.22);
  background: rgb(var(--color-shadow) / 0.62);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  cursor: pointer;
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  box-shadow: var(--shadow-glass-sm);
  transition: background 160ms var(--motion-soft), transform 160ms var(--motion-press), box-shadow 160ms var(--motion-soft);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.chat-image-action::before {
  content: '';
  position: absolute;
  inset: -8px -4px;
}

.chat-image-action:hover {
  background: rgb(var(--color-shadow) / 0.78);
  transform: translateY(-1px);
  box-shadow: var(--shadow-glass);
}

.chat-image-action:active {
  transform: scale(0.94);
}

.chat-image-action--primary {
  background: var(--gradient-primary);
  border-color: rgb(255 255 255 / 0.4);
  font-weight: 600;
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent);
}

.chat-image-action--primary:hover {
  background: var(--gradient-primary);
  box-shadow: var(--shadow-glass-lg), 0 0 24px -6px rgb(var(--color-accent) / 0.5);
}

.chat-image-action[aria-disabled='true'] {
  cursor: help;
  opacity: 0.58;
  filter: saturate(0.5);
  box-shadow: none;
}

.chat-image-action[aria-disabled='true']:hover,
.chat-image-action[aria-disabled='true']:active,
.chat-image-action--primary[aria-disabled='true'],
.chat-image-action--primary[aria-disabled='true']:hover {
  background: rgb(var(--color-shadow) / 0.58);
  border-color: rgb(255 255 255 / 0.22);
  transform: none;
  box-shadow: none;
}

.chat-continuation-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  max-width: min(280px, 86vw);
  padding: 0.35rem 0.7rem 0.35rem 0.4rem;
  border-radius: 16px;
  border: 1px solid rgb(var(--color-forest) / 0.32);
  background:
    linear-gradient(90deg, rgb(var(--color-forest) / 0.08), transparent 42%),
    linear-gradient(180deg, rgb(var(--color-vellum) / 0.9), rgb(var(--color-cream) / 0.86));
  color: rgb(var(--color-ink));
  cursor: pointer;
  text-align: left;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
  -webkit-tap-highlight-color: transparent;
}

.chat-continuation-chip:hover {
  border-color: rgb(var(--color-forest) / 0.62);
  background: linear-gradient(180deg, rgb(var(--color-vellum)), rgb(var(--color-cream)));
}

.chat-continuation-chip:active {
  transform: translateY(1px);
}

.chat-continuation-chip__thumb {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-paper-soft));
}

.chat-continuation-chip__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-continuation-chip__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.15;
}

.chat-continuation-chip__title {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--color-forest));
}

.chat-continuation-chip__sub {
  margin-top: 1px;
  font-size: 11px;
  color: rgb(var(--color-muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-continuation-chip__arrow {
  flex-shrink: 0;
  color: rgb(var(--color-muted));
}

.chat-action-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.85rem;
  min-height: 36px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.6);
  background: rgb(var(--color-ivory) / 0.55);
  backdrop-filter: blur(10px) saturate(1.4);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
  box-shadow: var(--shadow-inner-glass);
  color: rgb(var(--color-ink));
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  transition: border-color 140ms ease, background-color 140ms ease, box-shadow 160ms ease, transform 140ms ease;
  touch-action: manipulation;
}

.chat-action-chip--quiet {
  background: transparent;
  box-shadow: none;
  border-color: rgb(var(--color-line) / 0.5);
  color: rgb(var(--color-muted));
  font-weight: 500;
}

.chat-action-chip--quiet:hover {
  background: rgb(var(--color-ivory) / 0.5);
  color: rgb(var(--color-ink));
}

.chat-action-chip::before {
  content: '';
  position: absolute;
  inset: -6px -3px;
}

.chat-action-chip:hover {
  border-color: rgb(var(--color-line-strong));
  background: rgb(var(--color-vellum));
  transform: translateY(-1px);
}

.chat-action-chip:active {
  transform: translateY(0);
}

.chat-action-chip--primary {
  background: var(--gradient-primary);
  color: #fff;
  border-color: transparent;
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent);
}

.chat-action-chip--primary:hover {
  box-shadow: var(--shadow-glass-lg), 0 0 24px -6px rgb(var(--color-accent) / 0.4);
  transform: translateY(-1px);
}

.chat-action-chip[aria-disabled='true'] {
  cursor: help;
  opacity: 0.58;
  color: rgb(var(--color-muted));
  border-color: rgb(var(--color-line) / 0.48);
  background: rgb(var(--color-ivory) / 0.34);
  box-shadow: none;
}

.chat-action-chip[aria-disabled='true']:hover,
.chat-action-chip[aria-disabled='true']:active {
  border-color: rgb(var(--color-line) / 0.48);
  background: rgb(var(--color-ivory) / 0.34);
  transform: none;
  box-shadow: none;
}

.chat-retry-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.9rem;
  min-height: 36px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-accent) / 0.4);
  background: rgb(var(--color-accent) / 0.1);
  color: rgb(var(--color-accent));
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: background-color 140ms ease, transform 140ms ease;
  touch-action: manipulation;
}

.chat-retry-chip::before {
  content: '';
  position: absolute;
  inset: -6px -3px;
}

.chat-retry-chip:hover {
  background: rgb(var(--color-accent) / 0.16);
  transform: translateY(-1px);
}

.chat-retry-chip:active {
  transform: translateY(0);
}

.chat-retry-chip--quiet {
  border-color: rgb(var(--color-accent) / 0.4);
  background: transparent;
  font-weight: 500;
}

@keyframes chat-image-loader {
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

@keyframes chat-placeholder-gradient {
  0%, 100% { background-position: 0% 54%; }
  50% { background-position: 100% 46%; }
}

@keyframes chat-placeholder-orb {
  0%, 100% { transform: translate3d(-14px, 10px, 0) scale(0.94); opacity: 0.78; }
  42% { transform: translate3d(18px, -14px, 0) scale(1.08); opacity: 0.96; }
  72% { transform: translate3d(16px, 16px, 0) scale(1); opacity: 0.86; }
}

.chat-image-fade {
  transform: translateY(8px) scale(0.986);
  filter: blur(14px) saturate(0.86);
  transition: opacity 820ms var(--motion-snap), transform 900ms var(--motion-snap), filter 920ms var(--motion-snap);
  will-change: opacity, transform, filter;
}

.chat-image-fade--loading {
  opacity: 0;
  filter: blur(14px) saturate(0.86);
}

.chat-image-fade--ready {
  opacity: 1;
  transform: translateY(0) scale(1);
  filter: blur(0) saturate(1);
  animation: chat-result-settle 900ms var(--motion-snap) both;
}

@keyframes chat-result-settle {
  0% {
    opacity: 0;
    transform: translateY(8px) scale(0.986);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-action-chip,
  .chat-retry-chip,
  .chat-image-placeholder,
  .chat-image-placeholder__glow,
  .chat-image-placeholder__loader span,
  .chat-bubble-assistant img,
  .chat-image-fade {
    transition: none;
    animation: none;
    transform: none;
  }
}

/* ---------- Multi-image mosaic ---------- */

.chat-mosaic-wrap {
  display: grid;
  gap: 0.45rem;
}

.chat-mosaic--1 {
  grid-template-columns: 1fr;
}

.chat-mosaic--2 {
  grid-template-columns: 1fr 1fr;
}

.chat-mosaic--3 {
  /* big image left, two stacked right — magazine feel */
  grid-template-columns: 1.45fr 1fr;
  grid-template-rows: 1fr 1fr;
  aspect-ratio: 4 / 3;
}

.chat-mosaic--3 > .chat-mosaic__cell:nth-child(1) {
  grid-column: 1 / 2;
  grid-row: 1 / 3;
}
.chat-mosaic--3 > .chat-mosaic__cell:nth-child(2) {
  grid-column: 2 / 3;
  grid-row: 1 / 2;
}
.chat-mosaic--3 > .chat-mosaic__cell:nth-child(3) {
  grid-column: 2 / 3;
  grid-row: 2 / 3;
}

.chat-mosaic--4 {
  grid-template-columns: 1.4fr 1fr;
  grid-template-rows: 1fr 1fr 1fr;
  aspect-ratio: 5 / 4;
}

.chat-mosaic--4 > .chat-mosaic__cell:nth-child(1) {
  grid-column: 1 / 2;
  grid-row: 1 / 4;
}
.chat-mosaic--4 > .chat-mosaic__cell:nth-child(2) {
  grid-column: 2 / 3;
  grid-row: 1 / 2;
}
.chat-mosaic--4 > .chat-mosaic__cell:nth-child(3) {
  grid-column: 2 / 3;
  grid-row: 2 / 3;
}
.chat-mosaic--4 > .chat-mosaic__cell:nth-child(4) {
  grid-column: 2 / 3;
  grid-row: 3 / 4;
}

/* When the cell is in a mosaic ≥ 2, drop the per-cell aspect-ratio override
 * so the cell fills its grid track instead of forcing 1:1 / 2:3 / 3:2.
 * The ":not()" guarantees we only override single-row mosaics. */
.chat-mosaic--2 > .chat-mosaic__cell .chat-image-card__surface,
.chat-mosaic--3 > .chat-mosaic__cell .chat-image-card__surface,
.chat-mosaic--4 > .chat-mosaic__cell .chat-image-card__surface {
  aspect-ratio: auto;
  height: 100%;
}

.chat-mosaic--3 > .chat-mosaic__cell,
.chat-mosaic--4 > .chat-mosaic__cell {
  height: 100%;
  min-height: 0;
}

.chat-mosaic--3 > .chat-mosaic__cell .chat-image-card__surface img,
.chat-mosaic--4 > .chat-mosaic__cell .chat-image-card__surface img,
.chat-mosaic--2 > .chat-mosaic__cell .chat-image-card__surface img {
  object-fit: cover;
}

.chat-mosaic--2 > .chat-mosaic__cell {
  aspect-ratio: 3 / 4;
}

@media (max-width: 380px) {
  .chat-mosaic--4 {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    aspect-ratio: 1;
  }

  .chat-mosaic--4 > .chat-mosaic__cell:nth-child(1) {
    grid-column: 1 / 2;
    grid-row: 1 / 2;
  }
  .chat-mosaic--4 > .chat-mosaic__cell:nth-child(3) {
    grid-column: 1 / 2;
    grid-row: 2 / 3;
  }
  .chat-mosaic--4 > .chat-mosaic__cell:nth-child(2) {
    grid-column: 2 / 3;
    grid-row: 1 / 2;
  }
  .chat-mosaic--4 > .chat-mosaic__cell:nth-child(4) {
    grid-column: 2 / 3;
    grid-row: 2 / 3;
  }
}

@media (max-width: 640px) {
  .chat-bubble-row[data-role='assistant'] {
    justify-content: stretch;
  }

  .chat-message-stack--assistant {
    width: 100%;
    max-width: 100%;
  }

  .chat-message-stack--user {
    max-width: min(92%, calc(100vw - 1.5rem));
  }

  .chat-bubble-assistant {
    border-radius: 16px;
    border-bottom-left-radius: 6px;
    background: rgb(var(--color-surface) / 0.96);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    box-shadow: var(--shadow-glass-sm), var(--shadow-inner-glass);
  }

  .chat-bubble-user {
    border-radius: 18px;
    border-bottom-right-radius: 6px;
  }

  .chat-meta-row {
    max-width: 100%;
    gap: 0.25rem 0.4rem;
    padding-inline: 0.15rem;
    font-size: 9.5px;
    letter-spacing: 0.08em;
  }

  .chat-meta-row--assistant {
    letter-spacing: 0.1em;
  }

  .chat-meta-row__chunk {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chat-meta-row__chunk + .chat-meta-row__chunk::before {
    margin-right: 0.4rem;
  }

  .chat-reference-grid {
    gap: 0.45rem;
  }

  .chat-reference-thumb {
    border-radius: 12px;
  }

  .chat-reference-thumb--user {
    max-width: min(148px, 42vw);
  }

  .chat-continuation-chip {
    max-width: min(100%, calc(100vw - 1.5rem));
    min-height: 44px;
    border-radius: 12px;
  }

  .chat-continuation-chip__sub {
    max-width: min(48vw, 180px);
  }

  .chat-bubble-assistant--pending {
    min-height: 260px;
    max-height: min(72dvh, 520px);
  }

  .chat-bubble-assistant--pending[data-size='1536x1024'] {
    min-height: 236px;
  }

  .chat-bubble-assistant--pending :deep(.epulse__top) {
    inset: 0.55rem 0.6rem auto;
    gap: 0.5rem;
  }

  .chat-bubble-assistant--pending :deep(.epulse__tag) {
    max-width: 52%;
    overflow: hidden;
    letter-spacing: 0.12em;
    white-space: nowrap;
  }

  .chat-bubble-assistant--pending :deep(.epulse__cancel) {
    min-height: 38px;
    padding: 0.35rem 0.6rem;
  }

  .chat-bubble-assistant--pending :deep(.epulse__center) {
    width: 104px;
    min-width: 104px;
    height: 104px;
    min-height: 104px;
  }

  .chat-bubble-assistant--pending :deep(.epulse__stage) {
    max-width: calc(100% - 1.5rem);
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: 0.12em;
    line-height: 1.35;
  }

  .chat-bubble-assistant--pending :deep(.epulse__bottom) {
    inset: auto 0.7rem 0.65rem;
  }

  .chat-bubble-assistant--pending :deep(.epulse__meta-row) {
    align-items: flex-start;
    gap: 0.45rem;
  }

  .chat-bubble-assistant--pending :deep(.epulse__prompt) {
    max-width: min(68%, 34ch);
    font-size: 10.5px;
    -webkit-line-clamp: 2;
  }

  .chat-bubble-assistant--pending :deep(.epulse__remain) {
    white-space: nowrap;
  }

  .chat-bubble-assistant--error {
    padding: 0.8rem 0.85rem;
    font-size: 13px;
    line-height: 1.55;
  }

  .chat-error-request {
    letter-spacing: 0.08em;
  }

  .chat-retry-chip,
  .chat-action-chip,
  .chat-image-action {
    min-height: 44px;
  }

  .chat-retry-chip::before,
  .chat-action-chip::before,
  .chat-image-action::before {
    inset: 0;
  }

  .chat-mosaic-wrap {
    gap: 0.75rem;
  }

  .chat-mosaic--2,
  .chat-mosaic--3,
  .chat-mosaic--4 {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    aspect-ratio: auto;
  }

  .chat-mosaic--3 > .chat-mosaic__cell:nth-child(n),
  .chat-mosaic--4 > .chat-mosaic__cell:nth-child(n) {
    grid-column: auto;
    grid-row: auto;
  }

  .chat-mosaic--2 > .chat-mosaic__cell,
  .chat-mosaic--3 > .chat-mosaic__cell,
  .chat-mosaic--4 > .chat-mosaic__cell {
    height: auto;
    min-height: 0;
    aspect-ratio: auto;
  }

  .chat-mosaic--2 > .chat-mosaic__cell .chat-image-card__surface,
  .chat-mosaic--3 > .chat-mosaic__cell .chat-image-card__surface,
  .chat-mosaic--4 > .chat-mosaic__cell .chat-image-card__surface {
    height: auto;
    aspect-ratio: 1;
  }

  .chat-image-card__surface[data-size='1024x1536'] {
    aspect-ratio: 2 / 3;
  }

  .chat-image-card__surface[data-size='1536x1024'] {
    aspect-ratio: 3 / 2;
  }

  .chat-mosaic--2 > .chat-mosaic__cell .chat-image-card__surface[data-size='1024x1536'],
  .chat-mosaic--3 > .chat-mosaic__cell .chat-image-card__surface[data-size='1024x1536'],
  .chat-mosaic--4 > .chat-mosaic__cell .chat-image-card__surface[data-size='1024x1536'] {
    aspect-ratio: 2 / 3;
  }

  .chat-mosaic--2 > .chat-mosaic__cell .chat-image-card__surface[data-size='1536x1024'],
  .chat-mosaic--3 > .chat-mosaic__cell .chat-image-card__surface[data-size='1536x1024'],
  .chat-mosaic--4 > .chat-mosaic__cell .chat-image-card__surface[data-size='1536x1024'] {
    aspect-ratio: 3 / 2;
  }

  .chat-image-card__surface[data-size='1024x1024'] {
    aspect-ratio: 1;
  }

  .chat-mosaic--3 > .chat-mosaic__cell .chat-image-card__surface img,
  .chat-mosaic--4 > .chat-mosaic__cell .chat-image-card__surface img,
  .chat-mosaic--2 > .chat-mosaic__cell .chat-image-card__surface img {
    object-fit: contain;
  }

  .chat-image-card {
    border-radius: 14px;
    transform: none;
  }

  .chat-image-card:hover {
    transform: none;
    box-shadow: var(--shadow-glass-sm);
  }

  .chat-image-card__surface {
    border-radius: 13px 13px 0 0;
    background: rgb(var(--color-paper) / 0.34);
  }

  .chat-image-card__index {
    top: 0.5rem;
    left: 0.5rem;
    opacity: 1;
    background: rgb(var(--color-ink) / 0.66);
  }

  .chat-image-card__overlay {
    position: static;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.45rem;
    padding: 0.5rem;
    border-top: 1px solid rgb(var(--color-line) / 0.62);
    background: rgb(var(--color-surface-muted) / 0.9);
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }

  .chat-image-action {
    flex: 1 1 auto;
    height: 44px;
    min-width: 44px;
    padding: 0 0.75rem;
    border-color: rgb(var(--color-line) / 0.72);
    background: rgb(var(--color-surface-raised));
    color: rgb(var(--color-ink));
    box-shadow: var(--shadow-inner-glass);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .chat-image-action--primary {
    background: var(--gradient-primary);
    border-color: transparent;
    color: #fff;
  }

  .chat-image-action span,
  .chat-action-chip span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-result-actions {
    gap: 0.45rem;
    padding-inline: 0;
  }

  .chat-action-chip {
    max-width: 100%;
    padding: 0 0.75rem;
  }

  .chat-result-stamp {
    flex-basis: 100%;
    margin-left: 0;
    padding-inline: 0.2rem;
    text-align: right;
    letter-spacing: 0.08em;
  }
}

@media (max-width: 420px) {
  .chat-message-stack--user {
    max-width: 94%;
  }

  .chat-action-chip {
    flex: 1 1 calc(50% - 0.45rem);
    justify-content: center;
  }

  .chat-image-action--primary {
    flex: 1 1 0;
  }

  .chat-image-action:not(.chat-image-action--primary) {
    flex: 0 0 44px;
    padding: 0;
  }

  .chat-bubble-assistant--pending :deep(.epulse__tag) {
    max-width: 44%;
  }
}
</style>
