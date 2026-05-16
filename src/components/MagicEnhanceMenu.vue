<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import {
  analyzePromptDoc,
  applyLintFix,
  buildSlotCards,
  createAxisVariants,
  createPromptVariants,
  enhanceDimensions,
  enhanceIntentMeta,
  enhanceLevelMeta,
  enhanceModeMeta,
  enhancePromptDoc,
  enhanceSingleDimension,
  getMissingLabel,
  inferEnhanceIntent,
  type EnhanceDimension,
  type EnhanceIntent,
  type EnhanceLevel,
  type EnhanceMode,
  type EnhanceResult,
  type PromptVariant,
  type SlotCard,
} from '../lib/magicEnhance'
import type { PromptContext, SlotName, LintIssue } from '../lib/promptDoc'
import { listCameraRecipes } from '../lib/cameraLookbook'
import type { ImageQuality, ImageStyle } from '../types'
import { useBodyLock } from '../composables/useBodyLock'
import { useFocusTrap } from '../composables/useFocusTrap'

interface Props {
  prompt: string
  imageStyle: ImageStyle
  compact?: boolean
  hasReferenceImages?: boolean
  size?: string
  quality?: ImageQuality
  modelName?: string
  context?: PromptContext | null
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
  hasReferenceImages: false,
  size: '1024x1024',
  quality: 'auto',
  modelName: '',
  context: null,
})

const emit = defineEmits<{
  (e: 'enhance', result: EnhanceResult): void
  (e: 'ab-test', original: string, optimized: EnhanceResult): void
  (e: 'update-prompt', value: string): void
  (e: 'close'): void
}>()

const selectedLevel = ref<EnhanceLevel>('standard')
const selectedMode = ref<EnhanceMode>('balanced')
const selectedIntent = ref<EnhanceIntent>('create')
const selectedVariantId = ref('current')
const intentTouched = ref(false)
const dialogRef = ref<HTMLElement | null>(null)
const slotOverrides = ref<Partial<Record<SlotName, string>>>({})
const editingSlot = ref<SlotName | null>(null)
const editingDraft = ref('')
const variantTab = ref<'matrix' | 'lighting' | 'camera' | 'palette' | 'mood' | 'composition'>('matrix')
const wantsAB = ref(false)
const cameraLookbookOpen = ref(false)
const cameraRecipes = computed(() => listCameraRecipes(analysis.value.language))

function pickCameraFromLookbook(recipe: { id: string; value: string }) {
  const next = { ...slotOverrides.value }
  next.camera = recipe.value
  slotOverrides.value = next
  cameraLookbookOpen.value = false
  selectedVariantId.value = 'current'
}

const intentOptions = Object.values(enhanceIntentMeta)
const modeOptions = Object.values(enhanceModeMeta)
const levelKeys: EnhanceLevel[] = ['light', 'standard', 'heavy']

const analysis = computed(() =>
  analyzePromptDoc({
    prompt: props.prompt,
    style: props.imageStyle,
    size: props.size,
    quality: props.quality,
    intent: selectedIntent.value,
    modelName: props.modelName,
    hasReferenceImages: props.hasReferenceImages,
  }),
)
const missingDimensions = computed(() => analysis.value.missingDimensions)
const missingHint = computed(() => getMissingLabel(missingDimensions.value))
const hasMissing = computed(() => missingDimensions.value.length > 0)
const canEnhance = computed(() => props.prompt.trim().length > 0)
const beforeText = computed(() => props.prompt.trim())

const slotOverridePayload = computed(() => {
  const out: Partial<Record<SlotName, { value: string; source: 'user' }>> = {}
  for (const [slot, value] of Object.entries(slotOverrides.value) as Array<[SlotName, string]>) {
    if (value && value.trim()) {
      out[slot] = { value: value.trim(), source: 'user' }
    }
  }
  return Object.keys(out).length ? out : undefined
})

const currentVariant = computed<PromptVariant>(() => ({
  id: 'current',
  label: '当前策略',
  hint: `${enhanceIntentMeta[selectedIntent.value].label} · ${enhanceLevelMeta[selectedLevel.value].label}`,
  result: enhancePromptDoc({
    prompt: props.prompt,
    style: props.imageStyle,
    size: props.size,
    quality: props.quality,
    level: selectedLevel.value,
    mode: selectedMode.value,
    intent: selectedIntent.value,
    modelName: props.modelName,
    hasReferenceImages: props.hasReferenceImages,
    context: props.context ?? undefined,
    slotOverrides: slotOverridePayload.value,
  }),
}))

