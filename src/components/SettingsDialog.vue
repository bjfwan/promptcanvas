<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import Select, { type SelectOption } from './Select.vue'
import { qualityOptions, sizeOptions } from '../presets'
import { useProviderConfig } from '../composables/useProviderConfig'
import { useDiscoveredModels, detectCapabilities } from '../composables/useDiscoveredModels'
import { useResolutionSupport } from '../composables/useResolutionSupport'
import { useFocusTrap } from '../composables/useFocusTrap'
import { useBodyLock } from '../composables/useBodyLock'
import { ApiRequestError, testProvider } from '../api'
import { useI18n, type LocalePreference } from '../lib/i18n'
import type { IconName } from '../icons'
import type { GenerateImageRequest, ImageQuality, ImageSize } from '../types'

type OutputFormat = NonNullable<GenerateImageRequest['outputFormat']>

interface Props {
  open: boolean
  canTransparentBackground?: boolean
  transparentBackgroundDisabledReason?: string
  canStreamingWait?: boolean
  canPartialPreview?: boolean
  partialPreviewDisabledReason?: string
}

const props = withDefaults(defineProps<Props>(), {
  canTransparentBackground: false,
  transparentBackgroundDisabledReason: '',
  canStreamingWait: false,
  canPartialPreview: false,
  partialPreviewDisabledReason: '',
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'export'): void
  (e: 'reset'): void
  (e: 'reset-provider'): void
  (e: 'test-result', payload: { ok: boolean; message: string; code?: string }): void
}>()

const negativePrompt = defineModel<string>('negativePrompt', { required: true })
const size = defineModel<ImageSize>('size', { required: true })
const count = defineModel<number>('count', { required: true })
const outputFormat = defineModel<OutputFormat>('outputFormat', { required: true })
const quality = defineModel<ImageQuality>('quality', { required: true })
const transparentBackground = defineModel<boolean>('transparentBackground', { required: true })
const streamingWait = defineModel<boolean>('streamingWait', { required: true })
const partialPreview = defineModel<boolean>('partialPreview', { required: true })
const creativity = defineModel<number>('creativity', { required: true })
const seed = defineModel<string>('seed', { required: true })

const provider = useProviderConfig()
const discoveredModels = useDiscoveredModels()
const resolutionSupport = useResolutionSupport()
const i18n = useI18n()
const minCount = 1
const maxCount = 4

type ToggleState = 'on' | 'off' | 'blocked'
type CapabilityTileState = 'supported' | 'unsupported' | 'partial' | 'pending'

interface CapabilityTile {
  key: string
  icon: IconName
  label: string
  detail: string
  state: CapabilityTileState
  stateLabel: string
}

function tierLabel(tier: '2k' | '4k'): string {
  const s = resolutionSupport.state
  if (tier === '2k') {
    if (s.blocked2k) return i18n.t('settings.resolution.statusBlocked')
    if (s.learned2k) return i18n.t('settings.resolution.statusUnlocked')
    if (s.detected2k) return i18n.t('settings.resolution.statusDetected')
    return s.manual2k === 'on'
      ? i18n.t('settings.resolution.statusManual')
      : i18n.t('settings.resolution.statusOff')
  }
  if (s.blocked4k) return i18n.t('settings.resolution.statusBlocked')
  if (s.learned4k) return i18n.t('settings.resolution.statusUnlocked')
  if (s.detected4k) return i18n.t('settings.resolution.statusDetected')
  return s.manual4k === 'on'
    ? i18n.t('settings.resolution.statusManual')
    : i18n.t('settings.resolution.statusOff')
}

const capabilityBadges = computed<string[]>(() => {
  const s = resolutionSupport.state
  const badges: string[] = []
  if (s.supportsEdits) badges.push(i18n.t('settings.resolution.badgeEdits'))
  if (s.supportsMask) badges.push(i18n.t('settings.resolution.badgeMask'))
  if (s.supportsQuality) badges.push(i18n.t('settings.resolution.badgeQuality'))
  if (s.outputFormats?.length) badges.push(s.outputFormats.join(' / ').toUpperCase())
  return badges
})

const resolutionSummary = computed(() => {
  if (resolutionSupport.unlocked4k.value) return i18n.t('settings.resolution.unlocked4k')
  if (resolutionSupport.unlocked2k.value) return i18n.t('settings.resolution.unlocked2k')
  return i18n.t('settings.resolution.only1k')
})

function toggleState(value: boolean, enabled: boolean): ToggleState {
  if (!enabled) return 'blocked'
  return value ? 'on' : 'off'
}

function toggleStateLabel(value: boolean, enabled: boolean): string {
  if (!enabled) return i18n.t('settings.toggle.unavailable')
  return value ? i18n.t('settings.toggle.on') : i18n.t('settings.toggle.off')
}

function capabilityStateLabel(state: CapabilityTileState): string {
  if (state === 'supported') return i18n.t('desktop.capabilities.supported')
  if (state === 'partial') return i18n.t('desktop.capabilities.limited')
  if (state === 'pending') return i18n.t('desktop.capabilities.pending')
  return i18n.t('desktop.capabilities.unsupported')
}

function configuredCapabilityState(supported: boolean): CapabilityTileState {
  if (!provider.isConfigured.value) return 'pending'
  return supported ? 'supported' : 'unsupported'
}

function capabilityDetailFor(
  state: CapabilityTileState,
  supportedDetail: string,
  unsupportedDetail = i18n.t('desktop.capabilities.requiresProvider'),
): string {
  if (state === 'pending') return i18n.t('desktop.capabilities.pendingDetail')
  if (state === 'supported' || state === 'partial') return supportedDetail
  return unsupportedDetail
}

const providerGenerationModeLabel = computed(() => {
  if (!provider.isConfigured.value) return i18n.t('desktop.capabilities.pendingDetail')
  switch (provider.state.imageGeneration.generationMode) {
    case 'images_generations':
      return i18n.t('desktop.capabilities.modeImages')
    case 'responses_tool':
      return i18n.t('desktop.capabilities.modeResponses')
    case 'responses_text_data_url':
      return i18n.t('desktop.capabilities.modeResponsesData')
    default:
      return i18n.t('desktop.capabilities.modeAuto')
  }
})

function resolutionTileState(unlocked: boolean, blocked: boolean): CapabilityTileState {
  if (!provider.isConfigured.value) return 'pending'
  if (blocked) return 'unsupported'
  return unlocked ? 'supported' : 'unsupported'
}

