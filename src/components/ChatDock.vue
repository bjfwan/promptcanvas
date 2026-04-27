<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import Icon from './Icon.vue'
import StyleSwatch from './StyleSwatch.vue'
import Select, { type SelectOption } from './Select.vue'
import { customModelSentinel, styleOptions } from '../presets'
import { useDiscoveredModels } from '../composables/useDiscoveredModels'
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
// “高输入”模式：点击右上角的展开按钮后，输入框会抵近出视口高度以方便输入长提示词
const tall = ref(false)
const customModelOpen = ref(false)
const customModelInputRef = ref<HTMLInputElement | null>(null)

const discoveredModels = useDiscoveredModels()

const modelSelectOptions = computed<SelectOption<string>[]>(() =>
  discoveredModels.mergedModelOptions.value.map((option) => ({
    value: option.value,
    label: option.label,
    hint: option.hint,
  })),
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
  const match = discoveredModels.mergedModelOptions.value.find((option) => option.value === modelChoice.value)
  return match?.label ?? (modelChoice.value || '默认')
})

const sendDisabled = computed(() => !props.canGenerate || props.isGenerating)

function autosize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  const computed = window.getComputedStyle(el)
  const lineHeight = parseFloat(computed.lineHeight) || 24
  const padY =
    (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.paddingBottom) || 0)
  // 输入框上限（随“是否展开 / 是否聚焦”动态变化）
  //   常规模式：失焦 ~8 行 / 聚焦 ~11 行，与聊天输入习惯匹配
  //   高输入模式：抵近视口高度以便于修改长提示词
  const viewportH = window.innerHeight || 800
  let cap: number
  if (tall.value) {
    cap = focused.value ? Math.round(viewportH * 0.72) : Math.round(viewportH * 0.6)
  } else {
    cap = focused.value ? 280 : 200
  }
  // 把上限对齐到整行倍数，避免出现“半行被裁切”的视觉残影
  const lines = Math.max(1, Math.floor(Math.max(lineHeight, cap - padY) / lineHeight))
  const snapped = lines * lineHeight + padY
  el.style.height = `${Math.min(el.scrollHeight, snapped)}px`
}

function toggleTall() {
  tall.value = !tall.value
  // 展开后顺便聚焦输入区，方便立即输入
  if (tall.value) {
    nextTick(() => {
      textareaRef.value?.focus()
      autosize()
    })
  } else {
    nextTick(autosize)
  }
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

watch(tall, () => {
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
      <div class="chat-dock__input relative px-3 pt-2.5">
        <textarea
          ref="textareaRef"
          v-model="prompt"
          rows="1"
          maxlength="1200"
          placeholder="今天画点什么…"
          class="chat-dock__textarea"
          :class="{ 'chat-dock__textarea--tall': tall }"
          @focus="focused = true"
          @blur="focused = false"
          @input="autosize"
          @keydown="onKeydown"
        ></textarea>
        <!-- 展开 / 收起 切换：点击后输入框伸展至接近视口高度 -->
        <button
          type="button"
          class="chat-dock__expand"
          :class="{ 'chat-dock__expand--active': tall }"
          :aria-pressed="tall"
          :aria-label="tall ? '收起输入框' : '展开输入框'"
          @click="toggleTall"
        >
          <Icon :name="tall ? 'shrink' : 'expand'" :size="14" />
        </button>
      </div>

      <!-- 工具行：模型 chip / 风格 chip / 发送按钮 -->
      <div class="flex items-center gap-1.5 px-2.5 pb-2 pt-1">
        <!-- 模型 chip：用 Select 接管下拉，外观改为药丸 -->
        <div class="model-chip-wrap relative min-w-0">
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

        <!-- 右侧：字符计数 / 进行中状态 + 发送按钮（在一个 flex 容器中以保证 ml-auto 始终生效） -->
        <div class="chat-dock__tail ml-auto flex items-center gap-1.5">
          <span
            v-if="isGenerating"
            class="inline-flex items-center gap-1 whitespace-nowrap px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted"
          >
            <Icon name="sparkle" :size="11" class="animate-breathe" />
            <span>{{ elapsedSeconds }}s</span>
          </span>
          <span
            v-else-if="promptCount > 0"
            class="whitespace-nowrap px-1 font-mono text-[10px] tabular-nums text-muted"
          >
            {{ promptCount }}/1200
          </span>
          <span
            v-else
            class="hidden whitespace-nowrap px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted/70 sm:inline"
          >
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
  /* 从单行高度起步，以让“每多一行输入输入区就变高一行”的视觉反馈明显可见 */
  min-height: 40px;
  max-height: 280px;
  /* 右侧预留足够空间给“展开/收起”按钮，避免文本被遮挡 */
  padding: 0.55rem 2.25rem 0.6rem 0.5rem;
  resize: none;
  background: transparent;
  border: none;
  outline: none;
  color: #1a1612;
  font-family: 'Inter Tight', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 15px;
  line-height: 1.55;
  letter-spacing: 0.005em;
  /* 超出上限时允许在 textarea 内部滚动（触屏可拖动） */
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(26, 22, 18, 0.18) transparent;
  overscroll-behavior: contain;
  /* 高度变化增加过渡，让“伸缩”明显可感知 */
  transition: max-height 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    height 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* “高输入模式”：点击展开按钮后输入框立即伸展至接近整个视口高度，
   即使当前内容很短，输入框也保持高大状态以方便长篇撰写 */
.chat-dock__textarea--tall {
  min-height: 60vh;
  max-height: 72vh;
}

/* 右上角的 展开 / 收起 切换按钮 */
.chat-dock__expand {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: rgba(241, 233, 220, 0.6);
  color: #6c6357;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease,
    transform 160ms ease;
}

.chat-dock__expand:hover {
  background: #faf3e6;
  color: #1a1612;
  border-color: rgba(26, 22, 18, 0.18);
}

.chat-dock__expand:active {
  transform: translateY(1px);
}

.chat-dock__expand--active {
  background: #1a1612;
  color: #faf3e6;
  border-color: #1a1612;
}

.chat-dock__expand--active:hover {
  background: #2a221a;
  color: #faf3e6;
}

.chat-dock__textarea::-webkit-scrollbar {
  width: 4px;
}

.chat-dock__textarea::-webkit-scrollbar-thumb {
  background: rgba(26, 22, 18, 0.18);
  border-radius: 999px;
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
  /* 在窄屏上使用动态上限，防止较长的模型名把字符计数或发送键挤出行
     内部的 .select-trigger__label 已启用 ellipsis，超出后会以“…”截断 */
  max-width: clamp(7.25rem, 32vw, 11rem);
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
