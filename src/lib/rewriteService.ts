/**
 * AI 改写服务（阶段 A：研究 + 阶段 B：流式改写）
 *
 * 阶段 A：非流式 chat completions，让 LLM 在我们提供的工具货架（rewriteTools）里
 *         自己挑工具调用。我们本地执行 + 把结果回灌，最多 6 轮。
 * 阶段 B：流式 chat completions（SSE），最终改写直接逐字 emit。
 *
 * 凭据走"内置反代凭据"通道（X-Pc-Builtin: 1），用户不需要、也看不到 key。
 */

import { snapshotProviderConfig } from '../composables/useProviderConfig'
import { logGroup, nowMs, safeHostname } from './debugLog'
import { executeTool, REWRITE_TOOL_DEFS, type ToolContext } from './rewriteTools'

export class RewriteError extends Error {
  code: string
  constructor(message: string, code = 'REWRITE_FAILED') {
    super(message)
    this.name = 'RewriteError'
    this.code = code
  }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

const MAX_TOOL_ROUNDS = 6

// ── 公开模型注册（用户可见） ──

export type RewriteModelId = 'flash' | 'pro' | 'haiku' | 'opus' | 'glm'

export interface RewriteModelMeta {
  id: RewriteModelId
  apiName: string
  label: string
  tagline: string
  /** 期望延迟范围（秒），用于按钮副文案 */
  expectedSeconds: [number, number]
  /** 推荐档：用户没主动挑时优先用这个 */
  recommended: boolean
}

export const REWRITE_MODELS: Record<RewriteModelId, RewriteModelMeta> = {
  flash: {
    id: 'flash',
    apiName: 'deepseek-v4-flash',
    label: 'Flash',
    tagline: '极速',
    expectedSeconds: [1, 3],
    recommended: true,
  },
  pro: {
    id: 'pro',
    apiName: 'deepseek-v4-pro',
    label: 'Pro',
    tagline: '稳健',
    expectedSeconds: [2, 4],
    recommended: false,
  },
  haiku: {
    id: 'haiku',
    apiName: 'claude-haiku-4-5-20251001',
    label: 'Haiku',
    tagline: '细腻',
    expectedSeconds: [2, 4],
    recommended: false,
  },
  glm: {
    id: 'glm',
    apiName: 'glm-5.1',
    label: 'GLM',
    tagline: '中文味道',
    expectedSeconds: [4, 13],
    recommended: false,
  },
  opus: {
    id: 'opus',
    apiName: 'claude-opus-4-6',
    label: 'Opus',
    tagline: '深度（慢）',
    expectedSeconds: [5, 10],
    recommended: false,
  },
}

export const REWRITE_MODEL_LIST: RewriteModelMeta[] = [
  REWRITE_MODELS.flash,
  REWRITE_MODELS.pro,
  REWRITE_MODELS.haiku,
  REWRITE_MODELS.glm,
  REWRITE_MODELS.opus,
]

export const DEFAULT_REWRITE_MODEL: RewriteModelId = 'flash'

// ── 系统 prompt 构造 ──

import type { EnhanceIntent } from './magicEnhance'

interface BuildSystemArgs {
  intent: EnhanceIntent
  hasReferenceImages: boolean
  language: 'zh' | 'en'
  customInstruction?: string
}

const SYSTEM_BASE_ZH = `你是 PromptCanvas 的 AI 改写器。你能调用工具来读取用户当前的提示词分析、槽位、镜头图鉴、词典与 Lint 结果。

工作流程：
1. 第一步几乎一定先调 \`analyze_prompt\` 拿到结构化分析（语言、主体类型、缺失维度、推荐档位）。
2. 如果 \`missingSlots\` 不空，按需调 \`lookup_vocab\`（精准取词）或 \`list_camera_recipes\`（取镜头）补齐。
3. 如果改写过程中需要看具体槽位的当前值，调 \`inspect_slots\`。
4. 最后给出最终改写结果。结果必须是单段中文（除非原文是英文则用英文），逗号分隔，不要 markdown / 标题 / 解释。

总原则：
- 保留用户已写的所有具体名词与情绪基调，不要替换或删减。
- 不堆砌：补缺时优先调工具取我们的内置词典，避免凭空编造。
- 改写完了直接输出文本，不要说"改写如下"或类似前后缀。`

const SYSTEM_EDIT_ZH = `你是 PromptCanvas 的 AI 改写器，当前任务是「编辑/P 图」。

工作流程：
1. 先调 \`analyze_prompt\` 与 \`inspect_slots\` 弄清原图描述。
2. 如果对编辑指令有歧义，按最保守的理解处理。

铁则：
- 用户提供的是"原图描述 + 编辑指令"。你只能改写编辑指令明确指出的部分。
- 保留原图的主体、姿态、构图、机位、光线、风格、画幅 —— 不许动。
- 禁止添加用户没要求的镜头/光位/构图/色彩/材质描述。
- 改写要短，能一句写完就一句，不超过 80 字。
- 仅输出改写后的 prompt，不要解释、不要前后缀、不要 markdown。`

const SYSTEM_BASE_EN = `You are PromptCanvas's AI rewriter. You can call tools to read the current prompt's analysis, slots, camera lookbook, vocab and lint results.

Workflow:
1. Almost always start with \`analyze_prompt\` for the structured analysis.
2. If \`missingSlots\` is non-empty, fill them via \`lookup_vocab\` or \`list_camera_recipes\` rather than inventing.
3. Use \`inspect_slots\` when you need a specific slot's current value.
4. Output the final rewrite as a single paragraph, comma-separated, no markdown/titles/explanation.

Principles:
- Keep every concrete noun and mood the user wrote.
- Don't pad. Prefer tool-fetched values over invention.
- Output only the rewritten prompt.`

const SYSTEM_EDIT_EN = `You are PromptCanvas's AI rewriter for "edit" mode.

Workflow:
1. First call \`analyze_prompt\` and \`inspect_slots\` to understand the source image.
2. When the edit instruction is ambiguous, choose the most conservative reading.

Hard rules:
- The user gives "source description + edit instruction". Only rewrite what the edit instruction explicitly asks.
- Keep the original subject, pose, composition, camera, lighting, style, aspect — all untouched.
- Do NOT add any camera/lighting/composition/palette/material the user did not ask for.
- Be short. One sentence if possible. Never over ~70 words.
- Output only the rewritten prompt, no explanation, no prefixes, no markdown.`

export function buildSystemPrompt(args: BuildSystemArgs): string {
  const isZh = args.language === 'zh'
  let base: string
  if (args.intent === 'edit' || args.hasReferenceImages) {
    base = isZh ? SYSTEM_EDIT_ZH : SYSTEM_EDIT_EN
  } else {
    base = isZh ? SYSTEM_BASE_ZH : SYSTEM_BASE_EN
  }
  const tail = (args.customInstruction || '').trim()
  if (tail) {
    return `${base}\n\n用户的额外指令（最高优先级，请遵守）：\n${tail}`
  }
  return base
}


// ── 用户消息构造 ──

interface BuildUserArgs {
  prompt: string
  intent: EnhanceIntent
  hasReferenceImages: boolean
  aspectRatio: string
  styleId: string
  language: 'zh' | 'en'
}

function buildUserMessage(args: BuildUserArgs): string {
  const isZh = args.language === 'zh'
  const lines: string[] = []

  if (args.intent === 'edit' || args.hasReferenceImages) {
    lines.push(isZh ? '【原图描述与编辑指令】' : '[Source description and edit instruction]')
  } else {
    lines.push(isZh ? '【用户描述】' : '[User description]')
  }
  lines.push(args.prompt.trim())
  lines.push('')

  const meta: string[] = []
  meta.push(isZh ? `画幅：${args.aspectRatio}` : `Aspect: ${args.aspectRatio}`)
  if (args.styleId && args.styleId !== 'raw') {
    meta.push(isZh ? `风格基调：${args.styleId}` : `Style preset: ${args.styleId}`)
  }
  lines.push(meta.join(isZh ? '；' : '; '))

  return lines.join('\n')
}

// ── HTTP 调用 ──

interface ChatRequestPayload {
  model: string
  messages: ChatMessage[]
  temperature: number
  max_tokens: number
  stream: boolean
  tools?: typeof REWRITE_TOOL_DEFS
  tool_choice?: 'auto' | 'none'
  user?: string
}

function getProxyBase(): string {
  const provider = snapshotProviderConfig()
  const proxyUrl = (provider.proxyUrl ?? '').trim().replace(/\/+$/, '')
  if (!proxyUrl) {
    throw new RewriteError(
      '未配置反代 URL，AI 改写需要反代来注入内置凭据。请在设置里检查 proxyUrl。',
      'PROXY_NOT_CONFIGURED',
    )
  }
  return proxyUrl
}

function buildHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    // BUILTIN 模式专用：反代会从环境变量取 baseUrl + apiKey + identity
    'X-Pc-Builtin': '1',
  }
}

