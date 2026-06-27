<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import Select, { type SelectOption } from './Select.vue'
import { maxReferenceImages } from '../lib/imagesApi'
import { autoModelSentinel, qualityOptions, sizeOptions } from '../presets'
import { useDiscoveredModels } from '../composables/useDiscoveredModels'
import { useVibration } from '../composables/useVibration'
import { rafThrottle } from '../lib/rafThrottle'
import { useI18n } from '../lib/i18n'
import type { IconName } from '../icons'
import type { ContinuationContext, GenerateImageRequest, ImageQuality, ImageSize, ReferenceImageAttachment } from '../types'

type OutputFormat = GenerateImageRequest['outputFormat']
type QuickSettingKey = 'size' | 'format' | 'quality' | 'count'
type ToggleState = 'on' | 'off' | 'blocked'

interface QuickSettingPill {
  key: QuickSettingKey
  icon: IconName
  label: string
  title: string
}

interface Props {
  isGenerating: boolean
  canGenerate: boolean
  elapsedSeconds: number
  healthOffline: boolean
  referenceImages: ReferenceImageAttachment[]
  keyboardInset?: number
  viewportHeight?: number
  continuation?: ContinuationContext | null
  modelWarning?: string
  canStreamingWait?: boolean
  canPartialPreview?: boolean
  streamingWaitHint?: string
  partialPreviewHint?: string
}

const props = withDefaults(defineProps<Props>(), {
  keyboardInset: 0,
  viewportHeight: 0,
  continuation: null,
  modelWarning: '',
  canStreamingWait: true,
  canPartialPreview: true,
  streamingWaitHint: '',
  partialPreviewHint: '',
})

const prompt = defineModel<string>('prompt', { required: true })
const modelChoice = defineModel<string>('modelChoice', { required: true })
defineModel<string>('customModel', { required: true })
const size = defineModel<ImageSize>('size', { required: true })
const count = defineModel<number>('count', { required: true })
const outputFormat = defineModel<OutputFormat>('outputFormat', { required: true })
const quality = defineModel<ImageQuality>('quality', { required: true })
const streamingWait = defineModel<boolean>('streamingWait', { required: true })
const partialPreview = defineModel<boolean>('partialPreview', { required: true })

const emit = defineEmits<{
  (e: 'send'): void
  (e: 'abort'): void
  (e: 'layout-change', height: number): void
  (e: 'select-reference-images', files: File[]): void
  (e: 'remove-reference-image', id: string): void
  (e: 'cancel-continuation'): void
  (e: 'jump-to-continuation', id: string): void
}>()

const dockRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const referenceInputRef = ref<HTMLInputElement | null>(null)
const modelSheetListRef = ref<HTMLDivElement | null>(null)
const focused = ref(false)
const advancedOpen = ref(false)
const modelSheetOpen = ref(false)
const isComposing = ref(false)
const advancedPanelId = 'chat-dock-advanced'
const modelSheetId = 'chat-dock-model-sheet'
let dockResizeObserver: ResizeObserver | null = null
let lastReportedHeight = 0
let layoutFrame = 0
let autosizeFrame = 0
let lastCompositionEnd = 0

const discoveredModels = useDiscoveredModels()
const { vibrate } = useVibration()
const { t } = useI18n()

function isSimpleImageModelOption(option: { value: string; disabled?: boolean; kind?: 'group' }) {
  const value = option.value.trim()
  if (!value || option.disabled || option.kind === 'group') return false
  const lower = value.toLowerCase()
  return !lower.includes('glm') || lower.includes('glm-image')
}

const modelSelectOptions = computed<SelectOption<string>[]>(() =>
  discoveredModels.mergedModelOptions.value
    .filter(isSimpleImageModelOption)
    .map((option) => ({
      value: option.value,
      label: option.label,
      hint: option.hint,
      disabled: option.disabled,
      kind: option.kind,
    })),
)

// Compact label shown on the model card in the composer row.
const modelCardLabel = computed(() => {
  if (modelChoice.value === autoModelSentinel) return t('model.auto.label')
  const match = modelSelectOptions.value.find((option) => option.value === modelChoice.value)
  if (match) return match.label
  return modelChoice.value.trim() || t('settings.model')
})

const sizeSelectOptions = computed<SelectOption<ImageSize>[]>(() =>
  sizeOptions.map((option) => ({
    value: option.value,
    label: t(`size.${option.value}.label`),
    hint: option.value,
  })),
)

const qualitySelectOptions = computed<SelectOption<ImageQuality>[]>(() =>
  qualityOptions.map((option) => ({
    value: option.value,
    label: t(`settings.quality.${option.value}`),
  })),
)

const formatSelectOptions = computed<SelectOption<OutputFormat>[]>(() => [
  { value: 'png', label: 'PNG', hint: t('settings.format.pngHint') },
  { value: 'jpeg', label: 'JPEG', hint: t('settings.format.jpegHint') },
  { value: 'webp', label: 'WEBP', hint: t('settings.format.webpHint') },
])

function compactSizeLabel(value: ImageSize) {
  const [width, height] = value.split('x').map((part) => Number(part))
  const ratio = width === height ? '1:1' : width < height ? '2:3' : '3:2'
  const tier = Math.max(width, height) >= 4096 ? '4K' : Math.max(width, height) >= 2048 ? '2K' : '1K'
  return `${ratio} ${tier}`
}

const selectedQualityLabel = computed(() => t(`settings.quality.${quality.value}`))
const quickSettingsSummary = computed(() =>
  [
    compactSizeLabel(size.value),
    outputFormat.value.toUpperCase(),
    selectedQualityLabel.value,
    `${count.value}x`,
  ].join(' / '),
)

const quickSettingPills = computed<QuickSettingPill[]>(() => [
  {
    key: 'size',
    icon: 'ratio',
    label: compactSizeLabel(size.value),
    title: `${t('settings.size')}: ${size.value}`,
  },
  {
    key: 'format',
    icon: 'image',
    label: outputFormat.value.toUpperCase(),
    title: `${t('settings.format')}: ${outputFormat.value.toUpperCase()}`,
  },
  {
    key: 'quality',
    icon: 'star',
    label: selectedQualityLabel.value,
    title: `${t('settings.quality')}: ${selectedQualityLabel.value}`,
  },
  {
    key: 'count',
    icon: 'layers',
    label: `${count.value}x`,
    title: `${t('settings.count')}: ${count.value}`,
  },
])

const promptCount = computed(() => prompt.value.length)
const promptHasContent = computed(() => prompt.value.trim().length >= 4)

const promptCountTone = computed(() => {
  const length = promptCount.value
  if (length >= 4000) {
    return {
      tone: 'text-accent',
      hint: t('composer.prompt.tooLongHint'),
    }
  }
  if (length >= 2000) {
    return {
      tone: 'text-ochre',
      hint: t('composer.prompt.longHint'),
    }
  }
  return { tone: '', hint: '' }
})

const hasReferenceImages = computed(() => props.referenceImages.length > 0)
const canAddReferenceImages = computed(() => props.referenceImages.length < maxReferenceImages)
const keyboardIsOpen = computed(() => props.keyboardInset > 0)

