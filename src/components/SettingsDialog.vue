<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import Select, { type SelectOption } from './Select.vue'
import { customModelSentinel, qualityOptions } from '../presets'
import { useProviderConfig } from '../composables/useProviderConfig'
import { useDiscoveredModels, detectCapabilities } from '../composables/useDiscoveredModels'
import { useResolutionSupport } from '../composables/useResolutionSupport'
import { useFocusTrap } from '../composables/useFocusTrap'
import { useBodyLock } from '../composables/useBodyLock'
import { ApiRequestError, testProvider } from '../api'
import { loadBrandKit, saveBrandKit, brandKitHasContent } from '../lib/brandKit'
import { loadRewriteCustomInstruction, saveRewriteCustomInstruction } from '../storage'
import { useInlineRewrite } from '../composables/useInlineRewrite'
import { REWRITE_MODEL_LIST, type RewriteModelId } from '../lib/rewriteService'
import {
  loadLearnedPreference,
  summarizeLearnedPreference,
  clearLearnedPreference,
} from '../lib/preferenceLearner'
import { useI18n, type LocalePreference } from '../lib/i18n'
import type { BrandKit } from '../lib/promptDoc'
import type { GenerateImageRequest, ImageQuality } from '../types'

type OutputFormat = NonNullable<GenerateImageRequest['outputFormat']>

interface Props {
  open: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'export'): void
  (e: 'reset'): void
  (e: 'reset-provider'): void
  (e: 'test-result', payload: { ok: boolean; message: string; code?: string }): void
}>()

const negativePrompt = defineModel<string>('negativePrompt', { required: true })
const outputFormat = defineModel<OutputFormat>('outputFormat', { required: true })
const quality = defineModel<ImageQuality>('quality', { required: true })
const creativity = defineModel<number>('creativity', { required: true })
const seed = defineModel<string>('seed', { required: true })
const modelChoice = defineModel<string>('modelChoice', { required: true })
const customModel = defineModel<string>('customModel', { required: true })

const provider = useProviderConfig()
const discoveredModels = useDiscoveredModels()
const resolutionSupport = useResolutionSupport()
const i18n = useI18n()

// 单档状态标签：锁定 > 已解锁(真实生成) > 已检测(能力表) > 手动开启 > 关闭
function tierLabel(tier: '2k' | '4k'): string {
  const s = resolutionSupport.state
  if (tier === '2k') {
    if (s.blocked2k) return '已锁定'
    if (s.learned2k) return '已解锁'
    if (s.detected2k) return '已检测'
    return s.manual2k === 'on' ? '手动开启' : '关闭'
  }
  if (s.blocked4k) return '已锁定'
  if (s.learned4k) return '已解锁'
  if (s.detected4k) return '已检测'
  return s.manual4k === 'on' ? '手动开启' : '关闭'
}

// 其它能力维度的徽章（图生图 / 蒙版 / quality / 输出格式）
const capabilityBadges = computed<string[]>(() => {
  const s = resolutionSupport.state
  const badges: string[] = []
  if (s.supportsEdits) badges.push('图生图')
  if (s.supportsMask) badges.push('蒙版重绘')
  if (s.supportsQuality) badges.push('quality 分级')
  if (s.outputFormats?.length) badges.push(s.outputFormats.join(' / ').toUpperCase())
  return badges
})
const showApiKey = ref(false)
const dialogRef = ref<HTMLElement | null>(null)

type TestStatus = 'idle' | 'testing' | 'success' | 'partial' | 'error'
const testStatus = ref<TestStatus>('idle')
const testMessage = ref('')
const testHint = ref('')

const brandKitDraft = ref<BrandKit>(loadBrandKit())

const rewriteInstructionDraft = ref<string>(loadRewriteCustomInstruction())

function persistRewriteInstruction() {
  saveRewriteCustomInstruction(rewriteInstructionDraft.value)
}

const rewriteEngine = useInlineRewrite()
function pickRewriteModel(id: RewriteModelId) {
  rewriteEngine.selectModel(id)
}

function persistBrandKit() {
  saveBrandKit(brandKitDraft.value)
}

const brandKitMeaningful = computed(() => brandKitHasContent(brandKitDraft.value))

const learnedPreference = ref(loadLearnedPreference())
const learnedSummary = computed(() => summarizeLearnedPreference(learnedPreference.value))
const hasLearnedSamples = computed(() => learnedSummary.value.totalSamples >= 3)

function refreshLearnedPreference() {
  learnedPreference.value = loadLearnedPreference()
}

function handleClearLearned() {
  clearLearnedPreference()
  refreshLearnedPreference()
}

function adoptLearnedToBrandKit() {
  const summary = learnedSummary.value
  const lines: string[] = []
  if (brandKitDraft.value.alwaysInclude.trim()) {
    lines.push(brandKitDraft.value.alwaysInclude.trim())
  }
  if (summary.topFocals[0]?.value) {
    lines.push(`常用焦距 ${summary.topFocals[0].value}`)
  }
  if (summary.topTones[0]?.value) {
    lines.push(`偏好色调：${summary.topTones[0].value}`)
  }
  if (summary.topStyleAnchors[0]?.value) {
    lines.push(`偏好风格：${summary.topStyleAnchors[0].value}`)
  }
  brandKitDraft.value = {
    ...brandKitDraft.value,
    alwaysInclude: lines.filter(Boolean).join('；'),
    signaturePalette: brandKitDraft.value.signaturePalette || summary.topTones[0]?.value || '',
    signatureCamera: brandKitDraft.value.signatureCamera || summary.topFocals[0]?.value || '',
  }
  persistBrandKit()
}

