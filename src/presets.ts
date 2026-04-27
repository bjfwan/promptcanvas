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
      '清晨海边小镇的露天市场，一张原木长桌上摆着当季水果与一杯滴滤咖啡，蒸汽袅袅升起；侧逆的自然柔光，色彩真实但不轻浮，35mm 纪实摄影视角，f/2.0 浅景深焦点落在杯沿，远处摊贩与海雾自然虚化，氛围松弛、生活、可信',
    defaultSize: '1536x1024',
  },
  {
    value: 'poster',
    label: '电影海报',
    description: '强构图，高级标题感',
    accent: '胶片',
    examplePrompt:
      '精品咖啡品牌的竖版宣传海报，主视觉是一杯加冰拿铁立于米色石材台面，玻璃杯壁凝着冷凝水珠；正午自然侧光，米白与焦糖棕的高级双色调，极简衬线排版，画面上 1/3 大面积留白预留品牌标题，下方预留一行小字 slogan 位置，整体克制、温暖、有质感',
    defaultSize: '1024x1536',
  },
  {
    value: 'product',
    label: '产品摄影',
    description: '干净布光，商业质感',
    accent: '棚拍',
    examplePrompt:
      '高端护肤精华液的棚拍产品照，琥珀色半透明玻璃瓶居中，金属滴管盖反射柔光；浅奶油色无缝纸背景，主光是左 45° 大面积柔光箱，右侧一片蜂窝反射补光；产品占画面中央 60%，下方有极浅的椭圆阴影，瓶身反光与液体折射干净锐利，整体如高级杂志广告',
    defaultSize: '1024x1024',
  },
  {
    value: 'portrait',
    label: '人物肖像',
    description: '细腻面部，杂志封面感',
    accent: '封面',
    examplePrompt:
      '25 岁亚洲女性的杂志封面肖像，肩部以上构图，自然棕色微卷长发，米色高领羊绒毛衣；窗光从左侧 30° 落下作为主光，右脸有自然阴影过渡，奶油色无缝背景；85mm 中焦镜头，f/2.0 浅景深，焦点锐利落在右眼，皮肤保留毛孔与雀斑，神情松弛而专注',
    defaultSize: '1024x1536',
  },
  {
    value: 'anime',
    label: '动画插画',
    description: '鲜明色块，角色设计',
    accent: '赛璐璐',
    examplePrompt:
      '原创动画角色设定立绘，全身正面站姿，一个戴黄铜机械耳机的少女发明家，橙色齐耳短发，琥珀色眼睛，白色工装外套配灰蓝衬里，皮带腰间挂满小型黄铜工具；柔和顶光与浅环境色补光，干净赛璐璐线稿，主色为奶白、铁锈橙、雾蓝三色块，背景简化为浅米色纯色，角色自信、好奇',
    defaultSize: '1024x1536',
  },
  {
    value: 'cinematic',
    label: '电影镜头',
    description: '宽银幕，戏剧光线',
    accent: '长镜头',
    examplePrompt:
      '深夜雨后的东亚都市街道，一个穿米色风衣、低头翻看手机的人站在便利店门口，霓虹招牌将“OPEN”字样投在湿地面上；冷青蓝主调与暖橙色霓虹形成冷暖对比，沥青地面有水洼反射街灯，远处车流尾灯被 35mm 镜头压缩为柔和光斑；2.39:1 宽银幕构图，主体偏画面右侧，左侧大面积留出街景纵深，整体如 A24 风格的电影截图',
    defaultSize: '1536x1024',
  },
  {
    value: 'logo',
    label: '品牌标志',
    description: '简洁图形，适合 Logo 灵感',
    accent: '识别度',
    examplePrompt:
      '为名叫 PromptCanvas 的 AI 创意工具设计极简品牌标志，单一图形居中放在纯白背景上；将“画布矩形 + 一束斜向光线 + 一颗小星点”抽象为最简几何符号，使用单色深墨黑，不加渐变与阴影；线条粗细一致，整体可缩小到 32×32 像素仍保持辨识度，可直接用作 App 图标和开源仓库头像，本图不输出任何文字',
    defaultSize: '1024x1024',
  },
  {
    value: 'interior',
    label: '室内空间',
    description: '软装、空间、建筑氛围',
    accent: '空间感',
    examplePrompt:
      '一间日式中古风客厅的建筑摄影，低矮胡桃木茶几与亚麻原色三人沙发，墙边一只米白纸灯笼立地灯，木地板上铺着粗织毛毯；午后斜阳从右侧落地窗洒入，窗外竹影在墙上投下柔动的剪影，空气中可见一丝光尘；24mm 广角不畸变，机位水平略低于茶几高度，画面有一本翻开的书与一杯茶这样的居住痕迹，氛围安静、温暖、克制',
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
export const customModelSentinel = '__custom__'

export const modelOptions: Array<{ value: string; label: string; hint: string }> = [
  { value: '', label: '不指定', hint: '由 API 服务商自行决定模型' },
  { value: 'gpt-image-1024x1024', label: 'gpt-image-1024x1024', hint: '方图专用' },
  { value: 'gpt-image-2', label: 'gpt-image-2', hint: '通用 · 自适应尺寸' },
  { value: 'gpt-image-1536x1024', label: 'gpt-image-1536x1024', hint: '横图专用' },
  { value: 'gpt-image-1024x1536', label: 'gpt-image-1024x1536', hint: '竖图专用' },
  { value: customModelSentinel, label: '自定义…', hint: '手动填写中转站支持的模型名' },
]

export const stylePresetById = new Map(styleOptions.map((preset) => [preset.value, preset]))
export const promptTemplates: PromptTemplate[] = styleOptions.map((preset) => ({
  id: preset.value,
  title: preset.label,
  tone: preset.description,
  prompt: preset.examplePrompt,
  style: preset.value,
  size: preset.defaultSize,
}))
