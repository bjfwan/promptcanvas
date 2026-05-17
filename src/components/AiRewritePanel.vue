<script setup lang="ts">
/**
 * AI 改写面板 —— 挂在 MagicEnhanceMenu 顶部的"特别席"。
 *
 * 决定不另起浮层：用户的心智里"优化"是一个动作，AI 是它的高级形态。
 * 设计上和下方本地词典严格区隔（不同色温 + 蜡封章 + 段落分隔线）。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { useRewriteEngine } from '../composables/useRewriteEngine'
import { useVibration } from '../composables/useVibration'
import { REWRITE_MODEL_LIST, type RewriteModelId } from '../lib/rewriteModels'
import type { EnhanceIntent } from '../lib/magicEnhance'
import type { ImageQuality, ImageStyle } from '../types'

interface Props {
  prompt: string
  imageStyle: ImageStyle
  intent: EnhanceIntent
  hasReferenceImages: boolean
  size: string
  quality: ImageQuality
  modelName?: string
  /** 用于 toast 出错时的回调，可选 */
  onError?: (message: string, hint?: string) => void
}

const props = withDefaults(defineProps<Props>(), {
  modelName: '',
  onError: undefined,
})

const emit = defineEmits<{
  (e: 'apply', value: string): void
  (e: 'request-settings'): void
}>()

const engine = useRewriteEngine()
const { vibrate } = useVibration()

const tickElapsed = ref(0)
let tickTimer: number | undefined

const isRewriting = computed(() => engine.state.status === 'rewriting')
const hasResult = computed(() => engine.state.status === 'success' && !!engine.state.lastResult)
const hasError = computed(() => engine.state.status === 'error')
const errorMessage = computed(() => engine.state.errorMessage)
const errorCode = computed(() => engine.state.errorCode)
const canRewrite = computed(() => props.prompt.trim().length > 0 && !isRewriting.value)
const result = computed(() => engine.state.lastResult)
const currentModel = computed(() => engine.currentModel())
const expectedSeconds = computed(() => currentModel.value.expectedSeconds)

const dirty = computed(() => {
  if (!result.value) return false
  return result.value.original.trim() !== props.prompt.trim()
})

const elapsedSeconds = computed(() => {
  if (isRewriting.value) return tickElapsed.value
  if (result.value) return Math.max(0.1, result.value.elapsedMs / 1000)
  return 0
})

const resultBytes = computed(() => result.value?.rewritten.length ?? 0)

function startTicker() {
  tickElapsed.value = 0
  if (tickTimer) window.clearInterval(tickTimer)
  const startedAt = Date.now()
  tickTimer = window.setInterval(() => {
    tickElapsed.value = (Date.now() - startedAt) / 1000
  }, 100)
}

function stopTicker() {
  if (tickTimer) {
    window.clearInterval(tickTimer)
    tickTimer = undefined
  }
}

watch(isRewriting, (busy) => {
  if (busy) startTicker()
  else stopTicker()
})

onBeforeUnmount(() => {
  stopTicker()
})

function selectModel(id: RewriteModelId) {
  if (id === engine.state.modelId) return
  vibrate('tap')
  engine.selectModel(id)
}

async function runRewrite() {
  if (!canRewrite.value) return
  vibrate(currentModel.value.haptic)
  const outcome = await engine.run({
    prompt: props.prompt,
    intent: props.intent,
    hasReferenceImages: props.hasReferenceImages,
    style: props.imageStyle,
    size: props.size,
    quality: props.quality,
    modelName: props.modelName,
  })
  if (outcome.ok) {
    vibrate('success')
  } else if (!outcome.aborted) {
    vibrate('error')
    if (outcome.code === 'PROVIDER_NOT_CONFIGURED') {
      emit('request-settings')
    }
    props.onError?.(outcome.message, hintForCode(outcome.code))
  }
}

function abortRewrite() {
  vibrate('tap')
  engine.abort()
}

function applyResult() {
  if (!result.value) return
  vibrate('success')
  emit('apply', result.value.rewritten)
}

function tryAgain() {
  void runRewrite()
}

function clearResult() {
  vibrate('tap')
  engine.reset()
}

