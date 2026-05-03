<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import { resolveImageSource } from '../api'
import { styleOptions } from '../presets'
import type { ChatAssistantMessage, ChatMessage, GeneratedImage } from '../types'

interface Props {
  message: ChatMessage
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'retry', id: string): void
  (e: 'open-image', images: GeneratedImage[], index: number): void
  (e: 'download', image: GeneratedImage, index: number): void
  (e: 'copy', text: string, message: string): void
  (e: 'remix', image: GeneratedImage, prompt: string, imageIndex: number): void
  (e: 'scroll-to-message', id: string): void
  (e: 'abort', id: string): void
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

function pendingSizeLabel(size: ChatAssistantMessage['meta']['size']) {
  if (size === '1024x1536') return '竖图'
  if (size === '1536x1024') return '横图'
  return '方图'
}

function estimatedPendingDuration(message: ChatAssistantMessage) {
  let seconds = 11

  if (message.meta.size !== '1024x1024') seconds += 2
  if (message.meta.quality === 'medium') seconds += 1
  if (message.meta.quality === 'high') seconds += 4
  if (message.meta.quality === 'low') seconds -= 1

  seconds += Math.max(0, message.meta.count - 1) * 4

  return Math.max(8, seconds)
}

function estimatePendingProgress(message: ChatAssistantMessage) {
  const elapsed = Math.max(0, message.elapsedSeconds ?? 0)
  const target = estimatedPendingDuration(message)
  const fastPhase = target * 0.38

  if (elapsed <= 0) return 5

  if (elapsed < fastPhase) {
    return Math.min(58, Math.round(5 + (elapsed / fastPhase) * 53))
  }

  if (elapsed < target) {
    return Math.min(86, Math.round(58 + ((elapsed - fastPhase) / Math.max(1, target - fastPhase)) * 28))
  }

  const overflow = elapsed - target
  const settle = 86 + (1 - Math.exp(-overflow / Math.max(3, target * 0.28))) * 10
  return Math.min(96, Math.max(58, Math.round(settle)))
}

const pendingProgress = computed(() => {
  const message = assistantMessage.value
  if (!message || message.status !== 'pending') return 0
  return estimatePendingProgress(message)
})

const pendingPercentLabel = computed(() => `${pendingProgress.value}%`)

const pendingRemainingLabel = computed(() => {
  const message = assistantMessage.value
  if (!message || message.status !== 'pending') return ''
  const target = estimatedPendingDuration(message)
  const elapsed = Math.max(0, message.elapsedSeconds ?? 0)
  const remain = Math.max(0, target - elapsed)
  if (elapsed >= target) {
    // 已经超时：用模糊语言而非倒计时
    return '已超出预估，仍在等上游回包'
  }
  if (remain <= 1) return '即将出图'
  if (remain <= 4) return `约 ${remain}s`
  return `约 ${remain}s`
})

const pendingStageLabel = computed(() => {
  const progress = pendingProgress.value
  if (progress < 24) return '解析提示词'
  if (progress < 52) return '搭建构图'
  if (progress < 80) return '渲染细节'
  return '准备出图'
})

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
  if (total <= 1) return 'grid-cols-1'
  return 'grid-cols-2'
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
      <div class="flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        <span v-if="isReferenceMessage">参考图</span>
        <span v-if="isReferenceMessage" class="text-line">·</span>
        <span>{{ styleLabel }}</span>
        <span class="text-line">·</span>
        <span>{{ message.meta.size }}</span>
        <span v-if="message.meta.count > 1" class="text-line">·</span>
        <span v-if="message.meta.count > 1">×{{ message.meta.count }}</span>
        <span v-if="message.meta.referenceImageCount" class="text-line">·</span>
        <span v-if="message.meta.referenceImageCount">图 {{ message.meta.referenceImageCount }}</span>
        <span v-if="timeLabel" class="text-line">·</span>
        <span v-if="timeLabel" class="tracking-normal">{{ timeLabel }}</span>
      </div>
    </div>

    <div v-else class="flex max-w-[92%] flex-col items-start gap-1.5">
      <div class="flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
        <span
          class="grid h-5 w-5 place-items-center rounded-full border border-line-strong bg-vellum text-ink"
          aria-hidden="true"
        >
          <Icon name="sparkle" :size="11" />
        </span>
        <span>canvas</span>
        <span class="text-line">·</span>
        <span>{{ styleLabel }} · {{ message.meta.size }}</span>
        <span v-if="message.meta.referenceImageCount" class="text-line">·</span>
        <span v-if="message.meta.referenceImageCount">参考 {{ message.meta.referenceImageCount }}</span>
      </div>

      <div
        v-if="message.status === 'pending'"
        class="chat-bubble-assistant chat-bubble-assistant--pending relative w-full overflow-hidden rounded-[22px] rounded-bl-[8px] border border-line bg-vellum p-3 shadow-paper-2"
        role="status"
        aria-live="polite"
      >
          <div class="chat-pending-frame relative w-full overflow-hidden rounded-2xl" :class="previewFrameClass">
            <div class="chat-pending-bg absolute inset-0"></div>

            <div
              class="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.22em] text-muted/60"
            >
              <div class="flex items-center gap-2">
                <span class="flex h-1.5 w-1.5 rounded-full bg-ink/20 animate-pulse"></span>
                <span>{{ pendingStageLabel }}</span>
              </div>
              <span class="tabular-nums">{{ typeof message.elapsedSeconds === 'number' ? String(message.elapsedSeconds).padStart(2, '0') + 's' : '' }}</span>
            </div>

            <div class="pointer-events-none absolute inset-0 z-10 grid place-items-center px-4" aria-hidden="true">
              <div class="chat-pending-manifest">
                <span class="chat-pending-manifest__value">{{ pendingPercentLabel }}</span>
                <span class="chat-pending-manifest__label">{{ pendingStageLabel }}</span>
              </div>
            </div>

            <div class="pointer-events-none absolute inset-x-4 bottom-4 z-10" aria-hidden="true">
              <div class="chat-pending-bar" :style="{ '--progress': pendingProgress + '%' }"></div>
            </div>
          </div>

          <div class="chat-pending-footer">
            <span class="chat-pending-footer__remain" aria-live="polite">
              <span class="chat-pending-footer__remain-dot" aria-hidden="true"></span>
              <span>{{ pendingRemainingLabel }}</span>
            </span>
            <span class="chat-pending-footer__meta">{{ pendingMetaLabel }}</span>
            <button
              type="button"
              class="chat-pending-footer__cancel"
              aria-label="取消这次生成"
              @click="emit('abort', message.id)"
            >
              <Icon name="close" :size="11" />
              <span>取消</span>
            </button>
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
            <p class="font-medium">{{ message.errorMessage || '生成失败，请稍后重试。' }}</p>
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
            <span>重试</span>
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
          class="grid gap-2"
          :class="assistantImageGridClass"
        >
          <div
            v-for="(image, index) in message.images"
            :key="image.id || index"
            class="chat-image-card group"
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
            <span>再画一张</span>
          </button>
          <button
            type="button"
            class="chat-action-chip chat-action-chip--quiet"
            aria-label="复制提示词"
            @click="emit('copy', message.content || '', '已复制提示词')"
          >
            <Icon name="copy" :size="12" />
            <span>复制提示词</span>
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

