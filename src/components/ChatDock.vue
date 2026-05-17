<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import StyleSwatch from './StyleSwatch.vue'
import Select, { type SelectOption } from './Select.vue'
import AiRewriteRibbon from './AiRewriteRibbon.vue'
import { useInlineRewrite } from '../composables/useInlineRewrite'
import { REWRITE_MODEL_LIST, REWRITE_MODELS, type RewriteModelId } from '../lib/rewriteService'
import { maxReferenceImages } from '../lib/imagesApi'
import { customModelSentinel, styleOptions } from '../presets'
import { useDiscoveredModels } from '../composables/useDiscoveredModels'
import { useVibration } from '../composables/useVibration'
import { rafThrottle } from '../lib/rafThrottle'
import type { ContinuationContext, ImageQuality, ImageStyle, ReferenceImageAttachment } from '../types'
import type { EnhanceResult } from '../lib/magicEnhance'
import { inferEnhanceIntent } from '../lib/magicEnhance'
import type { PromptContext } from '../lib/promptDoc'

const MagicEnhanceMenu = defineAsyncComponent(() => import('./MagicEnhanceMenu.vue'))

interface Props {
  isGenerating: boolean
  canGenerate: boolean
  elapsedSeconds: number
  healthOffline: boolean
  currentStyle: ImageStyle
  referenceImages: ReferenceImageAttachment[]
  keyboardInset?: number
  viewportHeight?: number
  continuation?: ContinuationContext | null
  canUndoEnhance?: boolean
  size?: string
  quality?: ImageQuality
  modelName?: string
  promptContext?: PromptContext | null
}

const props = withDefaults(defineProps<Props>(), {
  keyboardInset: 0,
  viewportHeight: 0,
  continuation: null,
  canUndoEnhance: false,
  size: '1024x1024',
  quality: 'auto',
  modelName: '',
  promptContext: null,
})

const prompt = defineModel<string>('prompt', { required: true })
const modelChoice = defineModel<string>('modelChoice', { required: true })
const customModel = defineModel<string>('customModel', { required: true })

const emit = defineEmits<{
  (e: 'send'): void
  (e: 'abort'): void
  (e: 'open-style-sheet'): void
  (e: 'layout-change', height: number): void
  (e: 'select-reference-images', files: File[]): void
  (e: 'remove-reference-image', id: string): void
  (e: 'magic-enhance', result: EnhanceResult): void
  (e: 'magic-ab-test', original: string, optimized: EnhanceResult): void
  (e: 'undo-enhance'): void
  (e: 'cancel-continuation'): void
  (e: 'jump-to-continuation', id: string): void
  (e: 'ai-toast', kind: 'info' | 'error', title: string, hint?: string): void
}>()

const dockRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const referenceInputRef = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const customModelOpen = ref(false)
const customModelInputRef = ref<HTMLInputElement | null>(null)
const isMagicPulsing = ref(false)
const magicMenuOpen = ref(false)
let dockResizeObserver: ResizeObserver | null = null
let lastReportedHeight = 0
let layoutFrame = 0
let autosizeFrame = 0

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

const promptCountTone = computed(() => {
  const length = promptCount.value
  if (length >= 4000) {
    return {
      tone: 'text-accent',
      hint: '提示词已超过 4000 字，部分模型（如 dall-e-3）会直接截断。',
    }
  }
  if (length >= 2000) {
    return {
      tone: 'text-ochre',
      hint: '提示词较长，注意目标模型的上下文上限。',
    }
  }
  return { tone: '', hint: '' }
})

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

const sendDisabled = computed(() => !props.isGenerating && !props.canGenerate)
const inputPlaceholder = computed(() =>
  props.continuation ? '接着这张图改什么？' : '写下你想画的画面…',
)
const sendLabel = computed(() =>
  props.isGenerating
    ? '取消生成'
    : props.continuation
      ? '发送续作提示词'
      : '发送提示词生成图片',
)

// GPU-only translate when the on-screen keyboard pushes the dock up.
// Avoids `bottom` transitions which trigger layout work each frame.
const dockOuterStyle = computed(() => ({
  transform: props.keyboardInset ? `translate3d(0, -${props.keyboardInset}px, 0)` : 'translate3d(0,0,0)',
}))

function openReferencePicker() {
  vibrate('tap')
  referenceInputRef.value?.click()
}

function onReferenceInputChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const files = input?.files ? Array.from(input.files) : []
  if (files.length) emit('select-reference-images', files)
  if (input) input.value = ''
  syncLayoutSoon()
}

function handleRemoveReferenceImage(id: string) {
  vibrate('tap')
  emit('remove-reference-image', id)
  syncLayoutSoon()
}

function reportLayout() {
  const el = dockRef.value
  if (!el) return
  const nextHeight = Math.round(el.offsetHeight)
  if (Math.abs(nextHeight - lastReportedHeight) <= 1) return
  lastReportedHeight = nextHeight
  emit('layout-change', nextHeight)
}

function syncLayoutSoon() {
  if (layoutFrame) return
  layoutFrame = window.requestAnimationFrame(() => {
    layoutFrame = 0
    reportLayout()
  })
}

