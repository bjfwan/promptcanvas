import { onUnmounted, type Ref } from 'vue'
import { ApiRequestError, PROVIDER_NOT_CONFIGURED, generateImage } from '../api'
import { payloadToMeta } from '../lib/chatMessage'
import { createId } from '../lib/id'
import { recordGenerationToPreference } from '../lib/preferenceLearner'
import { prependHistory } from '../storage'
import type {
  ChatAssistantMessage,
  ChatMessage,
  GeneratedImage,
  GenerateImageRequest,
  GenerationHistoryItem,
} from '../types'
import type { useToast } from './useToast'
import type { useVibration } from './useVibration'

type Toast = ReturnType<typeof useToast>
type Vibrate = ReturnType<typeof useVibration>['vibrate']

export interface GenerationFlowDeps {
  messages: Ref<ChatMessage[]>
  images: Ref<GeneratedImage[]>
  activeImageIndex: Ref<number>
  elapsedSeconds: Ref<number>
  errorMessage: Ref<string>
  lastRequestId: Ref<string>
  isGenerating: Ref<boolean>
  history: Ref<GenerationHistoryItem[]>
  settingsOpen: Ref<boolean>
  styleSheetOpen: Ref<boolean>
  toast: Toast
  vibrate: Vibrate
  primeGeneratedImages: (list: GeneratedImage[]) => void
}

export function useGenerationFlow(deps: GenerationFlowDeps) {
  let timerId: number | undefined
  let activeAbortController: AbortController | null = null

  function updateAssistantMessage(
    id: string,
    mutator: (message: ChatAssistantMessage) => ChatAssistantMessage,
  ) {
    deps.messages.value = deps.messages.value.map((message) =>
      message.id === id && message.role === 'assistant' ? mutator(message) : message,
    )
  }

  async function runGeneration(args: {
    payload: GenerateImageRequest
    userMessageId: string
  }): Promise<void> {
    const meta = payloadToMeta(args.payload)
    const assistantId = createId()
    deps.messages.value = [
      ...deps.messages.value,
      {
        id: assistantId,
        role: 'assistant',
        status: 'pending',
        content: args.payload.prompt,
        createdAt: new Date().toISOString(),
        replyTo: args.userMessageId,
        meta,
        elapsedSeconds: 0,
      },
    ]

    deps.isGenerating.value = true
    deps.errorMessage.value = ''
    deps.images.value = []
    deps.activeImageIndex.value = 0
    deps.lastRequestId.value = ''
    deps.elapsedSeconds.value = 0

    deps.settingsOpen.value = false
    deps.styleSheetOpen.value = false

    if (activeAbortController) {
      activeAbortController.abort()
    }
    activeAbortController = new AbortController()
    const controller = activeAbortController

    const startMs = Date.now()
    const computeElapsed = () => Math.max(0, Math.round((Date.now() - startMs) / 1000))
    let elapsed = 0
    if (timerId) {
      window.clearInterval(timerId)
      timerId = undefined
    }
    timerId = window.setInterval(() => {
      const next = computeElapsed()
      if (next === elapsed) return
      elapsed = next
      deps.elapsedSeconds.value = elapsed
      updateAssistantMessage(assistantId, (current) => ({ ...current, elapsedSeconds: elapsed }))
    }, 1000)

    try {
      const result = await generateImage(args.payload, { signal: controller.signal })

      deps.primeGeneratedImages(result.images)
      deps.images.value = result.images
      deps.lastRequestId.value = result.requestId || ''
      const persistableImages: GeneratedImage[] = result.images
        .filter((image) => Boolean(image.url || image.b64Json))
        .map((image) => ({
          id: image.id,
          url: image.url || null,
          b64Json: image.b64Json || null,
          mimeType: image.mimeType,
          revisedPrompt: image.revisedPrompt,
        }))
      const historyItem: GenerationHistoryItem = {
        prompt: args.payload.prompt,
        style: args.payload.style,
        size: args.payload.size,
        count: args.payload.count,
        outputFormat: args.payload.outputFormat,
        negativePrompt: args.payload.negativePrompt,
        quality: args.payload.quality,
        creativity: args.payload.creativity,
        seed: args.payload.seed,
        model: args.payload.model,
        id: createId(),
        createdAt: new Date().toISOString(),
        requestId: result.requestId,
        imageCount: result.images.length,
        referenceImageCount: args.payload.referenceImages?.length || undefined,
        images: persistableImages.length ? persistableImages : undefined,
        elapsedSeconds: computeElapsed(),
      }

      elapsed = computeElapsed()
      deps.elapsedSeconds.value = elapsed
      updateAssistantMessage(assistantId, (current) => ({
        ...current,
        status: 'success',
        images: result.images,
        requestId: result.requestId,
        elapsedSeconds: elapsed,
      }))

      deps.vibrate('success')
      deps.toast.success(
        `已生成 ${result.images.length} 张`,
        result.requestId ? `req ${result.requestId.slice(0, 8)}` : undefined,
      )

      void prependHistory(historyItem).then((next) => {
        deps.history.value = next
      })

      try {
        recordGenerationToPreference({
          prompt: args.payload.prompt,
          style: args.payload.style,
          size: args.payload.size,
          referenceImageCount: args.payload.referenceImages?.length,
          model: args.payload.model,
        })
      } catch {}
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

      if (code === 'ABORTED') {
        deps.messages.value = deps.messages.value.filter((m) => m.id !== assistantId)
        deps.vibrate('tap')
        deps.toast.info('已取消这次生成', '可以接着改提示词再来一次')
        return
      }

      deps.errorMessage.value = requestId ? `${message}（请求 ID：${requestId}）` : message
      deps.lastRequestId.value = requestId || ''

      elapsed = computeElapsed()
      deps.elapsedSeconds.value = elapsed
      updateAssistantMessage(assistantId, (current) => ({
        ...current,
        status: 'error',
        errorMessage: message,
        errorCode: code,
        requestId,
        elapsedSeconds: elapsed,
      }))

      deps.vibrate('error')
      deps.toast.error(message, requestId ? `req ${requestId.slice(0, 8)}` : undefined)

      if (code === PROVIDER_NOT_CONFIGURED) {
        deps.settingsOpen.value = true
      }
    } finally {
      deps.isGenerating.value = false

      if (timerId) {
        window.clearInterval(timerId)
        timerId = undefined
      }

      if (activeAbortController === controller) {
        activeAbortController = null
      }
    }
  }

  function abortGeneration() {
    if (!activeAbortController || !deps.isGenerating.value) return
    deps.vibrate('tap')
    activeAbortController.abort()
  }

  onUnmounted(() => {
    if (timerId) {
      window.clearInterval(timerId)
      timerId = undefined
    }
  })

  async function runABTest(args: {
    payloadA: GenerateImageRequest
    payloadB: GenerateImageRequest
    userMessageId: string
  }): Promise<void> {
    deps.toast.info('A/B 双轨生成', '先发原始 prompt，再发优化版本')
    await runGeneration({ payload: args.payloadA, userMessageId: args.userMessageId })
    await runGeneration({ payload: args.payloadB, userMessageId: args.userMessageId })
  }

  return { runGeneration, abortGeneration, runABTest }
}