const providerCapabilityTiles = computed<CapabilityTile[]>(() => {
  const imageGeneration = provider.state.imageGeneration
  const imageState = configuredCapabilityState(imageGeneration.textToImage === 'supported')
  const editState = configuredCapabilityState(
    imageGeneration.imageEdit === 'supported' || resolutionSupport.state.supportsEdits,
  )
  const streamingState = configuredCapabilityState(imageGeneration.sseStream === 'supported')
  const previewState: CapabilityTileState = !provider.isConfigured.value
    ? 'pending'
    : imageGeneration.partialPreview !== 'supported'
      ? 'unsupported'
      : imageGeneration.sseStream === 'supported'
        ? 'supported'
        : 'partial'
  const transparentState: CapabilityTileState = !provider.isConfigured.value
    ? 'pending'
    : imageGeneration.transparentBackground !== 'supported'
      ? 'unsupported'
      : outputFormat.value === 'png'
        ? 'supported'
        : 'partial'
  const qualityState = configuredCapabilityState(resolutionSupport.state.supportsQuality)
  const twoKState = resolutionTileState(resolutionSupport.unlocked2k.value, resolutionSupport.state.blocked2k)
  const fourKState = resolutionTileState(resolutionSupport.unlocked4k.value, resolutionSupport.state.blocked4k)

  return [
    {
      key: 'image-generation',
      icon: 'image',
      label: i18n.t('desktop.capabilities.imageGeneration'),
      detail: capabilityDetailFor(imageState, providerGenerationModeLabel.value),
      state: imageState,
      stateLabel: capabilityStateLabel(imageState),
    },
    {
      key: 'reference-image',
      icon: 'layers',
      label: i18n.t('desktop.capabilities.imageEdit'),
      detail: capabilityDetailFor(
        editState,
        resolutionSupport.state.supportsMask
          ? i18n.t('desktop.capabilities.withMask')
          : i18n.t('desktop.capabilities.referenceEdit'),
      ),
      state: editState,
      stateLabel: capabilityStateLabel(editState),
    },
    {
      key: '2k',
      icon: 'check',
      label: i18n.t('settings.resolution.twoK'),
      detail: capabilityDetailFor(twoKState, tierLabel('2k')),
      state: twoKState,
      stateLabel: capabilityStateLabel(twoKState),
    },
    {
      key: '4k',
      icon: 'star',
      label: i18n.t('settings.resolution.fourK'),
      detail: capabilityDetailFor(fourKState, tierLabel('4k')),
      state: fourKState,
      stateLabel: capabilityStateLabel(fourKState),
    },
    {
      key: 'streaming',
      icon: 'clock',
      label: i18n.t('desktop.capabilities.streaming'),
      detail: capabilityDetailFor(streamingState, i18n.t('desktop.capabilities.streamingDetail')),
      state: streamingState,
      stateLabel: capabilityStateLabel(streamingState),
    },
    {
      key: 'preview',
      icon: 'pulse',
      label: i18n.t('desktop.capabilities.preview'),
      detail: capabilityDetailFor(
        previewState,
        previewState === 'partial'
          ? i18n.t('capability.previewRequiresStreaming')
          : i18n.t('desktop.capabilities.previewDetail'),
      ),
      state: previewState,
      stateLabel: capabilityStateLabel(previewState),
    },
    {
      key: 'transparent',
      icon: 'swatch',
      label: i18n.t('desktop.capabilities.transparent'),
      detail: capabilityDetailFor(
        transparentState,
        outputFormat.value === 'png'
          ? i18n.t('settings.format.pngHint')
          : i18n.t('desktop.capabilities.requiresPng'),
      ),
      state: transparentState,
      stateLabel: capabilityStateLabel(transparentState),
    },
    {
      key: 'quality',
      icon: 'sliders',
      label: i18n.t('desktop.capabilities.quality'),
      detail: capabilityDetailFor(qualityState, i18n.t('settings.resolution.badgeQuality')),
      state: qualityState,
      stateLabel: capabilityStateLabel(qualityState),
    },
  ]
})

const showApiKey = ref(false)
const dialogRef = ref<HTMLElement | null>(null)

type TestStatus = 'idle' | 'testing' | 'success' | 'partial' | 'error'
const testStatus = ref<TestStatus>('idle')
const testMessage = ref('')
const testHint = ref('')

function formatProviderResultMessage(result: {
  modelCount?: number
  durationMs: number
  generationRouteOk: boolean
}) {
  if (result.modelCount !== undefined) {
    return i18n.t(result.generationRouteOk ? 'providerTest.connectedModels' : 'providerTest.partialModels', {
      count: result.modelCount,
      ms: result.durationMs,
    })
  }
  return i18n.t(result.generationRouteOk ? 'providerTest.connectedMs' : 'providerTest.partialMs', {
    ms: result.durationMs,
  })
}

function providerResultMessageToken(result: {
  modelCount?: number
  durationMs: number
  generationRouteOk: boolean
}) {
  if (result.modelCount !== undefined) {
    const key = result.generationRouteOk ? 'providerTest.connectedModels' : 'providerTest.partialModels'
    return `${key}|${result.modelCount}|${result.durationMs}`
  }
  const key = result.generationRouteOk ? 'providerTest.connectedMs' : 'providerTest.partialMs'
  return `${key}|${result.durationMs}`
}

function handleResetProvider() {
  provider.reset()
  showApiKey.value = false
  testStatus.value = 'idle'
  testMessage.value = ''
  testHint.value = ''
  emit('reset-provider')
}

