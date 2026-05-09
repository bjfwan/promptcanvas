<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import StyleSwatch from './StyleSwatch.vue'
import { useFocusTrap } from '../composables/useFocusTrap'
import { useBodyLock } from '../composables/useBodyLock'
import { styleOptions } from '../presets'
import type { ImageStyle } from '../types'

interface Props {
  open: boolean
  current: ImageStyle
}

const props = defineProps<Props>()
const sheetRef = ref<HTMLElement | null>(null)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'select', style: ImageStyle): void
}>()

function close() {
  emit('update:open', false)
}

function pick(style: ImageStyle) {
  emit('select', style)
  emit('update:open', false)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener('keydown', onKeydown)
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
  { immediate: true },
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
        class="style-sheet fixed inset-x-0 bottom-0 z-sheet flex flex-col rounded-t-[28px] border-t border-line bg-paper text-ink shadow-paper-3"
        role="dialog"
        aria-modal="true"
        aria-label="选择画面风格"
        @click.stop
      >
        <header class="style-sheet__header relative flex items-start justify-between gap-3 px-5 pt-5">
          <div class="absolute inset-x-0 top-2 grid place-items-center">
            <span class="h-1.5 w-10 rounded-full bg-line-strong/60"></span>
          </div>
          <div class="mt-3 min-w-0 flex-1">
            <p class="display-eyebrow">Style · 风格</p>
            <h2 class="mt-1 inline-flex items-center gap-2 font-display text-xl tracking-tightish">
              <Icon name="palette" :size="16" class="text-muted" />
              <span>挑一种画面气质</span>
            </h2>
          </div>
          <button
            type="button"
            class="icon-btn-sm mt-3 shrink-0"
            aria-label="关闭"
            @click="close"
          >
            <Icon name="close" :size="14" />
          </button>
        </header>

        <div class="touch-scroll-y flex-1 overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom,0px),1.25rem)] pt-4">
          <ul class="style-sheet__grid">
            <li v-for="item in styleOptions" :key="item.value">
              <button
                type="button"
                class="style-mode-card"
                :class="{ 'style-mode-card--active': current === item.value }"
                :aria-pressed="current === item.value"
                @click="pick(item.value)"
              >
                <span class="style-mode-card__rail" aria-hidden="true"></span>
                <StyleSwatch :variant="item.value" :active="current === item.value" :size="42" />
                <span class="style-mode-card__body">
                  <span class="style-mode-card__top">
                    <span class="style-mode-card__title">{{ item.label }}</span>
                    <Icon
                      v-if="current === item.value"
                      name="check"
                      :size="12"
                      class="style-mode-card__check"
                    />
                  </span>
                  <span class="style-mode-card__accent">{{ item.accent }} · {{ item.description }}</span>
                  <span
                    v-if="item.value === 'raw'"
                    class="style-mode-card__preview sheet-style-preview"
                  >
                    不附加任何风格指引，原样发送
                  </span>
                  <span
                    v-else
                    class="style-mode-card__preview sheet-style-preview"
                  >
                    {{ item.examplePrompt || item.description }}
                  </span>
                </span>
              </button>
            </li>
          </ul>

          <p class="style-sheet__note mt-5 text-[11px] leading-5 text-muted">
            选风格只切换画面气质，不会替换你已经写好的提示词。如需更多参数（尺寸、数量、Seed 等），请在顶部进入设置。
          </p>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.style-sheet {
  max-height: min(84dvh, 720px);
  background:
    linear-gradient(180deg, rgb(var(--color-ivory) / 0.74), rgb(var(--color-vellum) / 0.96)),
    rgb(var(--color-paper));
}

.style-sheet__header {
  background:
    linear-gradient(180deg, rgb(var(--color-ivory) / 0.52), transparent),
    linear-gradient(90deg, rgb(var(--color-sage) / 0.12), transparent 46%);
}

.style-sheet__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.62rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 420px) {
  .style-sheet__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.style-mode-card {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.72rem;
  min-height: 104px;
  width: 100%;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgb(var(--color-line));
  background:
    linear-gradient(135deg, rgb(var(--color-ivory) / 0.72), rgb(var(--color-vellum) / 0.48)),
    rgb(var(--color-cream) / 0.2);
  padding: 0.76rem 0.82rem 0.76rem 0.95rem;
  color: rgb(var(--color-ink));
  text-align: left;
  box-shadow: var(--shadow-inner-paper);
  transition: transform 170ms var(--motion-press), border-color 170ms var(--motion-soft), background-color 170ms var(--motion-soft), box-shadow 190ms var(--motion-soft), color 170ms var(--motion-soft);
}

.style-mode-card:hover {
  transform: translateY(-1px);
  border-color: rgb(var(--color-line-strong));
  background: rgb(var(--color-ivory) / 0.82);
  box-shadow: var(--shadow-paper-1), var(--shadow-inner-paper);
}

.style-mode-card--active {
  border-color: rgb(var(--color-ink));
  background:
    linear-gradient(135deg, rgb(var(--color-ink)), rgb(var(--color-blueprint))),
    rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  box-shadow: var(--shadow-paper-2);
}

.style-mode-card__rail {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: rgb(var(--color-forest));
  opacity: 0.75;
}

.style-sheet__grid li:nth-child(2n) .style-mode-card__rail {
  background: rgb(var(--color-accent));
}

.style-sheet__grid li:nth-child(3n) .style-mode-card__rail {
  background: rgb(var(--color-ochre));
}

.style-sheet__grid li:nth-child(4n) .style-mode-card__rail {
  background: rgb(var(--color-blueprint));
}

.style-mode-card--active .style-mode-card__rail {
  width: 4px;
  background: rgb(var(--color-ochre));
  opacity: 1;
}

.style-mode-card__body {
  display: grid;
  min-width: 0;
  gap: 0.24rem;
}

.style-mode-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  gap: 0.4rem;
}

.style-mode-card__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 740;
  line-height: 1.1;
}

.style-mode-card__check {
  color: rgb(var(--color-paper) / 0.9);
}

.style-mode-card__accent {
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

.style-mode-card--active .style-mode-card__accent {
  color: rgb(var(--color-paper) / 0.6);
}

.style-mode-card__preview {
  margin-top: 0.2rem;
  display: block;
  color: rgb(var(--color-muted));
}

.style-mode-card--active .style-mode-card__preview {
  color: rgb(var(--color-paper) / 0.72);
}

.style-sheet__note {
  border-radius: 14px;
  border: 1px solid rgb(var(--color-line) / 0.72);
  background: rgb(var(--color-ivory) / 0.42);
  padding: 0.75rem 0.85rem;
}

.sheet-style-preview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
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
  .style-mode-card,
  .style-scrim-enter-active,
  .style-scrim-leave-active,
  .style-sheet-enter-active,
  .style-sheet-leave-active {
    transition: none;
  }
}
</style>
