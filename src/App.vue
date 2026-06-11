<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { resolveImageSource } from './api'
import { autoModelSentinel, customModelSentinel, qualityOptions, sizeOptions, sizeTierById } from './presets'
import { clearDraft, clearHistory, hydrateHistoryImages, loadDraft, loadHistory } from './storage'
import type {
  ChatMessage,
  ChatProgressOverride,
  ChatUserMessage,
  ContinuationContext,
  GeneratedImage,
  GenerateImageRequest,
  GenerationHistoryItem,
  ImageQuality,
  ImageSize,
  ImageStyle,
  ReferenceImageAttachment,
} from './types'
import { createId } from './lib/id'
import { payloadToMeta } from './lib/chatMessage'
import AppHeader from './components/AppHeader.vue'
import Icon from './components/Icon.vue'
import Toaster from './components/Toaster.vue'
import Select, { type SelectOption } from './components/Select.vue'
import { useToast } from './composables/useToast'
import { useTheme } from './composables/useTheme'
import { useLightbox } from './composables/useLightbox'
import { useProviderConfig } from './composables/useProviderConfig'
import { useDiscoveredModels } from './composables/useDiscoveredModels'
import { useResolutionSupport } from './composables/useResolutionSupport'
import { useVibration } from './composables/useVibration'
import { useReferenceImages } from './composables/useReferenceImages'
import { useImagePriming } from './composables/useImagePriming'
import { useDownloadImage } from './composables/useDownloadImage'
import { useDraftAutoSave } from './composables/useDraftAutoSave'
import { useMobileViewport } from './composables/useMobileViewport'
import { useHealthCheck } from './composables/useHealthCheck'
import { useGenerationFlow } from './composables/useGenerationFlow'
import { useMediaQuery } from './composables/useMediaQuery'
import { useShortcutsDialog } from './composables/useShortcutsDialog'
import { usePromptTree } from './composables/usePromptTree'
import { useOnboarding } from './composables/useOnboarding'
import { useServiceWorker } from './composables/useServiceWorker'
import { useI18n } from './lib/i18n'
import { lookupModelCapability } from './lib/modelCapabilities'

type OutputFormat = NonNullable<GenerateImageRequest['outputFormat']>

const loadPromptComposer = () => import('./components/PromptComposer.vue')
const loadCanvasStage = () => import('./components/CanvasStage.vue')
const loadChatStream = () => import('./components/ChatStream.vue')
const loadChatDock = () => import('./components/ChatDock.vue')
const loadSettingsDialog = () => import('./components/SettingsDialog.vue')
const loadHistoryDialog = () => import('./components/HistoryDialog.vue')
const loadLightbox = () => import('./components/Lightbox.vue')
const loadActivitySidebar = () => import('./components/ActivitySidebar.vue')
const loadShortcutsDialog = () => import('./components/ShortcutsDialog.vue')
const loadOnboardingTour = () => import('./components/OnboardingTour.vue')

const PromptComposer = defineAsyncComponent(loadPromptComposer)
const CanvasStage = defineAsyncComponent(loadCanvasStage)
const ChatStream = defineAsyncComponent(loadChatStream)
const ChatDock = defineAsyncComponent(loadChatDock)
const SettingsDialog = defineAsyncComponent(loadSettingsDialog)
const HistoryDialog = defineAsyncComponent(loadHistoryDialog)
const Lightbox = defineAsyncComponent(loadLightbox)
const ActivitySidebar = defineAsyncComponent(loadActivitySidebar)
const ShortcutsDialog = defineAsyncComponent(loadShortcutsDialog)
const OnboardingTour = defineAsyncComponent(loadOnboardingTour)

const defaultPromptByLocale = {
  'zh-CN': '一只穿着复古宇航服的橘猫，站在月球摄影棚里，像 1970 年代科幻电影海报',
  en: 'An orange cat in a retro spacesuit, standing in a moon studio, like a 1970s sci-fi movie poster',
} as const
const defaultNegativePromptByLocale = {
  'zh-CN': '低清晰度、模糊、水印、错误文字、畸形手指、画面杂乱',
  en: 'low resolution, blur, watermark, incorrect text, malformed fingers, cluttered composition',
} as const
const legacyDefaultPrompt = defaultPromptByLocale['zh-CN']
const legacyDefaultNegativePrompt = defaultNegativePromptByLocale['zh-CN']

const prompt = ref<string>(legacyDefaultPrompt)
const negativePrompt = ref<string>(legacyDefaultNegativePrompt)
const style = ref<ImageStyle>('raw')
const size = ref<ImageSize>('1024x1024')
const count = ref(1)
const outputFormat = ref<GenerateImageRequest['outputFormat']>('png')
const quality = ref<ImageQuality>('auto')
const creativity = ref(7)
const seed = ref('')
const modelChoice = ref<string>(autoModelSentinel)
const customModel = ref<string>('')
const transparentBackground = ref(false)
const streamingWait = ref(true)
const partialPreview = ref(true)
const images = shallowRef<GeneratedImage[]>([])
const activeImageIndex = ref(0)
const isGenerating = ref(false)
const errorMessage = ref('')
const lastRequestId = ref('')
const generationProgressOverride = ref<ChatProgressOverride | undefined>(undefined)
const elapsedSeconds = ref(0)
const history = shallowRef<GenerationHistoryItem[]>(loadHistory())

const toast = useToast()
const { theme, toggle: toggleTheme } = useTheme()
const lightbox = useLightbox()
const provider = useProviderConfig()
const discoveredModels = useDiscoveredModels()
const resolutionSupport = useResolutionSupport()
// Capability state is scoped per provider baseUrl. Re-point the active bucket
// whenever the configured endpoint changes so a new relay never inherits the
// previous one's unlocked tiers. `immediate` seeds the correct bucket on load.
watch(
  () => provider.state.baseUrl,
  (baseUrl) => resolutionSupport.selectProvider(baseUrl),
  { immediate: true },
)
const { vibrate } = useVibration()
const settingsOpen = ref(false)
const historyOpen = ref(false)
const shortcutsDialog = useShortcutsDialog()
const onboarding = useOnboarding()
const sw = useServiceWorker()
const { t, locale } = useI18n()
const localizedDefaultPrompt = computed(() => t('defaults.prompt'))
const localizedDefaultNegativePrompt = computed(() => t('defaults.negativePrompt'))
const composerRef = ref<{ focusPrompt?: () => void } | null>(null)
const chatDockRef = ref<{ focusInput?: () => void } | null>(null)
const chatStreamRef = ref<{ scrollToMessage?: (id: string) => void; scrollToBottom?: (smooth?: boolean) => void } | null>(null)
const messages = shallowRef<ChatMessage[]>([])
const pendingContinuation = ref<ContinuationContext | null>(null)
const mobileDockHeight = ref(180)

const promptTree = usePromptTree()
let suppressTreeAutoCommit = false

const { viewportHeight: mobileViewportHeight, keyboardInset: mobileKeyboardInset } = useMobileViewport()
const isDesktop = useMediaQuery('(min-width: 1024px)')
const isWideDesktop = useMediaQuery('(min-width: 1280px)')
const refImages = useReferenceImages({ toast })
const referenceImages = refImages.items
const addReferenceImages = refImages.add
const removeReferenceImage = refImages.remove
const clearComposerReferenceImages = refImages.clear
const { primeGeneratedImages } = useImagePriming()
const { download: downloadImage } = useDownloadImage({ provider, toast, outputFormat })
const health = useHealthCheck({ provider, discoveredModels, toast })
const healthStatus = health.status
const healthMessage = health.message
const refreshHealth = health.refresh
const handleProviderTestResult = health.handleTestResult

const mobileDockKeyboardInset = computed(() => mobileKeyboardInset.value)
const mobileChatBottomPadding = computed(() => {
  // ChatDock is `position: fixed`, so its height does not push ChatStream.
  // We still need padding inside the scroll container so the last message
  // is not hidden behind the dock. Add the keyboard inset only when actually
  // visible — keeps the resting layout calm.
  return Math.max(140, mobileDockHeight.value + mobileKeyboardInset.value + 24)
})
const mobileJumpButtonBottom = computed(() => {
  return Math.max(18, mobileDockHeight.value + mobileKeyboardInset.value + 14)
})
const mobileRootStyle = computed(() => ({
  '--mobile-dock-height': `${mobileDockHeight.value}px`,
  '--mobile-keyboard-inset': `${mobileKeyboardInset.value}px`,
  '--mobile-chat-bottom-padding': `${mobileChatBottomPadding.value}px`,
}))

const restoredDraft = loadDraft()

if (restoredDraft) {
  if (typeof restoredDraft.prompt === 'string') {
    prompt.value = restoredDraft.prompt
  }
  if (typeof restoredDraft.negativePrompt === 'string') negativePrompt.value = restoredDraft.negativePrompt
  if (
    sizeOptions.some((option) => option.value === restoredDraft.size) &&
    resolutionSupport.isTierUnlocked(sizeTierById.get(restoredDraft.size as ImageSize) ?? '1k')
  ) {
    size.value = restoredDraft.size as ImageSize
  }
  if (typeof restoredDraft.count === 'number' && Number.isInteger(restoredDraft.count) && restoredDraft.count >= 1 && restoredDraft.count <= 4) count.value = restoredDraft.count
  if (restoredDraft.outputFormat === 'png' || restoredDraft.outputFormat === 'jpeg' || restoredDraft.outputFormat === 'webp') outputFormat.value = restoredDraft.outputFormat
  if (qualityOptions.some((option) => option.value === restoredDraft.quality)) quality.value = restoredDraft.quality as ImageQuality
  if (typeof restoredDraft.creativity === 'number' && restoredDraft.creativity >= 1 && restoredDraft.creativity <= 10) creativity.value = restoredDraft.creativity
  if (typeof restoredDraft.seed === 'string') seed.value = restoredDraft.seed
  if (typeof restoredDraft.modelChoice === 'string' && (restoredDraft.modelChoice === autoModelSentinel || discoveredModels.mergedModelOptions.value.some((option) => option.value === restoredDraft.modelChoice))) {
    modelChoice.value = restoredDraft.modelChoice
  }
  if (typeof restoredDraft.customModel === 'string') customModel.value = restoredDraft.customModel
  if (typeof restoredDraft.transparentBackground === 'boolean') transparentBackground.value = restoredDraft.transparentBackground
  if (typeof restoredDraft.streamingWait === 'boolean') streamingWait.value = restoredDraft.streamingWait
  if (typeof restoredDraft.partialPreview === 'boolean') partialPreview.value = restoredDraft.partialPreview
} else {
  prompt.value = localizedDefaultPrompt.value
  negativePrompt.value = localizedDefaultNegativePrompt.value
}

