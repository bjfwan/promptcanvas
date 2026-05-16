import { computed, ref, watch } from 'vue'

/**
 * Tiny custom i18n.
 *
 * Why not vue-i18n: PromptCanvas is a single-page tool with ~120 strings,
 * a 6 kB dependency would dominate vs. a 1 kB dictionary lookup.
 *
 * Public surface:
 *   - `t('key')` for a flat reactive read inside <template>/<script setup>
 *   - `useI18n()` returns { locale, t, setLocale, locales }
 *   - `setLocale('en' | 'zh-CN' | 'auto')` persists to localStorage
 *
 * Conventions:
 *   - All UI literal strings live in messages tables below.
 *   - Keys are dot-segmented domains: `app.title`, `header.history`, ...
 *   - Unknown keys fall back to the key itself, *not* an empty string,
 *     so missing translations are immediately visible.
 *   - Template interpolation: `t('foo.greet', { name: 'Lin' })` → uses {name}.
 */

export type Locale = 'zh-CN' | 'en'
export type LocalePreference = Locale | 'auto'

const LOCALE_KEY = 'promptcanvas:locale-v1'

interface Messages {
  [key: string]: string
}

// ---------------------------------------------------------------------------
// Dictionaries
// ---------------------------------------------------------------------------

const zh: Messages = {
  // App-wide
  'app.title': 'PromptCanvas',
  'app.tagline': 'image studio · 本地优先',
  'app.skipToCanvas': '跳到画布',

  // Header
  'header.history': '历史生成',
  'header.settings': '设置',
  'header.refresh': '刷新连接状态',
  'header.toggleThemeToNight': '切换为夜间主题',
  'header.toggleThemeToPaper': '切换为日间主题',
  'header.reset': '重置',
  'header.resetTip': '重置表单为默认值',
  'header.cmdkSearch': '搜索 / 命令',
  'header.cmdkOpenTitle': '打开命令面板（⌘K / Ctrl+K）',
  'header.healthOnline': '在线',
  'header.healthOffline': '离线',
  'header.healthChecking': '检查中',
  'header.menuOpen': '打开菜单',
  'header.menuShortcuts': '快捷键',
  'header.atelier': 'atelier image studio',

  // Onboarding
  'onboarding.step': '第 {current} / {total} 步',
  'onboarding.skip': '跳过',
  'onboarding.next': '下一步',
  'onboarding.back': '上一步',
  'onboarding.finish': '开始创作',
  'onboarding.step1.title': '在这里写画面',
  'onboarding.step1.body': '一段画面描述就够了：主体、镜头、光线、氛围。⌘ + Enter 直接生成。',
  'onboarding.step2.title': '一键生成',
  'onboarding.step2.body': '生成中可随时点这里取消。结果会出现在中间画布与右侧时间线。',
  'onboarding.step3.title': '⌘K 走遍所有命令',
  'onboarding.step3.body': '搜索风格 / 尺寸 / 历史，按 ? 看完整快捷键。需要时随时回来。',

  // Command palette
  'cmd.placeholder': '搜索命令、风格、尺寸…',
  'cmd.empty': '没有匹配的命令',
  'cmd.group.action': '操作',
  'cmd.group.nav': '导航',
  'cmd.group.appearance': '外观',
  'cmd.group.style': '风格',
  'cmd.group.size': '尺寸',
  'cmd.focusPrompt': '聚焦到提示词',
  'cmd.focusPrompt.hint': '马上开始写画面',
  'cmd.generate': '立即生成',
  'cmd.generate.hint': '使用当前参数',
  'cmd.openSettings': '打开设置',
  'cmd.openHistory': '查看历史生成',
  'cmd.openStyleSheet': '挑选画面风格',
  'cmd.openShortcuts': '查看键盘快捷键',
  'cmd.openOnboarding': '重看新手引导',
  'cmd.installApp': '安装到桌面',
  'cmd.installApp.hint': '注册成本地应用 · 离线可用',
  'cmd.toggleTheme': '切换主题（日 / 夜）',
  'cmd.reset': '重置画布与参数',
  'cmd.tip.navigate': '导航',
  'cmd.tip.execute': '执行',
  'cmd.tip.palette': '命令面板',

  // Shortcuts dialog
  'shortcuts.title': '键盘地图',
  'shortcuts.eyebrow': 'Shortcuts · 快捷键',
  'shortcuts.group.global': '全局',
  'shortcuts.group.generate': '生成',
  'shortcuts.group.lightbox': 'Lightbox 全屏预览',
  'shortcuts.group.gestures': '触屏手势',
  'shortcuts.note': '在中文输入法下 ? 可能落到输入法候选条上，关掉中文输入法再按一次。',

  'shortcuts.global.cmdk': '打开命令面板',
  'shortcuts.global.slash': '打开命令面板（焦点不在输入框时）',
  'shortcuts.global.question': '显示这个快捷键帮助',
  'shortcuts.global.esc': '关闭弹窗或取消编辑',
  'shortcuts.gen.submit': '提交提示词，立即生成',
  'shortcuts.gen.submitCtrl': '提交提示词（Windows / Linux）',
  'shortcuts.lb.prev': '上一张',
  'shortcuts.lb.next': '下一张',
  'shortcuts.lb.zoom': '切换缩放',
  'shortcuts.lb.plusminus': '放大 / 缩小',
  'shortcuts.lb.reset': '复位缩放与位置',
  'shortcuts.lb.info': '展开 / 收起元数据面板',
  'shortcuts.gesture.pinch': '两指捏合',
  'shortcuts.gesture.pinch.desc': '缩放预览图',
  'shortcuts.gesture.pan': '单指拖动',
  'shortcuts.gesture.pan.desc': '在放大状态下平移',
  'shortcuts.gesture.swipe': '左右滑动',
  'shortcuts.gesture.swipe.desc': '切换图片',
  'shortcuts.gesture.dbltap': '双击',
  'shortcuts.gesture.dbltap.desc': '快速放大 / 复位',

  // Toast / generic
  'toast.copied': '已复制',
  'toast.copyFailed': '复制失败，请手动复制',
  'toast.empty': '没有可复制的内容',
  'toast.draftReset': '已重置画布与参数',
  'toast.historyCleared': '已清空历史',
  'toast.providerCleared': '已清除 API 凭据',
  'toast.providerClearedHint': '请重新填写以继续生成',
  'toast.updateReady': '新版本已就绪',
  'toast.updateReadyHint': '点击立即刷新',
  'toast.dismiss': '关闭通知',
  'toast.copyPrompt': '已复制提示词',
  'toast.copyRequestId': '已复制 request id',
  'toast.imageDownloaded': '图片已下载',
  'toast.imageDownloadedProxy': '图片已下载（经代理）',
  'toast.imageDownloadFailed': '这张图片没有可下载地址',
  'toast.imageNoUrl': '这张图片没有可打开地址',
  'toast.imageOpenedNewTab': '已在新标签打开',
  'toast.imageOpenedNewTabHint': '原站不允许跨域下载，可右键图片另存为',
  'toast.shareSuccess': '已分享',
  'toast.shareFailed': '分享失败',
  'toast.shareUnsupported': '当前浏览器不支持分享',

  // Settings dialog
  'settings.title': '生成偏好',
  'settings.eyebrow': 'Settings · 设置',
  'settings.close': '关闭',
  'settings.provider.eyebrow': 'Provider · 服务商',
  'settings.provider.label': 'API 端点 与 凭据',
  'settings.provider.configured': '已配置',
  'settings.provider.unconfigured': '未配置',
  'settings.provider.note': '凭据只保存在你浏览器的 localStorage，刷新后仍在；不会写入任何服务端数据库。Network 面板里仍可见，截图分享请遮蔽。',
  'settings.provider.proxyOn': '已启用内置反代',
  'settings.provider.proxyOnHint': '透明转发，不持久化任何凭据',
  'settings.provider.baseUrl': 'API 端点',
  'settings.provider.baseUrlHint': 'OpenAI 官方 https://api.openai.com/v1，第三方网关填它给的 base URL（含 /v1）。',
  'settings.provider.apiKey': 'API Key',
  'settings.provider.apiKeyShow': '显示 API Key',
  'settings.provider.apiKeyHide': '隐藏 API Key',
  'settings.provider.test': '测试连接',
  'settings.provider.testing': '测试中…',
  'settings.provider.clear': '清除凭据',
  'settings.negative': '负面提示词',
  'settings.negative.placeholder': '不想出现的元素，例如：模糊、水印',
  'settings.model': '模型',
  'settings.model.custom': '例如 dall-e-3、flux-pro 等中转站支持的模型名',
  'settings.quality': '质量',
  'settings.quality.label': '选择质量',
  'settings.format': '输出格式',
  'settings.format.label': '选择输出格式',
  'settings.locale': '界面语言 · Interface language',
  'settings.locale.label': '选择界面语言',
  'settings.locale.auto': '当前：{name}（跟随系统）',
  'settings.locale.locked': '已锁定语言，关闭设置即可生效。',
  'settings.seed': 'Seed',
  'settings.seed.placeholder': '留空 = 随机',
  'settings.seed.roll': '生成随机 seed',
  'settings.creativity': '创意强度',
  'settings.creativity.low': '稳健',
  'settings.creativity.high': '大胆',
  'settings.action.reset': '重置全部参数',
  'settings.action.export': '导出当前参数为 JSON',

  // History dialog
  'history.title': '历史生成',
  'history.eyebrow': 'History · 最近 {count} 条',
  'history.clear': '清空',
  'history.clearConfirm': '确认清空',
  'history.empty': '生成成功后，最近 12 条参数和可缓存图片会保存在浏览器本地。',
  'history.saved': '已存',
  'history.refCount': '参考 {count}',
  'history.seed': 'seed {value}',

  // Lightbox
  'lightbox.label': '图片详情',
  'lightbox.toggleZoom': '切换缩放',
  'lightbox.download': '下载图片',
  'lightbox.share': '分享',
  'lightbox.close': '关闭详情',
  'lightbox.prev': '上一张',
  'lightbox.next': '下一张',
  'lightbox.info.metadata': 'Metadata',
  'lightbox.info.close': '收起元数据',
  'lightbox.info.expand': '展开元数据',
  'lightbox.info.revisedPrompt': 'Revised prompt',
  'lightbox.info.image': 'Image',
  'lightbox.info.type': '类型',
  'lightbox.info.index': '序号',
  'lightbox.info.tip': 'Tip',
  'lightbox.info.tipText': '←→ 切换 · Space 缩放 · I 收起此面板',
  'lightbox.foot.tipMulti': '← →&nbsp;切换 · Space 缩放 · I 信息 · 0 复位 · Esc 关闭',
  'lightbox.foot.tipZoomed': '双指缩放 · 单指拖动 · 双击复位',
  'lightbox.copy': '复制',

  // PromptComposer
  'composer.eyebrow': '01 · Compose',
  'composer.title': '构图草案',
  'composer.subtitle': '控制主体、光线、镜头、材质与情绪。模板只塑造语气，不替你决定画面。',
  'composer.offline': '后端当前不可用。检查连接后再生成图片。',
  'composer.continuation.label': '正在接着画',
  'composer.continuation.title': '接着画',
  'composer.continuation.body': '基于第 {n} 张图，告诉它你想改什么',
  'composer.continuation.cancel': '取消接着画',
  'composer.prompt': '提示词',
  'composer.prompt.placeholder': '一张极简咖啡品牌海报，暖色调，自然光，留白充足',
  'composer.prompt.placeholderRemix': '描述这张图下一步要改变什么：保留什么、替换什么、增加什么',
  'composer.prompt.tone.thin': '稀薄',
  'composer.prompt.tone.focused': '聚焦',
  'composer.prompt.tone.rich': '丰富',
  'composer.prompt.tone.dense': '稠密',
  'composer.prompt.tone.over': '过载',
  'composer.tools.modelEyebrow': '模型',
  'composer.tools.modelDefault': '默认',
  'composer.tools.modelCustom': '自定义 · {name}',
  'composer.tools.modelCustomEmpty': '自定义 · 未填写',
  'composer.tools.ref': '参考图',
  'composer.tools.refCount': '参考 {n}',
  'composer.tools.refContinue': '继续添加',
  'composer.tools.enhance': '优化',
  'composer.tools.enhanceLabel': '智能优化提示词',
  'composer.tools.undo': '撤销',
  'composer.tools.undoLabel': '撤销魔法增强',
  'composer.tools.copy': '复制',
  'composer.tools.copyLabel': '复制提示词',
  'composer.tools.clear': '清空',
  'composer.tools.clearLabel': '清空提示词',
  'composer.advanced.q': '需要负面提示词、Seed、质量等高级参数？',
  'composer.advanced.open': '打开设置',
  'composer.styleTemplate': '提示词模板',
  'composer.stylePreset': '{count} 预设',
  'composer.styleHint': '生图时会拼接的「风格指引」',
  'composer.styleHintRaw': '已选 「不套模板」：原样发送',
  'composer.styleHintBody': '被并到提示词后的原文',
  'composer.styleHintRawNote': '不附加任何风格指引。你输入什么就发什么。',
  'composer.styleHintBodyNote': '不满意？选「不套模板」跳过这一段，或直接在上方提示词里写你自己的镜头/光位/材质。',
  'composer.size': '尺寸',
  'composer.sizeLabel': '选择图片尺寸',
  'composer.count': '数量',
  'composer.countLabel': '选择生成数量',
  'composer.refTitle': '参考图 {count} / {max}',
  'composer.refContinue': '继续添加',
  'composer.refRemove': '移除参考图 {name}',
  'composer.cta.write': '写下提示词以生成',
  'composer.cta.busy': 'Composing · 点击取消',
  'composer.cta.continue': 'Continue frame',
  'composer.cta.generate': 'Generate',
  'composer.coverage': 'Coverage',

  // CanvasStage
  'canvas.eyebrow': '02 · Canvas',
  'canvas.title': '制版画布',
  'canvas.requestId': '点击复制完整 request id：{id}',
  'canvas.empty.title': '空白画布',
  'canvas.empty.body': '写下一段画面描述，或挑一个起点。',
  'canvas.empty.bodyKbd': '唤出命令面板',
  'canvas.empty.unconfigured.title': '先配一下 API',
  'canvas.empty.unconfigured.body': '填入 OpenAI 或兼容中转站的 API 端点和 Key，请求会自动经内置反代中转，避免 CORS 与超时问题。',
  'canvas.empty.unconfigured.cta': '打开设置',
  'canvas.empty.proxy': 'proxy · likeyou.qzz.io · 透明转发',
  'canvas.empty.compose': '去写提示词',
  'canvas.empty.generate': '立即生成',
  'canvas.action.continue': '接着画',
  'canvas.action.download': '下载',
  'canvas.action.zoom': '放大',
  'canvas.action.copyPrompt': '复制提示词',
  'canvas.action.export': '导出参数',
  'canvas.action.share': '分享',
  'canvas.tool.zoom': '放大',
  'canvas.tool.openExternal': '新窗口打开',
  'canvas.tool.download': '下载',
  'canvas.drop.title': '松手添加为参考图',
  'canvas.drop.formats': '支持 PNG · JPEG · WEBP · GIF',
  'canvas.drop.full': '参考图已达上限',
  'canvas.drop.fullHint': '最多 {n} 张参考图',
  'canvas.error': '生成失败',
  'canvas.pending.dispatch': '拆解提示词',
  'canvas.pending.compose': '组织构图',
  'canvas.pending.detail': '生成细节',
  'canvas.pending.wait': '等待返回',
  'canvas.pending.cancel': '取消这次生成',
  'canvas.pending.cancelLabel': '取消',
  'canvas.pending.remain': '约 {n}s',
  'canvas.pending.remainSoon': '即将出图',
  'canvas.pending.remainOver': '已超出预估，仍在等上游回包',
  'canvas.mosaic.label': '生成结果',
  'canvas.mosaic.activeHint': '第 {n} 张已激活，点击放大',
  'canvas.mosaic.selectHint': '选中第 {n} 张',
  'canvas.imageGenerated': '生成图片 {n}',
  'canvas.untitled': 'untitled draft',

  // ChatBubble
  'chat.canvas': 'canvas',
  'chat.refCount': '参考 {n}',
  'chat.cancel': '取消',
  'chat.retry': '重试',
  'chat.copyError': '复制错误信息',
  'chat.errorFallback': '生成失败，请稍后重试。',
  'chat.actionRetry': '再画一张',
  'chat.actionCopyPrompt': '复制提示词',
  'chat.actionDownload': '下载第 {n} 张',
  'chat.actionContinue': '接着画',
  'chat.imageZoom': '放大查看第 {n} 张图片',
  'chat.continueChip': '接着上一张',
  'chat.continueChipFallback': '继续编辑',
  'chat.continueLabel': '基于先前生成的第 {n} 张图，点击跳回原对话',

  // ChatStream
  'stream.empty.title': '画点什么呢？',
  'stream.empty.body': '写一段画面描述，或先挑一种风格作为起点。',
  'stream.empty.unconfigured.title': '先配一下 API',
  'stream.empty.unconfigured.body': '填入服务商的 API 端点和 Key，请求会自动经内置反代中转。',
  'stream.empty.unconfigured.cta': '打开设置',
  'stream.label': '对话流',
  'stream.jump': '滚动到底部',

  // ChatDock
  'dock.placeholder': '今天画点什么…',
  'dock.placeholderRemix': '接着这张图改什么？',
  'dock.cancel': '取消生成',
  'dock.send': '发送提示词生成图片',
  'dock.sendRemix': '发送续作提示词',
  'dock.expand': '展开输入框',
  'dock.shrink': '收起输入框',
  'dock.refOpen': '添加参考图',
  'dock.refOpenWith': '已添加 {n} 张参考图，继续添加',
  'dock.modelLabel': '选择生成模型',
  'dock.styleLabel': '当前风格：{name}，点击更换',
  'dock.continueLabel': '正在接着画',
  'dock.continueTitle': '接着画',
  'dock.continueBody': '基于第 {n} 张图，描述你想改的细节',
  'dock.continueCancel': '取消接着画',
  'dock.offline': '后端离线，发送会失败',
  'dock.refTitle': '参考图 {count} / {max}',
  'dock.refContinue': '继续添加',
  'dock.refRemove': '移除参考图 {name}',
  'dock.modelCustom': '自定义模型名',
  'dock.modelCustomPlaceholder': '例如 dall-e-3、flux-pro 等中转站支持的模型名',

  // StyleSheet
  'styleSheet.eyebrow': 'Style · 风格',
  'styleSheet.title': '挑一种画面气质',
  'styleSheet.label': '选择画面风格',
  'styleSheet.note': '选风格只切换画面气质，不会替换你已经写好的提示词。如需更多参数（尺寸、数量、Seed 等），请在顶部进入设置。',
  'styleSheet.rawPreview': '不附加任何风格指引，原样发送',

  // Activity sidebar
  'activity.eyebrow': '03 · Activity',
  'activity.title': '时间线',
  'activity.viewAll': '全部',
  'activity.viewAllCount': '查看全部 {count} 条',
  'activity.live.title': '正在生成 · {n}s',
  'activity.live.idle': '工作中…',
  'activity.empty': '完成生成后，最近 12 条会出现在这里，点击即可一键恢复参数。',
  'activity.restoreLabel': '恢复历史：{prompt}',
  'activity.refTag': '参考',

  // Locale
  'locale.zh-CN': '简体中文',
  'locale.en': 'English',
  'locale.auto': '跟随系统',
}