function hintForCode(code: string): string | undefined {
  if (code === 'PROVIDER_NOT_CONFIGURED') return '点这里打开「设置」配置 API'
  if (code === 'NETWORK_ERROR') return '检查网络或换一个反代'
  if (code === 'RATE_LIMITED') return '稍等几秒再试'
  if (code === 'ABORTED') return undefined
  return undefined
}

// Stable indices used to position the segmented thumb without reflow.
const modelIndex = computed(() =>
  REWRITE_MODEL_LIST.findIndex((m) => m.id === engine.state.modelId),
)
</script>

<template>
  <section class="rewrite" :class="{ 'rewrite--busy': isRewriting }" data-tour="ai-rewrite">
    <!-- ── 蜡封章 hero ── -->
    <header class="rewrite__hero">
      <span class="rewrite__seal" aria-hidden="true">
        <span class="rewrite__seal-glyph">AI</span>
        <span class="rewrite__seal-ring"></span>
      </span>
      <span class="rewrite__head-text">
        <span class="rewrite__head-title">AI 改写</span>
        <span class="rewrite__head-sub">让模型读懂你这次的意图</span>
      </span>
      <span class="rewrite__head-pin" aria-hidden="true">
        <Icon name="lightning" :size="11" />
      </span>
    </header>

    <!-- ── 模型 segmented ── -->
    <div
      class="rewrite__segmented"
      role="tablist"
      aria-label="选择 AI 改写模型"
      :data-active-index="modelIndex"
    >
      <span
        class="rewrite__segmented-thumb"
        aria-hidden="true"
        :style="{
          transform: `translateX(${modelIndex * 100}%)`,
          background: `linear-gradient(135deg, rgb(${currentModel.swatch.primary}), rgb(${currentModel.swatch.secondary}))`,
        }"
      ></span>
      <button
        v-for="model in REWRITE_MODEL_LIST"
        :key="model.id"
        type="button"
        role="tab"
        class="rewrite__seg"
        :class="{ 'is-active': model.id === engine.state.modelId }"
        :aria-selected="model.id === engine.state.modelId"
        @click="selectModel(model.id)"
      >
        <Icon
          :name="model.id === 'flash' ? 'lightning' : 'sparkle'"
          :size="11"
        />
        <span class="rewrite__seg-label">{{ model.label }}</span>
        <small class="rewrite__seg-tag">{{ model.tagline }}</small>
      </button>
    </div>

    <!-- ── 主按钮 / 结果卡 ── -->
    <Transition name="rewrite-result" mode="out-in">
      <!-- 失败态 -->
      <div
        v-if="hasError"
        key="error"
        class="rewrite__card rewrite__card--error"
        role="alert"
      >
        <span class="rewrite__card-icon">
          <Icon name="warning" :size="13" />
        </span>
        <span class="rewrite__card-body">
          <span class="rewrite__card-title">{{ errorMessage || '改写失败' }}</span>
          <span v-if="hintForCode(errorCode)" class="rewrite__card-hint">
            {{ hintForCode(errorCode) }}
          </span>
        </span>
        <span class="rewrite__card-actions">
          <button
            v-if="errorCode === 'PROVIDER_NOT_CONFIGURED'"
            type="button"
            class="rewrite__chip"
            @click="emit('request-settings')"
          >
            <Icon name="settings" :size="11" /> 打开设置
          </button>
          <button type="button" class="rewrite__chip" @click="tryAgain">
            <Icon name="refresh" :size="11" /> 重试
          </button>
        </span>
      </div>

      <!-- 结果态 -->
      <div
        v-else-if="hasResult"
        key="result"
        class="rewrite__card rewrite__card--result"
      >
        <header class="rewrite__card-meta">
          <span class="rewrite__meta-pill">
            <Icon
              :name="result?.modelId === 'flash' ? 'lightning' : 'sparkle'"
              :size="10"
            />
            {{ result?.modelId === 'flash' ? 'Flash' : 'Haiku' }}
          </span>
          <span class="rewrite__meta-tick">·</span>
          <span class="rewrite__meta-stat">{{ elapsedSeconds.toFixed(1) }}s</span>
          <span class="rewrite__meta-tick">·</span>
          <span class="rewrite__meta-stat">{{ resultBytes }} 字</span>
          <span v-if="result?.completionTokens" class="rewrite__meta-tick">·</span>
          <span v-if="result?.completionTokens" class="rewrite__meta-stat rewrite__meta-stat--mono">
            {{ result.completionTokens }} tk
          </span>
          <button
            type="button"
            class="rewrite__close"
            aria-label="清掉这次结果"
            @click="clearResult"
          >
            <Icon name="close" :size="10" />
          </button>
        </header>
        <p class="rewrite__output">{{ result?.rewritten }}</p>
        <p v-if="dirty" class="rewrite__dirty-hint">
          <Icon name="info" :size="10" />
          原始提示词在结果生成后已被你改动，应用会覆盖现在的内容。
        </p>
        <div class="rewrite__cta-row">
          <button
            type="button"
            class="rewrite__primary"
            @click="applyResult"
          >
            <span class="rewrite__primary-ink" aria-hidden="true"></span>
            <Icon name="check" :size="13" />
            <span>应用改写</span>
          </button>
          <button
            type="button"
            class="rewrite__ghost"
            :disabled="isRewriting"
            @click="tryAgain"
          >
            <Icon name="refresh" :size="12" />
            <span>换一版</span>
          </button>
        </div>
      </div>

      <!-- 进行中 -->
      <button
        v-else-if="isRewriting"
        key="busy"
        type="button"
        class="rewrite__primary rewrite__primary--busy"
        :aria-label="`正在用 ${currentModel.label} 改写，点击取消`"
        @click="abortRewrite"
      >
        <span class="rewrite__ink-pool" aria-hidden="true"></span>
        <span class="rewrite__primary-icon">
          <Icon name="close" :size="12" />
        </span>
        <span class="rewrite__primary-text">
          <span>{{ currentModel.label }} 正在改写…</span>
          <small>{{ elapsedSeconds.toFixed(1) }}s · 点击取消</small>
        </span>
        <span class="rewrite__progress-pulse" aria-hidden="true"></span>
      </button>

      <!-- 待机：主按钮 -->
      <button
        v-else
        key="idle"
        type="button"
        class="rewrite__primary"
        :disabled="!canRewrite"
        @click="runRewrite"
      >
        <span class="rewrite__primary-ink" aria-hidden="true"></span>
        <Icon name="sparkle" :size="13" />
        <span class="rewrite__primary-text">
          <span>让 AI 改写这段提示词</span>
          <small>{{ currentModel.label }} · {{ expectedSeconds[0] }}–{{ expectedSeconds[1] }} 秒 · {{ currentModel.tagline }}</small>
        </span>
        <span class="rewrite__primary-arrow" aria-hidden="true">
          <Icon name="arrowRight" :size="12" />
        </span>
      </button>
    </Transition>

    <p v-if="!props.prompt.trim()" class="rewrite__empty-hint">
      先在下方写下你想画或想改的内容
    </p>
  </section>