useDraftAutoSave({
  prompt, negativePrompt, style, size, count, outputFormat, quality, creativity, seed, modelChoice, customModel, transparentBackground, partialPreview, streamingWait,
})

const selectedQualityLabel = computed(() => t(`settings.quality.${quality.value}`))
const selectedModelLabel = computed(() => {
  if (modelChoice.value === customModelSentinel) {
    const trimmed = customModel.value.trim()
    return trimmed ? trimmed : ''
  }
  const match = discoveredModels.mergedModelOptions.value.find((option) => option.value === modelChoice.value)
  if (match) return match.label
  return modelChoice.value.trim()
})
const canEditImages = computed(() =>
  provider.isConfigured.value
  && (
    provider.state.imageGeneration.imageEdit === 'supported'
    || resolutionSupport.state.supportsEdits
  ),
)
const editDisabledReason = computed(() =>
  provider.isConfigured.value
    ? t('capability.editUnsupported')
    : t('capability.configureFirst'),
)
const canUseStreamingWait = computed(() =>
  provider.isConfigured.value
  && provider.state.imageGeneration.sseStream === 'supported',
)
const canUsePartialPreview = computed(() =>
  canUseStreamingWait.value
  && provider.state.imageGeneration.partialPreview === 'supported',
)
const canUseTransparentBackground = computed(() =>
  provider.isConfigured.value
  && provider.state.imageGeneration.transparentBackground === 'supported'
  && outputFormat.value === 'png',
)
const transparentBackgroundDisabledReason = computed(() =>
  outputFormat.value !== 'png'
    ? t('capability.transparentPngOnly')
    : t('capability.transparentUnsupported'),
)
const partialPreviewDisabledReason = computed(() =>
  canUseStreamingWait.value
    ? t('capability.previewUnsupported')
    : t('capability.streamingUnsupported'),
)
const selectedExplicitModel = computed(() => {
  if (modelChoice.value === customModelSentinel) return customModel.value.trim()
  if (modelChoice.value === autoModelSentinel || modelChoice.value === '') return ''
  return modelChoice.value.trim()
})
const selectedModelWarning = computed(() => {
  const model = selectedExplicitModel.value
  if (!model) return ''

  const capability = lookupModelCapability(model)
  if (!capability) return t('model.warningUnknown')

  if (referenceImages.value.length > 0 && !capability.supportsEdits) {
    return t('model.warningEdit')
  }

  const selectedTier = sizeTierById.get(size.value) ?? '1k'
  const tierRank = { '1k': 0, '2k': 1, '4k': 2 } as const
  if (tierRank[selectedTier] > tierRank[capability.maxTier]) {
    return t('model.warningSize', { tier: capability.maxTier.toUpperCase() })
  }

  return ''
})
const trimmedPrompt = computed(() => prompt.value.trim())
const canGenerate = computed(
  () =>
    trimmedPrompt.value.length >= 4
    && !isGenerating.value,
)
const promptPreview = computed(() => trimmedPrompt.value.split('\n')[0]?.slice(0, 64) ?? '')

watch(
  [outputFormat, canUseTransparentBackground],
  () => {
    if (outputFormat.value !== 'png' || !canUseTransparentBackground.value) {
      transparentBackground.value = false
    }
  },
)

watch(canUsePartialPreview, (supported) => {
  if (!supported) partialPreview.value = false
})

watch(canUseStreamingWait, (supported) => {
  if (!supported) streamingWait.value = false
})

const healthStatusLabel = computed(() => {
  if (healthStatus.value === 'online') return t('header.healthOnline')
  if (healthStatus.value === 'offline') return t('header.healthOffline')
  return t('header.healthChecking')
})
const displayHealthMessage = computed(() => {
  const message = healthMessage.value
  if (!message) {
    return provider.isConfigured.value ? healthStatusLabel.value : t('desktop.status.unconfigured')
  }
  if (message.startsWith('health.')) return t(message)
  if (message.startsWith('providerTest.')) {
    const [key, first, second] = message.split('|')
    if (second !== undefined) return t(key, { count: first, ms: second })
    if (first !== undefined) return t(key, { ms: first })
  }
  return message
})

type DesktopCapabilityState = 'supported' | 'unsupported' | 'partial' | 'pending'

interface DesktopCapabilityItem {
  key: string
  label: string
  detail: string
  state: DesktopCapabilityState
  stateLabel: string
}

const desktopResolutionSupportLabel = computed(() => {
  if (!provider.isConfigured.value) return t('desktop.capabilities.pendingDetail')
  if (resolutionSupport.unlocked4k.value) return t('settings.resolution.unlocked4k')
  if (resolutionSupport.unlocked2k.value) return t('settings.resolution.unlocked2k')
  return t('settings.resolution.only1k')
})
const desktopFormatSupportLabel = computed(() => {
  if (!provider.isConfigured.value) return t('desktop.capabilities.pendingDetail')
  const formats = resolutionSupport.state.outputFormats.length
    ? resolutionSupport.state.outputFormats
    : ['png']
  return formats.map((format) => format.toUpperCase()).join(' / ')
})
const desktopGenerationModeLabel = computed(() => {
  if (!provider.isConfigured.value) return t('desktop.capabilities.pendingDetail')
  switch (provider.state.imageGeneration.generationMode) {
    case 'images_generations':
      return t('desktop.capabilities.modeImages')
    case 'responses_tool':
      return t('desktop.capabilities.modeResponses')
    case 'responses_text_data_url':
      return t('desktop.capabilities.modeResponsesData')
    default:
      return t('desktop.capabilities.modeAuto')
  }
})
const desktopCurrentFormatLabel = computed(() => outputFormat.value.toUpperCase())
const desktopSizeOptions = computed<SelectOption<ImageSize>[]>(() =>
  sizeOptions.map((option) => ({
    value: option.value,
    label: t(`size.${option.value}.label`),
    hint: `${option.value} · ${t(`size.${option.value}.hint`)}`,
  })),
)
const desktopQualityOptions = computed<SelectOption<ImageQuality>[]>(() =>
  qualityOptions.map((option) => ({
    value: option.value,
    label: t(`settings.quality.${option.value}`),
  })),
)
const desktopFormatOptions = computed<SelectOption<OutputFormat>[]>(() => [
  { value: 'png', label: 'PNG', hint: t('settings.format.pngHint') },
  { value: 'jpeg', label: 'JPEG', hint: t('settings.format.jpegHint') },
  { value: 'webp', label: 'WEBP', hint: t('settings.format.webpHint') },
])
const generationSettingsSummary = computed(() =>
  [
    size.value,
    desktopCurrentFormatLabel.value,
    selectedQualityLabel.value,
    `${count.value}x`,
  ].join(' / '),
)
const desktopCapabilitySummary = computed(() => {
  if (!provider.isConfigured.value) return t('desktop.capabilities.pending')
  const bits = [
    canEditImages.value ? t('desktop.capabilities.imageEdit') : '',
    desktopResolutionSupportLabel.value,
    desktopFormatSupportLabel.value,
  ].filter(Boolean)
  return bits.join(' · ')
})
const desktopTransparentDetail = computed(() => {
  if (!provider.isConfigured.value) return t('desktop.capabilities.pendingDetail')
  if (provider.state.imageGeneration.transparentBackground !== 'supported') {
    return t('desktop.capabilities.requiresProvider')
  }
  return outputFormat.value === 'png'
    ? t('desktop.capabilities.currentFormat', { value: desktopCurrentFormatLabel.value })
    : t('desktop.capabilities.requiresPng')
})

function desktopCapabilityStateLabel(state: DesktopCapabilityState): string {
  if (state === 'supported') return t('desktop.capabilities.supported')
  if (state === 'partial') return t('desktop.capabilities.limited')
  if (state === 'pending') return t('desktop.capabilities.pending')
  return t('desktop.capabilities.unsupported')
}

function configuredCapabilityState(supported: boolean): DesktopCapabilityState {
  if (!provider.isConfigured.value) return 'pending'
  return supported ? 'supported' : 'unsupported'
}

const desktopCapabilityItems = computed<DesktopCapabilityItem[]>(() => {
  const generationState = configuredCapabilityState(provider.state.imageGeneration.textToImage === 'supported')
  const editState = configuredCapabilityState(canEditImages.value)
  const streamingState = configuredCapabilityState(canUseStreamingWait.value)
  const previewState = configuredCapabilityState(canUsePartialPreview.value)
  const qualityState = configuredCapabilityState(resolutionSupport.state.supportsQuality)
  const detailFor = (state: DesktopCapabilityState, supportedDetail: string) => {
    if (state === 'pending') return t('desktop.capabilities.pendingDetail')
    if (state === 'supported' || state === 'partial') return supportedDetail
    return t('desktop.capabilities.requiresProvider')
  }
  const transparentState: DesktopCapabilityState = !provider.isConfigured.value
    ? 'pending'
    : provider.state.imageGeneration.transparentBackground !== 'supported'
      ? 'unsupported'
      : outputFormat.value === 'png'
        ? 'supported'
        : 'partial'
  const supportState: DesktopCapabilityState = provider.isConfigured.value ? 'supported' : 'pending'

  return [
    {
      key: 'generation',
      label: t('desktop.capabilities.imageGeneration'),
      detail: detailFor(generationState, desktopGenerationModeLabel.value),
      state: generationState,
      stateLabel: desktopCapabilityStateLabel(generationState),
    },
    {
      key: 'edit',
      label: t('desktop.capabilities.imageEdit'),
      detail: detailFor(
        editState,
        resolutionSupport.state.supportsMask
          ? t('desktop.capabilities.withMask')
          : t('desktop.capabilities.referenceEdit'),
      ),
      state: editState,
      stateLabel: desktopCapabilityStateLabel(editState),
    },
    {
      key: 'streaming',
      label: t('desktop.capabilities.streaming'),
      detail: detailFor(streamingState, t('desktop.capabilities.streamingDetail')),
      state: streamingState,
      stateLabel: desktopCapabilityStateLabel(streamingState),
    },
    {
      key: 'preview',
      label: t('desktop.capabilities.preview'),
      detail: detailFor(previewState, t('desktop.capabilities.previewDetail')),
      state: previewState,
      stateLabel: desktopCapabilityStateLabel(previewState),
    },
    {
      key: 'transparent',
      label: t('desktop.capabilities.transparent'),
      detail: desktopTransparentDetail.value,
      state: transparentState,
      stateLabel: desktopCapabilityStateLabel(transparentState),
    },
    {
      key: 'resolution',
      label: t('desktop.capabilities.resolution'),
      detail: desktopResolutionSupportLabel.value,
      state: supportState,
      stateLabel: desktopCapabilityStateLabel(supportState),
    },
    {
      key: 'format',
      label: t('desktop.capabilities.formats'),
      detail: desktopFormatSupportLabel.value,
      state: supportState,
      stateLabel: desktopCapabilityStateLabel(supportState),
    },
    {
      key: 'quality',
      label: t('desktop.capabilities.quality'),
      detail: detailFor(qualityState, t('desktop.capabilities.currentQuality', { value: selectedQualityLabel.value })),
      state: qualityState,
      stateLabel: desktopCapabilityStateLabel(qualityState),
    },
  ]
})