function handleResetProvider() {
  provider.reset()
  showApiKey.value = false
  testStatus.value = 'idle'
  testMessage.value = ''
  testHint.value = ''
  emit('reset-provider')
}

async function handleTestProvider() {
  if (testStatus.value === 'testing') return

  const baseUrl = (provider.state.baseUrl ?? '').trim()
  const apiKey = (provider.state.apiKey ?? '').trim()

  if (!baseUrl || !apiKey) {
    testStatus.value = 'error'
    testMessage.value = '请先填写 API 端点和 API Key'
    testHint.value = ''
    emit('test-result', { ok: false, message: testMessage.value })
    return
  }

  testStatus.value = 'testing'
  testMessage.value = `正在请求 ${baseUrl.replace(/\/+$/, '')}/models ...`
  testHint.value = ''

  try {
    const result = await testProvider({
      baseUrl,
      apiKey,
      proxyUrl: provider.state.proxyUrl ?? '',
    })
    if (result.models?.length) {
      discoveredModels.setModels(result.models)
    }
    // 先把 reactive 状态切到当前 provider 的桶，再写入这次检测到的能力，
    // 避免把 A 站的能力误记到 B 站。
    resolutionSupport.selectProvider(baseUrl)
    const capability = detectCapabilities(result.models ?? [])
    resolutionSupport.setCapabilities(capability)
    testMessage.value = result.message
    const imageCount = discoveredModels.imageOnly.value.length
    if (!result.generationsCorsOk) {
      testStatus.value = 'partial'
      testHint.value = result.warnings[0] || '/images/generations 路径的 CORS 不完整，生成会被浏览器拦截但上游仍会扣费。'
      emit('test-result', {
        ok: false,
        message: result.message,
        code: 'PARTIAL_CORS',
      })
    } else {
      testStatus.value = 'success'
      const resHint = capability.supports4k
        ? '检测到支持 2K/4K'
        : capability.supports2k
          ? '检测到支持 2K'
          : '仅检测到 1024px'
      const capBits: string[] = []
      if (capability.supportsEdits) capBits.push('图生图')
      if (capability.supportsMask) capBits.push('蒙版重绘')
      const capHint = capBits.length ? `支持 ${capBits.join('、')}` : ''
      const imageHint = imageCount > 0
        ? `已从中转站拉取 ${imageCount} 个图片模型`
        : '未识别到明显的图片模型名，可选「自定义…」手动填写'
      testHint.value = [imageHint, resHint, capHint, '生成路径 CORS 检测正常'].filter(Boolean).join('；')
      emit('test-result', { ok: true, message: result.message })
    }
  } catch (error) {
    testStatus.value = 'error'
    if (error instanceof ApiRequestError) {
      testMessage.value = error.message
      testHint.value = inferErrorHint(error)
      emit('test-result', { ok: false, message: error.message, code: error.code })
    } else if (error instanceof Error) {
      testMessage.value = error.message
      testHint.value = ''
      emit('test-result', { ok: false, message: error.message })
    } else {
      testMessage.value = '测试失败'
      testHint.value = ''
      emit('test-result', { ok: false, message: '测试失败' })
    }
  }
}

function inferErrorHint(error: ApiRequestError): string {
  if (error.code === 'NETWORK_ERROR') {
    return '中转站可能不允许浏览器跨域调用（缺少 CORS 头），建议换一个支持浏览器直连的服务商'
  }
  if (error.code === 'PROVIDER_NOT_CONFIGURED') {
    return ''
  }
  if (error.code === 'OPENAI_REQUEST_FAILED' && /API Key/.test(error.message)) {
    return '请检查 API Key 是否复制完整，以及它对应的 baseUrl 是否一致'
  }
  if (error.code === 'RATE_LIMITED') {
    return '稍等几秒再点一次'
  }
  return ''
}

watch(
  () => `${provider.state.baseUrl}::${provider.state.apiKey}`,
  () => {
    if (testStatus.value === 'success' || testStatus.value === 'error') {
      testStatus.value = 'idle'
      testMessage.value = ''
      testHint.value = ''
    }
  },
)

const formatOptions: SelectOption<OutputFormat>[] = [
  { value: 'png', label: 'PNG', hint: '无损 · 支持透明' },
  { value: 'jpeg', label: 'JPEG', hint: '体积小 · 通用' },
  { value: 'webp', label: 'WEBP', hint: '现代 · 平衡' },
]

const qualitySelectOptions = computed<SelectOption<ImageQuality>[]>(() =>
  qualityOptions.map((option) => ({ value: option.value, label: option.label })),
)

const localeSelectOptions = computed<SelectOption<LocalePreference>[]>(() => [
  { value: 'auto', label: i18n.t('locale.auto') },
  { value: 'zh-CN', label: i18n.t('locale.zh-CN') },
  { value: 'en', label: i18n.t('locale.en') },
])

