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
const showModelSheet = ref(false)
const showAdvancedPopup = ref(false)
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

      <!-- Prompt textarea (no outer box) -->
      <div class="prompt-field-area" @click="promptRef?.focus()">
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

        <!-- Desktop toolbar (hidden on mobile) -->
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

      <!-- Mobile inline toolbar: plus + model card + send -->
      <div v-if="layout !== 'draft'" class="prompt-mobile-toolbar">
        <button
          type="button"
          class="prompt-mobile-btn prompt-mobile-btn--plus"
          :disabled="!canAddReferenceImages"
          :aria-label="t('composer.tools.refUploadLabel')"
          @click.stop="openReferencePicker"
        >
          <Icon name="plus" :size="18" />
        </button>
        <button
          type="button"
          class="prompt-mobile-model-card"
          :aria-label="t('dock.modelLabel')"
          @click.stop="showModelSheet = true"
        >
          <span class="prompt-mobile-model-card__label">{{ modelChipLabel }}</span>
          <Icon name="chevronDown" :size="11" class="prompt-mobile-model-card__arrow" />
        </button>
        <button
          type="submit"
          :disabled="!isGenerating && !canGenerate"
          class="prompt-mobile-btn prompt-mobile-btn--send"
          :class="{ 'prompt-mobile-btn--busy': isGenerating }"
          @click="handleGenerateClick"
        >
          <Icon :name="isGenerating ? 'close' : 'send'" :size="16" />
          <span v-if="isGenerating" class="font-mono text-[10px] tabular-nums">{{ elapsedSeconds }}s</span>
        </button>
      </div>

      <!-- Model bottom sheet (mobile) -->
      <Teleport to="body">
        <Transition name="model-sheet">
          <div v-if="showModelSheet" class="prompt-model-sheet-overlay" @click.self="showModelSheet = false">
            <div class="prompt-model-sheet">
              <div class="prompt-model-sheet__header">
                <span class="prompt-model-sheet__title">{{ t('dock.modelLabel') }}</span>
                <button type="button" class="prompt-model-sheet__close" @click="showModelSheet = false">
                  <Icon name="close" :size="16" />
                </button>
              </div>
              <div class="prompt-model-sheet__list">
                <button
                  v-for="option in modelChipOptions"
                  :key="option.value"
                  type="button"
                  class="prompt-model-sheet__option"
                  :class="{
                    'prompt-model-sheet__option--active': modelChoice === option.value,
                    'prompt-model-sheet__option--disabled': option.disabled,
                  }"
                  :disabled="option.disabled"
                  @click="modelChoice = option.value; showModelSheet = false"
                >
                  <span class="prompt-model-sheet__option-label">{{ option.label }}</span>
                  <span v-if="option.hint" class="prompt-model-sheet__option-hint">{{ option.hint }}</span>
                  <Icon v-if="modelChoice === option.value" name="check" :size="14" class="prompt-model-sheet__option-check" />
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Advanced features centered popup (mobile) -->
      <Teleport to="body">
        <Transition name="adv-popup">
          <div v-if="showAdvancedPopup" class="prompt-adv-popup-overlay" @click.self="showAdvancedPopup = false">
            <div class="prompt-adv-popup">
              <div class="prompt-adv-popup__header">
                <span class="prompt-adv-popup__title">{{ t('composer.prompt') }}</span>
                <button type="button" class="prompt-adv-popup__close" @click="showAdvancedPopup = false">
                  <Icon name="close" :size="14" />
                </button>
              </div>
              <div class="prompt-adv-popup__actions">
                <button
                  v-if="prompt.length"
                  type="button"
                  class="prompt-adv-popup__btn"
                  @click="emit('copy', prompt, t('toast.copyPrompt')); showAdvancedPopup = false"
                >
                  <Icon name="copy" :size="14" />
                  <span>{{ t('composer.tools.copy') }}</span>
                </button>
                <button
                  v-if="prompt.length"
                  type="button"
                  class="prompt-adv-popup__btn"
                  @click="clearPrompt(); showAdvancedPopup = false"
                >
                  <Icon name="eraser" :size="14" />
                  <span>{{ t('composer.tools.clear') }}</span>
                </button>
                <button
                  type="button"
                  class="prompt-adv-popup__btn"
                  @click="emit('open-settings'); showAdvancedPopup = false"
                >
                  <Icon name="settings" :size="14" />
                  <span>{{ t('settings.title') }}</span>
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

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

    <div v-else class="composer-sheet-cta sticky bottom-0 -mx-5 border-t border-line/70 bg-paper/95 px-5 pb-2 pt-3 backdrop-blur">
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
/* Lift the composer above the on-screen keyboard on touch viewports that hit
 * the desktop breakpoint (e.g. iPad landscape). Mirrors ChatDock's GPU-only
 * translate so the textarea + send stay reachable. No effect when the keyboard
 * is closed (--keyboard-inset defaults to 0). */