async function handleTestProvider() {
  if (testStatus.value === 'testing') return

  const baseUrl = (provider.state.baseUrl ?? '').trim()
  const apiKey = (provider.state.apiKey ?? '').trim()

  if (!baseUrl || !apiKey) {
    testStatus.value = 'error'
    testMessage.value = i18n.t('settings.provider.testMissing')
    testHint.value = ''
    emit('test-result', { ok: false, message: testMessage.value })
    return
  }

  testStatus.value = 'testing'
  testMessage.value = i18n.t('settings.provider.testingEndpoint', {
    base: baseUrl.replace(/\/+$/, ''),
  })
  testHint.value = ''

  try {
    const result = await testProvider({
      baseUrl,
      apiKey,
      proxyUrl: provider.state.proxyUrl ?? '',
    })
    if (result.models?.length) {
      discoveredModels.setModels(result.models)
    }
    provider.update({ imageGeneration: result.imageGeneration })
    // 先把 reactive 状态切到当前 provider 的桶，再写入这次检测到的能力，
    // 避免把 A 站的能力误记到 B 站。
    resolutionSupport.selectProvider(baseUrl)
    const capability = detectCapabilities(result.models ?? [])
    resolutionSupport.setCapabilities(capability)
    const resultMessage = formatProviderResultMessage(result)
    const resultMessageToken = providerResultMessageToken(result)
    testMessage.value = resultMessage
    const imageCount = discoveredModels.imageOnly.value.length
    if (!result.generationRouteOk) {
      testStatus.value = 'partial'
      testHint.value = i18n.t('settings.provider.partialCors')
      emit('test-result', {
        ok: false,
        message: resultMessageToken,
        code: 'PARTIAL_CORS',
      })
    } else {
      testStatus.value = 'success'
      const resHint = capability.supports4k
        ? i18n.t('settings.provider.supportsRes2k4k')
        : capability.supports2k
          ? i18n.t('settings.provider.supportsRes2k')
          : i18n.t('settings.provider.supportsRes1k')
      const capBits: string[] = []
      if (capability.supportsEdits) capBits.push(i18n.t('settings.provider.supportsEdits'))
      if (capability.supportsMask) capBits.push(i18n.t('settings.provider.supportsMask'))
      const capHint = capBits.length
        ? i18n.t('settings.provider.supportsPrefix', { features: capBits.join(' / ') })
        : ''
      const imageHint = imageCount > 0
        ? i18n.t('settings.provider.loadedModels', { count: imageCount })
        : i18n.t('settings.provider.noImageModels')
      testHint.value = [
        imageHint,
        resHint,
        capHint,
        i18n.t('settings.provider.routeOk'),
      ].filter(Boolean).join('；')
      emit('test-result', { ok: true, message: resultMessageToken })
    }
  } catch (error) {
    testStatus.value = 'error'
    if (error instanceof ApiRequestError) {
      testMessage.value = error.message
      testHint.value = inferErrorHint(error)
      emit('test-result', { ok: false, message: error.message, code: error.code })
    } else if (error instanceof Error) {
      testMessage.value = error.message
      testHint.value = ''
      emit('test-result', { ok: false, message: error.message })
    } else {
      testMessage.value = i18n.t('settings.provider.testFailed')
      testHint.value = ''
      emit('test-result', { ok: false, message: testMessage.value })
    }
  }
}

function inferErrorHint(error: ApiRequestError): string {
  if (error.code === 'NETWORK_ERROR') {
    return i18n.t('settings.provider.networkHint')
  }
  if (error.code === 'PROVIDER_NOT_CONFIGURED') {
    return ''
  }
  if (error.code === 'INVALID_API_KEY' || (error.code === 'OPENAI_REQUEST_FAILED' && /API Key/.test(error.message))) {
    return i18n.t('settings.provider.keyHint')
  }
  if (error.code === 'RATE_LIMITED') {
    return i18n.t('settings.provider.rateLimitHint')
  }
  return ''
}

watch(
  () => `${provider.state.baseUrl}::${provider.state.apiKey}`,
  () => {
    if (testStatus.value === 'success' || testStatus.value === 'error') {
      testStatus.value = 'idle'
      testMessage.value = ''
      testHint.value = ''
    }
  },
)

const formatOptions = computed<SelectOption<OutputFormat>[]>(() => [
  { value: 'png', label: 'PNG', hint: i18n.t('settings.format.pngHint') },
  { value: 'jpeg', label: 'JPEG', hint: i18n.t('settings.format.jpegHint') },
  { value: 'webp', label: 'WEBP', hint: i18n.t('settings.format.webpHint') },
])

const sizeSelectOptions = computed<SelectOption<ImageSize>[]>(() =>
  sizeOptions.map((option) => ({
    value: option.value,
    label: i18n.t(`size.${option.value}.label`),
    hint: `${option.value} · ${i18n.t(`size.${option.value}.hint`)}`,
  })),
)

const qualitySelectOptions = computed<SelectOption<ImageQuality>[]>(() =>
  qualityOptions.map((option) => ({
    value: option.value,
    label: i18n.t(`settings.quality.${option.value}`),
    hint: i18n.t(`settings.quality.${option.value}Hint`),
  })),
)

const localeSelectOptions = computed<SelectOption<LocalePreference>[]>(() => [
  { value: 'auto', label: i18n.t('locale.auto') },
  { value: 'zh-CN', label: i18n.t('locale.zh-CN') },
  { value: 'en', label: i18n.t('locale.en') },
])

const transparentBackgroundHint = computed(() =>
  props.canTransparentBackground
    ? i18n.t('settings.transparentBackground.hint')
    : props.transparentBackgroundDisabledReason || i18n.t('capability.transparentUnsupported'),
)

const streamingWaitHint = computed(() =>
  props.canStreamingWait
    ? i18n.t('settings.streamingWait.hint')
    : i18n.t('capability.streamingUnsupported'),
)

const partialPreviewHint = computed(() =>
  props.canPartialPreview
    ? i18n.t('settings.stagePreview.hint')
    : props.partialPreviewDisabledReason || i18n.t('capability.previewUnsupported'),
)

function close() {
  emit('update:open', false)
}

function clampCount(value: number) {
  if (!Number.isFinite(value)) return minCount
  return Math.min(maxCount, Math.max(minCount, Math.round(value)))
}

function adjustCount(delta: number) {
  count.value = clampCount(count.value + delta)
}

function rollSeed() {
  const next = Math.floor(Math.random() * 1_000_000)
  seed.value = String(next).padStart(6, '0')
}

function handleKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener('keydown', handleKey, { capture: true })
    } else {
      window.removeEventListener('keydown', handleKey, { capture: true })
    }
  },
  { immediate: true },
)