const modelSelectOptions = computed<SelectOption<string>[]>(() =>
  discoveredModels.mergedModelOptions.value.map((option) => ({
    value: option.value,
    label: option.label,
    hint: option.hint,
  })),
)

const isCustomModel = computed(() => modelChoice.value === customModelSentinel)

function close() {
  emit('update:open', false)
}

function rollSeed() {
  const next = Math.floor(Math.random() * 1_000_000)
  seed.value = String(next).padStart(6, '0')
}

function handleKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener('keydown', handleKey, { capture: true })
      refreshLearnedPreference()
    } else {
      window.removeEventListener('keydown', handleKey, { capture: true })
    }
  },
  { immediate: true },
)

useFocusTrap(() => props.open, dialogRef)
useBodyLock(() => props.open)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKey, { capture: true })
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dlg-fade">
      <div
        v-if="open"
        class="mobile-sheet fixed inset-0 z-sheet flex items-end justify-center px-0 py-0 sm:items-center sm:px-4 sm:py-6"
        role="dialog"
        aria-modal="true"
        :aria-label="i18n.t('settings.title')"
      >
        <div class="scrim" aria-hidden="true"></div>

        <Transition name="dlg-zoom">
          <div
            ref="dialogRef"
            v-if="open"
            class="dialog-shell relative flex w-full max-w-xl flex-col overflow-hidden text-ink"
          >
            <header class="dialog-shell__header flex items-start justify-between gap-3 border-b border-line/40 px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <p class="display-eyebrow">{{ i18n.t('settings.eyebrow') }}</p>
                <h2 class="mt-1.5 font-display text-2xl tracking-tightish gradient-text">{{ i18n.t('settings.title') }}</h2>
              </div>
              <button type="button" class="icon-btn-sm" :aria-label="i18n.t('settings.close')" @click="close">
                <Icon name="close" :size="14" />
              </button>
            </header>

            <div class="dialog-shell__body touch-scroll-y space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
              <section
                class="surface-1 p-4"
                :class="!provider.isConfigured.value && 'ring-1 ring-ochre/30'"
              >
                <div class="mb-3 flex items-center justify-between gap-2">
                  <div class="flex flex-col">
                    <span class="display-eyebrow text-[10px]">{{ i18n.t('settings.provider.eyebrow') }}</span>
                    <span class="mt-1 text-[13px] font-medium text-ink">{{ i18n.t('settings.provider.label') }}</span>
                  </div>
                  <span
                    class="inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]"
                    :class="provider.isConfigured.value
                      ? 'bg-forest/12 text-forest'
                      : 'bg-ochre/12 text-ochre'"
                  >
                    <Icon :name="provider.isConfigured.value ? 'check' : 'warning'" :size="11" />
                    <span>{{ provider.isConfigured.value ? i18n.t('settings.provider.configured') : i18n.t('settings.provider.unconfigured') }}</span>
                  </span>
                </div>

                <p class="mb-3 text-[11px] leading-[1.6] text-muted">
                  {{ i18n.t('settings.provider.note') }}
                </p>

                <div class="mb-3 flex items-start gap-2 rounded-xl border border-line/40 bg-ivory/40 px-3 py-2 text-[11px] leading-[1.55] backdrop-blur-sm">
                  <span class="mt-0.5 inline-grid h-5 w-5 place-items-center rounded-full bg-forest/12 text-forest">
                    <Icon name="share" :size="11" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="font-medium text-ink">{{ i18n.t('settings.provider.proxyOn') }}</span>
                    <span class="ml-1 text-muted">{{ i18n.t('settings.provider.proxyOnHint') }}</span>
                    <span class="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-muted/80">
                      proxy.likeyou.qzz.io
                    </span>
                  </span>
                </div>

                <div class="space-y-3">
                  <div>
                    <label class="label mb-1.5 inline-flex items-center gap-1.5" for="set-base-url">
                      <Icon name="link" :size="12" />
                      <span>{{ i18n.t('settings.provider.baseUrl') }}</span>
                    </label>
                    <input
                      id="set-base-url"
                      v-model="provider.state.baseUrl"
                      type="url"
                      class="field-input font-mono text-[12px]"
                      placeholder="https://api.openai.com/v1"
                      autocomplete="off"
                      spellcheck="false"
                      maxlength="200"
                    />
                    <p class="mt-1 text-[10px] leading-[1.5] text-muted">
                      {{ i18n.t('settings.provider.baseUrlHint') }}
                    </p>
                  </div>

                  <div>
                    <label class="label mb-1.5 inline-flex items-center gap-1.5" for="set-api-key">
                      <Icon name="lightning" :size="12" />
                      <span>API Key</span>
                    </label>
                    <div class="relative flex items-center gap-2">
                      <input
                        id="set-api-key"
                        v-model="provider.state.apiKey"
                        :type="showApiKey ? 'text' : 'password'"
                        class="field-input pr-10 font-mono text-[12px]"
                        placeholder="sk-..."
                        autocomplete="off"
                        spellcheck="false"
                        maxlength="200"
                      />
                      <button
                        type="button"
                        class="absolute right-1.5 top-1/2 inline-grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-paper-soft hover:text-ink"
                        :aria-label="showApiKey ? i18n.t('settings.provider.apiKeyHide') : i18n.t('settings.provider.apiKeyShow')"
                        :aria-pressed="showApiKey"
                        @click="showApiKey = !showApiKey"
                      >
                        <Icon :name="showApiKey ? 'eyeOff' : 'eye'" :size="14" />
                      </button>
                    </div>
                  </div>
                </div>

                <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    class="btn-quiet text-[11px]"
                    :disabled="!provider.state.baseUrl || !provider.state.apiKey || testStatus === 'testing'"
                    @click="handleTestProvider"
                  >
                    <Icon
                      :name="testStatus === 'testing' ? 'refresh' : 'pulse'"
                      :size="12"
                      :class="testStatus === 'testing' ? 'animate-spin' : ''"
                    />
                    {{ testStatus === 'testing' ? i18n.t('settings.provider.testing') : i18n.t('settings.provider.test') }}
                  </button>
                  <button
                    type="button"
                    class="btn-quiet text-[11px]"
                    :disabled="!provider.state.apiKey && !provider.state.baseUrl"
                    @click="handleResetProvider"
                  >
                    <Icon name="trash" :size="12" />
                    {{ i18n.t('settings.provider.clear') }}
                  </button>
                </div>

                <div
                  v-if="testMessage"
                  class="mt-3 rounded-xl border px-3 py-2 text-[11px] leading-[1.6]"
                  :class="{
                    'border-line/50 bg-ivory/40 text-muted': testStatus === 'testing',
                    'border-forest/35 bg-forest/10 text-forest': testStatus === 'success',
                    'border-ochre/40 bg-ochre/[0.08] text-ochre': testStatus === 'partial',
                    'border-accent/40 bg-accent/[0.08] text-accent': testStatus === 'error',
                  }"
                  role="status"
                  aria-live="polite"
                >
                  <p class="flex items-center gap-1.5 font-medium">
                    <Icon
                      :name="testStatus === 'success'
                        ? 'check'
                        : testStatus === 'partial'
                          ? 'warning'
                          : testStatus === 'error'
                            ? 'warning'
                            : 'refresh'"
                      :size="12"
                      :class="testStatus === 'testing' ? 'animate-spin' : ''"
                    />
                    <span>{{ testMessage }}</span>
                  </p>
                  <p v-if="testHint" class="mt-1 text-[10px] leading-[1.5] opacity-80">
                    {{ testHint }}
                  </p>
                </div>
              </section>

              <section
                class="surface-1 p-4"
              >
                <div class="mb-3 flex items-center justify-between gap-2">
                  <div class="flex flex-col">
                    <span class="display-eyebrow text-[10px]">分辨率能力 · Resolution</span>
                    <span class="mt-1 text-[13px] font-medium text-ink">
                      {{ resolutionSupport.unlocked4k.value ? '已解锁 4K 与 2K' : resolutionSupport.unlocked2k.value ? '已解锁 2K' : '仅 1024px' }}
                    </span>
                  </div>
                </div>

                <p class="mb-3 text-[11px] leading-[1.6] text-muted">
                  连接测试会按模型能力表推断中转站支持的尺寸；真实生成成功后会自动永久解锁、被上游拒绝则自动锁定。也可手动强制开启。
                </p>

                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-2 rounded-xl border border-line/40 bg-ivory/40 px-3 py-2 backdrop-blur-sm">
                    <div class="flex items-center gap-2">
                      <Icon name="check" :size="12" class="text-muted" />
                      <span class="text-[12px] font-medium text-ink">2K 尺寸（2048px）</span>
                    </div>
                    <label class="res-toggle inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        :checked="resolutionSupport.state.manual2k === 'on'"
                        @change="(e) => resolutionSupport.setManual2k((e.target as HTMLInputElement).checked ? 'on' : 'auto')"
                      />
                      <span class="font-mono text-[10px] uppercase tracking-[0.16em]">
                        {{ tierLabel('2k') }}
                      </span>
                    </label>
                  </div>

                  <div class="flex items-center justify-between gap-2 rounded-xl border border-line/40 bg-ivory/40 px-3 py-2 backdrop-blur-sm">
                    <div class="flex items-center gap-2">
                      <Icon name="star" :size="12" class="text-muted" />
                      <span class="text-[12px] font-medium text-ink">4K 尺寸（4096px）</span>
                    </div>
                    <label class="res-toggle inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        :checked="resolutionSupport.state.manual4k === 'on'"
                        @change="(e) => resolutionSupport.setManual4k((e.target as HTMLInputElement).checked ? 'on' : 'auto')"
                      />
                      <span class="font-mono text-[10px] uppercase tracking-[0.16em]">
                        {{ tierLabel('4k') }}
                      </span>
                    </label>
                  </div>
                </div>

                <div v-if="capabilityBadges.length" class="mt-3 flex flex-wrap gap-1.5">
                  <span
                    v-for="badge in capabilityBadges"
                    :key="badge"
                    class="rounded-full border border-line/50 bg-ivory/60 px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-muted"
                  >
                    {{ badge }}
                  </span>
                </div>

                <p class="mt-2 text-[10px] text-muted">
                  能力表是启发式推断；以「已检测」标注。真实生成的结果（已解锁 / 已锁定）始终优先。手动开启后若上游实际不支持，生成会被拒绝（4xx）。
                </p>
              </section>

              <section
                class="surface-1 p-4"
              >
                <div class="mb-3 flex items-center justify-between gap-2">
                  <div class="flex flex-col">
                    <span class="display-eyebrow text-[10px]">Brand Kit · 我的画风</span>
                    <span class="mt-1 text-[13px] font-medium text-ink">每次生成自动注入</span>
                  </div>
                  <label class="brand-toggle inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      v-model="brandKitDraft.enabled"
                      @change="persistBrandKit"
                    />
                    <span class="font-mono text-[10px] uppercase tracking-[0.16em]">
                      {{ brandKitDraft.enabled ? '已启用' : '关闭' }}
                    </span>
                  </label>
                </div>

                <p class="mb-3 text-[11px] leading-[1.6] text-muted">
                  填进来的内容会作为上下文注入提示词工程引擎，所有生成都会照做。所有数据只保存在本机 localStorage。
                </p>

                <div class="space-y-3">
                  <div>
                    <label class="label mb-1.5 inline-flex items-center gap-1.5" for="brand-always">
                      <Icon name="check" :size="12" />
                      <span>始终包含</span>
                    </label>
                    <textarea
                      id="brand-always"
                      v-model="brandKitDraft.alwaysInclude"
                      rows="2"
                      maxlength="400"
                      class="field-textarea text-[12px]"
                      placeholder="画面只用奶白、铁锈橙、雾蓝；人像保留毛孔与雀斑"
                      @blur="persistBrandKit"
                    ></textarea>
                  </div>

                  <div>
                    <label class="label mb-1.5 inline-flex items-center gap-1.5" for="brand-never">
                      <Icon name="eyeOff" :size="12" />
                      <span>永远避免</span>
                    </label>
                    <textarea
                      id="brand-never"
                      v-model="brandKitDraft.neverInclude"
                      rows="2"
                      maxlength="400"
                      class="field-textarea text-[12px]"
                      placeholder="不要 HDR；不要塑料皮肤；不出现品牌 logo"
                      @blur="persistBrandKit"
                    ></textarea>
                  </div>

                  <div class="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label class="label mb-1.5 inline-flex items-center gap-1.5" for="brand-palette">
                        <Icon name="palette" :size="12" />
                        <span>常用色板</span>
                      </label>
                      <input
                        id="brand-palette"
                        v-model="brandKitDraft.signaturePalette"
                        type="text"
                        class="field-input text-[12px]"
                        placeholder="低饱和奶油"
                        maxlength="80"
                        @blur="persistBrandKit"
                      />
                    </div>
                    <div>
                      <label class="label mb-1.5 inline-flex items-center gap-1.5" for="brand-camera">
                        <Icon name="camera" :size="12" />
                        <span>常用镜头</span>
                      </label>
                      <input
                        id="brand-camera"
                        v-model="brandKitDraft.signatureCamera"
                        type="text"
                        class="field-input text-[12px]"
                        placeholder="50mm f/2"
                        maxlength="80"
                        @blur="persistBrandKit"
                      />
                    </div>
                    <div>
                      <label class="label mb-1.5 inline-flex items-center gap-1.5" for="brand-lighting">
                        <Icon name="sun" :size="12" />
                        <span>常用光位</span>
                      </label>
                      <input
                        id="brand-lighting"
                        v-model="brandKitDraft.signatureLighting"
                        type="text"
                        class="field-input text-[12px]"
                        placeholder="窗光左 30°"
                        maxlength="80"
                        @blur="persistBrandKit"
                      />
                    </div>
                  </div>

                  <div v-if="brandKitMeaningful" class="text-[10px] text-muted">
                    已启用：{{ brandKitDraft.enabled ? '会注入到每次生成' : '已保存但未启用，开启上方开关后生效' }}
                  </div>
                </div>
              </section>

              <section
                class="surface-1 p-4"
              >
                <div class="mb-3 flex flex-col">
                  <span class="display-eyebrow text-[10px]">AI Rewrite · 改写引擎</span>
                  <span class="mt-1 text-[13px] font-medium text-ink">
                    项目方赞助 · 你不用配置 API
                  </span>
                </div>

                <p class="mb-2 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                  <Icon name="lightning" :size="11" />
                  <span>选用模型</span>
                </p>
                <div class="rewrite-segmented" role="radiogroup" aria-label="AI 改写模型">
                  <button
                    v-for="m in REWRITE_MODEL_LIST"
                    :key="m.id"
                    type="button"
                    role="radio"
                    class="rewrite-seg"
                    :class="{ 'is-active': rewriteEngine.state.modelId === m.id }"
                    :aria-checked="rewriteEngine.state.modelId === m.id"
                    @click="pickRewriteModel(m.id)"
                  >
                    <span class="rewrite-seg__label">{{ m.label }}</span>
                    <span class="rewrite-seg__hint">
                      <span>{{ m.tagline }}</span>
                      <small>{{ m.expectedSeconds[0] }}–{{ m.expectedSeconds[1] }}s</small>
                    </span>
                  </button>
                </div>

                <hr class="my-4 border-line/60" />

                <p class="mb-2 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                  <Icon name="pencil" :size="11" />
                  <span>自定义指令（可选）</span>
                </p>

                <p class="mb-3 text-[11px] leading-[1.6] text-muted">
                  填进来的内容会以最高优先级追加到 AI 改写的 system prompt 末尾。可以写"画面只用奶白和铁锈橙""人像保留毛孔与雀斑""我喜欢 35mm 胶片质感"等。空着也没事，引擎已经按 intent 自动分流。
                </p>

                <textarea
                  v-model="rewriteInstructionDraft"
                  rows="3"
                  maxlength="400"
                  class="field-textarea text-[12px]"
                  placeholder="例：永远输出中文；尽量保留 35mm f/2 的镜头感；色调偏奶油..."
                  @blur="persistRewriteInstruction"
                ></textarea>

                <p class="mt-2 text-[10px] text-muted">
                  最多 400 字 · 仅作用于"AI 改写"，不影响图像生成本身
                </p>
              </section>

              <section
                class="surface-1 p-4"
              >
                <div class="mb-3 flex items-center justify-between gap-2">
                  <div class="flex flex-col">
                    <span class="display-eyebrow text-[10px]">Learned · 长期偏好</span>
                    <span class="mt-1 text-[13px] font-medium text-ink">
                      {{ hasLearnedSamples ? `已累积 ${learnedSummary.totalSamples} 次成功生成` : '继续生成会逐步学习你的口味' }}
                    </span>
                  </div>
                  <span
                    v-if="hasLearnedSamples"
                    class="inline-flex items-center gap-1 rounded-full bg-blueprint/12 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-blueprint"
                  >
                    <Icon name="pulse" :size="11" />
                    <span>会自动注入</span>
                  </span>
                </div>

                <p class="mb-3 text-[11px] leading-[1.6] text-muted">
                  这里展示从你历史生成中统计出的偏好特征，每次生成都会自动作为上下文喂给提示词工程引擎。可以一键采纳到「我的画风」固化为永久协议。
                </p>

                <div v-if="hasLearnedSamples" class="grid gap-2.5 text-[11px]">
                  <div v-if="learnedSummary.topFocals.length" class="learned-row">
                    <span class="learned-row__label">焦距</span>
                    <span class="learned-row__chips">
                      <span
                        v-for="entry in learnedSummary.topFocals"
                        :key="entry.value"
                      >{{ entry.value }} <small>×{{ entry.count }}</small></span>
                    </span>
                  </div>
                  <div v-if="learnedSummary.topTones.length" class="learned-row">
                    <span class="learned-row__label">色调</span>
                    <span class="learned-row__chips">
                      <span
                        v-for="entry in learnedSummary.topTones"
                        :key="entry.value"
                      >{{ entry.value }} <small>×{{ entry.count }}</small></span>
                    </span>
                  </div>
                  <div v-if="learnedSummary.topStyleAnchors.length" class="learned-row">
                    <span class="learned-row__label">风格</span>
                    <span class="learned-row__chips">
                      <span
                        v-for="entry in learnedSummary.topStyleAnchors"
                        :key="entry.value"
                      >{{ entry.value }} <small>×{{ entry.count }}</small></span>
                    </span>
                  </div>
                  <div v-if="learnedSummary.topSubjects.length" class="learned-row">
                    <span class="learned-row__label">常画</span>
                    <span class="learned-row__chips">
                      <span
                        v-for="entry in learnedSummary.topSubjects"
                        :key="entry.value"
                      >{{ entry.value }} <small>×{{ entry.count }}</small></span>
                    </span>
                  </div>
                  <div v-if="learnedSummary.topModes.length" class="learned-row">
                    <span class="learned-row__label">模式</span>
                    <span class="learned-row__chips">
                      <span
                        v-for="entry in learnedSummary.topModes"
                        :key="entry.value"
                      >{{ entry.value }} <small>×{{ entry.count }}</small></span>
                    </span>
                  </div>
                </div>

                <div v-else class="rounded-xl border border-dashed border-line/50 bg-ivory/30 px-3 py-3 text-[11px] text-muted backdrop-blur-sm">
                  还没有足够样本。每成功生成一张图，引擎会从中提炼焦距、色调、风格等偏好。
                </div>

                <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    class="btn-quiet text-[11px]"
                    :disabled="!hasLearnedSamples"
                    @click="adoptLearnedToBrandKit"
                  >
                    <Icon name="check" :size="12" />
                    采纳到我的画风
                  </button>
                  <button
                    type="button"
                    class="btn-quiet text-[11px]"
                    :disabled="!hasLearnedSamples"
                    @click="handleClearLearned"
                  >
                    <Icon name="trash" :size="12" />
                    清空学习数据
                  </button>
                </div>
              </section>

              <section>
                <label class="label mb-2 inline-flex items-center gap-1.5" for="set-neg">
                  <Icon name="eyeOff" :size="12" />
                  <span>{{ i18n.t('settings.negative') }}</span>
                </label>
                <textarea
                  id="set-neg"
                  v-model="negativePrompt"
                  rows="2"
                  maxlength="400"
                  class="field-textarea"
                  :placeholder="i18n.t('settings.negative.placeholder')"
                ></textarea>
              </section>

              <section>
                <label class="label mb-2 inline-flex items-center gap-1.5" for="set-model">
                  <Icon name="settings" :size="12" />
                  <span>{{ i18n.t('settings.model') }}</span>
                </label>
                <Select
                  id="set-model"
                  v-model="modelChoice"
                  :options="modelSelectOptions"
                  :aria-label="i18n.t('settings.model')"
                />
                <input
                  v-if="isCustomModel"
                  v-model="customModel"
                  type="text"
                  class="field-input mt-2 font-mono text-[12px]"
                  :placeholder="i18n.t('settings.model.custom')"
                  autocomplete="off"
                  spellcheck="false"
                  maxlength="64"
                />
              </section>

              <section class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="label mb-2 inline-flex items-center gap-1.5" for="set-quality">
                    <Icon name="star" :size="12" />
                    <span>{{ i18n.t('settings.quality') }}</span>
                  </label>
                  <Select
                    id="set-quality"
                    v-model="quality"
                    :options="qualitySelectOptions"
                    :aria-label="i18n.t('settings.quality.label')"
                  />
                </div>
                <div>
                  <label class="label mb-2 inline-flex items-center gap-1.5" for="set-format">
                    <Icon name="image" :size="12" />
                    <span>{{ i18n.t('settings.format') }}</span>
                  </label>
                  <Select
                    id="set-format"
                    v-model="outputFormat"
                    :options="formatOptions"
                    :aria-label="i18n.t('settings.format.label')"
                  />
                </div>
              </section>

              <section>
                <label class="label mb-2 inline-flex items-center gap-1.5" for="set-locale">
                  <Icon name="command" :size="12" />
                  <span>{{ i18n.t('settings.locale') }}</span>
                </label>
                <Select
                  id="set-locale"
                  :model-value="i18n.preference.value"
                  :options="localeSelectOptions"
                  :aria-label="i18n.t('settings.locale.label')"
                  @update:model-value="(value) => i18n.setLocale(value)"
                />
                <p class="mt-1 text-[10px] leading-[1.5] text-muted">
                  {{ i18n.preference.value === 'auto'
                      ? i18n.t('settings.locale.auto', { name: i18n.t(`locale.${i18n.locale.value}`) })
                      : i18n.t('settings.locale.locked') }}
                </p>
              </section>

              <section>
                <label class="label mb-2 inline-flex items-center gap-1.5" for="set-seed">
                  <Icon name="dice" :size="12" />
                  <span>Seed</span>
                </label>
                <div class="relative flex items-center gap-2">
                  <input
                    id="set-seed"
                    v-model="seed"
                    class="field-input pr-12"
                    :placeholder="i18n.t('settings.seed.placeholder')"
                    autocomplete="off"
                    spellcheck="false"
                    inputmode="numeric"
                  />
                  <button
                    type="button"
                    class="absolute right-1.5 top-1/2 inline-grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-paper-soft hover:text-ink"
                    :aria-label="i18n.t('settings.seed.roll')"
                    @click="rollSeed"
                  >
                    <Icon name="dice" :size="14" />
                  </button>
                </div>
              </section>

              <section>
                <div class="mb-2 flex items-center justify-between">
                  <span class="label inline-flex items-center gap-1.5">
                    <Icon name="lightning" :size="12" />
                    <span>{{ i18n.t('settings.creativity') }}</span>
                  </span>
                  <span class="font-mono text-[11px] tabular-nums text-ink">{{ creativity }} / 10</span>
                </div>
                <input
                  v-model.number="creativity"
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  class="settings-range w-full"
                  :aria-label="i18n.t('settings.creativity')"
                />
                <div class="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                  <span>{{ i18n.t('settings.creativity.low') }}</span>
                  <span>{{ i18n.t('settings.creativity.high') }}</span>
                </div>
              </section>
            </div>

            <footer
              class="dialog-shell__footer flex flex-col-reverse items-stretch gap-2 border-t border-line/40 bg-ivory/30 px-5 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <button
                type="button"
                class="btn-quiet justify-start gap-2 text-[12px]"
                @click="emit('reset')"
              >
                <Icon name="reset" :size="13" />
                {{ i18n.t('settings.action.reset') }}
              </button>
              <button
                type="button"
                class="btn-secondary text-[12px]"
                @click="emit('export')"
              >
                <Icon name="download" :size="13" />
                {{ i18n.t('settings.action.export') }}
              </button>
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-shell {
  max-height: min(92dvh, calc(100svh - env(safe-area-inset-top, 0px) - 0.75rem));
  border: 1px solid rgb(var(--color-line) / 0.82);
  border-radius: var(--radius-card);
  background: rgb(var(--color-surface) / 0.98);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-glass-lg), var(--shadow-inner-glass);
}