// Auto-collapse the advanced modal + model sheet when the on-screen keyboard
// opens, so the composer stays usable without overlays stealing viewport space.
watch(keyboardIsOpen, (isOpen) => {
  if (isOpen) {
    closeAdvanced()
    closeModelSheet()
  }
})

const sendDisabled = computed(() => !props.isGenerating && !props.canGenerate)
const inputPlaceholder = computed(() =>
  props.continuation ? t('dock.placeholderRemix') : t('dock.placeholder'),
)
const sendLabel = computed(() =>
  props.isGenerating
    ? t('dock.cancel')
    : props.continuation
      ? t('dock.sendRemix')
      : t('dock.send'),
)
const referenceUploadLabel = computed(() => {
  if (!canAddReferenceImages.value) return t('composer.tools.refLimitLabel', { max: maxReferenceImages })
  if (hasReferenceImages.value) return t('dock.refOpenWith', { n: props.referenceImages.length })
  return t('dock.refOpen')
})

function toggleState(value: boolean, enabled: boolean): ToggleState {
  if (!enabled) return 'blocked'
  return value ? 'on' : 'off'
}

function toggleStateLabel(value: boolean, enabled: boolean) {
  if (!enabled) return t('settings.toggle.unavailable')
  return value ? t('settings.toggle.on') : t('settings.toggle.off')
}

// GPU-only translate when the on-screen keyboard pushes the dock up.
// Avoids `bottom` transitions which trigger layout work each frame.
const dockOuterStyle = computed(() => {
  const visibleHeight = Math.max(0, Math.round(props.viewportHeight || 0))
  const keyboardInset = Math.max(0, Math.round(props.keyboardInset || 0))

  return {
    transform: keyboardInset ? `translate3d(0, -${keyboardInset}px, 0)` : 'translate3d(0,0,0)',
    '--chat-dock-visible-height': visibleHeight ? `${visibleHeight}px` : '100dvh',
  }
})

function openReferencePicker() {
  vibrate('tap')
  closeAdvanced()
  closeModelSheet()
  closeKeyboard()
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

function getVisibleViewportHeight() {
  const fromProps = Number(props.viewportHeight) || 0
  if (fromProps > 0) return fromProps
  if (typeof window === 'undefined') return 0
  return Math.round(window.visualViewport?.height || window.innerHeight || 0)
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
    // Keep the dock compact while the keyboard is open; chat bubbles already
    // hold long history, so the textarea should scroll before covering it.
    const maxLines = keyboardIsOpen.value ? (focused.value ? 4 : 2) : (focused.value ? 6 : 3)
    const lineCap = maxLines * lineHeight + padY
    const visibleHeight = getVisibleViewportHeight()
    const viewportCap = visibleHeight > 0
      ? Math.max(minH, Math.floor(visibleHeight * (keyboardIsOpen.value ? 0.24 : 0.34)))
      : lineCap
    const maxH = Math.min(lineCap, viewportCap)
    const target = Math.min(Math.max(el.scrollHeight, minH), maxH)
    el.style.height = `${target}px`
    if (focused.value) el.scrollTop = el.scrollHeight
    reportLayout()
  })
}

function ensureCaretVisible() {
  const el = textareaRef.value
  if (!el) return
  // After autosize, scroll the textarea so the caret line is in view.
  el.scrollTop = el.scrollHeight
}

function closeKeyboard() {
  textareaRef.value?.blur()
  focused.value = false
}

function closeAdvanced() {
  if (!advancedOpen.value) return
  advancedOpen.value = false
  syncLayoutSoon()
}

function openAdvanced() {
  vibrate('tap')
  closeKeyboard()
  closeModelSheet()
  advancedOpen.value = true
  syncLayoutSoon()
}

function closeModelSheet() {
  if (!modelSheetOpen.value) return
  modelSheetOpen.value = false
  syncLayoutSoon()
}

function openModelSheet() {
  vibrate('tap')
  closeKeyboard()
  closeAdvanced()
  modelSheetOpen.value = true
  nextTick(() => {
    const list = modelSheetListRef.value
    if (!list) return
    const active = list.querySelector<HTMLElement>('[data-selected="true"]')
    if (active) active.scrollIntoView({ block: 'center' })
  })
  syncLayoutSoon()
}

function selectModel(option: SelectOption<string>) {
  if (option.disabled || option.kind === 'group') return
  vibrate('tap')
  modelChoice.value = option.value
  closeModelSheet()
}

function adjustCount(delta: number) {
  const next = Math.min(4, Math.max(1, count.value + delta))
  if (next === count.value) {
    vibrate('error')
    return
  }
  count.value = next
  vibrate('tap')
}

function focusInput() {
  closeAdvanced()
  closeModelSheet()
  nextTick(() => {
    textareaRef.value?.focus()
    autosize()
  })
}

function send() {
  if (props.isGenerating) {
    vibrate('tap')
    closeAdvanced()
    closeModelSheet()
    closeKeyboard()
    emit('abort')
    return
  }
  if (isComposing.value) {
    vibrate('error')
    textareaRef.value?.focus()
    return
  }
  if (sendDisabled.value) {
    vibrate('error')
    return
  }
  closeAdvanced()
  closeModelSheet()
  closeKeyboard()
  emit('send')
}

function onKeydown(event: KeyboardEvent) {
  const justFinishedComposition = lastCompositionEnd > 0 && performance.now() - lastCompositionEnd < 120
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    if (event.isComposing || isComposing.value || justFinishedComposition) return
    event.preventDefault()
    send()
    return
  }
  if (
    event.key === 'Enter'
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
    && !event.ctrlKey
    && !event.isComposing
    && !isComposing.value
    && !justFinishedComposition
  ) {
    event.preventDefault()
    send()
  }
}

function onCompositionEnd() {
  isComposing.value = false
  lastCompositionEnd = performance.now()
  autosize()
}

watch(prompt, () => {
  autosize()
})

watch(
  () => props.isGenerating,
  () => {
    syncLayoutSoon()
  },
)

watch(focused, (isFocused) => {
  autosize()
  if (isFocused) {
    closeAdvanced()
    closeModelSheet()
    ensureCaretVisible()
  }
})