useFocusTrap(() => props.open, dialogRef)
useBodyLock(() => props.open)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKey, { capture: true })
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dlg-fade">
      <div
        v-if="open"
        class="mobile-sheet fixed inset-0 z-sheet flex items-end justify-center px-0 py-0 sm:items-center sm:px-4 sm:py-6"
        role="dialog"
        aria-modal="true"
        :aria-label="i18n.t('settings.title')"
      >
        <div class="scrim" aria-hidden="true"></div>

        <Transition name="dlg-zoom">
          <div
            ref="dialogRef"
            v-if="open"
            class="dialog-shell relative flex w-full max-w-xl flex-col overflow-hidden text-ink"
          >
            <header class="dialog-shell__header flex items-start justify-between gap-3 border-b border-line/40 px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <p class="display-eyebrow">{{ i18n.t('settings.eyebrow') }}</p>
                <h2 class="mt-1.5 font-display text-2xl tracking-tightish gradient-text">{{ i18n.t('settings.title') }}</h2>
              </div>
              <button type="button" class="icon-btn-sm" :aria-label="i18n.t('settings.close')" @click="close">
                <Icon name="close" :size="14" />
              </button>
            </header>

            <div class="dialog-shell__body touch-scroll-y space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
              <section
                class="surface-1 p-4"
                :class="!provider.isConfigured.value && 'ring-1 ring-ochre/30'"
              >
                <div class="mb-3 flex items-center justify-between gap-2">
                  <div class="flex flex-col">
                    <span class="display-eyebrow text-[10px]">{{ i18n.t('settings.provider.eyebrow') }}</span>
                    <span class="mt-1 text-[13px] font-medium text-ink">{{ i18n.t('settings.provider.label') }}</span>
                  </div>
                  <span
                    class="inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]"
                    :class="provider.isConfigured.value
                      ? 'bg-forest/12 text-forest'
                      : 'bg-ochre/12 text-ochre'"
                  >
                    <Icon :name="provider.isConfigured.value ? 'check' : 'warning'" :size="11" />
                    <span>{{ provider.isConfigured.value ? i18n.t('settings.provider.configured') : i18n.t('settings.provider.unconfigured') }}</span>
                  </span>
                </div>

                <p class="mb-3 text-[11px] leading-[1.6] text-muted">
                  {{ i18n.t('settings.provider.note') }}
                </p>

                <div class="mb-3 flex items-start gap-2 rounded-xl border border-line/40 bg-ivory/40 px-3 py-2 text-[11px] leading-[1.55] backdrop-blur-sm">
                  <span class="mt-0.5 inline-grid h-5 w-5 place-items-center rounded-full bg-forest/12 text-forest">
                    <Icon name="share" :size="11" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="font-medium text-ink">{{ i18n.t('settings.provider.proxyOn') }}</span>
                    <span class="ml-1 text-muted">{{ i18n.t('settings.provider.proxyOnHint') }}</span>
                    <span class="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-muted/80">
                      proxy.likeyou.qzz.io
                    </span>
                  </span>
                </div>

                <div class="space-y-3">
                  <div>
                    <label class="label mb-1.5 inline-flex items-center gap-1.5" for="set-base-url">
                      <Icon name="link" :size="12" />
                      <span>{{ i18n.t('settings.provider.baseUrl') }}</span>
                    </label>
                    <input
                      id="set-base-url"
                      v-model="provider.state.baseUrl"
                      type="url"
                      class="field-input font-mono text-[12px]"
                      placeholder="https://api.openai.com/v1"
                      autocomplete="off"
                      spellcheck="false"
                      maxlength="200"
                    />
                    <p class="mt-1 text-[10px] leading-[1.5] text-muted">
                      {{ i18n.t('settings.provider.baseUrlHint') }}
                    </p>
                  </div>

                  <div>
                    <label class="label mb-1.5 inline-flex items-center gap-1.5" for="set-api-key">
                      <Icon name="lightning" :size="12" />
                      <span>{{ i18n.t('settings.provider.apiKey') }}</span>
                    </label>
                    <div class="relative flex items-center gap-2">
                      <input
                        id="set-api-key"
                        v-model="provider.state.apiKey"
                        :type="showApiKey ? 'text' : 'password'"
                        class="field-input pr-10 font-mono text-[12px]"
                        placeholder="sk-..."
                        autocomplete="off"
                        spellcheck="false"
                        maxlength="200"
                      />
                      <button
                        type="button"
                        class="absolute right-1.5 top-1/2 inline-grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-paper-soft hover:text-ink"
                        :aria-label="showApiKey ? i18n.t('settings.provider.apiKeyHide') : i18n.t('settings.provider.apiKeyShow')"
                        :aria-pressed="showApiKey"
                        @click="showApiKey = !showApiKey"
                      >
                        <Icon :name="showApiKey ? 'eyeOff' : 'eye'" :size="14" />
                      </button>
                    </div>
                  </div>
                </div>

                <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    class="btn-quiet text-[11px]"
                    :disabled="!provider.state.baseUrl || !provider.state.apiKey || testStatus === 'testing'"
                    @click="handleTestProvider"
                  >
                    <Icon
                      :name="testStatus === 'testing' ? 'refresh' : 'pulse'"
                      :size="12"
                      :class="testStatus === 'testing' ? 'animate-spin' : ''"
                    />
                    {{ testStatus === 'testing' ? i18n.t('settings.provider.testing') : i18n.t('settings.provider.test') }}
                  </button>
                  <button
                    type="button"
                    class="btn-quiet text-[11px]"
                    :disabled="!provider.state.apiKey && !provider.state.baseUrl"
                    @click="handleResetProvider"
                  >
                    <Icon name="trash" :size="12" />
                    {{ i18n.t('settings.provider.clear') }}
                  </button>
                </div>

                <div
                  v-if="testMessage"
                  class="mt-3 rounded-xl border px-3 py-2 text-[11px] leading-[1.6]"
                  :class="{
                    'border-line/50 bg-ivory/40 text-muted': testStatus === 'testing',
                    'border-forest/35 bg-forest/10 text-forest': testStatus === 'success',
                    'border-ochre/40 bg-ochre/[0.08] text-ochre': testStatus === 'partial',
                    'border-accent/40 bg-accent/[0.08] text-accent': testStatus === 'error',
                  }"
                  role="status"
                  aria-live="polite"
                >
                  <p class="flex items-center gap-1.5 font-medium">
                    <Icon
                      :name="testStatus === 'success'
                        ? 'check'
                        : testStatus === 'partial'
                          ? 'warning'
                          : testStatus === 'error'
                            ? 'warning'
                            : 'refresh'"
                      :size="12"
                      :class="testStatus === 'testing' ? 'animate-spin' : ''"
                    />
                    <span>{{ testMessage }}</span>
                  </p>
                  <p v-if="testHint" class="mt-1 text-[10px] leading-[1.5] opacity-80">
                    {{ testHint }}
                  </p>
                </div>

                <div class="settings-capability-map">
                  <div class="settings-capability-map__head">
                    <span class="display-eyebrow text-[10px]">{{ i18n.t('settings.capability.eyebrow') }}</span>
                    <span>{{ i18n.t('settings.capability.body') }}</span>
                  </div>
                  <div class="settings-capability-grid" role="list">
                    <div
                      v-for="tile in providerCapabilityTiles"
                      :key="tile.key"
                      class="settings-capability-tile"
                      :data-state="tile.state"
                      role="listitem"
                    >
                      <span class="settings-capability-tile__icon" aria-hidden="true">
                        <Icon :name="tile.icon" :size="13" />
                      </span>
                      <span class="settings-capability-tile__copy">
                        <span class="settings-capability-tile__label">{{ tile.label }}</span>
                        <span class="settings-capability-tile__detail">{{ tile.detail }}</span>
                      </span>
                      <strong class="settings-capability-tile__state">{{ tile.stateLabel }}</strong>
                    </div>
                  </div>
                </div>
              </section>

              <section class="surface-1 p-4">
                <div class="mb-3 flex items-center justify-between gap-2">
                  <div class="flex flex-col">
                    <span class="display-eyebrow text-[10px]">{{ i18n.t('settings.image.eyebrow') }}</span>
                    <span class="mt-1 text-[13px] font-medium text-ink">{{ i18n.t('settings.image.title') }}</span>
                  </div>
                </div>

                <p class="mb-3 text-[11px] leading-[1.6] text-muted">
                  {{ i18n.t('settings.image.body') }}
                </p>

                <div class="settings-grid">
                  <div class="settings-field settings-field--wide">
                    <label class="label mb-2 inline-flex items-center gap-1.5" for="set-size">
                      <Icon name="ratio" :size="12" />
                      <span>{{ i18n.t('desktop.render.size') }}</span>
                    </label>
                    <Select
                      id="set-size"
                      v-model="size"
                      :options="sizeSelectOptions"
                      :aria-label="i18n.t('desktop.render.size')"
                    />
                    <p class="settings-field__hint">{{ i18n.t('settings.image.sizeHint') }}</p>
                  </div>

                  <div class="settings-field">
                    <span class="label mb-2 inline-flex items-center gap-1.5">
                      <Icon name="layers" :size="12" />
                      <span>{{ i18n.t('desktop.render.count') }}</span>
                    </span>
                    <div class="settings-stepper" role="group" :aria-label="i18n.t('desktop.render.count')">
                      <button
                        type="button"
                        class="settings-stepper__button"
                        :disabled="count <= minCount"
                        @click="adjustCount(-1)"
                      >
                        <Icon name="minus" :size="12" />
                      </button>
                      <span class="settings-stepper__value" aria-live="polite">{{ count }}</span>
                      <button
                        type="button"
                        class="settings-stepper__button"
                        :disabled="count >= maxCount"
                        @click="adjustCount(1)"
                      >
                        <Icon name="plus" :size="12" />
                      </button>
                    </div>
                    <p class="settings-field__hint">{{ i18n.t('settings.image.countHint') }}</p>
                  </div>

                  <div class="settings-field">
                    <label class="label mb-2 inline-flex items-center gap-1.5" for="set-quality">
                      <Icon name="star" :size="12" />
                      <span>{{ i18n.t('settings.quality') }}</span>
                    </label>
                    <Select
                      id="set-quality"
                      v-model="quality"
                      :options="qualitySelectOptions"
                      :aria-label="i18n.t('settings.quality.label')"
                    />
                  </div>

                  <div class="settings-field">
                    <label class="label mb-2 inline-flex items-center gap-1.5" for="set-format">
                      <Icon name="image" :size="12" />
                      <span>{{ i18n.t('settings.format') }}</span>
                    </label>
                    <Select
                      id="set-format"
                      v-model="outputFormat"
                      :options="formatOptions"
                      :aria-label="i18n.t('settings.format.label')"
                    />
                  </div>
                </div>

                <div class="settings-switch-list">
                  <label
                    class="settings-switch-row"
                    :class="{ 'is-disabled': !canTransparentBackground }"
                    :data-state="toggleState(transparentBackground, canTransparentBackground)"
                  >
                    <input
                      v-model="transparentBackground"
                      type="checkbox"
                      :disabled="!canTransparentBackground"
                      aria-describedby="settings-transparent-hint"
                    />
                    <span class="settings-switch-row__icon" aria-hidden="true">
                      <Icon name="image" :size="13" />
                    </span>
                    <span class="settings-switch-row__body">
                      <span class="settings-switch-row__top">
                        <span class="settings-switch-row__label">{{ i18n.t('settings.transparentBackground') }}</span>
                        <span
                          class="settings-switch-row__state"
                          :data-state="toggleState(transparentBackground, canTransparentBackground)"
                        >
                          {{ toggleStateLabel(transparentBackground, canTransparentBackground) }}
                        </span>
                      </span>
                      <span id="settings-transparent-hint" class="settings-switch-row__hint">{{ transparentBackgroundHint }}</span>
                    </span>
                  </label>

                  <label
                    class="settings-switch-row"
                    :class="{ 'is-disabled': !canStreamingWait }"
                    :data-state="toggleState(streamingWait, canStreamingWait)"
                  >
                    <input
                      v-model="streamingWait"
                      type="checkbox"
                      :disabled="!canStreamingWait"
                      aria-describedby="settings-streaming-hint"
                    />
                    <span class="settings-switch-row__icon" aria-hidden="true">
                      <Icon name="clock" :size="13" />
                    </span>
                    <span class="settings-switch-row__body">
                      <span class="settings-switch-row__top">
                        <span class="settings-switch-row__label">{{ i18n.t('settings.streamingWait') }}</span>
                        <span
                          class="settings-switch-row__state"
                          :data-state="toggleState(streamingWait, canStreamingWait)"
                        >
                          {{ toggleStateLabel(streamingWait, canStreamingWait) }}
                        </span>
                      </span>
                      <span id="settings-streaming-hint" class="settings-switch-row__hint">{{ streamingWaitHint }}</span>
                    </span>
                  </label>

                  <label
                    class="settings-switch-row"
                    :class="{ 'is-disabled': !canPartialPreview }"
                    :data-state="toggleState(partialPreview, canPartialPreview)"
                  >
                    <input
                      v-model="partialPreview"
                      type="checkbox"
                      :disabled="!canPartialPreview"
                      aria-describedby="settings-preview-hint"
                    />
                    <span class="settings-switch-row__icon" aria-hidden="true">
                      <Icon name="pulse" :size="13" />
                    </span>
                    <span class="settings-switch-row__body">
                      <span class="settings-switch-row__top">
                        <span class="settings-switch-row__label">{{ i18n.t('settings.stagePreview') }}</span>
                        <span
                          class="settings-switch-row__state"
                          :data-state="toggleState(partialPreview, canPartialPreview)"
                        >
                          {{ toggleStateLabel(partialPreview, canPartialPreview) }}
                        </span>
                      </span>
                      <span id="settings-preview-hint" class="settings-switch-row__hint">{{ partialPreviewHint }}</span>
                    </span>
                  </label>
                </div>
              </section>

              <section class="surface-1 p-4">
                <div class="mb-3 flex flex-col">
                  <span class="display-eyebrow text-[10px]">{{ i18n.t('settings.display.eyebrow') }}</span>
                  <span class="mt-1 text-[13px] font-medium text-ink">{{ i18n.t('settings.display.title') }}</span>
                  <span class="mt-1 text-[11px] leading-[1.5] text-muted">{{ i18n.t('settings.display.body') }}</span>
                </div>
                <label class="label mb-2 inline-flex items-center gap-1.5" for="set-locale">
                  <Icon name="command" :size="12" />
                  <span>{{ i18n.t('settings.locale') }}</span>
                </label>
                <Select
                  id="set-locale"
                  :model-value="i18n.preference.value"
                  :options="localeSelectOptions"
                  :aria-label="i18n.t('settings.locale.label')"
                  @update:model-value="(value) => i18n.setLocale(value)"
                />
                <p class="mt-1 text-[10px] leading-[1.5] text-muted">
                  {{ i18n.preference.value === 'auto'
                      ? i18n.t('settings.locale.auto', { name: i18n.t(`locale.${i18n.locale.value}`) })
                      : i18n.t('settings.locale.locked') }}
                </p>
              </section>

              <details class="settings-advanced surface-1 p-4">
                <summary class="settings-advanced__summary">
                  <span class="settings-advanced__summary-copy">
                    <span class="display-eyebrow text-[10px]">{{ i18n.t('settings.advanced.eyebrow') }}</span>
                    <span class="mt-1 text-[13px] font-medium text-ink">{{ i18n.t('settings.advanced.title') }}</span>
                    <span class="mt-1 text-[11px] leading-[1.5] text-muted">{{ i18n.t('settings.advanced.body') }}</span>
                  </span>
                  <Icon name="chevronDown" :size="14" class="settings-advanced__chevron" />
                </summary>

                <div class="settings-advanced__body">
                  <section>
                    <label class="label mb-2 inline-flex items-center gap-1.5" for="set-neg">
                      <Icon name="eyeOff" :size="12" />
                      <span>{{ i18n.t('settings.negative') }}</span>
                    </label>
                    <textarea
                      id="set-neg"
                      v-model="negativePrompt"
                      rows="2"
                      maxlength="400"
                      class="field-textarea"
                      :placeholder="i18n.t('settings.negative.placeholder')"
                    ></textarea>
                  </section>

                  <section>
                    <label class="label mb-2 inline-flex items-center gap-1.5" for="set-seed">
                      <Icon name="dice" :size="12" />
                      <span>{{ i18n.t('settings.seed') }}</span>
                    </label>
                    <div class="relative flex items-center gap-2">
                      <input
                        id="set-seed"
                        v-model="seed"
                        class="field-input pr-12"
                        :placeholder="i18n.t('settings.seed.placeholder')"
                        autocomplete="off"
                        spellcheck="false"
                        inputmode="numeric"
                      />
                      <button
                        type="button"
                        class="settings-seed-roll absolute right-1.5 top-1/2 inline-grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-paper-soft hover:text-ink"
                        :aria-label="i18n.t('settings.seed.roll')"
                        @click="rollSeed"
                      >
                        <Icon name="dice" :size="14" />
                      </button>
                    </div>
                  </section>

                  <section>
                    <div class="mb-2 flex items-center justify-between gap-3">
                      <span class="label inline-flex items-center gap-1.5">
                        <Icon name="lightning" :size="12" />
                        <span>{{ i18n.t('settings.creativity') }}</span>
                      </span>
                      <span class="font-mono text-[11px] tabular-nums text-ink">{{ creativity }} / 10</span>
                    </div>
                    <input
                      v-model.number="creativity"
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      class="settings-range w-full"
                      :aria-label="i18n.t('settings.creativity')"
                    />
                    <div class="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                      <span>{{ i18n.t('settings.creativity.low') }}</span>
                      <span>{{ i18n.t('settings.creativity.high') }}</span>
                    </div>
                  </section>

                  <section>
                    <div class="mb-3 flex items-center justify-between gap-2">
                      <div class="flex flex-col">
                        <span class="display-eyebrow text-[10px]">{{ i18n.t('settings.resolution.eyebrow') }}</span>
                        <span class="mt-1 text-[13px] font-medium text-ink">
                          {{ resolutionSummary }}
                        </span>
                      </div>
                    </div>

                    <p class="mb-3 text-[11px] leading-[1.6] text-muted">
                      {{ i18n.t('settings.resolution.body') }}
                    </p>

                    <div class="space-y-2">
                      <div class="settings-resolution-row">
                        <div class="flex min-w-0 items-center gap-2">
                          <Icon name="check" :size="12" class="text-muted" />
                          <span class="min-w-0 text-[12px] font-medium text-ink">{{ i18n.t('settings.resolution.twoK') }}</span>
                        </div>
                        <label class="res-toggle inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            :checked="resolutionSupport.state.manual2k === 'on'"
                            @change="(e) => resolutionSupport.setManual2k((e.target as HTMLInputElement).checked ? 'on' : 'auto')"
                          />
                          <span class="font-mono text-[10px] uppercase tracking-[0.16em]">
                            {{ tierLabel('2k') }}
                          </span>
                        </label>
                      </div>

                      <div class="settings-resolution-row">
                        <div class="flex min-w-0 items-center gap-2">
                          <Icon name="star" :size="12" class="text-muted" />
                          <span class="min-w-0 text-[12px] font-medium text-ink">{{ i18n.t('settings.resolution.fourK') }}</span>
                        </div>
                        <label class="res-toggle inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            :checked="resolutionSupport.state.manual4k === 'on'"
                            @change="(e) => resolutionSupport.setManual4k((e.target as HTMLInputElement).checked ? 'on' : 'auto')"
                          />
                          <span class="font-mono text-[10px] uppercase tracking-[0.16em]">
                            {{ tierLabel('4k') }}
                          </span>
                        </label>
                      </div>
                    </div>

                    <div v-if="capabilityBadges.length" class="mt-3 flex flex-wrap gap-1.5">
                      <span
                        v-for="badge in capabilityBadges"
                        :key="badge"
                        class="rounded-full border border-line/50 bg-ivory/60 px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-muted"
                      >
                        {{ badge }}
                      </span>
                    </div>

                    <p class="mt-2 text-[10px] leading-[1.5] text-muted">
                      {{ i18n.t('settings.resolution.note') }}
                    </p>
                  </section>
                </div>
              </details>
            </div>

            <footer
              class="dialog-shell__footer flex flex-col-reverse items-stretch gap-2 border-t border-line/40 bg-ivory/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <button
                type="button"
                class="btn-quiet justify-start gap-2 text-[12px]"
                @click="emit('reset')"
              >
                <Icon name="reset" :size="13" />
                {{ i18n.t('settings.action.reset') }}
              </button>
              <div class="settings-footer-actions">
                <button
                  type="button"
                  class="btn-secondary text-[12px]"
                  @click="emit('export')"
                >
                  <Icon name="download" :size="13" />
                  {{ i18n.t('settings.action.export') }}
                </button>
                <button
                  type="button"
                  class="btn-primary px-4 py-2.5 text-[12px] font-semibold"
                  @click="close"
                >
                  <Icon name="check" :size="13" />
                  {{ i18n.t('settings.close') }}
                </button>
              </div>
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-shell {
  max-height: min(92dvh, calc(100svh - env(safe-area-inset-top, 0px) - 0.75rem));
  border: 1px solid rgb(var(--color-line) / 0.82);
  border-radius: var(--radius-card);
  background: rgb(var(--color-surface) / 0.98);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-glass-lg), var(--shadow-inner-glass);
}