// Textarea sizing — strictly content-driven, capped to a fraction of the
// visible viewport so very long prompts never gobble the whole screen.
function autosize() {
  const el = textareaRef.value
  if (!el) return
  if (autosizeFrame) cancelAnimationFrame(autosizeFrame)
  autosizeFrame = requestAnimationFrame(() => {
    autosizeFrame = 0
    el.style.height = 'auto'
    const cs = window.getComputedStyle(el)
    const lineHeight = parseFloat(cs.lineHeight) || 22
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
    const minH = lineHeight + padY
    // 6 lines when focused, 3 lines collapsed — chat bubbles already hold history
    const maxLines = focused.value ? 6 : 3
    const maxH = maxLines * lineHeight + padY
    const target = Math.min(Math.max(el.scrollHeight, minH), maxH)
    el.style.height = `${target}px`
    reportLayout()
  })
}

function ensureCaretVisible() {
  const el = textareaRef.value
  if (!el) return
  // After autosize, scroll the textarea so the caret line is in view.
  el.scrollTop = el.scrollHeight
}

function focusInput() {
  nextTick(() => {
    textareaRef.value?.focus()
    autosize()
  })
}

function send() {
  if (props.isGenerating) {
    vibrate('tap')
    emit('abort')
    return
  }
  if (sendDisabled.value) {
    vibrate('error')
    return
  }
  emit('send')
}

function magicEnhance() {
  vibrate('tap')
  if (!magicMenuOpen.value) textareaRef.value?.blur()
  magicMenuOpen.value = !magicMenuOpen.value
}

// ── AI 改写 ──
const inlineRewrite = useInlineRewrite()
const aiRewriteState = inlineRewrite.state
const aiPickerOpen = ref(false)

// 改写中：textarea 由 streamingText 驱动；改写完后 / 取消 / 出错保留
// streamingText 显示给用户看，但不会自动覆盖 prompt —— 用户点"应用"才覆盖。
const displayedPrompt = computed({
  get() {
    if (inlineRewrite.isStreaming.value) return aiRewriteState.streamingText
    return prompt.value
  },
  set(v: string) {
    if (inlineRewrite.isStreaming.value) {
      // 流式中如果用户敲键盘，立刻打断改写并把控制权还回去
      inlineRewrite.abort()
      prompt.value = v
    } else {
      prompt.value = v
    }
  },
})

function startAiRewrite() {
  if (!prompt.value.trim()) return
  vibrate('tap')
  textareaRef.value?.blur()
  inlineRewrite.start({
    prompt: prompt.value,
    intent: inferEnhanceIntent(props.currentStyle, hasReferenceImages.value),
    hasReferenceImages: hasReferenceImages.value,
    style: props.currentStyle,
    size: props.size,
    quality: props.quality,
    modelName: props.modelName,
  }).catch(() => {})
}

function applyAiResult() {
  if (!inlineRewrite.hasResult.value) return
  vibrate('success')
  prompt.value = aiRewriteState.resultText
  inlineRewrite.reset()
}

function revertAiResult() {
  vibrate('tap')
  prompt.value = aiRewriteState.snapshot
  inlineRewrite.reset()
}

function retryAiRewrite() {
  if (inlineRewrite.isStreaming.value) return
  // 用 snapshot（用户原文）作为输入再来一次
  const source = aiRewriteState.snapshot || prompt.value
  inlineRewrite.start({
    prompt: source,
    intent: inferEnhanceIntent(props.currentStyle, hasReferenceImages.value),
    hasReferenceImages: hasReferenceImages.value,
    style: props.currentStyle,
    size: props.size,
    quality: props.quality,
    modelName: props.modelName,
  }).catch(() => {})
}

function abortAiRewrite() {
  vibrate('tap')
  inlineRewrite.abort()
}

function dismissAiRibbon() {
  inlineRewrite.reset()
}

function pickAiModel(id: RewriteModelId) {
  inlineRewrite.selectModel(id)
  aiPickerOpen.value = false
}

// ── 长按 / 右键 → 模型选择，普通 click 走 startAiRewrite ──
const aiAnchorRef = ref<HTMLElement | null>(null)
const aiPickerPosition = ref<{ top: number; right: number } | null>(null)
let longPressTimer: number | undefined
let longPressTriggered = false

function openAiPicker() {
  const anchor = aiAnchorRef.value
  if (!anchor) {
    aiPickerOpen.value = true
    return
  }
  const rect = anchor.getBoundingClientRect()
  // 移动端浮层向上展开（贴 dock 顶部，避开虚拟键盘）
  aiPickerPosition.value = {
    top: rect.top - 8,
    right: Math.max(8, window.innerWidth - rect.right),
  }
  aiPickerOpen.value = true
}

function onAiPointerDown(event: PointerEvent) {
  longPressTriggered = false
  if (event.button === 2) return
  if (longPressTimer) window.clearTimeout(longPressTimer)
  longPressTimer = window.setTimeout(() => {
    longPressTriggered = true
    vibrate('tap')
    openAiPicker()
  }, 380) as unknown as number
}

function onAiPointerUp() {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer)
    longPressTimer = undefined
  }
}

function onAiContextMenu(event: MouseEvent) {
  event.preventDefault()
  openAiPicker()
}

function onAiClick() {
  if (longPressTriggered) {
    longPressTriggered = false
    return
  }
  if (inlineRewrite.isStreaming.value) {
    abortAiRewrite()
  } else {
    startAiRewrite()
  }
}

function onPickerOutside(event: PointerEvent) {
  const t = event.target as Node | null
  if (!aiPickerOpen.value) return
  if (t && aiAnchorRef.value?.contains(t)) return
  const picker = document.getElementById('cd-ai-picker-portal')
  if (picker && t && picker.contains(t)) return
  aiPickerOpen.value = false
}

