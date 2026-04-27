<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import Icon from './Icon.vue'

interface Props {
  isGenerating: boolean
  elapsedSeconds: number
  canGenerate: boolean
  styleLabel: string
  size: string
  count: number
}

const props = defineProps<Props>()
const prompt = defineModel<string>('prompt', { required: true })

const emit = defineEmits<{
  (e: 'generate'): void
  (e: 'open-composer'): void
  (e: 'open-history'): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const expanded = ref(false)

const promptCount = computed(() => prompt.value.length)

function autosize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  const max = expanded.value ? 220 : 110
  el.style.height = `${Math.min(el.scrollHeight, max)}px`
}

function focusInput() {
  expanded.value = true
  nextTick(() => {
    textareaRef.value?.focus()
    autosize()
  })
}

defineExpose({ focusInput })

watch(prompt, () => {
  nextTick(autosize)
})

watch(expanded, () => {
  nextTick(autosize)
})

function onBlur() {
  // 给一点时间让按钮事件触发
  window.setTimeout(() => {
    expanded.value = false
    autosize()
  }, 120)
}
</script>

<template>
  <div
    class="fixed inset-x-0 bottom-0 z-dock pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] pt-2 lg:hidden"
  >
    <div class="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-paper to-transparent"></div>
    <div class="relative mx-3 rounded-3xl border border-line bg-vellum/95 shadow-paper-3 backdrop-blur">
      <div class="flex items-center justify-between gap-2 border-b border-line/70 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.18em] text-muted">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition hover:bg-paper-soft hover:text-ink"
          aria-label="打开完整设置"
          @click="emit('open-composer')"
        >
          <Icon name="sliders" :size="12" />
          <span>{{ styleLabel }} · {{ size }} · ×{{ count }}</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full px-2 py-1 transition hover:bg-paper-soft hover:text-ink"
          aria-label="历史生成"
          @click="emit('open-history')"
        >
          <Icon name="history" :size="12" />
          <span>历史</span>
        </button>
      </div>

      <div class="flex items-end gap-2 px-3 py-2">
        <button
          type="button"
          class="inline-grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-line bg-cream text-ink transition hover:border-line-strong"
          aria-label="完整设置"
          @click="emit('open-composer')"
        >
          <Icon name="settings" :size="16" />
        </button>

        <textarea
          ref="textareaRef"
          v-model="prompt"
          rows="1"
          maxlength="1200"
          placeholder="今天画点什么…"
          class="min-h-[40px] flex-1 resize-none rounded-2xl border border-transparent bg-transparent px-1 py-2 text-[15px] leading-6 text-ink outline-none placeholder:text-muted/70"
          @focus="expanded = true"
          @input="autosize"
          @blur="onBlur"
        ></textarea>

        <button
          type="button"
          class="relative inline-grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-ink text-paper shadow-paper-2 transition active:translate-y-px disabled:cursor-not-allowed disabled:bg-ink/30 disabled:text-paper/70"
          :disabled="!canGenerate"
          aria-label="生成图片"
          @click="emit('generate')"
        >
          <Icon
            :name="isGenerating ? 'sparkle' : 'send'"
            :size="16"
            :class="isGenerating ? 'animate-breathe' : ''"
          />
          <span
            v-if="isGenerating"
            class="pointer-events-none absolute inset-y-0 -inset-x-1/2 bg-gradient-to-r from-transparent via-paper/15 to-transparent animate-progress-sweep"
            aria-hidden="true"
          ></span>
        </button>
      </div>

      <div
        v-if="isGenerating || promptCount > 0"
        class="flex items-center justify-between px-4 pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted"
      >
        <span v-if="isGenerating">composing · {{ elapsedSeconds }}s</span>
        <span v-else>{{ promptCount }} / 1200</span>
        <span class="hidden xs:inline">⌘ ↵ 提交</span>
      </div>
    </div>
  </div>
</template>
