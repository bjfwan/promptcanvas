<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { useFocusTrap } from '../composables/useFocusTrap'
import { useBodyLock } from '../composables/useBodyLock'
import { useI18n } from '../lib/i18n'
import { resolveImageSource } from '../api'
import type { GenerationHistoryItem } from '../types'

interface Props {
  open: boolean
  history: GenerationHistoryItem[]
}

const props = defineProps<Props>()
const { t } = useI18n()
const clearConfirming = ref(false)
const dialogRef = ref<HTMLElement | null>(null)
let clearConfirmTimer: number | undefined

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'preview', item: GenerationHistoryItem): void
  (e: 'copy-prompt', item: GenerationHistoryItem): void
  (e: 'reuse-params', item: GenerationHistoryItem): void
  (e: 'remix', item: GenerationHistoryItem): void
  (e: 'regenerate', item: GenerationHistoryItem): void
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

function hideBrokenImage(event: Event) {
  const image = event.currentTarget as HTMLImageElement | null
  if (image) image.hidden = true
}

function hasPreviewableImage(item: GenerationHistoryItem) {
  return !!(item.images && item.images.length && resolveImageSource(item.images[0]))
}

function previewItem(item: GenerationHistoryItem) {
  if (hasPreviewableImage(item)) emit('preview', item)
  else emit('copy-prompt', item)
}

function copyPrompt(item: GenerationHistoryItem) {
  emit('copy-prompt', item)
}

function reuseParams(item: GenerationHistoryItem) {
  emit('reuse-params', item)
}

function remixItem(item: GenerationHistoryItem) {
  emit('remix', item)
  close()
}

function regenerateItem(item: GenerationHistoryItem) {
  emit('regenerate', item)
  close()
}

function resetClearConfirm() {
  clearConfirming.value = false
  if (clearConfirmTimer) {
    window.clearTimeout(clearConfirmTimer)
    clearConfirmTimer = undefined
  }
}

function requestClearHistory() {
  if (clearConfirming.value) {
    emit('clear')
    resetClearConfirm()
    return
  }
  clearConfirming.value = true
  clearConfirmTimer = window.setTimeout(() => {
    clearConfirming.value = false
    clearConfirmTimer = undefined
  }, 3200)
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', handleKey)
    else {
      window.removeEventListener('keydown', handleKey)
      resetClearConfirm()
    }
  },
  { immediate: true },
)