watch(aiPickerOpen, (open) => {
  if (typeof window === 'undefined') return
  if (open) window.addEventListener('pointerdown', onPickerOutside)
  else window.removeEventListener('pointerdown', onPickerOutside)
})

function handleEnhanceResult(result: EnhanceResult) {
  isMagicPulsing.value = true
  setTimeout(() => { isMagicPulsing.value = false }, 1000)
  emit('magic-enhance', result)
  magicMenuOpen.value = false
}

function handleAbTest(original: string, optimized: EnhanceResult) {
  isMagicPulsing.value = true
  setTimeout(() => { isMagicPulsing.value = false }, 1000)
  emit('magic-ab-test', original, optimized)
  magicMenuOpen.value = false
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    send()
  }
}

watch(prompt, () => {
  if (!prompt.value.trim()) magicMenuOpen.value = false
  autosize()
})

watch(
  () => props.isGenerating,
  (busy) => {
    if (busy && magicMenuOpen.value) magicMenuOpen.value = false
    syncLayoutSoon()
  },
)

watch(focused, (isFocused) => {
  autosize()
  if (isFocused) ensureCaretVisible()
})

watch(isCustomModel, (next) => {
  customModelOpen.value = next
  if (next) nextTick(() => customModelInputRef.value?.focus())
  syncLayoutSoon()
})

watch(() => props.referenceImages.length, syncLayoutSoon)
watch(() => props.continuation?.fromMessageId, syncLayoutSoon)
watch(() => props.healthOffline, syncLayoutSoon)

const throttledLayoutSync = rafThrottle(syncLayoutSoon)

onMounted(() => {
  autosize()
  syncLayoutSoon()
  if (typeof ResizeObserver !== 'undefined' && dockRef.value) {
    dockResizeObserver = new ResizeObserver(() => reportLayout())
    dockResizeObserver.observe(dockRef.value)
  }
  window.addEventListener('orientationchange', throttledLayoutSync, { passive: true })
})

onBeforeUnmount(() => {
  if (layoutFrame) cancelAnimationFrame(layoutFrame)
  if (autosizeFrame) cancelAnimationFrame(autosizeFrame)
  dockResizeObserver?.disconnect()
  dockResizeObserver = null
  window.removeEventListener('orientationchange', throttledLayoutSync)
  throttledLayoutSync.cancel()
})

defineExpose({ focusInput })
</script>


