<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import Icon from './Icon.vue'
import StyleSwatch from './StyleSwatch.vue'
import Select, { type SelectOption } from './Select.vue'
import { customModelSentinel, modelOptions, styleOptions } from '../presets'
import type { GenerateImageRequest, ImageStyle } from '../types'

interface Props {
  isGenerating: boolean
  canGenerate: boolean
  elapsedSeconds: number
  healthOffline: boolean
  currentStyle: ImageStyle
}

const props = defineProps<Props>()

const prompt = defineModel<string>('prompt', { required: true })
const modelChoice = defineModel<string>('modelChoice', { required: true })
const customModel = defineModel<string>('customModel', { required: true })

const emit = defineEmits<{
  (e: 'send'): void
  (e: 'open-style-sheet'): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const focused = ref(false)
const customModelOpen = ref(false)
const customModelInputRef = ref<HTMLInputElement | null>(null)

const modelSelectOptions = computed<SelectOption<string>[]>(() =>
  modelOptions.map((option) => ({ value: option.value, label: option.label, hint: option.hint })),
)

const promptCount = computed(() => prompt.value.length)
const promptHasContent = computed(() => prompt.value.trim().length >= 4)

const currentStyleMeta = computed(
  () => styleOptions.find((option) => option.value === props.currentStyle) ?? styleOptions[0],
)

const isCustomModel = computed(() => modelChoice.value === customModelSentinel)

const modelLabel = computed(() => {
  if (isCustomModel.value) {
    return customModel.value.trim() || '自定义模型'
  }
  const match = modelOptions.find((option) => option.value === modelChoice.value)
  return match?.label ?? '默认'
})

const sendDisabled = computed(() => !props.canGenerate || props.isGenerating)

function autosize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  const max = focused.value ? 200 : 96
  el.style.height = `${Math.min(el.scrollHeight, max)}px`
}

function focusInput() {
  nextTick(() => {
    textareaRef.value?.focus()
    autosize()
  })
}

function send() {
  if (sendDisabled.value) return
  emit('send')
}

function onKeydown(event: KeyboardEvent) {
  // Cmd / Ctrl + Enter 直接发送；普通 Enter 在移动端继续允许换行
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    send()
  }
}

watch(prompt, () => {
  nextTick(autosize)
})

watch(focused, () => {
  nextTick(autosize)
})

watch(isCustomModel, (next) => {
  if (next) {
    customModelOpen.value = true
    nextTick(() => customModelInputRef.value?.focus())
  } else {
    customModelOpen.value = false
  }
})

defineExpose({ focusInput })
</script>

<template>
  <div
    class="chat-dock fixed inset-x-0 bottom-0 z-dock pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] pt-2"
  >
    <div
      class="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-paper to-transparent"
      aria-hidden="true"
    ></div>

    <!-- 离线提示带 -->
    <div
      v-if="healthOffline"
      class="mx-3 mb-2 flex items-center gap-2 rounded-2xl border border-accent/30 bg-accent/[0.06] px-3 py-1.5 text-[11px] font-medium text-accent"
      role="alert"
    >
      <Icon name="warning" :size="13" />
      <span>后端离线，发送会失败</span>
    </div>

    <div
      class="relative mx-3 rounded-[28px] border border-line-strong/70 bg-vellum/95 shadow-paper-3 backdrop-blur"
      :class="{ 'chat-dock__shell--focused': focused }"
    >
      <!-- 自定义模型输入栏：仅在选择"自定义"时展开 -->
      <Transition name="chat-dock-custom">
        <div
          v-if="isCustomModel && customModelOpen"
          class="border-b border-line/70 px-3 pb-2 pt-2.5"
        >
          <label class="mb-1 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted" for="chat-custom-model">
            <Icon name="pencil" :size="11" />
            <span>自定义模型名</span>
          </label>
          <input
            id="chat-custom-model"
            ref="customModelInputRef"
            v-model="customModel"
            type="text"
            class="w-full rounded-xl border border-line bg-paper px-3 py-2 text-[13px] font-mono text-ink outline-none transition focus:border-ink focus:shadow-[0_0_0_3px_rgba(26,22,18,0.10)]"
            placeholder="例如 dall-e-3、flux-pro 等中转站支持的模型名"
            autocomplete="off"
            spellcheck="false"
            maxlength="64"
          />
        </div>
      </Transition>

      <!-- 主输入区 -->
      <div class="px-3 pt-2.5">
        <textarea
          ref="textareaRef"
          v-model="prompt"
          rows="1"
          maxlength="1200"
          placeholder="今天画点什么…"
          class="chat-dock__textarea"
          @focus="focused = true"
          @blur="focused = false"
          @input="autosize"
          @keydown="onKeydown"
        ></textarea>
      </div>

      <!-- 工具行：模型 chip / 风格 chip / 发送按钮 -->
      <div class="flex items-center gap-1.5 px-2.5 pb-2 pt-1">
        <!-- 模型 chip：用 Select 接管下拉，外观改为药丸 -->
        <div class="model-chip-wrap relative">
          <Select
            v-model="modelChoice"
            :options="modelSelectOptions"
            size="sm"
            placeholder="模型"
            aria-label="选择生成模型"
            :show-hints="true"
          />
        </div>

        <!-- 风格 chip：触发 StyleSheet -->
        <button
          type="button"
          class="style-chip"
          :aria-label="`当前风格：${currentStyleMeta.label}，点击更换`"
          @click="emit('open-style-sheet')"
        >
          <StyleSwatch :variant="currentStyleMeta.value" :size="20" />
          <span class="style-chip__label">{{ currentStyleMeta.label }}</span>
          <Icon name="chevronDown" :size="11" class="text-muted" />
        </button>

        <!-- 字符计数 / 进行中状态 -->
        <span
          v-if="isGenerating"
          class="ml-auto inline-flex items-center gap-1 px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted"
        >
          <Icon name="sparkle" :size="11" class="animate-breathe" />
          composing · {{ elapsedSeconds }}s
        </span>
        <span
          v-else-if="promptCount > 0"
          class="ml-auto px-1 font-mono text-[10px] tabular-nums text-muted"
        >
          {{ promptCount }} / 1200
        </span>
        <span v-else class="ml-auto px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted/70">
          ⌘ ↵ 发送
        </span>

        <!-- 发送按钮 -->
        <button
          type="button"
          class="chat-dock__send"
          :class="{
            'chat-dock__send--ready': promptHasContent && !sendDisabled,
            'chat-dock__send--busy': isGenerating,
          }"
          :disabled="sendDisabled"
          aria-label="发送提示词生成图片"
          @click="send"
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
    </div>
  </div>