const matrixVariants = computed<PromptVariant[]>(() => {
  const items = [
    currentVariant.value,
    ...createPromptVariants(
      props.prompt,
      props.imageStyle,
      selectedMode.value,
      selectedIntent.value,
      props.context ?? undefined,
    ),
  ]
  const seen = new Set<string>()
  return items.filter((item) => {
    const value = item.result.enhanced.trim()
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
})

const axisVariants = computed<PromptVariant[]>(() => {
  if (variantTab.value === 'matrix') return []
  return createAxisVariants(
    props.prompt,
    props.imageStyle,
    variantTab.value,
    selectedIntent.value,
    props.context ?? undefined,
  )
})

const variants = computed<PromptVariant[]>(() => {
  if (variantTab.value === 'matrix') return matrixVariants.value
  return [currentVariant.value, ...axisVariants.value].filter((item, index, arr) => {
    const value = item.result.enhanced.trim()
    return value.length > 0 && arr.findIndex((v) => v.result.enhanced.trim() === value) === index
  })
})

const variantTabs: Array<{ id: 'matrix' | 'lighting' | 'camera' | 'palette' | 'mood' | 'composition'; label: string }> = [
  { id: 'matrix', label: '矩阵' },
  { id: 'lighting', label: '光位' },
  { id: 'camera', label: '镜头' },
  { id: 'palette', label: '色彩' },
  { id: 'mood', label: '氛围' },
  { id: 'composition', label: '构图' },
]

const selectedVariant = computed(() =>
  variants.value.find((item) => item.id === selectedVariantId.value) ?? variants.value[0] ?? currentVariant.value,
)

const selectedResult = computed(() => selectedVariant.value.result)
const scoreDelta = computed(() => Math.max(0, selectedResult.value.scoreAfter - selectedResult.value.scoreBefore))
const previewParts = computed(() => selectedResult.value.addedParts.slice(0, 8))
const activeDimensions = computed(() => selectedResult.value.dimensions.map((dim) => dimensionMeta(dim)))
const strategyTags = computed(() => [
  enhanceIntentMeta[selectedIntent.value].label,
  enhanceModeMeta[selectedMode.value].label,
  enhanceLevelMeta[selectedLevel.value].label,
  analysis.value.subjectType === 'general' ? '通用主体' : analysis.value.subjectLabel,
])
const issueItems = computed(() => analysis.value.issues.slice(0, 3))
const strengthItems = computed(() => analysis.value.strengths.slice(0, 4))
const slotCards = computed<SlotCard[]>(() => buildSlotCards(analysis.value))
const filledSlotCards = computed(() => slotCards.value.filter((card) => !card.isMissing))
const missingSlotCards = computed(() => slotCards.value.filter((card) => card.isMissing))
const lintIssues = computed(() => analysis.value.lintIssues.slice(0, 4))
const tokenEstimate = computed(() => analysis.value.estimatedTokens)
const renderModeLabel = computed(() => {
  const mode = selectedResult.value.renderMode
  if (mode === 'narrative') return '叙事 · DALL·E 友好'
  if (mode === 'compact') return '紧凑 · MJ/SD 风格'
  return '结构化 · GPT-Image 友好'
})
const grade = computed(() => {
  const score = selectedResult.value.scoreAfter
  if (score >= 88) return { label: '强', tone: 'great', hint: '可直接进入高质量生成' }
  if (score >= 72) return { label: '稳', tone: 'good', hint: '主体与画面控制已经清楚' }
  if (score >= 54) return { label: '补', tone: 'mid', hint: '需要补齐画面短板' }
  return { label: '弱', tone: 'low', hint: '建议先重构提示词' }
})
const applyLabel = computed(() => {
  if (!canEnhance.value) return '先写提示词'
  if (selectedResult.value.level === 'heavy') return '应用深度重构'
  if (selectedResult.value.mode === 'faithful') return '应用精准优化'
  return '应用智能优化'
})

function dimensionMeta(dim: EnhanceDimension) {
  return enhanceDimensions.find((item) => item.id === dim) ?? enhanceDimensions[0]
}

function selectIntent(intent: EnhanceIntent) {
  selectedIntent.value = intent
  selectedVariantId.value = 'current'
  intentTouched.value = true
}

function selectMode(mode: EnhanceMode) {
  selectedMode.value = mode
  selectedVariantId.value = 'current'
}

function selectLevel(level: EnhanceLevel) {
  selectedLevel.value = level
  selectedVariantId.value = 'current'
}

function applyResult(result = selectedResult.value) {
  if (!canEnhance.value) return
  if (wantsAB.value && result.original && result.enhanced && result.original !== result.enhanced) {
    emit('ab-test', result.original, result)
  } else {
    emit('enhance', result)
  }
  emit('close')
}

function startEditSlot(slot: SlotName) {
  editingSlot.value = slot
  const card = slotCards.value.find((item) => item.slot === slot)
  editingDraft.value = slotOverrides.value[slot] ?? card?.value ?? ''
}

function commitEditSlot() {
  if (!editingSlot.value) return
  const slot = editingSlot.value
  const value = editingDraft.value.trim()
  const next = { ...slotOverrides.value }
  if (value) {
    next[slot] = value
  } else {
    delete next[slot]
  }
  slotOverrides.value = next
  editingSlot.value = null
  editingDraft.value = ''
  selectedVariantId.value = 'current'
}

function cancelEditSlot() {
  editingSlot.value = null
  editingDraft.value = ''
}

function clearSlotOverride(slot: SlotName) {
  if (!(slot in slotOverrides.value)) return
  const next = { ...slotOverrides.value }
  delete next[slot]
  slotOverrides.value = next
  selectedVariantId.value = 'current'
}

function refillSlot(slot: SlotName) {
  clearSlotOverride(slot)
  selectedVariantId.value = 'current'
  selectedLevel.value = 'standard'
}

function applyFix(issue: LintIssue, optionId?: string) {
  if (!issue.fix) return
  const outcome = applyLintFix({
    prompt: props.prompt,
    style: props.imageStyle,
    size: props.size,
    intent: selectedIntent.value,
    modelName: props.modelName,
    hasReferenceImages: props.hasReferenceImages,
    issue,
    optionId,
    context: props.context ?? undefined,
  })
  if (outcome.nextPrompt && outcome.nextPrompt !== props.prompt) {
    emit('update-prompt', outcome.nextPrompt)
  } else if (outcome.slotOverride) {
    const next = { ...slotOverrides.value }
    next[outcome.slotOverride.slot] = outcome.slotOverride.value
    slotOverrides.value = next
    selectedVariantId.value = 'current'
  }
}

function handleDimensionClick(dim: EnhanceDimension) {
  if (!props.prompt.trim()) return
  const result = enhanceSingleDimension(props.prompt, props.imageStyle, dim, selectedMode.value, selectedIntent.value)
  emit('enhance', result)
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => [props.imageStyle, props.hasReferenceImages] as const,
  () => {
    if (!intentTouched.value) {
      selectedIntent.value = inferEnhanceIntent(props.imageStyle, props.hasReferenceImages)
    }
    selectedMode.value = analysis.value.recommendedMode
    selectedLevel.value = analysis.value.recommendedLevel
    selectedVariantId.value = 'current'
  },
  { immediate: true },
)

watch(
  () => props.prompt,
  () => {
    selectedLevel.value = analysis.value.recommendedLevel
    selectedVariantId.value = 'current'
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

useBodyLock(() => true)
useFocusTrap(() => true, dialogRef)
</script>

<template>
  <Teleport to="body">
    <div class="magic-layer" :class="{ 'magic-layer--compact': compact }" @pointerdown.self="emit('close')">
      <section
        ref="dialogRef"
        class="magic-menu"
        :class="{ 'magic-menu--compact': compact }"
        role="dialog"
        aria-modal="true"
        aria-label="提示词智能优化"
        @pointerdown.stop
      >
        <header class="magic-menu__hero">
          <div class="magic-menu__brand">
            <span class="magic-menu__brand-icon">
              <Icon name="sparkle" :size="16" />
            </span>
            <span class="min-w-0">
              <span class="magic-menu__title">提示词优化引擎</span>
              <span class="magic-menu__sub">{{ missingHint }}</span>
            </span>
          </div>

          <div class="magic-menu__score" :class="`is-${grade.tone}`">
            <span>{{ selectedResult.scoreAfter }}</span>
            <small>{{ grade.label }}</small>
          </div>

          <button type="button" class="magic-menu__close" aria-label="关闭提示词优化" @click="emit('close')">
            <Icon name="close" :size="14" />
          </button>
        </header>

        <p v-if="!prompt.trim()" class="magic-menu__empty">先写下主体或修改目标，优化引擎会自动拆解画面短板。</p>

        <template v-else>
          <section class="magic-menu__overview">
            <div class="magic-menu__grade">
              <span class="magic-menu__grade-label">{{ grade.hint }}</span>
              <span class="magic-menu__grade-score">
                {{ selectedResult.scoreBefore }}
                <Icon name="arrowRight" :size="12" />
                {{ selectedResult.scoreAfter }}
                <small v-if="scoreDelta">+{{ scoreDelta }}</small>
              </span>
            </div>
            <div class="magic-menu__tags">
              <span v-for="tag in strategyTags" :key="tag">{{ tag }}</span>
            </div>
          </section>

          <section class="magic-menu__section">
            <div class="magic-menu__section-head">
              <span>任务方向</span>
              <small>{{ enhanceIntentMeta[selectedIntent].hint }}</small>
            </div>
            <div class="magic-menu__intent-grid">
              <button
                v-for="item in intentOptions"
                :key="item.id"
                type="button"
                class="magic-menu__intent"
                :class="{ 'is-active': selectedIntent === item.id }"
                @click="selectIntent(item.id)"
              >
                <Icon :name="item.icon" :size="13" />
                <span>{{ item.label }}</span>
              </button>
            </div>
          </section>

          <section class="magic-menu__section magic-menu__section--split">
            <div>
              <div class="magic-menu__section-head">
                <span>优化强度</span>
                <small>{{ enhanceLevelMeta[selectedLevel].hint }}</small>
              </div>
              <div class="magic-menu__seg">
                <button
                  v-for="key in levelKeys"
                  :key="key"
                  type="button"
                  class="magic-menu__seg-btn"
                  :class="{ 'is-active': selectedLevel === key }"
                  @click="selectLevel(key)"
                >
                  {{ enhanceLevelMeta[key].label }}
                </button>
              </div>
            </div>

            <div>
              <div class="magic-menu__section-head">
                <span>生成取向</span>
                <small>{{ enhanceModeMeta[selectedMode].hint }}</small>
              </div>
              <div class="magic-menu__mode-row">
                <button
                  v-for="item in modeOptions"
                  :key="item.id"
                  type="button"
                  class="magic-menu__mode"
                  :class="{ 'is-active': selectedMode === item.id }"
                  :aria-label="item.label"
                  @click="selectMode(item.id)"
                >
                  <Icon :name="item.icon" :size="13" />
                  <span>{{ item.label }}</span>
                </button>
              </div>
            </div>
          </section>

          <section class="magic-menu__diagnosis">
            <div
              v-for="metric in analysis.metrics"
              :key="metric.id"
              class="magic-menu__metric"
            >
              <div class="magic-menu__metric-line">
                <span>{{ metric.label }}</span>
                <small>{{ metric.hint }}</small>
              </div>
              <span class="magic-menu__bar">
                <span :style="{ width: `${metric.score}%` }" :class="`is-${metric.state}`"></span>
              </span>
            </div>
          </section>

          <section v-if="issueItems.length || strengthItems.length" class="magic-menu__insight">
            <div v-if="strengthItems.length">
              <span class="magic-menu__mini-title">已具备</span>
              <div class="magic-menu__mini-tags">
                <span v-for="item in strengthItems" :key="item">{{ item }}</span>
              </div>
            </div>
            <div v-if="issueItems.length">
              <span class="magic-menu__mini-title">待增强</span>
              <div class="magic-menu__mini-tags is-warm">
                <span v-for="item in issueItems" :key="item">{{ item }}</span>
              </div>
            </div>
          </section>

          <section v-if="hasMissing" class="magic-menu__section">
            <div class="magic-menu__section-head">
              <span>精准补维度</span>
              <small>点一个维度直接应用</small>
            </div>
            <div class="magic-menu__dimensions">
              <button
                v-for="dim in missingDimensions"
                :key="dim"
                type="button"
                class="magic-menu__dim-chip"
                @click="handleDimensionClick(dim)"
              >
                <Icon :name="dimensionMeta(dim).icon" :size="12" />
                <span>{{ dimensionMeta(dim).label }}</span>
              </button>
            </div>
          </section>

          <section class="magic-menu__section">
            <div class="magic-menu__section-head">
              <span>候选方案</span>
              <small>{{ selectedResult.summary }}</small>
            </div>
            <div class="magic-menu__variant-tabs" role="tablist">
              <button
                v-for="tab in variantTabs"
                :key="tab.id"
                type="button"
                role="tab"
                class="magic-menu__variant-tab"
                :class="{ 'is-active': variantTab === tab.id }"
                :aria-selected="variantTab === tab.id"
                @click="() => { variantTab = tab.id; selectedVariantId = 'current' }"
              >
                {{ tab.label }}
              </button>
            </div>
            <div class="magic-menu__variants">
              <button
                v-for="item in variants"
                :key="item.id"
                type="button"
                class="magic-menu__variant"
                :class="{ 'is-active': selectedVariant.id === item.id }"
                @click="selectedVariantId = item.id"
              >
                <span>{{ item.label }}</span>
                <small>{{ item.hint }}</small>
              </button>
            </div>
          </section>

          <section class="magic-menu__section">
            <div class="magic-menu__section-head">
              <span>语义槽位识别</span>
              <small>已识别 {{ filledSlotCards.length }} / {{ slotCards.length }} · 缺 {{ missingSlotCards.length }} · 点击编辑</small>
            </div>
            <div class="magic-menu__slot-grid">
              <div
                v-for="card in slotCards"
                :key="card.slot"
                class="magic-menu__slot-card"
                :class="{
                  'is-missing': card.isMissing,
                  'is-brand': card.source === 'brand',
                  'is-session': card.source === 'session',
                  'is-continuation': card.source === 'continuation',
                  'is-overridden': card.slot in slotOverrides,
                  'is-editing': editingSlot === card.slot,
                }"
              >
                <div class="magic-menu__slot-head">
                  <Icon :name="card.icon" :size="11" />
                  <span>{{ card.label }}</span>
                  <small v-if="card.slot in slotOverrides">已编辑</small>
                  <small v-else-if="!card.isMissing">{{
                    card.source === 'user' ? '用户输入' :
                    card.source === 'brand' ? '我的画风' :
                    card.source === 'session' ? '历史口味' :
                    card.source === 'continuation' ? '接着画继承' : '引擎补齐'
                  }}</small>
                  <small v-else>待补</small>
                </div>
                <div v-if="editingSlot === card.slot" class="magic-menu__slot-edit">
                  <textarea
                    v-model="editingDraft"
                    class="magic-menu__slot-textarea"
                    rows="3"
                    :placeholder="card.label"
                    @keydown.enter.exact.prevent="commitEditSlot"
                    @keydown.esc.prevent="cancelEditSlot"
                  ></textarea>
                  <div class="magic-menu__slot-edit-actions">
                    <button type="button" class="magic-menu__slot-btn is-primary" @click="commitEditSlot">
                      <Icon name="check" :size="10" />
                      <span>保存</span>
                    </button>
                    <button type="button" class="magic-menu__slot-btn" @click="cancelEditSlot">
                      <Icon name="close" :size="10" />
                      <span>取消</span>
                    </button>
                  </div>
                </div>
                <template v-else>
                  <div
                    v-if="!card.isMissing || (card.slot in slotOverrides)"
                    class="magic-menu__slot-value"
                  >
                    {{ slotOverrides[card.slot] || card.value }}
                  </div>
                  <div v-else class="magic-menu__slot-empty">优化时可自动补齐</div>
                  <div class="magic-menu__slot-actions">
                    <button
                      type="button"
                      class="magic-menu__slot-btn"
                      aria-label="编辑这个槽位"
                      @click="startEditSlot(card.slot)"
                    >
                      <Icon name="pencil" :size="10" />
                      <span>编辑</span>
                    </button>
                    <button
                      type="button"
                      class="magic-menu__slot-btn"
                      aria-label="重新填充"
                      @click="refillSlot(card.slot)"
                    >
                      <Icon name="refresh" :size="10" />
                      <span>重填</span>
                    </button>
                    <span v-if="card.slot === 'camera'" class="magic-menu__lookbook-wrap">
                      <button
                        type="button"
                        class="magic-menu__slot-btn"
                        aria-label="从镜头图鉴选一个"
                        :aria-expanded="cameraLookbookOpen"
                        @click="cameraLookbookOpen = !cameraLookbookOpen"
                      >
                        <Icon name="camera" :size="10" />
                        <span>图鉴</span>
                      </button>
                      <div
                        v-if="cameraLookbookOpen"
                        class="magic-menu__lookbook"
                        role="listbox"
                        aria-label="镜头图鉴"
                      >
                        <button
                          v-for="recipe in cameraRecipes"
                          :key="recipe.id"
                          type="button"
                          class="magic-menu__lookbook-item"
                          role="option"
                          @click="pickCameraFromLookbook(recipe)"
                        >
                          <strong>{{ recipe.id }}</strong>
                          <small>{{ recipe.value }}</small>
                        </button>
                      </div>
                    </span>
                    <button
                      v-if="card.slot in slotOverrides"
                      type="button"
                      class="magic-menu__slot-btn is-danger"
                      @click="clearSlotOverride(card.slot)"
                    >
                      <Icon name="reset" :size="10" />
                      <span>还原</span>
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </section>

          <section v-if="lintIssues.length" class="magic-menu__section">
            <div class="magic-menu__section-head">
              <span>诊断报告</span>
              <small>{{ tokenEstimate }} tokens · {{ renderModeLabel }}</small>
            </div>
            <div class="magic-menu__lint-list">
              <div
                v-for="issue in lintIssues"
                :key="issue.id"
                class="magic-menu__lint-item"
                :class="`is-${issue.severity}`"
              >
                <Icon
                  :name="issue.severity === 'error' ? 'warning' : issue.severity === 'warning' ? 'info' : 'pulse'"
                  :size="11"
                />
                <span class="min-w-0">
                  <strong>{{ issue.message }}</strong>
                  <small v-if="issue.hint">{{ issue.hint }}</small>
                  <span v-if="issue.fix" class="magic-menu__lint-actions">
                    <template v-if="issue.fix.kind === 'pick-one-of' && issue.fix.options">
                      <button
                        v-for="option in issue.fix.options"
                        :key="option.id"
                        type="button"
                        class="magic-menu__lint-fix"
                        @click="applyFix(issue, option.id)"
                      >
                        <Icon name="check" :size="10" />
                        <span>{{ option.label }}</span>
                      </button>
                    </template>
                    <button
                      v-else
                      type="button"
                      class="magic-menu__lint-fix"
                      @click="applyFix(issue)"
                    >
                      <Icon name="check" :size="10" />
                      <span>{{ issue.fix.label }}</span>
                    </button>
                  </span>
                </span>
              </div>
            </div>
          </section>

          <section class="magic-menu__compare">
            <div>
              <span class="magic-menu__mini-title">原提示词</span>
              <p>{{ beforeText }}</p>
            </div>
            <div>
              <span class="magic-menu__mini-title">优化后</span>
              <p>{{ selectedResult.enhanced }}</p>
            </div>
          </section>

          <div v-if="activeDimensions.length || previewParts.length" class="magic-menu__parts">
            <span v-for="dim in activeDimensions" :key="dim.id" class="is-dim">
              <Icon :name="dim.icon" :size="11" />
              {{ dim.label }}
            </span>
            <span v-for="part in previewParts" :key="part">{{ part }}</span>
          </div>

          <div class="magic-menu__ab-toggle">
            <label class="magic-menu__ab-label">
              <input type="checkbox" v-model="wantsAB" />
              <span>
                <strong>A/B 双轨</strong>
                <small>同时发原始 prompt 和优化版，方便对比</small>
              </span>
            </label>
          </div>

          <button
            type="button"
            class="magic-menu__apply"
            :disabled="!canEnhance"
            @click="applyResult()"
          >
            <Icon name="check" :size="14" />
            <span>{{ wantsAB ? '应用并 A/B 双发' : applyLabel }}</span>
          </button>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.magic-layer {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: start center;
  padding: calc(env(safe-area-inset-top, 0px) + 4.75rem) 1rem 1rem;
  background: rgb(var(--color-ink) / 0.18);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.magic-layer--compact {
  place-items: end center;
  padding: 1rem 0.65rem calc(env(safe-area-inset-bottom, 0px) + 0.7rem);
}

.magic-menu {
  width: min(94vw, 620px);
  max-height: min(82vh, 760px);
  overflow: auto;
  overscroll-behavior: contain;
  padding: 0.85rem;
  border-radius: 24px;
  border: 1px solid rgb(var(--color-line-strong) / 0.78);
  background:
    linear-gradient(180deg, rgb(var(--color-vellum) / 0.98), rgb(var(--color-paper) / 0.98)),
    radial-gradient(circle at 16% 0%, rgb(var(--color-forest) / 0.12), transparent 36%),
    radial-gradient(circle at 92% 20%, rgb(var(--color-accent) / 0.1), transparent 32%);
  color: rgb(var(--color-ink));
  box-shadow:
    0 32px 72px -32px rgb(var(--color-ink) / 0.46),
    0 10px 24px -14px rgb(var(--color-ink) / 0.26);
  scrollbar-width: thin;
  touch-action: pan-y;
}

.magic-menu--compact {
  width: min(100%, 560px);
  max-height: min(82dvh, 680px);
  border-radius: 24px 24px 18px 18px;
}

.magic-menu__hero {
  position: sticky;
  top: -0.85rem;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.65rem;
  margin: -0.85rem -0.85rem 0;
  padding: 0.85rem;
  border-bottom: 1px solid rgb(var(--color-line) / 0.66);
  background: rgb(var(--color-vellum) / 0.92);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.magic-menu__brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}

.magic-menu__brand-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 12px;
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  box-shadow: 0 12px 24px -16px rgb(var(--color-ink) / 0.45);
}

.magic-menu__title,
.magic-menu__sub {
  display: block;
  min-width: 0;
}

.magic-menu__title {
  font-size: 14px;
  font-weight: 760;
  letter-spacing: 0;
}

.magic-menu__sub {
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1.25;
  color: rgb(var(--color-muted));
}

.magic-menu__score {
  display: grid;
  grid-template-columns: 1fr;
  place-items: center;
  width: 50px;
  height: 50px;
  flex-shrink: 0;
  border-radius: 16px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-paper));
}

.magic-menu__score span {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
  font-size: 18px;
  font-weight: 760;
  line-height: 1;
}

.magic-menu__score small {
  margin-top: 2px;
  font-size: 10px;
  font-weight: 720;
}

.magic-menu__score.is-great,
.magic-menu__score.is-good {
  border-color: rgb(var(--color-forest) / 0.38);
  background: rgb(var(--color-forest) / 0.11);
  color: rgb(var(--color-forest));
}

.magic-menu__score.is-mid {
  border-color: rgb(var(--color-ochre) / 0.38);
  background: rgb(var(--color-ochre) / 0.12);
  color: rgb(var(--color-ochre));
}

.magic-menu__score.is-low {
  border-color: rgb(var(--color-accent) / 0.34);
  background: rgb(var(--color-accent) / 0.1);
  color: rgb(var(--color-accent));
}

.magic-menu__close {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.78);
  background: rgb(var(--color-paper) / 0.72);
  color: rgb(var(--color-muted));
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, transform 150ms ease;
}

