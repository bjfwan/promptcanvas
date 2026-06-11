<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import StyleSwatch from './StyleSwatch.vue'
import { useFocusTrap } from '../composables/useFocusTrap'
import { useBodyLock } from '../composables/useBodyLock'
import { useVibration } from '../composables/useVibration'
import { styleOptions, stylePresetById } from '../presets'
import type { ImageStyle } from '../types'

interface Props {
  open: boolean
  current: ImageStyle
  promptValue?: string
  templateAnchor?: string
}

const props = withDefaults(defineProps<Props>(), {
  promptValue: '',
  templateAnchor: '',
})

const sheetRef = ref<HTMLElement | null>(null)
const previewRef = ref<HTMLElement | null>(null)
const focused = ref<ImageStyle>(props.current)
const dragOffset = ref(0)
const dragging = ref(false)
let dragStartY = 0

const { vibrate } = useVibration()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'select', payload: { style: ImageStyle; mode: 'apply' | 'switch' }): void
}>()

const focusedPreset = computed(() => stylePresetById.get(focused.value) ?? styleOptions[0])
const isFocusedActive = computed(() => focused.value === props.current)
const isFocusedRaw = computed(() => focused.value === 'raw')

const hasUserOriginalPrompt = computed(() => {
  const trimmed = (props.promptValue || '').trim()
  if (!trimmed) return false
  return trimmed !== (props.templateAnchor || '').trim()
})

const willOverwritePrompt = computed(() => {
  if (!focusedPreset.value.examplePrompt) return false
  return hasUserOriginalPrompt.value
})

const previewText = computed(() => {
  const preset = focusedPreset.value
  if (preset.value === 'raw') {
    return '不附加任何风格指引：你输入什么就发什么。适合自己已经写得很完整、不希望被模板覆盖时。'
  }
  return preset.examplePrompt || preset.description
})

function close() {
  emit('update:open', false)
}

function focus(style: ImageStyle) {
  if (focused.value === style) return
  focused.value = style
  vibrate('tap')
  nextTick(() => {
    previewRef.value?.scrollTo({ top: 0, behavior: 'auto' })
  })
}

function apply(mode: 'apply' | 'switch') {
  emit('select', { style: focused.value, mode })
  emit('update:open', false)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    apply(willOverwritePrompt.value ? 'switch' : 'apply')
  }
}

function onGrabStart(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  dragging.value = true
  dragStartY = event.clientY
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onGrabMove(event: PointerEvent) {
  if (!dragging.value) return
  dragOffset.value = Math.max(0, event.clientY - dragStartY)
}

function onGrabEnd(event: PointerEvent) {
  if (!dragging.value) return
  ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
  dragging.value = false
  if (dragOffset.value > 96) {
    close()
  }
  dragOffset.value = 0
}

const sheetTransform = computed(() =>
  dragOffset.value > 0 ? `translateY(${dragOffset.value}px)` : undefined,
)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      focused.value = props.current
      dragOffset.value = 0
      window.addEventListener('keydown', onKeydown)
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
  { immediate: true },
)

watch(
  () => props.current,
  (next) => {
    if (props.open) focused.value = next
  },
)

