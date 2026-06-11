<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import ChatBubble from './ChatBubble.vue'
import Icon from './Icon.vue'
import StyleSwatch from './StyleSwatch.vue'
import { styleOptions } from '../presets'
import { useI18n } from '../lib/i18n'
import type { ChatMessage, GeneratedImage, GenerationHistoryItem, ImageStyle } from '../types'

interface Props {
  messages: ChatMessage[]
  mobileBottomPadding?: number
  jumpBottom?: number
  providerConfigured?: boolean
  history?: GenerationHistoryItem[]
}

const props = withDefaults(defineProps<Props>(), {
  mobileBottomPadding: 200,
  jumpBottom: 14,
  providerConfigured: true,
  history: () => [] as GenerationHistoryItem[],
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
  (e: 'download', image: GeneratedImage, index: number): void
  (e: 'copy', text: string, message: string): void
  (e: 'remix', image: GeneratedImage, prompt: string, messageId: string, imageIndex: number): void
  (e: 'import-prompt', text: string): void
  (e: 'pick-suggestion', style: ImageStyle): void
  (e: 'scroll-to-message', id: string): void
  (e: 'abort', id: string): void
  (e: 'open-settings'): void
}>()

const scrollerRef = ref<HTMLDivElement | null>(null)
const stuckToBottom = ref(true)
const { t } = useI18n()

function shouldVirtualize(index: number, total: number): boolean {
  if (total < VIRTUALIZE_THRESHOLD) return false
  return index < total - KEEP_LIVE_TAIL
}

const suggestionStyles = computed(() => styleOptions.slice(0, 4))

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
      :style="{ paddingBottom: `${mobileBottomPadding}px` }"
      role="log"
      aria-live="polite"
      :aria-label="t('stream.label')"
      @scroll.passive="onScroll"
    >
      <div
        v-if="messages.length === 0"
        class="flex min-h-full flex-col items-center justify-center px-5 pb-8 pt-10 text-center"
      >
        <div
          class="empty-studio-mark mb-5 grid h-14 w-14 place-items-center overflow-hidden rounded-[1.35rem] border border-line-strong/60 bg-vellum text-ink shadow-inner-paper"
          aria-hidden="true"
        >
          <img src="/brand/promptcanvas-icon-96.png" alt="" width="56" height="56" decoding="async" />
        </div>

        <template v-if="!providerConfigured">
          <p class="font-display text-[1.75rem] italic leading-tight tracking-tightish text-ink/85">{{ t('stream.empty.unconfigured.title') }}</p>
          <p class="mt-2.5 max-w-[28ch] text-[13.5px] leading-6 text-muted">
            {{ t('stream.empty.unconfigured.body') }}
          </p>
          <button
            type="button"
            class="empty-cta mt-6 inline-flex min-h-[48px] items-center gap-2 rounded-full px-5 text-[13.5px] font-semibold text-white active:scale-[0.97]"
            @click="emit('open-settings')"
          >
            <Icon name="settings" :size="14" />
            <span>{{ t('stream.empty.unconfigured.cta') }}</span>
            <Icon name="arrowRight" :size="14" />
          </button>
          <p class="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted/70">
            proxy · likeyou.qzz.io
          </p>
        </template>

        <template v-else>
          <p class="font-display text-[1.75rem] italic leading-tight tracking-tightish">
            <span class="gradient-text">{{ t('stream.empty.title') }}</span>
          </p>
          <p class="mt-2.5 max-w-[26ch] text-[13.5px] leading-6 text-muted">
            {{ t('stream.empty.body') }}
          </p>

          <ul class="empty-suggestions mt-7 grid w-full max-w-sm grid-cols-1 gap-2.5 min-[380px]:grid-cols-2">
            <li v-for="item in suggestionStyles" :key="item.value">
              <button
                type="button"
                class="empty-suggestion group flex w-full items-center gap-3 p-3 text-left"
                @click="emit('pick-suggestion', item.value)"
              >
                <StyleSwatch :variant="item.value" :size="38" />
                <span class="min-w-0 flex-1">
                  <span class="block text-[13.5px] font-semibold leading-tight text-ink">{{ item.label }}</span>
                  <span class="mt-0.5 block text-[11.5px] leading-snug text-muted">{{ item.accent }}</span>
                </span>
                <Icon name="arrowRight" :size="13" class="empty-suggestion__arrow shrink-0 text-muted" />
              </button>
            </li>
          </ul>
        </template>
      </div>

      <ol v-else class="flex flex-col gap-4 px-4 pt-4 sm:px-6">
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
            v-memo="[
              message.id,
              message.role,
              message.role === 'assistant' ? message.status : '',
              message.role === 'assistant' ? message.elapsedSeconds ?? 0 : 0,
              message.role === 'assistant' ? message.images?.length ?? 0 : message.referenceImages?.length ?? 0,
            ]"
            @retry="(id) => emit('retry', id)"
            @open-image="(images, idx) => emit('open-image', images, idx)"
            @download="(image, idx) => emit('download', image, idx)"
            @copy="(text, msg) => emit('copy', text, msg)"
            @remix="(image, content, idx) => emit('remix', image, content, message.id, idx)"
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
  min-height: 0;
}

