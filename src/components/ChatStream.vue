<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import ChatBubble from './ChatBubble.vue'
import Icon from './Icon.vue'
import StyleSwatch from './StyleSwatch.vue'
import { styleOptions } from '../presets'
import type { ChatMessage, GeneratedImage, ImageStyle } from '../types'

interface Props {
  messages: ChatMessage[]
  bottomPadding?: number
  jumpBottom?: number
}

const props = withDefaults(defineProps<Props>(), {
  bottomPadding: 200,
  jumpBottom: 14,
})

const emit = defineEmits<{
  (e: 'retry', id: string): void
  (e: 'open-image', images: GeneratedImage[], index: number): void
  (e: 'download', image: GeneratedImage, index: number): void
  (e: 'copy', text: string, message: string): void
  (e: 'pick-suggestion', style: ImageStyle): void
}>()

const scrollerRef = ref<HTMLDivElement | null>(null)
const stuckToBottom = ref(true)

// 空状态展示前 4 个风格作为快速起点
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

// 同一条 assistant 消息从 pending → success/error 也应触发滚动
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

defineExpose({ scrollToBottom })
</script>

<template>
  <div class="chat-stream relative h-full">
    <div
      ref="scrollerRef"
      class="chat-stream__scroller"
      :style="{ paddingBottom: `${bottomPadding}px` }"
      role="log"
      aria-live="polite"
      aria-label="对话流"
      @scroll.passive="onScroll"
    >
      <div
        v-if="messages.length === 0"
        class="flex min-h-full flex-col items-center justify-center px-5 pb-8 pt-10 text-center"
      >
        <div
          class="mb-5 grid h-12 w-12 place-items-center rounded-full border border-line-strong/60 bg-vellum text-ink shadow-inner-paper"
          aria-hidden="true"
        >
          <Icon name="sparkle" :size="20" />
        </div>
        <p class="font-display text-2xl italic tracking-tightish text-ink/85">画点什么呢？</p>
        <p class="mt-2 max-w-[24ch] text-[13px] leading-6 text-muted">
          写一段画面描述，或者从下面挑一种风格作为起点。
        </p>

        <ul class="mt-6 grid w-full max-w-sm grid-cols-2 gap-2">
          <li v-for="item in suggestionStyles" :key="item.value">
            <button
              type="button"
              class="group flex w-full items-center gap-3 rounded-2xl border border-line bg-cream p-2.5 text-left transition hover:-translate-y-px hover:border-line-strong hover:bg-paper-soft"
              @click="emit('pick-suggestion', item.value)"
            >
              <StyleSwatch :variant="item.value" :size="36" />
              <span class="min-w-0 flex-1">
                <span class="block text-[13px] font-medium leading-tight text-ink">{{ item.label }}</span>
                <span class="mt-0.5 block text-[11px] leading-snug text-muted">{{ item.accent }}</span>
              </span>
            </button>
          </li>
        </ul>
      </div>

      <ol v-else class="flex flex-col gap-4 px-4 pt-4 sm:px-6">
        <li v-for="message in messages" :key="message.id" class="chat-stream__item reveal">
          <ChatBubble
            :message="message"
            @retry="(id) => emit('retry', id)"
            @open-image="(images, index) => emit('open-image', images, index)"
            @download="(image, index) => emit('download', image, index)"
            @copy="(text, msg) => emit('copy', text, msg)"
          />
        </li>
      </ol>
    </div>

    <button
      v-if="!stuckToBottom && messages.length > 0"
      type="button"
      class="chat-stream__jump"
      :style="{ bottom: `${jumpBottom}px` }"
      aria-label="滚动到底部"
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
  /* 顶部留出 header 高度的呼吸空间，底部由 prop 控制以避开 dock */
  padding-top: 0.25rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(26, 22, 18, 0.18) transparent;
}

.chat-stream__scroller::-webkit-scrollbar {
  width: 6px;
}

.chat-stream__scroller::-webkit-scrollbar-thumb {
  background: rgba(26, 22, 18, 0.18);
  border-radius: 999px;
}

.chat-stream__item {
  --reveal-delay: 0ms;
}

.chat-stream__jump {
  position: absolute;
  right: 14px;
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid #c8b89a;
  background: rgba(253, 248, 237, 0.95);
  color: #1a1612;
  box-shadow: 0 1px 0 rgba(26, 22, 18, 0.06), 0 12px 24px -16px rgba(26, 22, 18, 0.32);
  backdrop-filter: blur(8px);
  transition: transform 160ms ease, background-color 160ms ease;
}

.chat-stream__jump:hover {
  transform: translateY(-1px);
  background: #fdf8ed;
}

@media (prefers-reduced-motion: reduce) {
  .chat-stream__scroller {
    scroll-behavior: auto;
  }

  .chat-stream__jump {
    transition: none;
  }
}
</style>
