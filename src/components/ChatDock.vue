<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import StyleSwatch from './StyleSwatch.vue'
import Select, { type SelectOption } from './Select.vue'
import { maxReferenceImages } from '../lib/imagesApi'
import { customModelSentinel, styleOptions } from '../presets'
import { useDiscoveredModels } from '../composables/useDiscoveredModels'
import { useVibration } from '../composables/useVibration'
import { rafThrottle } from '../lib/rafThrottle'
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
  (e: 'magic-enhance'): void
}>()

const dockRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const referenceInputRef = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const tall = ref(false)
const customModelOpen = ref(false)
const customModelInputRef = ref<HTMLInputElement | null>(null)
const isMagicPulsing = ref(false)
let dockResizeObserver: ResizeObserver | null = null

const discoveredModels = useDiscoveredModels()
const { vibrate } = useVibration()

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
  vibrate('tap')
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
  vibrate('tap')
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
  const viewportH = effectiveViewportHeight()
  let cap: number
  if (tall.value) {
    cap = focused.value ? Math.round(viewportH * 0.72) : Math.round(viewportH * 0.6)
  } else {
    cap = focused.value ? 280 : 200
  }
  const lines = Math.max(1, Math.floor(Math.max(lineHeight, cap - padY) / lineHeight))
  const snapped = lines * lineHeight + padY
  el.style.height = `${Math.min(el.scrollHeight, snapped)}px`
}

function toggleTall() {
  vibrate('tap')
  tall.value = !tall.value
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

function ensureDockVisible() {
  if (typeof window === 'undefined') return
  const el = dockRef.value
  if (!el) return
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        el.scrollIntoView({ block: 'end', behavior: 'smooth' })
      } catch {
        el.scrollIntoView(false)
      }
    })
  })
}

function focusInput() {
  nextTick(() => {
    textareaRef.value?.focus()
    autosize()
    reportLayout()
    ensureDockVisible()
  })
}

function send() {
  if (sendDisabled.value) {
    if (!props.canGenerate || props.isGenerating) {
      vibrate('error')
    }
    return
  }
  emit('send')
}

function magicEnhance() {
  vibrate('tap')
  isMagicPulsing.value = true
  setTimeout(() => {
    isMagicPulsing.value = false
  }, 1000)
  emit('magic-enhance')
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    send()
  }
}

watch(prompt, () => {
  syncLayoutSoon()
})

