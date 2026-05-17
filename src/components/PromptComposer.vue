<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import Icon from './Icon.vue'
import StyleSwatch from './StyleSwatch.vue'
import Select, { type SelectOption } from './Select.vue'
import PromptInsightChips from './PromptInsightChips.vue'
import AiRewriteRibbon from './AiRewriteRibbon.vue'
import { useInlineRewrite } from '../composables/useInlineRewrite'
import { REWRITE_MODEL_LIST, REWRITE_MODELS, type RewriteModelId } from '../lib/rewriteService'
import { maxReferenceImages } from '../lib/imagesApi'
import { customModelSentinel, sizeOptions, styleOptions } from '../presets'
import { stylePrompts } from '../lib/imagesApi'
import { useDiscoveredModels } from '../composables/useDiscoveredModels'
import type { ContinuationContext, ImageQuality, ImageSize, ImageStyle, ReferenceImageAttachment } from '../types'
import type { EnhanceResult } from '../lib/magicEnhance'
import { inferEnhanceIntent } from '../lib/magicEnhance'
import type { PromptContext } from '../lib/promptDoc'
import type { PromptTreeNode } from '../composables/usePromptTree'
import { reverseParseRevisedPrompt, docToPlainPrompt } from '../lib/revisedParser'

const PromptTreeline = defineAsyncComponent(() => import('./PromptTreeline.vue'))

const MagicEnhanceMenu = defineAsyncComponent(() => import('./MagicEnhanceMenu.vue'))

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
  referenceImages: ReferenceImageAttachment[]
  layout?: 'panel' | 'sheet'
  continuation?: ContinuationContext | null
  canUndoEnhance?: boolean
  quality?: ImageQuality
  modelName?: string
  promptContext?: PromptContext | null
  treeNodes?: PromptTreeNode[]
  treeCurrentId?: string | null
  treeCanUndo?: boolean
  treeCanRedo?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'panel',
  continuation: null,
  canUndoEnhance: false,
  quality: 'auto',
  modelName: '',
  promptContext: null,
  treeNodes: () => [],
  treeCurrentId: null,
  treeCanUndo: false,
  treeCanRedo: false,
})

const prompt = defineModel<string>('prompt', { required: true })
const imageStyle = defineModel<ImageStyle>('imageStyle', { required: true })
const size = defineModel<ImageSize>('size', { required: true })
const count = defineModel<number>('count', { required: true })
const modelChoice = defineModel<string>('modelChoice', { required: true })
const customModel = defineModel<string>('customModel', { required: true })

const emit = defineEmits<{
  (e: 'generate'): void
  (e: 'abort'): void
  (e: 'copy', text: string, message: string): void
  (e: 'clear'): void
  (e: 'open-settings'): void
  (e: 'select-reference-images', files: File[]): void
  (e: 'remove-reference-image', id: string): void
  (e: 'magic-enhance', result: EnhanceResult): void
  (e: 'magic-ab-test', original: string, optimized: EnhanceResult): void
  (e: 'toast-info', title: string, message?: string): void
  (e: 'undo-enhance'): void
  (e: 'tree-undo'): void
  (e: 'tree-redo'): void
  (e: 'tree-jump', id: string): void
  (e: 'tree-branch', id: string): void
  (e: 'tree-clear'): void
  (e: 'cancel-continuation'): void
}>()

const promptRef = ref<HTMLTextAreaElement | null>(null)
const referenceInputRef = ref<HTMLInputElement | null>(null)
const previewOpen = ref(false)
const dragActive = ref(false)
const magicMenuOpen = ref(false)
let dragDepth = 0

const activeStylePrompt = computed(() => stylePrompts[imageStyle.value] ?? '')
const isRawStyle = computed(() => imageStyle.value === 'raw')
const hasReferenceImages = computed(() => props.referenceImages.length > 0)
const canAddReferenceImages = computed(() => props.referenceImages.length < maxReferenceImages)

const promptCount = computed(() => prompt.value.length)
const promptTokens = computed(() => Math.max(1, Math.round(prompt.value.length / 4)))
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
  return { tone: 'text-muted', hint: '' }
})
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
  if (props.isGenerating) return 'Composing · 点击取消'
  if (props.continuation) return 'Continue frame'
  return 'Generate'
})

const promptPlaceholder = computed(() =>
  props.continuation
    ? '描述这张图下一步要改变什么：保留什么、替换什么、增加什么'
    : '一张极简咖啡品牌海报，暖色调，自然光，留白充足',
)

function handleGenerateClick(event: Event) {
  if (props.isGenerating) {
    event.preventDefault()
    emit('abort')
    return
  }
  if (!props.canGenerate) {
    event.preventDefault()
    return
  }
}

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

