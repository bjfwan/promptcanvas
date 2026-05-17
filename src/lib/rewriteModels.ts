/**
 * AI 改写引擎可选模型 —— 经过实测拍板的两个：
 *
 *   • flash : deepseek-v4-flash    1.4–2.7s · 价格 $2/$2 · 听话紧凑
 *   • haiku : claude-haiku-4-5     2.3–4.1s · 价格 $2/$4 · 描述更"洋气"
 *
 * 两个都通过 Kilo-Code UA 白名单走 agentrouter，由 proxy 注入。
 * 决定不暴露 opus / glm，避免普通用户撞上 13s 推理耗时和 26× 输出费用。
 */

export type RewriteModelId = 'flash' | 'haiku'

export interface RewriteModelMeta {
  id: RewriteModelId
  /** 实际发给 OpenAI 兼容端点的 model 字段 */
  apiName: string
  /** UI 标签，控制台 chip 用 */
  label: string
  /** 一行 hint，在选择器下方/工具提示里使用 */
  tagline: string
  /** 本机 UI 调色，主键色 + 副键色 */
  swatch: { primary: string; secondary: string }
  /** 触感（vibrate label）—— 给 useVibration 用 */
  haptic: 'tap' | 'success'
  /** 估算单次延迟范围（秒），用于按钮加载态文案 */
  expectedSeconds: [number, number]
}

export const REWRITE_MODELS: Record<RewriteModelId, RewriteModelMeta> = {
  flash: {
    id: 'flash',
    apiName: 'deepseek-v4-flash',
    label: 'Flash',
    tagline: '极速 · 听话',
    swatch: { primary: '184 122 71', secondary: '232 197 158' }, // ochre · cream
    haptic: 'tap',
    expectedSeconds: [1, 3],
  },
  haiku: {
    id: 'haiku',
    apiName: 'claude-haiku-4-5-20251001',
    label: 'Haiku',
    tagline: '平衡 · 表达更细',
    swatch: { primary: '52 78 65', secondary: '178 195 184' }, // forest · pale forest
    haptic: 'success',
    expectedSeconds: [2, 4],
  },
}

export const REWRITE_MODEL_LIST: RewriteModelMeta[] = [
  REWRITE_MODELS.flash,
  REWRITE_MODELS.haiku,
]

export const DEFAULT_REWRITE_MODEL: RewriteModelId = 'flash'