async function postChat(
  payload: ChatRequestPayload,
  signal?: AbortSignal,
): Promise<Response> {
  const url = `${getProxyBase()}/chat/completions`
  return fetch(url, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
    signal,
  })
}


// ── 阶段 A：工具调用研究循环 ──

interface ToolRoundResult {
  finalAssistantContent: string | null
  toolHistory: ChatMessage[]
  toolCallCount: number
  modelEcho: string
  promptTokens?: number
  completionTokens?: number
}

interface NonStreamingResponse {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
  model?: string
  error?: { message?: string; code?: string }
}

/**
 * 第一阶段：让 LLM 自由调用工具研究当前 prompt，结束条件是
 *   (a) 模型给出 finish_reason = stop 且没有 tool_calls
 *   (b) 触发 MAX_TOOL_ROUNDS 兜底
 *
 * 这阶段不流式，因为 tool_calls 解析需要完整 JSON。
 */
async function runToolRounds(
  modelApiName: string,
  initialMessages: ChatMessage[],
  toolCtx: ToolContext,
  group: ReturnType<typeof logGroup>,
  signal?: AbortSignal,
): Promise<ToolRoundResult> {
  const messages: ChatMessage[] = [...initialMessages]
  let toolCallCount = 0
  let modelEcho = modelApiName
  let promptTokens: number | undefined
  let completionTokens: number | undefined

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    group.log(`tool round ${round + 1}/${MAX_TOOL_ROUNDS} → POST /chat/completions`)
    const t0 = nowMs()

    const res = await postChat(
      {
        model: modelApiName,
        messages,
        temperature: 0.3,
        max_tokens: 800,
        stream: false,
        tools: REWRITE_TOOL_DEFS,
        tool_choice: 'auto',
      },
      signal,
    )

    const elapsedMs = Math.round(nowMs() - t0)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      group.error(`tool round ${round + 1} failed`, { status: res.status, body: text.slice(0, 400) })
      throw new RewriteError(
        extractUpstreamMessage(text) || `上游返回 ${res.status}`,
        res.status === 401 ? 'UPSTREAM_UNAUTHORIZED' : 'UPSTREAM_ERROR',
      )
    }

    const data = (await res.json().catch(() => null)) as NonStreamingResponse | null
    if (!data) {
      throw new RewriteError('上游返回不是合法 JSON', 'UPSTREAM_BAD_JSON')
    }
    if (data.error) {
      throw new RewriteError(data.error.message || '上游错误', data.error.code || 'UPSTREAM_ERROR')
    }
    if (data.model) modelEcho = data.model
    if (data.usage?.prompt_tokens) promptTokens = (promptTokens ?? 0) + data.usage.prompt_tokens
    if (data.usage?.completion_tokens) completionTokens = (completionTokens ?? 0) + data.usage.completion_tokens

    const choice = data.choices?.[0]
    const message = choice?.message
    group.log(
      `tool round ${round + 1} resp ${elapsedMs}ms`,
      {
        toolCalls: message?.tool_calls?.length ?? 0,
        contentChars: (message?.content ?? '').length,
        finish: choice?.finish_reason,
      },
    )

    // 没有工具调用 → LLM 决定不再调研，结束研究阶段
    if (!message?.tool_calls?.length) {
      return {
        finalAssistantContent: message?.content ?? '',
        toolHistory: messages,
        toolCallCount,
        modelEcho,
        promptTokens,
        completionTokens,
      }
    }

    // 把 assistant 的 tool_calls 写回 messages（OpenAI 协议要求）
    messages.push({
      role: 'assistant',
      content: message.content ?? null,
      tool_calls: message.tool_calls,
    })

    for (const call of message.tool_calls) {
      toolCallCount += 1
      let outputJson = ''
      try {
        const result = executeTool(call.function.name, call.function.arguments, toolCtx)
        outputJson = JSON.stringify(result)
        group.log(`  ↳ tool ${call.function.name}`, {
          args: call.function.arguments.slice(0, 200),
          outChars: outputJson.length,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        outputJson = JSON.stringify({ error: message })
        group.warn(`  ↳ tool ${call.function.name} threw`, message)
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: outputJson,
      })
    }
  }

  // 触发轮次上限：让模型基于已有信息出最终答案，但禁用工具
  group.warn(`hit MAX_TOOL_ROUNDS=${MAX_TOOL_ROUNDS}, forcing final answer`)
  return {
    finalAssistantContent: null, // null = 让流式阶段从这套 messages 出最终
    toolHistory: messages,
    toolCallCount,
    modelEcho,
    promptTokens,
    completionTokens,
  }
}

