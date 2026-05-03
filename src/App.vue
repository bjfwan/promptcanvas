<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { resolveImageSource } from './api'
import { customModelSentinel, qualityOptions, sizeOptions, styleOptions, stylePresetById } from './presets'
import { clearDraft, clearHistory, loadDraft, loadHistory } from './storage'
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
import PromptComposer from './components/PromptComposer.vue'
import CanvasStage from './components/CanvasStage.vue'
import Toaster from './components/Toaster.vue'
import Lightbox from './components/Lightbox.vue'
import ChatStream from './components/ChatStream.vue'
import ChatDock from './components/ChatDock.vue'
import StyleSheet from './components/StyleSheet.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import HistoryDialog from './components/HistoryDialog.vue'
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
import { enhancePrompt, undoEnhance, enhanceDimensions, type EnhanceResult } from './lib/magicEnhance'

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
const images = ref<GeneratedImage[]>([])
const activeImageIndex = ref(0)
const isGenerating = ref(false)
const errorMessage = ref('')
const lastRequestId = ref('')
const elapsedSeconds = ref(0)
const history = ref<GenerationHistoryItem[]>(loadHistory())

const toast = useToast()
const { theme, toggle: toggleTheme } = useTheme()
const lightbox = useLightbox()
const provider = useProviderConfig()
const discoveredModels = useDiscoveredModels()
const { vibrate } = useVibration()
const settingsOpen = ref(false)
const historyOpen = ref(false)
const styleSheetOpen = ref(false)
const composerRef = ref<InstanceType<typeof PromptComposer> | null>(null)
const chatDockRef = ref<InstanceType<typeof ChatDock> | null>(null)
const chatStreamRef = ref<{ scrollToMessage?: (id: string) => void } | null>(null)
const messages = ref<ChatMessage[]>([])
const pendingContinuation = ref<ContinuationContext | null>(null)
const mobileDockHeight = ref(180)

const { viewportHeight: mobileViewportHeight, keyboardInset: mobileKeyboardInset } = useMobileViewport()
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
  if (!mobileViewportHeight.value) return undefined
  return {
    minHeight: `${mobileViewportHeight.value}px`,
    height: `${mobileViewportHeight.value}px`,
  }
})
const mobileChatBottomPadding = computed(() => Math.max(120, mobileDockHeight.value + 16))
const mobileJumpButtonBottom = computed(() => {
  const desired = mobileDockHeight.value + 12
  const limit = mobileViewportHeight.value
    ? Math.max(96, Math.round(mobileViewportHeight.value * 0.34))
    : desired
  return Math.max(18, Math.min(desired, limit))
})
let templateAnchorPrompt: string = defaultPrompt
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
    templateAnchorPrompt = restoredDraft.prompt
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

  // 用上一轮的提示词作为起点（用户可继续编辑指令）
  prompt.value = content || prompt.value

  try {
    toast.info('正在准备「接着画」', '把这张图加入参考')
    let blob: Blob
    if (source.startsWith('data:')) {
      const res = await fetch(source)
      blob = await res.blob()
    } else {
      const res = await fetch(source)
      if (!res.ok) throw new Error('远程图片下载失败')
      blob = await res.blob()
    }

    const file = new File([blob], `continue-${Date.now()}.png`, { type: 'image/png' })

    // 接着画时：用这张图替换之前的参考图，避免误用上一轮的素材
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
  prompt.value = result.enhanced
  vibrate('success')

  const dimLabels = result.dimensions
    .map((d) => {
      const meta = enhanceDimensions.find((m) => m.id === d)
      return meta?.label ?? d
    })
    .join('、')
  toast.success('魔法已施展', dimLabels ? `补充了「${dimLabels}」` : '已追加修饰词')
}

function handleUndoEnhance() {
  if (!lastEnhanceResult.value) return
  prompt.value = undoEnhance(lastEnhanceResult.value)
  lastEnhanceResult.value = null
  vibrate('tap')
  toast.info('已撤销魔法增强')
}

function handlePickQuickPrompt(value: string) {
  prompt.value = value
  templateAnchorPrompt = value
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
    templateAnchorPrompt = preset.examplePrompt
    if (preset.defaultSize) size.value = preset.defaultSize
  }
  nextTick(() => chatDockRef.value?.focusInput())
}

async function restoreHistory(item: GenerationHistoryItem) {
  prompt.value = item.prompt
  templateAnchorPrompt = item.prompt
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
    toast.info(
      '已恢复历史参数',
      item.referenceImageCount
        ? '该历史的参考图不会保存在本地，请重新上传后再生成'
        : '该历史未保存图片，重新生成可再得一次',
    )
  }
}

function resetDraft() {
  clearDraft()
  prompt.value = defaultPrompt
  templateAnchorPrompt = defaultPrompt
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
  toast.info('已重置为默认参数')
}

function clearLocalHistory() {
  clearHistory()
  history.value = []
  toast.info('已清空历史')
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
    toast.error('没有可复制的内容')
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    toast.success(message)
  } catch {
    toast.error('复制失败，请手动复制')
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
  if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
    composerRef.value?.focusPrompt()
  } else {
    chatDockRef.value?.focusInput()
  }
}

function handleChatDockLayoutChange(height: number) {
  if (!Number.isFinite(height)) return
  mobileDockHeight.value = Math.max(0, Math.round(height))
}