function handlePromptPaste(event: ClipboardEvent) {
  const pasted = event.clipboardData?.getData('text') ?? ''
  if (!pasted) return
  const looksStructured = /^(?:Subject|Lighting|Camera|Composition|主体|光位|镜头|构图)[:：]/m.test(pasted)
  if (!looksStructured || pasted.length < 24) return
  event.preventDefault()
  const doc = reverseParseRevisedPrompt({
    revisedPrompt: pasted,
    style: imageStyle.value,
    size: size.value,
    hasReferenceImages: hasReferenceImages.value,
  })
  const plain = docToPlainPrompt(doc) || pasted
  prompt.value = plain
  nextTick(() => {
    promptRef.value?.focus()
    emit('toast-info', '已解析为槽位', `识别 ${Object.keys(doc.slots).filter((k) => doc.slots[k as keyof typeof doc.slots]?.value).length} 个槽位，已规整化为可读 prompt`)
  })
}

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
}

function hasFileDrag(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function imageFilesFrom(dataTransfer: DataTransfer | null) {
  if (!dataTransfer?.files?.length) return []
  return Array.from(dataTransfer.files).filter((file) => file.type.startsWith('image/'))
}

function handleDragEnter(event: DragEvent) {
  if (props.layout !== 'panel' || !hasFileDrag(event)) return
  event.preventDefault()
  dragDepth += 1
  dragActive.value = true
}

function handleDragOver(event: DragEvent) {
  if (props.layout !== 'panel' || !hasFileDrag(event)) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = canAddReferenceImages.value ? 'copy' : 'none'
  }
  dragActive.value = true
}

function handleDragLeave() {
  if (!dragActive.value) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) {
    dragActive.value = false
  }
}

function handleReferenceDrop(event: DragEvent) {
  if (props.layout !== 'panel') return
  event.preventDefault()
  dragDepth = 0
  dragActive.value = false
  if (!canAddReferenceImages.value) return
  const files = imageFilesFrom(event.dataTransfer)
  if (files.length) {
    emit('select-reference-images', files)
  }
}

function removeReferenceImage(id: string) {
  emit('remove-reference-image', id)
}

defineExpose({ focusPrompt })

// ── AI 改写（桌面） ──
const inlineRewrite = useInlineRewrite()
const aiRewriteState = inlineRewrite.state
const aiPickerOpen = ref(false)

const displayedPrompt = computed({
  get() {
    if (inlineRewrite.isStreaming.value) return aiRewriteState.streamingText
    return prompt.value
  },
  set(v: string) {
    if (inlineRewrite.isStreaming.value) {
      inlineRewrite.abort()
      prompt.value = v
    } else {
      prompt.value = v
    }
  },
})

function startAiRewrite() {
  if (!prompt.value.trim()) return
  inlineRewrite.start({
    prompt: prompt.value,
    intent: inferEnhanceIntent(imageStyle.value, hasReferenceImages.value),
    hasReferenceImages: hasReferenceImages.value,
    style: imageStyle.value,
    size: size.value,
    quality: props.quality,
    modelName: props.modelName,
  }).catch(() => {})
}

function applyAiResult() {
  if (!inlineRewrite.hasResult.value) return
  prompt.value = aiRewriteState.resultText
  inlineRewrite.reset()
}

function revertAiResult() {
  prompt.value = aiRewriteState.snapshot
  inlineRewrite.reset()
}

function retryAiRewrite() {
  if (inlineRewrite.isStreaming.value) return
  const source = aiRewriteState.snapshot || prompt.value
  inlineRewrite.start({
    prompt: source,
    intent: inferEnhanceIntent(imageStyle.value, hasReferenceImages.value),
    hasReferenceImages: hasReferenceImages.value,
    style: imageStyle.value,
    size: size.value,
    quality: props.quality,
    modelName: props.modelName,
  }).catch(() => {})
}

function abortAiRewrite() {
  inlineRewrite.abort()
}

function dismissAiRibbon() {
  inlineRewrite.reset()
}

function pickAiModel(id: RewriteModelId) {
  inlineRewrite.selectModel(id)
  aiPickerOpen.value = false
}

// ── long-press / right-click → open picker ──
//   click 触发 startAiRewrite，长按或右键单独走 picker
const aiAnchorRef = ref<HTMLElement | null>(null)
const aiPickerPosition = ref<{ left: number; top: number } | null>(null)
let longPressTimer: number | undefined
let longPressTriggered = false

function openAiPicker() {
  const anchor = aiAnchorRef.value
  if (!anchor) {
    aiPickerOpen.value = true
    return
  }
  const rect = anchor.getBoundingClientRect()
  // 浮层右对齐到 anchor 右边沿，相对视口存储 right offset，避免模板引用 window
  aiPickerPosition.value = {
    top: rect.bottom + 6,
    left: Math.max(8, window.innerWidth - rect.right),
  }
  aiPickerOpen.value = true
}