.dialog-shell__header,
.dialog-shell__footer {
  flex: 0 0 auto;
}

.dialog-shell__body {
  max-height: calc(min(92dvh, 100svh) - 9rem);
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-gutter: stable;
}

.settings-capability-map {
  display: grid;
  gap: 0.65rem;
  margin-top: 0.9rem;
  padding-top: 0.9rem;
  border-top: 1px solid rgb(var(--color-line) / 0.48);
}

.settings-capability-map__head {
  display: grid;
  gap: 0.25rem;
  color: rgb(var(--color-muted));
  font-size: 10.5px;
  line-height: 1.45;
}

.settings-capability-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
}

.settings-capability-tile {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  grid-template-areas:
    'icon copy'
    'icon state';
  gap: 0.1rem 0.55rem;
  min-width: 0;
  min-height: 58px;
  padding: 0.55rem 0.6rem;
  border: 1px solid rgb(var(--color-line) / 0.55);
  border-radius: var(--radius-field);
  background: rgb(var(--color-surface-muted) / 0.62);
}

.settings-capability-tile__icon {
  grid-area: icon;
  display: inline-grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 7px;
  background: rgb(var(--color-line) / 0.2);
  color: rgb(var(--color-muted));
}

.settings-capability-tile__copy {
  grid-area: copy;
  display: grid;
  min-width: 0;
  gap: 0.1rem;
}

