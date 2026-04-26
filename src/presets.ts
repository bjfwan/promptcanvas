import type { ImageQuality, ImageSize, ImageStyle, PromptTemplate } from './types'

export const styleOptions: Array<{ value: ImageStyle; label: string; description: string; accent: string }> = [
  { value: 'natural', label: '自然写实', description: '真实光影，适合日常场景', accent: '晨雾' },
  { value: 'poster', label: '电影海报', description: '强构图，高级标题感', accent: '胶片' },
  { value: 'product', label: '产品摄影', description: '干净布光，商业质感', accent: '棚拍' },
  { value: 'portrait', label: '人物肖像', description: '细腻面部，杂志封面感', accent: '封面' },
  { value: 'anime', label: '动画插画', description: '鲜明色块，角色设计', accent: '赛璐璐' },
  { value: 'cinematic', label: '电影镜头', description: '宽银幕，戏剧光线', accent: '长镜头' },
  { value: 'logo', label: '品牌标志', description: '简洁图形，适合 Logo 灵感', accent: '识别度' },
  { value: 'interior', label: '室内空间', description: '软装、空间、建筑氛围', accent: '空间感' },
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

export const promptTemplates: PromptTemplate[] = [
  {
    id: 'brand-poster',
    title: '品牌海报',
    tone: '商业、干净、有留白',
    style: 'poster',
    size: '1024x1536',
    prompt: '为一家精品咖啡品牌设计一张竖版宣传海报，主视觉是一杯冰拿铁放在米色石材台面上，清晨自然光，极简排版，温暖但高级的色调，画面上方留出标题空间',
  },
  {
    id: 'product-shot',
    title: '产品棚拍',
    tone: '质感、精致、可电商使用',
    style: 'product',
    size: '1024x1024',
    prompt: '一瓶高端护肤精华液的商业产品摄影，半透明玻璃瓶，水波纹反光，浅米色背景，柔和棚拍灯光，干净构图，高级品牌质感',
  },
  {
    id: 'cinematic-scene',
    title: '电影场景',
    tone: '叙事、光影、氛围感',
    style: 'cinematic',
    size: '1536x1024',
    prompt: '雨夜的霓虹街道，一个穿风衣的人站在便利店门口，地面有湿润反光，远处汽车灯光虚化，电影截图质感，戏剧性侧光，宽银幕构图',
  },
  {
    id: 'character-anime',
    title: '角色设定',
    tone: '鲜明、可爱、有辨识度',
    style: 'anime',
    size: '1024x1536',
    prompt: '原创动画角色设定图，一个带机械耳机的少女发明家，橙色短发，白色工装外套，腰间挂满小工具，明亮背景，干净线稿，丰富但不杂乱的细节',
  },
  {
    id: 'interior-mood',
    title: '室内灵感',
    tone: '自然、安静、生活方式',
    style: 'interior',
    size: '1536x1024',
    prompt: '一个日式中古风客厅，低矮木质家具，亚麻沙发，纸灯笼，窗外有竹影，午后阳光洒入室内，宁静、温暖、真实居住感，广角空间摄影',
  },
  {
    id: 'logo-mark',
    title: 'Logo 灵感',
    tone: '简洁、识别度、矢量感',
    style: 'logo',
    size: '1024x1024',
    prompt: '为一个名叫 PromptCanvas 的 AI 创意工具设计一个极简品牌标志，结合画布、光束和星点元素，单色优先，几何构图，适合应用图标和开源项目头像',
  },
]
