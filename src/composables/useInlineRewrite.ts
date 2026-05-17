/**
 * Inline AI 改写状态 composable —— 单例，全局唯一。
 *
 * 设计原则（这一版重写）：
 *  - 不再用"displayedPrompt computed"的 hack 切换 textarea 数据源。
 *  - 改写直接修改调用方传入的 prompt ref：流式阶段每来一个 chunk 就写入；
 *    完成后 prompt 已经是最终值，不需要"应用"操作。
 *  - "还原"恢复到 snapshot；"再来"清掉状态后用 snapshot 重启。
 *  - 阶段 A（工具调用研究）期间不动 prompt，让用户看到原文 + ribbon 提示
 *    "正在分析..."；阶段 B 开始时把 prompt 清空，再逐字落下。
 */

import { reactive, ref, watch, computed, type Ref } from 'vue'
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

interface InlineRewriteState {
  phase: Phase
  /** 模型选择 —— 跨组件共享 */
  modelId: RewriteModelId
  /** 改写前的 prompt 快照（用于"还原"） */
  snapshot: string
  /** 工具调用次数（用于 ribbon 显示"已调用 N 个工具"） */
  toolCallCount: number
  /** 错误消息 */
  errorMessage: string
  errorCode: string
  /** 进行中累计耗时（流式期间每 100ms 自更新） */
  elapsedMs: number
  /** 完成耗时（done 时定格） */
  doneElapsedMs: number
}

function readInitialModelId(): RewriteModelId {
  const stored = loadRewriteModelChoice()
  if (stored && stored in REWRITE_MODELS) return stored as RewriteModelId
  return DEFAULT_REWRITE_MODEL
}

const state = reactive<InlineRewriteState>({
  phase: 'idle',
  modelId: readInitialModelId(),
  snapshot: '',
  toolCallCount: 0,
  errorMessage: '',
  errorCode: '',
  elapsedMs: 0,
  doneElapsedMs: 0,
})

const currentController = ref<AbortController | null>(null)
let elapsedTimer: number | undefined
/** 当前 run 的目标 prompt ref（让 abort/revert 也能改写它） */
let currentPromptRef: Ref<string> | null = null
/** ribbon 自动消失计时器 */
let autoDismissTimer: number | undefined

const AUTO_DISMISS_MS = 8000

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

function startAutoDismiss() {
  if (autoDismissTimer) window.clearTimeout(autoDismissTimer)
  autoDismissTimer = window.setTimeout(() => {
    autoDismissTimer = undefined
    // 只有还停在结束态才自动收起，避免覆盖用户后续触发的新 run
    if (state.phase === 'done' || state.phase === 'aborted' || state.phase === 'error') {
      reset()
    }
  }, AUTO_DISMISS_MS) as unknown as number
}

function stopAutoDismiss() {
  if (autoDismissTimer) {
    window.clearTimeout(autoDismissTimer)
    autoDismissTimer = undefined
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
  stopElapsedTicker()
  stopAutoDismiss()
  state.phase = 'idle'
  state.snapshot = ''
  state.toolCallCount = 0
  state.errorMessage = ''
  state.errorCode = ''
  state.elapsedMs = 0
  state.doneElapsedMs = 0
  currentPromptRef = null
}

/** 还原到改写前的 prompt（用户主动点"还原"） */
function revert() {
  if (!currentPromptRef) return
  if (state.snapshot) currentPromptRef.value = state.snapshot
  reset()
}

export interface RunInput {
  promptRef: Ref<string>
  intent: EnhanceIntent
  hasReferenceImages: boolean
  style: ImageStyle
  size: string
  quality: ImageQuality
  modelName?: string
}

async function start(args: RunInput): Promise<void> {
  if (isBusy()) return
  const initial = args.promptRef.value
  if (!initial.trim()) return

  // 取消任何残留
  currentController.value?.abort()
  stopAutoDismiss()
  const controller = new AbortController()
  currentController.value = controller
  currentPromptRef = args.promptRef

  state.phase = 'analyzing'
  state.snapshot = initial
  state.toolCallCount = 0
  state.errorMessage = ''
  state.errorCode = ''
  state.doneElapsedMs = 0
  startElapsedTicker()

  try {
    const result = await runRewrite(
      {
        prompt: initial,
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
          // 进入流式阶段：清空 textarea，让字逐个落下
          if (phase === 'streaming' && currentPromptRef) {
            currentPromptRef.value = ''
          }
        },
        onChunk: ({ fullText }) => {
          // 直接写入用户的 prompt ref —— 这是流式可见的核心
          if (currentPromptRef) currentPromptRef.value = fullText
        },
        onToolCall: () => {
          state.toolCallCount += 1
        },
      },
    )

    // 完成：textarea 已经是最终结果（onChunk 已写完），保险起见再赋一次
    if (currentPromptRef) currentPromptRef.value = result.rewritten
    state.phase = 'done'
    state.doneElapsedMs = result.elapsedMs
    startAutoDismiss()
  } catch (error) {
    if (controller.signal.aborted) {
      // 取消：把 textarea 还原到原文
      if (currentPromptRef) currentPromptRef.value = state.snapshot
      state.phase = 'aborted'
      startAutoDismiss()
    } else if (error instanceof RewriteError) {
      // 失败：还原到原文（用户写的内容不能丢）
      if (currentPromptRef) currentPromptRef.value = state.snapshot
      state.phase = 'error'
      state.errorMessage = error.message
      state.errorCode = error.code
      // 错误不自动消失，等用户处理
    } else {
      if (currentPromptRef) currentPromptRef.value = state.snapshot
      state.phase = 'error'
      state.errorMessage = (error instanceof Error ? error.message : String(error)) || '改写失败'
      state.errorCode = 'UNKNOWN'
    }
  } finally {
    stopElapsedTicker()
    if (currentController.value === controller) currentController.value = null
  }
}

/** "再来一次"：用 snapshot 重新跑 */
async function retry(args: Omit<RunInput, 'promptRef'>): Promise<void> {
  if (!currentPromptRef) return
  const ref = currentPromptRef
  const snap = state.snapshot
  if (!snap) return
  // 把 prompt 还原成原文，再跑（这样 ribbon 显示一致的 snapshot）
  ref.value = snap
  await start({ promptRef: ref, ...args })
}

const isStreaming = computed(() => state.phase === 'analyzing' || state.phase === 'streaming')
const hasResult = computed(() => state.phase === 'done')
const hasError = computed(() => state.phase === 'error')
const isVisible = computed(() => state.phase !== 'idle')

export interface InlineRewriteApi {
  state: InlineRewriteState
  isStreaming: typeof isStreaming
  hasResult: typeof hasResult
  hasError: typeof hasError
  isVisible: typeof isVisible
  start: (args: RunInput) => Promise<void>
  retry: (args: Omit<RunInput, 'promptRef'>) => Promise<void>
  abort: () => void
  revert: () => void
  reset: () => void
  selectModel: (id: RewriteModelId) => void
}

export function useInlineRewrite(): InlineRewriteApi {
  return {
    state,
    isStreaming,
    hasResult,
    hasError,
    isVisible,
    start,
    retry,
    abort,
    revert,
    reset,
    selectModel,
  }
}