.settings-capability-tile__label,
.settings-capability-tile__detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-capability-tile__label {
  color: rgb(var(--color-ink));
  font-size: 11.5px;
  font-weight: 720;
  line-height: 1.25;
}

.settings-capability-tile__detail {
  color: rgb(var(--color-muted));
  font-size: 10px;
  line-height: 1.25;
}

.settings-capability-tile__state {
  grid-area: state;
  align-self: end;
  justify-self: start;
  color: rgb(var(--color-muted));
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
  font-size: 9.5px;
  font-weight: 760;
  line-height: 1.2;
}

.settings-capability-tile[data-state='supported'] .settings-capability-tile__icon,
.settings-capability-tile[data-state='supported'] .settings-capability-tile__state {
  color: rgb(var(--color-forest));
}

.settings-capability-tile[data-state='partial'] {
  border-color: rgb(var(--color-ochre) / 0.38);
  background: rgb(var(--color-ochre) / 0.08);
}

.settings-capability-tile[data-state='partial'] .settings-capability-tile__icon,
.settings-capability-tile[data-state='partial'] .settings-capability-tile__state {
  color: rgb(var(--color-ochre));
}

.settings-capability-tile[data-state='unsupported'] {
  background: rgb(var(--color-surface-muted) / 0.5);
}