watch(() => props.referenceImages.length, syncLayoutSoon)
watch(() => props.continuation?.fromMessageId, syncLayoutSoon)
watch(() => props.healthOffline, syncLayoutSoon)
watch(() => props.modelWarning, syncLayoutSoon)
watch(advancedOpen, () => {
  syncLayoutSoon()
})
watch(modelSheetOpen, () => {
  syncLayoutSoon()
})
watch(
  () => [props.keyboardInset, props.viewportHeight] as const,
  () => {
    autosize()
    syncLayoutSoon()
    if (focused.value) ensureCaretVisible()
  },
)

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
    :data-keyboard-open="keyboardIsOpen ? 'true' : 'false'"
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
          :aria-label="t('dock.continueLabel')"
        >
          <button
            type="button"
            class="chat-dock__continuation-target"
            :aria-label="t('chat.continueLabel', { n: continuation.fromImageIndex + 1 })"
            @click.stop="emit('jump-to-continuation', continuation.fromMessageId)"
          >
            <span class="chat-dock__continuation-thumb">
              <img :src="continuation.thumbnailUrl" alt="" loading="lazy" decoding="async" />
              <span class="chat-dock__continuation-thumb-mark"><Icon name="sparkle" :size="9" /></span>
            </span>
            <span class="chat-dock__continuation-text">
              <span class="chat-dock__continuation-title">{{ t('dock.continueTitle') }}</span>
              <span class="chat-dock__continuation-sub">
                {{ t('dock.continueBody', { n: continuation.fromImageIndex + 1 }) }}
              </span>
            </span>
          </button>
          <button
            type="button"
            class="chat-dock__icon-btn"
            :aria-label="t('dock.continueCancel')"
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
          <span>{{ t('dock.offline') }}</span>
        </div>
      </Transition>

      <!-- reference images strip stays above the input -->
      <Transition name="dock-fade">
        <div
          v-if="hasReferenceImages"
          class="chat-dock__refs"
          role="region"
          :aria-label="t('dock.refTitle', { count: props.referenceImages.length, max: maxReferenceImages })"
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
                :aria-label="t('dock.refRemove', { name: image.name })"
                @click.stop="handleRemoveReferenceImage(image.id)"
              >
                <Icon name="close" :size="10" />
              </button>
            </div>
            <button
              v-if="props.referenceImages.length < maxReferenceImages"
              type="button"
              class="chat-dock__ref-add"
              :aria-label="t('dock.refContinue')"
              @click.stop="openReferencePicker"
            >
              <Icon name="plus" :size="16" />
            </button>
          </div>
          <span class="chat-dock__refs-count">
            {{ props.referenceImages.length }} / {{ maxReferenceImages }}
          </span>
        </div>
      </Transition>

      <!-- generation settings summary — tap to open the centered advanced modal -->
      <Transition name="dock-fade">
        <button
          v-if="!keyboardIsOpen"
          type="button"
          class="chat-dock__summary"
          :aria-label="`${t('desktop.render.settings')}: ${quickSettingsSummary}`"
          :title="quickSettingsSummary"
          @click.stop="openAdvanced"
        >
          <Icon name="sliders" :size="13" :stroke-width="1.8" />
          <span class="chat-dock__summary-pills" aria-hidden="true">
            <span
              v-for="item in quickSettingPills"
              :key="item.key"
              class="chat-dock__summary-pill"
            >
              <Icon :name="item.icon" :size="11" :stroke-width="1.8" />
              <span>{{ item.label }}</span>
            </span>
          </span>
          <Icon name="chevronRight" :size="12" class="chat-dock__summary-arrow" aria-hidden="true" />
        </button>
      </Transition>

      <!-- main composer row: [+] [textarea] [model card] [send] -->
      <div class="chat-dock__shell" :class="{ 'is-focused': focused }">
        <button
          type="button"
          class="chat-dock__attach"
          :class="{ 'has-refs': hasReferenceImages }"
          :disabled="!canAddReferenceImages"
          :aria-label="referenceUploadLabel"
          :title="referenceUploadLabel"
          @click.stop="openReferencePicker"
        >
          <Icon name="plus" :size="20" :stroke-width="1.8" />
          <span v-if="hasReferenceImages" class="chat-dock__attach-badge">
            {{ props.referenceImages.length }}
          </span>
        </button>

        <textarea
          ref="textareaRef"
          v-model="prompt"
          rows="1"
          :placeholder="inputPlaceholder"
          class="chat-dock__textarea"
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
          @compositionstart="isComposing = true"
          @compositionend="onCompositionEnd"
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
          :aria-label="promptCountTone.hint ? t('composer.prompt.countHintLabel', { count: promptCount, hint: promptCountTone.hint }) : undefined"
        >{{ promptCount }}</span>

        <button
          type="button"
          class="chat-dock__model-card"
          :aria-label="t('dock.modelLabel')"
          :title="t('dock.modelLabel')"
          @click.stop="openModelSheet"
        >
          <span class="chat-dock__model-card-label">{{ modelCardLabel }}</span>
          <Icon name="chevronDown" :size="13" class="chat-dock__model-card-arrow" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="chat-dock__send"
          :class="{
            'chat-dock__send--ready': promptHasContent && !sendDisabled && !isGenerating,
            'chat-dock__send--busy': isGenerating,
          }"
          :disabled="sendDisabled"
          :aria-label="sendLabel"
          :title="sendLabel"
          @click.stop="send"
        >
          <Icon v-if="isGenerating" name="close" :size="18" />
          <Icon v-else name="send" :size="18" />
        </button>
      </div>

      <p v-if="modelWarning" class="chat-dock__model-warning" role="status">
        <Icon name="warning" :size="11" />
        <span>{{ modelWarning }}</span>
      </p>

    </div>

    <!-- model selection — bottom sheet -->
    <Teleport to="body">
      <Transition name="sheet">
        <div
          v-if="modelSheetOpen"
          class="chat-dock__overlay"
          role="dialog"
          aria-modal="true"
          :aria-label="t('dock.modelLabel')"
          @click.self="closeModelSheet"
          @pointerdown.self="closeModelSheet"
        >
          <div class="chat-dock__sheet-panel" :id="modelSheetId">
            <div class="chat-dock__sheet-handle" aria-hidden="true"></div>
            <div class="chat-dock__sheet-head">
              <span class="chat-dock__sheet-title">
                <Icon name="aperture" :size="14" />
                <span>{{ t('dock.modelLabel') }}</span>
              </span>
              <button
                type="button"
                class="chat-dock__sheet-close"
                :aria-label="t('settings.close')"
                @click.stop="closeModelSheet"
              >
                <Icon name="close" :size="14" />
              </button>
            </div>
            <div ref="modelSheetListRef" class="chat-dock__sheet-list" role="listbox" :aria-label="t('dock.modelLabel')">
              <button
                v-for="option in modelSelectOptions"
                :key="option.value"
                type="button"
                role="option"
                class="chat-dock__sheet-item"
                :data-selected="option.value === modelChoice || undefined"
                :data-disabled="option.disabled || option.kind === 'group' || undefined"
                :aria-selected="option.value === modelChoice"
                @click.stop="selectModel(option)"
              >
                <span class="chat-dock__sheet-item-check" aria-hidden="true">
                  <Icon v-if="option.value === modelChoice" name="check" :size="14" />
                </span>
                <span class="chat-dock__sheet-item-copy">
                  <span class="chat-dock__sheet-item-label">{{ option.label }}</span>
                  <span v-if="option.hint" class="chat-dock__sheet-item-hint">{{ option.hint }}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- advanced generation settings — centered modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="advancedOpen"
          class="chat-dock__overlay chat-dock__overlay--modal"
          role="dialog"
          aria-modal="true"
          :aria-label="t('desktop.render.settings')"
          :id="advancedPanelId"
          @click.self="closeAdvanced"
          @pointerdown.self="closeAdvanced"
        >
          <div class="chat-dock__modal-box" @pointerdown.stop>
            <div class="chat-dock__modal-head">
              <span class="chat-dock__modal-title">
                <Icon name="sliders" :size="14" />
                <span>{{ t('desktop.render.settings') }}</span>
              </span>
              <button
                type="button"
                class="chat-dock__modal-close"
                :aria-label="t('settings.close')"
                @click.stop="closeAdvanced"
              >
                <Icon name="close" :size="14" />
              </button>
            </div>

            <div class="chat-dock__modal-body">
              <div class="chat-dock__quick-grid">
                <label class="chat-dock__quick-field">
                  <span class="chat-dock__quick-label">
                    <Icon name="ratio" :size="12" />
                    <span>{{ t('settings.size') }}</span>
                  </span>
                  <Select
                    v-model="size"
                    :options="sizeSelectOptions"
                    size="sm"
                    :aria-label="t('settings.size.label')"
                    :show-hints="false"
                  />
                </label>

                <label class="chat-dock__quick-field">
                  <span class="chat-dock__quick-label">
                    <Icon name="image" :size="12" />
                    <span>{{ t('settings.format') }}</span>
                  </span>
                  <Select
                    v-model="outputFormat"
                    :options="formatSelectOptions"
                    size="sm"
                    :aria-label="t('settings.format.label')"
                    :show-hints="false"
                  />
                </label>

                <label class="chat-dock__quick-field">
                  <span class="chat-dock__quick-label">
                    <Icon name="star" :size="12" />
                    <span>{{ t('settings.quality') }}</span>
                  </span>
                  <Select
                    v-model="quality"
                    :options="qualitySelectOptions"
                    size="sm"
                    :aria-label="t('settings.quality.label')"
                    :show-hints="false"
                  />
                </label>

                <div class="chat-dock__quick-field">
                  <span class="chat-dock__quick-label">
                    <Icon name="layers" :size="12" />
                    <span>{{ t('settings.count') }}</span>
                  </span>
                  <div class="chat-dock__count-stepper" role="group" :aria-label="t('settings.count')">
                    <button
                      type="button"
                      :disabled="count <= 1"
                      :aria-label="t('settings.count.decrease')"
                      @click.stop="adjustCount(-1)"
                    >
                      <Icon name="minus" :size="13" />
                    </button>
                    <span aria-live="polite">{{ count }}</span>
                    <button
                      type="button"
                      :disabled="count >= 4"
                      :aria-label="t('settings.count.increase')"
                      @click.stop="adjustCount(1)"
                    >
                      <Icon name="plus" :size="13" />
                    </button>
                  </div>
                </div>
              </div>

              <div class="chat-dock__quick-switches">
                <label
                  class="chat-dock__quick-toggle"
                  :class="{ 'is-disabled': !canStreamingWait }"
                  :data-state="toggleState(streamingWait, canStreamingWait)"
                >
                  <input
                    v-model="streamingWait"
                    type="checkbox"
                    :disabled="!canStreamingWait"
                  />
                  <span class="chat-dock__quick-toggle-copy">
                    <span>
                      <Icon name="clock" :size="12" />
                      <span>{{ t('settings.streamingWait') }}</span>
                      <strong>{{ toggleStateLabel(streamingWait, canStreamingWait) }}</strong>
                    </span>
                    <small>{{ streamingWaitHint || t('settings.streamingWait.hint') }}</small>
                  </span>
                </label>

                <label
                  class="chat-dock__quick-toggle"
                  :class="{ 'is-disabled': !canPartialPreview }"
                  :data-state="toggleState(partialPreview, canPartialPreview)"
                >
                  <input
                    v-model="partialPreview"
                    type="checkbox"
                    :disabled="!canPartialPreview"
                  />
                  <span class="chat-dock__quick-toggle-copy">
                    <span>
                      <Icon name="pulse" :size="12" />
                      <span>{{ t('settings.stagePreview') }}</span>
                      <strong>{{ toggleStateLabel(partialPreview, canPartialPreview) }}</strong>
                    </span>
                    <small>{{ partialPreviewHint || t('settings.stagePreview.hint') }}</small>
                  </span>
                </label>
              </div>
            </div>

            <div class="chat-dock__modal-foot">
              <button type="button" class="chat-dock__modal-done" @click.stop="closeAdvanced">
                {{ t('settings.close') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
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
  max-height: var(--chat-dock-visible-height, 100dvh);
  z-index: 45; /* matches Tailwind z-dock */
  pointer-events: none;
  /* GPU-only animation when the on-screen keyboard pushes the dock up */
  transition: transform 120ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
  contain: layout paint style;
}

.chat-dock[data-focused="true"] {
  transition-duration: 140ms;
}

.chat-dock__veil {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: 40px;
  pointer-events: none;
  background: linear-gradient(to top, rgb(var(--color-paper) / 0.92) 0%, rgb(var(--color-paper) / 0) 100%);
}

.chat-dock__inner {
  position: relative;
  pointer-events: auto;
  padding: 8px max(10px, env(safe-area-inset-right, 0px)) max(env(safe-area-inset-bottom, 0px), 10px) max(10px, env(safe-area-inset-left, 0px));
  max-height: var(--chat-dock-visible-height, 100dvh);
  display: flex;
  flex-direction: column;
  gap: 7px;
  background: linear-gradient(to top, rgb(var(--color-paper)) 60%, rgb(var(--color-paper) / 0));
  overflow: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.chat-dock__continuation,
.chat-dock__offline {
  order: 0;
}

/* ------------------------------------------------------------------
 * Banners (continuation, offline)
 * ------------------------------------------------------------------ */

.chat-dock__continuation {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 6px;
  border-radius: 10px;
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

/* ------------------------------------------------------------------
 * Quick settings: compact generation controls near the composer.
 * ------------------------------------------------------------------ */

.chat-dock__quick-settings {
  order: 2;
  display: grid;
  gap: 8px;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid rgb(var(--color-line) / 0.72);
  background: rgb(var(--color-vellum) / 0.96);
  box-shadow: var(--shadow-glass-sm), var(--shadow-inner-glass);
  max-height: 45dvh;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.chat-dock__quick-settings::-webkit-scrollbar {
  display: none;
}

.chat-dock__quick-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
}

.chat-dock__quick-head > span {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
  color: rgb(var(--color-muted));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
}

.chat-dock__quick-close {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  border: 1px solid rgb(var(--color-line) / 0.7);
  background: rgb(var(--color-surface-raised) / 0.78);
  color: rgb(var(--color-muted));
  -webkit-tap-highlight-color: transparent;
}

.chat-dock__quick-close::before {
  content: '';
  position: absolute;
  inset: -6px;
}

.chat-dock__quick-close:active {
  color: rgb(var(--color-ink));
  background: rgb(var(--color-surface-raised));
}

.chat-dock__quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.chat-dock__quick-field {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.chat-dock__quick-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  color: rgb(var(--color-muted));
  font-size: 11px;
  font-weight: 720;
  line-height: 1.15;
}

.chat-dock__quick-field :deep(.select-trigger) {
  height: 44px;
  border-radius: 8px;
  padding-inline: 10px 28px;
  background: rgb(var(--color-surface-raised) / 0.92);
  font-size: 12px;
  letter-spacing: 0;
}

.chat-dock__count-stepper {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  min-height: 44px;
  overflow: hidden;
  border: 1px solid rgb(var(--color-line) / 0.78);
  border-radius: 8px;
  background: rgb(var(--color-surface-raised) / 0.92);
}

.chat-dock__count-stepper button {
  position: relative;
  display: grid;
  min-height: 44px;
  place-items: center;
  color: rgb(var(--color-muted));
  -webkit-tap-highlight-color: transparent;
}

.chat-dock__count-stepper button:disabled {
  background: rgb(var(--color-line) / 0.08);
  cursor: not-allowed;
  color: rgb(var(--color-muted) / 0.42);
  opacity: 1;
}

.chat-dock__count-stepper button:active:not(:disabled) {
  background: rgb(var(--color-surface-muted));
  color: rgb(var(--color-ink));
}

.chat-dock__count-stepper span {
  color: rgb(var(--color-ink));
  font-size: 13px;
  font-weight: 760;
  text-align: center;
  font-feature-settings: 'tnum';
}

.chat-dock__quick-switches {
  display: grid;
  gap: 7px;
}

.chat-dock__quick-toggle {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  min-width: 0;
  min-height: 50px;
  gap: 8px;
  border: 1px solid rgb(var(--color-line) / 0.66);
  border-radius: 9px;
  background: rgb(var(--color-surface-raised) / 0.76);
  padding: 7px 9px;
  color: rgb(var(--color-ink));
}

.chat-dock__quick-toggle input[type='checkbox'] {
  appearance: none;
  position: relative;
  width: 38px;
  height: 22px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 999px;
  background: rgb(var(--color-paper-soft));
}

.chat-dock__quick-toggle input[type='checkbox']::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: rgb(var(--color-ivory));
  box-shadow: 0 1px 2px rgb(var(--color-ink) / 0.18);
  transition: transform 140ms var(--motion-soft);
}

.chat-dock__quick-toggle input[type='checkbox']:checked {
  border-color: rgb(var(--color-action));
  background: rgb(var(--color-action));
}

.chat-dock__quick-toggle input[type='checkbox']:checked::after {
  transform: translateX(16px);
}

.chat-dock__quick-toggle input[type='checkbox']:focus-visible {
  outline: none;
}

.chat-dock__quick-toggle:focus-within {
  border-color: rgb(var(--color-accent) / 0.54);
  box-shadow: var(--focus-ring);
}

.chat-dock__quick-toggle-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.chat-dock__quick-toggle-copy > span {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 5px;
  color: rgb(var(--color-ink));
  font-size: 11.5px;
  font-weight: 720;
  line-height: 1.2;
}

.chat-dock__quick-toggle-copy > span > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-dock__quick-toggle-copy svg {
  flex: 0 0 auto;
  color: rgb(var(--color-muted));
}

.chat-dock__quick-toggle-copy strong {
  flex: 0 0 auto;
  margin-left: auto;
  color: rgb(var(--color-muted));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 760;
}

.chat-dock__quick-toggle-copy small {
  min-width: 0;
  overflow: hidden;
  color: rgb(var(--color-muted));
  font-size: 10px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-dock__quick-toggle[data-state='on'] .chat-dock__quick-toggle-copy svg,
.chat-dock__quick-toggle[data-state='on'] .chat-dock__quick-toggle-copy strong {
  color: rgb(var(--color-forest));
}

.chat-dock__quick-toggle[data-state='blocked'] .chat-dock__quick-toggle-copy svg,
.chat-dock__quick-toggle[data-state='blocked'] .chat-dock__quick-toggle-copy strong {
  color: rgb(var(--color-ochre));
}

.chat-dock__quick-toggle.is-disabled {
  background: rgb(var(--color-surface-muted) / 0.56);
  cursor: not-allowed;
}

/* Advanced controls: negative prompt, seed, creativity slider. */
.chat-dock__quick-advanced {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.chat-dock__quick-field--full {
  grid-column: 1 / -1;
}

.chat-dock__quick-label--split {
  justify-content: space-between;
}

.chat-dock__quick-value {
  flex: 0 0 auto;
  color: rgb(var(--color-muted));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 760;
}

.chat-dock__quick-textarea {
  width: 100%;
  min-height: 44px;
  max-height: 96px;
  resize: none;
  border-radius: 8px;
  border: 1px solid rgb(var(--color-line) / 0.78);
  background: rgb(var(--color-surface-raised) / 0.92);
  padding: 8px 10px;
  color: rgb(var(--color-ink));
  font-size: 12px;
  line-height: 1.35;
  font-family: inherit;
  outline: none;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

.chat-dock__quick-textarea:focus-visible {
  border-color: rgb(var(--color-accent) / 0.54);
  box-shadow: var(--focus-ring);
}

.chat-dock__quick-seed {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  gap: 6px;
  align-items: stretch;
}

.chat-dock__quick-input {
  width: 100%;
  min-height: 44px;
  border-radius: 8px;
  border: 1px solid rgb(var(--color-line) / 0.78);
  background: rgb(var(--color-surface-raised) / 0.92);
  padding: 0 10px;
  color: rgb(var(--color-ink));
  font-size: 12px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  outline: none;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

.chat-dock__quick-input:focus-visible {
  border-color: rgb(var(--color-accent) / 0.54);
  box-shadow: var(--focus-ring);
}

.chat-dock__quick-dice {
  display: grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  border-radius: 8px;
  border: 1px solid rgb(var(--color-line) / 0.7);
  background: rgb(var(--color-surface-raised) / 0.78);
  color: rgb(var(--color-muted));
  -webkit-tap-highlight-color: transparent;
  transition: background 140ms ease, color 140ms ease;
}

.chat-dock__quick-dice:active {
  color: rgb(var(--color-ink));
  background: rgb(var(--color-surface-raised));
}

.chat-dock__quick-range {
  width: 100%;
  height: 44px;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  outline: none;
  cursor: pointer;
}

.chat-dock__quick-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: rgb(var(--color-line) / 0.5);
}

.chat-dock__quick-range::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: rgb(var(--color-line) / 0.5);
}

.chat-dock__quick-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 22px;
  height: 22px;
  margin-top: -9px;
  border-radius: 999px;
  background: rgb(var(--color-action));
  box-shadow: 0 1px 3px rgb(var(--color-ink) / 0.24);
}

.chat-dock__quick-range::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 999px;
  background: rgb(var(--color-action));
  box-shadow: 0 1px 3px rgb(var(--color-ink) / 0.24);
}

.chat-dock__refs {
  order: 3;
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid rgb(var(--color-line) / 0.7);
  background: rgb(var(--color-vellum) / 0.96);
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
  width: 48px;
  height: 48px;
  border-radius: 10px;
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
  width: 48px;
  height: 48px;
  border-radius: 10px;
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
  order: 6;
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 6px;
  padding: 6px 6px 6px 6px;
  border-radius: 10px;
  border: 1px solid rgb(var(--color-line) / 0.72);
  background: rgb(var(--color-surface-raised) / 0.98);
  box-shadow: var(--shadow-glass-sm), var(--shadow-inner-glass);
  transition: border-color 200ms var(--motion-soft), box-shadow 200ms var(--motion-soft);
  contain: layout paint style;
}

/* faint top-edge gradient hairline */
.chat-dock__shell::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(135deg, rgb(var(--color-accent) / 0.32), rgb(var(--color-blueprint) / 0.18) 40%, transparent 70%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  opacity: 0;
  transition: opacity 220ms var(--motion-soft);
  pointer-events: none;
  z-index: 1;
}

.chat-dock__shell.is-focused {
  border-color: rgb(var(--color-accent) / 0.48);
  box-shadow: var(--shadow-glow-accent), var(--shadow-inner-glass);
}

.chat-dock__shell.is-focused::before {
  opacity: 1;
}

/* attach / plus button — sits inside the input row, opens the image picker */
.chat-dock__attach {
  position: relative;
  z-index: 3;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid rgb(var(--color-line) / 0.72);
  background: rgb(var(--color-surface-muted) / 0.62);
  color: rgb(var(--color-muted));
  cursor: pointer;
  box-shadow: var(--shadow-inner-glass);
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 140ms var(--motion-soft),
    border-color 140ms var(--motion-soft),
    color 140ms var(--motion-soft),
    transform 140ms var(--motion-press);
}

.chat-dock__attach::before {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: inherit;
}

.chat-dock__attach:not(:disabled):active {
  transform: scale(0.94);
  background: rgb(var(--color-surface-muted));
  color: rgb(var(--color-ink));
}

.chat-dock__attach.has-refs {
  color: rgb(var(--color-forest));
  border-color: rgb(var(--color-forest) / 0.32);
  background: rgb(var(--color-forest) / 0.08);
}

.chat-dock__attach:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring), var(--shadow-inner-glass);
}

