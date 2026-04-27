<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import { resolveImageSource } from '../api'
import { styleOptions } from '../presets'
import type { ChatMessage, GeneratedImage } from '../types'

const rewriteOpen = ref(false)

interface Props {
  message: ChatMessage
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'retry', id: string): void
  (e: 'open-image', images: GeneratedImage[], index: number): void
  (e: 'download', image: GeneratedImage, index: number): void
  (e: 'copy', text: string, message: string): void
}>()

function openImage(index: number) {
  if (props.message.role !== 'assistant') return
  const images = props.message.images ?? []
  if (!images.length) return
  emit('open-image', images, Math.max(0, Math.min(index, images.length - 1)))
}

const isUser = computed(() => props.message.role === 'user')

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
</script>

<template>
  <article
    class="chat-bubble-row flex w-full"
    :class="isUser ? 'justify-end' : 'justify-start'"
    :data-role="message.role"
  >
    <!-- 用户消息 -->
    <div v-if="message.role === 'user'" class="flex max-w-[86%] flex-col items-end gap-1.5">
      <div
        class="chat-bubble-user rounded-[22px] rounded-br-[8px] bg-ink px-4 py-2.5 text-[15px] leading-6 text-paper shadow-paper-2"
      >
        <p class="whitespace-pre-wrap break-words">{{ message.content }}</p>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        <button
          v-if="message.rewrittenPrompt"
          type="button"
          class="chat-rewrite-chip"
          :aria-expanded="rewriteOpen"
          @click="rewriteOpen = !rewriteOpen"
        >
          <Icon name="sparkle" :size="10" />
          <span>{{ rewriteOpen ? '收起优化' : '已优化' }}</span>
          <span v-if="message.rewriteModel" class="text-paper/50">· {{ message.rewriteModel }}</span>
        </button>
        <span>{{ styleLabel }}</span>
        <span class="text-line">·</span>
        <span>{{ message.meta.size }}</span>
        <span v-if="message.meta.count > 1" class="text-line">·</span>
        <span v-if="message.meta.count > 1">×{{ message.meta.count }}</span>
        <span v-if="timeLabel" class="text-line">·</span>
        <span v-if="timeLabel" class="tracking-normal">{{ timeLabel }}</span>
      </div>
      <Transition name="rewrite-acc">
        <div
          v-if="message.rewrittenPrompt && rewriteOpen"
          class="chat-rewrite-panel max-w-full self-end rounded-2xl rounded-br-[8px] border border-line bg-vellum/95 p-3 text-[12px] leading-[1.7] text-ink shadow-paper-1"
        >
          <div class="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            <Icon name="sparkle" :size="10" />
            <span>改写后交给模型的提示词</span>
            <button
              type="button"
              class="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-muted transition hover:bg-paper-soft hover:text-ink"
              @click="emit('copy', message.rewrittenPrompt ?? '', '已复制优化后提示词')"
            >
              <Icon name="copy" :size="10" />
              复制
            </button>
          </div>
          <p class="whitespace-pre-wrap break-words">{{ message.rewrittenPrompt }}</p>
        </div>
      </Transition>
    </div>

    <!-- 助手消息 -->
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
      </div>

      <!-- pending：骨架 -->
      <div
        v-if="message.status === 'pending'"
        class="chat-bubble-assistant relative w-full overflow-hidden rounded-[22px] rounded-bl-[8px] border border-line bg-vellum p-3 shadow-paper-2"
        role="status"
        aria-live="polite"
      >
        <div class="skeleton w-full rounded-2xl" :class="previewFrameClass"></div>
        <div
          class="pointer-events-none absolute inset-x-5 top-5 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-muted"
        >
          <span class="font-mono">composing</span>
          <span v-if="typeof message.elapsedSeconds === 'number'" class="font-mono tabular-nums">
            {{ String(message.elapsedSeconds).padStart(2, '0') }}s
          </span>
        </div>
      </div>

      <!-- error：失败气泡 + 重试 chip -->
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

      <!-- success：图片网格 -->
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
            <div class="grid place-items-center" :class="previewFrameClass">
              <img
                :src="resolveImageSource(image)"
                :alt="`生成图片 ${index + 1}`"
                loading="lazy"
                decoding="async"
                class="h-full w-full object-contain"
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

.chat-rewrite-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  border: 1px solid #1a1612;
  background: #1a1612;
  color: #fdf8ed;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: transform 140ms ease, opacity 140ms ease;
}

.chat-rewrite-chip:hover {
  transform: translateY(-1px);
  opacity: 0.92;
}

.chat-rewrite-panel {
  width: min(560px, 100%);
}

.rewrite-acc-enter-from,
.rewrite-acc-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  max-height: 0;
}

.rewrite-acc-enter-to,
.rewrite-acc-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 600px;
}

.rewrite-acc-enter-active,
.rewrite-acc-leave-active {
  transition:
    opacity 0.22s ease-out,
    transform 0.22s ease-out,
    max-height 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
  overflow: hidden;
}

.chat-action-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  border: 1px solid #dfd3bf;
  background: #faf3e6;
  color: #1a1612;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.01em;
  transition: border-color 140ms ease, background-color 140ms ease, transform 140ms ease;
}

.chat-action-chip:hover {
  border-color: #c8b89a;
  background: #fdf8ed;
  transform: translateY(-1px);
}

.chat-action-chip:active {
  transform: translateY(0);
}

.chat-retry-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  border: 1px solid currentColor;
  background: rgba(154, 58, 28, 0.08);
  color: #9a3a1c;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: background-color 140ms ease, transform 140ms ease;
}

.chat-retry-chip:hover {
  background: rgba(154, 58, 28, 0.16);
  transform: translateY(-1px);
}

.chat-retry-chip:active {
  transform: translateY(0);
}

.chat-retry-chip--quiet {
  border-color: rgba(154, 58, 28, 0.4);
  background: transparent;
  font-weight: 500;
}

@media (prefers-reduced-motion: reduce) {
  .chat-action-chip,
  .chat-retry-chip {
    transition: none;
  }
}
</style>
