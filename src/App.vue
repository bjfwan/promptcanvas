<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { resolveImageSource } from './api'
import { customModelSentinel, qualityOptions, sizeOptions, styleOptions, stylePresetById } from './presets'
import { clearDraft, clearHistory, hydrateHistoryImages, loadDraft, loadHistory } from './storage'
import type {
  ChatMessage,
  ChatUserMessage,
  ContinuationContext,
  GeneratedImage,
  GenerateImageRequest,
  GenerationHistoryItem,
  ImageQuality,
  ImageSize,
  ImageStyle,
} from './types'
import { createId } from './lib/id'
import { payloadToMeta } from './lib/chatMessage'
import AppHeader from './components/AppHeader.vue'
import Toaster from './components/Toaster.vue'
import { useToast } from './composables/useToast'
import { useTheme } from './composables/useTheme'
import { useLightbox } from './composables/useLightbox'
import { useProviderConfig } from './composables/useProviderConfig'
import { useDiscoveredModels } from './composables/useDiscoveredModels'
import { useVibration } from './composables/useVibration'
import { useReferenceImages } from './composables/useReferenceImages'
import { useImagePriming } from './composables/useImagePriming'
import { useDownloadImage } from './composables/useDownloadImage'
import { useDraftAutoSave } from './composables/useDraftAutoSave'
import { useMobileViewport } from './composables/useMobileViewport'
import { useHealthCheck } from './composables/useHealthCheck'
import { useGenerationFlow } from './composables/useGenerationFlow'
import { useMediaQuery } from './composables/useMediaQuery'
import { useCommandPalette } from './composables/useCommandPalette'
import { useShortcutsDialog } from './composables/useShortcutsDialog'
import { usePromptContext } from './composables/usePromptContext'
import { usePromptTree } from './composables/usePromptTree'
import { reverseParseRevisedPrompt, docToPlainPrompt } from './lib/revisedParser'
import { useOnboarding } from './composables/useOnboarding'
import { useServiceWorker } from './composables/useServiceWorker'
import { useInstallPrompt } from './composables/useInstallPrompt'
import { useI18n } from './lib/i18n'
import type { EnhanceResult } from './lib/magicEnhance'

const loadPromptComposer = () => import('./components/PromptComposer.vue')
const loadCanvasStage = () => import('./components/CanvasStage.vue')
const loadChatStream = () => import('./components/ChatStream.vue')
const loadChatDock = () => import('./components/ChatDock.vue')
const loadStyleSheet = () => import('./components/StyleSheet.vue')
const loadSettingsDialog = () => import('./components/SettingsDialog.vue')
const loadHistoryDialog = () => import('./components/HistoryDialog.vue')
const loadLightbox = () => import('./components/Lightbox.vue')
const loadCommandPalette = () => import('./components/CommandPalette.vue')
const loadActivitySidebar = () => import('./components/ActivitySidebar.vue')
const loadShortcutsDialog = () => import('./components/ShortcutsDialog.vue')
const loadOnboardingTour = () => import('./components/OnboardingTour.vue')

const PromptComposer = defineAsyncComponent(loadPromptComposer)
const CanvasStage = defineAsyncComponent(loadCanvasStage)
const ChatStream = defineAsyncComponent(loadChatStream)
const ChatDock = defineAsyncComponent(loadChatDock)
const StyleSheet = defineAsyncComponent(loadStyleSheet)
const SettingsDialog = defineAsyncComponent(loadSettingsDialog)
const HistoryDialog = defineAsyncComponent(loadHistoryDialog)
const Lightbox = defineAsyncComponent(loadLightbox)
const CommandPalette = defineAsyncComponent(loadCommandPalette)
const ActivitySidebar = defineAsyncComponent(loadActivitySidebar)
const ShortcutsDialog = defineAsyncComponent(loadShortcutsDialog)
const OnboardingTour = defineAsyncComponent(loadOnboardingTour)

const defaultPrompt = '一只穿着复古宇航服的橘猫，站在月球摄影棚里，像 1970 年代科幻电影海报'
const defaultNegativePrompt = '低清晰度、模糊、水印、错误文字、畸形手指、画面杂乱'