.chat-stream__scroller {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
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
  background:
    var(--gradient-surface),
    radial-gradient(circle at 30% 20%, rgb(var(--color-accent) / 0.22), transparent 58%);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  box-shadow: var(--shadow-glass), var(--shadow-inner-glass);
}

/* iridescent halo behind the brand mark */
.empty-studio-mark::after {
  content: '';
  position: absolute;
  inset: -8px;
  z-index: -1;
  border-radius: inherit;
  background: conic-gradient(
    from 0deg,
    rgb(var(--color-accent) / 0.28),
    rgb(var(--color-blueprint) / 0.22),
    rgb(var(--color-forest) / 0.2),
    rgb(var(--color-accent) / 0.28)
  );
  filter: blur(14px);
  opacity: 0.7;
  animation: empty-mark-spin 14s linear infinite;
}

@keyframes empty-mark-spin {
  to { transform: rotate(360deg); }
}

/* ─── Empty-state suggestion cards — glass tiles ─── */
.empty-suggestion {
  position: relative;
  min-height: 64px;
  border-radius: var(--radius-card);
  border: 1px solid rgb(var(--color-line) / 0.4);
  background: rgb(var(--color-ivory) / 0.5);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  box-shadow: var(--shadow-glass-sm), var(--shadow-inner-glass);
  transition:
    transform 180ms var(--motion-soft),
    border-color 180ms var(--motion-soft),
    box-shadow 200ms var(--motion-soft),
    background-color 180ms var(--motion-soft);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.empty-suggestion:hover {
  transform: translateY(-2px);
  border-color: rgb(var(--color-accent) / 0.4);
  background: rgb(var(--color-ivory) / 0.7);
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent);
}

.empty-suggestion:active {
  transform: translateY(0) scale(0.98);
}

.empty-suggestion__arrow {
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity 180ms var(--motion-soft), transform 180ms var(--motion-soft);
}

.empty-suggestion:hover .empty-suggestion__arrow {
  opacity: 1;
  transform: translateX(0);
  color: rgb(var(--color-accent));
}

/* On touch (no hover) keep the arrow softly visible as an affordance. */
@media (hover: none) {
  .empty-suggestion__arrow {
    opacity: 0.5;
    transform: translateX(0);
  }
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
  position: absolute;
  right: max(14px, env(safe-area-inset-right, 0px));
  display: inline-grid;
  place-items: center;
  width: 48px;
  height: 48px;
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
    scrollbar-width: none;
  }

  .chat-stream__scroller::-webkit-scrollbar {
    display: none;
  }

  .chat-stream__jump {
    width: 46px;
    height: 46px;
    right: max(10px, env(safe-area-inset-right, 0px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-stream__scroller {
    scroll-behavior: auto;
  }

  .empty-studio-mark::after {
    animation: none;
  }

  .empty-suggestion,
  .empty-suggestion__arrow,
  .empty-cta,
  .chat-stream__jump {
    transition: none;
  }
}
</style>