watch(focused, (isFocused) => {
  syncLayoutSoon()
  if (isFocused) ensureDockVisible()
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

const throttledLayoutSync = rafThrottle(syncLayoutSoon)

onMounted(() => {
  syncLayoutSoon()
  if (typeof ResizeObserver !== 'undefined' && dockRef.value) {
    dockResizeObserver = new ResizeObserver(() => {
      reportLayout()
    })
    dockResizeObserver.observe(dockRef.value)
  }
  window.addEventListener('resize', throttledLayoutSync, { passive: true })
  window.addEventListener('orientationchange', throttledLayoutSync, { passive: true })
  window.visualViewport?.addEventListener('resize', throttledLayoutSync, { passive: true })
  window.visualViewport?.addEventListener('scroll', throttledLayoutSync, { passive: true })
})

onBeforeUnmount(() => {
  dockResizeObserver?.disconnect()
  dockResizeObserver = null
  window.removeEventListener('resize', throttledLayoutSync)
  window.removeEventListener('orientationchange', throttledLayoutSync)
  window.visualViewport?.removeEventListener('resize', throttledLayoutSync)
  window.visualViewport?.removeEventListener('scroll', throttledLayoutSync)
  throttledLayoutSync.cancel()
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
            class="w-full rounded-xl border border-line bg-paper px-3 py-2 text-base font-mono text-ink outline-none transition focus:border-ink focus:shadow-[var(--focus-ring)] sm:text-[13px]"
            placeholder="例如 dall-e-3、flux-pro 等中转站支持的模型名"
            autocomplete="off"
            spellcheck="false"
            maxlength="64"
          />
        </div>
      </Transition>

      <div
        class="chat-dock__input relative px-2.5 pt-2.5 sm:px-3"
        :class="{ 'magic-pulse': isMagicPulsing }"
        @click="textareaRef?.focus()"
        @touchstart.passive="textareaRef?.focus()"
      >
        <textarea
          ref="textareaRef"
          v-model="prompt"
          rows="1"
          maxlength="1200"
          placeholder="今天画点什么…"
          class="chat-dock__textarea"
          :class="{ 'chat-dock__textarea--tall': tall }"
          autocomplete="off"
          autocorrect="on"
          autocapitalize="sentences"
          spellcheck="true"
          enterkeyhint="send"
          inputmode="text"
          @focus="focused = true"
          @blur="focused = false"
          @input="autosize"
          @keydown="onKeydown"
          @click.stop="textareaRef?.focus()"
          @touchstart.stop.passive="textareaRef?.focus()"
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
              class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-muted transition-all hover:bg-paper-soft hover:text-ink active:scale-95"
              :disabled="props.referenceImages.length >= maxReferenceImages"
              @click="openReferencePicker"
            >
              <Icon name="upload" :size="11" />
              <span>继续添加</span>
            </button>
          </div>

          <div class="chat-dock__attachment-strip">
            <TransitionGroup name="list">
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
            </TransitionGroup>
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
            v-if="promptCount > 0"
            type="button"
            class="chat-dock__magic"
            aria-label="魔法增强提示词"
            @click="magicEnhance"
          >
            <Icon name="sparkle" :size="14" />
          </button>
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
    0 1px 0 rgb(var(--color-ink) / 0.06),
    0 28px 56px -20px rgb(var(--color-ink) / 0.36),
    0 12px 24px -16px rgb(var(--color-ink) / 0.24),
    var(--focus-ring);
}

.chat-dock__textarea {
  width: 100%;
  min-height: 42px;
  max-height: 280px;
  padding: 0.6rem 2.6rem 0.65rem 0.5rem;
  resize: none;
  background: transparent;
  border: none;
  outline: none;
  color: rgb(var(--color-ink));
  font-family: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 16px;
  line-height: 1.55;
  letter-spacing: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: rgb(var(--color-ink) / 0.18) transparent;
  overscroll-behavior: contain;
  touch-action: manipulation;
  user-select: text;
  -webkit-user-select: text;
  -webkit-tap-highlight-color: transparent;
  cursor: text;
  transition: max-height 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    height 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.chat-dock__input {
  cursor: text;
  -webkit-tap-highlight-color: transparent;
}

.chat-dock__textarea--tall {
  min-height: 32dvh;
  max-height: 50dvh;
}

.magic-pulse::after {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 20px;
  background: linear-gradient(90deg, transparent, rgb(var(--color-forest) / 0.1), rgb(var(--color-accent) / 0.1), transparent);
  background-size: 200% 100%;
  animation: progress-sweep 1s ease-out forwards;
  pointer-events: none;
  z-index: 0;
}

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
  background: rgb(var(--color-paper) / 0.6);
  color: rgb(var(--color-muted));
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease,
    transform 160ms ease;
}

.chat-dock__expand::before {
  content: '';
  position: absolute;
  inset: -7px;
  border-radius: 999px;
}

.chat-dock__expand:hover {
  background: rgb(var(--color-cream));
  color: rgb(var(--color-ink));
  border-color: rgb(var(--color-ink) / 0.18);
}

.chat-dock__expand:active {
  transform: translateY(1px);
}

.chat-dock__expand--active {
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  border-color: rgb(var(--color-ink));
}

.chat-dock__expand--active:hover {
  background: rgb(var(--color-ink) / 0.9);
  color: rgb(var(--color-paper));
}

.chat-dock__magic {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: rgb(var(--color-cream));
  border: 1px solid rgb(var(--color-line-strong));
  color: rgb(var(--color-ink));
  transition: all 160ms ease;
  cursor: pointer;
}

.chat-dock__magic:hover {
  background: rgb(var(--color-vellum));
  border-color: rgb(var(--color-ink));
  transform: rotate(12deg) scale(1.05);
}

.chat-dock__magic:active {
  transform: scale(0.95);
}

.chat-dock__textarea::-webkit-scrollbar {
  width: 4px;
}

.chat-dock__textarea::-webkit-scrollbar-thumb {
  background: rgb(var(--color-ink) / 0.18);
  border-radius: 999px;
}

.chat-dock__textarea::placeholder {
  color: rgb(var(--color-muted) / 0.7);
}

.chat-dock__textarea:focus-visible {
  outline: none;
}

.model-chip-wrap :deep(.select-trigger) {
  height: 34px;
  max-width: clamp(6.75rem, 33vw, 10.5rem);
  border-radius: 999px;
  padding: 0 1.7rem 0 0.7rem;
  background: rgb(var(--color-cream));
  border-color: rgb(var(--color-line-strong));
  font-size: 12px;
  font-weight: 500;
  color: rgb(var(--color-ink));
  letter-spacing: 0;
}

.model-chip-wrap :deep(.select-trigger:hover) {
  background: rgb(var(--color-vellum));
  border-color: rgb(var(--color-ink));
}

.model-chip-wrap :deep(.select-trigger.is-open) {
  background: rgb(var(--color-vellum));
  border-color: rgb(var(--color-ink));
  box-shadow: var(--focus-ring);
}

.model-chip-wrap :deep(.select-trigger__caret) {
  right: 0.55rem;
  color: rgb(var(--color-muted));
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
  background: rgb(var(--color-cream));
  border: 1px solid rgb(var(--color-line-strong));
  color: rgb(var(--color-ink));
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;
  transition: background-color 140ms ease, border-color 140ms ease, transform 140ms ease;
  cursor: pointer;
}

.style-chip:hover {
  background: rgb(var(--color-vellum));
  border-color: rgb(var(--color-ink));
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
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 34px;
  padding: 0 0.7rem;
  border-radius: 999px;
  background: rgb(var(--color-cream));
  border: 1px solid rgb(var(--color-line-strong));
  color: rgb(var(--color-ink));
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;
  transition: background-color 140ms ease, border-color 140ms ease, transform 140ms ease;
}

.asset-chip::before,
.style-chip::before {
  content: '';
  position: absolute;
  inset: -5px -3px;
}

.asset-chip:hover:not(:disabled) {
  background: rgb(var(--color-vellum));
  border-color: rgb(var(--color-ink));
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
  border: 1px solid rgb(var(--color-line-strong) / 0.9);
  background: rgb(var(--color-paper-soft));
  box-shadow: 0 12px 20px -18px rgb(var(--color-ink) / 0.42);
}

.chat-dock__attachment-remove {
  position: absolute;
  top: 0.28rem;
  right: 0.28rem;
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgb(var(--color-ink) / 0.72);
  color: rgb(var(--color-paper));
  backdrop-filter: blur(6px);
}

.chat-dock__attachment-remove::before {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: 999px;
}

.chat-dock__attachment-name {
  position: absolute;
  inset: auto 0 0 0;
  padding: 0.3rem 0.4rem;
  background: linear-gradient(180deg, transparent, rgb(var(--color-ink) / 0.74));
  color: rgb(var(--color-paper));
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
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), max-height 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: scale(0.8) translateY(10px);
}

.chat-dock__send {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: rgb(var(--color-ink) / 0.4);
  color: rgb(var(--color-paper) / 0.85);
  overflow: hidden;
  transition: background-color 160ms ease, transform 140ms ease, box-shadow 200ms ease;
  cursor: pointer;
  touch-action: manipulation;
}

.chat-dock__send:disabled {
  cursor: not-allowed;
}

.chat-dock__send--ready {
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  box-shadow: 0 1px 0 rgb(var(--color-ink) / 0.06), 0 12px 24px -16px rgb(var(--color-ink) / 0.4);
}

.chat-dock__send--ready:hover {
  background: rgb(var(--color-ink) / 0.92);
  transform: translateY(-1px);
}

.chat-dock__send--ready:active {
  transform: translateY(0);
}

.chat-dock__send--busy {
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
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
    width: 44px;
    height: 44px;
  }
}

@media (orientation: landscape) and (max-height: 540px) {
  .chat-dock__textarea {
    min-height: 36px;
    max-height: 96px;
  }

  .chat-dock__textarea--tall {
    min-height: 44dvh;
    max-height: 64dvh;
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