useFocusTrap(() => props.open, dialogRef)
useBodyLock(() => props.open)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKey)
  resetClearConfirm()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dlg-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-sheet flex items-end justify-center px-0 py-0 sm:items-center sm:px-4 sm:py-6"
        role="dialog"
        aria-modal="true"
        :aria-label="t('history.title')"
        @click.self="close"
      >
        <div class="scrim" aria-hidden="true" @click="close"></div>

        <Transition name="dlg-zoom">
          <div
            v-if="open"
            ref="dialogRef"
            class="dialog-shell relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden text-ink sm:max-h-[86dvh]"
          >
            <header class="relative flex items-start justify-between gap-3 border-b border-line/40 px-5 py-4 sm:px-6 sm:py-5">
              <div class="absolute inset-x-0 top-2 grid place-items-center sm:hidden">
                <span class="h-1.5 w-10 rounded-full bg-line-strong/60"></span>
              </div>
              <div>
                <p class="display-eyebrow">{{ t('history.eyebrow', { count: history.length }) }}</p>
                <h2 class="mt-1.5 inline-flex items-center gap-2 font-display text-2xl tracking-tightish">
                  <Icon name="clock" :size="18" class="text-accent" />
                  <span class="gradient-text">{{ t('history.title') }}</span>
                </h2>
              </div>
              <div class="flex items-center gap-2">
                <button
                  v-if="history.length"
                  type="button"
                  class="btn-quiet inline-flex items-center gap-1 text-[11px]"
                  :class="clearConfirming ? 'text-accent hover:text-accent' : ''"
                  @click="requestClearHistory"
                >
                  <Icon name="trash" :size="11" />
                  <span>{{ clearConfirming ? t('history.clearConfirm') : t('history.clear') }}</span>
                </button>
                <button type="button" class="icon-btn-sm" :aria-label="t('settings.close')" @click="close">
                  <Icon name="close" :size="14" />
                </button>
              </div>
            </header>

            <div class="touch-scroll-y max-h-[calc(92dvh-5.5rem)] flex-1 overflow-y-auto px-5 py-4 sm:max-h-[70dvh] sm:px-6 sm:py-5">
              <ul v-if="history.length" class="space-y-3">
                <li
                  v-for="item in history"
                  :key="item.id"
                  class="history-card"
                >
                  <div class="history-card__main">
                    <button
                      type="button"
                      class="history-card__thumb-btn"
                      :aria-label="hasPreviewableImage(item) ? '预览这张生成' : '复制提示词'"
                      @click="previewItem(item)"
                    >
                      <div
                        v-if="hasPreviewableImage(item)"
                        class="relative h-20 w-20 overflow-hidden rounded-xl border border-line bg-paper-soft sm:h-24 sm:w-24"
                      >
                        <span class="absolute inset-0 grid place-items-center text-muted" aria-hidden="true">
                          <Icon name="frame" :size="18" />
                        </span>
                        <img
                          :src="resolveImageSource(item.images![0])"
                          alt=""
                          loading="lazy"
                          decoding="async"
                          class="h-full w-full object-cover"
                          referrerpolicy="no-referrer"
                          @error="hideBrokenImage"
                        />
                        <span
                          v-if="item.imageCount > 1"
                          class="absolute bottom-1 right-1 rounded-full bg-ink/75 px-1.5 py-px font-mono text-[9px] text-paper"
                        >
                          ×{{ item.imageCount }}
                        </span>
                        <span
                          v-if="item.images![0].storageKey"
                          class="absolute left-1 top-1 rounded-full bg-vellum/90 px-1.5 py-px font-mono text-[8px] uppercase tracking-[0.12em] text-forest shadow-paper-1"
                        >
                          {{ t('history.saved') }}
                        </span>
                        <span class="history-card__zoom" aria-hidden="true">
                          <Icon name="search" :size="12" />
                        </span>
                      </div>
                      <div
                        v-else
                        class="grid h-20 w-20 place-items-center rounded-xl border border-dashed border-line bg-paper-soft/60 text-muted sm:h-24 sm:w-24"
                        aria-hidden="true"
                      >
                        <Icon name="frame" :size="18" />
                      </div>
                    </button>
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
                        <span v-if="item.referenceImageCount">{{ t('history.refCount', { count: item.referenceImageCount }) }}</span>
                        <span v-if="item.seed" class="text-line">·</span>
                        <span v-if="item.seed" class="font-mono">{{ t('history.seed', { value: item.seed }) }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="history-card__actions" role="group" aria-label="历史操作">
                    <button
                      type="button"
                      class="history-card__chip"
                      aria-label="复制提示词到剪贴板"
                      @click="copyPrompt(item)"
                    >
                      <Icon name="copy" :size="12" />
                      <span>复制提示词</span>
                    </button>
                    <button
                      type="button"
                      class="history-card__chip"
                      aria-label="只套用参数（风格、尺寸、模型），不改提示词"
                      @click="reuseParams(item)"
                    >
                      <Icon name="settings" :size="12" />
                      <span>套用参数</span>
                    </button>
                    <button
                      v-if="hasPreviewableImage(item)"
                      type="button"
                      class="history-card__chip"
                      aria-label="基于这张图接着画"
                      @click="remixItem(item)"
                    >
                      <Icon name="sparkle" :size="12" />
                      <span>接着画</span>
                    </button>
                    <button
                      type="button"
                      class="history-card__chip history-card__chip--primary"
                      aria-label="用这条历史的参数重新生成一次"
                      @click="regenerateItem(item)"
                    >
                      <Icon name="refresh" :size="12" />
                      <span>重新生成</span>
                    </button>
                  </div>
                </li>
              </ul>
              <p
                v-else
                class="rounded-2xl border border-dashed border-line/50 bg-ivory/30 px-4 py-6 text-center text-[12px] leading-5 text-muted backdrop-blur-sm"
              >
                {{ t('history.empty') }}
              </p>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-shell {
  border: 1px solid rgb(var(--color-line) / 0.3);
  border-radius: var(--radius-card);
  background: var(--gradient-surface);
  backdrop-filter: blur(calc(var(--glass-blur) * 1.4)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 1.4)) saturate(var(--glass-saturate));
  box-shadow: var(--shadow-glass-xl), var(--shadow-inner-glass);
}

