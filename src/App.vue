<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ApiRequestError, PROVIDER_NOT_CONFIGURED, generateImage, resolveImageSource, testProvider } from './api'
import { customModelSentinel, qualityOptions, sizeOptions, styleOptions, stylePresetById } from './presets'
import { clearDraft, clearHistory, loadDraft, loadHistory, prependHistory, saveDraft } from './storage'
import type {
  ChatAssistantMessage,
  ChatMessage,
  ChatMessageMeta,
  ChatUserMessage,
  GeneratedImage,
  GenerateImageRequest,
  GenerationHistoryItem,
  ImageQuality,
  ImageSize,
  ImageStyle,
} from './types'
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
const healthStatus = ref<'checking' | 'online' | 'offline'>('checking')
const healthMessage = ref('正在检查 API 配置')
const healthRequestId = ref('')

const toast = useToast()
const { theme, toggle: toggleTheme } = useTheme()
const lightbox = useLightbox()
const provider = useProviderConfig()
const discoveredModels = useDiscoveredModels()
const composerOpen = ref(false)
const settingsOpen = ref(false)
const historyOpen = ref(false)
const styleSheetOpen = ref(false)
const composerRef = ref<InstanceType<typeof PromptComposer> | null>(null)
const chatDockRef = ref<InstanceType<typeof ChatDock> | null>(null)
const messages = ref<ChatMessage[]>([])
// 记录「最近一次由系统/模板写入输入框的 prompt 文本」，供调试与可能的恢复逻辑使用。
// 当前实现：切提示词模板时始终覆盖输入框，使用户「选模板 → 改 → 选另一个模板」这类场景下
// 输入框总能同步到最新模板示例；anchor 同步跟进。
let templateAnchorPrompt: string = defaultPrompt
// 一次性跳过下一次 watch(style) 的自动同步。用于「手动同步」场景（恢复历史 / 重置草稿 /
// 空状态点选建议）：调用者已同步设置了 prompt + anchor + style，不应被 watch 再次覆写。
let skipNextStyleSync = false

const restoredDraft = loadDraft()

