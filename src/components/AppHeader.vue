<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { useI18n } from '../lib/i18n'
import type { ThemeMode } from '../composables/useTheme'

interface Props {
  healthStatus: 'checking' | 'online' | 'offline'
  healthMessage: string
  theme: ThemeMode
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'refreshHealth'): void
  (e: 'toggleTheme'): void
  (e: 'openHistory'): void
  (e: 'openSettings'): void
  (e: 'openCommandPalette'): void
  (e: 'reset'): void
}>()

const { t } = useI18n()

const headerRef = ref<HTMLElement | null>(null)
const menuOpen = ref(false)

const dotClass = computed(() => {
  if (props.healthStatus === 'online') return 'bg-forest health-dot health-dot--online'
  if (props.healthStatus === 'offline') return 'bg-accent health-dot health-dot--offline'
  return 'bg-muted/60 animate-breathe'
})

const labelText = computed(() => {
  if (props.healthStatus === 'online') return t('header.healthOnline')
  if (props.healthStatus === 'offline') return t('header.healthOffline')
  return t('header.healthChecking')
})

function closeMenu() {
  menuOpen.value = false
}

function runMenuAction(action: () => void) {
  action()
  closeMenu()
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!menuOpen.value) return
  const target = event.target
  if (target instanceof Node && headerRef.value?.contains(target)) return
  closeMenu()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenu()
}

watch(menuOpen, (open) => {
  if (typeof window === 'undefined') return
  if (open) {
    window.addEventListener('pointerdown', onDocumentPointerDown)
    window.addEventListener('keydown', onKeydown)
  } else {
    window.removeEventListener('pointerdown', onDocumentPointerDown)
    window.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <header ref="headerRef" class="app-header sticky top-0 z-header pt-[env(safe-area-inset-top)]">
    <div
      class="mx-auto flex w-full max-w-[1560px] items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-6 lg:px-10 lg:py-4"
    >
      <div class="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <span class="brand-mark" aria-hidden="true">
          <img src="/brand/promptcanvas-icon-96.png" alt="" width="40" height="40" decoding="async" />
        </span>
        <div class="min-w-0 leading-tight">
          <p class="truncate font-display text-[18px] tracking-tightish">
            Prompt<span class="gradient-text italic">Canvas</span>
          </p>
          <p class="mt-0.5 hidden font-mono text-[10px] uppercase tracking-[0.22em] text-muted sm:block">
            {{ t('header.atelier') }}
          </p>
        </div>
      </div>

      <div class="header-actions-wide flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          class="cmdk-hint hidden md:inline-flex"
          data-tour="cmdk-hint"
          :title="t('header.cmdkOpenTitle')"
          :aria-label="t('header.cmdkOpenTitle')"
          @click="emit('openCommandPalette')"
        >
          <Icon name="search" :size="13" />
          <span>{{ t('header.cmdkSearch') }}</span>
          <kbd>⌘K</kbd>
        </button>

        <button
          type="button"
          class="icon-btn"
          :title="t('header.history')"
          :aria-label="t('header.history')"
          @click="emit('openHistory')"
        >
          <Icon name="history" :size="17" />
        </button>

        <button
          type="button"
          class="icon-btn"
          :title="t('header.settings')"
          :aria-label="t('header.settings')"
          @click="emit('openSettings')"
        >
          <Icon name="settings" :size="17" />
        </button>

        <button
          type="button"
          class="icon-btn"
          :title="theme === 'paper' ? t('header.toggleThemeToNight') : t('header.toggleThemeToPaper')"
          :aria-label="theme === 'paper' ? t('header.toggleThemeToNight') : t('header.toggleThemeToPaper')"
          @click="emit('toggleTheme')"
        >
          <Icon :name="theme === 'paper' ? 'moon' : 'sun'" :size="17" />
        </button>

        <button
          type="button"
          class="health-pill inline-flex h-10 items-center gap-2 px-2.5 text-[11px] font-medium uppercase tracking-[0.12em] active:translate-y-px sm:px-3"
          :class="{
            'health-pill--checking': healthStatus === 'checking',
            'health-pill--online': healthStatus === 'online',
            'health-pill--offline': healthStatus === 'offline',
          }"
          :title="healthMessage"
          :aria-label="`${t('header.refresh')} · ${labelText}`"
          @click="emit('refreshHealth')"
        >
          <span class="h-1.5 w-1.5 rounded-full" :class="dotClass" aria-hidden="true"></span>
          <span class="hidden sm:inline">{{ labelText }}</span>
        </button>

        <button
          type="button"
          class="reset-pill hidden items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] sm:inline-flex"
          :title="t('header.resetTip')"
          :aria-label="t('header.resetTip')"
          @click="emit('reset')"
        >
          <Icon name="reset" :size="13" />
          <span>{{ t('header.reset') }}</span>
        </button>
      </div>

      <div class="header-actions-compact relative hidden shrink-0" data-tour="header-menu">
        <button
          type="button"
          class="icon-btn"
          :aria-label="t('header.menuOpen')"
          :aria-expanded="menuOpen"
          aria-controls="app-header-menu"
          @click="menuOpen = !menuOpen"
        >
          <Icon :name="menuOpen ? 'close' : 'menu'" :size="17" />
        </button>

        <Transition name="header-menu">
          <div
            v-if="menuOpen"
            id="app-header-menu"
            class="surface-2 absolute right-0 top-[calc(100%+0.6rem)] w-52 overflow-hidden p-1.5 text-ink"
          >
            <button type="button" class="header-menu-item" @click="runMenuAction(() => emit('openHistory'))">
              <Icon name="history" :size="14" />
              <span>{{ t('header.history') }}</span>
            </button>
            <button type="button" class="header-menu-item" @click="runMenuAction(() => emit('openSettings'))">
              <Icon name="settings" :size="14" />
              <span>{{ t('header.settings') }}</span>
            </button>
            <button type="button" class="header-menu-item" @click="runMenuAction(() => emit('toggleTheme'))">
              <Icon :name="theme === 'paper' ? 'moon' : 'sun'" :size="14" />
              <span>{{ theme === 'paper' ? t('header.toggleThemeToNight') : t('header.toggleThemeToPaper') }}</span>
            </button>
            <button type="button" class="header-menu-item" @click="runMenuAction(() => emit('refreshHealth'))">
              <span class="h-1.5 w-1.5 rounded-full" :class="dotClass" aria-hidden="true"></span>
              <span>{{ labelText }}</span>
            </button>
            <button type="button" class="header-menu-item" @click="runMenuAction(() => emit('reset'))">
              <Icon name="reset" :size="14" />
              <span>{{ t('header.reset') }}</span>
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  border-bottom: 1px solid rgb(var(--color-line) / 0.8);
  background: rgb(var(--color-surface) / 0.96);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-glass-sm);
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 14px;
  border: 1px solid rgb(var(--color-line) / 0.75);
  background: rgb(var(--color-surface-raised) / 1);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-inner-glass), var(--shadow-glass-sm);
  overflow: hidden;
  transition: transform 220ms var(--motion-press), box-shadow 220ms var(--motion-soft);
}