.settings-capability-tile[data-state='unsupported'] .settings-capability-tile__icon,
.settings-capability-tile[data-state='unsupported'] .settings-capability-tile__state {
  color: rgb(var(--color-clay));
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.settings-field {
  min-width: 0;
}

.settings-field--wide {
  grid-column: 1 / -1;
}

.settings-field__hint {
  margin-top: 0.35rem;
  color: rgb(var(--color-muted));
  font-size: 10px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.settings-stepper {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: stretch;
  min-height: 44px;
  overflow: hidden;
  border-radius: var(--radius-field);
  border: 1px solid rgb(var(--color-line) / 0.82);
  background: rgb(var(--color-surface) / 0.98);
  box-shadow: var(--shadow-inner-glass);
}

.settings-stepper__button {
  display: inline-grid;
  min-width: 44px;
  min-height: 44px;
  place-items: center;
  color: rgb(var(--color-muted));
  background: transparent;
  transition: background-color 160ms var(--motion-soft), color 160ms var(--motion-soft);
}

.settings-stepper__button:hover:not(:disabled),
.settings-stepper__button:focus-visible:not(:disabled) {
  color: rgb(var(--color-ink));
  background: rgb(var(--color-ivory) / 0.68);
}

.settings-stepper__button:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.settings-stepper__button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.settings-stepper__value {
  display: grid;
  min-width: 0;
  place-items: center;
  border-inline: 1px solid rgb(var(--color-line) / 0.5);
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
  font-size: 12px;
  font-weight: 700;
  color: rgb(var(--color-ink));
}

.settings-switch-list {
  display: grid;
  gap: 0.55rem;
  margin-top: 1rem;
}

.settings-switch-row {
  display: grid;
  grid-template-columns: auto 28px minmax(0, 1fr);
  align-items: center;
  gap: 0.65rem;
  min-height: 58px;
  padding: 0.62rem 0.7rem 0.62rem 0.62rem;
  border-radius: var(--radius-panel);
  border: 1px solid rgb(var(--color-line) / 0.55);
  background: rgb(var(--color-ivory) / 0.42);
  color: rgb(var(--color-ink));
  cursor: pointer;
  transition: border-color 160ms var(--motion-soft), background-color 160ms var(--motion-soft), box-shadow 180ms var(--motion-soft), transform 140ms var(--motion-press);
}

.settings-switch-row:hover:not(.is-disabled) {
  border-color: rgb(var(--color-line-strong) / 0.72);
  background: rgb(var(--color-ivory) / 0.58);
}

.settings-switch-row:focus-within {
  border-color: rgb(var(--color-accent) / 0.58);
  box-shadow: var(--focus-ring);
}

.settings-switch-row:active:not(.is-disabled) {
  transform: translateY(1px);
}

.settings-switch-row.is-disabled {
  cursor: not-allowed;
  border-color: rgb(var(--color-line) / 0.68);
  background: rgb(var(--color-surface-muted) / 0.7);
}

.settings-switch-row input[type='checkbox'] {
  appearance: none;
  position: relative;
  flex: 0 0 auto;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-paper-soft));
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease;
}