useFocusTrap(() => props.open, sheetRef)
useBodyLock(() => props.open)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="style-scrim">
      <div
        v-if="open"
        class="scrim z-sheet"
        aria-hidden="true"
        @click="close"
      ></div>
    </Transition>

    <Transition name="style-sheet">
      <section
        ref="sheetRef"
        v-if="open"
        class="style-sheet fixed inset-x-0 bottom-0 z-sheet flex flex-col rounded-t-[20px] border-t border-line/50 text-ink"
        :class="{ 'style-sheet--dragging': dragging }"
        :style="sheetTransform ? { transform: sheetTransform } : undefined"
        role="dialog"
        aria-modal="true"
        aria-label="选择画面风格"
        @click.stop
      >
        <div
          class="style-sheet__grabber"
          aria-hidden="true"
          @pointerdown="onGrabStart"
          @pointermove="onGrabMove"
          @pointerup="onGrabEnd"
          @pointercancel="onGrabEnd"
        >
          <span class="style-sheet__grabber-handle"></span>
        </div>

        <header class="style-sheet__header flex items-start justify-between gap-3 px-5 pt-1">
          <div class="min-w-0 flex-1">
            <p class="display-eyebrow">Template · 提示词模板</p>
            <h2 class="mt-1 inline-flex items-center gap-2 font-display text-xl tracking-tightish">
              <Icon name="palette" :size="16" class="text-muted" />
              <span>挑一种画面气质</span>
            </h2>
            <p class="mt-1 text-[11px] leading-snug text-muted">
              先轻点预览，再决定是「套用模板」还是只「切换风格」
            </p>
          </div>
          <button
            type="button"
            class="icon-btn-sm shrink-0"
            aria-label="关闭"
            @click="close"
          >
            <Icon name="close" :size="14" />
          </button>
        </header>

        <div class="style-sheet__main">
          <div class="touch-scroll-y style-sheet__scroller">
            <ul class="style-sheet__grid">
              <li v-for="item in styleOptions" :key="item.value">
                <button
                  type="button"
                  class="style-tile"
                  :class="{
                    'style-tile--focused': focused === item.value,
                    'style-tile--current': current === item.value,
                  }"
                  :aria-pressed="focused === item.value"
                  :aria-label="`${item.label} · ${item.accent}${current === item.value ? '（当前）' : ''}`"
                  @click="focus(item.value)"
                >
                  <span class="style-tile__rail" aria-hidden="true"></span>
                  <span class="style-tile__swatch">
                    <StyleSwatch :variant="item.value" :active="focused === item.value" :size="42" />
                  </span>
                  <span class="style-tile__body">
                    <span class="style-tile__title">{{ item.label }}</span>
                    <span class="style-tile__accent">{{ item.accent }}</span>
                  </span>
                  <span v-if="current === item.value" class="style-tile__current-flag" aria-hidden="true">
                    <Icon name="check" :size="11" />
                  </span>
                </button>
              </li>
            </ul>
          </div>

          <section
            ref="previewRef"
            class="style-sheet__preview"
            aria-live="polite"
          >
            <header class="style-sheet__preview-head">
              <span class="style-sheet__preview-eyebrow">
                <Icon name="sparkle" :size="11" />
                <span>{{ isFocusedRaw ? '不套模板' : '示例提示词' }}</span>
              </span>
              <span class="style-sheet__preview-title">
                {{ focusedPreset.label }} · {{ focusedPreset.accent }}
              </span>
            </header>

            <p class="style-sheet__preview-text">{{ previewText }}</p>

            <p
              v-if="willOverwritePrompt"
              class="style-sheet__preview-warning"
            >
              <Icon name="warning" :size="11" />
              <span>套用会覆盖你已写的提示词，可改为「仅切换风格」保留原文</span>
            </p>
          </section>
        </div>

        <footer class="style-sheet__footer">
          <template v-if="isFocusedRaw">
            <button
              type="button"
              class="style-sheet__btn style-sheet__btn--primary"
              :disabled="isFocusedActive"
              @click="apply('switch')"
            >
              <Icon name="check" :size="13" />
              <span>{{ isFocusedActive ? '当前已是「不套模板」' : '切换为「不套模板」' }}</span>
            </button>
          </template>

          <template v-else-if="willOverwritePrompt">
            <button
              type="button"
              class="style-sheet__btn style-sheet__btn--ghost"
              @click="apply('switch')"
            >
              <Icon name="palette" :size="13" />
              <span>仅切换风格</span>
            </button>
            <button
              type="button"
              class="style-sheet__btn style-sheet__btn--primary"
              @click="apply('apply')"
            >
              <Icon name="sparkle" :size="13" />
              <span>覆盖并套用</span>
            </button>
          </template>

          <template v-else>
            <button
              type="button"
              class="style-sheet__btn style-sheet__btn--primary"
              @click="apply('apply')"
            >
              <Icon name="sparkle" :size="13" />
              <span>{{ isFocusedActive ? '重新写入示例' : '套用模板' }}</span>
            </button>
          </template>
        </footer>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.style-sheet {
  max-height: min(86dvh, 760px);
  border-color: rgb(var(--color-line) / 0.82);
  background: rgb(var(--color-surface) / 0.98);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-glass-lg);
  transition: transform 280ms var(--motion-soft);
  will-change: transform;
}

