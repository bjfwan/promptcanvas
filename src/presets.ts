import type { ImageQuality, ImageSize, ImageStyle, PromptTemplate } from './types'

export interface StylePreset {
  value: ImageStyle
  label: string
  description: string
  accent: string
  examplePrompt: string
  defaultSize: ImageSize
}

export const styleOptions: StylePreset[] = [
  {
    value: 'natural',
    label: '自然写实',
    description: '真实光影，适合日常场景',
    accent: '晨雾',
    examplePrompt:
      '清晨海边的小镇市场，木桌上摆着当地的水果和咖啡，柔和的自然光，真实色彩，纪实摄影质感，浅景深',
    defaultSize: '1536x1024',
  },
  {
    value: 'poster',
    label: '电影海报',
    description: '强构图，高级标题感',
    accent: '胶片',
    examplePrompt:
      '为一家精品咖啡品牌设计一张竖版宣传海报，主视觉是一杯冰拿铁放在米色石材台面上，清晨自然光，极简排版，温暖但高级的色调，画面上方留出标题空间',
    defaultSize: '1024x1536',
  },
  {
    value: 'product',
    label: '产品摄影',
    description: '干净布光，商业质感',
    accent: '棚拍',
    examplePrompt:
      '一瓶高端护肤精华液的商业产品摄影，半透明玻璃瓶，水波纹反光，浅米色背景，柔和棚拍灯光，干净构图，高级品牌质感',
    defaultSize: '1024x1024',
  },
  {
    value: 'portrait',
    label: '人物肖像',
    description: '细腻面部，杂志封面感',
    accent: '封面',
    examplePrompt:
      '一位 25 岁亚洲女性的杂志封面肖像，自然卷发，米色高领毛衣，柔和侧光，奶油色背景，皮肤质感细腻，焦点在眼睛上',
    defaultSize: '1024x1536',
  },
  {
    value: 'anime',
    label: '动画插画',
    description: '鲜明色块，角色设计',
    accent: '赛璐璐',
    examplePrompt:
      '原创动画角色设定图，一个带机械耳机的少女发明家，橙色短发，白色工装外套，腰间挂满小工具，明亮背景，干净线稿，丰富但不杂乱的细节',
    defaultSize: '1024x1536',
  },
  {
    value: 'cinematic',
    label: '电影镜头',
    description: '宽银幕，戏剧光线',
    accent: '长镜头',
    examplePrompt:
      '雨夜的霓虹街道，一个穿风衣的人站在便利店门口，地面有湿润反光，远处汽车灯光虚化，电影截图质感，戏剧性侧光，宽银幕构图',
    defaultSize: '1536x1024',
  },
  {
    value: 'logo',
    label: '品牌标志',
    description: '简洁图形，适合 Logo 灵感',
    accent: '识别度',
    examplePrompt:
      '为一个名叫 PromptCanvas 的 AI 创意工具设计一个极简品牌标志，结合画布、光束和星点元素，单色优先，几何构图，适合应用图标和开源项目头像',
    defaultSize: '1024x1024',
  },
  {
    value: 'interior',
    label: '室内空间',
    description: '软装、空间、建筑氛围',
    accent: '空间感',
    examplePrompt:
      '一个日式中古风客厅，低矮木质家具，亚麻沙发，纸灯笼，窗外有竹影，午后阳光洒入室内，宁静、温暖、真实居住感，广角空间摄影',
    defaultSize: '1536x1024',
  },
]

export const sizeOptions: Array<{ value: ImageSize; label: string; hint: string }> = [
  { value: '1024x1024', label: '方图 1:1', hint: '头像、封面、社媒' },
  { value: '1024x1536', label: '竖图 2:3', hint: '海报、人物、手机壁纸' },
  { value: '1536x1024', label: '横图 3:2', hint: '横幅、场景、桌面壁纸' },
]

export const qualityOptions: Array<{ value: ImageQuality; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'low', label: '草稿' },
  { value: 'medium', label: '标准' },
  { value: 'high', label: '高质量' },
]

// 当 select 取这个值时，UI 切换到自定义文本框
export const customModelSentinel = '__custom__'

export const modelOptions: Array<{ value: string; label: string; hint: string }> = [
  { value: '', label: '默认（跟随后端）', hint: '使用 Cloudflare 上配置的 OPENAI_IMAGE_MODEL' },
  { value: 'gpt-image-2', label: 'gpt-image-2', hint: '通用 · 自适应尺寸' },
  { value: 'gpt-image-1024x1024', label: 'gpt-image-1024x1024', hint: '方图专用' },
  { value: 'gpt-image-1024x1536', label: 'gpt-image-1024x1536', hint: '竖图专用' },
  { value: 'gpt-image-1536x1024', label: 'gpt-image-1536x1024', hint: '横图专用' },
  { value: customModelSentinel, label: '自定义…', hint: '手动填写中转站支持的模型名' },
]

export const stylePresetById = new Map(styleOptions.map((preset) => [preset.value, preset]))

/**
 * 派生模板：每个风格预设直接映射成一个 PromptTemplate，
 * 这样 LibraryPanel 等老组件继续能消费，又不会出现"模板内容"和"风格示例"两份割裂数据。
 */
export const promptTemplates: PromptTemplate[] = styleOptions.map((preset) => ({
  id: preset.value,
  title: preset.label,
  tone: preset.description,
  prompt: preset.examplePrompt,
  style: preset.value,
  size: preset.defaultSize,
}))