const prompt = ref(defaultPrompt)
const negativePrompt = ref(defaultNegativePrompt)
const style = ref<ImageStyle>('poster')
const size = ref<ImageSize>('1024x1024')
const count = ref(1)
const outputFormat = ref<GenerateImageRequest['outputFormat']>('png')
const quality = ref<ImageQuality>('auto')
const creativity = ref(7)
const seed = ref('')
const modelChoice = ref<string>('')
const customModel = ref<string>('')
const images = shallowRef<GeneratedImage[]>([])
const activeImageIndex = ref(0)
const isGenerating = ref(false)
const errorMessage = ref('')
const lastRequestId = ref('')
const elapsedSeconds = ref(0)
const history = shallowRef<GenerationHistoryItem[]>(loadHistory())

const toast = useToast()
const { theme, toggle: toggleTheme } = useTheme()
const lightbox = useLightbox()
const provider = useProviderConfig()
const discoveredModels = useDiscoveredModels()
const { vibrate } = useVibration()
const settingsOpen = ref(false)
const historyOpen = ref(false)
const styleSheetOpen = ref(false)
const commandPalette = useCommandPalette()
const shortcutsDialog = useShortcutsDialog()
const onboarding = useOnboarding()
const sw = useServiceWorker()
const installPrompt = useInstallPrompt()
const { t } = useI18n()
const composerRef = ref<{ focusPrompt?: () => void } | null>(null)
const chatDockRef = ref<{ focusInput?: () => void } | null>(null)
const chatStreamRef = ref<{ scrollToMessage?: (id: string) => void; scrollToBottom?: (smooth?: boolean) => void } | null>(null)
const messages = shallowRef<ChatMessage[]>([])
const pendingContinuation = ref<ContinuationContext | null>(null)
const mobileDockHeight = ref(180)

const promptContextManager = usePromptContext({ history, messages, pendingContinuation })
const promptContext = promptContextManager.context
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

const mobileRootStyle = computed(() => {
  // We deliberately stop clamping #app to visualViewport height. iOS keyboard
  // openings cause visualViewport.height to oscillate, and locking #app to
  // those values causes the whole layout (and the dock with it) to jitter.
  // Instead we let the document use 100dvh and translate only the dock when
  // the keyboard is actually shown.
  return undefined
})
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
const templateAnchorPrompt = ref<string>(defaultPrompt)
let skipNextStyleSync = false

const lastEnhanceResult = ref<EnhanceResult | null>(null)

const quickPromptCards = [
  {
    title: '咖啡海报',
    prompt: '精品咖啡品牌的竖版海报，米白背景，一杯冰拿铁居中，玻璃杯凝着水珠，焦糖棕与奶油白双色调，大面积留白，极简高级排版',
  },
  {
    title: '夜雨街景',
    prompt: '雨后夜晚的城市街角，霓虹灯映在湿润路面，一个穿风衣的人站在便利店门口，冷暖光对比，电影截图质感，35mm 镜头',
  },
  {
    title: '产品棚拍',
    prompt: '高端护肤精华液棚拍，琥珀色玻璃瓶居中，浅奶油色背景，柔光箱左侧布光，瓶身反光干净，商业杂志广告质感',
  },
]

const restoredDraft = loadDraft()

if (restoredDraft) {
  if (typeof restoredDraft.prompt === 'string') {
    prompt.value = restoredDraft.prompt
    templateAnchorPrompt.value = restoredDraft.prompt
  }
  if (typeof restoredDraft.negativePrompt === 'string') negativePrompt.value = restoredDraft.negativePrompt
  if (styleOptions.some((option) => option.value === restoredDraft.style)) style.value = restoredDraft.style as ImageStyle
  if (sizeOptions.some((option) => option.value === restoredDraft.size)) size.value = restoredDraft.size as ImageSize
  if (typeof restoredDraft.count === 'number' && Number.isInteger(restoredDraft.count) && restoredDraft.count >= 1 && restoredDraft.count <= 4) count.value = restoredDraft.count
  if (restoredDraft.outputFormat === 'png' || restoredDraft.outputFormat === 'jpeg' || restoredDraft.outputFormat === 'webp') outputFormat.value = restoredDraft.outputFormat
  if (qualityOptions.some((option) => option.value === restoredDraft.quality)) quality.value = restoredDraft.quality as ImageQuality
  if (typeof restoredDraft.creativity === 'number' && restoredDraft.creativity >= 1 && restoredDraft.creativity <= 10) creativity.value = restoredDraft.creativity
  if (typeof restoredDraft.seed === 'string') seed.value = restoredDraft.seed
  if (typeof restoredDraft.modelChoice === 'string' && (restoredDraft.modelChoice === '' || discoveredModels.mergedModelOptions.value.some((option) => option.value === restoredDraft.modelChoice))) {
    modelChoice.value = restoredDraft.modelChoice
  }
  if (typeof restoredDraft.customModel === 'string') customModel.value = restoredDraft.customModel
}