<template>
  <div
    ref="dockRef"
    class="chat-dock"
    :style="dockOuterStyle"
    :data-focused="focused ? 'true' : 'false'"
    data-tour="chat-dock"
  >
    <!-- soft fade above the dock so chat content doesn't bleed into the toolbar -->
    <div class="chat-dock__veil" aria-hidden="true"></div>

    <input
      ref="referenceInputRef"
      type="file"
      class="sr-only"
      accept="image/png,image/jpeg,image/webp,image/gif"
      multiple
      @change="onReferenceInputChange"
    />

    <div class="chat-dock__inner">
      <!-- continuation banner -->
      <Transition name="dock-fade">
        <div
          v-if="continuation"
          class="chat-dock__continuation"
          role="status"
          aria-label="正在接着画"
        >
          <button
            type="button"
            class="chat-dock__continuation-target"
            aria-label="跳回原始对话"
            @click.stop="emit('jump-to-continuation', continuation.fromMessageId)"
          >
            <span class="chat-dock__continuation-thumb">
              <img :src="continuation.thumbnailUrl" alt="" loading="lazy" decoding="async" />
              <span class="chat-dock__continuation-thumb-mark"><Icon name="sparkle" :size="9" /></span>
            </span>
            <span class="chat-dock__continuation-text">
              <span class="chat-dock__continuation-title">接着画</span>
              <span class="chat-dock__continuation-sub">
                基于第 {{ continuation.fromImageIndex + 1 }} 张图，描述你想改的细节
              </span>
            </span>
          </button>
          <button
            type="button"
            class="chat-dock__icon-btn"
            aria-label="取消接着画"
            @click.stop="emit('cancel-continuation')"
          >
            <Icon name="close" :size="12" />
          </button>
        </div>
      </Transition>

      <!-- offline banner -->
      <Transition name="dock-fade">
        <div v-if="healthOffline" class="chat-dock__offline" role="alert">
          <Icon name="warning" :size="13" />
          <span>后端离线，发送会失败</span>
        </div>
      </Transition>

      <!-- AI 改写状态条 -->
      <AiRewriteRibbon
        :phase="aiRewriteState.phase"
        :model-id="aiRewriteState.modelId"
        :elapsed-ms="aiRewriteState.elapsedMs"
        :tools-used="aiRewriteState.tools.length"
        :error-message="aiRewriteState.errorMessage"
        :error-code="aiRewriteState.errorCode"
        variant="mobile"
        @apply="applyAiResult"
        @revert="revertAiResult"
        @retry="retryAiRewrite"
        @abort="abortAiRewrite"
        @dismiss="dismissAiRibbon"
      />

      <!-- reference images strip — placed ABOVE the input (key fix) -->
      <Transition name="dock-fade">
        <div
          v-if="hasReferenceImages"
          class="chat-dock__refs"
          role="region"
          aria-label="参考图"
        >
          <div class="chat-dock__refs-row">
            <div
              v-for="image in props.referenceImages"
              :key="image.id"
              class="chat-dock__ref-card"
            >
              <img :src="image.previewUrl" :alt="image.name" loading="lazy" decoding="async" />
              <button
                type="button"
                class="chat-dock__ref-remove"
                :aria-label="`移除 ${image.name}`"
                @click.stop="handleRemoveReferenceImage(image.id)"
              >
                <Icon name="close" :size="10" />
              </button>
            </div>
            <button
              v-if="props.referenceImages.length < maxReferenceImages"
              type="button"
              class="chat-dock__ref-add"
              aria-label="继续添加参考图"
              @click.stop="openReferencePicker"
            >
              <Icon name="upload" :size="14" />
            </button>
          </div>
          <span class="chat-dock__refs-count">
            {{ props.referenceImages.length }} / {{ maxReferenceImages }}
          </span>
        </div>
      </Transition>

      <!-- custom model name editor -->
      <Transition name="dock-fade">
        <div v-if="isCustomModel && customModelOpen" class="chat-dock__custom">
          <label class="chat-dock__custom-label" for="chat-custom-model">
            <Icon name="pencil" :size="11" />
            <span>自定义模型名</span>
          </label>
          <input
            id="chat-custom-model"
            ref="customModelInputRef"
            v-model="customModel"
            type="text"
            class="chat-dock__custom-input"
            placeholder="例如 dall-e-3、flux-pro"
            autocomplete="off"
            spellcheck="false"
            maxlength="64"
          />
        </div>
      </Transition>

      <!-- main composer card -->
      <div class="chat-dock__shell" :class="{ 'is-focused': focused, 'is-pulsing': isMagicPulsing, 'is-ai-streaming': inlineRewrite.isStreaming.value }">
        <textarea
          ref="textareaRef"
          v-model="displayedPrompt"
          rows="1"
          :placeholder="inputPlaceholder"
          class="chat-dock__textarea"
          :readonly="inlineRewrite.isStreaming.value"
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
        ></textarea>

        <!-- inline counter / elapsed indicator (only when relevant, never blocks input) -->
        <span
          v-if="isGenerating"
          class="chat-dock__indicator"
          aria-live="polite"
        >
          <Icon name="sparkle" :size="10" class="animate-breathe" />
          <span>{{ elapsedSeconds }}s</span>
        </span>
        <span
          v-else-if="focused && promptCount > 0"
          class="chat-dock__indicator chat-dock__indicator--quiet"
          :class="promptCountTone.tone"
          :title="promptCountTone.hint || undefined"
          :aria-hidden="promptCountTone.hint ? undefined : true"
          :aria-label="promptCountTone.hint ? `提示词字数 ${promptCount}，${promptCountTone.hint}` : undefined"
        >{{ promptCount }}</span>

        <!-- toolbar row: scrollable chips on the left, send on the right -->
        <div class="chat-dock__toolbar">
          <div class="chat-dock__toolbar-scroll" role="toolbar" aria-label="制版工具">
            <div class="chat-dock__model-chip">
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
              class="chat-dock__chip"
              :aria-label="`当前风格：${currentStyleMeta.label}，点击更换`"
              @click.stop="emit('open-style-sheet')"
            >
              <StyleSwatch :variant="currentStyleMeta.value" :size="18" />
              <span class="chat-dock__chip-label">{{ currentStyleMeta.label }}</span>
              <Icon name="chevronDown" :size="10" class="text-muted" />
            </button>

            <button
              type="button"
              class="chat-dock__chip"
              :class="{ 'chat-dock__chip--active': hasReferenceImages }"
              :disabled="props.referenceImages.length >= maxReferenceImages"
              :aria-label="hasReferenceImages ? `参考图 ${props.referenceImages.length} 张，继续添加` : '添加参考图'"
              @click.stop="openReferencePicker"
            >
              <Icon :name="hasReferenceImages ? 'image' : 'upload'" :size="13" />
              <span class="chat-dock__chip-label">
                {{ hasReferenceImages ? `参考 ${props.referenceImages.length}` : '参考图' }}
              </span>
            </button>

            <button
              v-if="promptCount > 0"
              ref="aiAnchorRef"
              type="button"
              class="chat-dock__chip chat-dock__chip--ai"
              :class="{
                'is-busy': inlineRewrite.isStreaming.value,
                'is-picker-open': aiPickerOpen,
              }"
              :aria-label="inlineRewrite.isStreaming.value ? '正在 AI 改写，点击取消' : `让 ${REWRITE_MODELS[aiRewriteState.modelId].label} 改写提示词。长按可切换模型。`"
              :aria-haspopup="!inlineRewrite.isStreaming.value ? 'menu' : undefined"
              :aria-expanded="aiPickerOpen ? 'true' : 'false'"
              @click.stop="onAiClick"
              @pointerdown="onAiPointerDown"
              @pointerup="onAiPointerUp"
              @pointercancel="onAiPointerUp"
              @pointerleave="onAiPointerUp"
              @contextmenu="onAiContextMenu"
            >
              <Icon
                :name="inlineRewrite.isStreaming.value ? 'close' : 'sparkle'"
                :size="13"
              />
              <span class="chat-dock__chip-label">
                {{ inlineRewrite.isStreaming.value ? '取消' : 'AI 优化' }}
              </span>
              <span
                v-if="!inlineRewrite.isStreaming.value"
                class="chat-dock__chip-tag"
                aria-hidden="true"
              >{{ REWRITE_MODELS[aiRewriteState.modelId].label }}</span>
            </button>
            <Teleport to="body">
              <Transition name="dock-fade">
                <div
                  v-if="aiPickerOpen && !inlineRewrite.isStreaming.value && aiPickerPosition"
                  id="cd-ai-picker-portal"
                  class="chat-dock__ai-picker"
                  role="menu"
                  aria-label="选择 AI 改写模型"
                  :style="{
                    top: 'auto',
                    bottom: `calc(100vh - ${aiPickerPosition.top}px)`,
                    right: `${aiPickerPosition.right}px`,
                    left: 'auto',
                  }"
                  @click.stop
                >
                  <p class="chat-dock__ai-picker-title">
                    <span>选择 AI 改写模型</span>
                    <small>项目方赞助 · 你不用付钱</small>
                  </p>
                  <button
                    v-for="m in REWRITE_MODEL_LIST"
                    :key="m.id"
                    type="button"
                    role="menuitemradio"
                    class="chat-dock__ai-pick"
                    :class="{ 'is-active': aiRewriteState.modelId === m.id }"
                    :aria-checked="aiRewriteState.modelId === m.id"
                    @click="pickAiModel(m.id)"
                  >
                    <span class="chat-dock__ai-pick-name">{{ m.label }}</span>
                    <span class="chat-dock__ai-pick-tag">{{ m.tagline }}</span>
                    <span class="chat-dock__ai-pick-time">{{ m.expectedSeconds[0] }}–{{ m.expectedSeconds[1] }}s</span>
                  </button>
                </div>
              </Transition>
            </Teleport>

            <div v-if="promptCount > 0" class="chat-dock__chip-wrap">
              <button
                type="button"
                class="chat-dock__chip chat-dock__chip--magic"
                :class="{ 'is-open': magicMenuOpen }"
                aria-label="智能优化提示词"
                :aria-expanded="magicMenuOpen"
                @click.stop="magicEnhance"
              >
                <Icon name="sparkle" :size="13" />
                <span class="chat-dock__chip-label">优化</span>
              </button>
              <MagicEnhanceMenu
                v-if="magicMenuOpen"
                :prompt="prompt"
                :image-style="props.currentStyle"
                :has-reference-images="hasReferenceImages"
                :size="props.size"
                :quality="props.quality"
                :model-name="props.modelName"
                :context="props.promptContext ?? null"
                compact
                @enhance="handleEnhanceResult"
                @ab-test="handleAbTest"
                @update-prompt="(value: string) => { prompt = value }"
                @close="magicMenuOpen = false"
              />
            </div>

            <button
              v-if="props.canUndoEnhance"
              type="button"
              class="chat-dock__chip chat-dock__chip--undo"
              aria-label="撤销魔法增强"
              @click.stop="emit('undo-enhance')"
            >
              <Icon name="reset" :size="13" />
            </button>
          </div>

          <button
            type="button"
            class="chat-dock__send"
            :class="{
              'chat-dock__send--ready': promptHasContent && !sendDisabled && !isGenerating,
              'chat-dock__send--busy': isGenerating,
            }"
            :disabled="sendDisabled"
            :aria-label="sendLabel"
            @click.stop="send"
          >
            <Icon v-if="isGenerating" name="close" :size="16" />
            <Icon v-else name="send" :size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>


