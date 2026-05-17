<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import DevelopingFrame from './DevelopingFrame.vue'
import { resolveImageSource } from '../api'
import { styleOptions } from '../presets'
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
}

const props = withDefaults(defineProps<Props>(), { history: () => [] as GenerationHistoryItem[] })
const { t } = useI18n()

const emit = defineEmits<{
  (e: 'retry', id: string): void
  (e: 'open-image', images: GeneratedImage[], index: number): void
  (e: 'download', image: GeneratedImage, index: number): void
  (e: 'copy', text: string, message: string): void
  (e: 'remix', image: GeneratedImage, prompt: string, imageIndex: number): void
  (e: 'scroll-to-message', id: string): void
  (e: 'abort', id: string): void
  (e: 'import-prompt', text: string): void
}>()

function openImage(index: number) {
  if (props.message.role !== 'assistant') return
  const images = props.message.images ?? []
  if (!images.length) return
  emit('open-image', images, Math.max(0, Math.min(index, images.length - 1)))
}

const isUser = computed(() => props.message.role === 'user')

const isReferenceMessage = computed(() => props.message.meta.generationMode === 'reference')

const styleLabel = computed(() => {
  const match = styleOptions.find((option) => option.value === props.message.meta.style)
  return match?.label ?? props.message.meta.style
})

const timeLabel = computed(() => {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
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
  if (size === '1024x1536') return '竖图'
  if (size === '1536x1024') return '横图'
  return '方图'
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
  return computeProgress(message.elapsedSeconds ?? 0, pendingEta.value.targetSeconds)
})

const pendingPercentLabel = computed(() => `${pendingProgress.value}%`)

const pendingRemainingLabel = computed(() => {
  const message = assistantMessage.value
  if (!message || message.status !== 'pending') return ''
  return formatRemainingLabel(
    message.elapsedSeconds ?? 0,
    pendingEta.value.targetSeconds,
    { source: pendingEta.value.source },
  )
})

const pendingStageLabel = computed(() => stageLabelForProgress(pendingProgress.value))

