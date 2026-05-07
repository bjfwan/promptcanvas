<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import {
  analyzePrompt,
  createPromptVariants,
  enhanceDimensions,
  enhanceIntentMeta,
  enhanceLevelMeta,
  enhanceModeMeta,
  enhancePrompt,
  enhanceSingleDimension,
  getMissingLabel,
  inferEnhanceIntent,
  type EnhanceDimension,
  type EnhanceIntent,
  type EnhanceLevel,
  type EnhanceMode,
  type EnhanceResult,
  type PromptVariant,
} from '../lib/magicEnhance'
import type { ImageStyle } from '../types'

interface Props {
  prompt: string
  style: ImageStyle
  compact?: boolean
  hasReferenceImages?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
  hasReferenceImages: false,
})

const emit = defineEmits<{
  (e: 'enhance', result: EnhanceResult): void
  (e: 'close'): void
}>()

const selectedLevel = ref<EnhanceLevel>('standard')
const selectedMode = ref<EnhanceMode>('balanced')
const selectedIntent = ref<EnhanceIntent>('create')
const selectedVariantId = ref('current')
const intentTouched = ref(false)

const intentOptions = Object.values(enhanceIntentMeta)
const modeOptions = Object.values(enhanceModeMeta)
const levelKeys: EnhanceLevel[] = ['light', 'standard', 'heavy']

const analysis = computed(() => analyzePrompt(props.prompt, props.style))
const missingDimensions = computed(() => analysis.value.missing)
const missingHint = computed(() => getMissingLabel(missingDimensions.value))
const hasMissing = computed(() => missingDimensions.value.length > 0)
const canEnhance = computed(() => props.prompt.trim().length > 0)

const currentVariant = computed<PromptVariant>(() => ({
  id: 'current',
  label: '当前方案',
  hint: `${enhanceIntentMeta[selectedIntent.value].label} · ${enhanceLevelMeta[selectedLevel.value].label}`,
  result: enhancePrompt(
    props.prompt,
    props.style,
    selectedLevel.value,
    undefined,
    selectedMode.value,
    selectedIntent.value,
  ),
}))

