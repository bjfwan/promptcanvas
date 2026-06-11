<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, useId, watch } from 'vue'
import Icon from './Icon.vue'
import Select, { type SelectOption } from './Select.vue'
import { maxReferenceImages } from '../lib/imagesApi'
import { customModelSentinel } from '../presets'
import { useDiscoveredModels } from '../composables/useDiscoveredModels'
import { useI18n } from '../lib/i18n'
import type { ContinuationContext, ImageQuality, ImageSize, ImageStyle, ReferenceImageAttachment } from '../types'
import type { PromptTreeNode } from '../composables/usePromptTree'

const PromptTreeline = defineAsyncComponent(() => import('./PromptTreeline.vue'))

const discoveredModels = useDiscoveredModels()
const { t } = useI18n()

function isSimpleImageModelOption(option: { value: string; disabled?: boolean; kind?: 'group' }) {
  const value = option.value.trim()
  if (!value || option.disabled || option.kind === 'group') return false
  const lower = value.toLowerCase()
  return !lower.includes('glm') || lower.includes('glm-image')
}

const modelChipOptions = computed<SelectOption<string>[]>(() =>
  discoveredModels.mergedModelOptions.value
    .filter(isSimpleImageModelOption)
    .map((option) => ({
      value: option.value,
      label: option.value === customModelSentinel ? `${t('dock.modelCustom')}...` : option.label,
      hint: option.hint,
      disabled: option.disabled,
      kind: option.kind,
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
  treeNodes?: PromptTreeNode[]
  treeCurrentId?: string | null
  treeCanUndo?: boolean
  treeCanRedo?: boolean
  modelWarning?: string
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'panel',
  continuation: null,
  treeNodes: () => [],
  treeCurrentId: null,
  treeCanUndo: false,
  treeCanRedo: false,
  modelWarning: '',
})

const prompt = defineModel<string>('prompt', { required: true })
defineModel<ImageStyle>('imageStyle', { required: true })
defineModel<ImageSize>('size', { required: true })
defineModel<number>('count', { required: true })
defineModel<ImageQuality>('quality', { required: true })
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
  (e: 'toast-info', title: string, message?: string): void
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
const tooltipIdBase = useId()
let dragDepth = 0

const copyTooltipId = `${tooltipIdBase}-copy-prompt`
const clearTooltipId = `${tooltipIdBase}-clear-prompt`

const hasReferenceImages = computed(() => props.referenceImages.length > 0)
const canAddReferenceImages = computed(() => props.referenceImages.length < maxReferenceImages)

const referenceButtonText = computed(() =>
  hasReferenceImages.value
    ? t('composer.refTitle', { count: props.referenceImages.length, max: maxReferenceImages })
    : t('composer.tools.refUploadLabel'),
)

const generateLabel = computed(() => {
  if (!prompt.value.trim()) return t('composer.cta.write')
  if (props.isGenerating) return t('composer.cta.busy')
  if (props.continuation) return t('composer.cta.continue')
  return t('composer.cta.generate')
})

const promptPlaceholder = computed(() =>
  props.continuation
    ? t('composer.prompt.placeholderRemix')
    : t('composer.prompt.placeholder'),
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
    return trimmed
      ? t('composer.tools.modelCustom', { name: trimmed })
      : t('composer.tools.modelCustomEmpty')
  }
  const match = modelChipOptions.value.find((option) => option.value === modelChoice.value)
  return match?.label ?? (modelChoice.value || t('composer.tools.modelDefault'))
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
    class="prompt-composer relative flex flex-col gap-4"
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
          {{ canAddReferenceImages ? t('canvas.drop.title') : t('canvas.drop.full') }}
        </p>
        <p class="mt-1 text-[12px] text-muted">
          {{ canAddReferenceImages ? t('canvas.drop.formats') : t('canvas.drop.fullHint', { n: maxReferenceImages }) }}
        </p>
      </div>
    </div>

    <div
      v-if="healthOffline && layout !== 'draft'"
      class="composer-alert flex items-start gap-3 px-4 py-3 text-[13px] leading-6 text-accent"
      role="alert"
    >
      <Icon name="warning" :size="16" class="mt-0.5" />
      <span>{{ t('composer.offline') }}</span>
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
        <div v-if="continuation" class="composer-continuation" role="status" :aria-label="t('composer.continuation.label')">
          <span class="composer-continuation__thumb" aria-hidden="true">
            <img :src="continuation.thumbnailUrl" alt="" loading="lazy" decoding="async" />
            <span class="composer-continuation__thumb-mark">
              <Icon name="sparkle" :size="9" />
            </span>
          </span>
          <span class="composer-continuation__body">
            <span class="composer-continuation__title">{{ t('composer.continuation.title') }}</span>
            <span class="composer-continuation__sub">
              {{ t('composer.continuation.body', { n: continuation.fromImageIndex + 1 }) }}
            </span>
          </span>
          <button
            type="button"
            class="composer-continuation__cancel"
            :aria-label="t('composer.continuation.cancel')"
            @click="emit('cancel-continuation')"
          >
            <Icon name="close" :size="12" />
          </button>
        </div>
      </Transition>

      <div
        v-if="hasReferenceImages"
        class="prompt-reference-strip"
        role="region"
        :aria-label="t('composer.refTitle', { count: props.referenceImages.length, max: maxReferenceImages })"
      >
        <div class="prompt-reference-strip__items">
          <div
            v-for="image in props.referenceImages"
            :key="image.id"
            class="prompt-reference-thumb"
          >
            <img
              :src="image.previewUrl"
              :alt="image.name"
              loading="lazy"
              decoding="async"
            />
            <button
              type="button"
              class="prompt-reference-thumb__remove"
              :aria-label="t('composer.refRemove', { name: image.name })"
              :title="t('composer.refRemove', { name: image.name })"
              @click.stop="removeReferenceImage(image.id)"
            >
              <Icon name="close" :size="10" />
            </button>
          </div>
        </div>
        <button
          v-if="canAddReferenceImages"
          type="button"
          class="prompt-reference-strip__add"
          :aria-label="t('composer.tools.refUploadLabel')"
          :title="t('composer.tools.refUploadLabel')"
          @click.stop="openReferencePicker"
        >
          <Icon name="upload" :size="13" />
          <span>{{ t('composer.tools.refContinue') }}</span>
        </button>
      </div>

      <div class="prompt-field-shell" data-tour="composer-prompt" @click="promptRef?.focus()">
        <textarea
          id="prompt-input"
          ref="promptRef"
          v-model="prompt"
          :rows="layout === 'draft' ? 4 : layout === 'sheet' ? 5 : 6"
          class="prompt-field-textarea"
          :placeholder="promptPlaceholder"
          autocomplete="off"
          spellcheck="false"
          @click.stop="promptRef?.focus()"
        ></textarea>
        <div class="prompt-field-tools">
          <span class="prompt-model-chip">
            <button
              type="button"
              class="prompt-tool-btn prompt-tool-btn--reference prompt-reference-chip"
              :disabled="!canAddReferenceImages"
              :aria-label="canAddReferenceImages
                ? referenceButtonText
                : t('composer.tools.refLimitLabel', { max: maxReferenceImages })"
              :title="canAddReferenceImages
                ? referenceButtonText
                : t('canvas.drop.fullHint', { n: maxReferenceImages })"
              @click.stop="openReferencePicker"
            >
              <Icon name="upload" :size="12" />
              <span>{{ referenceButtonText }}</span>
            </button>
            <Select
              v-model="modelChoice"
              :options="modelChipOptions"
              variant="chip"
              align="end"
              :aria-label="t('dock.modelLabel')"
              :placeholder="modelChipLabel"
            />
          </span>
          <span class="prompt-action-strip" :aria-label="t('composer.prompt')">
            <button
              v-if="prompt.length"
              type="button"
              class="prompt-tool-btn prompt-tool-btn--icon"
              :aria-label="t('composer.tools.copyLabel')"
              :aria-describedby="copyTooltipId"
              @click.stop="emit('copy', prompt, t('toast.copyPrompt'))"
            >
              <Icon name="copy" :size="12" />
              <span class="prompt-tool-label">{{ t('composer.tools.copy') }}</span>
              <span :id="copyTooltipId" class="prompt-tool-description" role="tooltip">
                {{ t('composer.tools.copyDescription') }}
              </span>
            </button>
            <button
              v-if="prompt.length"
              type="button"
              class="prompt-tool-btn prompt-tool-btn--icon"
              :aria-label="t('composer.tools.clearLabel')"
              :aria-describedby="clearTooltipId"
              @click.stop="clearPrompt"
            >
              <Icon name="eraser" :size="12" />
              <span class="prompt-tool-label">{{ t('composer.tools.clear') }}</span>
              <span :id="clearTooltipId" class="prompt-tool-description" role="tooltip">
                {{ t('composer.tools.clearDescription') }}
              </span>
            </button>
          </span>
        </div>
        <p v-if="modelWarning" class="prompt-model-warning" role="status">
          <Icon name="warning" :size="11" />
          <span>{{ modelWarning }}</span>
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
    </section>

    <div
      v-if="layout !== 'sheet'"
      class="composer-cta sticky bottom-0 z-[5]"
      data-tour="composer-cta"
    >
      <button
        type="submit"
        :disabled="!isGenerating && !canGenerate"
        class="btn-primary composer-submit group relative w-full overflow-hidden px-5 py-4 text-sm shadow-paper-2 disabled:shadow-paper-1"
        :class="{ 'btn-primary--busy': isGenerating }"
        aria-keyshortcuts="Meta+Enter Control+Enter"
        @click="handleGenerateClick"
      >
        <span class="composer-submit__content flex w-full items-center justify-between gap-3">
          <span class="flex min-w-0 items-center gap-2.5">
            <Icon
              :name="isGenerating ? 'close' : 'send'"
              :size="14"
              :class="isGenerating ? '' : ''"
            />
            <span class="composer-submit__label font-display italic">{{ generateLabel }}</span>
            <span v-if="isGenerating" class="font-mono text-[11px] tabular-nums text-paper/70">{{ elapsedSeconds }}s</span>
          </span>
          <span v-if="!isGenerating" class="composer-submit__shortcut hidden font-mono text-[10px] uppercase tracking-[0.22em] text-paper/65 sm:inline" aria-hidden="true">⌘ ↵</span>
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
        class="btn-primary composer-submit group relative w-full overflow-hidden px-5 py-4 text-sm shadow-paper-2 disabled:shadow-paper-1"
        :class="{ 'btn-primary--busy': isGenerating }"
        @click="handleGenerateClick"
      >
        <span class="composer-submit__content flex w-full items-center justify-between gap-3">
          <span class="flex min-w-0 items-center gap-2.5">
            <Icon :name="isGenerating ? 'close' : 'send'" :size="14" />
            <span class="composer-submit__label font-display italic">{{ generateLabel }}</span>
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
.prompt-reference-strip {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  overflow: hidden;
  border-radius: var(--radius-panel);
  border: 1px solid rgb(var(--color-line) / 0.52);
  background: rgb(var(--color-surface-muted) / 0.76);
  padding: 0.45rem;
}

.prompt-reference-strip__items {
  display: flex;
  flex: 1;
  min-width: 0;
  gap: 0.45rem;
  overflow-x: auto;
  scrollbar-width: none;
}

.prompt-reference-strip__items::-webkit-scrollbar {
  display: none;
}

.prompt-reference-thumb {
  position: relative;
  flex: 0 0 auto;
  width: 52px;
  height: 52px;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgb(var(--color-line-strong) / 0.54);
  background: rgb(var(--color-paper-soft));
}

.prompt-reference-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.prompt-reference-thumb__remove {
  position: absolute;
  top: 3px;
  right: 3px;
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-paper) / 0.65);
  background: rgb(var(--color-ink) / 0.78);
  color: rgb(var(--color-paper));
  opacity: 0.92;
  transition: background-color 150ms var(--motion-soft), transform 140ms var(--motion-press);
}