@media (max-width: 639px) {
  .dialog-shell {
    border-bottom: 0;
    border-top-left-radius: 28px;
    border-top-right-radius: 28px;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
}

.history-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: var(--radius-card);
  border: 1px solid rgb(var(--color-line) / 0.4);
  background: rgb(var(--color-ivory) / 0.4);
  backdrop-filter: blur(10px) saturate(1.3);
  -webkit-backdrop-filter: blur(10px) saturate(1.3);
  box-shadow: var(--shadow-inner-glass);
  transition: border-color 160ms var(--motion-soft), background-color 160ms var(--motion-soft), box-shadow 200ms var(--motion-soft), transform 200ms var(--motion-soft);
}

.history-card:hover {
  border-color: rgb(var(--color-line-strong) / 0.5);
  background: rgb(var(--color-ivory) / 0.6);
  box-shadow: var(--shadow-glass), var(--shadow-inner-glass);
  transform: translateY(-1px);
}

.history-card__main {
  display: flex;
  align-items: stretch;
  gap: 12px;
}

.history-card__thumb-btn {
  position: relative;
  flex-shrink: 0;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: zoom-in;
  -webkit-tap-highlight-color: transparent;
  border-radius: 14px;
  transition: transform 160ms var(--motion-press);
}

.history-card__thumb-btn:active {
  transform: scale(0.97);
}

.history-card__thumb-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.history-card__zoom {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgb(var(--color-paper) / 0.92);
  color: rgb(var(--color-ink));
  border: 1px solid rgb(var(--color-line));
  opacity: 0;
  transform: translateY(2px);
  transition: opacity 160ms var(--motion-soft), transform 160ms var(--motion-soft);
}

.history-card:hover .history-card__zoom,
.history-card__thumb-btn:focus-visible .history-card__zoom {
  opacity: 1;
  transform: translateY(0);
}

@media (hover: none) {
  .history-card__zoom {
    opacity: 1;
    transform: translateY(0);
  }
}

.history-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px dashed rgb(var(--color-line) / 0.7);
}

.history-card__chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.5);
  background: rgb(var(--color-ivory) / 0.5);
  backdrop-filter: blur(8px) saturate(1.4);
  -webkit-backdrop-filter: blur(8px) saturate(1.4);
  box-shadow: var(--shadow-inner-glass);
  color: rgb(var(--color-ink));
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 140ms var(--motion-soft),
    border-color 140ms var(--motion-soft),
    color 140ms var(--motion-soft),
    box-shadow 160ms var(--motion-soft),
    transform 140ms var(--motion-press);
  -webkit-tap-highlight-color: transparent;
}

.history-card__chip::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: inherit;
}

.history-card__chip:hover {
  background: rgb(var(--color-ivory) / 0.7);
  border-color: rgb(var(--color-line-strong) / 0.6);
  box-shadow: var(--shadow-glass-sm);
}

.history-card__chip:active {
  transform: scale(0.96);
}

.history-card__chip--primary {
  margin-left: auto;
  background: var(--gradient-primary);
  border-color: transparent;
  color: #fff;
  box-shadow: var(--shadow-glass-sm), var(--shadow-glow-accent);
}

.history-card__chip--primary:hover {
  background: var(--gradient-primary);
  border-color: transparent;
  box-shadow: var(--shadow-glass), 0 0 24px -6px rgb(var(--color-accent) / 0.4);
}

@media (max-width: 380px) {
  .history-card__chip {
    padding: 0 9px;
  }

  .history-card__chip--primary {
    margin-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .history-card,
  .history-card__chip,
  .history-card__zoom,
  .history-card__thumb-btn {
    transition: none;
  }
}

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

@media (max-width: 639px) {
  .dlg-zoom-enter-from,
  .dlg-zoom-leave-to {
    opacity: 0;
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dlg-fade-enter-active,
  .dlg-fade-leave-active,
  .dlg-zoom-enter-active,
  .dlg-zoom-leave-active {
    transition: none;
  }
}
</style>