useDraftAutoSave({
  prompt, negativePrompt, style, size, count, outputFormat, quality, creativity, seed, modelChoice, customModel,
})

const selectedStyle = computed(() => styleOptions.find((item) => item.value === style.value))
const selectedStyleLabel = computed(() => selectedStyle.value?.label ?? style.value)
const selectedModelLabel = computed(() => {
  if (modelChoice.value === customModelSentinel) {
    const trimmed = customModel.value.trim()
    return trimmed ? trimmed : ''
  }
  const value = modelChoice.value.trim()
  if (!value) return ''
  const match = discoveredModels.mergedModelOptions.value.find((option) => option.value === value)
  return match?.label || value
})
const trimmedPrompt = computed(() => prompt.value.trim())
const canGenerate = computed(
  () =>
    trimmedPrompt.value.length >= 4
    && !isGenerating.value
    && healthStatus.value !== 'offline'
    && provider.isConfigured.value,
)
const promptPreview = computed(() => trimmedPrompt.value.split('\n')[0]?.slice(0, 64) ?? '')

function buildPayload(): GenerateImageRequest {
  const resolvedModel =
    modelChoice.value === customModelSentinel
      ? customModel.value.trim()
      : modelChoice.value.trim()

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
    model: resolvedModel || undefined,
    referenceImages: referenceImages.value.length ? referenceImages.value.slice() : undefined,
  }
}

const generation = useGenerationFlow({
  messages, images, activeImageIndex, elapsedSeconds, errorMessage, lastRequestId,
  isGenerating, history, settingsOpen, styleSheetOpen, toast, vibrate, primeGeneratedImages,
})
const { runGeneration } = generation

function handleAbortGeneration() {
  generation.abortGeneration()
}

async function fetchContinuationBlob(source: string): Promise<Blob> {
  try {
    const response = await fetch(source)
    if (response.ok) return await response.blob()
  } catch {}

  const proxyUrl = (provider.snapshot().proxyUrl || '').trim().replace(/\/+$/, '')
  if (!proxyUrl || /^(data|blob):/i.test(source)) {
    throw new Error('图片读取失败')
  }

  const url = new URL(source)
  const upstreamBase = `${url.protocol}//${url.host}`
  const response = await fetch(`${proxyUrl}${url.pathname}${url.search}`, {
    headers: { 'X-Upstream-Base': upstreamBase },
  })

  if (!response.ok) {
    throw new Error('代理读取失败')
  }

  return await response.blob()
}

async function handleRemix(
  image: GeneratedImage,
  content: string,
  fromMessageId: string,
  fromImageIndex: number,
) {
  vibrate('tap')

  const source = resolveImageSource(image)
  if (!source) {
    toast.error('找不到这张图片的源数据', '可能未保存或链接已失效')
    return
  }

  prompt.value = content || prompt.value

  try {
    toast.info('正在准备「接着画」', '把这张图加入参考')
    const blob = await fetchContinuationBlob(source)
    const mimeType = (blob.type || image.mimeType || 'image/png').split(';')[0] || 'image/png'
    const ext = mimeType.split('/')[1] || 'png'

    const file = new File([blob], `continue-${Date.now()}.${ext}`, { type: mimeType })

    clearComposerReferenceImages()
    addReferenceImages([file])

    pendingContinuation.value = {
      fromMessageId,
      fromImageId: image.id,
      fromImageIndex,
      thumbnailUrl: source,
      promptPreview: (content || '').split('\n')[0]?.slice(0, 60) ?? '',
    }

    focusPrompt()
    toast.success('已接上这张图', '修改提示词后发送即可继续创作')
  } catch (err) {
    console.error('Continue from image failed:', err)
    toast.error('准备失败', '图片可能存在跨域限制，无法直接接着画')
  }
}