watch(style, (newValue, oldValue) => {
  if (newValue === oldValue) return
  if (skipNextStyleSync) {
    skipNextStyleSync = false
    return
  }
  const preset = stylePresetById.get(newValue)
  if (!preset) return
  if (newValue === 'raw') {
    toast.info('已切换为「不套模板」', '直接发送你的原始提示词，不附加风格指引')
    return
  }
  if (!preset.examplePrompt) {
    toast.info('已切换提示词模板', `${preset.label} · ${preset.accent}`)
    return
  }
  prompt.value = preset.examplePrompt
  templateAnchorPrompt = preset.examplePrompt
  if (preset.defaultSize) size.value = preset.defaultSize
  toast.info('已切换提示词模板', `${preset.label} · 输入框已更新`)
})

onMounted(() => {
  void refreshHealth({ silent: true })
})
</script>

<template>
  <div class="paper-bg relative flex min-h-dvh flex-col overflow-x-hidden bg-paper text-ink" :style="mobileRootStyle">
    <a
      href="#canvas"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
    >
      跳到画布
    </a>

    <AppHeader
      :health-status="healthStatus"
      :health-message="healthMessage"
      :theme="theme"
      @refresh-health="refreshHealth"
      @toggle-theme="toggleTheme"
      @open-history="historyOpen = true"
      @open-settings="settingsOpen = true"
      @reset="resetDraft"
    />

    <main
      class="relative z-[2] mx-auto hidden w-full max-w-[1560px] flex-1 lg:grid lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] lg:gap-8 lg:px-10 lg:pb-12 lg:pt-8 xl:gap-10 xl:pt-10"
    >
      <section class="hidden reveal lg:block" style="--reveal-delay: 40ms;">
        <PromptComposer
          ref="composerRef"
          v-model:prompt="prompt"
          v-model:style="style"
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
          @generate="handleGenerate"
          @abort="handleAbortGeneration"
          @copy="copyToClipboard"
          @open-settings="settingsOpen = true"
          @select-reference-images="addReferenceImages"
          @remove-reference-image="removeReferenceImage"
          @magic-enhance="handleMagicEnhance"
          @undo-enhance="handleUndoEnhance"
          @cancel-continuation="handleCancelContinuation"
        />
      </section>

      <section id="canvas" class="reveal" style="--reveal-delay: 120ms;">
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
          @select="(index) => (activeImageIndex = index)"
          @open-lightbox="(index) => lightbox.open(images, index)"
          @download="downloadImage"
          @open="openImage"
          @copy="copyToClipboard"
          @export="exportCurrentConfig"
          @go-compose="focusPrompt"
          @pick-prompt="handlePickQuickPrompt"
          @generate="handleGenerate"
          @abort="handleAbortGeneration"
        />
      </section>

    </main>

    <footer
      class="relative z-[2] hidden border-t border-line/70 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center font-mono text-[10px] uppercase tracking-[0.24em] text-muted lg:block"
    >
      <span class="inline-flex items-center justify-center gap-2">
        <span>crafted local · {{ new Date().getFullYear() }}</span>
        <span class="text-line">/</span>
        <span>所有数据仅在你的浏览器与服务商之间流动</span>
      </span>
    </footer>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
      <ChatStream
        ref="chatStreamRef"
        :messages="messages"
        :mobile-bottom-padding="mobileChatBottomPadding"
        :jump-bottom="mobileJumpButtonBottom"
        @retry="regenerateFromMessage"
        @open-image="lightbox.open"
        @download="downloadImage"
        @copy="copyToClipboard"
        @remix="handleRemix"
        @pick-suggestion="handlePickSuggestion"
        @scroll-to-message="handleScrollToMessage"
        @abort="handleAbortGeneration"
      />
    </div>

    <ChatDock
      ref="chatDockRef"
      class="lg:hidden"
      v-model:prompt="prompt"
      v-model:model-choice="modelChoice"
      v-model:custom-model="customModel"
      :is-generating="isGenerating"
      :can-generate="canGenerate"
      :elapsed-seconds="elapsedSeconds"
      :health-offline="healthStatus === 'offline'"
      :current-style="style"
      :reference-images="referenceImages"
      :keyboard-inset="mobileKeyboardInset"
      :viewport-height="mobileViewportHeight ?? undefined"
      :continuation="pendingContinuation"
      :can-undo-enhance="!!lastEnhanceResult"
      @send="sendFromChat"
      @abort="handleAbortGeneration"
      @open-style-sheet="styleSheetOpen = true"
      @layout-change="handleChatDockLayoutChange"
      @select-reference-images="addReferenceImages"
      @remove-reference-image="removeReferenceImage"
      @magic-enhance="handleMagicEnhance"
      @undo-enhance="handleUndoEnhance"
      @cancel-continuation="handleCancelContinuation"
      @jump-to-continuation="handleScrollToMessage"
    />

    <StyleSheet
      v-model:open="styleSheetOpen"
      :current="style"
      @select="(value) => (style = value)"
    />

    <SettingsDialog
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
      @reset-provider="toast.info('已清除 API 凭据', '请重新填写以继续生成')"
      @test-result="handleProviderTestResult"
    />

    <HistoryDialog
      v-model:open="historyOpen"
      :history="history"
      @restore="restoreHistory"
      @clear="clearLocalHistory"
    />

    <Lightbox />

    <Toaster />
  </div>
</template>
