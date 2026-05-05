export type SK = 'person'|'landscape'|'object'|'abstract'|'architecture'|'food'|'general'
export type Dim = 'lighting'|'color'|'composition'|'material'|'atmosphere'|'lens'

export function pick<T>(a:T[]):T{return a[Math.floor(Math.random()*a.length)]}

const V:Record<Dim,Record<SK,{z:string[];e:string[]}>>={
lighting:{
person:{z:['侧逆光勾勒轮廓，面部柔光补光，眼神光清晰','窗光从左侧打入，明暗过渡柔和，皮肤质感通透','伦勃朗光，三角光斑落在面颊，暗部保留层次','黄金时刻逆光，发丝边缘泛金，面部自然补光'],e:['rim light outlining silhouette, soft fill on face, clear catchlights','window light from left, smooth falloff, translucent skin','Rembrandt lighting, triangular patch on cheek, shadow detail preserved','golden hour backlight, hair rim glowing, natural fill']},
landscape:{z:['晨雾漫射光，远景朦胧，近景层次分明','日落侧光，山脊轮廓被勾勒，冷暖色温交替','阴天柔光，色彩饱和度高，无生硬阴影'],e:['morning mist diffused light, distant haze, foreground layered','sunset side light, ridge outlines, warm-cool alternation','overcast soft light, high saturation, no harsh shadows']},
object:{z:['柔光箱主光左上，右侧反光板补光，表面高光干净','自然窗光侧照，投影柔和，材质纹理清晰','聚光灯打主体，暗背景突出轮廓'],e:['softbox key upper left, reflector fill right, clean specular highlights','window sidelight, soft shadow, texture clear','spotlight on subject, dark background emphasizing outline']},
abstract:{z:['渐变光从一侧扩散，色彩流动自然','多色点光源交叉投射，丰富光斑','单侧强光制造明暗分界，几何感强'],e:['gradient light diffusing from one side, colors flowing','multi-color point lights crossing, rich spots','single-side strong light, geometric feel']},
architecture:{z:['天窗自然光倾泻，室内明暗层次分明','黄昏暖光打建筑立面，材质纹理被强调','夜间人工照明，室内暖光与室外冷光对比'],e:['skylight natural light, clear interior layers','dusk warm light on facade, texture emphasized','nighttime artificial, warm interior vs cool exterior']},
food:{z:['侧逆光突出食物质感，蒸汽或油光被勾勒','窗光从后方打入，食物边缘泛光，画面温暖','柔光箱45度侧照，阴影柔和，色彩诱人'],e:['side-backlight highlighting texture, steam or gloss outlined','window light from behind, food edge glow, warm','softbox 45-degree sidelight, soft shadows, appetizing']},
general:{z:['自然侧逆光，柔和方向性阴影，光质通透','柔光箱主光，阴影过渡自然，细节丰富','黄金时刻暖光，画面有温度感'],e:['natural side-back light, soft directional shadows, luminous quality','softbox key, natural shadow transition, rich detail','golden hour warm light, warm feel']},
},
color:{
person:{z:['肤色还原准确，暖调偏黄不偏红，阴影带冷色反光','低饱和电影色调，肤色自然，环境色克制','冷暖双色调，面部暖光与背景冷调对比'],e:['accurate skin tone, warm leaning yellow not red, cool reflected light','desaturated cinematic palette, natural skin, restrained environment','warm-cool dual tone, warm face vs cool background']},
landscape:{z:['大地色系为主，天空与地面冷暖对比','低饱和青橙色调，层次丰富','高饱和但克制，主色不超过三种'],e:['earth tones dominant, sky-ground warm-cool contrast','desaturated teal-orange, rich layers','high saturation but restrained, max three colors']},
object:{z:['产品本色为主，背景色与产品和谐对比','克制单色调，用明度差异制造层次','高饱和点缀色在低饱和底色上跳跃'],e:['product native color dominant, harmonious background','restrained monochrome, lightness difference for layers','high-sat accent on low-sat base']},
abstract:{z:['大胆撞色，色块边界清晰','渐变过渡自然，色彩有呼吸感','单色系深浅变化，明度制造空间感'],e:['bold color clash, clear boundaries','smooth gradient transitions, colors alive','monochromatic depth, lightness creating space']},
architecture:{z:['建筑本色为主，光影制造色温变化','冷灰调为主，局部暖光点缀','低饱和自然色系，材质本色即色彩'],e:['architecture native color, light creating temperature variation','cool gray dominant, warm light accents','desaturated natural palette, material as palette']},
food:{z:['暖色调为主，食物本色诱人','高饱和但不溢色，色彩有食欲感','背景低饱和，食物色彩成为焦点'],e:['warm palette dominant, food color appetizing','high saturation without clipping, appetizing','low-sat background, food as focal point']},
general:{z:['克制双色调配色，主色与点缀色和谐对比','低饱和电影感，色彩服务于氛围','主色不超过三种，明度层次分明'],e:['controlled dual-tone, primary and accent in harmony','desaturated cinematic, color serving mood','max three dominant colors, clear lightness layers']},
},
composition:{
person:{z:['三分法偏右构图，面部位于视觉焦点','居中对称构图，人物与背景形成框架','大特写裁至肩上，眼神成为唯一焦点'],e:['rule of thirds right-weighted, face at anchor','centered symmetrical, subject framed by background','tight crop above shoulders, eyes as sole focus']},
landscape:{z:['三分法地平线偏下，天空占主导','前景引导线延伸至远景，纵深明确','框架构图，近处元素框住远景'],e:['rule of thirds horizon low, sky dominant','leading lines to distance, clear depth','framing composition, near framing far']},
object:{z:['居中构图，产品占画面60%，四周留白','斜45度展示，体现立体感','俯拍平铺，元素间留呼吸空间'],e:['centered, product 60%, negative space','45-degree angle showing dimension','flat lay, breathing room between elements']},
abstract:{z:['几何分割画面，色块有明确边界','中心发散构图，视觉从中心向外流动','对角线构图，画面有动势'],e:['geometric division, clear boundaries','center-radial, visual flowing outward','diagonal composition, dynamic movement']},
architecture:{z:['垂直校正，线条横平竖直','一点透视，纵深引导视线','对称构图，建筑本身即秩序'],e:['vertical correction, straight lines','one-point perspective, depth guiding eye','symmetrical, architecture as order']},
food:{z:['45度俯拍，展示食物层次与摆盘','平视构图，突出食物高度与质感','俯拍平铺，多道菜品网格排列'],e:['45-degree overhead, layers and plating','eye-level, height and texture','flat lay, grid arrangement']},
general:{z:['三分法构图，视觉重心明确，层次分明','居中构图，主体突出，背景简洁','前景遮挡制造纵深，画面有空间感'],e:['rule of thirds, clear anchor, layered depth','centered, subject prominent, clean background','foreground occlusion creating depth']},
},
material:{
person:{z:['皮肤纹理保留毛孔细节，不磨皮过度','衣物面料质感真实，褶皱自然','发丝分缕可见，有光泽感'],e:['skin texture preserving pore detail, not over-smoothed','fabric texture authentic, natural folds','hair strands visible, glossy']},
landscape:{z:['岩石表面粗糙有颗粒感','水面反光真实，波纹细节清晰','植被纹理细腻，叶脉可辨'],e:['rock surface rough with grain','water reflection authentic, ripple detail clear','vegetation fine, leaf veins discernible']},
object:{z:['金属反光锐利，高光边缘清晰','玻璃通透有折射，内部暗影自然','木质纹理保留年轮与毛孔'],e:['metal reflection sharp, highlight edge clear','glass transparent with refraction, natural inner shadow','wood texture preserving grain and pores']},
abstract:{z:['色块边缘锐利，无模糊过渡','表面有微妙噪点质感','光泽感与哑光区域交替'],e:['color block edges sharp, no blur transition','surface with subtle noise texture','gloss and matte areas alternating']},
architecture:{z:['混凝土表面保留模板痕迹','钢材冷光反射，焊缝可见','砖石砌筑缝隙清晰'],e:['concrete surface preserving formwork traces','steel cold reflection, welds visible','masonry joints clear']},
food:{z:['面包表皮裂纹与面粉颗粒可见','酱汁光泽感，挂壁自然','冰块通透有裂纹，气泡可见'],e:['bread crust cracks and flour particles visible','sauce glossy, natural cling','ice transparent with cracks, bubbles visible']},
general:{z:['真实材质纹理，表面细节可触可感','物体边缘锐利，质感不模糊','高光与阴影过渡自然，材质有重量感'],e:['authentic material textures, tactile surface detail','object edges sharp, texture not blurred','natural highlight-shadow transition, material has weight']},
},
atmosphere:{
person:{z:['沉浸式氛围，画面有叙事张力','安静内敛，人物与环境有情感连接','戏剧性瞬间，动作凝固在高潮'],e:['immersive atmosphere, narrative tension','quiet and restrained, emotional connection','dramatic instant, action frozen at climax']},
landscape:{z:['空旷辽远，有孤独感与敬畏感','宁静致远，时间仿佛静止','壮阔磅礴，自然力量扑面而来'],e:['vast and distant, solitude and awe','serene, time feels still','grand and powerful, nature overwhelming']},
object:{z:['精致高级，产品有仪式感','干净克制，留白赋予想象空间','温暖亲切，物品有使用痕迹'],e:['refined and premium, product with ritual feel','clean and restrained, negative space for imagination','warm and intimate, item with use traces']},
abstract:{z:['神秘深邃，画面有冥想感','能量涌动，色彩有生命力','冷静理性，几何秩序带来安定'],e:['mysterious and deep, meditative feel','energy surging, colors alive','calm and rational, geometric order bringing stability']},
architecture:{z:['庄重肃穆，空间有精神属性','温暖宜居，光线赋予生活气息','冷峻精密，结构本身即美学'],e:['solemn, space with spiritual quality','warm and livable, light giving life breath','cold and precise, structure as aesthetics']},
food:{z:['温馨家常，有烟火气','精致仪式，摆盘如艺术品','热闹丰盛，满桌即幸福'],e:['warm and homey, lived-in feel','refined ritual, plating as art','bustling and abundant, full table as happiness']},
general:{z:['沉浸式氛围，画面有叙事张力','情绪明确，观者能感受到画面温度','安静有力，不喧哗但有存在感'],e:['immersive atmosphere, narrative tension','clear emotion, viewer feels the temperature','quiet but powerful, presence without noise']},
},
lens:{
person:{z:['85mm f/1.8 人像镜头，浅景深，焦点在近眼','50mm 标准视角，自然透视，环境人像','35mm 纪实风格，带入更多环境信息'],e:['85mm f/1.8 portrait lens, shallow DOF, focus on near eye','50mm standard, natural perspective, environmental portrait','35mm documentary, more environmental context']},
landscape:{z:['24mm 广角，夸张前景，纵深强烈','35mm 经典风景焦段，透视自然','中长焦压缩空间，层叠感强'],e:['24mm wide-angle, exaggerated foreground, strong depth','35mm classic landscape, natural perspective','medium telephoto compressing space, layered feel']},
object:{z:['100mm 微距，细节纤毫毕现','50mm 标准视角，产品比例自然','移轴镜头，控制焦平面与变形'],e:['100mm macro, every detail visible','50mm standard, product proportion natural','tilt-shift, controlling focal plane and distortion']},
abstract:{z:['微距镜头，微观世界放大','35mm 街拍视角，偶然与秩序并存','长焦压缩，色块平面化'],e:['macro lens, micro world magnified','35mm street perspective, chance and order','telephoto compression, color blocks flattened']},
architecture:{z:['24mm 移轴，校正透视变形','35mm 人文视角，建筑与人的尺度关系','大画幅技术相机观感，极致清晰'],e:['24mm tilt-shift, correcting perspective distortion','35mm humanistic, architecture and human scale','large format technical camera feel, extreme sharpness']},
food:{z:['100mm 微距，食物质感纤毫毕现','50mm 标准视角，还原用餐距离感','85mm 浅景深，主体突出背景虚化'],e:['100mm macro, food texture in detail','50mm standard, natural dining distance','85mm shallow DOF, subject prominent, background blurred']},
general:{z:['50mm 标准镜头，最接近人眼视角','35mm 纪实视角，浅景深，焦点锐利','85mm 人像焦段，虚化自然'],e:['50mm standard, closest to human eye','35mm documentary, shallow DOF, sharp focus','85mm portrait focal length, natural bokeh']},
},
}

export function getVocab(dim:Dim,subject:SK,useZh:boolean):string|undefined{
  const entry=V[dim]?.[subject]
  if(!entry)return undefined
  const arr=useZh?entry.z:entry.e
  return arr.length?pick(arr):undefined
}
