<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import StyleSwatch from './StyleSwatch.vue'
import Select, { type SelectOption } from './Select.vue'
import { maxReferenceImages } from '../lib/imagesApi'
import { customModelSentinel, styleOptions } from '../presets'
import { useDiscoveredModels } from '../composables/useDiscoveredModels'
import type { ImageStyle, ReferenceImageAttachment } from '../types'

interface Props {
  isGenerating: boolean
  canGenerate: boolean
  elapsedSeconds: number
  healthOffline: boolean
  currentStyle: ImageStyle
  referenceImages: ReferenceImageAttachment[]
  keyboardInset?: number
  viewportHeight?: number
}

const props = withDefaults(defineProps<Props>(), {
  keyboardInset: 0,
  viewportHeight: 0,
})

const prompt = defineModel<string>('prompt', { required: true })
const modelChoice = defineModel<string>('modelChoice', { required: true })
const customModel = defineModel<string>('customModel', { required: true })

const emit = defineEmits<{
  (e: 'send'): void
  (e: 'open-style-sheet'): void
  (e: 'layout-change', height: number): void
  (e: 'select-reference-images', files: File[]): void
  (e: 'remove-reference-image', id: string): void
}>()

const dockRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const referenceInputRef = ref<HTMLInputElement | null>(null)
const focused = ref(false)
// “高输入”模式：点击右上角的展开按钮后，输入框会抵近出视口高度以方便输入长提示词
const tall = ref(false)
const customModelOpen = ref(false)
const customModelInputRef = ref<HTMLInputElement | null>(null)
let dockResizeObserver: ResizeObserver | null = null

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
const hasReferenceImages = computed(() => props.referenceImages.length > 0)

const modelLabel = computed(() => {
  if (isCustomModel.value) {
    return customModel.value.trim() || '自定义模型'
  }
  const match = discoveredModels.mergedModelOptions.value.find((option) => option.value === modelChoice.value)
  return match?.label ?? (modelChoice.value || '默认')
})

const sendDisabled = computed(() => !props.canGenerate || props.isGenerating)

function openReferencePicker() {
  referenceInputRef.value?.click()
}

function onReferenceInputChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const files = input?.files ? Array.from(input.files) : []
  if (files.length) {
    emit('select-reference-images', files)
  }
  if (input) {
    input.value = ''
  }
  syncLayoutSoon()
}

function handleRemoveReferenceImage(id: string) {
  emit('remove-reference-image', id)
  syncLayoutSoon()
}

function effectiveViewportHeight() {
  if (typeof window === 'undefined') return props.viewportHeight || 800
  const visualViewport = window.visualViewport
  const visualHeight = visualViewport
    ? Math.round(visualViewport.height + visualViewport.offsetTop)
    : 0
  const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 800
  return Math.max(props.viewportHeight || 0, visualHeight, layoutHeight)
}

function reportLayout() {
  const el = dockRef.value
  if (!el) return
  emit('layout-change', Math.round(el.offsetHeight))
}

function syncLayoutSoon() {
  nextTick(() => {
    autosize()
    reportLayout()
  })
}

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
  const viewportH = effectiveViewportHeight()
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
      reportLayout()
    })
  } else {
    syncLayoutSoon()
  }
}

