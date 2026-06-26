<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import ChatBubble from './ChatBubble.vue'
import Icon from './Icon.vue'
import { useI18n } from '../lib/i18n'
import type { ChatMessage, GeneratedImage, GenerationHistoryItem } from '../types'

interface Props {
  messages: ChatMessage[]
  mobileBottomPadding?: number
  jumpBottom?: number
  providerConfigured?: boolean
  history?: GenerationHistoryItem[]
  canEditImages?: boolean
  imageEditDisabledReason?: string
  hasPrompt?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  mobileBottomPadding: 200,
  jumpBottom: 14,
  providerConfigured: true,
  history: () => [] as GenerationHistoryItem[],
  canEditImages: true,
  imageEditDisabledReason: '',
  hasPrompt: false,
})

const VIRTUALIZE_THRESHOLD = 24
const KEEP_LIVE_TAIL = 8

function estimateMessageHeight(message: ChatMessage): number {
  if (message.role === 'user') {
    const text = message.content || ''
    const lines = Math.max(1, Math.ceil(text.length / 28))
    const refs = message.referenceImages?.length ?? 0
    return Math.min(360, 60 + lines * 22) + (refs > 0 ? (refs > 1 ? 200 : 110) : 0)
  }

  const size = message.meta.size
  const portraitH = size === '1024x1536' ? 460 : size === '1536x1024' ? 300 : 380
  if (message.status === 'pending') return portraitH + 24
  if (message.status === 'error') return 140
  const count = message.images?.length ?? 0
  if (count <= 1) return portraitH + 80
  return Math.round(portraitH * 1.05) + 80
}

const emit = defineEmits<{
  (e: 'retry', id: string): void
  (e: 'open-image', images: GeneratedImage[], index: number): void
  (e: 'edit-image', images: GeneratedImage[], index: number): void
  (e: 'continue-image', images: GeneratedImage[], index: number, messageId: string, prompt: string): void
  (e: 'download', image: GeneratedImage, index: number): void
  (e: 'copy', text: string, message: string): void
  (e: 'image-edit-unavailable', reason?: string): void
  (e: 'import-prompt', text: string): void
  (e: 'scroll-to-message', id: string): void
  (e: 'abort', id: string): void
  (e: 'open-settings'): void
  (e: 'generate'): void
  (e: 'go-compose'): void
}>()

const scrollerRef = ref<HTMLDivElement | null>(null)
const stuckToBottom = ref(true)
const { t } = useI18n()

function shouldVirtualize(index: number, total: number): boolean {
  if (total < VIRTUALIZE_THRESHOLD) return false
  return index < total - KEEP_LIVE_TAIL
}

function isNearBottom(el: HTMLElement, threshold = 120) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}

function scrollToBottom(smooth = true) {
  const el = scrollerRef.value
  if (!el) return
  el.scrollTo({
    top: el.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  })
}

const flashedMessageIds = ref<Record<string, boolean>>({})

function scrollToMessage(id: string) {
  const el = scrollerRef.value
  if (!el) return
  const target = el.querySelector(`[data-message-id="${CSS.escape(id)}"]`) as HTMLElement | null
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  flashedMessageIds.value = { ...flashedMessageIds.value, [id]: true }
  window.setTimeout(() => {
    const next = { ...flashedMessageIds.value }
    delete next[id]
    flashedMessageIds.value = next
  }, 1600)
}

function onScroll() {
  const el = scrollerRef.value
  if (!el) return
  stuckToBottom.value = isNearBottom(el)
}

watch(
  () => props.messages.length,
  () => {
    if (!stuckToBottom.value) return
    nextTick(() => scrollToBottom(true))
  },
)

watch(
  () =>
    props.messages.map((message) =>
      message.role === 'assistant' ? `${message.id}:${message.status}:${message.images?.length ?? 0}` : message.id,
    ).join('|'),
  () => {
    if (!stuckToBottom.value) return
    nextTick(() => scrollToBottom(true))
  },
)