.chat-reference-thumb {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-paper-soft));
  min-height: 84px;
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

.chat-pending-bg {
  background: 
    radial-gradient(circle at 30% 20%, rgb(var(--color-vellum) / 0.8) 0%, transparent 50%),
    radial-gradient(circle at 70% 80%, rgb(var(--color-cream) / 0.6) 0%, transparent 50%),
    rgb(var(--color-paper-soft));
  animation: pending-bg-shift 8s ease-in-out infinite alternate;
}

.chat-pending-manifest {
  text-align: center;
}

.chat-pending-manifest__value {
  display: block;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 28px;
  font-weight: 200;
  letter-spacing: -0.05em;
  color: rgb(var(--color-ink));
  font-feature-settings: 'tnum';
}

.chat-pending-manifest__label {
  display: block;
  margin-top: -2px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  color: rgb(var(--color-muted));
  opacity: 0.6;
}

.chat-pending-bar {
  height: 1px;
  background: rgb(var(--color-line-strong) / 0.2);
  width: 100%;
  position: relative;
  overflow: hidden;
}

.chat-pending-bar::after {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--progress, 0%);
  background: rgb(var(--color-ink));
  transition: width 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.chat-pending-footer {
  margin-top: 0.7rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0 0.25rem;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: rgb(var(--color-muted));
}

.chat-pending-footer__remain {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: rgb(var(--color-ink) / 0.85);
  font-feature-settings: 'tnum';
}

.chat-pending-footer__remain-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgb(var(--color-forest));
  box-shadow: 0 0 0 0 rgb(var(--color-forest) / 0.5);
  animation: chat-pending-pulse 1.6s ease-in-out infinite;
}

@keyframes chat-pending-pulse {
  0%, 100% {
    transform: scale(0.85);
    box-shadow: 0 0 0 0 rgb(var(--color-forest) / 0.5);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 0 0 6px rgb(var(--color-forest) / 0);
  }
}

.chat-pending-footer__meta {
  flex: 1;
  text-align: right;
  text-transform: uppercase;
  font-size: 9px;
  letter-spacing: 0.18em;
  opacity: 0.65;
}

.chat-pending-footer__cancel {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.8);
  background: rgb(var(--color-cream));
  color: rgb(var(--color-muted));
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease, background 140ms ease, transform 140ms ease;
  -webkit-tap-highlight-color: transparent;
}

.chat-pending-footer__cancel::before {
  content: '';
  position: absolute;
  inset: -6px;
}

.chat-pending-footer__cancel:hover {
  color: rgb(var(--color-accent));
  border-color: rgb(var(--color-accent) / 0.5);
  background: rgb(var(--color-accent) / 0.07);
}

.chat-pending-footer__cancel:active {
  transform: scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .chat-pending-bg,
  .chat-pending-footer__remain-dot {
    animation: none;
  }

  .chat-pending-bar::after {
    transition: none;
  }
}

@keyframes pending-bg-shift {
  0% { transform: scale(1) rotate(0deg); }
  100% { transform: scale(1.1) rotate(2deg); }
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

@media (hover: none) {
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
  border: 1px dashed rgb(var(--color-line-strong) / 0.85);
  background: linear-gradient(180deg, rgb(var(--color-vellum) / 0.86), rgb(var(--color-cream) / 0.94));
  color: rgb(var(--color-ink));
  cursor: pointer;
  text-align: left;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
  -webkit-tap-highlight-color: transparent;
}

.chat-continuation-chip:hover {
  border-color: rgb(var(--color-accent) / 0.6);
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
  color: rgb(var(--color-accent));
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
  transition: opacity 320ms ease;
}

.chat-image-fade--loading {
  opacity: 0;
}

.chat-image-fade--ready {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .chat-action-chip,
  .chat-retry-chip,
  .chat-image-placeholder__loader span,
  .chat-bubble-assistant img,
  .chat-image-fade {
    transition: none;
    animation: none;
  }
}
</style>