function focusInput() {
  nextTick(() => {
    textareaRef.value?.focus()
    autosize()
    reportLayout()
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
  syncLayoutSoon()
})

watch(focused, () => {
  syncLayoutSoon()
})

watch(tall, () => {
  syncLayoutSoon()
})

watch(isCustomModel, (next) => {
  if (next) {
    customModelOpen.value = true
    nextTick(() => customModelInputRef.value?.focus())
  } else {
    customModelOpen.value = false
  }
  syncLayoutSoon()
})

watch(() => props.healthOffline, syncLayoutSoon)

watch(() => props.referenceImages.length, syncLayoutSoon)

watch(() => props.keyboardInset, syncLayoutSoon)

watch(() => props.viewportHeight, syncLayoutSoon)

onMounted(() => {
  syncLayoutSoon()
  if (typeof ResizeObserver !== 'undefined' && dockRef.value) {
    dockResizeObserver = new ResizeObserver(() => {
      reportLayout()
    })
    dockResizeObserver.observe(dockRef.value)
  }
  window.addEventListener('resize', syncLayoutSoon)
  window.addEventListener('orientationchange', syncLayoutSoon)
  window.visualViewport?.addEventListener('resize', syncLayoutSoon)
  window.visualViewport?.addEventListener('scroll', syncLayoutSoon)
})

onBeforeUnmount(() => {
  dockResizeObserver?.disconnect()
  dockResizeObserver = null
  window.removeEventListener('resize', syncLayoutSoon)
  window.removeEventListener('orientationchange', syncLayoutSoon)
  window.visualViewport?.removeEventListener('resize', syncLayoutSoon)
  window.visualViewport?.removeEventListener('scroll', syncLayoutSoon)
})

defineExpose({ focusInput })
</script>

<template>
  <div
    ref="dockRef"
    class="chat-dock absolute inset-x-0 bottom-0 z-dock pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] pt-2"
  >
    <div
      class="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-paper to-transparent"
      aria-hidden="true"
    ></div>

    <div
      v-if="healthOffline"
      class="mx-2.5 mb-2 flex items-center gap-2 rounded-2xl border border-accent/30 bg-accent/[0.06] px-3 py-1.5 text-[11px] font-medium text-accent sm:mx-3"
      role="alert"
    >
      <Icon name="warning" :size="13" />
      <span>后端离线，发送会失败</span>
    </div>

    <div
      class="relative mx-2.5 rounded-[26px] border border-line-strong/70 bg-vellum/95 shadow-paper-3 backdrop-blur sm:mx-3 sm:rounded-[28px]"
      :class="{ 'chat-dock__shell--focused': focused }"
    >
      <input
        ref="referenceInputRef"
        type="file"
        class="sr-only"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        @change="onReferenceInputChange"
      />

      <Transition name="chat-dock-custom">
        <div
          v-if="isCustomModel && customModelOpen"
          class="border-b border-line/70 px-2.5 pb-2 pt-2.5 sm:px-3"
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
            class="w-full rounded-xl border border-line bg-paper px-3 py-2 text-base font-mono text-ink outline-none transition focus:border-ink focus:shadow-[0_0_0_3px_rgba(26,22,18,0.10)] sm:text-[13px]"
            placeholder="例如 dall-e-3、flux-pro 等中转站支持的模型名"
            autocomplete="off"
            spellcheck="false"
            maxlength="64"
          />
        </div>
      </Transition>

      <div class="chat-dock__input relative px-2.5 pt-2.5 sm:px-3">
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

      <Transition name="chat-dock-attachments">
        <div
          v-if="hasReferenceImages"
          class="chat-dock__attachments border-t border-line/70 px-2.5 pb-2 pt-1.5 sm:px-3"
        >
          <div class="mb-1.5 flex items-center justify-between gap-2 px-0.5">
            <span class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              <Icon name="image" :size="11" />
              <span>参考图 {{ props.referenceImages.length }} / {{ maxReferenceImages }}</span>
            </span>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-muted transition hover:bg-paper-soft hover:text-ink"
              :disabled="props.referenceImages.length >= maxReferenceImages"
              @click="openReferencePicker"
            >
              <Icon name="upload" :size="11" />
              <span>继续添加</span>
            </button>
          </div>

          <div class="chat-dock__attachment-strip">
            <div
              v-for="image in props.referenceImages"
              :key="image.id"
              class="chat-dock__attachment-card"
            >
              <img
                :src="image.previewUrl"
                :alt="image.name"
                loading="lazy"
                decoding="async"
                class="h-full w-full object-cover"
              />
              <button
                type="button"
                class="chat-dock__attachment-remove"
                :aria-label="`移除参考图 ${image.name}`"
                @click="handleRemoveReferenceImage(image.id)"
              >
                <Icon name="close" :size="11" />
              </button>
              <span class="chat-dock__attachment-name">{{ image.name }}</span>
            </div>
          </div>
        </div>
      </Transition>

      <div class="flex items-center gap-1 px-2 pb-2 pt-1.5 sm:gap-1.5 sm:px-2.5 sm:pt-1">
        <button
          type="button"
          class="asset-chip shrink-0"
          :disabled="props.referenceImages.length >= maxReferenceImages"
          :aria-label="hasReferenceImages ? `已添加 ${props.referenceImages.length} 张参考图，继续添加` : '添加参考图'"
          @click="openReferencePicker"
        >
          <Icon :name="hasReferenceImages ? 'image' : 'upload'" :size="13" />
          <span class="asset-chip__label">{{ hasReferenceImages ? `参考 ${props.referenceImages.length}` : '参考图' }}</span>
        </button>

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

        <div class="chat-dock__tail ml-auto flex items-center gap-1 sm:gap-1.5">
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
  min-height: 42px;
  max-height: 280px;
  /* 右侧预留足够空间给“展开/收起”按钮，避免文本被遮挡 */
  padding: 0.6rem 2.6rem 0.65rem 0.5rem;
  resize: none;
  background: transparent;
  border: none;
  outline: none;
  color: #1a1612;
  font-family: 'Inter Tight', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 16px;
  line-height: 1.55;
  letter-spacing: 0.005em;
  /* 超出上限时允许在 textarea 内部滚动（触屏可拖动） */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
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
  min-height: 32dvh;
  max-height: 50dvh;
}