onMounted(() => {
  nextTick(() => scrollToBottom(false))
})

defineExpose({ scrollToBottom, scrollToMessage })
</script>

<template>
  <div class="chat-stream relative h-full">
    <div
      ref="scrollerRef"
      class="chat-stream__scroller"
      :style="{
        paddingBottom: `${mobileBottomPadding}px`,
        '--chat-stream-bottom-padding': `${mobileBottomPadding}px`,
      }"
      role="log"
      aria-live="polite"
      :aria-label="t('stream.label')"
      @scroll.passive="onScroll"
    >
      <div
        v-if="messages.length === 0"
        class="chat-stream__empty"
      >
        <div
          class="empty-studio-mark mb-5 grid h-14 w-14 place-items-center overflow-hidden rounded-[1.35rem] border border-line-strong/60 bg-vellum text-ink shadow-inner-paper"
          aria-hidden="true"
        >
          <img src="/brand/promptcanvas-icon-96.png" alt="" width="56" height="56" decoding="async" />
        </div>

        <template v-if="!providerConfigured">
          <p class="chat-stream__empty-title text-ink/85">{{ t('stream.empty.unconfigured.title') }}</p>
          <p class="chat-stream__empty-copy">
            {{ t('stream.empty.unconfigured.body') }}
          </p>
          <button
            type="button"
            class="empty-cta chat-stream__empty-cta"
            @click="emit('open-settings')"
          >
            <Icon name="settings" :size="14" />
            <span>{{ t('stream.empty.unconfigured.cta') }}</span>
            <Icon name="arrowRight" :size="14" />
          </button>
          <p class="chat-stream__empty-meta">
            proxy · likeyou.qzz.io
          </p>
        </template>

        <template v-else>
          <p class="chat-stream__empty-title">
            <span class="empty-title-text">{{ t('stream.empty.title') }}</span>
          </p>
          <p class="chat-stream__empty-copy">
            {{ t('stream.empty.body') }}
          </p>
          <button
            v-if="hasPrompt"
            type="button"
            class="empty-cta chat-stream__empty-cta"
            @click="emit('generate')"
          >
            <Icon name="lightning" :size="14" />
            <span>{{ t('stream.empty.generate') }}</span>
          </button>
          <button
            v-else
            type="button"
            class="chat-stream__empty-cta chat-stream__empty-cta--ghost"
            @click="emit('go-compose')"
          >
            <Icon name="textCursor" :size="14" />
            <span>{{ t('stream.empty.goCompose') }}</span>
          </button>
        </template>
      </div>

      <ol v-else class="chat-stream__list flex flex-col gap-4 px-4 pt-4 sm:px-6">
        <li
          v-for="(message, index) in messages"
          :key="message.id"
          class="chat-stream__item reveal"
          :class="[
            shouldVirtualize(index, messages.length) ? 'chat-stream__item--virtual' : null,
            flashedMessageIds[message.id] ? 'chat-stream__item--flash' : null,
          ]"
          :style="shouldVirtualize(index, messages.length) ? { '--cv-size': `${estimateMessageHeight(message)}px` } : undefined"
          :data-message-id="message.id"
        >
          <ChatBubble
            :message="message"
            :history="history"
            :can-edit-images="canEditImages"
            :image-edit-disabled-reason="imageEditDisabledReason"
            v-memo="[
              message.id,
              message.role,
              message.role === 'assistant' ? message.status : '',
              message.role === 'assistant' ? message.elapsedSeconds ?? 0 : 0,
              message.role === 'assistant' ? message.images?.length ?? 0 : message.referenceImages?.length ?? 0,
              canEditImages,
              imageEditDisabledReason,
            ]"
            @retry="(id) => emit('retry', id)"
            @open-image="(images, idx) => emit('open-image', images, idx)"
            @edit-image="(images, idx) => emit('edit-image', images, idx)"
            @continue-image="(images, idx, messageId, prompt) => emit('continue-image', images, idx, messageId, prompt)"
            @download="(image, idx) => emit('download', image, idx)"
            @copy="(text, msg) => emit('copy', text, msg)"
            @image-edit-unavailable="(reason) => emit('image-edit-unavailable', reason)"
            @import-prompt="(text) => emit('import-prompt', text)"
            @scroll-to-message="(id) => emit('scroll-to-message', id)"
            @abort="(id) => emit('abort', id)"
          />
        </li>
      </ol>
    </div>

    <button
      v-if="!stuckToBottom && messages.length > 0"
      type="button"
      class="chat-stream__jump"
      :style="{ bottom: `${jumpBottom}px` }"
      :aria-label="t('stream.jump')"
      @click="scrollToBottom(true)"
    >
      <Icon name="arrowDown" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.chat-stream {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.chat-stream__scroller {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
  scroll-padding-bottom: calc(var(--chat-stream-bottom-padding, 200px) + 1rem);
  padding-top: 0.25rem;
  scrollbar-width: thin;
  scrollbar-color: rgb(var(--color-ink) / 0.18) transparent;
}

.chat-stream__scroller::-webkit-scrollbar {
  width: 6px;
}

.chat-stream__scroller::-webkit-scrollbar-thumb {
  background: rgb(var(--color-ink) / 0.18);
  border-radius: 999px;
}

.chat-stream__empty {
  display: flex;
  min-block-size: max(220px, calc(100% - var(--chat-stream-bottom-padding, 200px)));
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: clamp(1.5rem, 7svh, 3.5rem) 1.25rem 1.5rem;
  text-align: center;
}

.chat-stream__empty-title {
  margin: 0;
  color: rgb(var(--color-ink));
  font-family: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 1.62rem;
  font-weight: 720;
  letter-spacing: 0;
  line-height: 1.12;
  text-wrap: balance;
}

.empty-title-text {
  color: rgb(var(--color-accent));
}

.chat-stream__empty-copy {
  max-width: 30ch;
  margin: 0.65rem 0 0;
  color: rgb(var(--color-muted));
  font-size: 13.5px;
  line-height: 1.58;
  text-wrap: pretty;
}

.chat-stream__empty-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 46px;
  margin-top: 1.25rem;
  border-radius: 10px;
  padding: 0 1rem;
  color: white;
  font-size: 13.5px;
  font-weight: 720;
}