<style scoped>
/* ------------------------------------------------------------------
 * ChatDock — mobile composer
 *
 * Fixed at the bottom of the viewport. Vertical position is controlled
 * by translate3d(-keyboardInset) (GPU only, never `bottom`). Reference
 * images sit ABOVE the textarea so they never push the input off screen.
 * ------------------------------------------------------------------ */

.chat-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 45; /* matches Tailwind z-dock */
  pointer-events: none;
  /* GPU-only animation when the on-screen keyboard pushes the dock up */
  transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
  contain: layout paint style;
}

.chat-dock__veil {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: 28px;
  pointer-events: none;
  background: linear-gradient(to top, rgb(var(--color-paper)) 0%, rgb(var(--color-paper) / 0) 100%);
}

.chat-dock__inner {
  position: relative;
  pointer-events: auto;
  padding: 8px 10px max(env(safe-area-inset-bottom, 0px), 8px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: linear-gradient(to top, rgb(var(--color-paper)) 60%, rgb(var(--color-paper) / 0));
}

/* ------------------------------------------------------------------
 * Banners (continuation, offline)
 * ------------------------------------------------------------------ */

.chat-dock__continuation {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 6px;
  border-radius: 16px;
  border: 1px solid rgb(var(--color-forest) / 0.32);
  background:
    linear-gradient(90deg, rgb(var(--color-forest) / 0.1), transparent 50%),
    rgb(var(--color-vellum) / 0.94);
  box-shadow: 0 8px 22px -22px rgb(var(--color-forest) / 0.6);
}

.chat-dock__continuation-target {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 2px 4px;
  border-radius: 12px;
  background: transparent;
  color: rgb(var(--color-ink));
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
}

.chat-dock__continuation-thumb {
  position: relative;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 9px;
  overflow: hidden;
  border: 1px solid rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-paper-soft));
}

.chat-dock__continuation-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-dock__continuation-thumb-mark {
  position: absolute;
  top: -3px;
  right: -3px;
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: rgb(var(--color-forest));
  color: rgb(var(--color-paper));
  border: 1.5px solid rgb(var(--color-vellum));
}

