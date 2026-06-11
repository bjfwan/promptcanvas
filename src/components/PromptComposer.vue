<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import Icon from './Icon.vue'
import Select, { type SelectOption } from './Select.vue'
import PromptInsightChips from './PromptInsightChips.vue'
import AiRewriteRibbon from './AiRewriteRibbon.vue'
import { useInlineRewrite } from '../composables/useInlineRewrite'
import { maxReferenceImages } from '../lib/imagesApi'
import { customModelSentinel } from '../presets'
import { useDiscoveredModels } from '../composables/useDiscoveredModels'
import type { ContinuationContext, ImageQuality, ImageSize, ImageStyle, ReferenceImageAttachment } from '../types'
import type { EnhanceResult } from '../lib/magicEnhance'
import { inferEnhanceIntent } from '../lib/magicEnhance'
import type { PromptContext } from '../lib/promptDoc'
import type { PromptTreeNode } from '../composables/usePromptTree'
import { reverseParseRevisedPrompt, docToPlainPrompt } from '../lib/revisedParser'

const PromptTreeline = defineAsyncComponent(() => import('./PromptTreeline.vue'))

const MagicEnhanceMenu = defineAsyncComponent(() => import('./MagicEnhanceMenu.vue'))

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
  layout?: 'panel' | 'sheet' | 'draft'
  continuation?: ContinuationContext | null
  canUndoEnhance?: boolean
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
const quality = defineModel<ImageQuality>('quality', { required: true })
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
const dragActive = ref(false)
const magicMenuOpen = ref(false)
let dragDepth = 0

const hasReferenceImages = computed(() => props.referenceImages.length > 0)
const canAddReferenceImages = computed(() => props.referenceImages.length < maxReferenceImages)