.prompt-composer {
  transform: translate3d(0, calc(-1 * var(--keyboard-inset, 0px)), 0);
  transition: transform 120ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

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

.prompt-field-area {
  display: flex;
  flex-direction: column;
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
  padding: 0.85rem 1.25rem max(env(safe-area-inset-bottom, 0px), 0.85rem);
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

.prompt-composer--draft .prompt-field-area {
  border-radius: var(--radius-panel);
  overflow: hidden;
  border: 1px solid rgb(var(--color-line) / 0.4);
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
  max-height: 60vh;
  resize: vertical;
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

.prompt-field-area:focus-within {
  /* focus handled by textarea outline or tools border */
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
  /* Hide desktop toolbar on mobile */
  .prompt-field-tools {
    display: none;
  }

  /* Hide desktop CTA on mobile (send is in mobile toolbar), but keep for draft layout */
  .prompt-composer:not(.prompt-composer--draft) .composer-cta {
    display: none;
  }

  /* Hide sheet bottom CTA on mobile */
  .composer-sheet-cta {
    display: none;
  }

  /* Textarea adjustments */
  .prompt-field-textarea {
    padding: 0.75rem 0.85rem 0.65rem;
    font-size: 15px;
    border-bottom: 1px solid rgb(var(--color-line) / 0.3);
  }

  .prompt-action-strip {
    justify-content: flex-start;
  }
}

/* Desktop: hide mobile toolbar */
@media (min-width: 721px) {
  .prompt-mobile-toolbar {
    display: none !important;
  }
}

/* ── Mobile toolbar ── */
.prompt-mobile-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.25rem;
}

.prompt-mobile-btn {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid rgb(var(--color-line) / 0.4);
  background: rgb(var(--color-ivory) / 0.5);
  color: rgb(var(--color-muted));
  cursor: pointer;
  transition: background-color 150ms var(--motion-soft), color 150ms var(--motion-soft), transform 120ms var(--motion-press);
}

.prompt-mobile-btn:hover:not(:disabled) {
  background: rgb(var(--color-ivory) / 0.75);
  color: rgb(var(--color-ink));
  transform: translateY(-1px);
}

.prompt-mobile-btn:active:not(:disabled) {
  transform: translateY(0);
}

.prompt-mobile-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.prompt-mobile-btn--plus {
  border-style: dashed;
}

.prompt-mobile-btn--send {
  margin-left: auto;
  width: 44px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: linear-gradient(135deg, rgb(var(--color-action-strong)), rgb(var(--color-accent)));
  color: rgb(var(--color-paper));
  box-shadow: 0 2px 8px -3px rgb(var(--color-accent) / 0.5);
}

.prompt-mobile-btn--send:hover:not(:disabled) {
  background: linear-gradient(135deg, rgb(var(--color-accent)), rgb(var(--color-action-strong)));
  color: rgb(var(--color-paper));
  transform: translateY(-1px);
}

.prompt-mobile-btn--send:disabled {
  opacity: 0.5;
  background: rgb(var(--color-muted) / 0.3);
  box-shadow: none;
}

.prompt-mobile-btn--busy {
  background: linear-gradient(120deg, rgb(var(--color-action-strong)), rgb(var(--color-accent)), rgb(var(--color-blueprint) / 0.9));
  background-size: 180% 180%;
  animation: composer-submit-gradient 2.6s ease-in-out infinite;
}

.prompt-mobile-model-card {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 36px;
  padding: 0 0.75rem;
  border-radius: 18px;
  border: 1px solid rgb(var(--color-line) / 0.45);
  background: rgb(var(--color-ivory) / 0.55);
  color: rgb(var(--color-ink));
  font-size: 12px;
  font-weight: 620;
  cursor: pointer;
  max-width: 55%;
  transition: background-color 150ms var(--motion-soft), border-color 150ms var(--motion-soft), transform 120ms var(--motion-press);
}

.prompt-mobile-model-card:hover {
  background: rgb(var(--color-ivory) / 0.78);
  border-color: rgb(var(--color-line-strong) / 0.6);
  transform: translateY(-1px);
}

.prompt-mobile-model-card:active {
  transform: translateY(0);
}

.prompt-mobile-model-card__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-mobile-model-card__arrow {
  flex: 0 0 auto;
  color: rgb(var(--color-muted));
  transition: transform 150ms var(--motion-soft);
}

/* ── Model bottom sheet ── */
.prompt-model-sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgb(var(--color-ink) / 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.prompt-model-sheet {
  width: 100%;
  max-width: 480px;
  max-height: 65dvh;
  display: flex;
  flex-direction: column;
  border-radius: 16px 16px 0 0;
  background: rgb(var(--color-vellum));
  box-shadow: 0 -4px 24px -8px rgb(var(--color-ink) / 0.2);
  overflow: hidden;
}

.prompt-model-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.15rem 0.75rem;
  padding-top: calc(env(safe-area-inset-top, 0px) + 1rem);
  border-bottom: 1px solid rgb(var(--color-line) / 0.4);
}

.prompt-model-sheet__title {
  font-size: 14px;
  font-weight: 680;
  color: rgb(var(--color-ink));
}

.prompt-model-sheet__close {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgb(var(--color-line) / 0.5);
  background: rgb(var(--color-ivory) / 0.5);
  color: rgb(var(--color-muted));
  cursor: pointer;
  transition: background 150ms var(--motion-soft), color 150ms var(--motion-soft);
}

.prompt-model-sheet__close:hover {
  background: rgb(var(--color-paper));
  color: rgb(var(--color-ink));
}

.prompt-model-sheet__list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.65rem 0.85rem;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 0.85rem);
  overflow-y: auto;
  scrollbar-width: thin;
}