.magic-menu__close:hover {
  background: rgb(var(--color-paper));
  color: rgb(var(--color-ink));
}

.magic-menu__close:active {
  transform: scale(0.94);
}

.magic-menu__empty {
  margin: 0;
  padding: 1rem 0.2rem 0.2rem;
  font-size: 13px;
  line-height: 1.65;
  color: rgb(var(--color-muted));
}

.magic-menu__overview {
  display: grid;
  gap: 0.55rem;
  padding: 0.75rem 0 0.65rem;
}

.magic-menu__grade {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-radius: 18px;
  border: 1px solid rgb(var(--color-line) / 0.8);
  background: rgb(var(--color-paper) / 0.68);
  padding: 0.7rem 0.75rem;
}

.magic-menu__grade-label {
  min-width: 0;
  font-size: 12px;
  font-weight: 680;
}

.magic-menu__grade-score {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  flex-shrink: 0;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
  font-size: 12px;
  color: rgb(var(--color-muted));
}

.magic-menu__grade-score small {
  color: rgb(var(--color-forest));
}

.magic-menu__tags,
.magic-menu__mini-tags,
.magic-menu__parts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.magic-menu__tags span,
.magic-menu__mini-tags span,
.magic-menu__parts span {
  display: inline-flex;
  align-items: center;
  gap: 0.26rem;
  max-width: 100%;
  border-radius: 999px;
  background: rgb(var(--color-paper-soft) / 0.86);
  padding: 0.28rem 0.56rem;
  font-size: 10px;
  font-weight: 650;
  color: rgb(var(--color-muted));
}