.cmdk-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  height: 36px;
  padding: 0 0.65rem 0 0.85rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.8);
  background: rgb(var(--color-surface-muted) / 0.96);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-inner-glass);
  color: rgb(var(--color-muted));
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: border-color 160ms var(--motion-soft), background-color 160ms var(--motion-soft), color 160ms ease, box-shadow 180ms var(--motion-soft), transform 160ms var(--motion-press);
  -webkit-tap-highlight-color: transparent;
}

.cmdk-hint:hover {
  border-color: rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-surface-raised) / 1);
  box-shadow: var(--shadow-glass-sm);
  color: rgb(var(--color-ink));
  transform: translateY(-1px);
}

.cmdk-hint:active {
  transform: translateY(0);
}

.cmdk-hint:focus-visible,
.health-pill:focus-visible,
.reset-pill:focus-visible,
.header-menu-item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.cmdk-hint kbd {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  padding: 0.16rem 0.4rem;
  border-radius: 5px;
  border: 1px solid rgb(var(--color-line-strong) / 0.4);
  background: rgb(var(--color-surface-raised) / 1);
  color: rgb(var(--color-ink));
  letter-spacing: 0.04em;
}

.brand-mark:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-inner-glass), var(--shadow-glass);
}

.brand-mark img {
  width: 100%;
  height: 100%;
  display: block;
}

.health-dot {
  position: relative;
}

.health-dot::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0;
}

.health-dot--online::after {
  background: rgb(var(--color-forest));
  animation: health-halo 2.6s ease-in-out infinite;
}

.health-dot--offline::after {
  background: rgb(var(--color-accent));
  animation: health-halo 1.8s ease-out infinite;
}

@keyframes health-halo {
  0% {
    opacity: 0.45;
    transform: scale(0.8);
  }
  70%, 100% {
    opacity: 0;
    transform: scale(2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .health-dot::after,
  .brand-mark {
    animation: none;
    transition: none;
  }
}

.header-menu-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.55rem;
  border-radius: var(--radius-field);
  padding: 0.65rem 0.75rem;
  font-size: 13px;
  font-weight: 500;
  color: rgb(var(--color-ink));
  transition: background-color 160ms var(--motion-soft), color 160ms var(--motion-soft), transform 140ms var(--motion-press);
}

.header-menu-item:hover {
  background: rgb(var(--color-surface-muted) / 0.95);
}

.header-menu-item:active {
  transform: translateY(1px);
}

.header-menu-enter-from,
.header-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

.header-menu-enter-active,
.header-menu-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

@media (max-width: 430px) {
  .header-actions-wide {
    display: none;
  }

  .header-actions-compact {
    display: block;
  }
}

@media (prefers-reduced-motion: reduce) {
  .header-menu-item,
  .header-menu-enter-active,
  .header-menu-leave-active {
    transition: none;
  }
}
</style>
