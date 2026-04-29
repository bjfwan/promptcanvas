<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import type { ThemeMode } from '../composables/useTheme'

interface Props {
  healthStatus: 'checking' | 'online' | 'offline'
  healthMessage: string
  theme: ThemeMode
}

const props = defineProps<Props>()

defineEmits<{
  (e: 'refreshHealth'): void
  (e: 'toggleTheme'): void
  (e: 'openHistory'): void
  (e: 'openSettings'): void
  (e: 'reset'): void
}>()

const dotClass = computed(() => {
  if (props.healthStatus === 'online') return 'bg-forest'
  if (props.healthStatus === 'offline') return 'bg-accent'
  return 'bg-muted/60 animate-breathe'
})

const labelText = computed(() => {
  if (props.healthStatus === 'online') return '在线'
  if (props.healthStatus === 'offline') return '离线'
  return '检查中'
})
</script>

<template>
  <header class="sticky top-0 z-header border-b border-line/70 bg-paper/78 pt-[env(safe-area-inset-top)] shadow-paper-1 backdrop-blur-xl">
    <div
      class="mx-auto flex w-full max-w-[1560px] items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-6 lg:px-10 lg:py-4"
    >
      <div class="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <span
          class="grid h-10 w-10 shrink-0 place-items-center rounded-[1.05rem] border border-line-strong bg-vellum font-display text-base text-ink shadow-inner-paper"
          aria-hidden="true"
        >
          <span class="-mt-0.5 italic">P</span>
        </span>
        <div class="min-w-0 leading-tight">
          <p class="truncate font-display text-[18px] tracking-tightish">
            Prompt<span class="italic text-accent">Canvas</span>
          </p>
          <p class="mt-0.5 hidden font-mono text-[10px] uppercase tracking-[0.22em] text-muted sm:block">
            local image studio
          </p>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          class="icon-btn"
          title="历史生成"
          aria-label="历史生成"
          @click="$emit('openHistory')"
        >
          <Icon name="history" :size="17" />
        </button>

        <button
          type="button"
          class="icon-btn"
          title="设置"
          aria-label="设置"
          @click="$emit('openSettings')"
        >
          <Icon name="settings" :size="17" />
        </button>

        <button
          type="button"
          class="icon-btn"
          :title="theme === 'paper' ? '切换为夜间主题' : '切换为日间主题'"
          :aria-label="theme === 'paper' ? '切换为夜间主题' : '切换为日间主题'"
          @click="$emit('toggleTheme')"
        >
          <Icon :name="theme === 'paper' ? 'moon' : 'sun'" :size="17" />
        </button>

        <button
          type="button"
          class="inline-flex h-10 items-center gap-2 rounded-full border px-2.5 text-[11px] font-medium uppercase tracking-[0.12em] transition active:translate-y-px sm:px-3"
          :class="{
            'border-line bg-vellum text-muted': healthStatus === 'checking',
            'border-line-strong bg-vellum text-ink hover:bg-cream': healthStatus === 'online',
            'border-accent/40 bg-accent/[0.08] text-accent': healthStatus === 'offline',
          }"
          :title="healthMessage"
          :aria-label="`后端状态：${labelText}。点击重新检查。`"
          @click="$emit('refreshHealth')"
        >
          <span class="h-1.5 w-1.5 rounded-full" :class="dotClass" aria-hidden="true"></span>
          <span class="hidden sm:inline">{{ labelText }}</span>
        </button>

        <button
          type="button"
          class="hidden items-center gap-1.5 rounded-full border border-line bg-cream px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted transition hover:border-line-strong hover:text-ink sm:inline-flex"
          title="重置表单为默认值"
          aria-label="重置表单为默认值"
          @click="$emit('reset')"
        >
          <Icon name="reset" :size="13" />
          <span>重置</span>
        </button>
      </div>
    </div>
  </header>
</template>
