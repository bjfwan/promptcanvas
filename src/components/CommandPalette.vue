<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { sizeOptions } from '../presets'
import { useFocusTrap } from '../composables/useFocusTrap'
import { useBodyLock } from '../composables/useBodyLock'
import { useResolutionSupport } from '../composables/useResolutionSupport'
import { useI18n } from '../lib/i18n'
import type { ImageSize } from '../types'

interface Props {
  open: boolean
  installAvailable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  installAvailable: false,
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'pick-size', value: ImageSize): void
  (e: 'open-history'): void
  (e: 'open-settings'): void
  (e: 'open-shortcuts'): void
  (e: 'install-app'): void
  (e: 'toggle-theme'): void
  (e: 'reset'): void
  (e: 'generate'): void
  (e: 'focus-prompt'): void
}>()

interface CommandItem {
  id: string
  group: string
  label: string
  hint?: string
  icon?: string
  keywords: string
  shortcut?: string
  run: () => void
}

const { t } = useI18n()
const resolutionSupport = useResolutionSupport()

const inputRef = ref<HTMLInputElement | null>(null)
const dialogRef = ref<HTMLElement | null>(null)
const query = ref('')
const activeIndex = ref(0)

const commands = computed<CommandItem[]>(() => {
  const list: CommandItem[] = [
    {
      id: 'focus-prompt',
      group: t('cmd.group.action'),
      label: t('cmd.focusPrompt'),
      hint: t('cmd.focusPrompt.hint'),
      icon: 'textCursor',
      keywords: 'prompt focus write input compose 写 提示',
      run: () => emit('focus-prompt'),
    },
    {
      id: 'generate',
      group: t('cmd.group.action'),
      label: t('cmd.generate'),
      hint: t('cmd.generate.hint'),
      icon: 'lightning',
      shortcut: '⌘ ↵',
      keywords: 'generate run create render 生成 出图',
      run: () => emit('generate'),
    },
    {
      id: 'open-settings',
      group: t('cmd.group.nav'),
      label: t('cmd.openSettings'),
      icon: 'settings',
      shortcut: ',',
      keywords: 'settings provider api key endpoint baseurl 设置 凭据',
      run: () => emit('open-settings'),
    },
    {
      id: 'open-history',
      group: t('cmd.group.nav'),
      label: t('cmd.openHistory'),
      icon: 'history',
      shortcut: 'H',
      keywords: 'history past archive 历史',
      run: () => emit('open-history'),
    },
    {
      id: 'open-shortcuts',
      group: t('cmd.group.nav'),
      label: t('cmd.openShortcuts'),
      icon: 'keyboard',
      shortcut: '?',
      keywords: 'keyboard shortcut hotkey help cheatsheet 快捷键 键盘 帮助',
      run: () => emit('open-shortcuts'),
    },
    {
      id: 'toggle-theme',
      group: t('cmd.group.appearance'),
      label: t('cmd.toggleTheme'),
      icon: 'moon',
      keywords: 'theme dark night day light paper 主题 深色 浅色',
      run: () => emit('toggle-theme'),
    },
    {
      id: 'reset',
      group: t('cmd.group.action'),
      label: t('cmd.reset'),
      icon: 'reset',
      keywords: 'reset clear new fresh start 重置 清空 新建',
      run: () => emit('reset'),
    },
  ]

  if (props.installAvailable) {
    list.push({
      id: 'install-app',
      group: t('cmd.group.action'),
      label: t('cmd.installApp'),
      hint: t('cmd.installApp.hint'),
      icon: 'download',
      keywords: 'install pwa app desktop offline 安装 桌面 应用 离线',
      run: () => emit('install-app'),
    })
  }

  for (const size of sizeOptions) {
    if (!resolutionSupport.isTierUnlocked(size.tier)) continue
    const label = t(`size.${size.value}.label`)
    const hint = t(`size.${size.value}.hint`)
    list.push({
      id: `size-${size.value}`,
      group: t('cmd.group.size'),
      label: `${label} · ${size.value}`,
      hint,
      icon: 'ratio',
      keywords: `${label} ${size.label} ${size.value} ${hint} ${size.hint}`,
      run: () => emit('pick-size', size.value),
    })
  }

  return list
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return commands.value
  const tokens = q.split(/\s+/).filter(Boolean)
  return commands.value.filter((command) => {
    const haystack = `${command.label} ${command.hint ?? ''} ${command.keywords}`.toLowerCase()
    return tokens.every((token) => haystack.includes(token))
  })
})

