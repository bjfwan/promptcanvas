<script setup lang="ts">
/**
 * AI 改写状态条 —— 浮在 textarea 之下/dock 之上的轻量 ribbon。
 *
 * 状态机：
 *   idle      → 不渲染
 *   analyzing → "正在分析画面 · 已调用 N 个工具" + 旋转点 + 取消
 *   streaming → "落笔中 · X.Xs" + 旋转点 + 取消
 *   done      → "✓ 已优化 · X.Xs · 应用 / 还原 / 再来一次 · 模型切换"
 *   error     → 红色 inline 错误 + 重试
 *   aborted   → 灰色 "已取消，原文已保留" + 还原
 *
 * 移动端：贴 dock 顶部全宽；桌面：贴 textarea 下沿、最大宽度自适应。
 */
import { computed } from 'vue'
import Icon from './Icon.vue'
import {
  REWRITE_MODEL_LIST,
  REWRITE_MODELS,
  type RewriteModelId,
} from '../lib/rewriteService'

interface Props {
  phase: 'idle' | 'analyzing' | 'streaming' | 'done' | 'error' | 'aborted'
  modelId: RewriteModelId
  elapsedMs: number
  toolsUsed: number
  errorMessage?: string
  errorCode?: string
  /** 移动端贴 dock 顶；桌面贴 textarea 下 */
  variant?: 'desktop' | 'mobile'
}

const props = withDefaults(defineProps<Props>(), {
  errorMessage: '',
  errorCode: '',
  variant: 'desktop',
})

const emit = defineEmits<{
  (e: 'apply'): void
  (e: 'revert'): void
  (e: 'retry'): void
  (e: 'abort'): void
  (e: 'dismiss'): void
  (e: 'select-model', id: RewriteModelId): void
}>()

const elapsedSeconds = computed(() => (props.elapsedMs / 1000).toFixed(1))
const currentModel = computed(() => REWRITE_MODELS[props.modelId])

const visible = computed(() => props.phase !== 'idle')
const isBusy = computed(() => props.phase === 'analyzing' || props.phase === 'streaming')
const phaseLabel = computed(() => {
  if (props.phase === 'analyzing') return '正在分析画面'
  if (props.phase === 'streaming') return '落笔中'
  if (props.phase === 'done') return '已优化'
  if (props.phase === 'aborted') return '已取消'
  if (props.phase === 'error') return '改写失败'
  return ''
})
</script>

