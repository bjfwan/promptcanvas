/**
 * 提示词工程引擎 → AI 工具桥接层。
 *
 * 这是 PromptCanvas 把内置词典/分析能力封装成 OpenAI function-calling 格式
 * 的"工具货架"。LLM 在改写阶段可以挑工具自取，比裸文本喂上下文准得多。
 *
 * 三个原则：
 *  1. 所有 handler 必须是纯函数，不读 UI 状态、不发网络请求。
 *  2. 工具描述写在这一份文件里，给 LLM 看的 description 要直白 + 给例子。
 *  3. 输入参数 JSON Schema 必须严格，避免 LLM 编造。
 */

import {
  analyzePromptDoc,
  buildSlotCards,
  type EnhanceIntent,
  type SlotCard,
} from './magicEnhance'
import { listCameraRecipes } from './cameraLookbook'
import { getVocab, type Dim, type SK } from './enhanceVocab'
import { lintPrompt } from './promptLint'
import { parsePrompt } from './promptParser'
import type { ImageQuality, ImageStyle } from '../types'

// ── OpenAI function calling type aliases ──

export interface ToolFunctionSpec {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
}

export interface ToolDefinition {
  type: 'function'
  function: ToolFunctionSpec
}

// ── 调用上下文：用户当前的 composer 状态，所有工具默认基于它 ──

export interface ToolContext {
  prompt: string
  style: ImageStyle
  size: string
  quality: ImageQuality
  intent: EnhanceIntent
  hasReferenceImages: boolean
  modelName?: string
}

export interface ToolCallRecord {
  name: string
  argsJson: string
  output: unknown
  errorMessage?: string
}

// ── 安全的 JSON 参数解析 ──

function parseArgs<T>(argsJson: string): T {
  try {
    if (!argsJson || !argsJson.trim()) return {} as T
    return JSON.parse(argsJson) as T
  } catch {
    return {} as T
  }
}

// ────────────────────────────────────────────────────────────────────
//  TOOLS
// ────────────────────────────────────────────────────────────────────

const TOOL_ANALYZE: ToolFunctionSpec = {
  name: 'analyze_prompt',
  description:
    '对当前用户提示词做结构化分析。返回主体类型、语言、缺失的画面控制维度（光、镜头、构图、色彩、材质、氛围）、Lint 问题、推荐的优化档位。第一步几乎一定要先调它。',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
}

interface AnalyzeOutput {
  language: 'zh' | 'en'
  subjectType: string
  subjectLabel: string
  score: number
  recommendedLevel: 'light' | 'standard' | 'heavy'
  presentSlots: string[]
  missingSlots: string[]
  strengths: string[]
  issues: string[]
  estimatedTokens: number
}

function handleAnalyze(ctx: ToolContext): AnalyzeOutput {
  const a = analyzePromptDoc({
    prompt: ctx.prompt,
    style: ctx.style,
    size: ctx.size,
    quality: ctx.quality,
    intent: ctx.intent,
    modelName: ctx.modelName,
    hasReferenceImages: ctx.hasReferenceImages,
  })
  return {
    language: a.language,
    subjectType: a.subjectType,
    subjectLabel: a.subjectLabel,
    score: a.score,
    recommendedLevel: a.recommendedLevel,
    presentSlots: a.presentSlots,
    missingSlots: a.missingSlots,
    strengths: a.strengths,
    issues: a.issues,
    estimatedTokens: a.estimatedTokens,
  }
}

const TOOL_INSPECT_SLOTS: ToolFunctionSpec = {
  name: 'inspect_slots',
  description:
    '把当前提示词拆成 10 个语义槽位（subject / action / environment / lighting / camera / composition / palette / material / mood / styleAnchor），返回每个槽位的当前内容、来源、是否缺失。用来精确知道用户已经写了什么、还差什么。',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
}

interface SlotsOutput {
  slots: Array<{
    name: string
    label: string
    value: string
    source: SlotCard['source']
    isMissing: boolean
  }>
}

function handleInspectSlots(ctx: ToolContext): SlotsOutput {
  const a = analyzePromptDoc({
    prompt: ctx.prompt,
    style: ctx.style,
    size: ctx.size,
    quality: ctx.quality,
    intent: ctx.intent,
    modelName: ctx.modelName,
    hasReferenceImages: ctx.hasReferenceImages,
  })
  const cards = buildSlotCards(a)
  return {
    slots: cards.map((card) => ({
      name: card.slot,
      label: card.label,
      value: card.value,
      source: card.source,
      isMissing: card.isMissing,
    })),
  }
}