.chat-stream__empty-cta:active {
  transform: scale(0.97);
}

/* Ghost variant — secondary CTA for the "go compose" path */
.chat-stream__empty-cta--ghost {
  color: rgb(var(--color-ink));
  background: rgb(var(--color-surface-raised) / 0.62);
  border: 1px solid rgb(var(--color-line-strong) / 0.6);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  box-shadow: var(--shadow-inner-glass);
  transition:
    transform 140ms var(--motion-press),
    border-color 160ms var(--motion-soft),
    background-color 160ms var(--motion-soft);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.chat-stream__empty-cta--ghost:hover {
  border-color: rgb(var(--color-accent) / 0.5);
  background: rgb(var(--color-vellum) / 0.85);
}

.chat-stream__empty-meta {
  margin: 0.75rem 0 0;
  color: rgb(var(--color-muted) / 0.72);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0;
}

.chat-stream__list {
  min-width: 0;
  padding-bottom: 0;
}

.chat-stream__item {
  --reveal-delay: 0ms;
  contain: content;
}

.chat-stream__item--virtual {
  content-visibility: auto;
  contain-intrinsic-size: 0 var(--cv-size, 360px);
}

.chat-stream__item--flash {
  position: relative;
  animation: chat-stream-flash 1.4s ease-out;
}

@keyframes chat-stream-flash {
  0% {
    box-shadow: 0 0 0 0 rgb(var(--color-accent) / 0);
  }
  18% {
    box-shadow: 0 0 0 4px rgb(var(--color-accent) / 0.22);
  }
  100% {
    box-shadow: 0 0 0 0 rgb(var(--color-accent) / 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-stream__item--flash {
    animation: none;
  }
}

.empty-studio-mark {
  position: relative;
  background: rgb(var(--color-surface-raised));
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-glass-sm), var(--shadow-inner-glass);
}

.empty-studio-mark::after {
  content: '';
  position: absolute;
  inset: -8px;
  z-index: -1;
  border-radius: inherit;
  background: rgb(var(--color-action) / 0.1);
  filter: blur(12px);
  opacity: 0.36;
}

/* ─── Empty-state primary CTA (unconfigured) — gradient pill ─── */
.empty-cta {
  background: var(--gradient-primary);
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent);
  transition:
    transform 140ms var(--motion-press),
    box-shadow 200ms var(--motion-soft);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.empty-cta:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-glass-lg), 0 0 28px -6px rgb(var(--color-accent) / 0.4);
}