.chat-dock__continuation-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.15;
}

.chat-dock__continuation-title {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgb(var(--color-forest));
}

.chat-dock__continuation-sub {
  margin-top: 1px;
  font-size: 12px;
  color: rgb(var(--color-ink) / 0.78);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-dock__icon-btn {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgb(var(--color-paper) / 0.6);
  color: rgb(var(--color-muted));
  border: 1px solid rgb(var(--color-line) / 0.7);
  cursor: pointer;
  transition: background-color 140ms var(--motion-soft), color 140ms var(--motion-soft);
  -webkit-tap-highlight-color: transparent;
}

.chat-dock__icon-btn::before {
  content: '';
  position: absolute;
  inset: -6px;
}

.chat-dock__icon-btn:active {
  background: rgb(var(--color-paper));
  color: rgb(var(--color-accent));
}

.chat-dock__offline {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 12px;
  border: 1px solid rgb(var(--color-accent) / 0.3);
  background: rgb(var(--color-accent) / 0.06);
  color: rgb(var(--color-accent));
  font-size: 11px;
  font-weight: 500;
}


/* ------------------------------------------------------------------
 * Reference images strip — sits ABOVE the textarea so the input is
 * always glued to the keyboard. Horizontally scrollable.
 * ------------------------------------------------------------------ */

.chat-dock__refs {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 16px;
  border: 1px solid rgb(var(--color-line) / 0.7);
  background: rgb(var(--color-vellum) / 0.84);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: var(--shadow-inner-paper);
  overflow: hidden;
}

.chat-dock__refs-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  scroll-snap-type: x proximity;
  padding: 2px 0;
}

.chat-dock__refs-row::-webkit-scrollbar {
  display: none;
}

.chat-dock__ref-card {
  position: relative;
  flex: 0 0 auto;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-paper-soft));
  scroll-snap-align: start;
  box-shadow: 0 6px 14px -14px rgb(var(--color-ink) / 0.4);
}

.chat-dock__ref-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-dock__ref-remove {
  position: absolute;
  top: 3px;
  right: 3px;
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: rgb(var(--color-ink) / 0.8);
  color: rgb(var(--color-paper));
  border: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.chat-dock__ref-remove::before {
  content: '';
  position: absolute;
  inset: -6px;
}

.chat-dock__ref-add {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  border: 1px dashed rgb(var(--color-line-strong));
  background: rgb(var(--color-paper) / 0.4);
  color: rgb(var(--color-muted));
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 140ms var(--motion-soft), color 140ms var(--motion-soft);
}

.chat-dock__ref-add:active {
  border-color: rgb(var(--color-ink));
  color: rgb(var(--color-ink));
}

.chat-dock__refs-count {
  flex-shrink: 0;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: rgb(var(--color-muted));
  padding-right: 4px;
}

/* ------------------------------------------------------------------
 * Custom model name editor
 * ------------------------------------------------------------------ */

.chat-dock__custom {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 14px;
  border: 1px solid rgb(var(--color-line) / 0.7);
  background: rgb(var(--color-vellum) / 0.84);
}

.chat-dock__custom-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgb(var(--color-muted));
}

.chat-dock__custom-input {
  width: 100%;
  border-radius: 10px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-paper));
  padding: 8px 10px;
  font-size: 13px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: rgb(var(--color-ink));
  outline: none;
  transition: border-color 140ms var(--motion-soft), box-shadow 140ms var(--motion-soft);
}

.chat-dock__custom-input:focus {
  border-color: rgb(var(--color-ink) / 0.5);
  box-shadow: var(--focus-ring);
}


/* ------------------------------------------------------------------
 * Composer shell & textarea
 * ------------------------------------------------------------------ */

.chat-dock__shell {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 22px;
  border: 1px solid rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-vellum) / 0.96);
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.55),
    0 16px 36px -22px rgb(var(--color-ink) / 0.32);
  transition: border-color 180ms var(--motion-soft), box-shadow 180ms var(--motion-soft);
  contain: layout paint style;
}

.chat-dock__shell.is-focused {
  border-color: rgb(var(--color-ink) / 0.4);
  box-shadow:
    0 1px 0 rgb(255 255 255 / 0.65),
    0 22px 44px -22px rgb(var(--color-ink) / 0.42),
    var(--focus-ring);
}

.chat-dock__textarea {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 12px 14px 4px;
  resize: none;
  background: transparent;
  border: 0;
  outline: none;
  color: rgb(var(--color-ink));
  font-family: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 16px;
  line-height: 1.45;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  overscroll-behavior: contain;
  -webkit-tap-highlight-color: transparent;
  caret-color: rgb(var(--color-forest));
}

.chat-dock__textarea::-webkit-scrollbar {
  display: none;
}

.chat-dock__textarea::placeholder {
  color: rgb(var(--color-muted) / 0.7);
}

.chat-dock__indicator {
  position: absolute;
  top: 10px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgb(var(--color-paper) / 0.7);
  border: 1px solid rgb(var(--color-line) / 0.6);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-feature-settings: 'tnum';
  letter-spacing: 0.06em;
  color: rgb(var(--color-muted));
  pointer-events: none;
}

.chat-dock__indicator--quiet {
  background: transparent;
  border-color: transparent;
  padding: 0;
  color: rgb(var(--color-muted) / 0.62);
}