const promptCount = computed(() => prompt.value.length)
const promptTokens = computed(() => Math.max(1, Math.round(prompt.value.length / 4)))
const promptCountTone = computed(() => {
  const length = promptCount.value
  if (length >= 4000) {
    return {
      tone: 'text-accent',
      hint: '提示词已超过 4000 字，部分模型的上下文窗口可能不够，建议继续精简或切换模型。',
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

function startAiRewrite() {
  if (!prompt.value.trim()) return
  inlineRewrite.start({
    promptRef: prompt,
    intent: inferEnhanceIntent(imageStyle.value, hasReferenceImages.value),
    hasReferenceImages: hasReferenceImages.value,
    style: imageStyle.value,
    size: size.value,
    quality: quality.value,
    modelName: props.modelName,
  }).catch(() => {})
}

function revertAiResult() {
  inlineRewrite.revert()
}

function retryAiRewrite() {
  if (inlineRewrite.isStreaming.value) return
  inlineRewrite.retry({
    intent: inferEnhanceIntent(imageStyle.value, hasReferenceImages.value),
    hasReferenceImages: hasReferenceImages.value,
    style: imageStyle.value,
    size: size.value,
    quality: quality.value,
    modelName: props.modelName,
  }).catch(() => {})
}

function abortAiRewrite() {
  inlineRewrite.abort()
}

function dismissAiRibbon() {
  inlineRewrite.reset()
}


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
    class="prompt-composer relative flex flex-col gap-7"
    :class="{
      'pb-2': layout === 'sheet',
      'prompt-composer--draft': layout === 'draft',
    }"
    @submit.prevent="emit('generate')"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleReferenceDrop"
  >
    <div
      v-if="layout === 'panel' && dragActive"
      class="composer-dropzone pointer-events-none absolute inset-0 z-20 grid place-items-center p-6 text-center"
      aria-hidden="true"
    >
      <div class="glass-card halo-pulse px-6 py-5">
        <Icon :name="canAddReferenceImages ? 'upload' : 'warning'" :size="22" class="mx-auto text-forest" />
        <p class="mt-3 font-display text-xl italic gradient-text">
          {{ canAddReferenceImages ? '松手添加参考图' : '参考图已达上限' }}
        </p>
        <p class="mt-1 text-[12px] text-muted">
          {{ canAddReferenceImages ? '支持 PNG / JPEG / WEBP / GIF' : `最多 ${maxReferenceImages} 张参考图` }}
        </p>
      </div>
    </div>

    <header v-if="layout === 'panel'" class="reveal space-y-2">
      <p class="display-eyebrow">01 · Compose</p>
      <h1 class="display-h1">构图草案</h1>
      <p class="text-[13px] leading-6 text-muted">
        控制主体、光线、镜头、材质与情绪。模板只塑造语气，不替你决定画面。
      </p>
    </header>

    <div
      v-if="healthOffline && layout !== 'draft'"
      class="composer-alert flex items-start gap-3 px-4 py-3 text-[13px] leading-6 text-accent"
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
          v-model="prompt"
          :rows="layout === 'draft' ? 4 : layout === 'sheet' ? 5 : 6"
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
              v-if="prompt.length"
              type="button"
              class="prompt-tool-btn prompt-tool-btn--ai"
              :class="{ 'is-busy': inlineRewrite.isStreaming.value }"
              :aria-label="inlineRewrite.isStreaming.value ? '正在 AI 改写，点击取消' : 'AI 优化提示词'"
              @click.stop="inlineRewrite.isStreaming.value ? abortAiRewrite() : startAiRewrite()"
            >
              <Icon
                :name="inlineRewrite.isStreaming.value ? 'close' : 'sparkle'"
                :size="12"
              />
              <span>{{ inlineRewrite.isStreaming.value ? '取消' : 'AI 优化' }}</span>
            </button>

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
                :quality="quality"
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
        :done-elapsed-ms="aiRewriteState.doneElapsedMs"
        :tool-call-count="aiRewriteState.toolCallCount"
        :error-message="aiRewriteState.errorMessage"
        :error-code="aiRewriteState.errorCode"
        variant="desktop"
        @revert="revertAiResult"
        @retry="retryAiRewrite"
        @abort="abortAiRewrite"
        @dismiss="dismissAiRibbon"
      />
      <div
        v-if="hasReferenceImages && layout !== 'draft'"
        class="surface-1 reveal p-3"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            <Icon name="image" :size="10" />
            <span>参考图 {{ props.referenceImages.length }} / {{ maxReferenceImages }}</span>
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <div
            v-for="image in props.referenceImages"
            :key="image.id"
            class="group relative h-24 w-24 overflow-hidden rounded-[var(--radius-panel)] border border-line/50 bg-paper-soft shadow-[var(--shadow-inner-glass)] transition-transform duration-200 hover:-translate-y-0.5"
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
              class="absolute right-1.5 top-1.5 inline-grid h-6 w-6 place-items-center rounded-lg bg-ink/70 text-paper opacity-0 backdrop-blur-sm transition duration-200 hover:bg-accent group-hover:opacity-100"
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
      <div v-if="layout !== 'draft'" class="flex items-center justify-between text-[11px]">
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
        v-if="layout !== 'draft'"
        :prompt="prompt"
        @pick="magicMenuOpen = true"
      />

      <p v-if="layout !== 'draft'" class="text-[10px] leading-snug text-muted">
        需要负面提示词、Seed 等高级参数？
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

    <div
      v-if="layout !== 'sheet'"
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
  border-radius: var(--radius-card);
  border: 1px solid rgb(var(--color-line) / 0.4);
  background: rgb(var(--color-ivory) / 0.5);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  box-shadow: var(--shadow-glass), var(--shadow-inner-glass);
  transition: border-color 200ms var(--motion-soft), background 200ms var(--motion-soft), box-shadow 220ms var(--motion-soft);
}

.composer-alert {
  border-radius: var(--radius-panel);
  border: 1px solid rgb(var(--color-clay) / 0.4);
  background:
    linear-gradient(135deg, rgb(var(--color-clay) / 0.12), rgb(var(--color-accent) / 0.08)),
    rgb(var(--color-ivory) / 0.4);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  box-shadow: var(--shadow-inner-glass);
  color: rgb(var(--color-clay));
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

.prompt-composer--draft {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 210px);
  align-items: end;
  gap: 0.65rem;
}

.prompt-composer--draft > section {
  min-width: 0;
}

.prompt-composer--draft .prompt-field-shell {
  border-radius: var(--radius-panel);
  background: rgb(var(--color-surface-raised) / 0.94);
  box-shadow: var(--shadow-inner-glass);
}

.prompt-composer--draft .prompt-field-textarea {
  min-height: 70px;
  height: 70px;
  padding-block: 0.72rem 0.58rem;
  font-size: 14px;
  line-height: 1.55;
}

.prompt-composer--draft .prompt-field-tools {
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  padding: 0.48rem 0.55rem;
  background: rgb(var(--color-surface-muted) / 0.6);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.prompt-composer--draft .prompt-tool-btn {
  min-height: 28px;
  box-shadow: none;
}

.prompt-composer--draft .prompt-action-strip {
  flex-wrap: nowrap;
  gap: 0.35rem;
}

.prompt-composer--draft .prompt-model-chip > span {
  display: none;
}

.prompt-composer--draft .composer-cta {
  position: static;
  margin-inline: 0;
  padding: 0;
  border-top: 0;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.prompt-composer--draft .composer-cta::before {
  display: none;
}

.prompt-composer--draft .composer-cta .btn-primary {
  min-height: 86px;
  height: 100%;
  padding-block: 0.74rem;
}

@media (max-width: 1180px) {
  .prompt-composer--draft {
    grid-template-columns: 1fr;
  }

  .prompt-composer--draft .composer-cta .btn-primary {
    min-height: 44px;
  }
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
  border-color: rgb(var(--color-accent) / 0.5);
  background: rgb(var(--color-ivory) / 0.62);
  box-shadow: var(--focus-ring), var(--shadow-glow-accent);
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
  border-top: 1px solid rgb(var(--color-line) / 0.4);
  background:
    linear-gradient(180deg, rgb(var(--color-ivory) / 0.4), rgb(var(--color-ivory) / 0.2));
  backdrop-filter: blur(10px) saturate(1.4);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
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
  border: 1px solid rgb(var(--color-line) / 0.5);
  background: rgb(var(--color-ivory) / 0.45);
  backdrop-filter: blur(10px) saturate(1.4);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
  box-shadow: var(--shadow-inner-glass);
  color: rgb(var(--color-muted));
  font-size: 11px;
  font-weight: 680;
  white-space: nowrap;
  transition: transform 150ms var(--motion-press), background-color 150ms var(--motion-soft), color 150ms var(--motion-soft), border-color 150ms var(--motion-soft), box-shadow 170ms var(--motion-soft);
}

.prompt-tool-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-ivory) / 0.65);
  color: rgb(var(--color-ink));
  box-shadow: var(--shadow-glass-sm);
}

.prompt-tool-btn:active:not(:disabled) {
  transform: translateY(0);
}

.prompt-tool-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.prompt-tool-btn--reference {
  border-style: dashed;
  background: rgb(var(--color-ivory) / 0.28);
  color: rgb(var(--color-muted));
  font-weight: 620;
}

.prompt-tool-btn--reference:hover:not(:disabled) {
  color: rgb(var(--color-ink));
}

.prompt-tool-btn--accent {
  border-color: rgb(var(--color-forest) / 0.36);
  background: rgb(var(--color-forest) / 0.12);
  color: rgb(var(--color-forest));
}

.prompt-tool-btn--accent[aria-expanded="true"] {
  border-color: transparent;
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: var(--shadow-glow-accent);
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
  border-color: transparent;
  background: var(--gradient-primary);
  color: #fff;
  animation: prompt-ai-pulse 1.4s var(--motion-soft) infinite;
}

.prompt-tool-btn--ai.is-picker-open {
  border-color: transparent;
  background: var(--gradient-primary);
  color: #fff;
}

@keyframes prompt-ai-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgb(var(--color-ochre) / 0.32); }
  50% { box-shadow: 0 0 0 6px rgb(var(--color-ochre) / 0); }
}