function onAiPointerDown(event: PointerEvent) {
  longPressTriggered = false
  if (event.button === 2) return // right-click handled in contextmenu
  if (longPressTimer) window.clearTimeout(longPressTimer)
  longPressTimer = window.setTimeout(() => {
    longPressTriggered = true
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

function onAiKeydown(event: KeyboardEvent) {
  // Alt+Down / Shift+F10 / ContextMenu key 都打开选择器（无障碍）
  if (event.altKey && event.key === 'ArrowDown') {
    event.preventDefault()
    openAiPicker()
  } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault()
    openAiPicker()
  }
}

function onPickerOutside(event: PointerEvent) {
  const t = event.target as Node | null
  if (!aiPickerOpen.value) return
  // 点击 anchor 自身不要立刻关
  if (t && aiAnchorRef.value?.contains(t)) return
  const picker = document.getElementById('pc-ai-picker-portal')
  if (picker && t && picker.contains(t)) return
  aiPickerOpen.value = false
}

watch(aiPickerOpen, (open) => {
  if (typeof window === 'undefined') return
  if (open) {
    window.addEventListener('pointerdown', onPickerOutside)
  } else {
    window.removeEventListener('pointerdown', onPickerOutside)
  }
})

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

watch(prompt, () => {
  if (!prompt.value.trim()) magicMenuOpen.value = false
})
</script>

<template>
  <form
    class="relative flex flex-col gap-7"
    :class="{ 'pb-2': layout === 'sheet' }"
    @submit.prevent="emit('generate')"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleReferenceDrop"
  >
    <div
      v-if="layout === 'panel' && dragActive"
      class="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-[28px] border-2 border-dashed border-forest/60 bg-vellum/90 p-6 text-center shadow-paper-3 backdrop-blur"
      aria-hidden="true"
    >
      <div class="rounded-3xl border border-line bg-paper/85 px-6 py-5 shadow-paper-2">
        <Icon :name="canAddReferenceImages ? 'upload' : 'warning'" :size="22" class="mx-auto text-forest" />
        <p class="mt-3 font-display text-xl italic text-ink">
          {{ canAddReferenceImages ? '松手添加参考图' : '参考图已达上限' }}
        </p>
        <p class="mt-1 text-[12px] text-muted">
          {{ canAddReferenceImages ? '支持 PNG / JPEG / WEBP / GIF' : `最多 ${maxReferenceImages} 张参考图` }}
        </p>
      </div>
    </div>

    <header v-if="layout === 'panel'" class="space-y-2">
      <p class="display-eyebrow">01 · Compose</p>
      <h1 class="display-h1">构图草案</h1>
      <p class="text-[13px] leading-6 text-muted">
        控制主体、光线、镜头、材质与情绪。模板只塑造语气，不替你决定画面。
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

    <section class="space-y-2.5">
      <input
        ref="referenceInputRef"
        type="file"
        class="sr-only"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        @change="onReferenceInputChange"
      />

      <Transition name="composer-continuation">
        <div v-if="continuation" class="composer-continuation" role="status" aria-label="正在接着画">
          <span class="composer-continuation__thumb" aria-hidden="true">
            <img :src="continuation.thumbnailUrl" alt="" loading="lazy" decoding="async" />
            <span class="composer-continuation__thumb-mark">
              <Icon name="sparkle" :size="9" />
            </span>
          </span>
          <span class="composer-continuation__body">
            <span class="composer-continuation__title">接着画</span>
            <span class="composer-continuation__sub">
              基于第 {{ continuation.fromImageIndex + 1 }} 张图，告诉它你想改什么
            </span>
          </span>
          <button
            type="button"
            class="composer-continuation__cancel"
            aria-label="取消接着画"
            @click="emit('cancel-continuation')"
          >
            <Icon name="close" :size="12" />
          </button>
        </div>
      </Transition>

      <div class="flex items-center justify-between gap-3">
        <label for="prompt-input" class="label inline-flex items-center gap-1.5">
          <Icon name="pencil" :size="12" />
          <span>提示词</span>
        </label>
        <p
          class="font-mono text-[10px] tabular-nums transition-colors"
          :class="promptCountTone.tone"
          :title="promptCountTone.hint || undefined"
          :aria-label="promptCountTone.hint ? `提示词字数 ${promptCount}，${promptCountTone.hint}` : `提示词字数 ${promptCount}`"
        >{{ promptCount }}</p>
      </div>
      <div class="prompt-field-shell" :class="{ 'is-ai-streaming': inlineRewrite.isStreaming.value }" data-tour="composer-prompt" @click="promptRef?.focus()">
        <textarea
          id="prompt-input"
          ref="promptRef"
          v-model="displayedPrompt"
          :rows="layout === 'sheet' ? 5 : 6"
          class="prompt-field-textarea"
          :placeholder="promptPlaceholder"
          :readonly="inlineRewrite.isStreaming.value"
          autocomplete="off"
          spellcheck="false"
          @click.stop="promptRef?.focus()"
          @paste="handlePromptPaste"
        ></textarea>
        <div class="prompt-field-tools">
          <span class="prompt-model-chip">
            <span class="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              <Icon name="layers" :size="10" />
              模型
            </span>
            <Select
              v-model="modelChoice"
              :options="modelChipOptions"
              variant="chip"
              align="end"
              aria-label="选择生成模型"
              :placeholder="modelChipLabel"
            />
          </span>
          <span class="prompt-action-strip" aria-label="提示词操作">
            <button
              type="button"
              class="prompt-tool-btn"
              :disabled="props.referenceImages.length >= maxReferenceImages"
              @click.stop="openReferencePicker"
            >
              <Icon :name="hasReferenceImages ? 'image' : 'upload'" :size="12" />
              <span>{{ hasReferenceImages ? `参考 ${props.referenceImages.length}` : '参考图' }}</span>
            </button>
            <button
              v-if="prompt.length"
              ref="aiAnchorRef"
              type="button"
              class="prompt-tool-btn prompt-tool-btn--ai"
              :class="{ 'is-busy': inlineRewrite.isStreaming.value, 'is-picker-open': aiPickerOpen }"
              :aria-label="inlineRewrite.isStreaming.value ? '正在 AI 改写，点击取消' : `让 ${REWRITE_MODELS[aiRewriteState.modelId].label} 改写提示词。长按可切换模型。`"
              :aria-haspopup="!inlineRewrite.isStreaming.value ? 'menu' : undefined"
              :aria-expanded="aiPickerOpen ? 'true' : 'false'"
              @click.stop="onAiClick"
              @pointerdown="onAiPointerDown"
              @pointerup="onAiPointerUp"
              @pointercancel="onAiPointerUp"
              @pointerleave="onAiPointerUp"
              @contextmenu="onAiContextMenu"
              @keydown="onAiKeydown"
            >
              <Icon
                :name="inlineRewrite.isStreaming.value ? 'close' : 'sparkle'"
                :size="12"
              />
              <span>{{ inlineRewrite.isStreaming.value ? '取消' : 'AI 优化' }}</span>
              <span
                v-if="!inlineRewrite.isStreaming.value"
                class="prompt-tool-btn__model-tag"
                aria-hidden="true"
              >{{ REWRITE_MODELS[aiRewriteState.modelId].label }}</span>
            </button>
            <Teleport to="body">
              <Transition name="dlg-fade">
                <div
                  v-if="aiPickerOpen && !inlineRewrite.isStreaming.value && aiPickerPosition"
                  id="pc-ai-picker-portal"
                  class="prompt-ai-picker"
                  role="menu"
                  aria-label="选择 AI 改写模型"
                  :style="{
                    top: `${aiPickerPosition.top}px`,
                    right: `${aiPickerPosition.left}px`,
                    left: 'auto',
                  }"
                  @click.stop
                >
                  <p class="prompt-ai-picker__title">
                    <span>选择 AI 改写模型</span>
                    <small>项目方赞助 · 你不用付钱</small>
                  </p>
                  <button
                    v-for="m in REWRITE_MODEL_LIST"
                    :key="m.id"
                    type="button"
                    role="menuitemradio"
                    class="prompt-ai-pick"
                    :class="{ 'is-active': aiRewriteState.modelId === m.id }"
                    :aria-checked="aiRewriteState.modelId === m.id"
                    @click="pickAiModel(m.id)"
                  >
                    <span class="prompt-ai-pick-name">{{ m.label }}</span>
                    <span class="prompt-ai-pick-tag">{{ m.tagline }}</span>
                    <span class="prompt-ai-pick-time">{{ m.expectedSeconds[0] }}–{{ m.expectedSeconds[1] }}s</span>
                  </button>
                </div>
              </Transition>
            </Teleport>

            <span class="relative">
              <button
                v-if="prompt.length"
                type="button"
                class="prompt-tool-btn prompt-tool-btn--accent"
                aria-label="智能优化提示词"
                :aria-expanded="magicMenuOpen"
                @click.stop="magicMenuOpen = !magicMenuOpen"
              >
                <Icon name="sparkle" :size="12" />
                <span>深度</span>
              </button>
              <MagicEnhanceMenu
                v-if="magicMenuOpen"
                :prompt="prompt"
                :image-style="imageStyle"
                :has-reference-images="hasReferenceImages"
                :size="size"
                :quality="props.quality"
                :model-name="props.modelName"
                :context="props.promptContext ?? null"
                @enhance="(result: EnhanceResult) => { emit('magic-enhance', result); magicMenuOpen = false }"
                @ab-test="(original: string, optimized: EnhanceResult) => { emit('magic-ab-test', original, optimized); magicMenuOpen = false }"
                @update-prompt="(value: string) => { prompt = value }"
                @close="magicMenuOpen = false"
              />
            </span>
            <button
              v-if="props.canUndoEnhance"
              type="button"
              class="prompt-tool-btn prompt-tool-btn--danger"
              @click.stop="emit('undo-enhance')"
            >
              <Icon name="reset" :size="12" />
              <span>撤销</span>
            </button>
            <button
              v-if="prompt.length"
              type="button"
              class="prompt-tool-btn prompt-tool-btn--icon"
              aria-label="复制提示词"
              @click.stop="emit('copy', prompt, '已复制提示词')"
            >
              <Icon name="copy" :size="12" />
              <span>复制</span>
            </button>
            <button
              v-if="prompt.length"
              type="button"
              class="prompt-tool-btn prompt-tool-btn--icon"
              aria-label="清空提示词"
              @click.stop="clearPrompt"
            >
              <Icon name="eraser" :size="12" />
              <span>清空</span>
            </button>
          </span>
        </div>
      </div>
      <AiRewriteRibbon
        :phase="aiRewriteState.phase"
        :model-id="aiRewriteState.modelId"
        :elapsed-ms="aiRewriteState.elapsedMs"
        :tools-used="aiRewriteState.tools.length"
        :error-message="aiRewriteState.errorMessage"
        :error-code="aiRewriteState.errorCode"
        variant="desktop"
        @apply="applyAiResult"
        @revert="revertAiResult"
        @retry="retryAiRewrite"
        @abort="abortAiRewrite"
        @dismiss="dismissAiRibbon"
      />
      <div
        v-if="hasReferenceImages"
        class="rounded-2xl border border-line bg-vellum/70 p-3"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            <Icon name="image" :size="10" />
            <span>参考图 {{ props.referenceImages.length }} / {{ maxReferenceImages }}</span>
          </p>
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

        <div class="flex flex-wrap gap-2">
          <div
            v-for="image in props.referenceImages"
            :key="image.id"
            class="group relative h-24 w-24 overflow-hidden rounded-2xl border border-line bg-paper-soft"
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
              class="absolute right-1.5 top-1.5 inline-grid h-6 w-6 place-items-center rounded-full bg-ink/75 text-paper opacity-0 transition group-hover:opacity-100"
              :aria-label="`移除参考图 ${image.name}`"
              @click="removeReferenceImage(image.id)"
            >
              <Icon name="close" :size="11" />
            </button>
            <span class="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-ink/80 to-transparent px-2 pb-1 pt-4 text-[10px] font-medium text-paper">
              {{ image.name }}
            </span>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between text-[11px]">
        <p class="flex items-center gap-2">
          <span class="font-mono uppercase tracking-[0.2em]" :class="promptTone.tone">{{ promptTone.label }}</span>
          <span class="font-mono text-muted/70">~{{ promptTokens }} tokens</span>
        </p>
      </div>

      <PromptTreeline
        v-if="layout === 'panel' && (props.treeNodes?.length ?? 0) > 1"
        :nodes="props.treeNodes ?? []"
        :current-id="props.treeCurrentId ?? null"
        :can-undo="props.treeCanUndo ?? false"
        :can-redo="props.treeCanRedo ?? false"
        @undo="emit('tree-undo')"
        @redo="emit('tree-redo')"
        @jump="(id) => emit('tree-jump', id)"
        @branch="(id) => emit('tree-branch', id)"
        @clear="emit('tree-clear')"
      />

      <PromptInsightChips
        :prompt="prompt"
        @pick="magicMenuOpen = true"
      />

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

    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <label class="label inline-flex items-center gap-1.5">
          <Icon name="swatch" :size="12" />
          <span>提示词模板</span>
        </label>
        <span class="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{{ styleOptions.length }} 预设</span>
      </div>
      <div class="style-grid">
        <button
          v-for="item in styleOptions"
          :key="item.value"
          type="button"
          class="style-card"
          :class="{ 'style-card--active': imageStyle === item.value }"
          :aria-pressed="imageStyle === item.value"
          @click="imageStyle = item.value"
        >
          <span class="style-card__rail" aria-hidden="true"></span>
          <StyleSwatch :variant="item.value" :active="imageStyle === item.value" :size="40" />
          <span class="style-card__body">
            <span class="style-card__top">
              <span class="style-card__title">{{ item.label }}</span>
              <Icon v-if="imageStyle === item.value" name="check" :size="12" />
            </span>
            <span class="style-card__accent">{{ item.accent }}</span>
            <span class="style-card__desc">{{ item.description }}</span>
          </span>
        </button>
      </div>

      <button
        type="button"
        class="flex w-full items-center justify-between rounded-2xl border border-line bg-cream/50 px-3 py-2.5 text-left text-[12px] transition hover:border-line-strong hover:bg-paper-soft"
        :aria-expanded="previewOpen"
        @click="previewOpen = !previewOpen"
      >
        <span class="flex items-center gap-2">
          <Icon name="info" :size="12" class="text-muted" />
          <span class="text-ink">
            <span v-if="isRawStyle">已选 「不套模板」：原样发送</span>
            <span v-else>生图时会拼接的「风格指引」</span>
          </span>
        </span>
        <Icon
          name="chevronDown"
          :size="12"
          class="text-muted transition"
          :class="previewOpen ? 'rotate-180' : ''"
        />
      </button>
      <Transition name="acc">
        <div
          v-if="previewOpen"
          class="rounded-2xl border border-line bg-vellum/70 p-3 text-[12px] leading-[1.7]"
        >
          <p v-if="isRawStyle" class="flex items-center gap-2 text-forest">
            <Icon name="check" :size="12" />
            <span>不附加任何风格指引。你输入什么就发什么。</span>
          </p>
          <template v-else>
            <p class="mb-2 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              <Icon name="sparkle" :size="10" />
              <span>被并到提示词后的原文</span>
            </p>
            <p class="whitespace-pre-wrap break-words text-ink/85">{{ activeStylePrompt }}</p>
            <p class="mt-2 text-[10px] leading-snug text-muted">
              不满意？选「不套模板」跳过这一段，或直接在上方提示词里写你自己的镜头/光位/材质。
            </p>
          </template>
        </div>
      </Transition>
    </section>

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

    <div
      v-if="layout === 'panel'"
      class="composer-cta sticky bottom-0 z-[5]"
      data-tour="composer-cta"
    >
      <button
        type="submit"
        :disabled="!isGenerating && !canGenerate"
        class="btn-primary group relative w-full overflow-hidden px-5 py-4 text-sm shadow-paper-2 disabled:shadow-paper-1"
        :class="{ 'btn-primary--busy': isGenerating }"
        aria-keyshortcuts="Meta+Enter Control+Enter"
        @click="handleGenerateClick"
      >
        <span class="flex w-full items-center justify-between gap-3">
          <span class="flex items-center gap-3">
            <Icon
              :name="isGenerating ? 'close' : 'lightning'"
              :size="14"
              :class="isGenerating ? '' : ''"
            />
            <span class="font-display text-base italic">{{ generateLabel }}</span>
            <span v-if="isGenerating" class="font-mono text-[11px] tabular-nums text-paper/70">{{ elapsedSeconds }}s</span>
          </span>
          <span v-if="!isGenerating" class="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-paper/65 sm:inline" aria-hidden="true">⌘ ↵</span>
        </span>
        <span
          v-if="isGenerating"
          class="pointer-events-none absolute inset-y-0 -inset-x-1/2 bg-gradient-to-r from-transparent via-paper/15 to-transparent animate-progress-sweep"
          aria-hidden="true"
        ></span>
      </button>
    </div>

    <div v-else class="sticky bottom-0 -mx-5 border-t border-line/70 bg-paper/95 px-5 pb-2 pt-3 backdrop-blur">
      <button
        type="submit"
        :disabled="!isGenerating && !canGenerate"
        class="btn-primary group relative w-full overflow-hidden px-5 py-4 text-sm shadow-paper-2 disabled:shadow-paper-1"
        :class="{ 'btn-primary--busy': isGenerating }"
        @click="handleGenerateClick"
      >
        <span class="flex w-full items-center justify-between gap-3">
          <span class="flex items-center gap-3">
            <Icon :name="isGenerating ? 'close' : 'lightning'" :size="14" />
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
.prompt-field-shell {
  overflow: hidden;
  border-radius: calc(var(--radius-panel) + 2px);
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-ivory) / 0.72);
  box-shadow: var(--shadow-inner-paper);
  transition: border-color 180ms var(--motion-soft), background 180ms var(--motion-soft), box-shadow 180ms var(--motion-soft);
}