const TOOL_LOOKUP_VOCAB: ToolFunctionSpec = {
  name: 'lookup_vocab',
  description:
    '从内置词典里取一个具体维度的可选短语（如"侧逆光勾勒轮廓"）。当你想给画面补一个具体光位/色调/构图描述时调用，避免编造。',
  parameters: {
    type: 'object',
    properties: {
      dimension: {
        type: 'string',
        enum: ['lighting', 'color', 'composition', 'material', 'atmosphere', 'lens'],
        description: '要查的维度',
      },
      subject: {
        type: 'string',
        enum: ['person', 'animal', 'landscape', 'object', 'abstract', 'architecture', 'food', 'general'],
        description: '主体类型，先调 analyze_prompt 拿到 subjectType',
      },
      seed: {
        type: 'string',
        description: '可选：相同 seed 会得到稳定结果；不同 seed 给出不同候选',
      },
    },
    required: ['dimension', 'subject'],
    additionalProperties: false,
  },
}

interface LookupVocabArgs {
  dimension: Dim
  subject: SK
  seed?: string
}

function handleLookupVocab(ctx: ToolContext, args: LookupVocabArgs) {
  const a = analyzePromptDoc({
    prompt: ctx.prompt,
    style: ctx.style,
    size: ctx.size,
    quality: ctx.quality,
    intent: ctx.intent,
    modelName: ctx.modelName,
    hasReferenceImages: ctx.hasReferenceImages,
  })
  const useZh = a.language === 'zh'
  const value = getVocab(args.dimension, args.subject, useZh, args.seed || '')
  return {
    dimension: args.dimension,
    subject: args.subject,
    language: a.language,
    value: value ?? '',
  }
}

const TOOL_CAMERA_RECIPES: ToolFunctionSpec = {
  name: 'list_camera_recipes',
  description:
    '列出可选的镜头配方（焦距 + 光圈 + 拍摄场景），如"85mm f/1.8 浅景深 / 35mm 纪实 / 100mm 微距"。当用户没指定镜头、且 intent 为 portrait/product/cinematic 时建议补一个。',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
}

function handleCameraRecipes(ctx: ToolContext) {
  const a = analyzePromptDoc({
    prompt: ctx.prompt,
    style: ctx.style,
    size: ctx.size,
    quality: ctx.quality,
    intent: ctx.intent,
    modelName: ctx.modelName,
    hasReferenceImages: ctx.hasReferenceImages,
  })
  const recipes = listCameraRecipes(a.language)
  return {
    language: a.language,
    recipes: recipes.map((r) => ({ id: r.id, value: r.value })),
  }
}

const TOOL_LINT: ToolFunctionSpec = {
  name: 'lint_prompt',
  description:
    '检测当前提示词的常见错误（重复修饰、冲突指令、自相矛盾的色调/光位）。在改写之前调一次，避免把已有 lint 问题继承到改写结果里。',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
}

function handleLint(ctx: ToolContext) {
  const doc = parsePrompt({
    prompt: ctx.prompt,
    style: ctx.style,
    size: ctx.size,
    quality: ctx.quality,
    intent: ctx.intent,
    modelName: ctx.modelName,
  })
  const issues = lintPrompt(doc)
  return {
    issues: issues.map((issue) => ({
      id: issue.id,
      severity: issue.severity,
      message: issue.message,
      hint: issue.hint,
    })),
  }
}

// ── 公共出口 ──

export const REWRITE_TOOL_DEFS: ToolDefinition[] = [
  { type: 'function', function: TOOL_ANALYZE },
  { type: 'function', function: TOOL_INSPECT_SLOTS },
  { type: 'function', function: TOOL_LOOKUP_VOCAB },
  { type: 'function', function: TOOL_CAMERA_RECIPES },
  { type: 'function', function: TOOL_LINT },
]

/** 同步执行一个 tool call。所有工具都是纯函数，不会失败抛错。 */
export function executeTool(
  name: string,
  argsJson: string,
  ctx: ToolContext,
): unknown {
  switch (name) {
    case 'analyze_prompt':
      return handleAnalyze(ctx)
    case 'inspect_slots':
      return handleInspectSlots(ctx)
    case 'lookup_vocab':
      return handleLookupVocab(ctx, parseArgs<LookupVocabArgs>(argsJson))
    case 'list_camera_recipes':
      return handleCameraRecipes(ctx)
    case 'lint_prompt':
      return handleLint(ctx)
    default:
      return { error: `未知工具: ${name}` }
  }
}