const en: Messages = {
  'app.title': 'PromptCanvas',
  'app.tagline': 'image studio · local-first',
  'app.skipToCanvas': 'Skip to canvas',

  'header.history': 'History',
  'header.settings': 'Settings',
  'header.refresh': 'Recheck connection',
  'header.toggleThemeToNight': 'Switch to night theme',
  'header.toggleThemeToPaper': 'Switch to paper theme',
  'header.reset': 'Reset',
  'header.resetTip': 'Reset all fields to defaults',
  'header.cmdkSearch': 'Search · commands',
  'header.cmdkOpenTitle': 'Open command palette (⌘K / Ctrl+K)',
  'header.healthOnline': 'online',
  'header.healthOffline': 'offline',
  'header.healthChecking': 'checking',
  'header.menuOpen': 'Open menu',
  'header.menuShortcuts': 'Shortcuts',
  'header.atelier': 'atelier image studio',

  'onboarding.step': 'Step {current} of {total}',
  'onboarding.skip': 'Skip',
  'onboarding.next': 'Next',
  'onboarding.back': 'Back',
  'onboarding.finish': 'Start creating',
  'onboarding.step1.title': 'Write what you see',
  'onboarding.step1.body': 'A short description is enough — subject, lens, light, mood. Press ⌘ + Enter to generate.',
  'onboarding.step2.title': 'One-tap generate',
  'onboarding.step2.body': 'Tap to start, tap again to cancel. Results appear on the canvas and the timeline.',
  'onboarding.step3.title': '⌘K for everything',
  'onboarding.step3.body': 'Search styles, sizes, history. Press ? for the full shortcut map.',

  'cmd.placeholder': 'Search commands, styles, sizes…',
  'cmd.empty': 'No commands match',
  'cmd.group.action': 'Action',
  'cmd.group.nav': 'Navigate',
  'cmd.group.appearance': 'Appearance',
  'cmd.group.style': 'Style',
  'cmd.group.size': 'Size',
  'cmd.focusPrompt': 'Focus the prompt',
  'cmd.focusPrompt.hint': 'Start writing right away',
  'cmd.generate': 'Generate now',
  'cmd.generate.hint': 'Use current parameters',
  'cmd.openSettings': 'Open settings',
  'cmd.openHistory': 'Browse history',
  'cmd.openStyleSheet': 'Pick a visual style',
  'cmd.openShortcuts': 'Show shortcut map',
  'cmd.openOnboarding': 'Replay onboarding',
  'cmd.installApp': 'Install as app',
  'cmd.installApp.hint': 'Register as a local app — offline ready',
  'cmd.toggleTheme': 'Toggle theme (paper / night)',
  'cmd.reset': 'Reset canvas & parameters',
  'cmd.tip.navigate': 'navigate',
  'cmd.tip.execute': 'execute',
  'cmd.tip.palette': 'command palette',

  'shortcuts.title': 'Keyboard map',
  'shortcuts.eyebrow': 'Shortcuts',
  'shortcuts.group.global': 'Global',
  'shortcuts.group.generate': 'Generate',
  'shortcuts.group.lightbox': 'Lightbox preview',
  'shortcuts.group.gestures': 'Touch gestures',
  'shortcuts.note': 'IME candidate bars may swallow ?. Switch to ASCII input and try once more.',

  'shortcuts.global.cmdk': 'Open command palette',
  'shortcuts.global.slash': 'Open palette (when focus is outside an input)',
  'shortcuts.global.question': 'Show this shortcut map',
  'shortcuts.global.esc': 'Close dialog or cancel edit',
  'shortcuts.gen.submit': 'Submit prompt, generate now',
  'shortcuts.gen.submitCtrl': 'Submit prompt (Windows / Linux)',
  'shortcuts.lb.prev': 'Previous image',
  'shortcuts.lb.next': 'Next image',
  'shortcuts.lb.zoom': 'Toggle zoom',
  'shortcuts.lb.plusminus': 'Zoom in / out',
  'shortcuts.lb.reset': 'Reset zoom and position',
  'shortcuts.lb.info': 'Toggle metadata panel',
  'shortcuts.gesture.pinch': 'Two-finger pinch',
  'shortcuts.gesture.pinch.desc': 'Zoom the preview',
  'shortcuts.gesture.pan': 'One-finger drag',
  'shortcuts.gesture.pan.desc': 'Pan when zoomed in',
  'shortcuts.gesture.swipe': 'Swipe left / right',
  'shortcuts.gesture.swipe.desc': 'Switch image',
  'shortcuts.gesture.dbltap': 'Double tap',
  'shortcuts.gesture.dbltap.desc': 'Zoom in or reset quickly',

  'toast.copied': 'Copied',
  'toast.copyFailed': 'Copy failed — please copy manually',
  'toast.empty': 'Nothing to copy',
  'toast.draftReset': 'Canvas & parameters reset',
  'toast.historyCleared': 'History cleared',
  'toast.providerCleared': 'API credentials cleared',
  'toast.providerClearedHint': 'Add new credentials to continue generating',
  'toast.updateReady': 'New version available',
  'toast.updateReadyHint': 'Tap to refresh now',
  'toast.dismiss': 'Dismiss',
  'toast.copyPrompt': 'Prompt copied',
  'toast.copyRequestId': 'Request ID copied',
  'toast.imageDownloaded': 'Image downloaded',
  'toast.imageDownloadedProxy': 'Image downloaded (via proxy)',
  'toast.imageDownloadFailed': 'No download URL for this image',
  'toast.imageNoUrl': 'No openable URL for this image',
  'toast.imageOpenedNewTab': 'Opened in a new tab',
  'toast.imageOpenedNewTabHint': 'CORS blocks direct download — right-click and Save Image As',
  'toast.shareSuccess': 'Shared',
  'toast.shareFailed': 'Share failed',
  'toast.shareUnsupported': 'This browser does not support sharing',

  'settings.title': 'Generation preferences',
  'settings.eyebrow': 'Settings',
  'settings.close': 'Close',
  'settings.provider.eyebrow': 'Provider',
  'settings.provider.label': 'API endpoint & credentials',
  'settings.provider.configured': 'Configured',
  'settings.provider.unconfigured': 'Not configured',
  'settings.provider.note': 'Credentials live only in your browser localStorage and survive reloads. They never reach our servers, but DevTools and screen captures can still see them — be careful when sharing.',
  'settings.provider.proxyOn': 'Built-in proxy enabled',
  'settings.provider.proxyOnHint': 'Transparent forwarding · no credentials persisted',
  'settings.provider.baseUrl': 'API endpoint',
  'settings.provider.baseUrlHint': 'OpenAI: https://api.openai.com/v1. For relays, use the base URL they provide (must include /v1).',
  'settings.provider.apiKey': 'API Key',
  'settings.provider.apiKeyShow': 'Show API Key',
  'settings.provider.apiKeyHide': 'Hide API Key',
  'settings.provider.test': 'Test connection',
  'settings.provider.testing': 'Testing…',
  'settings.provider.clear': 'Clear credentials',
  'settings.negative': 'Negative prompt',
  'settings.negative.placeholder': 'What you don\'t want, e.g. blurry, watermark',
  'settings.model': 'Model',
  'settings.model.custom': 'e.g. dall-e-3, flux-pro, or any model the relay supports',
  'settings.quality': 'Quality',
  'settings.quality.label': 'Choose quality',
  'settings.format': 'Output format',
  'settings.format.label': 'Choose format',
  'settings.locale': 'Interface language · 界面语言',
  'settings.locale.label': 'Choose interface language',
  'settings.locale.auto': 'Currently: {name} (system default)',
  'settings.locale.locked': 'Language locked. Close settings to apply.',
  'settings.seed': 'Seed',
  'settings.seed.placeholder': 'Empty = random',
  'settings.seed.roll': 'Roll a random seed',
  'settings.creativity': 'Creativity',
  'settings.creativity.low': 'Steady',
  'settings.creativity.high': 'Bold',
  'settings.action.reset': 'Reset all parameters',
  'settings.action.export': 'Export current parameters as JSON',

  'history.title': 'History',
  'history.eyebrow': 'History · last {count}',
  'history.clear': 'Clear',
  'history.clearConfirm': 'Confirm clear',
  'history.empty': 'After a successful generation, your last 12 prompts and cached images live here on this device.',
  'history.saved': 'saved',
  'history.refCount': 'Ref ×{count}',
  'history.seed': 'seed {value}',

  'lightbox.label': 'Image detail',
  'lightbox.toggleZoom': 'Toggle zoom',
  'lightbox.download': 'Download image',
  'lightbox.share': 'Share',
  'lightbox.close': 'Close detail',
  'lightbox.prev': 'Previous',
  'lightbox.next': 'Next',
  'lightbox.info.metadata': 'Metadata',
  'lightbox.info.close': 'Collapse metadata',
  'lightbox.info.expand': 'Expand metadata',
  'lightbox.info.revisedPrompt': 'Revised prompt',
  'lightbox.info.image': 'Image',
  'lightbox.info.type': 'Type',
  'lightbox.info.index': 'Position',
  'lightbox.info.tip': 'Tip',
  'lightbox.info.tipText': '←→ navigate · Space zoom · I to collapse',
  'lightbox.foot.tipMulti': '← → switch · Space zoom · I info · 0 reset · Esc close',
  'lightbox.foot.tipZoomed': 'Pinch to zoom · drag to pan · double-tap to reset',
  'lightbox.copy': 'Copy',

  'composer.eyebrow': '01 · Compose',
  'composer.title': 'Frame draft',
  'composer.subtitle': 'Direct subject, light, lens, material, mood. Templates set tone — they don\'t pick the picture for you.',
  'composer.offline': 'Backend unavailable. Reconnect before generating.',
  'composer.continuation.label': 'Remixing the previous image',
  'composer.continuation.title': 'Continue the frame',
  'composer.continuation.body': 'Based on image {n}. Tell it what to change.',
  'composer.continuation.cancel': 'Cancel remix',
  'composer.prompt': 'Prompt',
  'composer.prompt.placeholder': 'A minimalist coffee brand poster, warm tones, natural light, generous negative space',
  'composer.prompt.placeholderRemix': 'Describe the next change: what to keep, what to replace, what to add.',
  'composer.prompt.tone.thin': 'thin',
  'composer.prompt.tone.focused': 'focused',
  'composer.prompt.tone.rich': 'rich',
  'composer.prompt.tone.dense': 'dense',
  'composer.prompt.tone.over': 'overdone',
  'composer.tools.modelEyebrow': 'Model',
  'composer.tools.modelDefault': 'default',
  'composer.tools.modelCustom': 'Custom · {name}',
  'composer.tools.modelCustomEmpty': 'Custom · empty',
  'composer.tools.ref': 'References',
  'composer.tools.refCount': 'Ref ×{n}',
  'composer.tools.refContinue': 'Add more',
  'composer.tools.enhance': 'Enhance',
  'composer.tools.enhanceLabel': 'Smart prompt enhance',
  'composer.tools.undo': 'Undo',
  'composer.tools.undoLabel': 'Undo magic enhance',
  'composer.tools.copy': 'Copy',
  'composer.tools.copyLabel': 'Copy prompt',
  'composer.tools.clear': 'Clear',
  'composer.tools.clearLabel': 'Clear prompt',
  'composer.advanced.q': 'Need negative prompt, seed, quality, etc.?',
  'composer.advanced.open': 'Open settings',
  'composer.styleTemplate': 'Prompt template',
  'composer.stylePreset': '{count} presets',
  'composer.styleHint': 'Style guidance appended at generation time',
  'composer.styleHintRaw': '"Raw" selected — sent verbatim',
  'composer.styleHintBody': 'Original snippet appended to your prompt',
  'composer.styleHintRawNote': 'No style guidance is appended. What you write is what gets sent.',
  'composer.styleHintBodyNote': 'Don\'t want it? Switch to "Raw" or write your own lens / lighting / material above.',
  'composer.size': 'Size',
  'composer.sizeLabel': 'Choose size',
  'composer.count': 'Count',
  'composer.countLabel': 'Choose count',
  'composer.refTitle': 'Reference {count} / {max}',
  'composer.refContinue': 'Add more',
  'composer.refRemove': 'Remove reference {name}',
  'composer.cta.write': 'Write a prompt to generate',
  'composer.cta.busy': 'Composing — tap to cancel',
  'composer.cta.continue': 'Continue frame',
  'composer.cta.generate': 'Generate',
  'composer.coverage': 'Coverage',

  'canvas.eyebrow': '02 · Canvas',
  'canvas.title': 'Press canvas',
  'canvas.requestId': 'Click to copy full request id: {id}',
  'canvas.empty.title': 'Empty canvas',
  'canvas.empty.body': 'Write a description, or pick a starting point.',
  'canvas.empty.bodyKbd': 'opens the command palette',
  'canvas.empty.unconfigured.title': 'Configure your API',
  'canvas.empty.unconfigured.body': 'Add an OpenAI-compatible base URL and key. Requests route through our built-in proxy to dodge CORS and gateway timeouts.',
  'canvas.empty.unconfigured.cta': 'Open settings',
  'canvas.empty.proxy': 'proxy · likeyou.qzz.io · transparent',
  'canvas.empty.compose': 'Write a prompt',
  'canvas.empty.generate': 'Generate now',
  'canvas.action.continue': 'Continue',
  'canvas.action.download': 'Download',
  'canvas.action.zoom': 'Zoom',
  'canvas.action.copyPrompt': 'Copy prompt',
  'canvas.action.export': 'Export params',
  'canvas.action.share': 'Share',
  'canvas.tool.zoom': 'Zoom in',
  'canvas.tool.openExternal': 'Open in new tab',
  'canvas.tool.download': 'Download',
  'canvas.drop.title': 'Drop to add as reference',
  'canvas.drop.formats': 'PNG · JPEG · WEBP · GIF',
  'canvas.drop.full': 'Reference limit reached',
  'canvas.drop.fullHint': 'Up to {n} references',
  'canvas.error': 'Generation failed',
  'canvas.pending.dispatch': 'Parsing prompt',
  'canvas.pending.compose': 'Composing frame',
  'canvas.pending.detail': 'Rendering details',
  'canvas.pending.wait': 'Awaiting response',
  'canvas.pending.cancel': 'Cancel this generation',
  'canvas.pending.cancelLabel': 'Cancel',
  'canvas.pending.remain': '~{n}s',
  'canvas.pending.remainSoon': 'Almost there',
  'canvas.pending.remainOver': 'Past estimate, still waiting on upstream',
  'canvas.mosaic.label': 'Generated results',
  'canvas.mosaic.activeHint': 'Image {n} active — tap to zoom',
  'canvas.mosaic.selectHint': 'Select image {n}',
  'canvas.imageGenerated': 'Generated image {n}',
  'canvas.untitled': 'untitled draft',

  'chat.canvas': 'canvas',
  'chat.refCount': 'Ref ×{n}',
  'chat.cancel': 'Cancel',
  'chat.retry': 'Retry',
  'chat.copyError': 'Copy error',
  'chat.errorFallback': 'Generation failed. Try again later.',
  'chat.actionRetry': 'Generate again',
  'chat.actionCopyPrompt': 'Copy prompt',
  'chat.actionDownload': 'Download image {n}',
  'chat.actionContinue': 'Continue',
  'chat.imageZoom': 'Zoom image {n}',
  'chat.continueChip': 'Continued from previous',
  'chat.continueChipFallback': 'Continue editing',
  'chat.continueLabel': 'Based on image {n} — tap to jump back to original turn',

  'stream.empty.title': 'What shall we paint?',
  'stream.empty.body': 'Write a short description or pick a style as a starting point.',
  'stream.empty.unconfigured.title': 'Configure your API',
  'stream.empty.unconfigured.body': 'Add a base URL and key. Requests route through our built-in proxy.',
  'stream.empty.unconfigured.cta': 'Open settings',
  'stream.label': 'Conversation',
  'stream.jump': 'Scroll to bottom',

  'dock.placeholder': 'What today…',
  'dock.placeholderRemix': 'What changes for this image?',
  'dock.cancel': 'Cancel generation',
  'dock.send': 'Send prompt and generate',
  'dock.sendRemix': 'Send remix prompt',
  'dock.expand': 'Expand input',
  'dock.shrink': 'Collapse input',
  'dock.refOpen': 'Add reference',
  'dock.refOpenWith': '{n} reference(s) added — tap to add more',
  'dock.modelLabel': 'Choose model',
  'dock.styleLabel': 'Style: {name} — tap to change',
  'dock.continueLabel': 'Remixing previous image',
  'dock.continueTitle': 'Continue',
  'dock.continueBody': 'Based on image {n}. What to tweak?',
  'dock.continueCancel': 'Cancel remix',
  'dock.offline': 'Backend offline — sending will fail',
  'dock.refTitle': 'References {count} / {max}',
  'dock.refContinue': 'Add more',
  'dock.refRemove': 'Remove reference {name}',
  'dock.modelCustom': 'Custom model name',
  'dock.modelCustomPlaceholder': 'e.g. dall-e-3, flux-pro, or any model the relay supports',

  'styleSheet.eyebrow': 'Style',
  'styleSheet.title': 'Pick a visual mood',
  'styleSheet.label': 'Choose visual style',
  'styleSheet.note': 'Picking a style only changes the visual mood — it never replaces your prompt. For size, count, seed, etc., use Settings up top.',
  'styleSheet.rawPreview': 'No guidance appended. Sent verbatim.',

  'activity.eyebrow': '03 · Activity',
  'activity.title': 'Timeline',
  'activity.viewAll': 'All',
  'activity.viewAllCount': 'View all {count}',
  'activity.live.title': 'Generating · {n}s',
  'activity.live.idle': 'Working…',
  'activity.empty': 'After each generation, the last 12 turns appear here. Tap to restore prompt + params.',
  'activity.restoreLabel': 'Restore history: {prompt}',
  'activity.refTag': 'Ref',

  'locale.zh-CN': '简体中文',
  'locale.en': 'English',
  'locale.auto': 'System default',
}

