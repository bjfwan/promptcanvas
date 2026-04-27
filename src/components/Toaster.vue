<script setup lang="ts">
import { useToast } from '../composables/useToast'
import Icon from './Icon.vue'
import type { IconName } from '../icons'

const toast = useToast()

function iconFor(kind: 'info' | 'success' | 'error'): IconName {
  if (kind === 'success') return 'check'
  if (kind === 'error') return 'warning'
  return 'info'
}
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-x-0 z-toast flex flex-col items-center gap-2 px-4"
      :style="{ top: 'calc(env(safe-area-inset-top, 0px) + 4.5rem)' }"
      aria-live="polite"
      aria-atomic="true"
    >
      <TransitionGroup name="toast" tag="div" class="flex w-full max-w-sm flex-col items-stretch gap-2">
        <div
          v-for="item in toast.items"
          :key="item.id"
          class="pointer-events-auto flex items-start gap-2.5 rounded-2xl border bg-vellum/95 px-3.5 py-3 text-[13px] font-medium text-ink shadow-paper-3 backdrop-blur"
          :class="{
            'border-line': item.kind !== 'error',
            'border-accent/40 text-accent': item.kind === 'error',
          }"
          role="status"
        >
          <span
            class="mt-0.5 grid h-5 w-5 place-items-center rounded-full"
            :class="{
              'bg-ink text-paper': item.kind === 'success',
              'bg-accent/15 text-accent': item.kind === 'error',
              'bg-paper-soft text-ink': item.kind === 'info',
            }"
          >
            <Icon :name="iconFor(item.kind)" :size="12" stroke-width="2" />
          </span>
          <div class="flex-1 leading-snug">
            <p>{{ item.text }}</p>
            <p v-if="item.hint" class="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              {{ item.hint }}
            </p>
          </div>
          <button
            type="button"
            class="-mr-1 -mt-1 rounded-full p-1 text-muted transition hover:text-ink"
            aria-label="关闭通知"
            @click="toast.dismiss(item.id)"
          >
            <Icon name="close" :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-from {
  opacity: 0;
  transform: translateY(-12px) scale(0.97);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}
.toast-enter-active,
.toast-leave-active {
  transition: transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.24s ease-out;
}
.toast-move {
  transition: transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active,
  .toast-move {
    transition: none;
  }
}
</style>