const desktopTransparentHint = computed(() =>
  canUseTransparentBackground.value
    ? t('settings.transparentBackground.hint')
    : transparentBackgroundDisabledReason.value,
)
const desktopStreamingHint = computed(() =>
  canUseStreamingWait.value
    ? t('settings.streamingWait.hint')
    : t('capability.streamingUnsupported'),
)
const desktopPartialPreviewHint = computed(() =>
  canUsePartialPreview.value
    ? t('settings.stagePreview.hint')
    : partialPreviewDisabledReason.value,
)

function adjustGenerationCount(delta: number) {
  count.value = Math.min(4, Math.max(1, count.value + delta))
}

function rollSeed() {
  const next = Math.floor(Math.random() * 1_000_000)
  seed.value = String(next).padStart(6, '0')
}

function selectedModelRequestFields(): Pick<GenerateImageRequest, 'model' | 'modelSelection'> {
  if (modelChoice.value === autoModelSentinel) {
    return { modelSelection: 'auto' }
  }

  if (modelChoice.value === '') {
    return { modelSelection: 'none' }
  }

  const model = modelChoice.value === customModelSentinel
    ? customModel.value.trim()
    : modelChoice.value.trim()

  return {
    modelSelection: 'explicit',
    model: model || undefined,
  }
}

function buildPayload(): GenerateImageRequest {
  return {
    prompt: trimmedPrompt.value,
    style: style.value,
    size: size.value,
    count: count.value,
    outputFormat: outputFormat.value,
    negativePrompt: negativePrompt.value.trim() || undefined,
    quality: quality.value,
    creativity: creativity.value,
    seed: seed.value.trim() || undefined,
    ...selectedModelRequestFields(),
    transparentBackground: transparentBackground.value && canUseTransparentBackground.value,
    streamingWait: streamingWait.value && canUseStreamingWait.value,
    stream: streamingWait.value && canUseStreamingWait.value,
    partialPreview: partialPreview.value && canUsePartialPreview.value,
    partialImages: partialPreview.value && canUsePartialPreview.value ? 2 : 0,
    referenceImages: referenceImages.value.length ? referenceImages.value.slice() : undefined,
  }
}

const generation = useGenerationFlow({
  messages, images, activeImageIndex, elapsedSeconds, errorMessage, lastRequestId, generationProgressOverride,
  isGenerating, history, settingsOpen, toast, vibrate, primeGeneratedImages,
})
const { runGeneration } = generation

function handleAbortGeneration() {
  generation.abortGeneration()
}

function notifyImageEditUnavailable(reason = editDisabledReason.value) {
  toast.info(t('capability.editUnavailableTitle'), reason)
}

function openImageEditor(targetImages: GeneratedImage[], index: number) {
  if (!canEditImages.value) {
    notifyImageEditUnavailable()
    return
  }
  lightbox.openForEdit(targetImages, index)
}

function openActiveImageEditor(index: number) {
  openImageEditor(images.value, index)
}

async function fetchContinuationBlob(source: string): Promise<Blob> {
  try {
    const response = await fetch(source)
    if (response.ok) return await response.blob()
  } catch {}

  const proxyUrl = (provider.snapshot().proxyUrl || '').trim().replace(/\/+$/, '')
  if (!proxyUrl || /^(data|blob):/i.test(source)) {
    throw new Error('Image read failed')
  }

  const url = new URL(source)
  const upstreamBase = `${url.protocol}//${url.host}`
  const response = await fetch(`${proxyUrl}${url.pathname}${url.search}`, {
    headers: { 'X-Upstream-Base': upstreamBase },
  })

  if (!response.ok) {
    throw new Error('Proxy read failed')
  }

  return await response.blob()
}

function handleScrollToMessage(id: string) {
  vibrate('tap')
  chatStreamRef.value?.scrollToMessage?.(id)
}

function handleCancelContinuation() {
  vibrate('tap')
  pendingContinuation.value = null
  clearComposerReferenceImages()
  toast.info(t('toast.continueCancelled'), t('toast.continueCancelledHint'))
}

// Inpaint: user painted a mask in the lightbox and described what the selected
// region should become. We fetch the source image as a File, attach it as the
// single reference image, attach the mask PNG, and run a one-off /images/edits
// request. The mask + source must travel together (validation enforces exactly
// one reference image when a mask is present).
async function handleInpaintSubmit(payload: {
  mask: Blob
  prompt: string
  imageSrc: string
  imageIndex: number
}) {
  if (!canEditImages.value) {
    notifyImageEditUnavailable()
    return
  }

  const trimmed = payload.prompt.trim()
  if (!trimmed) {
    toast.error(t('toast.inpaintPromptEmpty'), t('toast.inpaintPromptEmptyHint'))
    return
  }

  if (healthStatus.value === 'offline') {
    toast.error(t('toast.apiUnconfigured'), t('toast.apiUnconfiguredHint'))
    return
  }

  if (isGenerating.value) {
    toast.info(t('toast.generatingWait'))
    return
  }

  vibrate('tap')
  const preparingId = toast.info(t('toast.inpaintPreparing'), t('toast.inpaintPreparingHint'))

  let sourceFile: File
  try {
    const blob = await fetchContinuationBlob(payload.imageSrc)
    const mimeType = (blob.type || 'image/png').split(';')[0] || 'image/png'
    const ext = mimeType.split('/')[1] || 'png'
    sourceFile = new File([blob], `inpaint-source-${Date.now()}.${ext}`, { type: mimeType })
  } catch (err) {
    toast.dismiss(preparingId)
    console.error('Inpaint source fetch failed:', err)
    toast.error(t('toast.inpaintSourceFailed'), t('toast.inpaintSourceFailedHint'))
    return
  }

  toast.dismiss(preparingId)

  const sourcePreview = URL.createObjectURL(sourceFile)
  const referenceImage: ReferenceImageAttachment = {
    id: createId(),
    name: sourceFile.name,
    mimeType: sourceFile.type,
    sizeBytes: sourceFile.size,
    previewUrl: sourcePreview,
    file: sourceFile,
  }

  const inpaintPayload: GenerateImageRequest = {
    prompt: trimmed,
    style: style.value,
    size: size.value,
    count: count.value,
    outputFormat: outputFormat.value,
    negativePrompt: negativePrompt.value.trim() || undefined,
    quality: quality.value,
    creativity: creativity.value,
    seed: seed.value.trim() || undefined,
    ...selectedModelRequestFields(),
    transparentBackground: transparentBackground.value && canUseTransparentBackground.value,
    streamingWait: streamingWait.value && canUseStreamingWait.value,
    stream: streamingWait.value && canUseStreamingWait.value,
    partialPreview: partialPreview.value && canUsePartialPreview.value,
    partialImages: partialPreview.value && canUsePartialPreview.value ? 2 : 0,
    referenceImages: [referenceImage],
    inpaintMask: payload.mask,
  }

  const userId = createId()
  messages.value = [
    ...messages.value,
    {
      id: userId,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
      meta: payloadToMeta(inpaintPayload),
      referenceImages: [referenceImage],
    },
  ]

  try {
    await runGeneration({ payload: inpaintPayload, userMessageId: userId })
  } finally {
    URL.revokeObjectURL(sourcePreview)
  }
}

function handleTreeUndo() {
  const node = promptTree.undo()
  if (!node) {
    toast.info(t('toast.treeNoEarlier'))
    return
  }
  suppressTreeAutoCommit = true
  prompt.value = node.prompt
  vibrate('tap')
  toast.info(t('toast.treeUndo'), node.label)
}

function handleTreeRedo() {
  const node = promptTree.redo()
  if (!node) {
    toast.info(t('toast.treeNoLater'))
    return
  }
  suppressTreeAutoCommit = true
  prompt.value = node.prompt
  vibrate('tap')
  toast.info(t('toast.treeRedo'), node.label)
}

function handleTreeJump(id: string) {
  const node = promptTree.jumpTo(id)
  if (!node) return
  suppressTreeAutoCommit = true
  prompt.value = node.prompt
  vibrate('tap')
  toast.info(t('toast.treeJump'), node.label)
}

function handleTreeBranch(id: string) {
  const node = promptTree.branchFrom(id)
  if (!node) return
  suppressTreeAutoCommit = true
  prompt.value = node.prompt
  vibrate('tap')
  toast.info(t('toast.treeBranch'), t('toast.treeBranchHint'))
}

function handleTreeClear() {
  promptTree.clear()
  toast.info(t('toast.treeCleared'))
}

function handleImportPrompt(text: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    toast.error(t('toast.importPromptEmpty'))
    return
  }
  const nextValue = trimmed

  if (nextValue === prompt.value) {
    toast.info(t('toast.importPromptSame'))
    focusPrompt()
    return
  }

  vibrate('tap')
  replacePromptWithUndo(nextValue, {
    treeAction: 'import',
    treeLabel: t('toast.importPromptLabel'),
    successTitle: t('toast.importPromptSuccess'),
    successHint: t('toast.importPromptHint'),
  })
  focusPrompt()
}