.dialog-shell__header,
.dialog-shell__footer {
  flex: 0 0 auto;
}

.dialog-shell__body {
  max-height: calc(min(92dvh, 100svh) - 9rem);
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-gutter: stable;
}

@media (max-width: 639px) {
  .mobile-sheet {
    padding-top: max(env(safe-area-inset-top, 0px), 0.5rem);
  }

  .dialog-shell {
    max-height: calc(var(--mobile-viewport-height, 100dvh) - max(env(safe-area-inset-top, 0px), 0.5rem));
    border-bottom: 0;
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .dialog-shell__header {
    padding: 1rem 1rem 0.85rem;
  }

  .dialog-shell__body {
    max-height: none;
    flex: 1 1 auto;
    padding: 1rem;
  }

  .dialog-shell__footer {
    padding: 0.85rem 1rem calc(env(safe-area-inset-bottom, 0px) + 0.85rem);
  }

  .dialog-shell__footer .btn-quiet,
  .dialog-shell__footer .btn-secondary {
    min-height: 44px;
    justify-content: center;
  }

  .rewrite-segmented {
    grid-template-columns: 1fr;
  }

  .rewrite-seg {
    min-height: 52px;
  }

  .learned-row {
    grid-template-columns: 1fr;
    gap: 0.35rem;
  }

  .settings-range {
    height: 40px;
  }

  .settings-range::-webkit-slider-runnable-track {
    height: 6px;
  }

  .settings-range::-webkit-slider-thumb {
    width: 26px;
    height: 26px;
    margin-top: -10px;
  }

  .settings-range::-moz-range-track {
    height: 6px;
  }

  .settings-range::-moz-range-thumb {
    width: 26px;
    height: 26px;
  }
}

.rewrite-segmented {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 4px;
  border-radius: var(--radius-panel);
  background: rgb(var(--color-surface-muted) / 0.92);
  border: 1px solid rgb(var(--color-line) / 0.75);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: var(--shadow-inner-glass);
}

.rewrite-seg {
  display: grid;
  align-items: center;
  gap: 2px;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: rgb(var(--color-muted));
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 200ms var(--motion-soft),
    color 200ms var(--motion-soft),
    box-shadow 200ms var(--motion-soft),
    transform 160ms var(--motion-press);
}

.rewrite-seg:hover {
  color: rgb(var(--color-ink));
}

.rewrite-seg:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.rewrite-seg:active {
  transform: translateY(1px);
}

.rewrite-seg.is-active {
  background: var(--gradient-primary);
  color: #fff;
  box-shadow:
    var(--shadow-glass), var(--shadow-glow-accent),
    inset 0 1px 0 rgb(255 255 255 / 0.18);
}

.rewrite-seg__label {
  font-family: 'Fraunces', 'IBM Plex Sans', system-ui, serif;
  font-size: 14px;
  font-weight: 720;
  letter-spacing: -0.005em;
  line-height: 1;
}

.rewrite-seg__hint {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 10px;
  font-weight: 540;
  letter-spacing: 0.02em;
  line-height: 1.2;
}

.rewrite-seg__hint small {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9.5px;
  opacity: 0.8;
}

@media (prefers-reduced-motion: reduce) {
  .rewrite-seg { transition: none; }
}

.settings-range {
  height: 28px;
  appearance: none;
  background: transparent;
}

.settings-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgb(var(--color-forest)), rgb(var(--color-ochre)));
  box-shadow: inset 0 1px 0 rgb(var(--color-ink) / 0.08);
}

