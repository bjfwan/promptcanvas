<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { useFocusTrap } from '../composables/useFocusTrap'
import { useBodyLock } from '../composables/useBodyLock'
import { useI18n } from '../lib/i18n'

interface Props {
  open: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const dialogRef = ref<HTMLElement | null>(null)
const { t } = useI18n()

interface Shortcut {
  keys: string[]
  label: string
}

interface ShortcutGroup {
  title: string
  items: Shortcut[]
}

const groups = computed<ShortcutGroup[]>(() => [
  {
    title: t('shortcuts.group.global'),
    items: [
      { keys: ['⌘', 'K'], label: t('shortcuts.global.cmdk') },
      { keys: ['/'], label: t('shortcuts.global.slash') },
      { keys: ['?'], label: t('shortcuts.global.question') },
      { keys: ['Esc'], label: t('shortcuts.global.esc') },
    ],
  },
  {
    title: t('shortcuts.group.generate'),
    items: [
      { keys: ['⌘', '↵'], label: t('shortcuts.gen.submit') },
      { keys: ['Ctrl', '↵'], label: t('shortcuts.gen.submitCtrl') },
    ],
  },
  {
    title: t('shortcuts.group.lightbox'),
    items: [
      { keys: ['←'], label: t('shortcuts.lb.prev') },
      { keys: ['→'], label: t('shortcuts.lb.next') },
      { keys: ['Space'], label: t('shortcuts.lb.zoom') },
      { keys: ['+', '−'], label: t('shortcuts.lb.plusminus') },
      { keys: ['0'], label: t('shortcuts.lb.reset') },
      { keys: ['I'], label: t('shortcuts.lb.info') },
    ],
  },
  {
    title: t('shortcuts.group.gestures'),
    items: [
      { keys: [t('shortcuts.gesture.pinch')], label: t('shortcuts.gesture.pinch.desc') },
      { keys: [t('shortcuts.gesture.pan')], label: t('shortcuts.gesture.pan.desc') },
      { keys: [t('shortcuts.gesture.swipe')], label: t('shortcuts.gesture.swipe.desc') },
      { keys: [t('shortcuts.gesture.dbltap')], label: t('shortcuts.gesture.dbltap.desc') },
    ],
  },
])

function close() {
  emit('update:open', false)
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
})

useFocusTrap(() => props.open, dialogRef)
useBodyLock(() => props.open)
</script>

<template>
  <Teleport to="body">
    <Transition name="sk-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-sheet flex items-end justify-center px-0 py-0 sm:items-center sm:px-4 sm:py-6"
        role="dialog"
        aria-modal="true"
        aria-label="键盘快捷键"
        @click.self="close"
      >
        <div class="scrim" aria-hidden="true" @click="close"></div>

        <Transition name="sk-zoom">
          <div
            v-if="open"
            ref="dialogRef"
            class="shortcuts-shell relative flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-line-strong bg-vellum text-ink shadow-paper-3 sm:max-h-[78dvh] sm:rounded-3xl"
          >
            <header class="flex items-start justify-between border-b border-line/70 px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <p class="display-eyebrow">{{ t('shortcuts.eyebrow') }}</p>
                <h2 class="mt-1 inline-flex items-center gap-2 font-display text-2xl tracking-tightish">
                  <Icon name="keyboard" :size="18" class="text-muted" />
                  <span>{{ t('shortcuts.title') }}</span>
                </h2>
              </div>
              <button type="button" class="icon-btn-sm" :aria-label="t('header.menuShortcuts')" @click="close">
                <Icon name="close" :size="14" />
              </button>
            </header>

            <div class="touch-scroll-y flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <section v-for="group in groups" :key="group.title" class="shortcuts-group">
                <h3 class="shortcuts-group__title">{{ group.title }}</h3>
                <ul class="shortcuts-group__list">
                  <li v-for="item in group.items" :key="item.label" class="shortcuts-row">
                    <span class="shortcuts-row__label">{{ item.label }}</span>
                    <span class="shortcuts-row__keys">
                      <template v-for="(key, idx) in item.keys" :key="key + idx">
                        <kbd class="shortcuts-kbd">{{ key }}</kbd>
                        <span
                          v-if="idx < item.keys.length - 1 && item.keys.length === 2 && !key.startsWith('Ctrl')"
                          class="shortcuts-row__plus"
                          aria-hidden="true"
                        >
                          +
                        </span>
                      </template>
                    </span>
                  </li>
                </ul>
              </section>
            </div>

            <footer class="border-t border-line/70 bg-paper-soft/50 px-5 py-3 text-[11px] leading-snug text-muted sm:px-6">
              <span>{{ t('shortcuts.note') }}</span>
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.shortcuts-shell {
  background:
    linear-gradient(180deg, rgb(var(--color-ivory) / 0.92), rgb(var(--color-vellum) / 0.96)),
    rgb(var(--color-vellum));
}

.shortcuts-group {
  margin-bottom: 1.4rem;
}

.shortcuts-group:last-child {
  margin-bottom: 0;
}

.shortcuts-group__title {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgb(var(--color-muted));
  margin: 0 0 0.55rem;
}

.shortcuts-group__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
}

.shortcuts-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  padding: 0.55rem 0.65rem;
  border-radius: 12px;
  transition: background-color 140ms ease;
}

.shortcuts-row:hover {
  background: rgb(var(--color-paper-soft) / 0.6);
}

.shortcuts-row__label {
  font-size: 13px;
  line-height: 1.4;
  color: rgb(var(--color-ink));
  flex: 1;
  min-width: 0;
}

.shortcuts-row__keys {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.shortcuts-row__plus {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  color: rgb(var(--color-muted) / 0.7);
}

.shortcuts-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  padding: 0.18rem 0.5rem;
  border-radius: 7px;
  border: 1px solid rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-vellum));
  color: rgb(var(--color-ink));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  box-shadow: 0 1px 0 rgb(var(--color-ink) / 0.06), inset 0 -1px 0 rgb(var(--color-ink) / 0.05);
}

.shortcuts-kbd--inline {
  font-size: 10px;
  min-width: 0;
  padding: 0.05rem 0.34rem;
  margin: 0 0.1rem;
}

.sk-fade-enter-from,
.sk-fade-leave-to {
  opacity: 0;
}

.sk-fade-enter-active,
.sk-fade-leave-active {
  transition: opacity 0.22s ease-out;
}

.sk-zoom-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}

.sk-zoom-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.sk-zoom-enter-active,
.sk-zoom-leave-active {
  transition: opacity 0.22s ease-out, transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (max-width: 639px) {
  .sk-zoom-enter-from,
  .sk-zoom-leave-to {
    opacity: 0;
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sk-fade-enter-active,
  .sk-fade-leave-active,
  .sk-zoom-enter-active,
  .sk-zoom-leave-active {
    transition: none;
  }
}
</style>
