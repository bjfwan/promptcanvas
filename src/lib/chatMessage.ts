import type { ChatMessageMeta, GenerateImageRequest } from '../types'

export function payloadToMeta(payload: GenerateImageRequest): ChatMessageMeta {
  return {
    style: payload.style,
    size: payload.size,
    count: payload.count,
    outputFormat: payload.outputFormat,
    generationMode: payload.referenceImages?.length ? 'reference' : 'text',
    model: payload.model,
    quality: payload.quality,
    creativity: payload.creativity,
    seed: payload.seed,
    negativePrompt: payload.negativePrompt,
    referenceImageCount: payload.referenceImages?.length || undefined,
  }
}