.style-sheet--dragging {
  transition: none;
}

.style-sheet__grabber {
  position: relative;
  display: grid;
  place-items: center;
  height: 22px;
  padding-top: 8px;
  cursor: grab;
  touch-action: none;
}

.style-sheet__grabber:active {
  cursor: grabbing;
}

.style-sheet__grabber-handle {
  width: 44px;
  height: 4px;
  border-radius: 999px;
  background: rgb(var(--color-line-strong) / 0.6);
  transition: background-color 160ms var(--motion-soft), width 200ms var(--motion-soft);
}

.style-sheet__grabber:hover .style-sheet__grabber-handle,
.style-sheet--dragging .style-sheet__grabber-handle {
  background: var(--gradient-primary);
  width: 56px;
}

.style-sheet__header {
  background: rgb(var(--color-surface) / 0.98);
  padding-bottom: 0.85rem;
  border-bottom: 1px solid rgb(var(--color-line) / 0.4);
}

.style-sheet__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  flex: 1 1 auto;
  min-height: 0;
}

@media (min-width: 720px) {
  .style-sheet__main {
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  }
}

.style-sheet__scroller {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0.85rem 0.85rem 0.5rem;
}

.style-sheet__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 480px) {
  .style-sheet__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 720px) {
  .style-sheet__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.style-tile {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 64px;
  overflow: hidden;
  border-radius: var(--radius-panel);
  border: 1px solid rgb(var(--color-line) / 0.72);
  background: rgb(var(--color-surface-raised) / 0.82);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  padding: 0.55rem 0.7rem 0.55rem 0.85rem;
  color: rgb(var(--color-ink));
  text-align: left;
  box-shadow: var(--shadow-inner-glass);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 160ms var(--motion-press),
    border-color 160ms var(--motion-soft),
    background-color 160ms var(--motion-soft),
    box-shadow 180ms var(--motion-soft),
    color 160ms var(--motion-soft);
}

.style-tile:hover {
  transform: translateY(-1px);
  border-color: rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-surface-raised) / 1);
  box-shadow: var(--shadow-glass-sm), var(--shadow-inner-glass);
}

.style-tile:active {
  transform: scale(0.97);
}

.style-tile:focus-visible,
.style-sheet__btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.style-tile--focused {
  border-color: rgb(var(--color-accent) / 0.5);
  background: rgb(var(--color-accent) / 0.08);
  color: rgb(var(--color-ink));
  box-shadow: var(--shadow-inner-glass), 0 0 0 1px rgb(var(--color-accent) / 0.12);
}

.style-tile--focused:hover {
  background: rgb(var(--color-ivory) / 0.7);
}

.style-tile__rail {
  position: absolute;
  inset: 0 auto 0 0;
  width: 2px;
  background: rgb(var(--color-accent));
  opacity: 0.44;
  transition: width 160ms var(--motion-soft), opacity 160ms var(--motion-soft);
}

.style-tile--focused .style-tile__rail {
  width: 3px;
  opacity: 1;
}

.style-tile__swatch {
  display: grid;
  place-items: center;
}

.style-tile__body {
  display: grid;
  min-width: 0;
  gap: 0.12rem;
}

.style-tile__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
  font-weight: 740;
  line-height: 1.15;
}

.style-tile__accent {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 620;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(var(--color-muted));
}

.style-tile--focused .style-tile__accent {
  color: rgb(var(--color-accent) / 0.85);
}

.style-tile__current-flag {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: var(--shadow-glow-accent);
}

