<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import Icon from './Icon.vue'
import StyleSwatch from './StyleSwatch.vue'
import Select, { type SelectOption } from './Select.vue'
import { customModelSentinel, sizeOptions, styleOptions } from '../presets'
import { useDiscoveredModels } from '../composables/useDiscoveredModels'
import type { ImageSize, ImageStyle } from '../types'

const sizeSelectOptions = computed<SelectOption<ImageSize>[]>(() =>
  sizeOptions.map((option) => ({ value: option.value, label: option.label, hint: option.hint })),
)

const countSelectOptions: SelectOption<number>[] = [
  { value: 1, label: '1 张', hint: '单张专注' },
  { value: 2, label: '2 张', hint: '快速对比' },
  { value: 3, label: '3 张', hint: '一组方案' },
  { value: 4, label: '4 张', hint: '广泛探索' },
]

const discoveredModels = useDiscoveredModels()

const modelChipOptions = computed<SelectOption<string>[]>(() =>
  discoveredModels.mergedModelOptions.value.map((option) => ({
    value: option.value,
    label: option.value === customModelSentinel ? '自定义…' : option.label,
    hint: option.hint,
  })),
)

interface Props {
  isGenerating: boolean
  elapsedSeconds: number
  canGenerate: boolean
  healthOffline: boolean
  layout?: 'panel' | 'sheet'
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'panel',
})

const prompt = defineModel<string>('prompt', { required: true })
const stl = defineModel<ImageStyle>('style', { required: true })
const size = defineModel<ImageSize>('size', { required: true })
const count = defineModel<number>('count', { required: true })
const modelChoice = defineModel<string>('modelChoice', { required: true })
const customModel = defineModel<string>('customModel', { required: true })

const emit = defineEmits<{
  (e: 'generate'): void
  (e: 'copy', text: string, message: string): void
  (e: 'clear'): void
  (e: 'open-settings'): void
}>()

const promptRef = ref<HTMLTextAreaElement | null>(null)

const promptCount = computed(() => prompt.value.length)
const promptTokens = computed(() => Math.max(1, Math.round(prompt.value.length / 4)))
const promptTone = computed(() => {
  const length = promptCount.value
  if (length < 24) return { label: '稀薄', tone: 'text-muted' }
  if (length < 80) return { label: '聚焦', tone: 'text-forest' }
  if (length < 240) return { label: '丰富', tone: 'text-ink' }
  if (length < 600) return { label: '稠密', tone: 'text-ochre' }
  return { label: '过载', tone: 'text-accent' }
})

const generateLabel = computed(() => {
  if (!prompt.value.trim()) return '写下提示词以生成'
  if (props.isGenerating) return 'Composing'
  return 'Generate'
})

const modelChipLabel = computed(() => {
  if (modelChoice.value === customModelSentinel) {
    const trimmed = customModel.value.trim()
    return trimmed ? `自定义 · ${trimmed}` : '自定义 · 未填写'
  }
  const match = discoveredModels.mergedModelOptions.value.find((option) => option.value === modelChoice.value)
  return match?.label ?? (modelChoice.value || '默认')
})

function focusPrompt() {
  nextTick(() => {
    promptRef.value?.focus()
  })
}

function clearPrompt() {
  prompt.value = ''
  emit('clear')
  focusPrompt()
}

defineExpose({ focusPrompt })

watch(modelChoice, (newValue, oldValue) => {
  if (newValue === customModelSentinel && oldValue !== customModelSentinel) {
    emit('open-settings')
  }
})

watch(
  () => props.layout,
  () => {
    if (props.layout === 'sheet') {
      focusPrompt()
    }
  },
)
</script>

