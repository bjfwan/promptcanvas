import { onUnmounted, watch, type Ref } from 'vue'
import { saveDraft } from '../storage'
import type { GenerateImageRequest, ImageQuality, ImageSize, ImageStyle } from '../types'

type OutputFormat = GenerateImageRequest['outputFormat']

export interface DraftRefs {
  prompt: Ref<string>
  negativePrompt: Ref<string>
  style: Ref<ImageStyle>
  size: Ref<ImageSize>
  count: Ref<number>
  outputFormat: Ref<OutputFormat>
  quality: Ref<ImageQuality>
  creativity: Ref<number>
  seed: Ref<string>
  modelChoice: Ref<string>
  customModel: Ref<string>
}

export function useDraftAutoSave(refs: DraftRefs) {
  let timer: number | undefined

  watch(
    [
      refs.prompt,
      refs.negativePrompt,
      refs.style,
      refs.size,
      refs.count,
      refs.outputFormat,
      refs.quality,
      refs.creativity,
      refs.seed,
      refs.modelChoice,
      refs.customModel,
    ],
    () => {
      if (timer) {
        window.clearTimeout(timer)
      }

      timer = window.setTimeout(() => {
        saveDraft({
          prompt: refs.prompt.value,
          negativePrompt: refs.negativePrompt.value,
          style: refs.style.value,
          size: refs.size.value,
          count: refs.count.value,
          outputFormat: refs.outputFormat.value,
          quality: refs.quality.value,
          creativity: refs.creativity.value,
          seed: refs.seed.value,
          modelChoice: refs.modelChoice.value,
          customModel: refs.customModel.value,
        })
      }, 400)
    },
  )

  onUnmounted(() => {
    if (timer) {
      window.clearTimeout(timer)
      timer = undefined
    }
  })
}
