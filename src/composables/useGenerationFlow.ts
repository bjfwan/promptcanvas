import { onUnmounted, type Ref } from 'vue'
import { ApiRequestError, PROVIDER_NOT_CONFIGURED, generateImage } from '../api'
import { payloadToMeta } from '../lib/chatMessage'
import { createId } from '../lib/id'
import { t } from '../lib/i18n'
import { useResolutionSupport } from './useResolutionSupport'
import { prependHistory } from '../storage'
import type {
  ChatAssistantMessage,
  ChatMessage,
  ChatProgressOverride,
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
  generationProgressOverride: Ref<ChatProgressOverride | undefined>
  isGenerating: Ref<boolean>
  history: Ref<GenerationHistoryItem[]>
  settingsOpen: Ref<boolean>
  toast: Toast
  vibrate: Vibrate
  primeGeneratedImages: (list: GeneratedImage[]) => void
}

const downloadProgressMinBytes = 256 * 1024
const downloadProgressMinMs = 160

export function useGenerationFlow(deps: GenerationFlowDeps) {
  let timerId: number | undefined
  let activeAbortController: AbortController | null = null
  const resolutionSupport = useResolutionSupport()

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
    deps.generationProgressOverride.value = undefined
    deps.elapsedSeconds.value = 0

    deps.settingsOpen.value = false

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

    const formatMb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)
    let lastProgressOverride: ChatProgressOverride | undefined
    let lastDownloadProgressAt = 0
    let lastDownloadProgressBytes = -1

    const applyProgressOverride = (override: ChatProgressOverride) => {
      if (
        lastProgressOverride
        && lastProgressOverride.stage === override.stage
        && lastProgressOverride.remainingLabel === override.remainingLabel
        && lastProgressOverride.progress === override.progress
        && lastProgressOverride.previewUrl === override.previewUrl
      ) {
        return
      }

      lastProgressOverride = override
      deps.generationProgressOverride.value = override
      updateAssistantMessage(assistantId, (current) => ({
        ...current,
        progressOverride: override,
      }))
    }

    const shouldApplyDownloadProgress = (bytesReceived: number, bytesTotal?: number) => {
      const now = Date.now()
      const isInitial = bytesReceived === 0 && lastDownloadProgressBytes < 0
      const isComplete = bytesTotal !== undefined && bytesReceived >= bytesTotal
      const enoughBytes = bytesReceived - lastDownloadProgressBytes >= downloadProgressMinBytes
      const enoughTime = now - lastDownloadProgressAt >= downloadProgressMinMs

      if (!isInitial && !isComplete && !enoughBytes && !enoughTime) {
        return false
      }

      lastDownloadProgressAt = now
      lastDownloadProgressBytes = bytesReceived
      return true
    }

    try {
      const result = await generateImage(args.payload, {
        signal: controller.signal,
        onProgress: (event) => {
          if (event.stage === 'awaiting') {
            applyProgressOverride({
              stage: t('generation.progress.connected'),
              remainingLabel: t('generation.progress.preparingFrame'),
            })
          } else if (event.stage === 'downloading') {
            if (!shouldApplyDownloadProgress(event.bytesReceived, event.bytesTotal)) return
            const received = formatMb(event.bytesReceived)
            const remainingLabel = event.bytesTotal
              ? t('generation.progress.receivedOf', { received, total: formatMb(event.bytesTotal) })
              : t('generation.progress.received', { received })
            applyProgressOverride({
              stage: t('generation.progress.finalizing'),
              remainingLabel,
              previewUrl: lastProgressOverride?.previewUrl,
            })
          } else if (event.stage === 'responses_sse') {
            const partial = event.progress.partialImage
            const previewUrl = partial
              ? `data:${partial.mimeType};base64,${partial.b64Json}`
              : lastProgressOverride?.previewUrl
            applyProgressOverride({
              stage: event.progress.label,
              remainingLabel: event.progress.stage === 'completed'
                ? t('generation.progress.showingSoon')
                : t('generation.progress.generating'),
              progress: event.progress.progress,
              previewUrl,
            })
          } else if (event.stage === 'finalizing') {
            applyProgressOverride({
              stage: t('generation.progress.finalizing'),
              remainingLabel: t('generation.progress.showingSoon'),
              progress: Math.max(lastProgressOverride?.progress ?? 0, 96),
              previewUrl: lastProgressOverride?.previewUrl,
            })
          }
        },
      })

      deps.primeGeneratedImages(result.images)
      deps.images.value = result.images
      deps.lastRequestId.value = result.requestId || ''
      // 真实生成成功 → 永久解锁该尺寸所属的分辨率档（最高可信度信号，
      // 胜过能力表与关键词猜测，并清除可能的误锁）。
      try {
        resolutionSupport.learnSuccessfulSize(args.payload.size)
      } catch {}
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
        modelSelection: args.payload.modelSelection,
        transparentBackground: args.payload.transparentBackground,
        streamingWait: args.payload.streamingWait,
        partialPreview: args.payload.partialPreview,
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
        progressOverride: undefined,
      }))
      deps.generationProgressOverride.value = undefined

      deps.vibrate('success')
      deps.toast.success(
        t('generation.generated', { count: result.images.length }),
        result.requestId ? `req ${result.requestId.slice(0, 8)}` : undefined,
      )

      void prependHistory(historyItem).then((next) => {
        deps.history.value = next
      })

    } catch (error) {
      let message = t('generation.errorFallback')
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
        deps.generationProgressOverride.value = undefined
        deps.vibrate('tap')
        deps.toast.info(t('generation.cancelled'), t('generation.cancelledHint'))
        return
      }

      const stuckLabel = lastProgressOverride?.stage
        ? t('generation.stuckAt', { stage: lastProgressOverride.stage })
        : ''
      const displayMessage = `${message}${stuckLabel}`
      deps.errorMessage.value = requestId
        ? t('generation.requestId', { message: displayMessage, requestId })
        : displayMessage
      deps.lastRequestId.value = requestId || ''

      elapsed = computeElapsed()
      deps.elapsedSeconds.value = elapsed
      updateAssistantMessage(assistantId, (current) => ({
        ...current,
        status: 'error',
        errorMessage: displayMessage,
        errorCode: code,
        requestId,
        elapsedSeconds: elapsed,
        progressOverride: undefined,
      }))
      deps.generationProgressOverride.value = undefined

      deps.vibrate('error')
      deps.toast.error(message, requestId ? `req ${requestId.slice(0, 8)}` : undefined)

      if (code === PROVIDER_NOT_CONFIGURED) {
        deps.settingsOpen.value = true
      }

      // 上游明确拒绝了这个尺寸 → 把对应分辨率档锁掉并记住，下次不再让用户选。
      // 这是"自学习"的负向信号：比能力表更可信，因为是真实上游的回答。
      if (code === 'SIZE_NOT_SUPPORTED') {
        const locked = resolutionSupport.learnBlockedSize(args.payload.size)
        if (locked) {
          deps.toast.info(t('generation.sizeLocked'), t('generation.sizeLockedHint'))
        }
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

  return { runGeneration, abortGeneration }
}