.chat-dock__attach:disabled {
  background: rgb(var(--color-line) / 0.1);
  color: rgb(var(--color-muted) / 0.5);
  cursor: not-allowed;
}

.chat-dock__attach-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  display: grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgb(var(--color-forest));
  color: rgb(var(--color-paper));
  border: 1.5px solid rgb(var(--color-vellum));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  font-feature-settings: 'tnum';
}

.chat-dock__textarea {
  position: relative;
  z-index: 2;
  flex: 1 1 auto;
  min-width: 0;
  display: block;
  width: 100%;
  min-height: 40px;
  padding: 9px 2px;
  resize: none;
  background: transparent;
  border: 0;
  outline: none;
  color: rgb(var(--color-ink));
  font-family: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 16px;
  line-height: 1.5;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  overscroll-behavior: contain;
  -webkit-tap-highlight-color: transparent;
  caret-color: rgb(var(--color-accent));
}

.chat-dock__textarea::-webkit-scrollbar {
  display: none;
}

.chat-dock__textarea::placeholder {
  color: rgb(var(--color-muted) / 0.82);
}

.chat-dock__indicator {
  position: absolute;
  top: 5px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgb(var(--color-paper) / 0.86);
  border: 1px solid rgb(var(--color-line) / 0.6);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-feature-settings: 'tnum';
  letter-spacing: 0.06em;
  color: rgb(var(--color-muted));
  pointer-events: none;
  z-index: 5;
}

