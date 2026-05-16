import type { EnhanceIntent, LanguageMode, SubjectKind } from './promptDoc'

export interface CameraRecipe {
  id: string
  zh: string
  en: string
  intents: EnhanceIntent[]
  subjects: SubjectKind[]
}

export const cameraLookbook: CameraRecipe[] = [
  {
    id: 'editorial-portrait',
    zh: 'Hasselblad H6D-100c · 100mm f/2.2 中焦镜头，背景奶油色 bokeh，焦点锐利落在近眼，光圈呼吸克制',
    en: 'Hasselblad H6D-100c, 100mm f/2.2 medium telephoto, creamy background bokeh, tack-sharp focus on the near eye, restrained focus breathing',
    intents: ['portrait', 'create'],
    subjects: ['person'],
  },
  {
    id: 'street-35',
    zh: 'Leica M11 · 35mm Summilux f/1.4，纪实街拍视角，自然透视，焦点在主体瞳孔',
    en: 'Leica M11 with 35mm Summilux f/1.4, documentary street perspective, natural perspective, focus on the subject pupils',
    intents: ['create', 'portrait'],
    subjects: ['person', 'general'],
  },
  {
    id: 'product-macro',
    zh: 'Phase One IQ4 150MP · 120mm 微距 f/8，展台级锐度，材质纹理纤毫毕现',
    en: 'Phase One IQ4 150MP with 120mm macro at f/8, showroom-grade sharpness, every material texture readable',
    intents: ['product', 'create'],
    subjects: ['object', 'food'],
  },
  {
    id: 'cinema-anamorphic',
    zh: 'ARRI Alexa Mini LF · 40mm Master Anamorphic，2.39:1 宽银幕，水平镜头光晕，椭圆 bokeh',
    en: 'ARRI Alexa Mini LF, 40mm Master Anamorphic lens, 2.39:1 widescreen, horizontal lens flare, elliptical bokeh',
    intents: ['create', 'poster'],
    subjects: ['general', 'person', 'landscape'],
  },
  {
    id: 'landscape-medium',
    zh: 'Fujifilm GFX 100 II · 32-64mm GF f/8，中画幅风光，前景纵深与远景压缩并存',
    en: 'Fujifilm GFX 100 II with GF 32-64mm at f/8, medium format landscape, foreground depth and far-distance compression coexisting',
    intents: ['create'],
    subjects: ['landscape', 'architecture'],
  },
  {
    id: 'archviz-tilt',
    zh: 'Canon TS-E 24mm 移轴，校正垂直线，建筑摄影质感，材质保留真实磨损',
    en: 'Canon TS-E 24mm tilt-shift, corrected verticals, architectural photography feel, materials preserve authentic wear',
    intents: ['create'],
    subjects: ['architecture'],
  },
  {
    id: 'cinestill-night',
    zh: 'Cinestill 800T 推 1600 度，夜景钨丝光下高光泛红晕，35mm 颗粒，胶片宽容度',
    en: 'Cinestill 800T pushed to 1600, tungsten night highlights blooming red, 35mm grain, filmic latitude',
    intents: ['create', 'poster'],
    subjects: ['general', 'person'],
  },
  {
    id: 'food-overhead',
    zh: 'Sony A7R V · 90mm Macro f/4.5，正俯拍 90°，柔光箱顶光，食物质感与酱汁挂壁清晰',
    en: 'Sony A7R V with 90mm Macro at f/4.5, top-down 90°, softbox overhead, food texture and sauce cling clear',
    intents: ['product', 'create'],
    subjects: ['food'],
  },
  {
    id: 'animal-wild',
    zh: 'Nikon Z9 · 400mm f/2.8，远距离压缩透视，毛发分缕可见，动物瞳孔为焦点',
    en: 'Nikon Z9 with 400mm f/2.8, distant compression, fur strands visible, animal pupils as focal point',
    intents: ['create'],
    subjects: ['animal'],
  },
  {
    id: 'concept-key',
    zh: 'Concept key art 视角，三分构图偏右，前景剪影 + 远景大气透视，戏剧性光位',
    en: 'Concept key art view, rule-of-thirds right-weighted, foreground silhouette plus distant aerial perspective, dramatic light staging',
    intents: ['poster', 'create'],
    subjects: ['general', 'landscape'],
  },
]

export function pickCameraRecipe(
  intent: EnhanceIntent,
  subject: SubjectKind,
  language: LanguageMode,
  seed = '',
): string {
  const matches = cameraLookbook.filter(
    (recipe) => recipe.intents.includes(intent) && recipe.subjects.includes(subject),
  )
  const pool = matches.length ? matches : cameraLookbook.filter((recipe) => recipe.intents.includes(intent))
  const final = pool.length ? pool : cameraLookbook
  let hash = 2166136261
  const key = `${seed}|${intent}|${subject}|${language}`
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const recipe = final[Math.abs(hash) % final.length]
  return language === 'zh' ? recipe.zh : recipe.en
}

export function listCameraRecipes(language: LanguageMode = 'zh'): Array<{ id: string; label: string; value: string }> {
  return cameraLookbook.map((recipe) => ({
    id: recipe.id,
    label: recipe.id,
    value: language === 'zh' ? recipe.zh : recipe.en,
  }))
}