.composer-cta {
  margin-inline: -1.25rem;
  padding: 0.85rem 1.25rem max(env(safe-area-inset-bottom), 0.85rem);
  background:
    linear-gradient(180deg, rgb(var(--color-ivory) / 0) 0%, rgb(var(--color-ivory) / 0.7) 28%, rgb(var(--color-vellum) / 0.96) 100%);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  border-top: 1px solid rgb(var(--color-line) / 0.6);
}

.composer-cta::before {
  /* extra ambient halo when scrolling content sits behind */
  content: '';
  position: absolute;
  inset: -28px 0 100% 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgb(var(--color-ivory) / 0) 0%, rgb(var(--color-vellum) / 0.6) 100%);
}

@supports (-webkit-backdrop-filter: blur(1px)) {
  .composer-cta {
    background:
      linear-gradient(180deg, rgb(var(--color-ivory) / 0) 0%, rgb(var(--color-vellum) / 0.55) 28%, rgb(var(--color-vellum) / 0.92) 100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .composer-cta {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: rgb(var(--color-vellum));
  }
}

.prompt-field-shell:focus-within {
  border-color: rgb(var(--color-forest));
  background: rgb(var(--color-vellum));
  box-shadow: var(--focus-ring);
}

.prompt-field-textarea {
  width: 100%;
  resize: none;
  border: 0;
  background: transparent;
  padding: 0.9rem 1rem 0.75rem;
  color: rgb(var(--color-ink));
  outline: none;
  font-size: 15px;
  line-height: 1.7;
}

.prompt-field-textarea::placeholder {
  color: rgb(var(--color-muted) / 0.62);
}

.prompt-field-tools {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.7rem;
  border-top: 1px solid rgb(var(--color-line) / 0.72);
  background:
    linear-gradient(180deg, rgb(var(--color-vellum) / 0.48), rgb(var(--color-cream) / 0.34)),
    rgb(var(--color-paper-soft) / 0.18);
  padding: 0.58rem 0.62rem;
}

.prompt-model-chip,
.prompt-action-strip {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 0.55rem;
}

.prompt-model-chip {
  white-space: nowrap;
}

.prompt-action-strip {
  justify-content: flex-end;
  flex-wrap: wrap;
}

.prompt-tool-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-height: 30px;
  padding: 0 0.65rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.88);
  background: rgb(var(--color-vellum) / 0.62);
  color: rgb(var(--color-muted));
  font-size: 11px;
  font-weight: 680;
  white-space: nowrap;
  transition: transform 150ms var(--motion-press), background-color 150ms var(--motion-soft), color 150ms var(--motion-soft), border-color 150ms var(--motion-soft), box-shadow 170ms var(--motion-soft);
}