</template>

<style scoped>
.chat-dock {
  --chat-dock-radius: 28px;
}

.chat-dock__shell--focused {
  box-shadow:
    0 1px 0 rgba(26, 22, 18, 0.06),
    0 28px 56px -20px rgba(26, 22, 18, 0.36),
    0 12px 24px -16px rgba(26, 22, 18, 0.24);
}

.chat-dock__textarea {
  width: 100%;
  min-height: 40px;
  max-height: 200px;
  padding: 0.55rem 0.5rem 0.55rem 0.5rem;
  resize: none;
  background: transparent;
  border: none;
  outline: none;
  color: #1a1612;
  font-family: 'Inter Tight', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 15px;
  line-height: 1.55;
  letter-spacing: 0.005em;
}

.chat-dock__textarea::placeholder {
  color: rgba(108, 99, 87, 0.7);
}

.chat-dock__textarea:focus-visible {
  outline: none;
}

/* 把 Select 的方形 trigger 改造成药丸形 chip */
.model-chip-wrap :deep(.select-trigger) {
  height: 32px;
  border-radius: 999px;
  padding: 0 1.7rem 0 0.7rem;
  background: #faf3e6;
  border-color: #c8b89a;
  font-size: 12px;
  font-weight: 500;
  color: #1a1612;
  letter-spacing: 0.01em;
}

.model-chip-wrap :deep(.select-trigger:hover) {
  background: #fdf8ed;
  border-color: #1a1612;
}

.model-chip-wrap :deep(.select-trigger.is-open) {
  background: #fdf8ed;
  border-color: #1a1612;
  box-shadow: 0 0 0 3px rgba(26, 22, 18, 0.08);
}

.model-chip-wrap :deep(.select-trigger__caret) {
  right: 0.55rem;
  color: #6c6357;
}

.model-chip-wrap :deep(.select-trigger__label) {
  font-weight: 500;
}

.style-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 32px;
  padding: 0 0.65rem 0 0.4rem;
  border-radius: 999px;
  background: #faf3e6;
  border: 1px solid #c8b89a;
  color: #1a1612;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  transition: background-color 140ms ease, border-color 140ms ease, transform 140ms ease;
  cursor: pointer;
}

.style-chip:hover {
  background: #fdf8ed;
  border-color: #1a1612;
}

.style-chip:active {
  transform: translateY(1px);
}

.style-chip__label {
  max-width: 7.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-dock__send {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: rgba(26, 22, 18, 0.4);
  color: rgba(241, 233, 220, 0.85);
  overflow: hidden;
  transition: background-color 160ms ease, transform 140ms ease, box-shadow 200ms ease;
  cursor: pointer;
}

.chat-dock__send:disabled {
  cursor: not-allowed;
}

.chat-dock__send--ready {
  background: #1a1612;
  color: #faf3e6;
  box-shadow: 0 1px 0 rgba(26, 22, 18, 0.06), 0 12px 24px -16px rgba(26, 22, 18, 0.4);
}

.chat-dock__send--ready:hover {
  background: #2a221a;
  transform: translateY(-1px);
}

.chat-dock__send--ready:active {
  transform: translateY(0);
}

.chat-dock__send--busy {
  background: #1a1612;
  color: #faf3e6;
}

.chat-dock-custom-enter-from,
.chat-dock-custom-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  max-height: 0;
}

.chat-dock-custom-enter-to,
.chat-dock-custom-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 80px;
}

.chat-dock-custom-enter-active,
.chat-dock-custom-leave-active {
  transition: opacity 0.22s ease-out, transform 0.22s ease-out, max-height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .chat-dock__send,
  .style-chip,
  .chat-dock-custom-enter-active,
  .chat-dock-custom-leave-active {
    transition: none;
  }
}
</style>