<template>
  <Transition name="ribbon">
    <div
      v-if="visible"
      class="ribbon"
      :class="[
        `ribbon--${variant}`,
        `ribbon--phase-${phase}`,
        { 'ribbon--busy': isBusy },
      ]"
      role="status"
      aria-live="polite"
    >
      <!-- 进行中：分析 / 落笔 -->
      <template v-if="isBusy">
        <span class="ribbon__spinner" aria-hidden="true">
          <span></span><span></span><span></span>
        </span>
        <span class="ribbon__text">
          <span class="ribbon__title">{{ phaseLabel }}</span>
          <span class="ribbon__sub">
            <span class="ribbon__model-pill">{{ currentModel.label }}</span>
            <span class="ribbon__sep">·</span>
            <span class="ribbon__time">{{ elapsedSeconds }}s</span>
            <template v-if="phase === 'analyzing' && toolsUsed > 0">
              <span class="ribbon__sep">·</span>
              <span>{{ toolsUsed }} 个工具</span>
            </template>
          </span>
        </span>
        <button type="button" class="ribbon__btn ribbon__btn--ghost" @click="emit('abort')">
          <Icon name="close" :size="11" />
          <span>取消</span>
        </button>
      </template>

      <!-- 完成 -->
      <template v-else-if="phase === 'done'">
        <span class="ribbon__check" aria-hidden="true">
          <Icon name="check" :size="12" />
        </span>
        <span class="ribbon__text">
          <span class="ribbon__title">已优化</span>
          <span class="ribbon__sub">
            <span class="ribbon__model-pill">{{ currentModel.label }}</span>
            <span class="ribbon__sep">·</span>
            <span class="ribbon__time">{{ elapsedSeconds }}s</span>
          </span>
        </span>
        <span class="ribbon__actions">
          <button type="button" class="ribbon__btn ribbon__btn--primary" @click="emit('apply')">
            <Icon name="check" :size="11" />
            <span>应用</span>
          </button>
          <button type="button" class="ribbon__btn ribbon__btn--ghost" @click="emit('revert')">
            <Icon name="reset" :size="11" />
            <span>还原</span>
          </button>
          <button type="button" class="ribbon__btn ribbon__btn--ghost" @click="emit('retry')">
            <Icon name="refresh" :size="11" />
            <span>再来</span>
          </button>
        </span>
      </template>

      <!-- 失败 -->
      <template v-else-if="phase === 'error'">
        <span class="ribbon__icon-error" aria-hidden="true">
          <Icon name="warning" :size="11" />
        </span>
        <span class="ribbon__text">
          <span class="ribbon__title">{{ errorMessage || '改写失败' }}</span>
          <span class="ribbon__sub">
            <span class="ribbon__model-pill">{{ currentModel.label }}</span>
          </span>
        </span>
        <span class="ribbon__actions">
          <button type="button" class="ribbon__btn ribbon__btn--primary" @click="emit('retry')">
            <Icon name="refresh" :size="11" />
            <span>重试</span>
          </button>
          <button type="button" class="ribbon__btn ribbon__btn--ghost" @click="emit('dismiss')">
            <Icon name="close" :size="11" />
            <span>关闭</span>
          </button>
        </span>
      </template>

      <!-- 取消后 -->
      <template v-else-if="phase === 'aborted'">
        <span class="ribbon__icon-mute" aria-hidden="true">
          <Icon name="info" :size="11" />
        </span>
        <span class="ribbon__text">
          <span class="ribbon__title">已取消，原文已保留</span>
        </span>
        <span class="ribbon__actions">
          <button type="button" class="ribbon__btn ribbon__btn--ghost" @click="emit('dismiss')">
            <Icon name="close" :size="11" />
            <span>关闭</span>
          </button>
        </span>
      </template>
    </div>
  </Transition>
</template>


<style scoped>
.ribbon {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0.75rem;
  border-radius: 14px;
  border: 1px solid rgb(var(--color-line-strong) / 0.65);
  background:
    linear-gradient(180deg, rgb(var(--color-vellum) / 0.95), rgb(var(--color-paper) / 0.95)),
    radial-gradient(circle at 0% 0%, rgb(var(--color-ochre) / 0.18), transparent 60%);
  box-shadow:
    var(--shadow-inner-paper),
    0 12px 22px -18px rgb(var(--color-ink) / 0.42);
  font-size: 12.5px;
  color: rgb(var(--color-ink));
  contain: layout paint style;
}

.ribbon--mobile {
  margin: 0 6px 6px;
  border-radius: 14px;
}

.ribbon--phase-error {
  border-color: rgb(var(--color-accent) / 0.45);
  background: rgb(var(--color-accent) / 0.07);
}

.ribbon--phase-aborted {
  border-color: rgb(var(--color-line) / 0.7);
  background: rgb(var(--color-paper-soft) / 0.65);
  opacity: 0.85;
}

.ribbon__text {
  display: grid;
  gap: 1px;
  flex: 1;
  min-width: 0;
  line-height: 1.2;
}

.ribbon__title {
  font-size: 12.5px;
  font-weight: 660;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ribbon__sub {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 10.5px;
  color: rgb(var(--color-muted));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  letter-spacing: 0.02em;
}

.ribbon__sep {
  opacity: 0.5;
}

.ribbon__model-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-paper));
  color: rgb(var(--color-ink));
  font-weight: 700;
}

.ribbon__time {
  white-space: nowrap;
}

/* ── 旋转点：墨水落下感 ── */