.prompt-tool-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgb(var(--color-line-strong));
  background: rgb(var(--color-ivory) / 0.82);
  color: rgb(var(--color-ink));
  box-shadow: var(--shadow-paper-1);
}

.prompt-tool-btn:active:not(:disabled) {
  transform: translateY(0);
}

.prompt-tool-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.prompt-tool-btn--accent {
  border-color: rgb(var(--color-forest) / 0.36);
  background: rgb(var(--color-forest) / 0.12);
  color: rgb(var(--color-forest));
}

.prompt-tool-btn--accent[aria-expanded="true"] {
  border-color: rgb(var(--color-ink));
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
}

/* ── AI 优化按钮（桌面） ── */

.prompt-tool-btn--ai {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-color: rgb(var(--color-ochre) / 0.45);
  background: linear-gradient(135deg, rgb(var(--color-ochre) / 0.18), rgb(var(--color-accent) / 0.12));
  color: rgb(var(--color-ochre));
  font-weight: 740;
  padding-right: 0.5rem;
  /* hint: long-press to switch model */
  position: relative;
  user-select: none;
  -webkit-user-select: none;
}

.prompt-tool-btn--ai:hover:not(:disabled) {
  border-color: rgb(var(--color-ink) / 0.32);
}

.prompt-tool-btn--ai.is-busy {
  border-color: rgb(var(--color-ink));
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  animation: prompt-ai-pulse 1.4s var(--motion-soft) infinite;
}

