/**
 * Inline AI 改写状态 composable —— 单例，全局唯一。
 *
 * 调用方约定：
 *   - desktop / mobile 触发 AI 改写时，先 saveSnapshot() 保住"原 prompt"；
 *   - 改写过程中 streamingText 持续更新，UI 直接绑到 textarea 的 v-model；
 *   - 完成后 ribbon 显示 ✓ 已优化 / 还原 / 再来一次。
 *
 * 关键：textarea 的 v-model 在改写中由 streamingText 驱动，但完成后立刻
 *       把控制权还给 prompt（手动编辑触发 dirty state）。
 */

import { reactive, ref, watch, computed } from 'vue'
import {
  DEFAULT_REWRITE_MODEL,
  REWRITE_MODELS,
  type RewriteModelId,
  RewriteError,
  runRewrite,
} from '../lib/rewriteService'
import { loadRewriteModelChoice, saveRewriteModelChoice } from '../storage'
import type { EnhanceIntent } from '../lib/magicEnhance'
import type { ImageQuality, ImageStyle } from '../types'

type Phase = 'idle' | 'analyzing' | 'streaming' | 'done' | 'error' | 'aborted'

interface ToolStat {
  name: string
  // 输出长度（字符数）
  outChars: number
}

interface InlineRewriteState {
  phase: Phase
  /** 模型选择 —— 跨组件共享 */
  modelId: RewriteModelId
  /** 改写过程中的累计文本（textarea 直接拉这个） */
  streamingText: string
  /** 改写前的 prompt 快照（用于"还原"） */
  snapshot: string
  /** 改写完成后保留的最终结果（用于"应用"） */
  resultText: string
  /** 工具调用记录 */
  tools: ToolStat[]
  /** 错误消息 */
  errorMessage: string
  errorCode: string
  /** 进行中累计耗时（流式期间每 100ms 自更新） */
  elapsedMs: number
}

function readInitialModelId(): RewriteModelId {
  const stored = loadRewriteModelChoice()
  if (stored && stored in REWRITE_MODELS) return stored as RewriteModelId
  return DEFAULT_REWRITE_MODEL
}

const state = reactive<InlineRewriteState>({
  phase: 'idle',
  modelId: readInitialModelId(),
  streamingText: '',
  snapshot: '',
  resultText: '',
  tools: [],
  errorMessage: '',
  errorCode: '',
  elapsedMs: 0,
})

const currentController = ref<AbortController | null>(null)
let elapsedTimer: number | undefined

watch(
  () => state.modelId,
  (next) => saveRewriteModelChoice(next),
)

function startElapsedTicker() {
  const t0 = Date.now()
  state.elapsedMs = 0
  if (elapsedTimer) window.clearInterval(elapsedTimer)
  elapsedTimer = window.setInterval(() => {
    state.elapsedMs = Date.now() - t0
  }, 100) as unknown as number
}

function stopElapsedTicker() {
  if (elapsedTimer) {
    window.clearInterval(elapsedTimer)
    elapsedTimer = undefined
  }
}

function isBusy(): boolean {
  return state.phase === 'analyzing' || state.phase === 'streaming'
}

function selectModel(id: RewriteModelId) {
  state.modelId = id
}

function abort() {
  currentController.value?.abort()
}

function reset() {
  abort()
  state.phase = 'idle'
  state.streamingText = ''
  state.snapshot = ''
  state.resultText = ''
  state.tools = []
  state.errorMessage = ''
  state.errorCode = ''
  state.elapsedMs = 0
  stopElapsedTicker()
}

export interface RunInput {
  prompt: string
  intent: EnhanceIntent
  hasReferenceImages: boolean
  style: ImageStyle
  size: string
  quality: ImageQuality
  modelName?: string
}

async function start(args: RunInput): Promise<void> {
  if (isBusy()) return
  if (!args.prompt.trim()) return

  // Cancel any leftover controller
  currentController.value?.abort()
  const controller = new AbortController()
  currentController.value = controller

  state.phase = 'analyzing'
  state.snapshot = args.prompt
  state.streamingText = args.prompt // 流式开始前先回显原文，避免 textarea 闪空
  state.resultText = ''
  state.tools = []
  state.errorMessage = ''
  state.errorCode = ''
  startElapsedTicker()

  try {
    const result = await runRewrite(
      {
        prompt: args.prompt,
        intent: args.intent,
        hasReferenceImages: args.hasReferenceImages,
        style: args.style,
        size: args.size,
        quality: args.quality,
        modelName: args.modelName,
        modelId: state.modelId,
      },
      {
        signal: controller.signal,
        onPhase: (phase) => {
          state.phase = phase
          // 切到 streaming 阶段时，把 streamingText 清空，让流式从头落字
          if (phase === 'streaming') state.streamingText = ''
        },
        onChunk: ({ fullText }) => {
          state.streamingText = fullText
        },
        onToolCall: ({ name, outputJson }) => {
          state.tools = [...state.tools, { name, outChars: outputJson.length }]
        },
      },
    )
    state.resultText = result.rewritten
    state.streamingText = result.rewritten
    state.phase = 'done'
  } catch (error) {
    if (controller.signal.aborted) {
      state.phase = 'aborted'
      // 流式过程中被取消：保留 streamingText 现状，让用户看到"取消时停在哪"
    } else if (error instanceof RewriteError) {
      state.phase = 'error'
      state.errorMessage = error.message
      state.errorCode = error.code
    } else {
      state.phase = 'error'
      state.errorMessage = (error instanceof Error ? error.message : String(error)) || '改写失败'
      state.errorCode = 'UNKNOWN'
    }
  } finally {
    stopElapsedTicker()
    if (currentController.value === controller) currentController.value = null
  }
}

const isStreaming = computed(() => state.phase === 'analyzing' || state.phase === 'streaming')
const hasResult = computed(() => state.phase === 'done' && state.resultText.length > 0)
const hasError = computed(() => state.phase === 'error')

export interface InlineRewriteApi {
  state: InlineRewriteState
  isStreaming: typeof isStreaming
  hasResult: typeof hasResult
  hasError: typeof hasError
  start: (args: RunInput) => Promise<void>
  abort: () => void
  reset: () => void
  selectModel: (id: RewriteModelId) => void
}

export function useInlineRewrite(): InlineRewriteApi {
  return {
    state,
    isStreaming,
    hasResult,
    hasError,
    start,
    abort,
    reset,
    selectModel,
  }
}