const grouped = computed(() => {
  const map = new Map<string, CommandItem[]>()
  for (const command of filtered.value) {
    const bucket = map.get(command.group) ?? []
    bucket.push(command)
    map.set(command.group, bucket)
  }
  return Array.from(map.entries())
})

const flatList = computed(() => filtered.value)

function close() {
  emit('update:open', false)
}

function commit(command: CommandItem) {
  command.run()
  close()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, flatList.value.length - 1)
    scrollActiveIntoView()
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
    scrollActiveIntoView()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const target = flatList.value[activeIndex.value]
    if (target) commit(target)
  }
}

function scrollActiveIntoView() {
  nextTick(() => {
    const el = dialogRef.value?.querySelector<HTMLElement>(`[data-cmd-index="${activeIndex.value}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  })
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      query.value = ''
      activeIndex.value = 0
      window.addEventListener('keydown', onKeydown, { capture: true })
      nextTick(() => inputRef.value?.focus())
    } else {
      window.removeEventListener('keydown', onKeydown, { capture: true })
    }
  },
  { immediate: true },
)

watch(query, () => {
  activeIndex.value = 0
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, { capture: true })
})

useFocusTrap(() => props.open, dialogRef)
useBodyLock(() => props.open)

function indexOfCommand(command: CommandItem) {
  return flatList.value.indexOf(command)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cmd-fade">
      <div
        v-if="open"
        class="cmd-overlay fixed inset-0 z-sheet flex items-end justify-center px-0 sm:items-start sm:px-3"
        role="dialog"
        aria-modal="true"
        :aria-label="t('cmd.tip.palette')"
        @click.self="close"
      >
        <div class="scrim" aria-hidden="true" @click="close"></div>

        <Transition name="cmd-zoom">
          <div
            ref="dialogRef"
            v-if="open"
            class="cmd-shell relative w-full max-w-xl overflow-hidden text-ink"
          >
            <div class="cmd-shell__search flex items-center gap-2.5 border-b border-line/40 px-4 py-3">
              <Icon name="search" :size="16" class="text-accent" />
              <input
                ref="inputRef"
                v-model="query"
                type="text"
                class="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/60"
                :placeholder="t('cmd.placeholder')"
                autocomplete="off"
                spellcheck="false"
                :aria-label="t('cmd.placeholder')"
              />
              <kbd class="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted sm:inline-flex">esc</kbd>
            </div>

            <div class="cmd-shell__list touch-scroll-y overflow-y-auto p-2">
              <div v-if="!flatList.length" class="px-4 py-12 text-center text-[13px] text-muted">
                {{ t('cmd.empty') }}
              </div>

              <template v-else>
                <div v-for="(bucket, bucketIndex) in grouped" :key="bucket[0]" class="mb-1.5 last:mb-0">
                  <p
                    class="mb-0.5 px-2 pt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted"
                    :class="{ 'mt-1.5': bucketIndex > 0 }"
                  >
                    {{ bucket[0] }}
                  </p>
                  <ul class="space-y-0.5">
                    <li
                      v-for="command in bucket[1]"
                      :key="command.id"
                      :data-cmd-index="indexOfCommand(command)"
                    >
                      <button
                        type="button"
                        class="cmd-item"
                        :class="{ 'cmd-item--active': activeIndex === indexOfCommand(command) }"
                        @mouseenter="activeIndex = indexOfCommand(command)"
                        @click="commit(command)"
                      >
                        <span class="cmd-item__icon">
                          <Icon v-if="command.icon" :name="command.icon as any" :size="14" />
                        </span>
                        <span class="min-w-0 flex-1 text-left">
                          <span class="block truncate text-[13px] font-medium leading-tight">{{ command.label }}</span>
                          <span v-if="command.hint" class="mt-0.5 block truncate text-[11px] leading-snug text-muted">{{ command.hint }}</span>
                        </span>
                        <kbd v-if="command.shortcut" class="cmd-item__shortcut">{{ command.shortcut }}</kbd>
                      </button>
                    </li>
                  </ul>
                </div>
              </template>
            </div>

            <footer class="cmd-shell__footer flex items-center gap-3 border-t border-line/40 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              <span class="inline-flex items-center gap-1.5">
                <kbd>↑</kbd><kbd>↓</kbd>
                <span class="ml-1 normal-case tracking-normal">{{ t('cmd.tip.navigate') }}</span>
              </span>
              <span class="inline-flex items-center gap-1.5">
                <kbd>↵</kbd>
                <span class="ml-1 normal-case tracking-normal">{{ t('cmd.tip.execute') }}</span>
              </span>
              <span class="ml-auto inline-flex items-center gap-1.5">
                <kbd>⌘</kbd><kbd>K</kbd>
                <span class="ml-1 normal-case tracking-normal">{{ t('cmd.tip.palette') }}</span>
              </span>
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cmd-shell {
  border: 1px solid rgb(var(--color-line) / 0.82);
  border-radius: var(--radius-card);
  background: rgb(var(--color-surface) / 0.98);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-glass-lg), var(--shadow-inner-glass);
}

.cmd-overlay {
  padding-top: 16dvh;
}

.cmd-shell__search,
.cmd-shell__footer {
  flex: 0 0 auto;
}

.cmd-shell__list {
  max-height: 60dvh;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-gutter: stable;
}

.cmd-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.65rem;
  border-radius: var(--radius-field);
  background: transparent;
  text-align: left;
  color: rgb(var(--color-ink));
  cursor: pointer;
  transition: background-color 160ms var(--motion-soft), color 160ms var(--motion-soft), transform 140ms var(--motion-press);
}

.cmd-item:hover {
  background: rgb(var(--color-surface-muted) / 0.95);
}

.cmd-item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.cmd-item:active {
  transform: translateY(1px);
}

.cmd-item--active {
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent);
}

.cmd-item--active .text-muted {
  color: rgb(255 255 255 / 0.78);
}

.cmd-item__icon {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-field);
  border: 1px solid rgb(var(--color-line) / 0.72);
  background: rgb(var(--color-surface-raised) / 0.95);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-inner-glass);
  color: rgb(var(--color-ink));
  flex-shrink: 0;
}

.cmd-item--active .cmd-item__icon {
  border-color: rgb(255 255 255 / 0.28);
  background: rgb(255 255 255 / 0.18);
  color: #fff;
}

.cmd-item__shortcut {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.04em;
  padding: 0.18rem 0.45rem;
  border-radius: 6px;
  border: 1px solid rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-vellum));
  color: rgb(var(--color-muted));
  white-space: nowrap;
}

.cmd-item--active .cmd-item__shortcut {
  border-color: rgb(255 255 255 / 0.34);
  background: rgb(255 255 255 / 0.16);
  color: #fff;
}

kbd {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  padding: 0.16rem 0.34rem;
  border-radius: 5px;
  border: 1px solid rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-vellum));
  color: rgb(var(--color-muted));
  letter-spacing: 0.04em;
}

.cmd-fade-enter-from,
.cmd-fade-leave-to {
  opacity: 0;
}

.cmd-fade-enter-active,
.cmd-fade-leave-active {
  transition: opacity 0.2s ease-out;
}

.cmd-zoom-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}

.cmd-zoom-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

.cmd-zoom-enter-active,
.cmd-zoom-leave-active {
  transition: opacity 0.22s ease-out, transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (max-width: 639px) {
  .cmd-overlay {
    padding-top: max(env(safe-area-inset-top, 0px), 0.5rem);
  }

  .cmd-shell {
    display: flex;
    max-height: calc(var(--mobile-viewport-height, 100dvh) - max(env(safe-area-inset-top, 0px), 0.5rem));
    flex-direction: column;
    border-bottom: 0;
    border-radius: 18px 18px 0 0;
  }

  .cmd-shell__search {
    padding: 0.85rem 1rem;
  }

  .cmd-shell__search input {
    min-height: 32px;
    font-size: 16px;
  }

  .cmd-shell__list {
    max-height: none;
    flex: 1 1 auto;
    padding: 0.45rem 0.55rem;
  }

  .cmd-item {
    min-height: 48px;
    padding: 0.68rem 0.65rem;
  }

  .cmd-item__shortcut {
    display: none;
  }

  .cmd-shell__footer {
    display: none;
  }

  .cmd-zoom-enter-from,
  .cmd-zoom-leave-to {
    opacity: 0;
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cmd-fade-enter-active,
  .cmd-fade-leave-active,
  .cmd-zoom-enter-active,
  .cmd-zoom-leave-active {
    transition: none;
  }
}
</style>