function handlePickSuggestion(value: ImageStyle) {
  pickStyleFromChat(value)
}

function handleScrollToMessage(id: string) {
  vibrate('tap')
  chatStreamRef.value?.scrollToMessage?.(id)
}

function handleCancelContinuation() {
  vibrate('tap')
  pendingContinuation.value = null
  clearComposerReferenceImages()
  toast.info('已取消接着画', '回到自由创作模式')
}

function handleMagicEnhance(result: EnhanceResult) {
  if (!result.enhanced || result.enhanced === result.original) {
    toast.info('提示词已很完整，无需增强')
    return
  }

  lastEnhanceResult.value = result
  suppressTreeAutoCommit = true
  prompt.value = result.enhanced
  promptTree.commit({
    prompt: result.enhanced,
    action: 'enhance',
    label: result.summary || '智能优化',
  })
  vibrate('success')

  const dimLabels = result.dimensionLabels.join('、')
  toast.success('魔法已施展', dimLabels ? `补充了「${dimLabels}」` : '已追加修饰词')
}

function handleUndoEnhance() {
  if (!lastEnhanceResult.value) return
  suppressTreeAutoCommit = true
  prompt.value = lastEnhanceResult.value.original
  promptTree.commit({
    prompt: lastEnhanceResult.value.original,
    action: 'undo',
    label: '撤销魔法',
  })
  lastEnhanceResult.value = null
  vibrate('tap')
  toast.info('已撤销魔法增强')
}

function handleTreeUndo() {
  const node = promptTree.undo()
  if (!node) {
    toast.info('没有更早的版本')
    return
  }
  suppressTreeAutoCommit = true
  prompt.value = node.prompt
  vibrate('tap')
  toast.info('已回到上一个版本', node.label)
}

function handleTreeRedo() {
  const node = promptTree.redo()
  if (!node) {
    toast.info('没有更新的版本')
    return
  }
  suppressTreeAutoCommit = true
  prompt.value = node.prompt
  vibrate('tap')
  toast.info('已恢复版本', node.label)
}

function handleTreeJump(id: string) {
  const node = promptTree.jumpTo(id)
  if (!node) return
  suppressTreeAutoCommit = true
  prompt.value = node.prompt
  vibrate('tap')
  toast.info('已跳转到该版本', node.label)
}

function handleTreeBranch(id: string) {
  const node = promptTree.branchFrom(id)
  if (!node) return
  suppressTreeAutoCommit = true
  prompt.value = node.prompt
  vibrate('tap')
  toast.info('从该节点分支', '继续修改会形成新分支')
}

function handleTreeClear() {
  promptTree.clear()
  toast.info('已清空 Prompt 树')
}

async function handleMagicAbTest(original: string, optimized: EnhanceResult) {
  if (!optimized.enhanced || optimized.enhanced === original) {
    toast.info('优化版本与原始一致，无需 A/B')
    return
  }
  if (isGenerating.value) {
    toast.info('正在生成中，请稍候')
    return
  }
  if (!provider.isConfigured.value) {
    toast.error('请先配置 API 服务', '右上角「设置」→ 服务商')
    settingsOpen.value = true
    return
  }
  if (healthStatus.value === 'offline') {
    toast.error('API 未配置', '请先在「设置」中填写 baseUrl 与 Key')
    return
  }

  prompt.value = optimized.enhanced
  lastEnhanceResult.value = optimized

  const userIdA = createId()
  const userIdB = createId()
  const basePayload = buildPayload()
  const payloadOriginal: GenerateImageRequest = { ...basePayload, prompt: original }
  const payloadOptimized: GenerateImageRequest = { ...basePayload, prompt: optimized.enhanced }

  messages.value = [
    ...messages.value,
    {
      id: userIdA,
      role: 'user',
      content: `[A · 原始] ${original}`,
      createdAt: new Date().toISOString(),
      meta: payloadToMeta(payloadOriginal),
    },
  ]
  await runGeneration({ payload: payloadOriginal, userMessageId: userIdA })

  messages.value = [
    ...messages.value,
    {
      id: userIdB,
      role: 'user',
      content: `[B · 优化] ${optimized.enhanced}`,
      createdAt: new Date().toISOString(),
      meta: payloadToMeta(payloadOptimized),
    },
  ]
  await runGeneration({ payload: payloadOptimized, userMessageId: userIdB })

  toast.success('A/B 双轨完成', '上下两组可对比效果')
}