</template>


<style scoped>
/* ──────────────────────────────────────────────────────────────────
 *  AI 改写面板
 *  色温与下方本地词典区别开（暖色 + 蜡封章），让用户一眼分清这是
 *  另一档能力。整体用 paper-2/3 阴影 + 内描 line，符合 Atelier Ledger。
 * ────────────────────────────────────────────────────────────────── */

.rewrite {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0.85rem 0.85rem 0.95rem;
  margin: 0 -0.15rem 0.85rem;
  border-radius: 18px;
  border: 1px solid rgb(var(--color-line-strong) / 0.55);
  background:
    linear-gradient(180deg, rgb(var(--color-cream) / 0.65), rgb(var(--color-vellum) / 0.95)),
    radial-gradient(circle at 88% 0%, rgb(var(--color-ochre) / 0.18), transparent 48%),
    radial-gradient(circle at 12% 100%, rgb(var(--color-forest) / 0.1), transparent 42%);
  box-shadow:
    var(--shadow-inner-paper),
    0 18px 32px -22px rgb(var(--color-ink) / 0.32);
  isolation: isolate;
}

.rewrite::before {
  content: '';
  position: absolute;
  inset: 6px;
  pointer-events: none;
  border-radius: 14px;
  border: 1px dashed rgb(var(--color-line-strong) / 0.28);
  z-index: 0;
}

.rewrite > * {
  position: relative;
  z-index: 1;
}