.chat-dock__indicator--quiet {
  background: transparent;
  border-color: transparent;
  padding: 0;
  color: rgb(var(--color-muted) / 0.62);
}

.chat-dock__model-warning {
  order: 5;
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin: 0;
  padding: 7px 11px;
  border-radius: 8px;
  border: 1px solid rgb(var(--color-ochre) / 0.26);
  color: rgb(var(--color-ochre));
  background: rgb(var(--color-ochre) / 0.07);
  font-size: 10.5px;
  font-weight: 560;
  line-height: 1.35;
}

.chat-dock__model-warning span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.chat-dock__toolbar-scroll {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 0 1px;
  scroll-padding-inline: 12px;
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
  height: 44px;
  max-width: clamp(7rem, 36vw, 11rem);
  border-radius: 10px;
  padding: 0 28px 0 12px;
  background: rgb(var(--color-surface-raised) / 0.98);
  border-color: rgb(var(--color-line) / 0.72);
  font-size: 12px;
  font-weight: 620;
  color: rgb(var(--color-ink));
  letter-spacing: 0;
}

.chat-dock__model-chip :deep(.select-trigger.is-open) {
  background: rgb(var(--color-surface-raised));
  border-color: rgb(var(--color-accent) / 0.5);
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
  gap: 6px;
  flex-shrink: 0;
  height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  background: rgb(var(--color-surface-raised) / 0.98);
  border: 1px solid rgb(var(--color-line) / 0.72);
  color: rgb(var(--color-ink));
  font-size: 12px;
  font-weight: 680;
  cursor: pointer;
  box-shadow: var(--shadow-inner-glass);
  transition:
    background-color 140ms var(--motion-soft),
    border-color 140ms var(--motion-soft),
    color 140ms var(--motion-soft),
    box-shadow 160ms var(--motion-soft),
    transform 140ms var(--motion-press);
  -webkit-tap-highlight-color: transparent;
}

