import type { ImageQuality, ImageSize, ResolutionTier } from './types'

export const sizeOptions: Array<{ value: ImageSize; label: string; hint: string; tier: ResolutionTier }> = [
  { value: '1024x1024', label: '方图 1:1', hint: '头像、封面、社媒', tier: '1k' },
  { value: '1024x1536', label: '竖图 2:3', hint: '海报、人物、手机壁纸', tier: '1k' },
  { value: '1536x1024', label: '横图 3:2', hint: '横幅、场景、桌面壁纸', tier: '1k' },
  { value: '2048x2048', label: '方图 2K', hint: '高清方图 · 需中转站支持', tier: '2k' },
  { value: '2048x3072', label: '竖图 2K', hint: '高清海报 · 需中转站支持', tier: '2k' },
  { value: '3072x2048', label: '横图 2K', hint: '高清横幅 · 需中转站支持', tier: '2k' },
  { value: '4096x4096', label: '方图 4K', hint: '超清方图 · 需中转站支持', tier: '4k' },
  { value: '4096x6144', label: '竖图 4K', hint: '超清海报 · 需中转站支持', tier: '4k' },
  { value: '6144x4096', label: '横图 4K', hint: '超清横幅 · 需中转站支持', tier: '4k' },
]

export const sizeTierById = new Map<ImageSize, ResolutionTier>(
  sizeOptions.map((option) => [option.value, option.tier]),
)

export const qualityOptions: Array<{ value: ImageQuality; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'low', label: '草稿' },
  { value: 'medium', label: '标准' },
  { value: 'high', label: '高质量' },
]

export const customModelSentinel = '__custom__'
export const autoModelSentinel = '__auto__'
export const relayModelsGroupSentinel = '__relay_models_group__'
export const relayModelsEmptySentinel = '__relay_models_empty__'

export const modelOptions: Array<{ value: string; label: string; hint: string }> = [
  { value: autoModelSentinel, label: '自动选择（推荐）', hint: '根据当前站点能力选择生成方式与模型' },
]