.prompt-model-sheet__option {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 48px;
  padding: 0.55rem 0.75rem;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  color: rgb(var(--color-ink));
  font-size: 13px;
  font-weight: 580;
  cursor: pointer;
  text-align: left;
  transition: background-color 140ms var(--motion-soft), border-color 140ms var(--motion-soft);
}

.prompt-model-sheet__option:hover:not(:disabled) {
  background: rgb(var(--color-ivory) / 0.55);
  border-color: rgb(var(--color-line) / 0.4);
}

.prompt-model-sheet__option--active {
  background: rgb(var(--color-forest) / 0.08);
  border-color: rgb(var(--color-forest) / 0.3);
}

.prompt-model-sheet__option--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.prompt-model-sheet__option-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-model-sheet__option-hint {
  flex: 0 0 auto;
  font-size: 10px;
  color: rgb(var(--color-muted));
  font-weight: 500;
}

.prompt-model-sheet__option-check {
  flex: 0 0 auto;
  color: rgb(var(--color-forest));
}

.model-sheet-enter-from {
  opacity: 0;
}
.model-sheet-enter-from .prompt-model-sheet {
  transform: translateY(100%);
}
.model-sheet-leave-to {
  opacity: 0;
}
.model-sheet-leave-to .prompt-model-sheet {
  transform: translateY(100%);
}
.model-sheet-enter-active,
.model-sheet-leave-active {
  transition: opacity 0.22s ease-out;
}
.model-sheet-enter-active .prompt-model-sheet,
.model-sheet-leave-active .prompt-model-sheet {
  transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* ── Advanced features popup (centered) ── */
.prompt-adv-popup-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgb(var(--color-ink) / 0.3);
}

.prompt-adv-popup {
  width: min(320px, 85vw);
  border-radius: 14px;
  background: rgb(var(--color-vellum));
  border: 1px solid rgb(var(--color-line) / 0.5);
  box-shadow: 0 8px 32px -12px rgb(var(--color-ink) / 0.3);
  overflow: hidden;
}

.prompt-adv-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem 0.65rem;
  border-bottom: 1px solid rgb(var(--color-line) / 0.35);
}

.prompt-adv-popup__title {
  font-size: 13px;
  font-weight: 680;
  color: rgb(var(--color-ink));
}

.prompt-adv-popup__close {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgb(var(--color-line) / 0.4);
  background: rgb(var(--color-ivory) / 0.5);
  color: rgb(var(--color-muted));
  cursor: pointer;
}

.prompt-adv-popup__close:hover {
  background: rgb(var(--color-paper));
  color: rgb(var(--color-ink));
}

.prompt-adv-popup__actions {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
}

.prompt-adv-popup__btn {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 44px;
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: rgb(var(--color-ink));
  font-size: 13px;
  font-weight: 580;
  cursor: pointer;
  text-align: left;
  transition: background-color 140ms var(--motion-soft), border-color 140ms var(--motion-soft);
}

.prompt-adv-popup__btn:hover {
  background: rgb(var(--color-ivory) / 0.55);
  border-color: rgb(var(--color-line) / 0.35);
}

.adv-popup-enter-from,
.adv-popup-leave-to {
  opacity: 0;
}
.adv-popup-enter-active,
.adv-popup-leave-active {
  transition: opacity 0.2s ease-out;
}
.adv-popup-enter-from .prompt-adv-popup,
.adv-popup-leave-to .prompt-adv-popup {
  transform: scale(0.95);
}
.adv-popup-enter-active .prompt-adv-popup,
.adv-popup-leave-active .prompt-adv-popup {
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}
</style>