/* 右上角的 展开 / 收起 切换按钮 */
.chat-dock__expand {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
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
  height: 34px;
  /* 在窄屏上使用动态上限，防止较长的模型名把字符计数或发送键挤出行
     内部的 .select-trigger__label 已启用 ellipsis，超出后会以“…”截断 */
  max-width: clamp(6.75rem, 33vw, 10.5rem);
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
  height: 34px;
  padding: 0 0.7rem 0 0.45rem;
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

.asset-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 34px;
  padding: 0 0.7rem;
  border-radius: 999px;
  background: #faf3e6;
  border: 1px solid #c8b89a;
  color: #1a1612;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  transition: background-color 140ms ease, border-color 140ms ease, transform 140ms ease;
}

.asset-chip:hover:not(:disabled) {
  background: #fdf8ed;
  border-color: #1a1612;
}

.asset-chip:active:not(:disabled) {
  transform: translateY(1px);
}

.asset-chip:disabled {
  opacity: 0.62;
  cursor: not-allowed;
}

.asset-chip__label {
  white-space: nowrap;
}

.chat-dock__attachments {
  overflow: hidden;
}

.chat-dock__attachment-strip {
  display: flex;
  gap: 0.55rem;
  overflow-x: auto;
  padding-bottom: 0.1rem;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}

.chat-dock__attachment-card {
  position: relative;
  width: 74px;
  min-width: 74px;
  height: 74px;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid rgba(200, 184, 154, 0.9);
  background: #f6efe3;
  box-shadow: 0 12px 20px -18px rgba(26, 22, 18, 0.42);
}

.chat-dock__attachment-remove {
  position: absolute;
  top: 0.28rem;
  right: 0.28rem;
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(26, 22, 18, 0.72);
  color: #faf3e6;
  backdrop-filter: blur(6px);
}

.chat-dock__attachment-name {
  position: absolute;
  inset: auto 0 0 0;
  padding: 0.3rem 0.4rem;
  background: linear-gradient(180deg, transparent, rgba(26, 22, 18, 0.74));
  color: #faf3e6;
  font-size: 9px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-dock-attachments-enter-from,
.chat-dock-attachments-leave-to {
  opacity: 0;
  transform: translateY(4px);
  max-height: 0;
}

.chat-dock-attachments-enter-to,
.chat-dock-attachments-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 180px;
}

.chat-dock-attachments-enter-active,
.chat-dock-attachments-leave-active {
  transition: opacity 0.2s ease-out, transform 0.2s ease-out, max-height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.chat-dock__send {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
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

@media (max-width: 390px) {
  .chat-dock__textarea {
    padding-right: 2.45rem;
    padding-left: 0.35rem;
  }

  .model-chip-wrap :deep(.select-trigger) {
    max-width: clamp(6rem, 31vw, 8.75rem);
    padding-left: 0.65rem;
    padding-right: 1.55rem;
  }

  .asset-chip__label {
    display: none;
  }

  .style-chip__label {
    max-width: 5.75rem;
  }

  .chat-dock__send {
    width: 40px;
    height: 40px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-dock__send,
  .asset-chip,
  .style-chip,
  .chat-dock-attachments-enter-active,
  .chat-dock-attachments-leave-active,
  .chat-dock-custom-enter-active,
  .chat-dock-custom-leave-active {
    transition: none;
  }
}
</style>