async function handleGenerate(options?: { clearAfter?: boolean }) {
  if (!canGenerate.value || !provider.isConfigured.value || healthStatus.value === 'offline') {
    if (!provider.isConfigured.value) {
      toast.error(t('toast.configureApi'), t('toast.configureApiHint'), {
        label: t('toast.openSettings'),
        ariaLabel: t('toast.openSettingsAria'),
        handler: () => { settingsOpen.value = true },
      })
      settingsOpen.value = true
      return
    }
    if (healthStatus.value === 'offline') {
      toast.error(t('toast.upstreamError'), t('toast.upstreamErrorHint'), {
        label: t('toast.recheckHealth'),
        ariaLabel: t('toast.recheckHealthAria'),
        handler: () => { void refreshHealth() },
      })
      return
    }
    if (!trimmedPrompt.value) {
      toast.error(t('toast.promptEmpty'), t('toast.promptEmptyHint'), {
        label: t('toast.focusPrompt'),
        handler: () => focusPrompt(),
      })
      return
    }
    if (trimmedPrompt.value.length < 4) {
      toast.error(
        t('toast.promptTooShort', { count: trimmedPrompt.value.length }),
        t('toast.promptTooShortHint'),
        { label: t('toast.keepEditing'), handler: () => focusPrompt() },
      )
      return
    }
    if (isGenerating.value) {
      toast.info(t('toast.generatingWait'))
    }
    return
  }

  const payload = buildPayload()
  const userId = createId()
  const messageReferenceImages = payload.referenceImages?.length
    ? refImages.cloneList(payload.referenceImages)
    : undefined

  const continuation = pendingContinuation.value
  pendingContinuation.value = null

  messages.value = [
    ...messages.value,
    {
      id: userId,
      role: 'user',
      content: payload.prompt,
      createdAt: new Date().toISOString(),
      meta: payloadToMeta(payload),
      referenceImages: messageReferenceImages,
      continuedFrom: continuation ?? undefined,
    },
  ]

  if (options?.clearAfter) {
    prompt.value = ''
    clearComposerReferenceImages()
  }

  await runGeneration({ payload, userMessageId: userId })
}

async function regenerateFromMessage(userMessageId: string) {
  if (isGenerating.value) {
    toast.info(t('toast.generatingWait'))
    return
  }

  const target = messages.value.find(
    (message): message is ChatUserMessage =>
      message.id === userMessageId && message.role === 'user',
  )

  if (!target) {
    toast.error(t('toast.userMessageMissing'))
    return
  }

  if (healthStatus.value === 'offline') {
    toast.error(t('toast.apiUnconfigured'), t('toast.apiUnconfiguredHint'))
    return
  }

  const resolvedModel = target.meta.model?.trim() || undefined
  const payload: GenerateImageRequest = {
    prompt: target.content,
    style: target.meta.style,
    size: target.meta.size,
    count: target.meta.count,
    outputFormat: target.meta.outputFormat,
    negativePrompt: target.meta.negativePrompt,
    quality: target.meta.quality,
    creativity: target.meta.creativity,
    seed: target.meta.seed,
    model: resolvedModel,
    modelSelection: target.meta.modelSelection ?? (resolvedModel ? 'explicit' : 'auto'),
    transparentBackground: target.meta.transparentBackground,
    streamingWait: target.meta.streamingWait,
    stream: target.meta.streamingWait,
    partialPreview: target.meta.partialPreview,
    partialImages: target.meta.partialPreview ? 2 : 0,
    referenceImages: target.referenceImages?.length ? target.referenceImages.slice() : undefined,
  }

  await runGeneration({ payload, userMessageId })
}

function sendFromChat() {
  vibrate('tap')
  void handleGenerate({ clearAfter: true })
}

function historyMessages(item: GenerationHistoryItem): ChatMessage[] {
  const userId = `history_user_${item.id}`
  const meta = {
    style: item.style,
    size: item.size,
    count: item.count,
    outputFormat: item.outputFormat,
    generationMode: item.referenceImageCount ? 'reference' as const : 'text' as const,
    model: item.model,
    modelSelection: item.modelSelection,
    transparentBackground: item.transparentBackground,
    streamingWait: item.streamingWait,
    partialPreview: item.partialPreview,
    quality: item.quality,
    creativity: item.creativity,
    seed: item.seed,
    negativePrompt: item.negativePrompt,
    referenceImageCount: item.referenceImageCount,
  }
  const userMessage: ChatUserMessage = {
    id: userId,
    role: 'user',
    content: item.prompt,
    createdAt: item.createdAt,
    meta,
  }

  if (!item.images?.length) {
    return [userMessage]
  }

  return [
    userMessage,
    {
      id: `history_assistant_${item.id}`,
      role: 'assistant',
      status: 'success',
      content: item.prompt,
      createdAt: item.createdAt,
      replyTo: userId,
      meta,
      images: item.images,
      requestId: item.requestId,
    },
  ]
}

function restoreModelChoiceFromHistory(item: Pick<GenerationHistoryItem, 'model' | 'modelSelection'>) {
  const restoredModel = (item.model || '').trim()

  if (item.modelSelection === 'none') {
    modelChoice.value = autoModelSentinel
    customModel.value = ''
    return
  }

  if (item.modelSelection === 'auto' || !restoredModel) {
    modelChoice.value = autoModelSentinel
    customModel.value = ''
    return
  }

  if (discoveredModels.mergedModelOptions.value.some((option) => option.value === restoredModel)) {
    modelChoice.value = restoredModel
    customModel.value = ''
    return
  }

  modelChoice.value = customModelSentinel
  customModel.value = restoredModel
}

async function restoreHistory(item: GenerationHistoryItem) {
  item = (await hydrateHistoryImages([item]))[0] || item
  prompt.value = item.prompt
  style.value = 'raw'
  size.value = item.size
  count.value = item.count
  outputFormat.value = item.outputFormat
  clearComposerReferenceImages()
  negativePrompt.value = item.negativePrompt || ''
  quality.value = item.quality || 'auto'
  creativity.value = item.creativity ?? 7
  seed.value = item.seed || ''
  transparentBackground.value = Boolean(item.transparentBackground && canUseTransparentBackground.value)
  streamingWait.value = item.streamingWait ?? streamingWait.value
  partialPreview.value = item.partialPreview ?? partialPreview.value
  restoreModelChoiceFromHistory(item)
  errorMessage.value = ''
  historyOpen.value = false
  messages.value = historyMessages(item)

  if (item.images && item.images.length) {
    images.value = item.images
    activeImageIndex.value = 0
    lastRequestId.value = item.requestId || ''
    toast.info(
      t('toast.historyRestored'),
      item.referenceImageCount
        ? t('toast.historyImagesLoadedRefs', { count: item.images.length })
        : t('toast.historyImagesLoaded', { count: item.images.length }),
    )
  } else {
    images.value = []
    activeImageIndex.value = 0
    lastRequestId.value = item.requestId || ''
    const hadImages = item.imageCount > 0
    toast.info(
      hadImages ? t('toast.historyCacheExpired') : t('toast.historyParamsRestored'),
      hadImages
        ? t('toast.historyCanRegenerate')
        : item.referenceImageCount
        ? t('toast.historyRefsNotSaved')
        : t('toast.historyNoImages'),
    )
  }

  nextTick(() => chatStreamRef.value?.scrollToBottom?.(false))
}

// Apply only the reusable generation parameters of a history item.
// without overwriting the user's current prompt or chat. Useful for "make
// what I'm typing now look like that earlier render".
function applyHistoryParams(item: GenerationHistoryItem) {
  style.value = 'raw'
  size.value = item.size
  count.value = item.count
  outputFormat.value = item.outputFormat
  quality.value = item.quality || 'auto'
  creativity.value = item.creativity ?? 7
  seed.value = item.seed || ''
  negativePrompt.value = item.negativePrompt || ''
  transparentBackground.value = Boolean(item.transparentBackground && canUseTransparentBackground.value)
  streamingWait.value = item.streamingWait ?? streamingWait.value
  partialPreview.value = item.partialPreview ?? partialPreview.value

  restoreModelChoiceFromHistory(item)

  vibrate('tap')
  toast.success(t('toast.paramsApplied'), t('toast.paramsAppliedHint'))
}

// Open the lightbox on a history item without touching any state.
async function previewHistory(item: GenerationHistoryItem) {
  const hydrated = (await hydrateHistoryImages([item]))[0] || item
  if (!hydrated.images || !hydrated.images.length) {
    toast.info(t('toast.historyNoPreview'))
    return
  }
  vibrate('tap')
  lightbox.open(hydrated.images, 0)
}

async function copyHistoryPrompt(item: GenerationHistoryItem) {
  await copyToClipboard(item.prompt, t('toast.copyPrompt'))
}

async function editImageFromHistory(item: GenerationHistoryItem) {
  if (!canEditImages.value) {
    notifyImageEditUnavailable()
    return
  }

  const hydrated = (await hydrateHistoryImages([item]))[0] || item
  if (!hydrated.images?.length) {
    toast.error(t('toast.historyNoEdit'))
    return
  }
  vibrate('tap')
  openImageEditor(hydrated.images, 0)
}

// Regenerate using a history item's full payload without writing anything
// into the composer. The user's draft (prompt + reference images + chat)
// is preserved.
async function regenerateFromHistory(item: GenerationHistoryItem) {
  if (isGenerating.value) {
    toast.info(t('toast.generatingWait'))
    return
  }
  if (!provider.isConfigured.value) {
    toast.error(t('toast.configureApi'), t('toast.configureApiHint'))
    settingsOpen.value = true
    return
  }
  if (healthStatus.value === 'offline') {
    toast.error(t('toast.apiUnconfigured'), t('toast.apiUnconfiguredHint'))
    return
  }

  const resolvedModel = (item.model || '').trim() || undefined
  const payload: GenerateImageRequest = {
    prompt: item.prompt,
    style: item.style,
    size: item.size,
    count: item.count,
    outputFormat: item.outputFormat,
    negativePrompt: item.negativePrompt,
    quality: item.quality,
    creativity: item.creativity,
    seed: item.seed,
    model: resolvedModel,
    modelSelection: item.modelSelection ?? (resolvedModel ? 'explicit' : 'auto'),
    transparentBackground: item.transparentBackground,
    streamingWait: item.streamingWait,
    stream: item.streamingWait,
    partialPreview: item.partialPreview,
    partialImages: item.partialPreview ? 2 : 0,
  }

  const userId = createId()
  messages.value = [
    ...messages.value,
    {
      id: userId,
      role: 'user',
      content: payload.prompt,
      createdAt: new Date().toISOString(),
      meta: payloadToMeta(payload),
    },
  ]
  vibrate('tap')
  toast.info(t('toast.historyGenerate'), t('toast.historyGenerateHint'))
  await runGeneration({ payload, userMessageId: userId })
}

// Two-step protected reset. First call surfaces an "Confirm reset" toast that
// must be clicked within ~5s. This stops accidental hits from wiping the
// composer, the chat, the canvas and all parameters in one go.
let resetConfirmingId: number | null = null