.magic-menu__parts span {
  font-size: 10px;
  line-height: 1.2;
}

.magic-menu__parts .is-dim {
  background: rgb(var(--color-forest) / 0.12);
  color: rgb(var(--color-forest));
}

.magic-menu__mini-tags.is-warm span {
  background: rgb(var(--color-accent) / 0.09);
  color: rgb(var(--color-accent));
}

.magic-menu__section {
  padding: 0.65rem 0;
  border-top: 1px solid rgb(var(--color-line) / 0.7);
}

.magic-menu__section--split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 0.7rem;
}

.magic-menu__section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.45rem;
}

.magic-menu__section-head span,
.magic-menu__mini-title {
  font-size: 11px;
  font-weight: 760;
  color: rgb(var(--color-ink));
}

.magic-menu__mini-title {
  display: block;
  margin-bottom: 0.38rem;
}

.magic-menu__section-head small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: rgb(var(--color-muted));
}

.magic-menu__intent-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.38rem;
}

.magic-menu__intent,
.magic-menu__mode,
.magic-menu__seg-btn,
.magic-menu__dim-chip,
.magic-menu__variant {
  border: 1px solid rgb(var(--color-line) / 0.86);
  background: rgb(var(--color-paper) / 0.72);
  color: rgb(var(--color-ink));
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease, transform 150ms ease, box-shadow 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.magic-menu__intent {
  display: grid;
  place-items: center;
  gap: 0.24rem;
  min-height: 54px;
  padding: 0.45rem 0.28rem;
  border-radius: 14px;
  font-size: 11px;
  font-weight: 700;
}

.magic-menu__seg {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.35rem;
}

.magic-menu__seg-btn {
  height: 38px;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 720;
}

.magic-menu__mode-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.35rem;
}

