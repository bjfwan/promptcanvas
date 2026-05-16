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