const variants = computed<PromptVariant[]>(() => {
  const items = [
    currentVariant.value,
    ...createPromptVariants(props.prompt, props.style, selectedMode.value, selectedIntent.value),
  ]
  const seen = new Set<string>()
  return items.filter((item) => {
    const value = item.result.enhanced.trim()
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
})

const selectedVariant = computed(() =>
  variants.value.find((item) => item.id === selectedVariantId.value) ?? variants.value[0] ?? currentVariant.value,
)

const selectedResult = computed(() => selectedVariant.value.result)
const scoreDelta = computed(() => Math.max(0, selectedResult.value.scoreAfter - selectedResult.value.scoreBefore))
const previewParts = computed(() => selectedResult.value.addedParts.slice(0, 6))

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
  emit('enhance', result)
  emit('close')
}

function handleDimensionClick(dim: EnhanceDimension) {
  if (!props.prompt.trim()) return
  const result = enhanceSingleDimension(props.prompt, props.style, dim, selectedMode.value, selectedIntent.value)
  emit('enhance', result)
  emit('close')
}

watch(
  () => [props.style, props.hasReferenceImages] as const,
  () => {
    if (!intentTouched.value) {
      selectedIntent.value = inferEnhanceIntent(props.style, props.hasReferenceImages)
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
</script>

<template>
  <div class="magic-menu" :class="{ 'magic-menu--compact': compact }">
    <div class="magic-menu__top">
      <div class="magic-menu__brand">
        <span class="magic-menu__brand-icon">
          <Icon name="sparkle" :size="14" />
        </span>
        <span>
          <span class="magic-menu__title">提示词工程台</span>
          <span class="magic-menu__sub">{{ missingHint }}</span>
        </span>
      </div>
      <div class="magic-menu__score" :class="analysis.score >= 78 ? 'is-good' : analysis.score >= 52 ? 'is-mid' : 'is-low'">
        <span>{{ selectedResult.scoreAfter }}</span>
        <small v-if="scoreDelta">+{{ scoreDelta }}</small>
      </div>
    </div>

    <p v-if="!prompt.trim()" class="magic-menu__empty">先写下主体或修改目标</p>

    <template v-else>
      <section class="magic-menu__section">
        <div class="magic-menu__section-head">
          <span>方向</span>
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
            <span>强度</span>
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
            <span>取向</span>
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
            </button>
          </div>
        </div>
      </section>

      <section class="magic-menu__metrics">
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

      <section v-if="hasMissing" class="magic-menu__section">
        <div class="magic-menu__section-head">
          <span>精准补充</span>
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
            <Icon :name="enhanceDimensions.find(d => d.id === dim)?.icon ?? 'sparkle'" :size="12" />
            <span>{{ enhanceDimensions.find(d => d.id === dim)?.label }}</span>
          </button>
        </div>
      </section>

      <section class="magic-menu__section">
        <div class="magic-menu__section-head">
          <span>方案</span>
          <small>{{ selectedResult.summary }}</small>
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

      <section class="magic-menu__preview">
        <p>{{ selectedResult.enhanced }}</p>
        <div v-if="previewParts.length" class="magic-menu__parts">
          <span v-for="part in previewParts" :key="part">{{ part }}</span>
        </div>
      </section>

      <button
        type="button"
        class="magic-menu__apply"
        :disabled="!canEnhance"
        @click="applyResult()"
      >
        <Icon name="check" :size="13" />
        <span>应用优化</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.magic-menu {
  position: fixed;
  left: 50%;
  top: clamp(5rem, 9vh, 7rem);
  transform: translateX(-50%);
  width: min(92vw, 540px);
  max-height: min(78vh, 720px);
  overflow: auto;
  padding: 0.7rem;
  border-radius: 20px;
  border: 1px solid rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-paper));
  box-shadow:
    0 24px 56px -24px rgb(var(--color-ink) / 0.34),
    0 8px 18px -8px rgb(var(--color-ink) / 0.16);
  z-index: 50;
  scrollbar-width: thin;
  overscroll-behavior: contain;
}

.magic-menu--compact {
  width: min(94vw, 500px);
  top: auto;
  bottom: calc(7rem + env(safe-area-inset-bottom, 0px));
  max-height: min(70vh, 620px);
  padding: 0.65rem;
  border-radius: 18px;
}

.magic-menu__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.2rem 0.25rem 0.55rem;
}

.magic-menu__brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}

.magic-menu__brand-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: rgb(var(--color-forest) / 0.12);
  color: rgb(var(--color-forest));
}

.magic-menu__title,
.magic-menu__sub {
  display: block;
}

.magic-menu__title {
  font-size: 13px;
  font-weight: 700;
  color: rgb(var(--color-ink));
}

.magic-menu__sub {
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1.25;
  color: rgb(var(--color-muted));
}

.magic-menu__score {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 16px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-cream));
  color: rgb(var(--color-ink));
}

.magic-menu__score span {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
}

.magic-menu__score small {
  margin-top: 2px;
  font-size: 9px;
  color: rgb(var(--color-forest));
}

.magic-menu__score.is-good {
  border-color: rgb(var(--color-forest) / 0.32);
  background: rgb(var(--color-forest) / 0.1);
}

.magic-menu__score.is-mid {
  border-color: rgb(var(--color-ochre) / 0.34);
  background: rgb(var(--color-ochre) / 0.1);
}

.magic-menu__score.is-low {
  border-color: rgb(var(--color-accent) / 0.3);
  background: rgb(var(--color-accent) / 0.08);
}

.magic-menu__empty {
  padding: 1rem 0.45rem 0.75rem;
  font-size: 12px;
  color: rgb(var(--color-muted));
  line-height: 1.5;
}