function performResetDraft() {
  clearDraft()
  prompt.value = localizedDefaultPrompt.value
  negativePrompt.value = localizedDefaultNegativePrompt.value
  clearComposerReferenceImages()
  style.value = 'raw'
  size.value = '1024x1024'
  count.value = 1
  outputFormat.value = 'png'
  quality.value = 'auto'
  creativity.value = 7
  seed.value = ''
  modelChoice.value = autoModelSentinel
  customModel.value = ''
  transparentBackground.value = false
  streamingWait.value = canUseStreamingWait.value
  partialPreview.value = canUsePartialPreview.value
  errorMessage.value = ''
  images.value = []
  activeImageIndex.value = 0
  messages.value = []
  pendingContinuation.value = null
  lastRequestId.value = ''
  elapsedSeconds.value = 0
  toast.info(t('toast.draftReset'))
}

function resetDraft() {
  // Empty workspace? Nothing meaningful would be lost — just reset.
  const hasMessages = messages.value.length > 0
  const hasImages = images.value.length > 0
  const hasReferences = referenceImages.value.length > 0
  const hasUnsavedPrompt = isPromptWorthProtecting(prompt.value)
  const isDirty = hasMessages || hasImages || hasReferences || hasUnsavedPrompt

  if (!isDirty) {
    performResetDraft()
    return
  }

  // Already in confirming mode — second tap performs the reset.
  if (resetConfirmingId !== null) {
    toast.dismiss(resetConfirmingId)
    resetConfirmingId = null
    performResetDraft()
    return
  }

  vibrate('tap')
  const reasons: string[] = []
  if (hasMessages) reasons.push(t('reset.reason.messages', { count: messages.value.length }))
  if (hasImages) reasons.push(t('reset.reason.images', { count: images.value.length }))
  if (hasReferences) reasons.push(t('reset.reason.references', { count: referenceImages.value.length }))
  if (hasUnsavedPrompt && !reasons.length) reasons.push(t('reset.reason.prompt'))

  resetConfirmingId = toast.error(t('reset.confirm.title'), reasons.join(' · '), {
    label: t('reset.confirm.label'),
    ariaLabel: t('reset.confirm.aria'),
    handler: () => {
      resetConfirmingId = null
      performResetDraft()
    },
  })

  // After the toast auto-dismisses, drop the confirming state too.
  window.setTimeout(() => {
    if (resetConfirmingId !== null) resetConfirmingId = null
  }, 6500)
}

function clearLocalHistory() {
  clearHistory()
  history.value = []
  toast.info(t('toast.historyCleared'))
}

function openImage(image: GeneratedImage) {
  const source = resolveImageSource(image)

  if (!source) {
    toast.error(t('toast.imageNoUrl'))
    return
  }

  window.open(source, '_blank', 'noopener,noreferrer')
}

async function copyToClipboard(text: string, message: string) {
  if (!text || !text.trim()) {
    toast.error(t('toast.empty'))
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    toast.success(message)
    return
  } catch {
    /* fall through to fallback */
  }

  // Older browsers / non-secure contexts (HTTP) fall back to execCommand.
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const ok = document.execCommand && document.execCommand('copy')
    document.body.removeChild(textarea)
    if (ok) {
      toast.success(message)
      return
    }
  } catch {
    /* swallow — surface the actionable error below */
  }

  // Final fallback: show the text in a toast so the user can manually copy.
  toast.error(t('toast.copyFailed'), t('toast.copyFallbackHint'), {
    label: t('toast.showText'),
    ariaLabel: t('toast.showTextAria'),
    handler: () => {
      window.prompt(t('toast.copyPromptManual'), text)
    },
  })
}