.chat-dock__shell.is-pulsing::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, transparent, rgb(var(--color-forest) / 0.14), rgb(var(--color-accent) / 0.12), transparent);
  background-size: 200% 100%;
  animation: dock-magic-sweep 900ms var(--motion-soft) forwards;
  pointer-events: none;
  z-index: 0;
}

@keyframes dock-magic-sweep {
  from { background-position: 100% 0; opacity: 0.85; }
  to { background-position: -100% 0; opacity: 0; }
}


/* ------------------------------------------------------------------
 * Toolbar — single horizontal row, scrolls when chips overflow.
 * Send button is pinned on the right and never scrolls.
 * ------------------------------------------------------------------ */

.chat-dock__toolbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 6px;
  border-top: 1px solid rgb(var(--color-line) / 0.55);
  margin-top: 2px;
}

.chat-dock__toolbar-scroll {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 2px 2px;
  /* mask edges so chips fade into the toolbar instead of clipping abruptly */
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0, #000 12px, #000 calc(100% - 12px), transparent 100%);
}

.chat-dock__toolbar-scroll::-webkit-scrollbar {
  display: none;
}

.chat-dock__model-chip {
  position: relative;
  z-index: 6;
  flex-shrink: 0;
}

.chat-dock__model-chip :deep(.select-trigger) {
  height: 32px;
  max-width: clamp(6.5rem, 32vw, 10rem);
  border-radius: 999px;
  padding: 0 26px 0 10px;
  background: rgb(var(--color-ivory) / 0.7);
  border-color: rgb(var(--color-line-strong));
  font-size: 12px;
  font-weight: 500;
  color: rgb(var(--color-ink));
  letter-spacing: 0;
}

.chat-dock__model-chip :deep(.select-trigger.is-open) {
  background: rgb(var(--color-vellum));
  border-color: rgb(var(--color-ink));
  box-shadow: var(--focus-ring);
}

.chat-dock__model-chip :deep(.select-trigger__caret) {
  right: 8px;
  color: rgb(var(--color-muted));
}

.chat-dock__chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  height: 32px;
  padding: 0 11px;
  border-radius: 999px;
  background: rgb(var(--color-ivory) / 0.7);
  border: 1px solid rgb(var(--color-line-strong));
  color: rgb(var(--color-ink));
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 140ms var(--motion-soft),
    border-color 140ms var(--motion-soft),
    color 140ms var(--motion-soft),
    transform 140ms var(--motion-press);
  -webkit-tap-highlight-color: transparent;
}

.chat-dock__chip::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: inherit;
}

.chat-dock__chip:active {
  transform: scale(0.96);
}

.chat-dock__chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.chat-dock__chip-label {
  white-space: nowrap;
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-dock__chip--active {
  background: rgb(var(--color-forest) / 0.1);
  border-color: rgb(var(--color-forest) / 0.4);
  color: rgb(var(--color-forest));
}

.chat-dock__chip-wrap {
  position: relative;
  flex-shrink: 0;
}

.chat-dock__chip--magic {
  background: linear-gradient(135deg, rgb(var(--color-forest) / 0.14), rgb(var(--color-accent) / 0.1));
  border-color: rgb(var(--color-forest) / 0.32);
  color: rgb(var(--color-forest));
  font-weight: 600;
}

.chat-dock__chip--magic.is-open {
  background: rgb(var(--color-ink));
  border-color: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
}

/* ── AI 改写 chip ── */

.chat-dock__chip--ai {
  position: relative;
  background:
    linear-gradient(135deg, rgb(var(--color-ochre) / 0.18), rgb(var(--color-accent) / 0.12));
  border-color: rgb(var(--color-ochre) / 0.42);
  color: rgb(var(--color-ochre));
  font-weight: 700;
  user-select: none;
  -webkit-user-select: none;
}

.chat-dock__chip--ai:hover {
  border-color: rgb(var(--color-ink) / 0.3);
}

.chat-dock__chip--ai.is-busy,
.chat-dock__chip--ai.is-picker-open {
  background: rgb(var(--color-ink));
  border-color: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
}

.chat-dock__chip--ai.is-busy {
  animation: ai-chip-pulse 1.4s var(--motion-soft) infinite;
}

@keyframes ai-chip-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgb(var(--color-ochre) / 0.32); }
  50% { box-shadow: 0 0 0 6px rgb(var(--color-ochre) / 0); }
}

.chat-dock__chip-tag {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  padding: 0 6px;
  height: 16px;
  border-radius: 999px;
  background: rgb(var(--color-paper) / 0.62);
  color: rgb(var(--color-ochre));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border: 1px solid rgb(var(--color-ochre) / 0.32);
}

.chat-dock__chip--ai.is-busy .chat-dock__chip-tag,
.chat-dock__chip--ai.is-picker-open .chat-dock__chip-tag {
  background: rgb(var(--color-paper) / 0.16);
  color: rgb(var(--color-paper));
  border-color: rgb(var(--color-paper) / 0.3);
}

/* ── AI 模型选择浮层 —— 用 Teleport 到 body，绝对定位 ── */

.chat-dock__ai-picker {
  position: fixed;
  z-index: 200;
  min-width: 220px;
  max-width: min(280px, calc(100vw - 16px));
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 6px 6px;
  border-radius: 14px;
  border: 1px solid rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-paper));
  box-shadow:
    0 24px 40px -22px rgb(var(--color-ink) / 0.45),
    0 8px 16px -10px rgb(var(--color-ink) / 0.22);
}