.prompt-reference-thumb__remove:hover {
  background: rgb(var(--color-accent));
}

.prompt-reference-thumb__remove:active {
  transform: scale(0.94);
}

.prompt-reference-thumb__remove:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.prompt-reference-strip__add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 0.35rem;
  min-height: 34px;
  padding: 0 0.7rem;
  border-radius: 999px;
  border: 1px dashed rgb(var(--color-line-strong) / 0.8);
  background: rgb(var(--color-ivory) / 0.55);
  color: rgb(var(--color-muted));
  font-size: 11px;
  font-weight: 680;
  white-space: nowrap;
  transition: border-color 150ms var(--motion-soft), color 150ms var(--motion-soft), background-color 150ms var(--motion-soft);
}

.prompt-reference-strip__add:hover {
  border-color: rgb(var(--color-forest) / 0.5);
  background: rgb(var(--color-ivory) / 0.78);
  color: rgb(var(--color-ink));
}

.prompt-reference-strip__add:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

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

.prompt-composer--draft .prompt-reference-strip {
  padding: 0.35rem;
}

.prompt-composer--draft .prompt-reference-thumb {
  width: 42px;
  height: 42px;
  border-radius: 9px;
}

.prompt-composer--draft .prompt-reference-strip__add {
  width: 34px;
  min-height: 34px;
  padding: 0;
}