function handleImportPrompt(text: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    toast.error('没有可导入的提示词内容')
    return
  }
  const looksStructured = /^(?:Subject|Lighting|Camera|Composition|主体|光位|镜头|构图)[:：]/m.test(trimmed)
  let nextValue: string
  let slotCount = 0
  if (looksStructured) {
    const doc = reverseParseRevisedPrompt({
      revisedPrompt: trimmed,
      style: style.value,
      size: size.value,
      hasReferenceImages: referenceImages.value.length > 0,
      modelName: modelChoice.value,
    })
    const plain = docToPlainPrompt(doc) || trimmed
    nextValue = plain
    slotCount = Object.keys(doc.slots).filter((key) => doc.slots[key as keyof typeof doc.slots]?.value).length
  } else {
    nextValue = trimmed
  }
  suppressTreeAutoCommit = true
  prompt.value = nextValue
  promptTree.commit({
    prompt: nextValue,
    action: 'import',
    label: looksStructured ? `反向导入 · ${slotCount} 槽位` : '反向导入',
  })
  if (looksStructured) {
    toast.success('已导入并解析槽位', `识别 ${slotCount} 个槽位，已规整为可读 prompt`)
  } else {
    toast.success('已导入到 Composer', '原文不含结构化标记，按原样写入')
  }
  templateAnchorPrompt.value = prompt.value
  lastEnhanceResult.value = null
  vibrate('tap')
  focusPrompt()
}

function handlePickQuickPrompt(value: string) {
  prompt.value = value
  templateAnchorPrompt.value = value
  vibrate('tap')
  focusPrompt()
}

async function handleGenerate(options?: { clearAfter?: boolean }) {
  lastEnhanceResult.value = null
  if (!canGenerate.value) {
    if (!provider.isConfigured.value) {
      toast.error('请先配置 API 服务', '右上角「设置」→ 服务商')
      settingsOpen.value = true
      return
    }
    if (!trimmedPrompt.value) toast.error('请先写下提示词', '至少 4 个字')
    else if (healthStatus.value === 'offline') toast.error('API 未配置', '请先在「设置」中填写 baseUrl 与 Key')
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
    toast.info('正在生成中，请稍候')
    return
  }

  const target = messages.value.find(
    (message): message is ChatUserMessage =>
      message.id === userMessageId && message.role === 'user',
  )

  if (!target) {
    toast.error('找不到对应的用户消息')
    return
  }

  if (healthStatus.value === 'offline') {
    toast.error('API 未配置', '请先在「设置」中填写 baseUrl 与 Key')
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
    referenceImages: target.referenceImages?.length ? target.referenceImages.slice() : undefined,
  }

  await runGeneration({ payload, userMessageId })
}

function sendFromChat() {
  vibrate('tap')
  void handleGenerate({ clearAfter: true })
}

function pickStyleFromChat(value: ImageStyle) {
  const preset = stylePresetById.get(value)
  if (!preset) return
  if (style.value !== value) {
    skipNextStyleSync = true
    style.value = value
  }
  if (preset.examplePrompt) {
    prompt.value = preset.examplePrompt
    templateAnchorPrompt.value = preset.examplePrompt
    if (preset.defaultSize) size.value = preset.defaultSize
  }
  nextTick(() => chatDockRef.value?.focusInput?.())
}