.magic-menu__mode {
  display: grid;
  place-items: center;
  gap: 0.2rem;
  min-height: 42px;
  border-radius: 14px;
  font-size: 10px;
  font-weight: 700;
}

.magic-menu__intent:hover,
.magic-menu__mode:hover,
.magic-menu__seg-btn:hover,
.magic-menu__dim-chip:hover,
.magic-menu__variant:hover {
  border-color: rgb(var(--color-line-strong));
  background: rgb(var(--color-vellum));
}

.magic-menu__intent.is-active,
.magic-menu__mode.is-active,
.magic-menu__seg-btn.is-active,
.magic-menu__variant.is-active {
  border-color: rgb(var(--color-ink));
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  box-shadow: 0 10px 20px -16px rgb(var(--color-ink) / 0.5);
}

.magic-menu__diagnosis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 0.48rem;
  padding: 0.65rem 0;
  border-top: 1px solid rgb(var(--color-line) / 0.7);
}

.magic-menu__metric {
  min-width: 0;
  border-radius: 14px;
  background: rgb(var(--color-paper) / 0.52);
  padding: 0.55rem;
}

.magic-menu__metric-line {
  display: grid;
  gap: 0.16rem;
  margin-bottom: 0.4rem;
}

.magic-menu__metric-line span {
  font-size: 10px;
  font-weight: 760;
}

