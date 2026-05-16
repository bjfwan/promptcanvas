import { computed, ref, type Ref } from 'vue'
import { loadBrandKit, saveBrandKit, EMPTY_BRAND_KIT, brandKitHasContent } from '../lib/brandKit'
import { buildSessionProfileWithLongTerm } from '../lib/sessionProfile'
import { parsePrompt } from '../lib/promptParser'
import { inferEnhanceIntent } from '../lib/magicEnhance'
import type { BrandKit, PromptContext, PromptDoc } from '../lib/promptDoc'
import type { ChatUserMessage, ContinuationContext, GenerationHistoryItem, ImageStyle } from '../types'

const brandKitState = ref<BrandKit>(loadBrandKit())

function persistBrandKit(next: BrandKit) {
  brandKitState.value = next
  saveBrandKit(next)
}

export interface PromptContextDeps {
  history: Ref<GenerationHistoryItem[]>
  messages: Ref<Array<ChatUserMessage | { id: string; role: string; content?: string; meta?: { style: ImageStyle; size: string; count: number; quality?: string; model?: string } }>>
  pendingContinuation: Ref<ContinuationContext | null>
}

export function usePromptContext(deps: PromptContextDeps) {
  const sessionProfile = computed(() => buildSessionProfileWithLongTerm(deps.history.value))

  const continuationDoc = computed<PromptDoc | null>(() => {
    const continuation = deps.pendingContinuation.value
    if (!continuation) return null
    const sourceMessage = deps.messages.value.find((message) => message.id === continuation.fromMessageId)
    if (!sourceMessage || sourceMessage.role !== 'user') return null
    const userMessage = sourceMessage as ChatUserMessage
    const sourcePrompt = (userMessage.content || '').trim()
    if (!sourcePrompt) return null
    const meta = userMessage.meta
    return parsePrompt({
      prompt: sourcePrompt,
      style: meta.style,
      size: meta.size,
      quality: meta.quality ?? 'auto',
      intent: inferEnhanceIntent(meta.style, true),
      modelName: meta.model,
      count: meta.count,
    })
  })

  const context = computed<PromptContext>(() => ({
    brand: brandKitState.value.enabled ? brandKitState.value : null,
    session: sessionProfile.value,
    continuation: continuationDoc.value,
  }))

  return {
    brandKit: brandKitState,
    sessionProfile,
    context,
    saveBrandKit: persistBrandKit,
    isBrandKitMeaningful: computed(() => brandKitHasContent(brandKitState.value)),
    emptyBrandKit: () => ({ ...EMPTY_BRAND_KIT }),
  }
}

export function getBrandKit(): BrandKit {
  return brandKitState.value
}