function handleStyleSheetSelect(payload: { style: ImageStyle; mode: 'apply' | 'switch' }) {
  const preset = stylePresetById.get(payload.style)
  if (!preset) return
  const styleChanged = style.value !== payload.style

  if (payload.mode === 'apply') {
    skipNextStyleSync = true
    style.value = payload.style
    if (preset.examplePrompt) {
      prompt.value = preset.examplePrompt
      templateAnchorPrompt.value = preset.examplePrompt
      if (preset.defaultSize) size.value = preset.defaultSize
      vibrate('success')
      toast.success('已套用模板', `${preset.label} · 输入框已写入示例`)
    } else {
      vibrate('tap')
      toast.info('已切换为「不套模板」', '直接发送你的原始提示词，不附加风格指引')
    }
    nextTick(() => chatDockRef.value?.focusInput?.())
    return
  }

  if (styleChanged) {
    skipNextStyleSync = true
    style.value = payload.style
  }
  vibrate('tap')
  if (payload.style === 'raw') {
    toast.info('已切换为「不套模板」', '原始提示词将被原样发送')
  } else {
    toast.info('已切换画面气质', `${preset.label} · 保留你已写的提示词`)
  }
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

async function restoreHistory(item: GenerationHistoryItem) {
  item = (await hydrateHistoryImages([item]))[0] || item
  prompt.value = item.prompt
  templateAnchorPrompt.value = item.prompt
  if (style.value !== item.style) {
    skipNextStyleSync = true
  }
  style.value = item.style
  size.value = item.size
  count.value = item.count
  outputFormat.value = item.outputFormat
  clearComposerReferenceImages()
  negativePrompt.value = item.negativePrompt || ''
  quality.value = item.quality || 'auto'
  creativity.value = item.creativity ?? 7
  seed.value = item.seed || ''
  const restoredModel = (item.model || '').trim()
  if (!restoredModel) {
    modelChoice.value = ''
    customModel.value = ''
  } else if (discoveredModels.mergedModelOptions.value.some((option) => option.value === restoredModel)) {
    modelChoice.value = restoredModel
    customModel.value = ''
  } else {
    modelChoice.value = customModelSentinel
    customModel.value = restoredModel
  }
  errorMessage.value = ''
  historyOpen.value = false
  messages.value = historyMessages(item)

  if (item.images && item.images.length) {
    images.value = item.images
    activeImageIndex.value = 0
    lastRequestId.value = item.requestId || ''
    toast.info(
      '已恢复历史生成',
      item.referenceImageCount
        ? `${item.images.length} 张图片已加载到画布 · 参考图需重新上传`
        : `${item.images.length} 张图片已加载到画布`,
    )
  } else {
    images.value = []
    activeImageIndex.value = 0
    lastRequestId.value = item.requestId || ''
    const hadImages = item.imageCount > 0
    toast.info(
      hadImages ? '图片缓存已失效' : '已恢复历史参数',
      hadImages
        ? '已恢复提示词和参数，可重新生成'
        : item.referenceImageCount
        ? '该历史的参考图不会保存在本地，请重新上传后再生成'
        : '该历史未保存图片，重新生成可再得一次',
    )
  }

  nextTick(() => chatStreamRef.value?.scrollToBottom?.(false))
}

function resetDraft() {
  clearDraft()
  prompt.value = defaultPrompt
  templateAnchorPrompt.value = defaultPrompt
  negativePrompt.value = defaultNegativePrompt
  clearComposerReferenceImages()
  if (style.value !== 'poster') {
    skipNextStyleSync = true
  }
  style.value = 'poster'
  size.value = '1024x1024'
  count.value = 1
  outputFormat.value = 'png'
  quality.value = 'auto'
  creativity.value = 7
  seed.value = ''
  modelChoice.value = ''
  customModel.value = ''
  errorMessage.value = ''
  images.value = []
  activeImageIndex.value = 0
  messages.value = []
  pendingContinuation.value = null
  lastEnhanceResult.value = null
  lastRequestId.value = ''
  elapsedSeconds.value = 0
  toast.info(t('toast.draftReset'))
}

function clearLocalHistory() {
  clearHistory()
  history.value = []
  toast.info(t('toast.historyCleared'))
}

function openImage(image: GeneratedImage) {
  const source = resolveImageSource(image)

  if (!source) {
    toast.error('这张图片没有可打开地址')
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
  } catch {
    toast.error(t('toast.copyFailed'))
  }
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
  toast.success('参数已导出', 'JSON')
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
      loadStyleSheet(),
      loadSettingsDialog(),
      loadHistoryDialog(),
      loadLightbox(),
      loadCommandPalette(),
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
  if (lastEnhanceResult.value && value !== lastEnhanceResult.value.enhanced) {
    lastEnhanceResult.value = null
  }
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
      label: '手动编辑',
    })
  }, 1200)
})