.settings-range::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  margin-top: -7px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-ivory));
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent);
}

.settings-range::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgb(var(--color-forest)), rgb(var(--color-ochre)));
}

.settings-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-ivory));
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent);
}

.brand-toggle input[type='checkbox'],
.res-toggle input[type='checkbox'] {
  appearance: none;
  width: 32px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-paper-soft));
  position: relative;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease;
}

.brand-toggle input[type='checkbox']::after,
.res-toggle input[type='checkbox']::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: rgb(var(--color-ivory));
  box-shadow: 0 1px 2px rgb(var(--color-ink) / 0.18);
  transition: transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.brand-toggle input[type='checkbox']:checked,
.res-toggle input[type='checkbox']:checked {
  background: rgb(var(--color-forest));
  border-color: rgb(var(--color-forest));
}

.brand-toggle input[type='checkbox']:checked::after,
.res-toggle input[type='checkbox']:checked::after {
  transform: translateX(13px);
}

.learned-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: start;
  gap: 0.5rem;
}

.learned-row__label {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgb(var(--color-muted));
  padding-top: 0.2rem;
}

.learned-row__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.32rem;
}

.learned-row__chips span {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  padding: 0.22rem 0.55rem;
  border-radius: 999px;
  background: rgb(var(--color-paper) / 0.78);
  border: 1px solid rgb(var(--color-line) / 0.78);
  font-size: 10px;
  font-weight: 660;
  color: rgb(var(--color-ink));
}

.learned-row__chips small {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  color: rgb(var(--color-muted));
}

.dlg-fade-enter-from,
.dlg-fade-leave-to {
  opacity: 0;
}
.dlg-fade-enter-active,
.dlg-fade-leave-active {
  transition: opacity 0.24s ease-out;
}

.dlg-zoom-enter-from {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
}
.dlg-zoom-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
.dlg-zoom-enter-active,
.dlg-zoom-leave-active {
  transition: opacity 0.24s ease-out, transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .dlg-fade-enter-active,
  .dlg-fade-leave-active,
  .dlg-zoom-enter-active,
  .dlg-zoom-leave-active {
    transition: none;
  }
}
</style>