.chat-stream__jump {
  position: fixed;
  right: max(14px, env(safe-area-inset-right, 0px));
  z-index: 44;
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.4);
  background: rgb(var(--color-ivory) / 0.6);
  color: rgb(var(--color-ink));
  box-shadow: var(--shadow-glass-lg), var(--shadow-inner-glass);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  transition: transform 180ms var(--motion-soft), background-color 160ms var(--motion-soft), box-shadow 200ms var(--motion-soft);
  touch-action: manipulation;
}

.chat-stream__jump:hover {
  transform: translateY(-2px);
  border-color: rgb(var(--color-accent) / 0.4);
  box-shadow: var(--shadow-glass-lg), var(--shadow-glow-accent);
}

.chat-stream__jump:active {
  transform: scale(0.92);
}

@media (max-width: 639px) {
  .chat-stream__scroller {
    padding-top: 0;
    scrollbar-width: none;
  }

  .chat-stream__scroller::-webkit-scrollbar {
    display: none;
  }

  .chat-stream__empty {
    justify-content: center;
    padding: clamp(1.25rem, 6svh, 2.5rem) 1rem 1.25rem;
  }

  .empty-studio-mark {
    width: 52px;
    height: 52px;
    margin-bottom: 1rem;
    border-radius: 14px;
  }

  .empty-studio-mark::after {
    opacity: 0.42;
  }

  .chat-stream__empty-title {
    max-width: 16ch;
    font-size: 1.38rem;
    line-height: 1.12;
    letter-spacing: 0;
  }

  .chat-stream__empty-copy {
    max-width: 30ch;
    font-size: 13px;
    line-height: 1.65;
  }

  .chat-stream__empty-cta {
    width: min(100%, 240px);
  }

  .chat-stream__list {
    gap: 0.9rem;
    padding: 0.75rem 0.75rem 0;
  }

  .chat-stream__jump {
    width: 42px;
    height: 42px;
    right: max(10px, env(safe-area-inset-right, 0px));
  }
}

@media (max-width: 1023px) and (max-height: 540px) and (orientation: landscape) {
  .chat-stream__empty {
    min-block-size: max(160px, calc(100% - var(--chat-stream-bottom-padding, 180px)));
    padding-block: 0.75rem;
  }

  .empty-studio-mark {
    width: 44px;
    height: 44px;
    margin-bottom: 0.7rem;
  }

  .chat-stream__empty-title {
    max-width: 24ch;
    font-size: 1.2rem;
  }

  .chat-stream__empty-copy {
    max-width: 42ch;
    margin-top: 0.45rem;
    font-size: 12.5px;
    line-height: 1.45;
  }

  .chat-stream__empty-cta {
    min-height: 38px;
    margin-top: 0.8rem;
  }

  .chat-stream__empty-meta {
    margin-top: 0.45rem;
  }

}

@media (prefers-reduced-motion: reduce) {
  .chat-stream__scroller {
    scroll-behavior: auto;
  }

  .empty-studio-mark::after {
    animation: none;
  }

  .empty-cta,
  .chat-stream__jump {
    transition: none;
  }
}
</style>