.magic-menu__metric-line small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 9px;
  color: rgb(var(--color-muted));
}

.magic-menu__bar {
  display: block;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(var(--color-line) / 0.46);
}

.magic-menu__bar span {
  display: block;
  height: 100%;
  min-width: 8%;
  border-radius: inherit;
  background: rgb(var(--color-forest));
}

.magic-menu__bar span.is-weak {
  background: rgb(var(--color-ochre));
}

.magic-menu__bar span.is-missing {
  background: rgb(var(--color-accent));
}

.magic-menu__insight {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
  padding: 0.65rem 0;
  border-top: 1px solid rgb(var(--color-line) / 0.7);
}

.magic-menu__dimensions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.42rem;
}

.magic-menu__dim-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.34rem;
  min-height: 36px;
  padding: 0 0.75rem;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 720;
}

.magic-menu__variants {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.42rem;
}

.magic-menu__variant {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.12rem;
  min-height: 52px;
  padding: 0.55rem 0.6rem;
  border-radius: 15px;
  text-align: left;
}

.magic-menu__variant span {
  font-size: 11px;
  font-weight: 760;
}

.magic-menu__variant small {
  font-size: 9px;
  line-height: 1.25;
  opacity: 0.72;
}

.magic-menu__compare {
  display: grid;
  grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.22fr);
  gap: 0.55rem;
  padding: 0.65rem 0;
  border-top: 1px solid rgb(var(--color-line) / 0.7);
}