/* ── hero ── */

.rewrite__hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.65rem;
}

.rewrite__seal {
  position: relative;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, rgb(var(--color-accent) / 0.95), rgb(var(--color-accent) / 0.78));
  color: rgb(var(--color-paper));
  box-shadow:
    0 14px 22px -16px rgb(var(--color-accent) / 0.55),
    inset 0 -1px 2px rgb(0 0 0 / 0.18);
}

.rewrite__seal-glyph {
  font-family: 'Fraunces', 'IBM Plex Sans', system-ui, serif;
  font-style: italic;
  font-weight: 740;
  font-size: 13px;
  letter-spacing: -0.02em;
  text-shadow: 0 1px 0 rgb(0 0 0 / 0.18);
}

.rewrite__seal-ring {
  position: absolute;
  inset: -3px;
  border-radius: 999px;
  border: 1px dashed rgb(var(--color-accent) / 0.45);
  animation: rewrite-seal-spin 18s linear infinite;
}

@keyframes rewrite-seal-spin {
  to { transform: rotate(360deg); }
}

.rewrite__head-text {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.rewrite__head-title {
  font-size: 13px;
  font-weight: 760;
  letter-spacing: 0.01em;
  color: rgb(var(--color-ink));
}

.rewrite__head-sub {
  font-size: 11px;
  color: rgb(var(--color-muted));
  line-height: 1.3;
}

.rewrite__head-pin {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: rgb(var(--color-vellum));
  color: rgb(var(--color-ochre));
  border: 1px solid rgb(var(--color-line) / 0.6);
}

/* ── segmented thumb ── */

.rewrite__segmented {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  padding: 4px;
  border-radius: 14px;
  background: rgb(var(--color-paper-soft) / 0.78);
  border: 1px solid rgb(var(--color-line) / 0.7);
  box-shadow: var(--shadow-inner-paper);
  isolation: isolate;
}

.rewrite__segmented-thumb {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc(50% - 4px);
  height: calc(100% - 8px);
  border-radius: 10px;
  box-shadow:
    0 6px 14px -10px rgb(var(--color-ink) / 0.4),
    inset 0 1px 0 rgb(255 255 255 / 0.18);
  transition: transform 280ms cubic-bezier(0.34, 1.32, 0.64, 1),
              background 220ms var(--motion-soft);
  z-index: 0;
  will-change: transform;
}

.rewrite__seg {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-height: 50px;
  padding: 6px 10px;
  border: 0;
  background: transparent;
  color: rgb(var(--color-muted));
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color 200ms var(--motion-soft);
}

.rewrite__seg .rewrite__seg-label {
  font-family: 'Fraunces', 'IBM Plex Sans', system-ui, serif;
  font-size: 14px;
  font-weight: 720;
  letter-spacing: -0.005em;
  line-height: 1;
  margin-top: 2px;
}

.rewrite__seg .rewrite__seg-tag {
  font-size: 10px;
  font-weight: 580;
  letter-spacing: 0.02em;
  line-height: 1.1;
  opacity: 0.7;
}

.rewrite__seg.is-active {
  color: rgb(var(--color-paper));
}

.rewrite__seg.is-active .rewrite__seg-tag {
  opacity: 0.78;
}

.rewrite__seg:not(.is-active):hover {
  color: rgb(var(--color-ink));
}

@media (hover: none) {
  .rewrite__seg:not(.is-active):hover { color: rgb(var(--color-muted)); }
}

/* ── 主按钮（待机 / 进行中） ── */

.rewrite__primary {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  padding: 0.78rem 1rem;
  border-radius: 14px;
  border: 1px solid rgb(var(--color-ink));
  background: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 160ms var(--motion-press),
    box-shadow 200ms var(--motion-soft),
    opacity 200ms var(--motion-soft);
  box-shadow:
    0 16px 28px -18px rgb(var(--color-ink) / 0.65),
    inset 0 1px 0 rgb(255 255 255 / 0.06);
}

.rewrite__primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

.rewrite__primary:not(:disabled):hover {
  transform: translateY(-1px);
}

.rewrite__primary:not(:disabled):active {
  transform: translateY(0) scale(0.985);
}

.rewrite__primary-ink {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 12% 50%, rgb(var(--color-ochre) / 0.32), transparent 38%),
    radial-gradient(circle at 88% 30%, rgb(var(--color-forest) / 0.25), transparent 36%);
  opacity: 0.7;
  z-index: 0;
  mix-blend-mode: screen;
}