const dictionaries: Record<Locale, Messages> = {
  'zh-CN': zh,
  en,
}

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

function detectSystemLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh-CN'
  const tags = (navigator.languages?.length ? navigator.languages : [navigator.language]).map((l) =>
    l.toLowerCase(),
  )
  for (const tag of tags) {
    if (tag.startsWith('zh')) return 'zh-CN'
    if (tag.startsWith('en')) return 'en'
  }
  return 'zh-CN'
}

function loadPreference(): LocalePreference {
  if (typeof window === 'undefined') return 'auto'
  try {
    const raw = window.localStorage.getItem(LOCALE_KEY)
    if (raw === 'zh-CN' || raw === 'en' || raw === 'auto') return raw
  } catch {
    // private mode etc.
  }
  return 'auto'
}

const preference = ref<LocalePreference>(loadPreference())
const systemLocale = ref<Locale>(detectSystemLocale())

const locale = computed<Locale>(() =>
  preference.value === 'auto' ? systemLocale.value : preference.value,
)

watch(preference, (next) => {
  if (typeof window === 'undefined') return
  try {
    if (next === 'auto') window.localStorage.removeItem(LOCALE_KEY)
    else window.localStorage.setItem(LOCALE_KEY, next)
  } catch {}
})

watch(
  locale,
  (next) => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', next)
    }
  },
  { immediate: true },
)

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'undefined') {
  // navigator.languages doesn't fire change events; the next-best signal
  // is the system color-scheme media query, which usually flips with locale changes.
  // We only re-read on focus to avoid binding an extra listener forever.
  window.addEventListener('focus', () => {
    systemLocale.value = detectSystemLocale()
  })
}

// ---------------------------------------------------------------------------
// Translation function
// ---------------------------------------------------------------------------

function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key]
    return value === undefined || value === null ? `{${key}}` : String(value)
  })
}

/**
 * Reactive translate. Returns the literal `key` if no translation found, so
 * untranslated keys are immediately visible during development.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = dictionaries[locale.value]
  const fallback = dictionaries['zh-CN']
  const message = dict[key] ?? fallback[key] ?? key
  return format(message, params)
}

export function useI18n() {
  return {
    locale,
    preference,
    setLocale(next: LocalePreference) {
      preference.value = next
    },
    t,
    locales: ['auto', 'zh-CN', 'en'] as LocalePreference[],
  }
}