.chat-dock__ai-picker-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0 0 4px;
  padding: 0 8px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--color-muted));
}

.chat-dock__ai-picker-title small {
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  font-size: 9px;
  font-weight: 540;
  letter-spacing: 0.02em;
  color: rgb(var(--color-forest));
  text-transform: none;
  white-space: nowrap;
}

.chat-dock__ai-pick {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px 10px;
  padding: 9px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: rgb(var(--color-ink));
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 140ms var(--motion-soft);
}

.chat-dock__ai-pick-name {
  font-family: 'Fraunces', 'IBM Plex Sans', system-ui, serif;
  font-weight: 700;
  letter-spacing: -0.005em;
}

.chat-dock__ai-pick-tag {
  grid-column: 1;
  font-size: 10.5px;
  font-weight: 540;
  color: rgb(var(--color-muted));
  letter-spacing: 0.02em;
}

.chat-dock__ai-pick-time {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  color: rgb(var(--color-muted));
  white-space: nowrap;
}

.chat-dock__ai-pick:hover {
  background: rgb(var(--color-paper-soft));
}

.chat-dock__ai-pick.is-active {
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
}

.chat-dock__ai-pick.is-active .chat-dock__ai-pick-tag,
.chat-dock__ai-pick.is-active .chat-dock__ai-pick-time {
  color: rgb(var(--color-paper) / 0.72);
}

/* ── 流式中：textarea 边缘流光 ── */

.chat-dock__shell.is-ai-streaming {
  border-color: rgb(var(--color-ochre) / 0.55);
  box-shadow:
    var(--shadow-inner-paper),
    0 0 0 1.5px rgb(var(--color-ochre) / 0.32);
}

.chat-dock__shell.is-ai-streaming .chat-dock__textarea {
  background:
    linear-gradient(180deg, rgb(var(--color-vellum) / 0.6), rgb(var(--color-paper) / 0.92));
  caret-color: transparent;
}

@media (prefers-reduced-motion: reduce) {
  .chat-dock__chip--ai.is-busy { animation: none; }
}

.chat-dock__chip--undo {
  background: rgb(var(--color-accent) / 0.08);
  border-color: rgb(var(--color-accent) / 0.3);
  color: rgb(var(--color-accent));
  padding: 0 10px;
}

/* ------------------------------------------------------------------
 * Send button — pinned to the right of the toolbar
 * ------------------------------------------------------------------ */

.chat-dock__send {
  position: relative;
  flex-shrink: 0;
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: rgb(var(--color-ink) / 0.06);
  color: rgb(var(--color-ink) / 0.32);
  border: 1px solid transparent;
  cursor: not-allowed;
  transition:
    background-color 160ms var(--motion-soft),
    color 160ms var(--motion-soft),
    transform 160ms var(--motion-press),
    box-shadow 200ms var(--motion-soft);
  -webkit-tap-highlight-color: transparent;
}

.chat-dock__send::before {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: inherit;
}

.chat-dock__send--ready {
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  cursor: pointer;
  box-shadow: 0 10px 22px -16px rgb(var(--color-ink) / 0.65);
}

.chat-dock__send--ready:active {
  transform: scale(0.92);
}

.chat-dock__send--busy {
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  cursor: pointer;
}

.chat-dock__send--busy::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 999px;
  border: 1px dashed rgb(var(--color-forest) / 0.7);
  animation: dock-send-spin 1.6s linear infinite;
  pointer-events: none;
}

@keyframes dock-send-spin {
  to { transform: rotate(360deg); }
}


/* ------------------------------------------------------------------
 * Transitions — opacity + transform only (no max-height animations,
 * which trigger layout work and cause jank on mobile).
 * ------------------------------------------------------------------ */

.dock-fade-enter-from,
.dock-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.dock-fade-enter-to,
.dock-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.dock-fade-enter-active,
.dock-fade-leave-active {
  transition: opacity 200ms var(--motion-soft), transform 220ms var(--motion-soft);
}

/* ------------------------------------------------------------------
 * Compact phones — keep chips legible without overflowing the screen
 * ------------------------------------------------------------------ */

@media (max-width: 360px) {
  .chat-dock__inner {
    padding-left: 8px;
    padding-right: 8px;
  }

  .chat-dock__chip {
    padding: 0 9px;
  }

  .chat-dock__chip--undo .chat-dock__chip-label,
  .chat-dock__chip--magic .chat-dock__chip-label {
    display: none;
  }

  .chat-dock__model-chip :deep(.select-trigger) {
    max-width: clamp(5rem, 28vw, 8rem);
  }
}

/* ------------------------------------------------------------------
 * Landscape phones — give the textarea a touch more height before
 * the keyboard takes over.
 * ------------------------------------------------------------------ */

@media (orientation: landscape) and (max-height: 540px) {
  .chat-dock__textarea {
    min-height: 36px;
    padding-top: 9px;
  }

  .chat-dock__inner {
    gap: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-dock,
  .chat-dock__shell,
  .chat-dock__chip,
  .chat-dock__send,
  .chat-dock__icon-btn,
  .dock-fade-enter-active,
  .dock-fade-leave-active {
    transition: none;
  }

  .chat-dock__send--busy::after,
  .chat-dock__shell.is-pulsing::after {
    animation: none;
  }
}
</style>
