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
  (e: 'remix', image: GeneratedImage, prompt: string): void
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
            <div class="chat-pending-grain absolute inset-0"></div>
            
            <div class="absolute inset-0 flex items-center justify-center overflow-hidden">
              <svg class="chat-pending-weave w-full h-full" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                <g filter="url(#glow)">
                  <path class="weave-path" d="M30,100 Q65,40 100,100 T170,100" fill="none" stroke="currentColor" stroke-width="0.5" stroke-opacity="0.3" />
                  <path class="weave-path delay-1" d="M30,100 Q65,160 100,100 T170,100" fill="none" stroke="currentColor" stroke-width="0.5" stroke-opacity="0.2" />
                  <circle class="weave-dot" cx="100" cy="100" r="1.5" fill="currentColor" fill-opacity="0.6" />
                </g>
              </svg>
            </div>

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
          <button
            v-for="(image, index) in message.images"
            :key="image.id || index"
            type="button"
            class="group relative overflow-hidden rounded-2xl border border-line/70 bg-paper-soft transition hover:-translate-y-px hover:border-line-strong hover:shadow-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
            :aria-label="`查看第 ${index + 1} 张图片`"
            @click="openImage(index)"
          >
            <div class="relative grid place-items-center bg-paper/45" :class="previewFrameClass">
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
                class="chat-image-fade h-full w-full object-contain will-change-[opacity,transform,filter]"
                :class="isImageReady(image, index) ? 'chat-image-fade--ready' : 'chat-image-fade--loading'"
                @load="markImageReady(image, index)"
                @error="markImageReady(image, index)"
              />
            </div>
            <span
              class="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between rounded-xl bg-ink/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-paper opacity-0 backdrop-blur transition group-hover:opacity-100"
            >
              <span>{{ index + 1 }} / {{ message.images?.length }}</span>
              <span>{{ message.meta.size }}</span>
            </span>
          </button>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-1.5 px-1">
          <button
            type="button"
            class="chat-action-chip chat-action-chip--primary"
            aria-label="重混：以此图为参考并复用提示词"
            @click="message.images && message.images[0] && emit('remix', message.images[0], message.content)"
          >
            <Icon name="sparkle" :size="12" />
            <span>重混</span>
          </button>
          <button
            type="button"
            class="chat-action-chip"
            aria-label="下载第一张"
            @click="message.images && message.images[0] && emit('download', message.images[0], 0)"
          >
            <Icon name="download" :size="12" />
            <span>下载</span>
          </button>
          <button
            type="button"
            class="chat-action-chip"
            aria-label="放大查看"
            @click="openImage(0)"
          >
            <Icon name="zoomIn" :size="12" />
            <span>放大</span>
          </button>
          <button
            type="button"
            class="chat-action-chip"
            aria-label="重新生成相同提示词"
            @click="emit('retry', message.replyTo)"
          >
            <Icon name="refresh" :size="12" />
            <span>再画一张</span>
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

.chat-pending-grain {
  opacity: 0.08;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.chat-pending-weave {
  transform: scale(1.4);
  color: rgb(var(--color-ink));
}

.weave-path {
  stroke-dasharray: 200;
  stroke-dashoffset: 200;
  animation: weave-flow 4s linear infinite;
}

.weave-path.delay-1 {
  animation-delay: -2s;
}

.weave-dot {
  animation: weave-dot-pulse 2s ease-in-out infinite;
}

.chat-pending-manifest {
  text-align: center;
  animation: manifest-float 5s ease-in-out infinite;
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

@keyframes pending-bg-shift {
  0% { transform: scale(1) rotate(0deg); }
  100% { transform: scale(1.1) rotate(2deg); }
}

@keyframes weave-flow {
  0% { stroke-dashoffset: 200; opacity: 0; }
  10% { opacity: 0.3; }
  90% { opacity: 0.3; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}

@keyframes weave-dot-pulse {
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(1.5); opacity: 0.8; }
}

@keyframes manifest-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@media (prefers-reduced-motion: reduce) {
  .chat-pending-orb,
  .chat-pending-orb__ring,
  .chat-pending-orb__halo {
    animation: none;
  }
  .chat-pending-progress__bar,
  .chat-pending-progress__glow {
    transition: none;
  }
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

@keyframes chat-pending-scan {
  0% {
    transform: translateY(-36%) scale(0.94);
    opacity: 0;
  }

  18% {
    opacity: 1;
  }

  72% {
    opacity: 0.8;
  }

  100% {
    transform: translateY(170%) scale(1.08);
    opacity: 0;
  }
}

@keyframes chat-pending-bars {
  0%,
  100% {
    transform: scaleY(0.42);
    opacity: 0.5;
  }

  50% {
    transform: scaleY(1);
    opacity: 1;
  }
}

@keyframes chat-pending-ring {
  0% {
    transform: scale(0.62);
    opacity: 0;
  }

  18% {
    opacity: 0.85;
  }

  100% {
    transform: scale(1.26);
    opacity: 0;
  }
}

@keyframes chat-pending-orb-float {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-6px);
  }
}

@keyframes chat-pending-halo {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
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
  transition:
    opacity 800ms cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 1000ms cubic-bezier(0.2, 0.8, 0.2, 1),
    filter 900ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.chat-image-fade--loading {
  opacity: 0;
  transform: scale(0.96);
  filter: blur(12px) saturate(0.5);
}

.chat-image-fade--ready {
  opacity: 1;
  transform: scale(1);
  filter: blur(0) saturate(1);
}

@media (prefers-reduced-motion: reduce) {
  .chat-action-chip,
  .chat-retry-chip,
  .chat-pending-frame__scan::before,
  .chat-pending-bars span,
  .chat-pending-orb__ring,
  .chat-image-placeholder__loader span,
  .chat-bubble-assistant img,
  .chat-image-fade {
    transition: none;
    animation: none;
  }

  .chat-image-fade--loading {
    filter: none;
    transform: none;
  }
}
</style>
