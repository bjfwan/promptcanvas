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
  (e: 'reset'): void
}>()

const { t } = useI18n()

const headerRef = ref<HTMLElement | null>(null)
const menuOpen = ref(false)

const dotClass = computed(() => {
  if (props.healthStatus === 'online') return 'bg-forest health-dot health-dot--online'
  if (props.healthStatus === 'offline') return 'health-dot health-dot--offline'
  return 'bg-muted/60 animate-breathe'
})

const labelText = computed(() => {
  if (props.healthStatus === 'online') return t('header.healthOnline')
  if (props.healthStatus === 'offline') return t('header.healthOffline')
  return t('header.healthChecking')
})

const themeActionLabel = computed(() =>
  props.theme === 'paper' ? t('header.toggleThemeToNight') : t('header.toggleThemeToPaper'),
)

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
  <header ref="headerRef" class="app-header sticky top-0 z-header">
    <div
      class="mx-auto flex w-full max-w-[1560px] items-center justify-between gap-2 py-2.5 pl-[max(env(safe-area-inset-left,0px),0.75rem)] pr-[max(env(safe-area-inset-right,0px),0.75rem)] sm:gap-4 sm:pl-[max(env(safe-area-inset-left,0px),1.5rem)] sm:pr-[max(env(safe-area-inset-right,0px),1.5rem)] lg:pl-[max(env(safe-area-inset-left,0px),2.5rem)] lg:pr-[max(env(safe-area-inset-right,0px),2.5rem)] lg:py-4"
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

      <div class="header-actions-wide flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          class="header-action-btn"
          :title="t('header.history')"
          :aria-label="t('header.history')"
          @click="emit('openHistory')"
        >
          <Icon name="history" :size="17" />
          <span class="header-action-label">{{ t('header.history') }}</span>
        </button>

        <button
          type="button"
          class="header-action-btn"
          :title="t('header.settings')"
          :aria-label="t('header.settings')"
          @click="emit('openSettings')"
        >
          <Icon name="settings" :size="17" />
          <span class="header-action-label">{{ t('header.settings') }}</span>
        </button>

        <button
          type="button"
          class="header-action-btn header-action-btn--theme"
          :title="themeActionLabel"
          :aria-label="themeActionLabel"
          @click="emit('toggleTheme')"
        >
          <Icon :name="theme === 'paper' ? 'moon' : 'sun'" :size="17" />
          <span class="header-action-label">{{ themeActionLabel }}</span>
        </button>

        <button
          type="button"
          class="header-action-btn header-action-btn--status health-pill"
          :class="{
            'health-pill--checking': healthStatus === 'checking',
            'health-pill--online': healthStatus === 'online',
            'health-pill--offline': healthStatus === 'offline',
          }"
          :title="healthMessage"
          :aria-label="`${t('header.refresh')} · ${t('header.status')}: ${labelText}`"
          @click="emit('refreshHealth')"
        >
          <span class="h-1.5 w-1.5 rounded-full" :class="dotClass" aria-hidden="true"></span>
          <span class="header-action-label">{{ t('header.status') }}: {{ labelText }}</span>
        </button>

        <button
          type="button"
          class="header-action-btn header-action-btn--reset"
          :title="t('header.resetTip')"
          :aria-label="t('header.resetTip')"
          @click="emit('reset')"
        >
          <Icon name="reset" :size="13" />
          <span class="header-action-label">{{ t('header.reset') }}</span>
        </button>
      </div>

      <div class="header-actions-compact relative hidden shrink-0">
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
              <span>{{ t('header.status') }}: {{ labelText }}</span>
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

.header-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-width: 0;
  max-width: 12rem;
  height: 40px;
  padding: 0 0.75rem;
  border-radius: 8px;
  border: 1px solid rgb(var(--color-line) / 0.8);
  background: rgb(var(--color-surface) / 0.95);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-inner-glass);
  color: rgb(var(--color-ink));
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 160ms var(--motion-soft), background-color 160ms var(--motion-soft), color 160ms ease, box-shadow 180ms var(--motion-soft), transform 160ms var(--motion-press);
  -webkit-tap-highlight-color: transparent;
}

.header-action-btn:hover {
  border-color: rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-surface-raised) / 1);
  box-shadow: var(--shadow-glass-sm);
  color: rgb(var(--color-ink));
  transform: translateY(-1px);
}

.header-action-btn:active {
  transform: translateY(0);
}

.header-action-btn:focus-visible,
.header-menu-item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.header-action-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-action-btn--theme {
  max-width: 11.5rem;
}

.header-action-btn--status {
  max-width: 10.5rem;
  color: rgb(var(--color-muted));
}

.header-action-btn--reset {
  max-width: 7.5rem;
}

.health-pill--offline {
  border-color: rgb(var(--color-clay) / 0.5);
  background: rgb(var(--color-clay) / 0.1);
  color: rgb(var(--color-clay));
}

.health-pill--offline:hover {
  border-color: rgb(var(--color-clay) / 0.68);
  background: rgb(var(--color-clay) / 0.14);
  color: rgb(var(--color-clay));
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
  background: rgb(var(--color-clay));
  animation: health-halo 1.8s ease-out infinite;
}

.health-dot--offline {
  background: rgb(var(--color-clay));
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
  .brand-mark,
  .header-action-btn {
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

@media (max-width: 760px) {
  .header-actions-wide {
    display: none;
  }

  .header-actions-compact {
    display: block;
  }
}

@media (display-mode: standalone), (display-mode: fullscreen) {
  .app-header {
    padding-top: env(safe-area-inset-top, 0px);
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