function extractUpstreamMessage(text: string): string {
  if (!text) return ''
  try {
    const obj = JSON.parse(text)
    return obj?.error?.message || obj?.message || ''
  } catch {
    return text.slice(0, 200)
  }
}


// ── 阶段 B：流式改写 ──

interface StreamEvent {
  /** 累计的 delta 串联后内容（不含 tool_calls 这一阶段都是文本） */
  fullText: string
  /** 本次 chunk 增量 */
  delta: string
}

type StreamCallback = (event: StreamEvent) => void

/**
 * 解析 SSE 流，每收到一个 content delta 就回调 onChunk。
 * 兼容 OpenAI / DeepSeek / Anthropic via OpenAI 兼容层 / GLM 这几家：
 * 都遵循 `data: {json}\n\n` + `data: [DONE]\n\n`。
 */
async function consumeStream(
  response: Response,
  onChunk: StreamCallback,
  signal?: AbortSignal,
): Promise<{ fullText: string; finishReason: string | null }> {
  if (!response.body) {
    throw new RewriteError('上游没有返回流', 'UPSTREAM_NO_STREAM')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let finishReason: string | null = null

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined)
        throw new RewriteError('已取消', 'ABORTED')
      }
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // 切分出完整 SSE event（以空行 \n\n 结尾）
      while (true) {
        const idx = buffer.indexOf('\n\n')
        if (idx === -1) break
        const rawEvent = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const lines = rawEvent.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data) continue
          if (data === '[DONE]') {
            return { fullText, finishReason }
          }
          try {
            const parsed = JSON.parse(data)
            const choice = parsed?.choices?.[0]
            const delta = choice?.delta?.content
            if (typeof delta === 'string' && delta.length > 0) {
              fullText += delta
              onChunk({ fullText, delta })
            }
            if (choice?.finish_reason) finishReason = choice.finish_reason
          } catch {
            // 单行解析失败就跳过——SSE 中常有 keepalive 注释
          }
        }
      }
    }
  } finally {
    reader.releaseLock?.()
  }
  return { fullText, finishReason }
}