.chat-dock__chip::before {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: inherit;
}

.chat-dock__chip:active {
  transform: scale(0.98);
}

.chat-dock__chip:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring), var(--shadow-inner-glass);
}

.chat-dock__chip:disabled {
  background: rgb(var(--color-line) / 0.12);
  color: rgb(var(--color-muted) / 0.62);
  cursor: not-allowed;
  opacity: 1;
}

.chat-dock__chip--reference {
  min-width: 104px;
  justify-content: flex-start;
  padding: 0 11px 0 9px;
  border-radius: 10px;
  color: rgb(var(--color-forest));
  background:
    linear-gradient(135deg, rgb(var(--color-forest) / 0.08), rgb(var(--color-surface-raised) / 0.98) 58%),
    rgb(var(--color-surface-raised) / 0.98);
  border-color: rgb(var(--color-forest) / 0.26);
}

.chat-dock__chip--reference.has-refs {
  min-width: 68px;
  padding: 0 10px 0 8px;
  border-radius: 10px;
  background:
    linear-gradient(135deg, rgb(var(--color-forest) / 0.14), rgb(var(--color-surface-raised) / 0.98) 64%),
    rgb(var(--color-surface-raised) / 0.98);
  border-color: rgb(var(--color-forest) / 0.38);
}

.chat-dock__chip--reference:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring), var(--shadow-inner-glass);
}

.chat-dock__chip--reference:not(:disabled):hover {
  border-color: rgb(var(--color-forest) / 0.46);
  color: rgb(var(--color-accent));
}

.chat-dock__chip--settings {
  max-width: none;
  min-width: 232px;
  color: rgb(var(--color-ink));
}

.chat-dock__chip--settings.is-open {
  border-color: rgb(var(--color-accent) / 0.42);
  background:
    linear-gradient(180deg, rgb(var(--color-accent) / 0.1), rgb(var(--color-surface-raised) / 0.98)),
    rgb(var(--color-surface-raised) / 0.98);
  color: rgb(var(--color-accent));
  box-shadow: var(--focus-ring), var(--shadow-inner-glass);
}

.chat-dock__reference-glyph {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 21px;
  height: 21px;
  border-radius: 7px;
  background: rgb(var(--color-paper) / 0.72);
  box-shadow:
    inset 0 0 0 1px rgb(var(--color-forest) / 0.18),
    0 1px 2px rgb(var(--color-ink) / 0.08);
}

