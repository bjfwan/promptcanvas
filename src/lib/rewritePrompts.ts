/**
 * AI 改写引擎的 system prompt —— 按 intent 严格分流。
 *
 * 这是引擎的灵魂。本地词典之所以让人不爽，根因是它对"P 图"和"生图"
 * 一视同仁地塞 lighting/composition/camera。这里在 LLM 层把意图边界
 * 写死，杜绝模型擅自加无关画面控制。
 */

import type { EnhanceIntent } from './magicEnhance'

interface BuildSystemPromptInput {
  intent: EnhanceIntent
  hasReferenceImages: boolean
  styleId: string
  aspectRatio: string
  language: 'zh' | 'en'
}

/** 生图意图：可以放手扩写画面控制 */
const SYSTEM_CREATE_ZH = `你是 PromptCanvas 的图像 prompt 改写器。
任务：把用户的简短中文描述扩写为一段适合文生图模型的 prompt。

要求：
1. 保留用户已写的所有具体名词与情绪基调，不要替换或删减。
2. 补齐主体、环境、光线、镜头、构图、色彩、氛围这七个维度，但不要堆砌。
3. 控制在 130 字以内，单段，逗号分隔，不要分行/列表/标题。
4. 仅输出改写后的 prompt 文本，不要解释、不要 markdown、不要前后缀。`

/** P图/编辑意图：必须严格保留主体，只改用户指定的部分 */
const SYSTEM_EDIT_ZH = `你是 PromptCanvas 的图像 prompt 改写器，当前任务是「编辑/P图」。

铁则（必须严格遵守）：
1. 用户提供的是"原图描述 + 编辑指令"。你只能改写用户在编辑指令里明确指出的部分。
2. 保留原图的主体、姿态、构图、机位、光线、风格、画幅 —— 这些都不许动。
3. 禁止添加用户没要求的镜头/光位/构图/色彩/材质描述。即使你觉得能让画面更好，也不要加。
4. 改写要短，能用一句话写完就一句话，不超过 80 字。
5. 仅输出改写后的 prompt 文本，不要解释、不要前后缀、不要 markdown。

如果用户的编辑指令不清晰，按你最保守的理解改写，宁可保留原图也不要发挥。`

/** 修图意图：色彩/光感/质感的精修 */
const SYSTEM_RETOUCH_ZH = `你是 PromptCanvas 的图像 prompt 改写器，当前任务是「修图」。

要求：
1. 保留用户原 prompt 的主体与构图描述，原样保留。
2. 只在光线、色彩、材质、氛围这四个维度上做精修扩写。
3. 不要新增镜头/构图/动作描述。
4. 改写后控制在 110 字以内，单段，逗号分隔。
5. 仅输出改写后的 prompt 文本，不要解释、不要前后缀。`

/** 产品/海报/人像/Logo 意图：商业可交付优先 */
const SYSTEM_COMMERCIAL_ZH = `你是 PromptCanvas 的图像 prompt 改写器。

任务：把用户描述扩写为面向商业交付的图像 prompt（产品图 / 海报 / 人像 / Logo 之一）。

要求：
1. 干净、可控、可交付：明确光位、材质、构图、色彩、留白、可读层级。
2. 保留用户写的主体、品牌色、文字（如有）。
3. 控制在 130 字以内，单段，逗号分隔。
4. 仅输出改写后的 prompt 文本，不要解释、不要 markdown。`

const SYSTEM_CREATE_EN = `You are PromptCanvas's image prompt rewriter.

Task: Expand the user's short description into a prompt suitable for a text-to-image model.

Rules:
1. Keep every concrete noun and mood the user wrote.
2. Cover subject, environment, lighting, camera, composition, palette, mood — without padding.
3. Stay under ~120 words, single paragraph, comma separated. No lists, no headings.
4. Output only the rewritten prompt. No explanation, no markdown, no prefixes.`

const SYSTEM_EDIT_EN = `You are PromptCanvas's image prompt rewriter, currently in "edit" mode.

Hard rules:
1. The user gives you "source description + edit instruction". Only rewrite what the edit instruction explicitly asks.
2. Keep the original subject, pose, composition, camera, lighting, style, aspect — all untouched.
3. Do NOT add any camera/lighting/composition/palette/material that the user did not ask for.
4. Be short. One sentence if possible. Never over ~70 words.
5. Output only the rewritten prompt. No explanation, no prefixes, no markdown.`

const SYSTEM_RETOUCH_EN = `You are PromptCanvas's image prompt rewriter, currently in "retouch" mode.

Rules:
1. Keep the original subject and composition unchanged.
2. Only refine lighting, palette, material, mood.
3. Do NOT add new camera/composition/action.
4. Stay under ~100 words, single paragraph.
5. Output only the rewritten prompt. No explanation.`

const SYSTEM_COMMERCIAL_EN = `You are PromptCanvas's image prompt rewriter for commercial delivery (product / poster / portrait / logo).

Rules:
1. Clean, controllable, deliverable: explicit light direction, material, composition, palette, hierarchy.
2. Preserve user's subject, brand colors, text if any.
3. Stay under ~120 words, single paragraph.
4. Output only the rewritten prompt. No explanation, no markdown.`

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  const { intent, language } = input
  if (language === 'zh') {
    if (intent === 'edit') return SYSTEM_EDIT_ZH
    if (intent === 'retouch') return SYSTEM_RETOUCH_ZH
    if (intent === 'product' || intent === 'poster' || intent === 'portrait' || intent === 'logo') {
      return SYSTEM_COMMERCIAL_ZH
    }
    return SYSTEM_CREATE_ZH
  }
  if (intent === 'edit') return SYSTEM_EDIT_EN
  if (intent === 'retouch') return SYSTEM_RETOUCH_EN
  if (intent === 'product' || intent === 'poster' || intent === 'portrait' || intent === 'logo') {
    return SYSTEM_COMMERCIAL_EN
  }
  return SYSTEM_CREATE_EN
}

export interface BuildUserPromptInput {
  prompt: string
  intent: EnhanceIntent
  hasReferenceImages: boolean
  aspectRatio: string
  styleId: string
  language: 'zh' | 'en'
  /** 已识别到的槽位卡片摘要（label → value），可选，作为软提示 */
  slotsSummary?: Array<{ label: string; value: string }>
}

export function buildUserMessage(input: BuildUserPromptInput): string {
  const lines: string[] = []
  const isZh = input.language === 'zh'

  if (input.intent === 'edit' || input.hasReferenceImages) {
    lines.push(isZh ? '【原图描述与编辑指令】' : '[Source description and edit instruction]')
  } else {
    lines.push(isZh ? '【用户描述】' : '[User description]')
  }
  lines.push(input.prompt.trim())

  const meta: string[] = []
  meta.push(isZh ? `画幅：${input.aspectRatio}` : `Aspect: ${input.aspectRatio}`)
  if (input.styleId && input.styleId !== 'raw') {
    meta.push(isZh ? `风格基调：${input.styleId}` : `Style preset: ${input.styleId}`)
  }
  if (input.slotsSummary && input.slotsSummary.length > 0) {
    const filled = input.slotsSummary.filter((slot) => slot.value)
    if (filled.length > 0) {
      meta.push(
        isZh
          ? `已识别到的槽位（仅供参考，不必全部沿用）：${filled.map((s) => `${s.label}=${s.value}`).join('；')}`
          : `Detected slots (advisory): ${filled.map((s) => `${s.label}=${s.value}`).join('; ')}`,
      )
    }
  }
  lines.push('')
  lines.push(meta.join(isZh ? '；' : '; '))

  return lines.join('\n')
}
