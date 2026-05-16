<script setup lang="ts">
import { useToast } from '../composables/useToast'
import Icon from './Icon.vue'
import { useI18n } from '../lib/i18n'
import type { IconName } from '../icons'

const toast = useToast()
const { t } = useI18n()

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
      :style="{ top: 'calc(env(safe-area-inset-top, 0px) + 4rem)' }"
      aria-live="polite"
      aria-atomic="true"
    >
      <TransitionGroup name="toast" tag="div" class="flex w-full max-w-sm flex-col items-stretch gap-2">
        <div
          v-for="item in toast.items"
          :key="item.id"
          class="toast-card pointer-events-auto flex items-start gap-2.5 border bg-vellum/95 px-3.5 py-3 text-[13px] font-medium text-ink shadow-paper-3 backdrop-blur"
          :class="{
            'toast-card--success': item.kind === 'success',
            'toast-card--info': item.kind === 'info',
            'toast-card--error text-accent': item.kind === 'error',
          }"
          :style="{ '--toast-life': `${item.duration}ms` }"
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
            :aria-label="t('toast.dismiss')"
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
.toast-card {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
}

.toast-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: rgb(var(--color-blueprint));
}

.toast-card::after {
  content: '';
  position: absolute;
  inset: auto 0 0 0;
  height: 1px;
  background: linear-gradient(90deg, rgb(var(--color-forest)), rgb(var(--color-ochre)));
  transform-origin: left center;
  animation: toast-life var(--toast-life, 2400ms) linear forwards;
}

.toast-card--success {
  border-color: rgb(var(--color-forest) / 0.36);
}

.toast-card--success::before {
  background: rgb(var(--color-forest));
}

.toast-card--info {
  border-color: rgb(var(--color-line-strong) / 0.7);
}

.toast-card--error {
  border-color: rgb(var(--color-accent) / 0.42);
  background: rgb(var(--color-accent) / 0.08);
}

.toast-card--error::before {
  background: rgb(var(--color-accent));
}

.toast-card--error::after {
  background: rgb(var(--color-accent));
}

@keyframes toast-life {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.985);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.985);
}
.toast-enter-active,
.toast-leave-active {
  transition: transform 0.34s var(--motion-snap), opacity 0.22s ease-out;
}
.toast-move {
  transition: transform 0.34s var(--motion-snap);
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active,
  .toast-move,
  .toast-card::after {
    transition: none;
    animation: none;
  }
}
</style>