.chat-dock__reference-plus {
  position: absolute;
  right: -5px;
  bottom: -4px;
  display: inline-grid;
  place-items: center;
  width: 13px;
  height: 13px;
  border-radius: 999px;
  background: rgb(var(--color-forest));
  color: rgb(var(--color-paper));
  border: 1.5px solid rgb(var(--color-ivory));
  box-shadow: 0 1px 3px rgb(var(--color-ink) / 0.16);
}

.chat-dock__chip-count {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-feature-settings: 'tnum';
  letter-spacing: 0;
}

.chat-dock__chip-label--reference {
  max-width: 5.8rem;
}

.chat-dock__chip.is-muted {
  opacity: 0.6;
}

.chat-dock__chip.is-muted:disabled {
  cursor: default;
}

.chat-dock__chip-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  white-space: nowrap;
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-dock__param-pills {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.chat-dock__param-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  height: 26px;
  max-width: 74px;
  border-radius: 7px;
  background: rgb(var(--color-surface-muted) / 0.94);
  color: rgb(var(--color-ink));
  padding: 0 6px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
}

.chat-dock__param-pill span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-dock[data-keyboard-open="true"] .chat-dock__inner {
  gap: 6px;
  padding-top: 6px;
  padding-bottom: max(env(safe-area-inset-bottom, 0px), 12px);
}

.chat-dock[data-keyboard-open="true"] .chat-dock__veil {
  height: 26px;
}

.chat-dock[data-keyboard-open="true"] .chat-dock__refs,
.chat-dock[data-keyboard-open="true"] .chat-dock__custom,
.chat-dock[data-keyboard-open="true"] .chat-dock__continuation,
.chat-dock[data-keyboard-open="true"] .chat-dock__offline {
  border-radius: 10px;
  padding-block: 5px;
}

.chat-dock[data-keyboard-open="true"] .chat-dock__quick-grid {
  gap: 6px;
}

.chat-dock[data-keyboard-open="true"] .chat-dock__quick-head {
  min-height: 28px;
}

.chat-dock[data-keyboard-open="true"] .chat-dock__ref-card,
.chat-dock[data-keyboard-open="true"] .chat-dock__ref-add {
  width: 42px;
  height: 42px;
  border-radius: 10px;
}

.chat-dock[data-keyboard-open="true"] .chat-dock__shell {
  border-radius: 10px;
}

.chat-dock[data-keyboard-open="true"] .chat-dock__textarea {
  min-height: 40px;
  padding-top: 9px;
}

.chat-dock__model-card {
  position: relative;
  z-index: 3;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 9.5rem;
  min-height: 40px;
  height: 40px;
  padding: 0 8px 0 10px;
  border-radius: 10px;
  border: 1px solid rgb(var(--color-line) / 0.72);
  background: rgb(var(--color-vellum) / 0.96);
  color: rgb(var(--color-ink));
  font-size: 12px;
  font-weight: 640;
  letter-spacing: 0;
  cursor: pointer;
  box-shadow: var(--shadow-inner-glass);
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 140ms var(--motion-soft),
    border-color 140ms var(--motion-soft),
    color 140ms var(--motion-soft),
    box-shadow 160ms var(--motion-soft),
    transform 140ms var(--motion-press);
}

.chat-dock__model-card::before {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: inherit;
}

.chat-dock__model-card:active {
  transform: scale(0.97);
}

.chat-dock__model-card:focus-visible {
  outline: none;
  border-color: rgb(var(--color-accent) / 0.5);
  box-shadow: var(--focus-ring), var(--shadow-inner-glass);
}

.chat-dock__model-card-label {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-dock__model-card-arrow {
  flex: 0 0 auto;
  color: rgb(var(--color-muted));
  transition: transform 200ms var(--motion-soft), color 160ms ease;
}

.chat-dock__send {
  position: relative;
  z-index: 4;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid rgb(var(--color-line) / 0.78);
  background: rgb(var(--color-surface-muted) / 0.96);
  color: rgb(var(--color-muted));
  cursor: not-allowed;
  box-shadow: var(--shadow-inner-glass);
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 140ms var(--motion-press),
    background-color 140ms var(--motion-soft),
    color 140ms var(--motion-soft),
    box-shadow 160ms var(--motion-soft);
}

.chat-dock__send::before {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: inherit;
}

.chat-dock__send:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring), var(--shadow-inner-glass);
}

.chat-dock__send:disabled {
  opacity: 1;
}

.chat-dock__send--ready {
  background: var(--gradient-primary);
  color: #fff;
  border-color: transparent;
  cursor: pointer;
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent);
}

.chat-dock__send--ready:active,
.chat-dock__send--busy:active {
  transform: scale(0.94);
}

.chat-dock__send--busy {
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  border-color: transparent;
  cursor: pointer;
  box-shadow: var(--shadow-glass);
}


/* ------------------------------------------------------------------
 * Summary strip — compact tappable row that opens the advanced modal
 * ------------------------------------------------------------------ */

.chat-dock__summary {
  order: 2;
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid rgb(var(--color-line) / 0.6);
  background: rgb(var(--color-vellum) / 0.62);
  color: rgb(var(--color-ink));
  font-size: 11px;
  cursor: pointer;
  box-shadow: var(--shadow-inner-paper);
  -webkit-tap-highlight-color: transparent;
  transition: background-color 140ms var(--motion-soft), border-color 140ms var(--motion-soft);
}

.chat-dock__summary > svg:first-child {
  flex: 0 0 auto;
  color: rgb(var(--color-muted));
}

.chat-dock__summary:active {
  background: rgb(var(--color-vellum) / 0.94);
  border-color: rgb(var(--color-line-strong) / 0.6);
}

.chat-dock__summary:focus-visible {
  outline: none;
  border-color: rgb(var(--color-accent) / 0.5);
  box-shadow: var(--focus-ring);
}

.chat-dock__summary-pills {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 14px), transparent 100%);
          mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 14px), transparent 100%);
}

.chat-dock__summary-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
  height: 22px;
  max-width: 76px;
  padding: 0 6px;
  border-radius: 6px;
  background: rgb(var(--color-surface-muted) / 0.92);
  color: rgb(var(--color-ink));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
}

.chat-dock__summary-pill span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-dock__summary-pill svg {
  flex: 0 0 auto;
  color: rgb(var(--color-muted));
}

.chat-dock__summary-arrow {
  flex: 0 0 auto;
  margin-left: auto;
  color: rgb(var(--color-muted));
}


/* ------------------------------------------------------------------
 * Overlays — model bottom sheet & advanced centered modal
 * ------------------------------------------------------------------ */

.chat-dock__overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgb(var(--color-ink) / 0.42);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  -webkit-tap-highlight-color: transparent;
}

.chat-dock__overlay--modal {
  align-items: center;
  padding: 16px;
}

/* bottom sheet panel */
.chat-dock__sheet-panel {
  position: relative;
  width: 100%;
  max-width: 520px;
  max-height: 78dvh;
  display: flex;
  flex-direction: column;
  background: rgb(var(--color-vellum) / 0.99);
  border: 1px solid rgb(var(--color-line) / 0.7);
  border-bottom: 0;
  border-radius: 14px 14px 0 0;
  box-shadow: var(--shadow-glass-lg);
  overflow: hidden;
  margin-bottom: max(env(safe-area-inset-bottom, 0px), 0px);
}

