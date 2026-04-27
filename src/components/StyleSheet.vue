<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import Icon from './Icon.vue'
import StyleSwatch from './StyleSwatch.vue'
import { styleOptions } from '../presets'
import type { ImageStyle } from '../types'

interface Props {
  open: boolean
  current: ImageStyle
}

const props = defineProps<Props>()

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
    if (typeof document === 'undefined') return

    document.body.style.overflow = isOpen ? 'hidden' : ''
    if (isOpen) {
      window.addEventListener('keydown', onKeydown)
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
  }
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
        v-if="open"
        class="style-sheet fixed inset-x-0 bottom-0 z-sheet flex flex-col rounded-t-[28px] border-t border-line bg-paper text-ink shadow-paper-3"
        role="dialog"
        aria-modal="true"
        aria-label="选择画面风格"
        @click.stop
      >
        <header class="relative flex items-start justify-between gap-3 px-5 pt-5">
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

        <div class="flex-1 overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom,0px),1.25rem)] pt-4">
          <ul class="grid grid-cols-2 gap-2.5">
            <li v-for="item in styleOptions" :key="item.value">
              <button
                type="button"
                class="group relative flex w-full items-center gap-3 rounded-2xl border bg-cream p-2.5 text-left transition"
                :class="
                  current === item.value
                    ? 'border-ink bg-ink text-paper shadow-paper-2'
                    : 'border-line text-ink hover:-translate-y-px hover:border-line-strong hover:bg-paper-soft hover:shadow-paper-1'
                "
                :aria-pressed="current === item.value"
                @click="pick(item.value)"
              >
                <StyleSwatch :variant="item.value" :active="current === item.value" :size="40" />
                <span class="min-w-0 flex-1">
                  <span class="block text-[13px] font-medium leading-tight">{{ item.label }}</span>
                  <span
                    class="mt-0.5 block text-[11px] leading-snug"
                    :class="current === item.value ? 'text-paper/70' : 'text-muted'"
                  >
                    {{ item.accent }}
                  </span>
                </span>
                <Icon
                  v-if="current === item.value"
                  name="check"
                  :size="14"
                  class="text-paper/90"
                />
              </button>
            </li>
          </ul>

          <p class="mt-5 text-[11px] leading-5 text-muted">
            选风格只切换画面气质，不会替换你已经写好的提示词。如需更多参数（尺寸、数量、Seed 等），请在顶部进入设置。
          </p>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.style-sheet {
  max-height: 70dvh;
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
  .style-scrim-enter-active,
  .style-scrim-leave-active,
  .style-sheet-enter-active,
  .style-sheet-leave-active {
    transition: none;
  }
}
</style>
