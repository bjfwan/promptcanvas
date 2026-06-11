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
      class="toaster pointer-events-none fixed inset-x-0 z-toast flex flex-col items-center gap-2 px-4"
      aria-live="polite"
      aria-atomic="true"
    >
      <TransitionGroup name="toast" tag="div" class="flex w-full max-w-sm flex-col items-stretch gap-2">
        <div
          v-for="item in toast.items"
          :key="item.id"
          class="toast-card pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 text-[13px] font-medium text-ink"
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
            v-if="item.action"
            type="button"
            class="toast-card__action"
            :aria-label="item.action.ariaLabel || item.action.label"
            @click="toast.runAction(item.id)"
          >
            {{ item.action.label }}
          </button>
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
.toaster {
  top: calc(env(safe-area-inset-top, 0px) + 4rem);
}

.toast-card {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-card);
  border: 1px solid rgb(var(--color-line) / 0.82);
  background: rgb(var(--color-surface-raised) / 0.98);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-glass), var(--shadow-inner-glass);
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

.toast-card--info {
  border-color: rgb(var(--color-line-strong) / 0.7);
}

.toast-card--error {
  border-color: rgb(var(--color-accent) / 0.42);
  background: rgb(var(--color-accent) / 0.08);
}

.toast-card--error::after {
  background: rgb(var(--color-accent));
}

.toast-card__action {
  flex-shrink: 0;
  align-self: center;
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-ink) / 0.65);
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: transform 140ms var(--motion-press), background-color 140ms var(--motion-soft);
  -webkit-tap-highlight-color: transparent;
}

.toast-card__action:hover {
  background: rgb(var(--color-ink) / 0.88);
}

.toast-card__action:focus-visible,
.toast-card button:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.toast-card__action:active {
  transform: scale(0.95);
}

.toast-card--error .toast-card__action {
  background: rgb(var(--color-accent));
  border-color: rgb(var(--color-accent));
  color: rgb(var(--color-paper));
}

.toast-card--success .toast-card__action {
  background: rgb(var(--color-forest));
  border-color: rgb(var(--color-forest));
  color: rgb(var(--color-paper));
}

@media (max-width: 639px) {
  .toaster {
    top: auto;
    bottom: calc(env(safe-area-inset-bottom, 0px) + var(--keyboard-inset, 0px) + 0.75rem);
    padding-inline: 0.75rem;
  }

  .toast-card {
    width: min(100%, 26rem);
    border-radius: 10px;
    background: rgb(var(--color-surface-raised) / 0.98);
  }

  .toast-card__action {
    min-height: 34px;
    padding-inline: 0.8rem;
  }

  .toast-enter-from {
    transform: translateY(10px) scale(0.985);
  }

  .toast-leave-to {
    transform: translateY(8px) scale(0.985);
  }
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