const pendingMetaLabel = computed(() => {
  const message = assistantMessage.value
  if (!message || message.status !== 'pending') return ''
  return `${message.meta.count} 张 · ${pendingSizeLabel(message.meta.size)}`
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
    <div v-if="message.role === 'user'" class="flex max-w-[86%] flex-col items-end gap-1.5">
      <button
        v-if="message.continuedFrom"
        type="button"
        class="chat-continuation-chip self-end"
        :aria-label="`基于先前生成的第 ${message.continuedFrom.fromImageIndex + 1} 张图，点击跳回原对话`"
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
          <span class="chat-continuation-chip__title">接着上一张</span>
          <span class="chat-continuation-chip__sub">{{ message.continuedFrom.promptPreview || '继续编辑' }}</span>
        </span>
        <Icon name="arrowUp" :size="11" class="chat-continuation-chip__arrow" />
      </button>

      <div
        v-if="(message.referenceImages?.length ?? 0) > 0"
        class="grid max-w-full gap-2 self-end"
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
        class="chat-bubble-user rounded-[22px] rounded-br-[8px] bg-ink px-4 py-2.5 text-[15px] leading-6 text-paper shadow-paper-2"
      >
        <p class="whitespace-pre-wrap break-words">{{ message.content }}</p>
      </div>
      <div class="chat-meta-row" :data-orientation="message.role">
        <span v-if="isReferenceMessage" class="chat-meta-row__chunk">参考图</span>
        <span class="chat-meta-row__chunk">{{ styleLabel }}</span>
        <span class="chat-meta-row__chunk">{{ message.meta.size }}</span>
        <span v-if="message.meta.count > 1" class="chat-meta-row__chunk">×{{ message.meta.count }}</span>
        <span v-if="message.meta.referenceImageCount" class="chat-meta-row__chunk">图 {{ message.meta.referenceImageCount }}</span>
        <span v-if="timeLabel" class="chat-meta-row__chunk chat-meta-row__chunk--time">{{ timeLabel }}</span>
      </div>
    </div>

    <div v-else class="flex max-w-[92%] flex-col items-start gap-1.5">
      <div class="chat-meta-row chat-meta-row--assistant">
        <span
          class="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line-strong bg-vellum text-ink"
          aria-hidden="true"
        >
          <Icon name="sparkle" :size="11" />
        </span>
        <span class="chat-meta-row__chunk">{{ t('chat.canvas') }}</span>
        <span class="chat-meta-row__chunk">{{ styleLabel }}</span>
        <span class="chat-meta-row__chunk">{{ message.meta.size }}</span>
        <span v-if="message.meta.referenceImageCount" class="chat-meta-row__chunk">参考 {{ message.meta.referenceImageCount }}</span>
      </div>

      <div
        v-if="message.status === 'pending'"
        class="chat-bubble-assistant chat-bubble-assistant--pending relative w-full overflow-hidden rounded-[22px] rounded-bl-[8px] border border-line bg-vellum p-3 shadow-paper-2"
        role="status"
        aria-live="polite"
      >
          <div
            class="chat-pending-frame relative w-full overflow-hidden rounded-2xl"
            :class="previewFrameClass"
          >
            <DevelopingFrame
              :progress="pendingProgress"
              :elapsed-seconds="message.elapsedSeconds ?? 0"
              :stage="pendingStageLabel"
              :remaining-label="pendingRemainingLabel"
              :meta-label="pendingMetaLabel"
              :prompt-preview="message.content"
              :ring-size="148"
              compact
              @cancel="emit('abort', message.id)"
            />
          </div>
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
              class="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-accent/70"
            >
              req {{ message.requestId.slice(0, 12) }}
            </p>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="chat-retry-chip"
            aria-label="重新生成"
            @click="emit('retry', message.replyTo)"
          >
            <Icon name="refresh" :size="12" />
            <span>{{ t('chat.retry') }}</span>
          </button>
          <button
            v-if="message.errorMessage"
            type="button"
            class="chat-retry-chip chat-retry-chip--quiet"
            aria-label="复制错误信息"
            @click="emit('copy', message.errorMessage, '已复制错误信息')"
          >
            <Icon name="copy" :size="12" />
            <span>复制</span>
          </button>
        </div>
      </div>

      <div
        v-else
        class="chat-bubble-assistant w-full rounded-[22px] rounded-bl-[8px] border border-line bg-vellum p-3 shadow-paper-2"
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
              :aria-label="`放大查看第 ${index + 1} 张图片`"
              @click="openImage(index)"
            >
              <div
                v-if="!isImageReady(image, index)"
                class="chat-image-placeholder absolute inset-0"
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
                :alt="`生成图片 ${index + 1}`"
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
                :aria-label="`基于这张图接着画`"
                @click.stop="emit('remix', image, message.content || '', index)"
              >
                <Icon name="sparkle" :size="13" />
                <span>接着画</span>
              </button>
              <button
                type="button"
                class="chat-image-action"
                :aria-label="`下载第 ${index + 1} 张`"
                @click.stop="emit('download', image, index)"
              >
                <Icon name="download" :size="13" />
              </button>
            </div>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-1.5 px-1">
          <button
            type="button"
            class="chat-action-chip"
            aria-label="重新生成相同提示词"
            @click="emit('retry', message.replyTo)"
          >
            <Icon name="refresh" :size="12" />
            <span>{{ t('chat.actionRetry') }}</span>
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
            aria-label="导入到 Composer 并解析槽位"
            @click="emit('import-prompt', importablePrompt)"
          >
            <Icon name="upload" :size="12" />
            <span>导入到 Composer</span>
          </button>
          <span class="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            <span v-if="typeof message.elapsedSeconds === 'number'">{{ message.elapsedSeconds }}s</span>
            <span v-if="message.requestId" class="ml-1.5">· {{ message.requestId.slice(0, 8) }}</span>
          </span>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.chat-bubble-user {
  font-feature-settings: 'ss01', 'cv11';
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
  background: linear-gradient(180deg, rgb(var(--color-vellum) / 0.9), rgb(var(--color-paper) / 0.58));
}

.chat-image-placeholder__glow {
  align-self: center;
  width: min(56%, 168px);
  height: min(56%, 168px);
  border-radius: 999px;
  background: radial-gradient(circle, rgb(var(--color-vellum) / 0.95), rgb(var(--color-vellum) / 0) 68%);
  filter: blur(6px);
}

.chat-image-placeholder__loader {
  display: inline-flex;
  align-items: center;
  align-self: center;
  gap: 6px;
  padding: 0.55rem 0.8rem;
  border-radius: 999px;
  background: rgb(var(--color-vellum) / 0.84);
  box-shadow: 0 18px 34px -26px rgb(var(--color-ink) / 0.45);
}

.chat-image-placeholder__loader span {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgb(var(--color-ink) / 0.55);
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
  gap: 0.35rem;
  height: 32px;
  padding: 0 0.7rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-paper) / 0.45);
  background: rgb(var(--color-ink) / 0.78);
  color: rgb(var(--color-paper));
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.01em;
  cursor: pointer;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: background 160ms ease, transform 160ms ease, box-shadow 160ms ease;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.chat-image-action::before {
  content: '';
  position: absolute;
  inset: -6px -3px;
}

.chat-image-action:hover {
  background: rgb(var(--color-ink));
  transform: translateY(-1px);
  box-shadow: 0 10px 24px -16px rgb(var(--color-ink) / 0.6);
}

.chat-image-action:active {
  transform: translateY(0);
}

.chat-image-action--primary {
  background: linear-gradient(135deg, rgb(var(--color-accent) / 0.95), rgb(var(--color-ochre) / 0.92));
  border-color: rgb(var(--color-paper) / 0.55);
  font-weight: 600;
}

.chat-image-action--primary:hover {
  background: linear-gradient(135deg, rgb(var(--color-accent)), rgb(var(--color-ochre)));
  box-shadow: 0 12px 28px -14px rgb(var(--color-accent) / 0.55);
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
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  min-height: 32px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-cream));
  color: rgb(var(--color-ink));
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.01em;
  transition: border-color 140ms ease, background-color 140ms ease, transform 140ms ease;
  touch-action: manipulation;
}