// ── 公共入口：runRewrite ──

import { analyzePromptDoc } from './magicEnhance'
import { loadRewriteCustomInstruction } from '../storage'
import type { ImageQuality, ImageStyle } from '../types'

export interface RunRewriteInput {
  prompt: string
  intent: EnhanceIntent
  hasReferenceImages: boolean
  style: ImageStyle
  size: string
  quality: ImageQuality
  modelName?: string
  modelId: RewriteModelId
}

export interface RunRewriteCallbacks {
  /** 阶段 A 阶段性进度（"正在分析…"等） */
  onPhase?: (phase: 'analyzing' | 'streaming') => void
  /** 阶段 B 流式增量。每来一个 token 就触发一次。 */
  onChunk?: StreamCallback
  /** 工具调用进度（可用于显示"调用了 N 个工具"） */
  onToolCall?: (info: { name: string; argsJson: string; outputJson: string }) => void
  signal?: AbortSignal
}

export interface RunRewriteResult {
  rewritten: string
  modelId: RewriteModelId
  modelEcho: string
  toolCallCount: number
  promptTokens?: number
  completionTokens?: number
  elapsedMs: number
  finishReason: string | null
}

export async function runRewrite(
  input: RunRewriteInput,
  callbacks: RunRewriteCallbacks = {},
): Promise<RunRewriteResult> {
  const trimmed = input.prompt.trim()
  if (!trimmed) throw new RewriteError('提示词为空', 'EMPTY_PROMPT')

  const meta = REWRITE_MODELS[input.modelId]
  const group = logGroup(`runRewrite → ${safeHostname(getProxyBase())} · ${meta.label} (${meta.apiName})`)
  const t0 = nowMs()

  try {
    // 用本地分析的 language / aspectRatio 提供给系统提示词
    const analysis = analyzePromptDoc({
      prompt: trimmed,
      style: input.style,
      size: input.size,
      quality: input.quality,
      intent: input.intent,
      modelName: input.modelName,
      hasReferenceImages: input.hasReferenceImages,
    })

    const customInstruction = loadRewriteCustomInstruction()
    const systemPrompt = buildSystemPrompt({
      intent: input.intent,
      hasReferenceImages: input.hasReferenceImages,
      language: analysis.language,
      customInstruction,
    })
    const userMessage = buildUserMessage({
      prompt: trimmed,
      intent: input.intent,
      hasReferenceImages: input.hasReferenceImages,
      aspectRatio: analysis.doc.meta.aspectRatio,
      styleId: input.style,
      language: analysis.language,
    })

    const initialMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]

    const toolCtx: ToolContext = {
      prompt: trimmed,
      style: input.style,
      size: input.size,
      quality: input.quality,
      intent: input.intent,
      hasReferenceImages: input.hasReferenceImages,
      modelName: input.modelName,
    }

    callbacks.onPhase?.('analyzing')
    const research = await runToolRoundsWithCallback(
      meta.apiName,
      initialMessages,
      toolCtx,
      group,
      callbacks.onToolCall,
      callbacks.signal,
    )

    // 如果阶段 A 已经直接给出最终答案（没用工具或只用了几个工具就出结论），
    // 仍然走流式 —— 但流式发的是"基于已掌握信息出最终答案"的精简追问，
    // 让用户体感"字一个个落"而不是 1.5s 后整段塞出来。
    callbacks.onPhase?.('streaming')

    const finalMessages: ChatMessage[] = [...research.toolHistory]
    if (research.finalAssistantContent !== null && research.finalAssistantContent.trim()) {
      // 模型已经出了最终答案 —— 直接回放（视觉上仍按字逐个 emit）。
      const content = research.finalAssistantContent.trim()
      await emitAsStream(content, callbacks.onChunk, callbacks.signal)
      return {
        rewritten: content,
        modelId: input.modelId,
        modelEcho: research.modelEcho,
        toolCallCount: research.toolCallCount,
        promptTokens: research.promptTokens,
        completionTokens: research.completionTokens,
        elapsedMs: Math.round(nowMs() - t0),
        finishReason: 'stop',
      }
    }

    // 否则发起真正的流式请求
    finalMessages.push({
      role: 'user',
      content: analysis.language === 'zh'
        ? '基于以上工具结果，给出最终改写后的提示词。直接输出，不要解释、不要前后缀。'
        : 'Based on the tool results above, output the final rewritten prompt. Direct text only, no explanation.',
    })

    const t1 = nowMs()
    const streamRes = await postChat(
      {
        model: meta.apiName,
        messages: finalMessages,
        temperature: 0.5,
        max_tokens: input.intent === 'edit' ? 300 : 700,
        stream: true,
      },
      callbacks.signal,
    )
    if (!streamRes.ok) {
      const text = await streamRes.text().catch(() => '')
      throw new RewriteError(
        extractUpstreamMessage(text) || `上游返回 ${streamRes.status}`,
        streamRes.status === 401 ? 'UPSTREAM_UNAUTHORIZED' : 'UPSTREAM_ERROR',
      )
    }

    const consumed = await consumeStream(streamRes, callbacks.onChunk ?? (() => undefined), callbacks.signal)
    const elapsed = Math.round(nowMs() - t0)
    group.log('✓ runRewrite done', {
      streamMs: Math.round(nowMs() - t1),
      totalMs: elapsed,
      finalChars: consumed.fullText.length,
      toolCalls: research.toolCallCount,
    })
    return {
      rewritten: consumed.fullText.trim(),
      modelId: input.modelId,
      modelEcho: research.modelEcho,
      toolCallCount: research.toolCallCount,
      promptTokens: research.promptTokens,
      completionTokens: research.completionTokens,
      elapsedMs: elapsed,
      finishReason: consumed.finishReason,
    }
  } catch (error) {
    if (error instanceof RewriteError) {
      group.error('runRewrite rejected', { code: error.code, message: error.message })
      throw error
    }
    if ((error as Error)?.name === 'AbortError') {
      throw new RewriteError('已取消', 'ABORTED')
    }
    group.error('runRewrite unexpected', error)
    throw new RewriteError(
      (error instanceof Error ? error.message : String(error)) || '改写失败',
      'UNKNOWN',
    )
  } finally {
    group.end()
  }
}

