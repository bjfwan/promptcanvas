/**
 * AI 改写引擎 composable —— 封装模型选择、调用流程、状态机。
 *
 * 使用方：MagicEnhanceMenu 顶部新增的"AI 改写"区块。
 *
 * 设计要点：
 * 1. 单例 reactive state（模型选择跨组件共享，刷新仍在）。
 * 2. 调用方法返回 Promise，组件自己控制按钮 disabled / 文案。
 * 3. abort 用 AbortController，取消时不抛错，返回 'aborted'。
 * 4. 错误统一映射成短文案 + code，组件直接显示。
 */

import { reactive, ref, watch } from 'vue'
import { ApiRequestError, chatComplete } from '../api'
import { loadRewriteModelChoice, saveRewriteModelChoice } from '../storage'
import {
  DEFAULT_REWRITE_MODEL,
  REWRITE_MODELS,
  type RewriteModelId,
  type RewriteModelMeta,
} from '../lib/rewriteModels'
import {
  buildSystemPrompt,
  buildUserMessage,
  type BuildUserPromptInput,
} from '../lib/rewritePrompts'
import {
  analyzePromptDoc,
  buildSlotCards,
  type EnhanceIntent,
  type SlotCard,
} from '../lib/magicEnhance'
import type { ImageQuality, ImageStyle } from '../types'

type EngineStatus = 'idle' | 'rewriting' | 'success' | 'error' | 'aborted'

interface EngineState {
  modelId: RewriteModelId
  status: EngineStatus
  /** 上次成功改写的结果，用于"应用"按钮 */
  lastResult: {
    rewritten: string
    original: string
    modelId: RewriteModelId
    elapsedMs: number
    promptTokens?: number
    completionTokens?: number
  } | null
  errorMessage: string
  errorCode: string
}

function isValidModelId(value: string): value is RewriteModelId {
  return value === 'flash' || value === 'haiku'
}

function readInitialModelId(): RewriteModelId {
  const stored = loadRewriteModelChoice()
  return isValidModelId(stored) ? stored : DEFAULT_REWRITE_MODEL
}

const state = reactive<EngineState>({
  modelId: readInitialModelId(),
  status: 'idle',
  lastResult: null,
  errorMessage: '',
  errorCode: '',
})

const currentController = ref<AbortController | null>(null)

watch(
  () => state.modelId,
  (next) => saveRewriteModelChoice(next),
)

export interface RewriteRunInput {
  prompt: string
  intent: EnhanceIntent
  hasReferenceImages: boolean
  style: ImageStyle
  size: string
  quality: ImageQuality
  modelName?: string
}

export type RewriteRunOutcome =
  | { ok: true; rewritten: string; modelId: RewriteModelId; elapsedMs: number }
  | { ok: false; aborted: false; message: string; code: string }
  | { ok: false; aborted: true }

function buildSlotsSummary(args: RewriteRunInput): BuildUserPromptInput['slotsSummary'] {
  try {
    const analysis = analyzePromptDoc({
      prompt: args.prompt,
      style: args.style,
      size: args.size,
      quality: args.quality,
      intent: args.intent,
      modelName: args.modelName,
      hasReferenceImages: args.hasReferenceImages,
    })
    const cards = buildSlotCards(analysis)
    return cards
      .filter((card: SlotCard) => !card.isMissing)
      .map((card) => ({ label: card.label, value: card.value }))
  } catch {
    return undefined
  }
}

async function runRewrite(args: RewriteRunInput): Promise<RewriteRunOutcome> {
  if (!args.prompt.trim()) {
    return { ok: false, aborted: false, message: '先写下提示词', code: 'EMPTY_PROMPT' }
  }

  // Cancel any in-flight rewrite — only one at a time per app.
  currentController.value?.abort()
  const controller = new AbortController()
  currentController.value = controller

  state.status = 'rewriting'
  state.errorMessage = ''
  state.errorCode = ''

  const meta = REWRITE_MODELS[state.modelId]
  const analysis = analyzePromptDoc({
    prompt: args.prompt,
    style: args.style,
    size: args.size,
    quality: args.quality,
    intent: args.intent,
    modelName: args.modelName,
    hasReferenceImages: args.hasReferenceImages,
  })
  const language = analysis.language
  const aspectRatio = analysis.doc.meta.aspectRatio

  const systemPrompt = buildSystemPrompt({
    intent: args.intent,
    hasReferenceImages: args.hasReferenceImages,
    styleId: args.style,
    aspectRatio,
    language,
  })

  const userMessage = buildUserMessage({
    prompt: args.prompt,
    intent: args.intent,
    hasReferenceImages: args.hasReferenceImages,
    aspectRatio,
    styleId: args.style,
    language,
    slotsSummary: buildSlotsSummary(args),
  })

  try {
    const result = await chatComplete(
      {
        model: meta.apiName,
        systemPrompt,
        userMessage,
        temperature: 0.5,
        maxTokens: args.intent === 'edit' ? 300 : 600,
      },
      { signal: controller.signal },
    )

    // If aborted *between* fetch and resolution, prefer aborted outcome.
    if (controller.signal.aborted) {
      state.status = 'aborted'
      return { ok: false, aborted: true }
    }

    state.status = 'success'
    state.lastResult = {
      rewritten: result.content,
      original: args.prompt,
      modelId: meta.id,
      elapsedMs: result.elapsedMs,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    }
    return {
      ok: true,
      rewritten: result.content,
      modelId: meta.id,
      elapsedMs: result.elapsedMs,
    }
  } catch (error) {
    if (controller.signal.aborted) {
      state.status = 'aborted'
      return { ok: false, aborted: true }
    }
    if (error instanceof ApiRequestError) {
      state.status = 'error'
      state.errorMessage = error.message
      state.errorCode = error.code || ''
      return { ok: false, aborted: false, message: error.message, code: error.code || 'UNKNOWN' }
    }
    state.status = 'error'
    state.errorMessage = '改写失败，请重试'
    state.errorCode = 'UNKNOWN'
    return { ok: false, aborted: false, message: '改写失败，请重试', code: 'UNKNOWN' }
  } finally {
    if (currentController.value === controller) {
      currentController.value = null
    }
  }
}

function abortRewrite() {
  currentController.value?.abort()
}

function selectModel(id: RewriteModelId) {
  state.modelId = id
  // 切换模型时清掉残留的错误信息，但保留上次成功结果（对比方便）
  if (state.status === 'error' || state.status === 'aborted') {
    state.status = state.lastResult ? 'success' : 'idle'
    state.errorMessage = ''
    state.errorCode = ''
  }
}

function resetResult() {
  state.lastResult = null
  state.status = 'idle'
  state.errorMessage = ''
  state.errorCode = ''
}

export interface RewriteEngineApi {
  state: EngineState
  currentModel: () => RewriteModelMeta
  selectModel: (id: RewriteModelId) => void
  run: (args: RewriteRunInput) => Promise<RewriteRunOutcome>
  abort: () => void
  reset: () => void
}

export function useRewriteEngine(): RewriteEngineApi {
  return {
    state,
    currentModel: () => REWRITE_MODELS[state.modelId],
    selectModel,
    run: runRewrite,
    abort: abortRewrite,
    reset: resetResult,
  }
}
