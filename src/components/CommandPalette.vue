<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { sizeOptions, styleOptions } from '../presets'
import { useFocusTrap } from '../composables/useFocusTrap'
import { useBodyLock } from '../composables/useBodyLock'
import { useI18n } from '../lib/i18n'
import type { ImageSize, ImageStyle } from '../types'

interface Props {
  open: boolean
  installAvailable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  installAvailable: false,
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'pick-style', value: ImageStyle): void
  (e: 'pick-size', value: ImageSize): void
  (e: 'open-history'): void
  (e: 'open-settings'): void
  (e: 'open-style-sheet'): void
  (e: 'open-shortcuts'): void
  (e: 'open-onboarding'): void
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
      id: 'open-style-sheet',
      group: t('cmd.group.nav'),
      label: t('cmd.openStyleSheet'),
      icon: 'palette',
      keywords: 'style mood preset 风格 模板',
      run: () => emit('open-style-sheet'),
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
      id: 'open-onboarding',
      group: t('cmd.group.nav'),
      label: t('cmd.openOnboarding'),
      icon: 'sparkle',
      keywords: 'onboarding tour walkthrough intro guide 引导 教程 入门',
      run: () => emit('open-onboarding'),
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

  for (const style of styleOptions) {
    list.push({
      id: `style-${style.value}`,
      group: t('cmd.group.style'),
      label: style.label,
      hint: style.description,
      icon: 'palette',
      keywords: `${style.label} ${style.accent} ${style.description}`,
      run: () => emit('pick-style', style.value),
    })
  }

  for (const size of sizeOptions) {
    list.push({
      id: `size-${size.value}`,
      group: t('cmd.group.size'),
      label: `${size.label} · ${size.value}`,
      hint: size.hint,
      icon: 'ratio',
      keywords: `${size.label} ${size.value} ${size.hint}`,
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
        class="fixed inset-0 z-sheet flex items-start justify-center px-3 pt-[16dvh] sm:pt-[18dvh]"
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
            class="cmd-shell relative w-full max-w-xl overflow-hidden rounded-[22px] border border-line-strong bg-vellum text-ink shadow-paper-3"
          >
            <div class="flex items-center gap-2.5 border-b border-line/70 px-4 py-3">
              <Icon name="search" :size="16" class="text-muted" />
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

            <div class="touch-scroll-y max-h-[60dvh] overflow-y-auto p-2">
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

            <footer class="flex items-center gap-3 border-t border-line/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
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
  background:
    linear-gradient(180deg, rgb(var(--color-ivory) / 0.94), rgb(var(--color-vellum) / 0.96)),
    rgb(var(--color-vellum));
  backdrop-filter: blur(14px);
}

.cmd-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.65rem;
  border-radius: 12px;
  background: transparent;
  text-align: left;
  color: rgb(var(--color-ink));
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease, transform 120ms var(--motion-press);
}

.cmd-item:active {
  transform: translateY(1px);
}

.cmd-item--active {
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
}

.cmd-item--active .text-muted {
  color: rgb(var(--color-paper) / 0.7);
}

.cmd-item__icon {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: rgb(var(--color-paper-soft) / 0.7);
  color: rgb(var(--color-ink));
  flex-shrink: 0;
}

.cmd-item--active .cmd-item__icon {
  background: rgb(var(--color-paper) / 0.16);
  color: rgb(var(--color-paper));
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
  border-color: rgb(var(--color-paper) / 0.32);
  background: rgb(var(--color-paper) / 0.08);
  color: rgb(var(--color-paper));
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

@media (prefers-reduced-motion: reduce) {
  .cmd-fade-enter-active,
  .cmd-fade-leave-active,
  .cmd-zoom-enter-active,
  .cmd-zoom-leave-active {
    transition: none;
  }
}
</style>