.prompt-tool-btn--ai.is-picker-open {
  border-color: rgb(var(--color-ink));
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
}

@keyframes prompt-ai-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgb(var(--color-ochre) / 0.32); }
  50% { box-shadow: 0 0 0 6px rgb(var(--color-ochre) / 0); }
}

/* 当前模型小药丸：紧贴在文字右边，整体仍然只占一颗 chip 的宽度 */
.prompt-tool-btn__model-tag {
  display: inline-flex;
  align-items: center;
  margin-left: 0.05rem;
  padding: 1px 7px 1px 6px;
  border-radius: 999px;
  background: rgb(var(--color-paper) / 0.62);
  color: rgb(var(--color-ochre));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.4;
  text-transform: uppercase;
  border: 1px solid rgb(var(--color-ochre) / 0.32);
}

.prompt-tool-btn--ai.is-busy .prompt-tool-btn__model-tag,
.prompt-tool-btn--ai.is-picker-open .prompt-tool-btn__model-tag {
  background: rgb(var(--color-paper) / 0.16);
  color: rgb(var(--color-paper));
  border-color: rgb(var(--color-paper) / 0.3);
}

.prompt-ai-picker {
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

.prompt-ai-picker__title {
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

.prompt-ai-picker__title small {
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  font-size: 9px;
  font-weight: 540;
  letter-spacing: 0.02em;
  color: rgb(var(--color-forest));
  text-transform: none;
  white-space: nowrap;
}

.prompt-ai-pick {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px 10px;
  padding: 8px 10px;
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

.prompt-ai-pick-name {
  font-family: 'Fraunces', 'IBM Plex Sans', system-ui, serif;
  font-weight: 700;
  letter-spacing: -0.005em;
}

.prompt-ai-pick-tag {
  grid-column: 1;
  font-size: 10.5px;
  font-weight: 540;
  color: rgb(var(--color-muted));
  letter-spacing: 0.02em;
}

.prompt-ai-pick-time {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  color: rgb(var(--color-muted));
  white-space: nowrap;
}

.prompt-ai-pick:hover {
  background: rgb(var(--color-paper-soft));
}

.prompt-ai-pick.is-active {
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
}

.prompt-ai-pick.is-active .prompt-ai-pick-tag,
.prompt-ai-pick.is-active .prompt-ai-pick-time {
  color: rgb(var(--color-paper) / 0.72);
}

/* ── 流式中：textarea shell 边缘流光 ── */

.prompt-field-shell.is-ai-streaming {
  border-color: rgb(var(--color-ochre) / 0.55);
  background: rgb(var(--color-vellum));
  box-shadow:
    var(--shadow-inner-paper),
    0 0 0 1.5px rgb(var(--color-ochre) / 0.32);
}

.prompt-field-shell.is-ai-streaming .prompt-field-textarea {
  caret-color: transparent;
}

@media (prefers-reduced-motion: reduce) {
  .prompt-tool-btn--ai.is-busy { animation: none; }
}

.prompt-tool-btn--danger {
  border-color: rgb(var(--color-accent) / 0.28);
  background: rgb(var(--color-accent) / 0.08);
  color: rgb(var(--color-accent));
}

.prompt-tool-btn--icon {
  width: 32px;
  padding: 0;
}

.prompt-tool-btn--icon span {
  display: none;
}

.style-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.style-card {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.65rem;
  min-height: 82px;
  overflow: hidden;
  border-radius: 17px;
  border: 1px solid rgb(var(--color-line));
  background:
    linear-gradient(135deg, rgb(var(--color-ivory) / 0.62), rgb(var(--color-vellum) / 0.42)),
    rgb(var(--color-cream) / 0.28);
  padding: 0.62rem 0.7rem 0.62rem 0.82rem;
  color: rgb(var(--color-ink));
  text-align: left;
  box-shadow: var(--shadow-inner-paper);
  transition: transform 170ms var(--motion-press), border-color 170ms var(--motion-soft), background-color 170ms var(--motion-soft), box-shadow 190ms var(--motion-soft), color 170ms var(--motion-soft);
}

.style-card:hover {
  transform: translateY(-1px);
  border-color: rgb(var(--color-line-strong));
  background: rgb(var(--color-ivory) / 0.78);
  box-shadow: var(--shadow-paper-1), var(--shadow-inner-paper);
}

.style-card--active {
  border-color: rgb(var(--color-ink));
  background:
    linear-gradient(135deg, rgb(var(--color-ink)), rgb(var(--color-blueprint))),
    rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  box-shadow: var(--shadow-paper-2);
}

.style-card__rail {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: rgb(var(--color-forest));
  opacity: 0.72;
}

.style-card:nth-child(2n) .style-card__rail {
  background: rgb(var(--color-accent));
}

.style-card:nth-child(3n) .style-card__rail {
  background: rgb(var(--color-ochre));
}

.style-card:nth-child(4n) .style-card__rail {
  background: rgb(var(--color-blueprint));
}

.style-card--active .style-card__rail {
  width: 4px;
  background: rgb(var(--color-ochre));
  opacity: 1;
}

.style-card__body {
  display: grid;
  min-width: 0;
  gap: 0.16rem;
}

.style-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  gap: 0.35rem;
}

.style-card__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 720;
  line-height: 1.15;
}

.style-card__accent {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 620;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgb(var(--color-muted));
}

.style-card--active .style-card__accent {
  color: rgb(var(--color-paper) / 0.62);
}

.style-card__desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1.35;
  color: rgb(var(--color-muted));
}