.rewrite__primary > *:not(.rewrite__primary-ink):not(.rewrite__ink-pool):not(.rewrite__progress-pulse) {
  position: relative;
  z-index: 1;
}

.rewrite__primary-text {
  display: grid;
  gap: 1px;
  flex: 1;
  min-width: 0;
  text-align: left;
  line-height: 1.2;
}

.rewrite__primary-text small {
  font-size: 10px;
  font-weight: 540;
  letter-spacing: 0.02em;
  opacity: 0.72;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.rewrite__primary-arrow {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 999px;
  background: rgb(var(--color-paper) / 0.12);
  transition: transform 220ms var(--motion-soft), background-color 220ms var(--motion-soft);
}

.rewrite__primary:hover:not(:disabled) .rewrite__primary-arrow {
  transform: translateX(2px);
  background: rgb(var(--color-paper) / 0.22);
}

/* ── 进行中：墨水落下 ── */

.rewrite__primary--busy {
  cursor: pointer;
  background: rgb(var(--color-ink) / 0.96);
}

.rewrite__primary-icon {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 999px;
  background: rgb(var(--color-paper) / 0.14);
}

.rewrite__ink-pool {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(120px circle at var(--ink-x, 30%) 50%, rgb(var(--color-accent) / 0.28), transparent 60%),
    radial-gradient(160px circle at calc(100% - var(--ink-x, 30%)) 50%, rgb(var(--color-ochre) / 0.22), transparent 60%);
  animation: rewrite-ink 1400ms var(--motion-soft) infinite;
}

@keyframes rewrite-ink {
  0%   { --ink-x: 18%; opacity: 0.7; }
  50%  { --ink-x: 70%; opacity: 0.95; }
  100% { --ink-x: 18%; opacity: 0.7; }
}

.rewrite__progress-pulse {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  width: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgb(var(--color-paper) / 0.85) 50%,
    transparent 100%
  );
  animation: rewrite-pulse 1100ms var(--motion-soft) infinite;
  z-index: 0;
}

@keyframes rewrite-pulse {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* ── 结果卡 ── */

.rewrite__card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.7rem 0.8rem 0.85rem;
  border-radius: 14px;
  border: 1px solid rgb(var(--color-line) / 0.85);
  background: rgb(var(--color-paper) / 0.94);
  box-shadow: 0 10px 22px -18px rgb(var(--color-ink) / 0.32);
}

.rewrite__card--result {
  border-color: rgb(var(--color-forest) / 0.42);
  background:
    linear-gradient(180deg, rgb(var(--color-vellum) / 0.96), rgb(var(--color-paper) / 0.96));
}

.rewrite__card--error {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  border-color: rgb(var(--color-accent) / 0.45);
  background: rgb(var(--color-accent) / 0.07);
  animation: rewrite-shake 360ms var(--motion-soft);
}

.rewrite__card-icon {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: rgb(var(--color-accent) / 0.18);
  color: rgb(var(--color-accent));
}

.rewrite__card-body {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.rewrite__card-title {
  font-size: 12px;
  font-weight: 700;
  color: rgb(var(--color-accent));
  line-height: 1.3;
}

.rewrite__card-hint {
  font-size: 11px;
  color: rgb(var(--color-accent) / 0.78);
  line-height: 1.3;
}

.rewrite__card-actions {
  display: inline-flex;
  gap: 6px;
}

.rewrite__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-paper));
  color: rgb(var(--color-ink));
  font-size: 11px;
  font-weight: 620;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 160ms var(--motion-soft);
}

.rewrite__chip:hover { background: rgb(var(--color-paper-soft)); }

@keyframes rewrite-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  60% { transform: translateX(2px); }
}

/* ── 结果元数据 ── */

.rewrite__card-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 620;
  letter-spacing: 0.04em;
  color: rgb(var(--color-muted));
}

.rewrite__meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-forest) / 0.45);
  background: rgb(var(--color-forest) / 0.1);
  color: rgb(var(--color-forest));
}