.magic-menu__compare > div {
  min-width: 0;
  max-height: 190px;
  overflow: auto;
  border-radius: 18px;
  border: 1px solid rgb(var(--color-line) / 0.72);
  background: rgb(var(--color-paper) / 0.56);
  padding: 0.65rem;
}

.magic-menu__compare p {
  margin: 0;
  color: rgb(var(--color-ink));
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.magic-menu__apply {
  position: sticky;
  bottom: -0.85rem;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.48rem;
  width: calc(100% + 1.7rem);
  min-height: 50px;
  margin: 0.72rem -0.85rem -0.85rem;
  border: 0;
  border-top: 1px solid rgb(var(--color-line) / 0.74);
  background: linear-gradient(135deg, rgb(var(--color-ink)), rgb(var(--color-forest) / 0.96));
  color: rgb(var(--color-paper));
  font-size: 14px;
  font-weight: 780;
  cursor: pointer;
  box-shadow: 0 -16px 28px -24px rgb(var(--color-ink) / 0.42);
  transition: filter 160ms ease, transform 160ms ease, opacity 160ms ease;
  -webkit-tap-highlight-color: transparent;
}

.magic-menu__apply:hover:not(:disabled) {
  filter: brightness(1.06);
}

.magic-menu__apply:active:not(:disabled),
.magic-menu__intent:active,
.magic-menu__mode:active,
.magic-menu__seg-btn:active,
.magic-menu__dim-chip:active,
.magic-menu__variant:active {
  transform: scale(0.98);
}

.magic-menu__apply:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .magic-layer {
    place-items: end center;
    padding: 1rem 0.65rem calc(env(safe-area-inset-bottom, 0px) + 0.7rem);
  }

  .magic-menu {
    width: min(100%, 560px);
    max-height: min(82dvh, 680px);
    border-radius: 24px 24px 18px 18px;
  }

  .magic-menu__hero {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }

  .magic-menu__intent-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .magic-menu__section--split,
  .magic-menu__diagnosis,
  .magic-menu__insight,
  .magic-menu__compare,
  .magic-menu__variants {
    grid-template-columns: 1fr;
  }

  .magic-menu__diagnosis {
    gap: 0.4rem;
  }

  .magic-menu__metric-line {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: baseline;
  }

  .magic-menu__variant {
    min-height: 46px;
  }
}

@media (max-width: 390px) {
  .magic-menu {
    padding: 0.72rem;
  }

  .magic-menu__hero {
    top: -0.72rem;
    margin: -0.72rem -0.72rem 0;
    padding: 0.72rem;
  }

  .magic-menu__intent-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .magic-menu__mode-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .magic-menu__apply {
    width: calc(100% + 1.44rem);
    margin: 0.72rem -0.72rem -0.72rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .magic-menu__intent,
  .magic-menu__mode,
  .magic-menu__seg-btn,
  .magic-menu__dim-chip,
  .magic-menu__variant,
  .magic-menu__apply,
  .magic-menu__close {
    transition: none;
  }
}

.magic-menu__slot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.45rem;
}

.magic-menu__slot-card {
  display: grid;
  gap: 0.32rem;
  min-width: 0;
  padding: 0.55rem 0.6rem;
  border-radius: 14px;
  border: 1px solid rgb(var(--color-line) / 0.78);
  background: rgb(var(--color-paper) / 0.7);
}

.magic-menu__slot-card.is-missing {
  border-style: dashed;
  border-color: rgb(var(--color-ochre) / 0.5);
  background: rgb(var(--color-ochre) / 0.05);
  color: rgb(var(--color-muted));
}

.magic-menu__slot-card.is-brand {
  border-color: rgb(var(--color-forest) / 0.4);
  background: rgb(var(--color-forest) / 0.08);
}

.magic-menu__slot-card.is-session {
  border-color: rgb(var(--color-blueprint) / 0.4);
  background: rgb(var(--color-blueprint) / 0.08);
}

.magic-menu__slot-card.is-continuation {
  border-color: rgb(var(--color-accent) / 0.4);
  background: rgb(var(--color-accent) / 0.08);
}

.magic-menu__slot-head {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  font-size: 11px;
  font-weight: 720;
  color: rgb(var(--color-ink));
}

.magic-menu__slot-head small {
  margin-left: auto;
  font-size: 9px;
  font-weight: 620;
  color: rgb(var(--color-muted));
  letter-spacing: 0.04em;
}

.magic-menu__slot-value {
  font-size: 11px;
  line-height: 1.5;
  color: rgb(var(--color-ink));
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.magic-menu__slot-empty {
  font-size: 10px;
  color: rgb(var(--color-muted));
  font-style: italic;
}

.magic-menu__lint-list {
  display: grid;
  gap: 0.4rem;
}

.magic-menu__lint-item {
  display: flex;
  gap: 0.4rem;
  padding: 0.45rem 0.6rem;
  border-radius: 12px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-paper) / 0.5);
  font-size: 11px;
}