.prompt-composer--draft .prompt-reference-strip__add span {
  display: none;
}

.prompt-composer--draft .prompt-field-textarea {
  min-height: 70px;
  height: 70px;
  padding-block: 0.72rem 0.58rem;
  font-size: 14px;
  line-height: 1.55;
}

.prompt-composer--draft .prompt-field-tools {
  grid-template-columns: minmax(0, 1fr) minmax(0, auto);
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

.prompt-composer--draft .prompt-model-chip {
  flex-wrap: nowrap;
}

.prompt-composer--draft .prompt-reference-chip span {
  max-width: 5.4rem;
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
  min-height: 56px;
  height: 100%;
  padding: 0.58rem 0.85rem;
}

@media (max-width: 1180px) {
  .prompt-composer--draft {
    grid-template-columns: 1fr;
  }

.prompt-composer--draft .composer-cta .btn-primary {
    min-height: 44px;
    width: 100%;
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
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.7rem;
  border-top: 1px solid rgb(var(--color-line) / 0.4);
  background:
    linear-gradient(180deg, rgb(var(--color-ivory) / 0.4), rgb(var(--color-ivory) / 0.2));
  backdrop-filter: blur(10px) saturate(1.4);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
  padding: 0.58rem 0.62rem;
}

.prompt-model-warning {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  border-top: 1px solid rgb(var(--color-line) / 0.32);
  padding: 0.46rem 0.65rem 0.55rem;
  color: rgb(var(--color-ochre));
  background: rgb(var(--color-ochre) / 0.06);
  font-size: 11px;
  font-weight: 560;
  line-height: 1.45;
}

.prompt-model-warning span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.prompt-model-chip,
.prompt-action-strip {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 0.55rem;
}

.prompt-model-chip {
  flex-wrap: wrap;
}

.prompt-reference-chip {
  min-height: 30px;
  padding-inline: 0.72rem;
  border-style: solid;
  color: rgb(var(--color-ink));
}

.prompt-reference-chip span {
  max-width: 8.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
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

.prompt-tool-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring), var(--shadow-inner-glass);
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

.prompt-tool-btn--danger {
  border-color: rgb(var(--color-accent) / 0.28);
  background: rgb(var(--color-accent) / 0.08);
  color: rgb(var(--color-accent));
}

.prompt-tool-btn--icon {
  width: 32px;
  padding: 0;
}

.prompt-tool-btn--icon .prompt-tool-label {
  display: none;
}

.prompt-tool-description {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 18;
  width: max-content;
  max-width: 11rem;
  padding: 0.38rem 0.52rem;
  border-radius: 8px;
  background: rgb(var(--color-ink) / 0.94);
  color: rgb(var(--color-paper));
  box-shadow: 0 4px 8px -6px rgb(var(--color-ink) / 0.8);
  font-size: 11px;
  font-weight: 620;
  line-height: 1.35;
  letter-spacing: 0;
  text-align: left;
  white-space: normal;
  opacity: 0;
  pointer-events: none;
  transform: translateY(3px);
  transition: opacity 140ms var(--motion-soft), transform 140ms var(--motion-soft);
}

.prompt-tool-description::after {
  content: '';
  position: absolute;
  right: 12px;
  top: 100%;
  width: 8px;
  height: 8px;
  background: inherit;
  transform: translateY(-4px) rotate(45deg);
}

.prompt-tool-btn:hover:not(:disabled) .prompt-tool-description,
.prompt-tool-btn:focus-visible:not(:disabled) .prompt-tool-description {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
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

.composer-submit {
  min-height: 48px;
  padding: 0.7rem 1rem;
}

.composer-submit__label {
  min-width: 0;
  font-size: 13px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.prompt-composer--draft .composer-submit {
  width: 100%;
  min-height: 56px;
  border-radius: var(--radius-panel);
}

.prompt-composer--draft .composer-submit__content {
  justify-content: center;
}

.prompt-composer--draft .composer-submit__shortcut {
  display: none;
}

.btn-primary--busy {
  background: linear-gradient(
    120deg,
    rgb(var(--color-action-strong)),
    rgb(var(--color-accent)),
    rgb(var(--color-blueprint) / 0.9)
  );
  background-size: 180% 180%;
  animation: composer-submit-gradient 2.6s ease-in-out infinite;
  cursor: pointer;
}

.btn-primary--busy:hover {
  background: linear-gradient(
    120deg,
    rgb(var(--color-action-strong)),
    rgb(var(--color-accent)),
    rgb(var(--color-blueprint) / 0.9)
  );
  background-size: 180% 180%;
}

@keyframes composer-submit-gradient {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
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
  .prompt-tool-description,
  .prompt-reference-strip__add,
  .prompt-reference-thumb__remove,
  .composer-continuation-enter-active,
  .composer-continuation-leave-active,
  .composer-continuation__cancel,
  .btn-primary--busy {
    transition: none;
    animation: none;
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