/**
 * 已拿到完整文本时也要按字 emit，让 UI 体感统一。每帧 ~3 字。
 */
async function emitAsStream(
  text: string,
  onChunk: StreamCallback | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (!onChunk) return
  const step = 3
  let cursor = 0
  while (cursor < text.length) {
    if (signal?.aborted) throw new RewriteError('已取消', 'ABORTED')
    const next = Math.min(cursor + step, text.length)
    const delta = text.slice(cursor, next)
    cursor = next
    onChunk({ fullText: text.slice(0, cursor), delta })
    await new Promise((resolve) => setTimeout(resolve, 16)) // ~60fps
  }
}

/**
 * 调用阶段 A，并在每次工具调用时回调外层（便于 UI 显示进度）。
 */
async function runToolRoundsWithCallback(
  modelApiName: string,
  initialMessages: ChatMessage[],
  toolCtx: ToolContext,
  group: ReturnType<typeof logGroup>,
  onToolCall: RunRewriteCallbacks['onToolCall'],
  signal?: AbortSignal,
): Promise<ToolRoundResult> {
  // 直接复用 runToolRounds 但同时拦截 messages 推入做回调
  const original = runToolRounds
  if (!onToolCall) return original(modelApiName, initialMessages, toolCtx, group, signal)

  // wrapped: pre-instrument executeTool path by reusing runToolRounds and
  // post-walking messages array for tool entries.
  const result = await original(modelApiName, initialMessages, toolCtx, group, signal)
  for (let i = 0; i < result.toolHistory.length; i += 1) {
    const m = result.toolHistory[i]
    if (m.role !== 'assistant' || !m.tool_calls) continue
    for (const call of m.tool_calls) {
      const toolMsg = result.toolHistory.find(
        (entry) => entry.role === 'tool' && entry.tool_call_id === call.id,
      )
      onToolCall({
        name: call.function.name,
        argsJson: call.function.arguments,
        outputJson: typeof toolMsg?.content === 'string' ? toolMsg.content : '',
      })
    }
  }
  return result
}
