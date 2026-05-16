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
      '清晨六点的海边小镇露天市场，原木长桌摆着当季无花果、桃子与一杯滴滤手冲，咖啡蒸汽在冷空气中拉出可见的白色细线；主光为右后方 15° 低角度侧逆的金色晨阳，给杯沿与果皮镶上柔毛边；35mm 纪实视角，f/2.0 浅景深锁焦杯壁凝水珠，远处摊贩与海雾散景成奶油色光斑；三分构图主体偏左下，右上留白容纳薄雾；米白、青草绿、琥珀棕的真实色调；氛围松弛、可信，带一点未醒的湿润空气感',
    defaultSize: '1536x1024',
  },
  {
    value: 'poster',
    label: '电影海报',
    description: '强构图，高级标题感',
    accent: '胶片',
    examplePrompt:
      '精品咖啡品牌的竖版宣传海报主视觉，一杯加冰拿铁立于米色洞石台面正中偏下，玻璃杯外壁凝着大颗冷凝水珠，冰块清晰可见层次；正午硬质侧光从画面左侧 45° 切入，在杯身右后方投出干净的长椭圆阴影；色调为高级双色——米白 + 焦糖棕，背景为同色系暗角渐隐；上方 1/3 大面积留白预留品牌主标题，下方一条细线 + 极小衬线 slogan 锚点；整体构图对称克制，似 A24 海报的留白节奏，胶片颗粒微弱可见，温暖、高级、有重量感',
    defaultSize: '1024x1536',
  },
  {
    value: 'product',
    label: '产品摄影',
    description: '干净布光，商业质感',
    accent: '棚拍',
    examplePrompt:
      '高端护肤精华液的棚拍商业产品照，琥珀色半透明玻璃瓶居中正放，金属滴管盖反射柔光出一条细高光带，液体在瓶底折射出温暖琥珀环；背景为浅奶油色无缝纸，与桌面同色无接缝；主光是左 45° 90×120cm 大面积柔光箱作为关键光，右侧一片蜂窝栅格反光板补 1/2 档，背后一支裸闪打出隐形分离光勾出瓶肩；产品占画面中央 60%，下方一道极浅且边缘锐利的椭圆接触阴影；整体洁净、冷静，瓶身高光与液体折射干净到可数，呈现高级杂志全幅广告的成片感',
    defaultSize: '1024x1024',
  },
  {
    value: 'portrait',
    label: '人物肖像',
    description: '细腻面部，杂志封面感',
    accent: '封面',
    examplePrompt:
      '25 岁亚洲女性的杂志封面级肖像，肩部以上构图，三七侧脸略转向画面右侧；自然棕色微卷长发披至锁骨，米色高领羊绒毛衣，无饰品；主光为左侧 30° 落地窗光透薄纱柔化，作为关键光，右侧一片白色泡沫板做 1/3 档反射补光，右脸保留自然柔暗过渡；背景为奶油色无缝纸，距人物 2m 形成轻微景深虚化；85mm 中焦镜头，f/2.0，焦点锐利落在右眼，皮肤保留毛孔与细微雀斑，绒毛清晰可见，唇部不打高光；神情松弛、轻轻抿唇，眼神向画面右上方略斜出，整体如纸质期刊大片，色调温润不锐利',
    defaultSize: '1024x1536',
  },
  {
    value: 'anime',
    label: '动画插画',
    description: '鲜明色块，角色设计',
    accent: '赛璐璐',
    examplePrompt:
      '原创动画角色设定立绘，单人全身正面三视图主视角，平视机位；一位 16 岁的少女发明家，戴黄铜机械护耳耳机，琥珀色眼睛带细高光，齐耳橙红色短发尾端微翘；白色双排扣工装外套配雾蓝色衬里翻领，腰侧皮带挂着小型黄铜扳手、放大镜与卷尺；柔和顶光为关键光，前方一档浅奶白环境补光，无强阴影；干净赛璐璐二值上色，线条粗细均匀的黑色描边，主色为奶白、铁锈橙、雾蓝三大块，点缀亮黄铜与暗紫；背景纯浅米色平涂，角色身后一圈极淡的圆形光晕作为视觉聚焦；姿态自信、好奇，重心略前倾，整体如现代日式动画的官方设定集插画',
    defaultSize: '1024x1536',
  },
  {
    value: 'cinematic',
    label: '电影镜头',
    description: '宽银幕，戏剧光线',
    accent: '长镜头',
    examplePrompt:
      '深夜雨后的东亚都市街道，一名穿米色风衣、低头翻看手机的人独自站在 24 小时便利店门口，店内荧光灯将玻璃门反射成冷蓝色长方块；红橙色霓虹招牌「OPEN」字样投在湿沥青地面上，被水洼拉成模糊的倒影；冷青蓝主调与暖橙霓虹形成 8:2 的冷暖对撞，远处车流尾灯被 35mm 镜头压缩成一串散景光斑；2.39:1 宽银幕构图，人物偏画面右侧三分点，左侧大面积留出潮湿街景的纵深；景深较浅，雨丝在霓虹下隐约可见；后期保留电影感的轻微胶片颗粒与微暗角，整体如 A24 都市题材电影截帧，安静、克制、潮湿',
    defaultSize: '1536x1024',
  },
  {
    value: 'logo',
    label: '品牌标志',
    description: '简洁图形，适合 Logo 灵感',
    accent: '识别度',
    examplePrompt:
      '为名叫 PromptCanvas 的 AI 创意工具设计极简品牌图形标志，单一图形居中放在纯白方形画布上，四周保留至少 20% 安全留白；将「画布矩形 + 一束斜向 45° 光线 + 一颗五芒小星点」抽象成最简几何符号，所有元素共用同一笔粗，端点为方形切角；纯单色深墨黑（#0A0A0A 一类），不使用渐变、阴影、描边或拟物高光；线条粗细完全一致，整体几何关系基于网格对齐，可缩放到 32×32 像素仍保持清晰辨识；适合直接作为 App 图标、开源仓库头像、PWA 启动图；本图不输出任何字母、数字或文字，只生成纯图形符号',
    defaultSize: '1024x1024',
  },
  {
    value: 'interior',
    label: '室内空间',
    description: '软装、空间、建筑氛围',
    accent: '空间感',
    examplePrompt:
      '一间日式中古风客厅的建筑级室内摄影，低矮胡桃木茶几摆在画面中央，亚麻原色三人沙发沿后墙放置，墙边一只米白色和纸落地灯笼，木地板上铺着粗织毛羊毛毯；右侧整面落地木格窗，午后斜阳以 30° 入射，窗外竹影在左侧浅米墙上投下柔动的剪影，空气中可见一束斜向丁达尔光与漂浮的细尘；24mm 等效广角不畸变，机位水平略低于茶几台面，空间纵深向后展开三层；茶几上一本翻开的旧书与一杯未喝完的煎茶，留有真实生活痕迹；色调以亚麻米、胡桃棕、青苔绿三色为主，整体氛围安静、温暖、克制，似 Casa Brutus 杂志的内页生活摄影',
    defaultSize: '1536x1024',
  },
  {
    value: 'raw',
    label: '不套模板',
    description: '不附加任何风格指引，原样发送',
    accent: '原样',
    examplePrompt: '',
    defaultSize: '1024x1024',
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