.style-tile--focused .style-tile__current-flag {
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: var(--shadow-glow-accent);
}

.style-sheet__preview {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin: 0.4rem 0.85rem 0;
  padding: 0.85rem 0.95rem 0.95rem;
  border-radius: var(--radius-card);
  border: 1px solid rgb(var(--color-line) / 0.72);
  background: rgb(var(--color-surface-raised) / 0.84);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-inner-glass);
  max-height: min(34dvh, 240px);
  overflow-y: auto;
  scrollbar-width: thin;
}

@media (min-width: 720px) {
  .style-sheet__preview {
    margin: 0.85rem 0.85rem 0 0;
    max-height: none;
  }
}

.style-sheet__preview-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.4rem 0.55rem;
}

.style-sheet__preview-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 620;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--color-muted));
}

.style-sheet__preview-title {
  font-family: 'Fraunces', 'IBM Plex Sans', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 620;
  letter-spacing: -0.01em;
  color: rgb(var(--color-ink));
}

.style-sheet__preview-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: rgb(var(--color-ink) / 0.86);
  white-space: pre-wrap;
  word-break: break-word;
  animation: preview-fade 220ms var(--motion-soft);
}

@keyframes preview-fade {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.style-sheet__preview-warning {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 0.45rem 0.6rem;
  border-radius: var(--radius-field);
  background: rgb(var(--color-accent) / 0.1);
  border: 1px solid rgb(var(--color-accent) / 0.3);
  color: rgb(var(--color-accent));
  font-size: 11.5px;
  font-weight: 540;
  line-height: 1.4;
}

.style-sheet__footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.5rem;
  padding: 0.7rem 0.85rem calc(env(safe-area-inset-bottom, 0px) + 0.85rem);
  border-top: 1px solid rgb(var(--color-line) / 0.6);
  background: rgb(var(--color-surface) / 0.98);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.style-sheet__footer:has(.style-sheet__btn + .style-sheet__btn) {
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
}

.style-sheet__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  height: 46px;
  padding: 0 1rem;
  border-radius: var(--radius-field);
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 150ms var(--motion-press),
    background-color 160ms var(--motion-soft),
    color 160ms var(--motion-soft),
    border-color 160ms var(--motion-soft),
    box-shadow 180ms var(--motion-soft);
}

.style-sheet__btn:active:not(:disabled) {
  transform: scale(0.97);
}

.style-sheet__btn--primary {
  border: none;
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent);
}

.style-sheet__btn--primary:hover:not(:disabled) {
  box-shadow: var(--shadow-glass), inset 0 1px 0 rgb(255 255 255 / 0.18);
  transform: translateY(-1px);
}

.style-sheet__btn--primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

.style-sheet__btn--ghost {
  border: 1px solid rgb(var(--color-line) / 0.5);
  background: rgb(var(--color-surface) / 0.96);
  color: rgb(var(--color-ink));
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-inner-glass);
}

.style-sheet__btn--ghost:hover:not(:disabled) {
  border-color: rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-surface-raised) / 1);
  box-shadow: var(--shadow-glass-sm);
  transform: translateY(-1px);
}

.style-sheet__btn--ghost:active:not(:disabled) {
  background: rgb(var(--color-ivory) / 0.7);
}

.style-scrim-enter-from,
.style-scrim-leave-to {
  opacity: 0;
}

.style-scrim-enter-active,
.style-scrim-leave-active {
  transition: opacity 0.24s ease-out;
}

.style-sheet-enter-from {
  transform: translateY(100%);
}

.style-sheet-leave-to {
  transform: translateY(100%);
}

.style-sheet-enter-active,
.style-sheet-leave-active {
  transition: transform 0.36s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .style-tile,
  .style-sheet__btn,
  .style-sheet,
  .style-scrim-enter-active,
  .style-scrim-leave-active,
  .style-sheet-enter-active,
  .style-sheet-leave-active,
  .style-sheet__preview-text {
    transition: none;
    animation: none;
  }
}
</style>