if (restoredDraft) {
  if (typeof restoredDraft.prompt === 'string') {
    prompt.value = restoredDraft.prompt
    // 还原草稿时，将 anchor 设为草稿中保存的 prompt：
    // 这样首次切模板时，如果当前内容（= 草稿）等于 anchor，会自然被识别为可覆盖。
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

let timerId: number | undefined
let draftSaveTimer: number | undefined

watch(
  [prompt, negativePrompt, style, size, count, outputFormat, quality, creativity, seed, modelChoice, customModel],
  () => {
    if (draftSaveTimer) {
      window.clearTimeout(draftSaveTimer)
    }

    draftSaveTimer = window.setTimeout(() => {
      saveDraft({
        prompt: prompt.value,
        negativePrompt: negativePrompt.value,
        style: style.value,
        size: size.value,
        count: count.value,
        outputFormat: outputFormat.value,
        quality: quality.value,
        creativity: creativity.value,
        seed: seed.value,
        modelChoice: modelChoice.value,
        customModel: customModel.value,
      })
    }, 400)
  },
)

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

function createId() {
  if ('randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

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
  }
}

function payloadToMeta(payload: GenerateImageRequest): ChatMessageMeta {
  return {
    style: payload.style,
    size: payload.size,
    count: payload.count,
    outputFormat: payload.outputFormat,
    model: payload.model,
    quality: payload.quality,
    creativity: payload.creativity,
    seed: payload.seed,
    negativePrompt: payload.negativePrompt,
  }
}

function updateAssistantMessage(
  id: string,
  mutator: (message: ChatAssistantMessage) => ChatAssistantMessage,
) {
  messages.value = messages.value.map((message) =>
    message.id === id && message.role === 'assistant' ? mutator(message) : message,
  )
}

async function runGeneration(args: {
  payload: GenerateImageRequest
  userMessageId: string
}): Promise<void> {
  const meta = payloadToMeta(args.payload)
  const assistantId = createId()
  messages.value = [
    ...messages.value,
    {
      id: assistantId,
      role: 'assistant',
      status: 'pending',
      createdAt: new Date().toISOString(),
      replyTo: args.userMessageId,
      meta,
      elapsedSeconds: 0,
    },
  ]

  isGenerating.value = true
  errorMessage.value = ''
  images.value = []
  activeImageIndex.value = 0
  lastRequestId.value = ''
  elapsedSeconds.value = 0

  // 关闭可能打开的输入抽屉，让用户立刻看到画布
  composerOpen.value = false
  settingsOpen.value = false
  styleSheetOpen.value = false

  let elapsed = 0
  if (timerId) {
    window.clearInterval(timerId)
    timerId = undefined
  }
  timerId = window.setInterval(() => {
    elapsed += 1
    elapsedSeconds.value = elapsed
    updateAssistantMessage(assistantId, (current) => ({ ...current, elapsedSeconds: elapsed }))
  }, 1000)

  try {
    const result = await generateImage(args.payload)

    images.value = result.images
    lastRequestId.value = result.requestId || ''
    const persistableImages: GeneratedImage[] = result.images
      .filter((image) => typeof image.url === 'string' && image.url.length > 0)
      .map((image) => ({
        id: image.id,
        url: image.url,
        mimeType: image.mimeType,
        revisedPrompt: image.revisedPrompt,
      }))
    history.value = prependHistory({
      ...args.payload,
      id: createId(),
      createdAt: new Date().toISOString(),
      requestId: result.requestId,
      imageCount: result.images.length,
      images: persistableImages.length ? persistableImages : undefined,
    })

    updateAssistantMessage(assistantId, (current) => ({
      ...current,
      status: 'success',
      images: result.images,
      requestId: result.requestId,
      elapsedSeconds: elapsed,
    }))

    toast.success(
      `已生成 ${result.images.length} 张`,
      result.requestId ? `req ${result.requestId.slice(0, 8)}` : undefined,
    )
  } catch (error) {
    let message = '生成失败，请稍后重试。'
    let code: string | undefined
    let requestId: string | undefined

    if (error instanceof ApiRequestError) {
      message = error.message
      code = error.code
      requestId = error.requestId
    } else if (error instanceof Error) {
      message = error.message
    }

    errorMessage.value = requestId ? `${message}（请求 ID：${requestId}）` : message
    lastRequestId.value = requestId || ''

    updateAssistantMessage(assistantId, (current) => ({
      ...current,
      status: 'error',
      errorMessage: message,
      errorCode: code,
      requestId,
      elapsedSeconds: elapsed,
    }))

    toast.error(message, requestId ? `req ${requestId.slice(0, 8)}` : undefined)

    // 凭据未配置：自动打开 Settings，让用户立即修复
    if (code === PROVIDER_NOT_CONFIGURED) {
      settingsOpen.value = true
    }
  } finally {
    isGenerating.value = false

    if (timerId) {
      window.clearInterval(timerId)
      timerId = undefined
    }
  }
}

async function handleGenerate(options?: { clearAfter?: boolean }) {
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

  // 写入用户消息（chat 视图立刻看到）
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

  if (options?.clearAfter) {
    prompt.value = ''
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
  }

  await runGeneration({ payload, userMessageId })
}

function sendFromChat() {
  void handleGenerate({ clearAfter: true })
}

function pickStyleFromChat(value: ImageStyle) {
  // 在空对话流中点击风格建议：手动同步 style + prompt，跳过 watch(style) 的自动逻辑以避免重复 toast。
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

async function fetchAsBlob(url: string, headers?: Record<string, string>): Promise<Blob | null> {
  try {
    const response = await fetch(url, { headers })
    if (!response.ok) return null
    return await response.blob()
  } catch {
    return null
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

async function downloadImage(image: GeneratedImage, index: number) {
  const source = resolveImageSource(image)

  if (!source) {
    toast.error('这张图片没有可下载地址')
    return
  }

  if (source.startsWith('data:')) {
    const response = await fetch(source)
    const blob = await response.blob()
    const ext = (image.mimeType?.split('/')[1] || outputFormat.value).split(';')[0]
    triggerBlobDownload(blob, `promptcanvas-${Date.now()}-${index + 1}.${ext}`)
    toast.success('图片已下载')
    return
  }

  const extension = image.mimeType?.split('/')[1] || outputFormat.value
  const filename = `promptcanvas-${Date.now()}-${index + 1}.${extension}`

  const direct = await fetchAsBlob(source)
  if (direct) {
    triggerBlobDownload(direct, filename)
    toast.success('图片已下载', filename)
    return
  }

  const proxyUrl = (provider.snapshot().proxyUrl || '').trim().replace(/\/+$/, '')
  if (proxyUrl) {
    try {
      const u = new URL(source)
      const upstreamBase = `${u.protocol}//${u.host}`
      const proxiedUrl = `${proxyUrl}${u.pathname}${u.search}`
      const viaProxy = await fetchAsBlob(proxiedUrl, { 'X-Upstream-Base': upstreamBase })
      if (viaProxy) {
        triggerBlobDownload(viaProxy, filename)
        toast.success('图片已下载（经代理）', filename)
        return
      }
    } catch {}
  }

  try {
    const anchor = document.createElement('a')
    anchor.href = source
    anchor.download = filename
    anchor.target = '_blank'
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    toast.info('已在新标签打开', '原站不允许跨域下载，可右键图片另存为')
  } catch {
    window.open(source, '_blank', 'noopener,noreferrer')
  }
}

function restoreHistory(item: GenerationHistoryItem) {
  prompt.value = item.prompt
  // 恢复历史时把 anchor 同步成 item.prompt：用户接下来手动切模板才会覆盖。
  templateAnchorPrompt = item.prompt
  // 同时设置 style 与 prompt，避免 watch(style) 把刚恢复的 prompt 覆写为模板示例。
  if (style.value !== item.style) {
    skipNextStyleSync = true
  }
  style.value = item.style
  size.value = item.size
  count.value = item.count
  outputFormat.value = item.outputFormat
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
  composerOpen.value = false
  historyOpen.value = false

  if (item.images && item.images.length) {
    images.value = item.images
    activeImageIndex.value = 0
    lastRequestId.value = item.requestId || ''
    toast.info('已恢复历史生成', `${item.images.length} 张图片已加载到画布`)
  } else {
    images.value = []
    activeImageIndex.value = 0
    lastRequestId.value = item.requestId || ''
    toast.info('已恢复历史参数', '该历史未保存图片，重新生成可再得一次')
  }
}

function resetDraft() {
  clearDraft()
  prompt.value = defaultPrompt
  templateAnchorPrompt = defaultPrompt
  negativePrompt.value = defaultNegativePrompt
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
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
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

async function refreshHealth(options?: { silent?: boolean }) {
  if (!provider.isConfigured.value) {
    healthStatus.value = 'offline'
    healthRequestId.value = ''
    healthMessage.value = '未配置 API 服务商，请打开「设置」填写 baseUrl 与 Key'
    return
  }

  healthStatus.value = 'checking'
  healthMessage.value = '正在测试连接…'
  healthRequestId.value = ''

  try {
    const result = await testProvider()

    if (result.models?.length) {
      discoveredModels.setModels(result.models)
    }

    if (!result.generationsCorsOk) {
      healthStatus.value = 'offline'
      healthMessage.value = result.message
      if (!options?.silent) {
        toast.error('生成路径 CORS 缺失', '生成会被浏览器拦截，但上游仍会扣费。详见「设置」中的测试面板')
      }
      return
    }

    healthStatus.value = 'online'
    healthMessage.value = result.message

    if (!options?.silent) {
      toast.success('API 连接正常', result.message)
    }
  } catch (error) {
    healthStatus.value = 'offline'

    if (error instanceof ApiRequestError) {
      healthRequestId.value = error.requestId || ''
      healthMessage.value = error.message
      if (!options?.silent) {
        toast.error('API 连接失败', error.message)
      }
      return
    }

    const message = error instanceof Error ? error.message : '连接测试失败'
    healthMessage.value = message
    if (!options?.silent) {
      toast.error('API 连接失败', message)
    }
  }
}

function handleProviderTestResult(payload: { ok: boolean; message: string; code?: string }) {
  if (payload.ok) {
    healthStatus.value = 'online'
    healthMessage.value = payload.message
    healthRequestId.value = ''
  } else {
    healthStatus.value = 'offline'
    healthMessage.value = payload.message
    healthRequestId.value = ''
  }
}


function focusPrompt() {
  // 桌面：focus 左侧 composer；移动：focus 底部 ChatDock 输入
  if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
    composerRef.value?.focusPrompt()
  } else {
    chatDockRef.value?.focusInput()
  }
}

// 切换提示词模板（风格）时的同步逻辑：
//   - skipNextStyleSync 为 true：调用者（历史恢复 / 重置 / 空状态点选建议）已手动同步 prompt + anchor，跳过
//   - 目标为 raw：不动 prompt，仅提示已切为「不套模板」
//   - 目标有 examplePrompt：始终用新模板示例覆盖输入框（即使用户之前在旧模板上做过修改），
//     这样「选模板 A → 改 → 选模板 B」之类的场景下输入框总是跟进到当前模板。
//   - 同时同步 anchor，便于下一次切换仍能识别「模板派生」状态。
// 注：此 watch 在 <script setup> 末尾注册，restoredDraft 阶段对 style 的赋值发生在注册之前，
// 不会触发本 watch；因此无需类似旧版 skipFirstStyleSync 的「首次跳过」标志（旧版会误吃用户首次点击）。
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
  // 始终用新模板的示例覆盖输入框，使「选模板 → 改 → 另选模板」场景中输入框总是同步到当前模板。
  prompt.value = preset.examplePrompt
  templateAnchorPrompt = preset.examplePrompt
  if (preset.defaultSize) size.value = preset.defaultSize
  toast.info('已切换提示词模板', `${preset.label} · 输入框已更新`)
})

onMounted(() => {
  refreshHealth({ silent: true })
})

watch(
  () => provider.isConfigured.value,
  () => {
    refreshHealth({ silent: true })
  },
)

onUnmounted(() => {
  if (timerId) {
    window.clearInterval(timerId)
    timerId = undefined
  }

  if (draftSaveTimer) {
    window.clearTimeout(draftSaveTimer)
    draftSaveTimer = undefined
  }
})
</script>

<template>
  <div class="relative flex min-h-dvh flex-col bg-paper text-ink">
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

    <!-- 桌面布局：>= lg 显示完整工作台 -->
    <main
      class="relative z-[2] mx-auto hidden w-full max-w-[1480px] flex-1 lg:grid lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] lg:gap-10 lg:px-10 lg:pb-12 lg:pt-10"
    >
      <!-- 桌面：左栏 Composer；移动：隐藏（用 dock + sheet 替代） -->
      <section class="hidden reveal lg:block" style="--reveal-delay: 40ms;">
        <PromptComposer
          ref="composerRef"
          v-model:prompt="prompt"
          v-model:style="style"
          v-model:size="size"
          v-model:count="count"
          v-model:modelChoice="modelChoice"
          v-model:customModel="customModel"
          :is-generating="isGenerating"
          :elapsed-seconds="elapsedSeconds"
          :can-generate="canGenerate"
          :health-offline="healthStatus === 'offline'"
          @generate="handleGenerate"
          @copy="copyToClipboard"
          @open-settings="settingsOpen = true"
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
          @select="(index) => (activeImageIndex = index)"
          @open-lightbox="(index) => lightbox.open(images, index)"
          @download="downloadImage"
          @open="openImage"
          @copy="copyToClipboard"
          @export="exportCurrentConfig"
          @go-compose="focusPrompt"
          @generate="handleGenerate"
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

    <!-- 移动端：ChatGPT 式聊天画布（< lg） -->
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
      <ChatStream
        :messages="messages"
        :bottom-padding="180"
        class="flex-1 min-h-0"
        @retry="regenerateFromMessage"
        @open-image="(imgs, index) => lightbox.open(imgs, index)"
        @download="downloadImage"
        @copy="copyToClipboard"
        @pick-suggestion="pickStyleFromChat"
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
      @send="sendFromChat"
      @open-style-sheet="styleSheetOpen = true"
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