.style-card--active .style-card__desc {
  color: rgb(var(--color-paper) / 0.72);
}

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

.composer-continuation {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.6rem;
  border-radius: 18px;
  border: 1px solid rgb(var(--color-forest) / 0.34);
  background:
    linear-gradient(90deg, rgb(var(--color-forest) / 0.08), transparent 36%),
    linear-gradient(180deg, rgb(var(--color-vellum) / 0.84), rgb(var(--color-cream) / 0.36));
  box-shadow: 0 12px 26px -22px rgb(var(--color-forest) / 0.65), var(--shadow-inner-paper);
}

.composer-continuation__thumb {
  position: relative;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-paper-soft));
  box-shadow: 0 6px 14px -10px rgb(var(--color-ink) / 0.35);
}

.composer-continuation__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.composer-continuation__thumb-mark {
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

.composer-continuation__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  line-height: 1.2;
}

.composer-continuation__title {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgb(var(--color-forest));
}

.composer-continuation__sub {
  margin-top: 2px;
  font-size: 12px;
  color: rgb(var(--color-ink) / 0.78);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.composer-continuation__cancel {
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
  transition: background 140ms ease, color 140ms ease, transform 140ms ease;
}

.composer-continuation__cancel:hover {
  background: rgb(var(--color-paper));
  color: rgb(var(--color-accent));
  border-color: rgb(var(--color-accent) / 0.4);
}

.composer-continuation__cancel:active {
  transform: scale(0.95);
}

.composer-continuation-enter-from,
.composer-continuation-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  max-height: 0;
}

.composer-continuation-enter-to,
.composer-continuation-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 96px;
}

.composer-continuation-enter-active,
.composer-continuation-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease, max-height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
  overflow: hidden;
}

.btn-primary--busy {
  background: linear-gradient(135deg, rgb(var(--color-ink)), rgb(var(--color-ink) / 0.88));
  cursor: pointer;
}

.btn-primary--busy:hover {
  background: linear-gradient(135deg, rgb(var(--color-accent)), rgb(var(--color-accent) / 0.88));
}

@media (prefers-reduced-motion: reduce) {
  .prompt-tool-btn,
  .style-card,
  .acc-enter-active,
  .acc-leave-active,
  .composer-continuation-enter-active,
  .composer-continuation-leave-active,
  .composer-continuation__cancel {
    transition: none;
  }
}

@media (max-width: 720px) {
  .prompt-field-tools {
    grid-template-columns: 1fr;
  }

  .prompt-action-strip {
    justify-content: flex-start;
  }

  .style-grid {
    grid-template-columns: 1fr;
  }
}
</style>
