<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import Icon from './Icon.vue'
import { resolveImageSource } from '../api'
import type { GenerationHistoryItem } from '../types'

interface Props {
  open: boolean
  history: GenerationHistoryItem[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'restore', item: GenerationHistoryItem): void
  (e: 'clear'): void
}>()

function close() {
  emit('update:open', false)
}

function handleKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function applyAndClose(item: GenerationHistoryItem) {
  emit('restore', item)
  close()
}

watch(
  () => props.open,
  (open) => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) window.addEventListener('keydown', handleKey)
    else window.removeEventListener('keydown', handleKey)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKey)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dlg-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-sheet flex items-center justify-center px-4 py-6"
        role="dialog"
        aria-modal="true"
        aria-label="历史"
        @click.self="close"
      >
        <div class="scrim" aria-hidden="true" @click="close"></div>

        <Transition name="dlg-zoom">
          <div
            v-if="open"
            class="relative flex w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-line-strong bg-vellum text-ink shadow-paper-3"
          >
            <header class="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
              <div>
                <p class="display-eyebrow">History · 最近 {{ history.length }} 条</p>
                <h2 class="mt-1.5 inline-flex items-center gap-2 font-display text-2xl tracking-tightish">
                  <Icon name="clock" :size="18" class="text-muted" />
                  <span>历史生成</span>
                </h2>
              </div>
              <div class="flex items-center gap-2">
                <button
                  v-if="history.length"
                  type="button"
                  class="btn-quiet inline-flex items-center gap-1 text-[11px]"
                  @click="emit('clear')"
                >
                  <Icon name="trash" :size="11" />
                  <span>清空</span>
                </button>
                <button type="button" class="icon-btn-sm" aria-label="关闭" @click="close">
                  <Icon name="close" :size="14" />
                </button>
              </div>
            </header>

            <div class="touch-scroll-y max-h-[70dvh] overflow-y-auto px-6 py-5">
              <ul v-if="history.length" class="space-y-2">
                <li
                  v-for="item in history"
                  :key="item.id"
                >
                  <button
                    type="button"
                    class="flex w-full items-stretch gap-3 rounded-2xl border border-line bg-cream/70 p-3 text-left transition hover:-translate-y-px hover:border-line-strong hover:bg-cream hover:shadow-paper-2"
                    @click="applyAndClose(item)"
                  >
                    <div class="shrink-0">
                      <div
                        v-if="item.images && item.images.length"
                        class="relative h-20 w-20 overflow-hidden rounded-xl border border-line bg-paper-soft sm:h-24 sm:w-24"
                      >
                        <img
                          :src="resolveImageSource(item.images[0])"
                          alt=""
                          loading="lazy"
                          decoding="async"
                          class="h-full w-full object-cover"
                          referrerpolicy="no-referrer"
                        />
                        <span
                          v-if="item.imageCount > 1"
                          class="absolute bottom-1 right-1 rounded-full bg-ink/75 px-1.5 py-px font-mono text-[9px] text-paper"
                        >
                          ×{{ item.imageCount }}
                        </span>
                      </div>
                      <div
                        v-else
                        class="grid h-20 w-20 place-items-center rounded-xl border border-dashed border-line bg-paper-soft/60 text-muted sm:h-24 sm:w-24"
                        aria-hidden="true"
                      >
                        <Icon name="frame" :size="18" />
                      </div>
                    </div>
                    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div class="flex items-center justify-between gap-2">
                        <span class="font-mono text-[10px] uppercase tracking-wider text-muted">
                          {{ formatDate(item.createdAt) }}
                        </span>
                        <span class="font-mono text-[10px] text-muted">×{{ item.imageCount }}</span>
                      </div>
                      <p class="truncate-2 text-[12px] leading-5 text-ink/85">{{ item.prompt }}</p>
                      <div
                        class="mt-auto flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted"
                      >
                        <span>{{ item.style }}</span>
                        <span class="text-line">·</span>
                        <span class="font-mono">{{ item.size }}</span>
                        <span v-if="item.referenceImageCount" class="text-line">·</span>
                        <span v-if="item.referenceImageCount">参考 {{ item.referenceImageCount }}</span>
                        <span v-if="item.seed" class="text-line">·</span>
                        <span v-if="item.seed" class="font-mono">seed {{ item.seed }}</span>
                      </div>
                    </div>
                  </button>
                </li>
              </ul>
              <p
                v-else
                class="rounded-2xl border border-dashed border-line bg-cream/40 px-4 py-6 text-center text-[12px] leading-5 text-muted"
              >
                生成成功后，最近 8 条参数会保存在浏览器本地。
              </p>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dlg-fade-enter-from,
.dlg-fade-leave-to {
  opacity: 0;
}
.dlg-fade-enter-active,
.dlg-fade-leave-active {
  transition: opacity 0.24s ease-out;
}

.dlg-zoom-enter-from {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
}
.dlg-zoom-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
.dlg-zoom-enter-active,
.dlg-zoom-leave-active {
  transition: opacity 0.24s ease-out, transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}
</style>