function exportCurrentConfig() {
  const payload = buildPayload()
  const exportPayload = {
    prompt: payload.prompt,
    style: payload.style,
    size: payload.size,
    count: payload.count,
    outputFormat: payload.outputFormat,
    negativePrompt: payload.negativePrompt,
    quality: payload.quality,
    creativity: payload.creativity,
    seed: payload.seed,
    model: payload.model,
    modelSelection: payload.modelSelection,
    transparentBackground: payload.transparentBackground,
    streamingWait: payload.streamingWait,
    partialPreview: payload.partialPreview,
    referenceImageCount: payload.referenceImages?.length || undefined,
  }
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: 'application/json',
  })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = objectUrl
  anchor.download = `promptcanvas-config-${Date.now()}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
  toast.success(t('toast.configExported'), 'JSON')
}

// ---------------------------------------------------------------------------
// Prompt replacement helpers
//
// Some flows intentionally overwrite the user's prompt, such as importing a
// prompt from history.
// `replacePromptWithUndo` makes that gentler — if the user had real work in
// the textarea, the previous value is captured and surfaced as an "Undo" toast
// for ~6 seconds. The default scaffolding text is treated as throwaway so we
// don't nag with toasts on first-run swaps.
// ---------------------------------------------------------------------------

function isKnownDefaultPrompt(value: string): boolean {
  const trimmed = value.trim()
  return Object.values(defaultPromptByLocale).some((defaultValue) => defaultValue.trim() === trimmed)
}

function isKnownDefaultNegativePrompt(value: string): boolean {
  const trimmed = value.trim()
  return Object.values(defaultNegativePromptByLocale).some((defaultValue) => defaultValue.trim() === trimmed)
}

function isPromptWorthProtecting(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length < 8) return false
  if (isKnownDefaultPrompt(trimmed)) return false
  return true
}

interface ReplaceOptions {
  treeAction: 'manual' | 'import' | 'undo'
  treeLabel: string
  successTitle: string
  successHint?: string
}

function replacePromptWithUndo(nextPrompt: string, options: ReplaceOptions) {
  const previousPrompt = prompt.value
  const hadRealWork = isPromptWorthProtecting(previousPrompt)

  suppressTreeAutoCommit = true
  prompt.value = nextPrompt
  promptTree.commit({
    prompt: nextPrompt,
    action: options.treeAction,
    label: options.treeLabel,
  })

  if (hadRealWork) {
    toast.success(options.successTitle, options.successHint, {
      label: t('toast.undo'),
      ariaLabel: t('toast.undoPromptReplaceAria'),
      handler: () => {
        suppressTreeAutoCommit = true
        prompt.value = previousPrompt
        promptTree.commit({
          prompt: previousPrompt,
          action: 'undo',
          label: t('toast.undoReplaceLabel'),
        })
        toast.info(t('toast.promptRestored'))
        focusPrompt()
      },
    })
  } else {
    toast.success(options.successTitle, options.successHint)
  }
}

function focusPrompt() {
  if (isDesktop.value) {
    composerRef.value?.focusPrompt?.()
  } else {
    chatDockRef.value?.focusInput?.()
  }
}

function handleChatDockLayoutChange(height: number) {
  if (!Number.isFinite(height)) return
  mobileDockHeight.value = Math.max(0, Math.round(height))
}

function warmLazyComponents() {
  const run = () => {
    void Promise.all([
      loadSettingsDialog(),
      loadHistoryDialog(),
      loadLightbox(),
      loadActivitySidebar(),
      loadShortcutsDialog(),
      loadOnboardingTour(),
    ])
  }

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 2800 })
  } else {
    globalThis.setTimeout(run, 1400)
  }
}

let manualCommitTimer: number | undefined

watch(prompt, (value) => {
  if (suppressTreeAutoCommit) {
    suppressTreeAutoCommit = false
    return
  }
  if (manualCommitTimer) {
    window.clearTimeout(manualCommitTimer)
    manualCommitTimer = undefined
  }
  manualCommitTimer = window.setTimeout(() => {
    manualCommitTimer = undefined
    const trimmed = value.trim()
    if (!trimmed) return
    const current = promptTree.currentNode.value
    if (current && current.prompt === value) return
    promptTree.commit({
      prompt: value,
      action: 'manual',
      label: t('promptTree.manual'),
    })
  }, 1200)
})

watch(locale, () => {
  if (isKnownDefaultPrompt(prompt.value)) {
    suppressTreeAutoCommit = true
    prompt.value = localizedDefaultPrompt.value
  }
  if (isKnownDefaultNegativePrompt(negativePrompt.value)) {
    negativePrompt.value = localizedDefaultNegativePrompt.value
  }
})

watch(isDesktop, (desktop) => {
  if (desktop) {
    mobileDockHeight.value = 0
  }
})

onMounted(() => {
  void refreshHealth({ silent: true })
  void hydrateHistoryImages(history.value).then((items) => {
    history.value = items
  })
  warmLazyComponents()
  onboarding.startIfNeeded()
  if (!promptTree.currentNode.value && prompt.value.trim()) {
    promptTree.commit({
      prompt: prompt.value,
      action: 'manual',
      label: t('promptTree.initial'),
    })
  }
})

watch(sw.updateAvailable, (available) => {
  if (!available) return
  toast.info(t('toast.updateReady'), t('toast.updateReadyHint'))
  // Apply on the next user interaction window — give them a heartbeat to read the toast.
  window.setTimeout(() => {
    sw.applyUpdate()
  }, 4000)
})
</script>

<template>
  <div class="app-root paper-bg relative flex min-h-dvh flex-col overflow-x-hidden text-ink" :style="mobileRootStyle">
    <a
      href="#canvas"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
    >
      {{ t('app.skipToCanvas') }}
    </a>

    <AppHeader
      :health-status="healthStatus"
      :health-message="displayHealthMessage"
      :theme="theme"
      @refresh-health="refreshHealth"
      @toggle-theme="toggleTheme"
      @open-history="historyOpen = true"
      @open-settings="settingsOpen = true"
      @reset="resetDraft"
    />

    <main
      v-if="isDesktop"
      class="desktop-workbench desktop-workbench--tool relative z-[2] mx-auto grid w-full max-w-[1720px] flex-1 gap-4 px-5 pb-6 pt-4 xl:gap-5 xl:px-6 2xl:px-8"
      :class="isWideDesktop
        ? 'grid-cols-[minmax(250px,300px)_minmax(0,1fr)_minmax(280px,320px)]'
        : 'grid-cols-[minmax(240px,280px)_minmax(0,1fr)]'
      "
    >
      <aside class="desktop-function-rail reveal" style="--reveal-delay: 40ms;" :aria-label="t('desktop.workspace.aria')">
        <section class="tool-section tool-section--settings">
          <div class="tool-section__head">
            <div>
              <p class="tool-section__label">{{ t('desktop.workspace.eyebrow') }}</p>
              <h2 class="tool-section__title">{{ t('desktop.workspace.title') }}</h2>
            </div>
            <button
              type="button"
              class="rail-icon-button"
              :aria-label="t('desktop.render.settings')"
              @click="settingsOpen = true"
            >
              <Icon name="sliders" :size="13" />
            </button>
          </div>

          <div v-if="!provider.isConfigured.value" class="rail-notice">
            <span>{{ t('desktop.capabilities.configureHint') }}</span>
            <button type="button" @click="settingsOpen = true">{{ t('desktop.capabilities.configureAction') }}</button>
          </div>

          <div class="rail-control-stack">
            <div class="rail-field">
              <span class="rail-field__label">
                <Icon name="ratio" :size="12" />
                <span>{{ t('desktop.render.size') }}</span>
              </span>
              <Select
                id="rail-size"
                v-model="size"
                :options="desktopSizeOptions"
                :aria-label="t('desktop.render.size')"
                size="sm"
                :show-hints="false"
              />
            </div>

            <div class="rail-field">
              <span class="rail-field__label">
                <Icon name="image" :size="12" />
                <span>{{ t('desktop.render.format') }}</span>
              </span>
              <Select
                id="rail-format"
                v-model="outputFormat"
                :options="desktopFormatOptions"
                :aria-label="t('settings.format.label')"
                size="sm"
                :show-hints="false"
              />
            </div>

            <div class="rail-field">
              <span class="rail-field__label">
                <Icon name="star" :size="12" />
                <span>{{ t('desktop.render.quality') }}</span>
              </span>
              <Select
                id="rail-quality"
                v-model="quality"
                :options="desktopQualityOptions"
                :aria-label="t('settings.quality.label')"
                size="sm"
                :show-hints="false"
              />
            </div>

            <div class="rail-field">
              <span class="rail-field__label">
                <Icon name="layers" :size="12" />
                <span>{{ t('desktop.render.count') }}</span>
              </span>
              <div class="rail-stepper" role="group" :aria-label="t('desktop.render.count')">
                <button type="button" :disabled="count <= 1 || isGenerating" @click="adjustGenerationCount(-1)">
                  <Icon name="minus" :size="12" />
                </button>
                <span aria-live="polite">{{ count }}</span>
                <button type="button" :disabled="count >= 4 || isGenerating" @click="adjustGenerationCount(1)">
                  <Icon name="plus" :size="12" />
                </button>
              </div>
            </div>
          </div>

          <div class="rail-switch-list">
            <label class="rail-switch-row" :class="{ 'is-disabled': !canUseTransparentBackground }">
              <input v-model="transparentBackground" type="checkbox" :disabled="!canUseTransparentBackground" />
              <span class="rail-switch-row__copy">
                <span>{{ t('settings.transparentBackground') }}</span>
                <small>{{ desktopTransparentHint }}</small>
              </span>
            </label>
            <label class="rail-switch-row" :class="{ 'is-disabled': !canUseStreamingWait }">
              <input v-model="streamingWait" type="checkbox" :disabled="!canUseStreamingWait" />
              <span class="rail-switch-row__copy">
                <span>{{ t('settings.streamingWait') }}</span>
                <small>{{ desktopStreamingHint }}</small>
              </span>
            </label>
            <label class="rail-switch-row" :class="{ 'is-disabled': !canUsePartialPreview }">
              <input v-model="partialPreview" type="checkbox" :disabled="!canUsePartialPreview" />
              <span class="rail-switch-row__copy">
                <span>{{ t('settings.stagePreview') }}</span>
                <small>{{ desktopPartialPreviewHint }}</small>
              </span>
            </label>
          </div>

          <details class="rail-details">
            <summary>
              <span>{{ t('settings.advanced.title') }}</span>
              <Icon name="chevronDown" :size="13" />
            </summary>
            <div class="rail-details__body">
              <label class="rail-field" for="rail-negative">
                <span class="rail-field__label">
                  <Icon name="eyeOff" :size="12" />
                  <span>{{ t('settings.negative') }}</span>
                </span>
                <textarea
                  id="rail-negative"
                  v-model="negativePrompt"
                  rows="2"
                  maxlength="400"
                  class="rail-textarea"
                  :placeholder="t('settings.negative.placeholder')"
                ></textarea>
              </label>

              <label class="rail-field" for="rail-seed">
                <span class="rail-field__label">
                  <Icon name="dice" :size="12" />
                  <span>{{ t('settings.seed') }}</span>
                </span>
                <span class="rail-input-action">
                  <input
                    id="rail-seed"
                    v-model="seed"
                    class="rail-input"
                    :placeholder="t('settings.seed.placeholder')"
                    autocomplete="off"
                    spellcheck="false"
                    inputmode="numeric"
                  />
                  <button type="button" :aria-label="t('settings.seed.roll')" @click="rollSeed">
                    <Icon name="dice" :size="13" />
                  </button>
                </span>
              </label>

              <label class="rail-field" for="rail-creativity">
                <span class="rail-field__label rail-field__label--split">
                  <span>
                    <Icon name="lightning" :size="12" />
                    <span>{{ t('settings.creativity') }}</span>
                  </span>
                  <span>{{ creativity }} / 10</span>
                </span>
                <input
                  id="rail-creativity"
                  v-model.number="creativity"
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  class="rail-range"
                  :aria-label="t('settings.creativity')"
                />
              </label>
            </div>
          </details>

          <details class="rail-details rail-details--capability">
            <summary>
              <span>{{ t('desktop.capabilities.eyebrow') }}</span>
              <strong>{{ desktopCapabilitySummary }}</strong>
              <Icon name="chevronDown" :size="13" />
            </summary>
            <ul class="capability-mini-list">
              <li
                v-for="item in desktopCapabilityItems"
                :key="item.key"
                class="capability-mini-row"
                :data-state="item.state"
              >
                <span>{{ item.label }}</span>
                <span>{{ item.detail }}</span>
                <strong>{{ item.stateLabel }}</strong>
              </li>
            </ul>
          </details>
        </section>

        <section class="tool-section tool-section--status">
          <div class="tool-section__head">
            <p class="tool-section__label">{{ t('desktop.status.eyebrow') }}</p>
            <span class="tool-status-dot" :data-status="healthStatus"></span>
          </div>
          <p class="tool-status-text">{{ displayHealthMessage }}</p>
        </section>
      </aside>

      <section class="desktop-center-stack">
        <section id="canvas" class="desktop-canvas-area reveal" style="--reveal-delay: 90ms;">
          <CanvasStage
            :images="images"
            :active-image-index="activeImageIndex"
            :is-generating="isGenerating"
            :elapsed-seconds="elapsedSeconds"
            :error-message="errorMessage"
            :last-request-id="lastRequestId"
            :progress-override="generationProgressOverride"
            :size="size"
            :model-label="selectedModelLabel"
            :model-name="selectedExplicitModel"
            :quality="quality"
            :count="count"
            :history="history"
            :prompt-preview="promptPreview"
            :has-prompt="trimmedPrompt.length >= 4"
            :provider-configured="provider.isConfigured.value"
            :can-edit-images="canEditImages"
            :image-edit-disabled-reason="editDisabledReason"
            @select="(index) => (activeImageIndex = index)"
            @open-lightbox="(index) => lightbox.open(images, index)"
            @open-inpaint="openActiveImageEditor"
            @image-edit-unavailable="notifyImageEditUnavailable"
            @download="downloadImage"
            @open="openImage"
            @copy="copyToClipboard"
            @export="exportCurrentConfig"
            @go-compose="focusPrompt"
            @generate="handleGenerate"
            @abort="handleAbortGeneration"
            @open-settings="settingsOpen = true"
            @drop-reference-images="addReferenceImages"
          />
        </section>

        <section class="desktop-draft-panel reveal" style="--reveal-delay: 140ms;" :aria-label="t('composer.prompt')">
          <PromptComposer
            ref="composerRef"
            v-model:prompt="prompt"
            v-model:imageStyle="style"
            v-model:size="size"
            v-model:count="count"
            v-model:quality="quality"
            v-model:modelChoice="modelChoice"
            v-model:customModel="customModel"
            layout="draft"
            :reference-images="referenceImages"
            :is-generating="isGenerating"
            :elapsed-seconds="elapsedSeconds"
            :can-generate="canGenerate"
            :health-offline="healthStatus === 'offline'"
            :model-warning="selectedModelWarning"
            :continuation="pendingContinuation"
            :tree-nodes="promptTree.nodes.value"
            :tree-current-id="promptTree.currentNode.value?.id ?? null"
            :tree-can-undo="promptTree.canUndo.value"
            :tree-can-redo="promptTree.canRedo.value"
            @generate="handleGenerate"
            @abort="handleAbortGeneration"
            @copy="copyToClipboard"
            @open-settings="settingsOpen = true"
            @select-reference-images="addReferenceImages"
            @remove-reference-image="removeReferenceImage"
            @toast-info="(title: string, message?: string) => toast.info(title, message)"
            @tree-undo="handleTreeUndo"
            @tree-redo="handleTreeRedo"
            @tree-jump="handleTreeJump"
            @tree-branch="handleTreeBranch"
            @tree-clear="handleTreeClear"
            @cancel-continuation="handleCancelContinuation"
          />
        </section>
      </section>

      <ActivitySidebar
        v-if="isWideDesktop"
        :history="history"
        :is-generating="isGenerating"
        :elapsed-seconds="elapsedSeconds"
        :prompt-preview="promptPreview"
        :selected-request-id="lastRequestId"
        :can-edit-images="canEditImages"
        :image-edit-disabled-reason="editDisabledReason"
        @restore="restoreHistory"
        @open-history="historyOpen = true"
        @copy="copyToClipboard"
        @preview="previewHistory"
        @copy-prompt="copyHistoryPrompt"
        @reuse-params="applyHistoryParams"
        @edit-image="editImageFromHistory"
        @regenerate="regenerateFromHistory"
      />
    </main>

    <footer
      class="hidden"
    >
      <span class="inline-flex items-center justify-center gap-2">
        <span>crafted local · {{ new Date().getFullYear() }}</span>
        <span class="text-line">/</span>
        <span>{{ t('desktop.footer.privacy') }}</span>
      </span>
    </footer>

    <div id="canvas" v-if="!isDesktop" class="mobile-shell flex min-h-0 flex-1 flex-col overflow-hidden">
      <section class="mobile-generation-panel" :aria-label="t('desktop.render.settings')">
        <details class="mobile-generation-details">
          <summary class="mobile-generation-summary">
            <span class="mobile-generation-summary__label">
              <Icon name="sliders" :size="13" />
              <span>{{ t('desktop.render.settings') }}</span>
            </span>
            <strong>{{ generationSettingsSummary }}</strong>
            <Icon name="chevronDown" :size="13" />
          </summary>

          <div class="mobile-generation-body">
            <div class="mobile-generation-grid">
              <label class="mobile-generation-field" for="mobile-size">
                <span>{{ t('desktop.render.size') }}</span>
                <Select
                  id="mobile-size"
                  v-model="size"
                  :options="desktopSizeOptions"
                  :aria-label="t('desktop.render.size')"
                  size="sm"
                  :show-hints="false"
                />
              </label>

              <label class="mobile-generation-field" for="mobile-format">
                <span>{{ t('desktop.render.format') }}</span>
                <Select
                  id="mobile-format"
                  v-model="outputFormat"
                  :options="desktopFormatOptions"
                  :aria-label="t('settings.format.label')"
                  size="sm"
                  :show-hints="false"
                />
              </label>

              <label class="mobile-generation-field" for="mobile-quality">
                <span>{{ t('desktop.render.quality') }}</span>
                <Select
                  id="mobile-quality"
                  v-model="quality"
                  :options="desktopQualityOptions"
                  :aria-label="t('settings.quality.label')"
                  size="sm"
                  :show-hints="false"
                />
              </label>

              <div class="mobile-generation-field">
                <span>{{ t('desktop.render.count') }}</span>
                <div class="mobile-generation-stepper" role="group" :aria-label="t('desktop.render.count')">
                  <button type="button" :disabled="count <= 1 || isGenerating" @click="adjustGenerationCount(-1)">
                    <Icon name="minus" :size="12" />
                  </button>
                  <span aria-live="polite">{{ count }}</span>
                  <button type="button" :disabled="count >= 4 || isGenerating" @click="adjustGenerationCount(1)">
                    <Icon name="plus" :size="12" />
                  </button>
                </div>
              </div>
            </div>

            <div class="mobile-generation-switches">
              <label class="mobile-generation-toggle" :class="{ 'is-disabled': !canUseTransparentBackground }">
                <input v-model="transparentBackground" type="checkbox" :disabled="!canUseTransparentBackground" />
                <span>{{ t('settings.transparentBackground') }}</span>
              </label>
              <label class="mobile-generation-toggle" :class="{ 'is-disabled': !canUseStreamingWait }">
                <input v-model="streamingWait" type="checkbox" :disabled="!canUseStreamingWait" />
                <span>{{ t('settings.streamingWait') }}</span>
              </label>
              <label class="mobile-generation-toggle" :class="{ 'is-disabled': !canUsePartialPreview }">
                <input v-model="partialPreview" type="checkbox" :disabled="!canUsePartialPreview" />
                <span>{{ t('settings.stagePreview') }}</span>
              </label>
            </div>

            <button type="button" class="mobile-generation-more" @click="settingsOpen = true">
              <Icon name="settings" :size="13" />
              <span>{{ t('settings.advanced.title') }}</span>
            </button>
          </div>
        </details>
      </section>

      <ChatStream
        ref="chatStreamRef"
        :messages="messages"
        :mobile-bottom-padding="mobileChatBottomPadding"
        :jump-bottom="mobileJumpButtonBottom"
        :provider-configured="provider.isConfigured.value"
        :history="history"
        :can-edit-images="canEditImages"
        :image-edit-disabled-reason="editDisabledReason"
        @retry="regenerateFromMessage"
        @open-image="lightbox.open"
        @edit-image="openImageEditor"
        @image-edit-unavailable="notifyImageEditUnavailable"
        @download="downloadImage"
        @copy="copyToClipboard"
        @import-prompt="handleImportPrompt"
        @scroll-to-message="handleScrollToMessage"
        @abort="handleAbortGeneration"
        @open-settings="settingsOpen = true"
      />
    </div>

    <ChatDock
      v-if="!isDesktop"
      ref="chatDockRef"
      v-model:prompt="prompt"
      v-model:model-choice="modelChoice"
      v-model:custom-model="customModel"
      :is-generating="isGenerating"
      :can-generate="canGenerate"
      :elapsed-seconds="elapsedSeconds"
      :health-offline="healthStatus === 'offline'"
      :reference-images="referenceImages"
      :keyboard-inset="mobileDockKeyboardInset"
      :viewport-height="mobileViewportHeight ?? undefined"
      :model-warning="selectedModelWarning"
      :continuation="pendingContinuation"
      @send="sendFromChat"
      @abort="handleAbortGeneration"
      @layout-change="handleChatDockLayoutChange"
      @select-reference-images="addReferenceImages"
      @remove-reference-image="removeReferenceImage"
      @cancel-continuation="handleCancelContinuation"
      @jump-to-continuation="handleScrollToMessage"
    />

    <SettingsDialog
      v-if="settingsOpen"
      v-model:open="settingsOpen"
      v-model:negativePrompt="negativePrompt"
      v-model:size="size"
      v-model:count="count"
      v-model:outputFormat="outputFormat"
      v-model:quality="quality"
      v-model:transparentBackground="transparentBackground"
      v-model:streamingWait="streamingWait"
      v-model:partialPreview="partialPreview"
      v-model:creativity="creativity"
      v-model:seed="seed"
      :can-transparent-background="canUseTransparentBackground"
      :transparent-background-disabled-reason="transparentBackgroundDisabledReason"
      :can-streaming-wait="canUseStreamingWait"
      :can-partial-preview="canUsePartialPreview"
      :partial-preview-disabled-reason="partialPreviewDisabledReason"
      @export="exportCurrentConfig"
      @reset="resetDraft"
      @reset-provider="toast.info(t('toast.providerCleared'), t('toast.providerClearedHint'))"
      @test-result="handleProviderTestResult"
    />

    <HistoryDialog
      v-if="historyOpen"
      v-model:open="historyOpen"
      :history="history"
      :can-edit-images="canEditImages"
      :image-edit-disabled-reason="editDisabledReason"
      @preview="previewHistory"
      @copy-prompt="copyHistoryPrompt"
      @reuse-params="applyHistoryParams"
      @edit-image="editImageFromHistory"
      @regenerate="regenerateFromHistory"
      @clear="clearLocalHistory"
    />

    <ShortcutsDialog
      v-if="shortcutsDialog.open.value"
      v-model:open="shortcutsDialog.open.value"
    />

    <OnboardingTour
      v-if="onboarding.active.value"
      :active="onboarding.active.value"
      @finish="onboarding.finish"
      @dismiss="onboarding.dismiss"
    />

    <Lightbox
      v-if="lightbox.state.open"
      :can-edit-images="canEditImages"
      :image-edit-disabled-reason="editDisabledReason"
      @image-edit-unavailable="notifyImageEditUnavailable"
      @inpaint-submit="handleInpaintSubmit"
    />

    <Toaster />
  </div>
</template>

<style scoped>
.desktop-workbench--tool {
  align-items: stretch;
  height: calc(100vh - 72px);
  max-height: calc(100vh - 72px);
  min-height: 0;
  overflow: hidden;
}

.desktop-function-rail {
  align-self: stretch;
  display: flex;
  min-height: 0;
  overflow-y: auto;
  flex-direction: column;
  border: 1px solid rgb(var(--color-line) / 0.78);
  border-radius: var(--radius-panel);
  background: rgb(var(--color-surface) / 0.96);
  box-shadow: var(--shadow-inner-glass);
  scrollbar-gutter: stable;
}

.desktop-function-rail::-webkit-scrollbar {
  width: 6px;
}

.desktop-function-rail::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgb(var(--color-line-strong) / 0.4);
}

.tool-section {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border-bottom: 1px solid rgb(var(--color-line) / 0.68);
}

.tool-section--settings {
  gap: 0.7rem;
}

.tool-section:last-child {
  border-bottom: 0;
}

.tool-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.tool-section__label {
  margin: 0;
  color: rgb(var(--color-muted));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
}

.tool-section__title,
.desktop-draft-panel__title {
  margin: 0;
  color: rgb(var(--color-ink));
  font-size: 16px;
  font-weight: 760;
  letter-spacing: 0;
}

.desktop-function-rail .tool-section__title {
  font-size: 14px;
}

.tool-section__note {
  margin: 0;
  color: rgb(var(--color-muted));
  font-size: 12px;
  line-height: 1.6;
}

.desktop-draft-panel__hint {
  color: rgb(var(--color-muted));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
}

.tool-section--status {
  margin-top: auto;
}

.rail-icon-button {
  display: inline-grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid rgb(var(--color-line) / 0.8);
  border-radius: 8px;
  background: rgb(var(--color-surface-raised) / 0.9);
  color: rgb(var(--color-ink));
  transition: border-color 140ms var(--motion-soft), background-color 140ms var(--motion-soft), transform 120ms var(--motion-press);
}

.rail-icon-button:hover {
  border-color: rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-surface-raised));
  transform: translateY(-1px);
}

.rail-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-radius: 8px;
  background: rgb(var(--color-ochre) / 0.1);
  color: rgb(var(--color-ink));
  padding: 0.45rem 0.55rem;
  font-size: 11px;
  line-height: 1.35;
}

.rail-notice button {
  flex: 0 0 auto;
  border-radius: 7px;
  background: rgb(var(--color-surface-raised) / 0.9);
  color: rgb(var(--color-action));
  padding: 0.25rem 0.45rem;
  font-size: 11px;
  font-weight: 760;
}

.rail-control-stack,
.rail-details__body {
  display: grid;
  gap: 0.55rem;
}

.rail-field {
  display: grid;
  gap: 0.35rem;
}

.rail-field__label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: rgb(var(--color-muted));
  font-size: 11px;
  font-weight: 740;
  line-height: 1.2;
}

.rail-field__label--split {
  justify-content: space-between;
}

.rail-field__label--split > span {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.rail-stepper {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 34px;
  align-items: center;
  overflow: hidden;
  border: 1px solid rgb(var(--color-line) / 0.8);
  border-radius: 8px;
  background: rgb(var(--color-surface-raised) / 0.94);
}

.rail-stepper button {
  display: grid;
  height: 34px;
  place-items: center;
  color: rgb(var(--color-muted));
  transition: background-color 140ms var(--motion-soft), color 140ms var(--motion-soft);
}

.rail-stepper button:hover:not(:disabled) {
  background: rgb(var(--color-surface-muted));
  color: rgb(var(--color-ink));
}

.rail-stepper button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.rail-stepper span {
  color: rgb(var(--color-ink));
  font-size: 12px;
  font-weight: 760;
  text-align: center;
}

.rail-switch-list {
  display: grid;
  gap: 0.45rem;
}

.rail-switch-row {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  border-radius: 8px;
  background: rgb(var(--color-surface-muted) / 0.58);
  padding: 0.5rem 0.55rem;
}

.rail-switch-row input {
  margin-top: 0.15rem;
  accent-color: rgb(var(--color-action));
}

.rail-switch-row.is-disabled {
  opacity: 0.62;
}

.rail-switch-row__copy {
  display: grid;
  min-width: 0;
  gap: 0.1rem;
}

.rail-switch-row__copy span {
  color: rgb(var(--color-ink));
  font-size: 11.5px;
  font-weight: 730;
}

.rail-switch-row__copy small {
  overflow: hidden;
  color: rgb(var(--color-muted));
  font-size: 10.5px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-details {
  border: 1px solid rgb(var(--color-line) / 0.62);
  border-radius: 8px;
  background: rgb(var(--color-surface-muted) / 0.48);
}

.rail-details summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  list-style: none;
  padding: 0.55rem 0.6rem;
  color: rgb(var(--color-ink));
  font-size: 11.5px;
  font-weight: 760;
}

.rail-details--capability summary {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.rail-details summary::-webkit-details-marker {
  display: none;
}

.rail-details summary strong {
  overflow: hidden;
  color: rgb(var(--color-muted));
  font-size: 10.5px;
  font-weight: 680;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-details summary svg {
  transition: transform 140ms var(--motion-soft);
}

.rail-details[open] summary svg {
  transform: rotate(180deg);
}

.rail-details__body {
  border-top: 1px solid rgb(var(--color-line) / 0.54);
  padding: 0.6rem;
}

.rail-input,
.rail-textarea {
  width: 100%;
  border: 1px solid rgb(var(--color-line) / 0.85);
  border-radius: 8px;
  background: rgb(var(--color-surface-raised) / 0.96);
  color: rgb(var(--color-ink));
  font-size: 12px;
  outline: none;
}

.rail-input {
  min-height: 34px;
  padding: 0.45rem 2.25rem 0.45rem 0.55rem;
}

.rail-textarea {
  min-height: 54px;
  resize: vertical;
  padding: 0.5rem 0.55rem;
  line-height: 1.45;
}

.rail-input:focus,
.rail-textarea:focus,
.rail-stepper:focus-within,
.rail-icon-button:focus-visible,
.rail-notice button:focus-visible,
.rail-input-action button:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.rail-input-action {
  position: relative;
  display: block;
}

.rail-input-action button {
  position: absolute;
  top: 50%;
  right: 4px;
  display: grid;
  width: 28px;
  height: 28px;
  transform: translateY(-50%);
  place-items: center;
  border-radius: 7px;
  color: rgb(var(--color-muted));
}

.rail-input-action button:hover {
  background: rgb(var(--color-surface-muted));
  color: rgb(var(--color-ink));
}

.rail-range {
  width: 100%;
  accent-color: rgb(var(--color-action));
}

.capability-mini-list {
  display: grid;
  gap: 0.1rem;
  margin: 0;
  border-top: 1px solid rgb(var(--color-line) / 0.54);
  padding: 0.35rem 0.6rem 0.55rem;
  list-style: none;
}

.capability-mini-row {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.45rem;
  min-height: 24px;
  color: rgb(var(--color-muted));
  font-size: 10.5px;
}

.capability-mini-row > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.capability-mini-row > span:first-child {
  color: rgb(var(--color-ink));
  font-weight: 700;
}

.capability-mini-row strong {
  justify-self: end;
  color: rgb(var(--color-muted));
  font-size: 10px;
  font-weight: 760;
}

.capability-mini-row[data-state='supported'] strong {
  color: rgb(var(--color-forest));
}

.capability-mini-row[data-state='unsupported'] strong {
  color: rgb(var(--color-clay));
}

.capability-mini-row[data-state='partial'] strong {
  color: rgb(var(--color-ochre));
}

.tool-status-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: rgb(var(--color-muted) / 0.62);
}

.tool-status-dot[data-status='online'] {
  background: rgb(var(--color-forest));
}

.tool-status-dot[data-status='offline'] {
  background: rgb(var(--color-clay));
}

.tool-status-text {
  margin: 0;
  color: rgb(var(--color-ink) / 0.78);
  font-size: 12px;
  line-height: 1.55;
}

.desktop-center-stack {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 0.75rem;
}

.desktop-canvas-area {
  min-height: 0;
  overflow-y: auto;
  padding: 0.1rem 0.1rem 0.2rem;
}

.desktop-canvas-area::-webkit-scrollbar {
  width: 6px;
}

.desktop-canvas-area::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgb(var(--color-line-strong) / 0.35);
}

.desktop-draft-panel {
  display: grid;
  gap: 0.6rem;
  border: 1px solid rgb(var(--color-line) / 0.76);
  border-radius: var(--radius-panel);
  background: rgb(var(--color-surface-raised) / 0.98);
  box-shadow:
    var(--shadow-glass),
    var(--shadow-inner-glass);
  padding: 0.75rem;
}

.desktop-draft-panel__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}

@media (max-width: 1023px) {
  .app-root {
    height: 100svh;
    height: 100dvh;
    max-height: 100dvh;
    overflow: hidden;
  }

  .mobile-shell {
    width: 100%;
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    isolation: isolate;
  }

  .mobile-shell :deep(.chat-stream) {
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
  }

  .mobile-generation-panel {
    position: relative;
    z-index: 3;
    flex: 0 0 auto;
    padding:
      8px max(10px, env(safe-area-inset-right, 0px)) 4px
      max(10px, env(safe-area-inset-left, 0px));
  }

  .mobile-generation-details {
    overflow: clip;
    border: 1px solid rgb(var(--color-line) / 0.78);
    border-radius: 10px;
    background: rgb(var(--color-surface) / 0.97);
    box-shadow: var(--shadow-inner-glass), var(--shadow-glass-sm);
  }

  .mobile-generation-summary {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    min-height: 40px;
    padding: 0 0.72rem;
    cursor: pointer;
    color: rgb(var(--color-ink));
    font-size: 12px;
    font-weight: 720;
    line-height: 1.2;
  }

  .mobile-generation-summary__label {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    gap: 0.35rem;
    white-space: nowrap;
  }

  .mobile-generation-summary strong {
    min-width: 0;
    overflow: hidden;
    color: rgb(var(--color-muted));
    font-size: 11px;
    font-weight: 650;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-generation-summary > svg:last-child {
    color: rgb(var(--color-muted));
    transition: transform 140ms var(--motion-soft);
  }

  .mobile-generation-details[open] .mobile-generation-summary > svg:last-child {
    transform: rotate(180deg);
  }

  .mobile-generation-body {
    display: grid;
    gap: 0.65rem;
    max-height: min(280px, 36svh);
    overflow-y: auto;
    overscroll-behavior: contain;
    border-top: 1px solid rgb(var(--color-line) / 0.62);
    padding: 0.65rem;
    -webkit-overflow-scrolling: touch;
  }

  .mobile-generation-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .mobile-generation-field {
    display: grid;
    min-width: 0;
    gap: 0.32rem;
  }

  .mobile-generation-field > span {
    overflow: hidden;
    color: rgb(var(--color-muted));
    font-size: 11px;
    font-weight: 720;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-generation-field :deep(.select-trigger) {
    height: 36px;
    border-radius: 8px;
    padding-left: 0.7rem;
    padding-right: 1.9rem;
    font-size: 12px;
  }

  .mobile-generation-field :deep(.select-trigger__caret) {
    right: 0.55rem;
  }

  .mobile-generation-stepper {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 34px;
    align-items: center;
    overflow: hidden;
    min-height: 36px;
    border: 1px solid rgb(var(--color-line) / 0.82);
    border-radius: 8px;
    background: rgb(var(--color-surface-raised) / 0.96);
    box-shadow: var(--shadow-inner-glass);
  }

  .mobile-generation-stepper button {
    display: grid;
    height: 36px;
    place-items: center;
    color: rgb(var(--color-muted));
  }

  .mobile-generation-stepper button:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  .mobile-generation-stepper span {
    color: rgb(var(--color-ink));
    font-size: 12px;
    font-weight: 760;
    text-align: center;
  }

  .mobile-generation-switches {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .mobile-generation-toggle {
    display: inline-flex;
    align-items: center;
    flex: 1 1 130px;
    min-width: 0;
    min-height: 34px;
    gap: 0.45rem;
    border-radius: 8px;
    background: rgb(var(--color-surface-muted) / 0.72);
    padding: 0.35rem 0.55rem;
    color: rgb(var(--color-ink));
    font-size: 11.5px;
    font-weight: 680;
    line-height: 1.2;
  }

  .mobile-generation-toggle input {
    flex: 0 0 auto;
    accent-color: rgb(var(--color-action));
  }

  .mobile-generation-toggle span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-generation-toggle.is-disabled {
    opacity: 0.58;
  }

  .mobile-generation-more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    justify-self: start;
    gap: 0.35rem;
    min-height: 34px;
    border: 1px solid rgb(var(--color-line) / 0.76);
    border-radius: 8px;
    background: rgb(var(--color-surface-raised) / 0.96);
    color: rgb(var(--color-ink));
    padding: 0 0.7rem;
    font-size: 12px;
    font-weight: 720;
    box-shadow: var(--shadow-inner-glass);
  }
}

@media (max-width: 380px) {
  .mobile-generation-panel {
    padding-inline: max(8px, env(safe-area-inset-left, 0px)) max(8px, env(safe-area-inset-right, 0px));
  }

  .mobile-generation-summary {
    gap: 0.42rem;
    padding-inline: 0.6rem;
  }

  .mobile-generation-summary strong {
    font-size: 10.5px;
  }

  .mobile-generation-body {
    padding: 0.55rem;
  }

  .mobile-generation-grid {
    gap: 0.45rem;
  }
}

@media (max-width: 1023px) and (max-height: 540px) and (orientation: landscape) {
  .mobile-generation-panel {
    padding-top: 5px;
  }

  .mobile-generation-summary {
    min-height: 34px;
  }

  .mobile-generation-body {
    max-height: min(190px, 40svh);
    padding: 0.5rem;
  }

  .mobile-generation-grid {
    grid-template-columns: repeat(4, minmax(108px, 1fr));
    overflow-x: auto;
    padding-bottom: 0.1rem;
    scrollbar-width: none;
  }

  .mobile-generation-grid::-webkit-scrollbar {
    display: none;
  }

  .mobile-generation-switches {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .mobile-generation-switches::-webkit-scrollbar {
    display: none;
  }

  .mobile-generation-toggle {
    flex-basis: 142px;
  }
}

@media (max-width: 1279px) {
  .desktop-workbench--tool {
    max-width: 1320px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rail-icon-button,
  .rail-stepper button,
  .rail-details summary svg,
  .mobile-generation-summary > svg:last-child {
    transition: none;
  }
}
</style>