.chat-action-chip--quiet {
  background: transparent;
  border-color: rgb(var(--color-line) / 0.7);
  color: rgb(var(--color-muted));
  font-weight: 500;
}

.chat-action-chip--quiet:hover {
  background: rgb(var(--color-cream));
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
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  border-color: rgb(var(--color-ink));
}

.chat-action-chip--primary:hover {
  background: rgb(var(--color-ink) / 0.9);
  border-color: rgb(var(--color-ink));
}

.chat-retry-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.8rem;
  min-height: 32px;
  border-radius: 999px;
  border: 1px solid currentColor;
  background: rgb(var(--color-accent) / 0.08);
  color: rgb(var(--color-accent));
  font-size: 11px;
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

.chat-image-fade {
  transform: translateY(6px) scale(0.992);
  filter: blur(8px);
  transition: opacity 420ms var(--motion-snap), transform 520ms var(--motion-snap), filter 200ms var(--motion-snap);
  will-change: opacity, transform, filter;
}

.chat-image-fade--loading {
  opacity: 0;
}

.chat-image-fade--ready {
  opacity: 1;
  transform: translateY(0) scale(1);
  filter: blur(0);
  animation: chat-result-settle 620ms var(--motion-snap) both;
}

@keyframes chat-result-settle {
  0% {
    opacity: 0;
    transform: translateY(8px) scale(0.99);
  }
  70% {
    opacity: 1;
    transform: translateY(-1px) scale(1.002);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-action-chip,
  .chat-retry-chip,
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
</style>