.settings-switch-row input[type='checkbox']::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: rgb(var(--color-ivory));
  box-shadow: 0 1px 2px rgb(var(--color-ink) / 0.18);
  transition: transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.settings-switch-row input[type='checkbox']:checked {
  border-color: rgb(var(--color-forest));
  background: rgb(var(--color-forest));
}

.settings-switch-row input[type='checkbox']:checked::after {
  transform: translateX(16px);
}

.settings-switch-row input[type='checkbox']:disabled {
  cursor: not-allowed;
}

.settings-switch-row input[type='checkbox']:focus-visible {
  outline: none;
}

.settings-switch-row__icon {
  display: inline-grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 8px;
  background: rgb(var(--color-line) / 0.18);
  color: rgb(var(--color-muted));
}

.settings-switch-row[data-state='on'] .settings-switch-row__icon,
.settings-switch-row[data-state='on'] .settings-switch-row__state {
  color: rgb(var(--color-forest));
}

.settings-switch-row[data-state='blocked'] .settings-switch-row__icon,
.settings-switch-row[data-state='blocked'] .settings-switch-row__state {
  color: rgb(var(--color-ochre));
}

.settings-switch-row__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.22rem;
}

.settings-switch-row__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  gap: 0.55rem;
}

.settings-switch-row__label {
  min-width: 0;
  overflow: hidden;
  color: rgb(var(--color-ink));
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-switch-row__state {
  flex: 0 0 auto;
  color: rgb(var(--color-muted));
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
  font-size: 9.5px;
  font-weight: 760;
  line-height: 1.2;
}

.settings-switch-row__hint {
  color: rgb(var(--color-muted));
  font-size: 10.5px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.settings-advanced {
  overflow: hidden;
}

.settings-advanced__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 44px;
  cursor: pointer;
}

.settings-advanced__summary:focus-visible {
  outline: none;
  border-radius: var(--radius-field);
  box-shadow: var(--focus-ring);
}

.settings-advanced__summary-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.settings-advanced__chevron {
  flex: 0 0 auto;
  color: rgb(var(--color-muted));
  transition: transform 180ms var(--motion-soft);
}

.settings-advanced[open] .settings-advanced__chevron {
  transform: rotate(180deg);
}

.settings-advanced__body {
  display: grid;
  gap: 1rem;
  padding-top: 1rem;
}

.settings-resolution-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 48px;
  border-radius: var(--radius-panel);
  border: 1px solid rgb(var(--color-line) / 0.4);
  background: rgb(var(--color-ivory) / 0.4);
  padding: 0.55rem 0.75rem;
}

.settings-footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.settings-seed-roll:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

@media (max-width: 639px) {
  .mobile-sheet {
    padding-top: max(env(safe-area-inset-top, 0px), 0.5rem);
  }

  .dialog-shell {
    max-height: calc(var(--mobile-viewport-height, 100dvh) - max(env(safe-area-inset-top, 0px), 0.5rem));
    border-bottom: 0;
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .dialog-shell__header {
    padding: 1rem 1rem 0.85rem;
  }

  .dialog-shell__body {
    max-height: none;
    flex: 1 1 auto;
    padding: 1rem;
  }

  .dialog-shell__footer {
    padding: 0.85rem 1rem calc(env(safe-area-inset-bottom, 0px) + 0.85rem);
  }

  .dialog-shell__footer .btn-quiet,
  .dialog-shell__footer .btn-secondary {
    min-height: 44px;
    justify-content: center;
  }

  .settings-footer-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .settings-footer-actions .btn-primary,
  .settings-footer-actions .btn-secondary {
    width: 100%;
    min-height: 44px;
  }

  .settings-capability-grid {
    grid-template-columns: 1fr;
  }

  .settings-grid {
    grid-template-columns: 1fr;
    gap: 0.85rem;
  }

  .settings-field--wide {
    grid-column: auto;
  }

  .settings-switch-row {
    grid-template-columns: auto 30px minmax(0, 1fr);
    align-items: center;
    min-height: 56px;
  }

  .settings-switch-row input[type='checkbox'] {
    min-width: 44px;
    min-height: 24px;
  }

  .settings-switch-row__top {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.2rem;
  }

  .settings-resolution-row {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.55rem;
  }

  .settings-resolution-row .res-toggle {
    min-height: 44px;
    justify-content: space-between;
  }

  .settings-seed-roll {
    width: 44px;
    height: 44px;
  }

  .settings-range {
    height: 40px;
  }

  .settings-range::-webkit-slider-runnable-track {
    height: 6px;
  }

  .settings-range::-webkit-slider-thumb {
    width: 26px;
    height: 26px;
    margin-top: -10px;
  }

  .settings-range::-moz-range-track {
    height: 6px;
  }

  .settings-range::-moz-range-thumb {
    width: 26px;
    height: 26px;
  }
}

.settings-range {
  height: 28px;
  appearance: none;
  background: transparent;
}

.settings-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgb(var(--color-forest)), rgb(var(--color-ochre)));
  box-shadow: inset 0 1px 0 rgb(var(--color-ink) / 0.08);
}

.settings-range::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  margin-top: -7px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-ivory));
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent);
}

.settings-range::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgb(var(--color-forest)), rgb(var(--color-ochre)));
}

.settings-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-ivory));
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent);
}

.res-toggle input[type='checkbox'] {
  appearance: none;
  width: 32px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-paper-soft));
  position: relative;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease;
}

.res-toggle input[type='checkbox']::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: rgb(var(--color-ivory));
  box-shadow: 0 1px 2px rgb(var(--color-ink) / 0.18);
  transition: transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.res-toggle input[type='checkbox']:checked {
  background: rgb(var(--color-forest));
  border-color: rgb(var(--color-forest));
}

.res-toggle input[type='checkbox']:checked::after {
  transform: translateX(13px);
}

.dlg-fade-enter-from,
.dlg-fade-leave-to {
  opacity: 0;
}
.dlg-fade-enter-active,
.dlg-fade-leave-active {
  transition: opacity 0.24s ease-out;
}

.dlg-zoom-enter-from {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
}
.dlg-zoom-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
.dlg-zoom-enter-active,
.dlg-zoom-leave-active {
  transition: opacity 0.24s ease-out, transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .dlg-fade-enter-active,
  .dlg-fade-leave-active,
  .dlg-zoom-enter-active,
  .dlg-zoom-leave-active {
    transition: none;
  }
}
</style>