.ribbon__spinner {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.ribbon__spinner span {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.4;
  animation: ribbon-bounce 1.1s var(--motion-soft) infinite;
}

.ribbon__spinner span:nth-child(1) { left: 2px; animation-delay: 0ms; }
.ribbon__spinner span:nth-child(2) { left: 9.5px; animation-delay: 140ms; }
.ribbon__spinner span:nth-child(3) { left: 17px; animation-delay: 280ms; }

@keyframes ribbon-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-4px); opacity: 1; }
}

.ribbon--busy .ribbon__title {
  color: rgb(var(--color-ink));
  position: relative;
}

.ribbon--busy .ribbon__title::after {
  content: '';
  display: inline-block;
  vertical-align: -1px;
  margin-left: 4px;
  width: 6px;
  height: 1.1em;
  background: rgb(var(--color-ink));
  animation: ribbon-cursor 0.95s steps(1) infinite;
  opacity: 0.55;
}

@keyframes ribbon-cursor {
  0%, 50% { opacity: 0.55; }
  51%, 100% { opacity: 0; }
}

/* ── ✓ 完成 ── */

.ribbon__check {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 999px;
  background: rgb(var(--color-forest));
  color: rgb(var(--color-paper));
  box-shadow: 0 6px 12px -8px rgb(var(--color-forest) / 0.6);
}

.ribbon__icon-error {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 999px;
  background: rgb(var(--color-accent) / 0.18);
  color: rgb(var(--color-accent));
}

.ribbon__icon-mute {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 999px;
  background: rgb(var(--color-paper-soft));
  color: rgb(var(--color-muted));
}

/* ── 操作按钮 ── */

.ribbon__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.ribbon__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  height: 28px;
  padding: 0 0.6rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-paper));
  color: rgb(var(--color-ink));
  font-size: 11.5px;
  font-weight: 660;
  cursor: pointer;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  transition:
    background 160ms var(--motion-soft),
    border-color 160ms var(--motion-soft),
    transform 140ms var(--motion-press);
}

.ribbon__btn::before {
  /* 触摸命中扩展，移动端贴合拇指 */
  content: '';
  position: absolute;
  inset: -6px;
}

.ribbon__btn:hover { background: rgb(var(--color-paper-soft)); }
.ribbon__btn:active { transform: scale(0.96); }

.ribbon__btn--primary {
  background: rgb(var(--color-ink));
  border-color: rgb(var(--color-ink));
  color: rgb(var(--color-paper));
}

.ribbon__btn--primary:hover {
  background: rgb(var(--color-ink) / 0.92);
}

.ribbon__btn--ghost {
  background: transparent;
  border-color: rgb(var(--color-line) / 0.7);
  color: rgb(var(--color-muted));
}

.ribbon__btn--ghost:hover {
  color: rgb(var(--color-ink));
  border-color: rgb(var(--color-ink) / 0.4);
  background: rgb(var(--color-paper-soft));
}

/* ── transitions ── */

.ribbon-enter-from,
.ribbon-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.ribbon-enter-active,
.ribbon-leave-active {
  transition: opacity 200ms var(--motion-soft), transform 200ms var(--motion-soft);
}

/* ── 移动端紧凑 ── */

@media (max-width: 480px) {
  .ribbon {
    gap: 0.55rem;
    padding: 0.45rem 0.6rem 0.45rem 0.55rem;
    font-size: 12px;
  }

  .ribbon__btn span {
    /* 在窄屏只保留图标 + 图标级触觉点击 */
    display: none;
  }

  .ribbon__btn {
    width: 32px;
    height: 32px;
    padding: 0;
    justify-content: center;
  }

  .ribbon__btn--primary {
    width: auto;
    padding: 0 0.7rem;
  }

  .ribbon__btn--primary span {
    display: inline;
  }

  .ribbon__title {
    font-size: 12px;
  }

  .ribbon__sub {
    font-size: 10px;
  }

  .ribbon__model-pill {
    font-size: 10px;
    padding: 1px 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ribbon__spinner span,
  .ribbon--busy .ribbon__title::after,
  .ribbon-enter-active,
  .ribbon-leave-active {
    animation: none;
    transition: opacity 100ms ease;
  }
}
</style>