.chat-dock__sheet-handle {
  flex: 0 0 auto;
  align-self: center;
  width: 38px;
  height: 4px;
  margin: 8px 0 4px;
  border-radius: 999px;
  background: rgb(var(--color-line-strong) / 0.6);
}

.chat-dock__sheet-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 10px 8px;
  border-bottom: 1px solid rgb(var(--color-line) / 0.5);
}

.chat-dock__sheet-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: rgb(var(--color-ink));
  font-size: 13px;
  font-weight: 700;
}

.chat-dock__sheet-title svg {
  color: rgb(var(--color-accent));
}

.chat-dock__sheet-close,
.chat-dock__modal-close {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  border: 1px solid rgb(var(--color-line) / 0.7);
  background: rgb(var(--color-surface-raised) / 0.82);
  color: rgb(var(--color-muted));
  -webkit-tap-highlight-color: transparent;
}

.chat-dock__sheet-close::before,
.chat-dock__modal-close::before {
  content: '';
  position: absolute;
  inset: -6px;
}

.chat-dock__sheet-close:active,
.chat-dock__modal-close:active {
  color: rgb(var(--color-ink));
  background: rgb(var(--color-surface-raised));
}

.chat-dock__sheet-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 6px;
  scrollbar-width: thin;
  scrollbar-color: rgb(var(--color-ink) / 0.22) transparent;
}

.chat-dock__sheet-list::-webkit-scrollbar {
  width: 6px;
}

.chat-dock__sheet-list::-webkit-scrollbar-thumb {
  background: rgb(var(--color-ink) / 0.22);
  border-radius: 999px;
}

.chat-dock__sheet-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 11px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: rgb(var(--color-ink));
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 150ms var(--motion-soft);
}

.chat-dock__sheet-item:active {
  background: rgb(var(--color-surface-muted) / 0.8);
}

.chat-dock__sheet-item[data-selected] {
  background: rgb(var(--color-accent) / 0.08);
  border-color: rgb(var(--color-accent) / 0.28);
}

.chat-dock__sheet-item[data-disabled] {
  cursor: default;
  padding-top: 14px;
  padding-bottom: 6px;
  background: transparent;
}

.chat-dock__sheet-item[data-disabled] .chat-dock__sheet-item-check {
  display: none;
}

.chat-dock__sheet-item[data-disabled] .chat-dock__sheet-item-label {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgb(var(--color-muted));
}

.chat-dock__sheet-item-check {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  margin-top: 1px;
  width: 16px;
  height: 16px;
  color: rgb(var(--color-accent));
}

.chat-dock__sheet-item-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.chat-dock__sheet-item-label {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  word-break: break-word;
}

.chat-dock__sheet-item-hint {
  font-size: 11px;
  line-height: 1.35;
  color: rgb(var(--color-muted));
}

.chat-dock__sheet-item[data-selected] .chat-dock__sheet-item-hint {
  color: rgb(var(--color-accent) / 0.8);
}

/* centered modal box */
.chat-dock__modal-box {
  position: relative;
  width: 100%;
  max-width: 460px;
  max-height: 86dvh;
  display: flex;
  flex-direction: column;
  background: rgb(var(--color-vellum) / 0.99);
  border: 1px solid rgb(var(--color-line) / 0.7);
  border-radius: 12px;
  box-shadow: var(--shadow-glass-lg);
  overflow: hidden;
}

.chat-dock__modal-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgb(var(--color-line) / 0.5);
}

.chat-dock__modal-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: rgb(var(--color-ink));
  font-size: 13px;
  font-weight: 700;
}

.chat-dock__modal-title svg {
  color: rgb(var(--color-accent));
}

.chat-dock__modal-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 12px;
  display: grid;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: rgb(var(--color-ink) / 0.22) transparent;
}

.chat-dock__modal-body::-webkit-scrollbar {
  width: 6px;
}

.chat-dock__modal-body::-webkit-scrollbar-thumb {
  background: rgb(var(--color-ink) / 0.22);
  border-radius: 999px;
}

.chat-dock__modal-foot {
  flex: 0 0 auto;
  padding: 10px 12px;
  border-top: 1px solid rgb(var(--color-line) / 0.5);
}

.chat-dock__modal-done {
  width: 100%;
  min-height: 42px;
  border-radius: 8px;
  border: 1px solid rgb(var(--color-line) / 0.7);
  background: rgb(var(--color-surface-raised) / 0.92);
  color: rgb(var(--color-ink));
  font-size: 13px;
  font-weight: 660;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 140ms var(--motion-soft);
}

.chat-dock__modal-done:active {
  background: rgb(var(--color-surface-raised));
}

/* sheet slide transition */
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .chat-dock__sheet-panel,
.sheet-leave-to .chat-dock__sheet-panel {
  transform: translateY(100%);
}

.sheet-enter-active .chat-dock__sheet-panel,
.sheet-leave-active .chat-dock__sheet-panel {
  transition: transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 220ms var(--motion-soft);
}

/* modal fade/scale transition */
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .chat-dock__modal-box,
.modal-leave-to .chat-dock__modal-box {
  transform: scale(0.96) translateY(8px);
}

.modal-enter-active .chat-dock__modal-box,
.modal-leave-active .chat-dock__modal-box {
  transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 200ms var(--motion-soft);
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

@media (max-width: 430px) {
  .chat-dock__shell {
    gap: 5px;
    padding: 5px;
  }

  .chat-dock__attach,
  .chat-dock__send {
    width: 38px;
    height: 38px;
    min-height: 38px;
  }

  .chat-dock__model-card {
    height: 38px;
    min-height: 38px;
    max-width: 8rem;
    padding: 0 7px 0 9px;
  }

  .chat-dock__textarea {
    min-height: 38px;
  }
}

@media (max-width: 360px) {
  .chat-dock__inner {
    padding-left: 8px;
    padding-right: 8px;
  }

  .chat-dock__model-card {
    max-width: 6.5rem;
    font-size: 11.5px;
  }

  .chat-dock__summary-pill {
    max-width: 60px;
    padding-inline: 5px;
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
    gap: 5px;
    padding-top: 5px;
    padding-bottom: max(env(safe-area-inset-bottom, 0px), 5px);
  }

  .chat-dock__quick-grid {
    grid-template-columns: repeat(4, minmax(108px, 1fr));
    overflow-x: auto;
    padding-bottom: 1px;
    scrollbar-width: none;
  }

  .chat-dock__quick-grid::-webkit-scrollbar {
    display: none;
  }

  .chat-dock__refs {
    padding-block: 5px;
  }

  .chat-dock__attach,
  .chat-dock__send {
    width: 34px;
    height: 34px;
    min-height: 34px;
  }

  .chat-dock__model-card {
    height: 34px;
    min-height: 34px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-dock,
  .chat-dock__shell,
  .chat-dock__attach,
  .chat-dock__model-card,
  .chat-dock__send,
  .chat-dock__icon-btn,
  .dock-fade-enter-active,
  .dock-fade-leave-active,
  .sheet-enter-active,
  .sheet-leave-active,
  .modal-enter-active,
  .modal-leave-active {
    transition: none;
  }

  .chat-dock__send--busy::after {
    animation: none;
  }
}
</style>