.magic-menu__lint-item.is-error {
  border-color: rgb(var(--color-accent) / 0.4);
  background: rgb(var(--color-accent) / 0.08);
  color: rgb(var(--color-accent));
}

.magic-menu__lint-item.is-warning {
  border-color: rgb(var(--color-ochre) / 0.4);
  background: rgb(var(--color-ochre) / 0.08);
  color: rgb(var(--color-ochre));
}

.magic-menu__lint-item.is-info {
  color: rgb(var(--color-muted));
}

.magic-menu__lint-item span {
  display: grid;
  gap: 0.18rem;
}

.magic-menu__lint-item strong {
  font-weight: 720;
}

.magic-menu__lint-item small {
  font-size: 10px;
  opacity: 0.78;
}

.magic-menu__lint-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.32rem;
  margin-top: 0.32rem;
}

.magic-menu__lint-fix {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  padding: 0.22rem 0.55rem;
  border-radius: 999px;
  border: 1px solid currentColor;
  background: rgb(var(--color-paper) / 0.6);
  color: inherit;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: background 140ms ease, transform 140ms ease;
}

.magic-menu__lint-fix:hover {
  background: rgb(var(--color-paper));
  transform: translateY(-1px);
}

.magic-menu__lint-fix:active {
  transform: translateY(0);
}

.magic-menu__lookbook-wrap {
  position: relative;
  display: inline-flex;
}

.magic-menu__lookbook {
  position: absolute;
  top: calc(100% + 0.32rem);
  right: 0;
  z-index: 5;
  display: grid;
  gap: 0.32rem;
  width: min(280px, 80vw);
  max-height: 240px;
  overflow: auto;
  padding: 0.4rem;
  border-radius: 14px;
  border: 1px solid rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-paper));
  box-shadow: var(--shadow-paper-3);
}

.magic-menu__lookbook-item {
  display: grid;
  gap: 0.2rem;
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  border: 1px solid transparent;
  background: rgb(var(--color-paper-soft) / 0.6);
  text-align: left;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease;
}

.magic-menu__lookbook-item:hover {
  border-color: rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-vellum));
}

.magic-menu__lookbook-item strong {
  font-size: 11px;
  font-weight: 720;
  color: rgb(var(--color-ink));
}

.magic-menu__lookbook-item small {
  font-size: 10px;
  line-height: 1.45;
  color: rgb(var(--color-muted));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.magic-menu__slot-card.is-overridden {
  border-color: rgb(var(--color-ink));
  background: rgb(var(--color-vellum));
  box-shadow: 0 0 0 1px rgb(var(--color-ink) / 0.18);
}

.magic-menu__slot-card.is-editing {
  border-style: solid;
  border-color: rgb(var(--color-ink));
}

.magic-menu__slot-actions {
  display: flex;
  gap: 0.32rem;
  margin-top: 0.18rem;
  flex-wrap: wrap;
}

.magic-menu__slot-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.26rem;
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.78);
  background: rgb(var(--color-paper) / 0.65);
  color: rgb(var(--color-muted));
  font-size: 10px;
  font-weight: 680;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
}

.magic-menu__slot-btn:hover {
  border-color: rgb(var(--color-line-strong));
  background: rgb(var(--color-vellum));
  color: rgb(var(--color-ink));
}

.magic-menu__slot-btn.is-primary {
  border-color: rgb(var(--color-ink));
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
}

.magic-menu__slot-btn.is-danger {
  border-color: rgb(var(--color-accent) / 0.4);
  background: rgb(var(--color-accent) / 0.08);
  color: rgb(var(--color-accent));
}

.magic-menu__slot-edit {
  display: grid;
  gap: 0.32rem;
}

.magic-menu__slot-textarea {
  width: 100%;
  resize: vertical;
  min-height: 56px;
  padding: 0.4rem 0.5rem;
  border-radius: 10px;
  border: 1px solid rgb(var(--color-line) / 0.85);
  background: rgb(var(--color-paper));
  color: rgb(var(--color-ink));
  font-size: 11px;
  line-height: 1.5;
  font-family: inherit;
}

.magic-menu__slot-textarea:focus {
  outline: none;
  border-color: rgb(var(--color-ink));
}

.magic-menu__slot-edit-actions {
  display: flex;
  gap: 0.32rem;
}

.magic-menu__variant-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.32rem;
  margin-bottom: 0.5rem;
}

.magic-menu__variant-tab {
  padding: 0.32rem 0.7rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.85);
  background: rgb(var(--color-paper) / 0.7);
  color: rgb(var(--color-muted));
  font-size: 11px;
  font-weight: 680;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
}

.magic-menu__variant-tab:hover {
  border-color: rgb(var(--color-line-strong));
  background: rgb(var(--color-vellum));
  color: rgb(var(--color-ink));
}

.magic-menu__variant-tab.is-active {
  border-color: rgb(var(--color-ink));
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
}

.magic-menu__ab-toggle {
  margin-top: 0.7rem;
  padding: 0.55rem 0.65rem;
  border-radius: 14px;
  border: 1px solid rgb(var(--color-line) / 0.74);
  background: rgb(var(--color-paper) / 0.6);
}

.magic-menu__ab-label {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  cursor: pointer;
}

.magic-menu__ab-label input[type='checkbox'] {
  margin-top: 0.18rem;
}

.magic-menu__ab-label span {
  display: grid;
  gap: 0.12rem;
}

.magic-menu__ab-label strong {
  font-size: 11px;
  font-weight: 720;
}

.magic-menu__ab-label small {
  font-size: 10px;
  color: rgb(var(--color-muted));
}
</style>