.magic-menu__section {
  padding: 0.55rem 0;
  border-top: 1px solid rgb(var(--color-line) / 0.72);
}

.magic-menu__section--split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.65rem;
}

.magic-menu__section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.magic-menu__section-head span {
  font-size: 11px;
  font-weight: 700;
  color: rgb(var(--color-ink));
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.4rem;
}

.magic-menu__intent,
.magic-menu__mode,
.magic-menu__seg-btn,
.magic-menu__dim-chip,
.magic-menu__variant {
  border: 1px solid rgb(var(--color-line) / 0.82);
  background: rgb(var(--color-cream));
  color: rgb(var(--color-ink));
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease, transform 140ms ease;
  -webkit-tap-highlight-color: transparent;
}

.magic-menu__intent {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.32rem;
  min-height: 34px;
  padding: 0 0.45rem;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
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
}

.magic-menu__seg {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.32rem;
}

.magic-menu__seg-btn {
  height: 34px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 650;
}

.magic-menu__mode-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.32rem;
}

.magic-menu__mode {
  display: grid;
  place-items: center;
  height: 34px;
  border-radius: 12px;
}

.magic-menu__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  padding: 0.55rem 0;
  border-top: 1px solid rgb(var(--color-line) / 0.72);
}

.magic-menu__metric {
  min-width: 0;
}

.magic-menu__metric-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  margin-bottom: 0.3rem;
}

.magic-menu__metric-line span {
  font-size: 10px;
  font-weight: 700;
}

.magic-menu__metric-line small {
  min-width: 0;
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

.magic-menu__dimensions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.magic-menu__dim-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  min-height: 32px;
  padding: 0 0.65rem;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 650;
}

.magic-menu__variants {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
}

.magic-menu__variant {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.08rem;
  min-height: 48px;
  padding: 0.5rem 0.55rem;
  border-radius: 14px;
  text-align: left;
}

.magic-menu__variant span {
  font-size: 11px;
  font-weight: 700;
}

.magic-menu__variant small {
  font-size: 9px;
  opacity: 0.72;
}

.magic-menu__preview {
  display: grid;
  gap: 0.45rem;
  max-height: 154px;
  overflow: auto;
  margin-top: 0.15rem;
  padding: 0.65rem;
  border-radius: 16px;
  border: 1px solid rgb(var(--color-line) / 0.7);
  background: rgb(var(--color-vellum) / 0.62);
}

.magic-menu__preview p {
  margin: 0;
  font-size: 12px;
  line-height: 1.68;
  color: rgb(var(--color-ink));
  white-space: pre-wrap;
  word-break: break-word;
}

.magic-menu__parts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.magic-menu__parts span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 999px;
  background: rgb(var(--color-paper-soft));
  padding: 0.22rem 0.48rem;
  font-size: 10px;
  color: rgb(var(--color-muted));
}

.magic-menu__apply {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  width: 100%;
  min-height: 42px;
  margin-top: 0.6rem;
  border-radius: 14px;
  border: none;
  background: rgb(var(--color-forest));
  color: rgb(var(--color-paper));
  font-size: 13px;
  font-weight: 750;
  cursor: pointer;
  transition: filter 160ms ease, transform 160ms ease, opacity 160ms ease;
  -webkit-tap-highlight-color: transparent;
}

.magic-menu__apply:hover:not(:disabled) {
  filter: brightness(1.07);
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
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 460px) {
  .magic-menu {
    width: calc(100vw - 1rem);
    max-height: min(74vh, 620px);
    border-radius: 18px;
  }

  .magic-menu__intent-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .magic-menu__section--split,
  .magic-menu__metrics,
  .magic-menu__variants {
    grid-template-columns: 1fr;
  }

  .magic-menu__variant {
    min-height: 42px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .magic-menu__intent,
  .magic-menu__mode,
  .magic-menu__seg-btn,
  .magic-menu__dim-chip,
  .magic-menu__variant,
  .magic-menu__apply {
    transition: none;
  }
}
</style>
