<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import Icon from './Icon.vue'

interface Props {
  open: boolean
  title?: string
  eyebrow?: string
  side?: 'bottom' | 'right'
  size?: 'auto' | 'tall' | 'full'
}

const props = withDefaults(defineProps<Props>(), {
  side: 'bottom',
  size: 'auto',
})

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

function close() {
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
    <Transition name="scrim">
      <div v-if="open" class="scrim z-sheet" @click="close" aria-hidden="true"></div>
    </Transition>

    <Transition :name="side === 'right' ? 'sheet-right' : 'sheet-bottom'">
      <section
        v-if="open"
        class="fixed z-sheet flex flex-col border-line bg-paper text-ink shadow-paper-3"
        :class="[
          side === 'bottom'
            ? 'inset-x-0 bottom-0 rounded-t-[28px] border-t'
            : 'inset-y-0 right-0 max-w-[420px] rounded-l-[28px] border-l',
          size === 'tall' && side === 'bottom' ? 'h-[85dvh]' : '',
          size === 'full' && side === 'bottom' ? 'h-[100dvh] rounded-none' : '',
          size === 'auto' && side === 'bottom' ? 'max-h-[85dvh]' : '',
          side === 'right' ? 'w-full' : '',
        ]"
        role="dialog"
        aria-modal="true"
        :aria-label="title || '抽屉'"
        @click.stop
      >
        <header
          v-if="side === 'bottom'"
          class="relative flex items-start justify-between gap-3 px-5 pt-5"
        >
          <div class="absolute inset-x-0 top-2 grid place-items-center">
            <span class="h-1.5 w-10 rounded-full bg-line-strong/60"></span>
          </div>
          <div class="mt-3 min-w-0 flex-1">
            <p v-if="eyebrow" class="display-eyebrow">{{ eyebrow }}</p>
            <h2 v-if="title" class="mt-1 font-display text-xl tracking-tightish">{{ title }}</h2>
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

        <header
          v-else
          class="flex items-center justify-between gap-3 border-b border-line px-5 py-4"
        >
          <div>
            <p v-if="eyebrow" class="display-eyebrow">{{ eyebrow }}</p>
            <h2 v-if="title" class="font-display text-lg tracking-tightish">{{ title }}</h2>
          </div>
          <button type="button" class="icon-btn-sm" aria-label="关闭" @click="close">
            <Icon name="close" :size="14" />
          </button>
        </header>

        <div
          class="flex-1 overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom,0px),1.25rem)] pt-4"
        >
          <slot />
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.scrim-enter-from,
.scrim-leave-to {
  opacity: 0;
}
.scrim-enter-active,
.scrim-leave-active {
  transition: opacity 0.24s ease-out;
}

.sheet-bottom-enter-from {
  transform: translateY(100%);
}
.sheet-bottom-leave-to {
  transform: translateY(100%);
}
.sheet-bottom-enter-active,
.sheet-bottom-leave-active {
  transition: transform 0.36s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.sheet-right-enter-from {
  transform: translateX(100%);
}
.sheet-right-leave-to {
  transform: translateX(100%);
}
.sheet-right-enter-active,
.sheet-right-leave-active {
  transition: transform 0.36s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .scrim-enter-active,
  .scrim-leave-active,
  .sheet-bottom-enter-active,
  .sheet-bottom-leave-active,
  .sheet-right-enter-active,
  .sheet-right-leave-active {
    transition: none;
  }
}
</style>