/* ── 流式中：textarea shell 边缘流光 ── */

.prompt-field-shell.is-ai-streaming {
  border-color: rgb(var(--color-accent) / 0.5);
  background: rgb(var(--color-ivory) / 0.7);
  box-shadow:
    var(--shadow-inner-glass),
    var(--shadow-glow-accent);
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

.composer-continuation {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.65rem;
  border-radius: var(--radius-panel);
  border: 1px solid rgb(var(--color-forest) / 0.3);
  background:
    linear-gradient(90deg, rgb(var(--color-forest) / 0.1), transparent 42%),
    var(--gradient-surface);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  box-shadow: var(--shadow-glass), var(--shadow-inner-glass), 0 0 18px -10px rgb(var(--color-forest) / 0.5);
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
  border-radius: 8px;
  background: rgb(var(--color-ivory) / 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: var(--shadow-inner-glass);
  color: rgb(var(--color-muted));
  border: 1px solid rgb(var(--color-line) / 0.5);
  cursor: pointer;
  transition: background 160ms var(--motion-soft), color 160ms var(--motion-soft), border-color 160ms var(--motion-soft), transform 140ms var(--motion-press);
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

.composer-alert {
  border-radius: var(--radius-panel);
  border: 1px solid rgb(var(--color-clay) / 0.4);
  background:
    linear-gradient(135deg, rgb(var(--color-clay) / 0.12), rgb(var(--color-accent) / 0.08)),
    rgb(var(--color-ivory) / 0.4);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  box-shadow: var(--shadow-inner-glass);
}

@media (prefers-reduced-motion: reduce) {
  .prompt-tool-btn,
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
}
</style>