.rewrite__meta-tick {
  opacity: 0.5;
}

.rewrite__meta-stat {
  white-space: nowrap;
}

.rewrite__meta-stat--mono {
  text-transform: uppercase;
}

.rewrite__close {
  margin-left: auto;
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgb(var(--color-paper));
  color: rgb(var(--color-muted));
  border: 1px solid rgb(var(--color-line));
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color 160ms var(--motion-soft), background 160ms var(--motion-soft);
}

.rewrite__close:hover {
  color: rgb(var(--color-ink));
  background: rgb(var(--color-paper-soft));
}

/* ── 输出文本：从左向右浸染 ── */

.rewrite__output {
  margin: 0;
  padding: 0;
  font-size: 13px;
  line-height: 1.7;
  letter-spacing: 0.005em;
  color: rgb(var(--color-ink));
  white-space: pre-wrap;
  word-break: break-word;
  /* clip-path 完成后保持显示，初始动画用 reveal */
  animation: rewrite-reveal 480ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

@keyframes rewrite-reveal {
  from {
    opacity: 0;
    clip-path: inset(0 100% 0 0);
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    clip-path: inset(0 0 0 0);
    transform: translateY(0);
  }
}

.rewrite__dirty-hint {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgb(var(--color-ochre) / 0.1);
  border: 1px solid rgb(var(--color-ochre) / 0.3);
  color: rgb(var(--color-ochre));
  font-size: 11px;
  line-height: 1.3;
}

/* ── CTA row ── */

.rewrite__cta-row {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 0.5rem;
}

.rewrite__cta-row .rewrite__primary {
  padding: 0.65rem 0.9rem;
}

.rewrite__cta-row .rewrite__primary-text {
  display: inline;
  flex: 0 1 auto;
}

.rewrite__ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.65rem 0.9rem;
  border-radius: 14px;
  border: 1px solid rgb(var(--color-line-strong));
  background: rgb(var(--color-paper));
  color: rgb(var(--color-ink));
  font-size: 12.5px;
  font-weight: 660;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background 160ms var(--motion-soft),
    transform 160ms var(--motion-press),
    border-color 160ms var(--motion-soft);
}

.rewrite__ghost:hover {
  background: rgb(var(--color-paper-soft));
  border-color: rgb(var(--color-ink) / 0.4);
}

.rewrite__ghost:active {
  transform: scale(0.97);
}

.rewrite__ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 空状态提示 ── */

.rewrite__empty-hint {
  margin: 0;
  font-size: 11px;
  color: rgb(var(--color-muted));
  text-align: center;
  padding: 4px 0 0;
}

/* ── 结果 transition ── */

.rewrite-result-enter-active,
.rewrite-result-leave-active {
  transition: opacity 220ms var(--motion-soft), transform 220ms var(--motion-soft);
}

.rewrite-result-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.rewrite-result-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ──────────────────────────────────────────────────────────────────
 *  无障碍 / 触屏 / 减弱动画
 * ────────────────────────────────────────────────────────────────── */

@media (max-width: 480px) {
  .rewrite {
    margin-inline: 0;
    padding: 0.75rem;
    gap: 0.6rem;
  }

  .rewrite__primary-text small {
    /* 移动端细节信息可以省一点 */
    font-size: 9px;
  }

  .rewrite__cta-row {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  }

  .rewrite__output {
    font-size: 12.5px;
    line-height: 1.65;
  }

  .rewrite__seg {
    min-height: 46px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rewrite__seal-ring,
  .rewrite__ink-pool,
  .rewrite__progress-pulse,
  .rewrite__primary-arrow,
  .rewrite__output,
  .rewrite-result-enter-active,
  .rewrite-result-leave-active,
  .rewrite__segmented-thumb,
  .rewrite__card--error {
    animation: none !important;
    transition: opacity 120ms ease !important;
  }

  .rewrite__output { clip-path: none !important; transform: none !important; }
  .rewrite__primary:hover:not(:disabled),
  .rewrite__ghost:hover { transform: none; }
}

@media (prefers-color-scheme: dark) {
  /* 黑夜里减弱蜡封章发光，避免刺眼 */
  .rewrite__seal { box-shadow: 0 8px 16px -12px rgb(var(--color-accent) / 0.35); }
}
</style>