watch(style, (newValue, oldValue) => {
  if (newValue === oldValue) return
  if (skipNextStyleSync) {
    skipNextStyleSync = false
    return
  }
  const preset = stylePresetById.get(newValue)
  if (!preset) return
  const canReplacePrompt = !prompt.value.trim() || prompt.value === templateAnchorPrompt.value
  if (newValue === 'raw') {
    toast.info('已切换为「不套模板」', '直接发送你的原始提示词，不附加风格指引')
    return
  }
  if (!preset.examplePrompt) {
    toast.info('已切换提示词模板', `${preset.label} · ${preset.accent}`)
    return
  }
  if (canReplacePrompt) {
    prompt.value = preset.examplePrompt
    templateAnchorPrompt.value = preset.examplePrompt
    if (preset.defaultSize) size.value = preset.defaultSize
    toast.info('已切换提示词模板', `${preset.label} · 输入框已更新`)
  } else {
    toast.info('已切换画面气质', `${preset.label} · 保留你已写的提示词`)
  }
})

watch(isDesktop, (desktop) => {
  if (desktop) {
    styleSheetOpen.value = false
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
      label: '初始',
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
  <div class="paper-bg relative flex min-h-dvh flex-col overflow-x-hidden bg-paper text-ink" :style="mobileRootStyle">
    <a
      href="#canvas"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
    >
      {{ t('app.skipToCanvas') }}
    </a>

    <AppHeader
      :health-status="healthStatus"
      :health-message="healthMessage"
      :theme="theme"
      @refresh-health="refreshHealth"
      @toggle-theme="toggleTheme"
      @open-history="historyOpen = true"
      @open-settings="settingsOpen = true"
      @open-command-palette="commandPalette.open.value = true"
      @reset="resetDraft"
    />

    <main
      v-if="isDesktop"
      class="desktop-workbench relative z-[2] mx-auto grid w-full max-w-[1680px] flex-1 gap-6 px-8 pb-10 pt-7 xl:gap-7 2xl:px-10"
      :class="isWideDesktop
        ? 'grid-cols-[minmax(340px,420px)_minmax(0,1fr)_minmax(280px,340px)]'
        : 'grid-cols-[minmax(360px,440px)_minmax(0,1fr)]'
      "
    >
      <section class="studio-panel reveal touch-scroll-y" style="--reveal-delay: 40ms;">
        <PromptComposer
          ref="composerRef"
          v-model:prompt="prompt"
          v-model:imageStyle="style"
          v-model:size="size"
          v-model:count="count"
          v-model:modelChoice="modelChoice"
          v-model:customModel="customModel"
          :reference-images="referenceImages"
          :is-generating="isGenerating"
          :elapsed-seconds="elapsedSeconds"
          :can-generate="canGenerate"
          :health-offline="healthStatus === 'offline'"
          :continuation="pendingContinuation"
          :can-undo-enhance="!!lastEnhanceResult"
          :quality="quality"
          :model-name="selectedModelLabel"
          :prompt-context="promptContext"
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
          @magic-enhance="handleMagicEnhance"
          @magic-ab-test="handleMagicAbTest"
          @toast-info="(title: string, message?: string) => toast.info(title, message)"
          @undo-enhance="handleUndoEnhance"
          @tree-undo="handleTreeUndo"
          @tree-redo="handleTreeRedo"
          @tree-jump="handleTreeJump"
          @tree-branch="handleTreeBranch"
          @tree-clear="handleTreeClear"
          @clear="lastEnhanceResult = null"
          @cancel-continuation="handleCancelContinuation"
        />
      </section>

      <section id="canvas" class="studio-stage reveal" style="--reveal-delay: 120ms;">
        <CanvasStage
          :images="images"
          :active-image-index="activeImageIndex"
          :is-generating="isGenerating"
          :elapsed-seconds="elapsedSeconds"
          :error-message="errorMessage"
          :last-request-id="lastRequestId"
          :size="size"
          :style-label="selectedStyleLabel"
          :model-label="selectedModelLabel"
          :prompt-preview="promptPreview"
          :has-prompt="trimmedPrompt.length >= 4"
          :quick-prompts="quickPromptCards"
          :provider-configured="provider.isConfigured.value"
          @select="(index) => (activeImageIndex = index)"
          @open-lightbox="(index) => lightbox.open(images, index)"
          @download="downloadImage"
          @open="openImage"
          @copy="copyToClipboard"
          @export="exportCurrentConfig"
          @go-compose="focusPrompt"
          @pick-prompt="handlePickQuickPrompt"
          @remix="(image, index) => handleRemix(image, prompt, lastRequestId || 'canvas', index)"
          @generate="handleGenerate"
          @abort="handleAbortGeneration"
          @open-settings="settingsOpen = true"
          @drop-reference-images="addReferenceImages"
        />
      </section>

      <ActivitySidebar
        v-if="isWideDesktop"
        :history="history"
        :is-generating="isGenerating"
        :elapsed-seconds="elapsedSeconds"
        :prompt-preview="promptPreview"
        :selected-request-id="lastRequestId"
        @restore="restoreHistory"
        @open-history="historyOpen = true"
        @copy="copyToClipboard"
      />

    </main>

    <footer
      class="hidden"
    >
      <span class="inline-flex items-center justify-center gap-2">
        <span>crafted local · {{ new Date().getFullYear() }}</span>
        <span class="text-line">/</span>
        <span>所有数据仅在你的浏览器与服务商之间流动</span>
      </span>
    </footer>

    <div v-if="!isDesktop" class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ChatStream
        ref="chatStreamRef"
        :messages="messages"
        :mobile-bottom-padding="mobileChatBottomPadding"
        :jump-bottom="mobileJumpButtonBottom"
        :provider-configured="provider.isConfigured.value"
        @retry="regenerateFromMessage"
        @open-image="lightbox.open"
        @download="downloadImage"
        @copy="copyToClipboard"
        @remix="handleRemix"
        @import-prompt="handleImportPrompt"
        @pick-suggestion="handlePickSuggestion"
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
      :current-style="style"
      :reference-images="referenceImages"
      :keyboard-inset="mobileDockKeyboardInset"
      :viewport-height="mobileViewportHeight ?? undefined"
      :continuation="pendingContinuation"
      :can-undo-enhance="!!lastEnhanceResult"
      :size="size"
      :quality="quality"
      :model-name="selectedModelLabel"
      :prompt-context="promptContext"
      @send="sendFromChat"
      @abort="handleAbortGeneration"
      @open-style-sheet="styleSheetOpen = true"
      @layout-change="handleChatDockLayoutChange"
      @select-reference-images="addReferenceImages"
      @remove-reference-image="removeReferenceImage"
      @magic-enhance="handleMagicEnhance"
      @magic-ab-test="handleMagicAbTest"
      @undo-enhance="handleUndoEnhance"
      @cancel-continuation="handleCancelContinuation"
      @jump-to-continuation="handleScrollToMessage"
    />

    <StyleSheet
      v-if="styleSheetOpen"
      v-model:open="styleSheetOpen"
      :current="style"
      :prompt-value="prompt"
      :template-anchor="templateAnchorPrompt"
      @select="handleStyleSheetSelect"
    />

    <SettingsDialog
      v-if="settingsOpen"
      v-model:open="settingsOpen"
      v-model:negativePrompt="negativePrompt"
      v-model:outputFormat="outputFormat"
      v-model:quality="quality"
      v-model:creativity="creativity"
      v-model:seed="seed"
      v-model:modelChoice="modelChoice"
      v-model:customModel="customModel"
      @export="exportCurrentConfig"
      @reset="resetDraft"
      @reset-provider="toast.info(t('toast.providerCleared'), t('toast.providerClearedHint'))"
      @test-result="handleProviderTestResult"
    />

    <HistoryDialog
      v-if="historyOpen"
      v-model:open="historyOpen"
      :history="history"
      @restore="restoreHistory"
      @clear="clearLocalHistory"
    />

    <CommandPalette
      v-if="commandPalette.open.value"
      v-model:open="commandPalette.open.value"
      :install-available="installPrompt.available.value"
      @pick-style="(value) => (style = value)"
      @pick-size="(value) => (size = value)"
      @open-history="historyOpen = true"
      @open-settings="settingsOpen = true"
      @open-style-sheet="styleSheetOpen = true"
      @open-shortcuts="shortcutsDialog.open.value = true"
      @open-onboarding="onboarding.start()"
      @install-app="() => { void installPrompt.prompt() }"
      @toggle-theme="toggleTheme"
      @reset="resetDraft"
      @generate="handleGenerate"
      @focus-prompt="focusPrompt"
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

    <Lightbox v-if="lightbox.state.open" />

    <Toaster />
  </div>
</template>
