import type {
  ChatMessage,
  ChatMessageMeta,
  GenerateImageRequest,
  ReferenceImageAttachment,
} from '../types'

export function payloadToMeta(payload: GenerateImageRequest): ChatMessageMeta {
  return {
    style: payload.style,
    size: payload.size,
    count: payload.count,
    outputFormat: payload.outputFormat,
    generationMode: payload.referenceImages?.length ? 'reference' : 'text',
    model: payload.model,
    modelSelection: payload.modelSelection,
    transparentBackground: payload.transparentBackground,
    partialPreview: payload.partialPreview,
    streamingWait: payload.streamingWait,
    quality: payload.quality,
    creativity: payload.creativity,
    seed: payload.seed,
    negativePrompt: payload.negativePrompt,
    referenceImageCount: payload.referenceImages?.length || undefined,
  }
}

export function collectMessageReferenceImages(
  messages: readonly ChatMessage[],
): ReferenceImageAttachment[] {
  return messages.flatMap((message) =>
    message.role === 'user' ? (message.referenceImages ?? []) : [],
  )
}