<template>
  <form
    class="flex flex-col gap-7"
    :class="{ 'pb-2': layout === 'sheet' }"
    @submit.prevent="emit('generate')"
  >
    <header v-if="layout === 'panel'" class="space-y-2">
      <p class="display-eyebrow">01 · Compose</p>
      <h1 class="display-h1">写下你想看见的<span class="italic">画面</span></h1>
      <p class="text-[13px] leading-6 text-muted">
        像写一段电影旁白：主体、光线、色调、镜头、情绪。
        下方按你的表达选一个<span class="italic">提示词模板</span>可以一键塑造语气。
      </p>
    </header>

    <div
      v-if="healthOffline"
      class="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/[0.06] px-4 py-3 text-[13px] leading-6 text-accent"
      role="alert"
    >
      <Icon name="warning" :size="16" class="mt-0.5" />
      <span>后端当前不可用。检查连接后再生成图片。</span>
    </div>

    <!-- Prompt -->
    <section class="space-y-2.5">
      <div class="flex items-center justify-between">
        <label for="prompt-input" class="label inline-flex items-center gap-1.5">
          <Icon name="pencil" :size="12" />
          <span>提示词</span>
        </label>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted transition hover:bg-paper-soft hover:text-ink"
            @click="emit('copy', prompt, '已复制提示词')"
          >
            <Icon name="copy" :size="11" />
            <span>复制</span>
          </button>
          <button
            v-if="prompt.length"
            type="button"
            class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted transition hover:bg-paper-soft hover:text-ink"
            @click="clearPrompt"
          >
            <Icon name="eraser" :size="11" />
            <span>清空</span>
          </button>
        </div>
      </div>
      <div class="relative">
        <textarea
          id="prompt-input"
          ref="promptRef"
          v-model="prompt"
          :rows="layout === 'sheet' ? 5 : 6"
          maxlength="1200"
          class="field-textarea pb-12 pr-3"
          placeholder="一张极简咖啡品牌海报，暖色调，自然光，留白充足"
          autocomplete="off"
          spellcheck="false"
        ></textarea>
        <div class="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
          <span class="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-paper/85 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted backdrop-blur">
            <Icon name="layers" :size="10" />
            模型
          </span>
          <Select
            v-model="modelChoice"
            :options="modelChipOptions"
            variant="chip"
            align="end"
            aria-label="选择生成模型"
            class="pointer-events-auto"
            :placeholder="modelChipLabel"
          />
        </div>
      </div>
      <div class="flex items-center justify-between text-[11px]">
        <p class="flex items-center gap-2">
          <span class="font-mono uppercase tracking-[0.2em]" :class="promptTone.tone">{{ promptTone.label }}</span>
          <span class="font-mono text-muted/70">~{{ promptTokens }} tokens</span>
        </p>
        <p class="font-mono text-[10px] tabular-nums text-muted">{{ promptCount }} / 1200</p>
      </div>
      <p class="text-[10px] leading-snug text-muted">
        需要负面提示词、Seed、质量等高级参数？
        <button
          type="button"
          class="inline-flex items-center gap-1 text-ink underline-offset-2 hover:underline"
          @click="emit('open-settings')"
        >
          <Icon name="sliders" :size="11" />
          <span>打开设置</span>
        </button>。
      </p>
    </section>

    <!-- 提示词模板 -->
    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <label class="label inline-flex items-center gap-1.5">
          <Icon name="swatch" :size="12" />
          <span>提示词模板</span>
        </label>
        <span class="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{{ styleOptions.length }} 预设</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="item in styleOptions"
          :key="item.value"
          type="button"
          class="group relative flex items-center gap-3 rounded-2xl border bg-cream p-2.5 text-left transition"
          :class="
            stl === item.value
              ? 'border-ink bg-ink text-paper shadow-paper-2'
              : 'border-line text-ink hover:border-line-strong hover:bg-paper-soft'
          "
          :aria-pressed="stl === item.value"
          @click="stl = item.value"
        >
          <StyleSwatch :variant="item.value" :active="stl === item.value" />
          <span class="min-w-0 flex-1">
            <span class="block text-[13px] font-medium leading-tight">{{ item.label }}</span>
            <span
              class="mt-0.5 block text-[11px] leading-snug"
              :class="stl === item.value ? 'text-paper/65' : 'text-muted'"
            >
              {{ item.accent }}
            </span>
          </span>
        </button>
      </div>
    </section>

    <!-- Size / Count -->
    <section class="grid gap-4 sm:grid-cols-2">
      <div>
        <label class="label mb-2 inline-flex items-center gap-1.5" for="comp-size">
          <Icon name="ratio" :size="12" />
          <span>尺寸</span>
        </label>
        <Select
          id="comp-size"
          v-model="size"
          :options="sizeSelectOptions"
          aria-label="选择图片尺寸"
        />
      </div>
      <div>
        <label class="label mb-2 inline-flex items-center gap-1.5" for="comp-count">
          <Icon name="layers" :size="12" />
          <span>数量</span>
        </label>
        <Select
          id="comp-count"
          v-model="count"
          :options="countSelectOptions"
          aria-label="选择生成数量"
        />
      </div>
    </section>

    <!-- 桌面端粘性 generate；mobile sheet 中也保留 -->
    <div
      v-if="layout === 'panel'"
      class="sticky bottom-0 -mx-4 border-t border-line/80 bg-paper/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0 lg:backdrop-blur-none"
    >
      <button
        type="submit"
        :disabled="!canGenerate"
        class="btn-primary group relative w-full overflow-hidden px-5 py-4 text-sm shadow-paper-2 disabled:shadow-paper-1"
        aria-keyshortcuts="Meta+Enter Control+Enter"
      >
        <span class="flex w-full items-center justify-between gap-3">
          <span class="flex items-center gap-3">
            <Icon
              :name="isGenerating ? 'sparkle' : 'lightning'"
              :size="14"
              :class="isGenerating ? 'animate-breathe' : ''"
            />
            <span class="font-display text-base italic">{{ generateLabel }}</span>
            <span v-if="isGenerating" class="font-mono text-[11px] tabular-nums text-paper/70">{{ elapsedSeconds }}s</span>
          </span>
          <span class="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-paper/65 sm:inline" aria-hidden="true">⌘ ↵</span>
        </span>
        <span
          v-if="isGenerating"
          class="pointer-events-none absolute inset-y-0 -inset-x-1/2 bg-gradient-to-r from-transparent via-paper/15 to-transparent animate-progress-sweep"
          aria-hidden="true"
        ></span>
      </button>
    </div>

    <!-- sheet 模式：单独 sticky 提交按钮 -->
    <div v-else class="sticky bottom-0 -mx-5 border-t border-line/70 bg-paper/95 px-5 pb-2 pt-3 backdrop-blur">
      <button
        type="submit"
        :disabled="!canGenerate"
        class="btn-primary group relative w-full overflow-hidden px-5 py-4 text-sm shadow-paper-2 disabled:shadow-paper-1"
      >
        <span class="flex w-full items-center justify-between gap-3">
          <span class="flex items-center gap-3">
            <Icon :name="isGenerating ? 'sparkle' : 'lightning'" :size="14" />
            <span class="font-display text-base italic">{{ generateLabel }}</span>
            <span v-if="isGenerating" class="font-mono text-[11px] tabular-nums text-paper/70">{{ elapsedSeconds }}s</span>
          </span>
        </span>
        <span
          v-if="isGenerating"
          class="pointer-events-none absolute inset-y-0 -inset-x-1/2 bg-gradient-to-r from-transparent via-paper/15 to-transparent animate-progress-sweep"
          aria-hidden="true"
        ></span>
      </button>
    </div>
  </form>
</template>

<style scoped>
.acc-enter-from,
.acc-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  max-height: 0;
}
.acc-enter-to,
.acc-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 1000px;
}
.acc-enter-active,
.acc-leave-active {
  transition: opacity 0.24s ease-out, transform 0.24s ease-out, max-height 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
  overflow: hidden;
}
</style>
