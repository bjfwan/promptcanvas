<script setup lang="ts">
/**
 * AI 改写状态条 —— textarea 下方贴一条轻量提示。
 *
 * 设计原则：
 *  - 改写完成后 textarea 已经是最终值（composable 直接写）。
 *    ribbon 不需要"应用"按钮，只是个状态/操作的轻量提示。
 *  - 状态机：idle / analyzing / streaming / done / error / aborted
 *  - done / aborted 8 秒后由 composable 自动 reset，ribbon 自然消失。
 *  - error 不自动消失，等用户处理。
 *
 * 移动 / 桌面共用一个组件，仅 variant 控制贴 dock 还是贴 textarea。
 */
import { computed } from 'vue'
import Icon from './Icon.vue'
import type { RewriteModelId } from '../lib/rewriteService'
import { REWRITE_MODELS } from '../lib/rewriteService'

interface Props {
  phase: 'idle' | 'analyzing' | 'streaming' | 'done' | 'error' | 'aborted'
  modelId: RewriteModelId
  elapsedMs: number
  doneElapsedMs: number
  toolCallCount: number
  errorMessage?: string
  errorCode?: string
  variant?: 'desktop' | 'mobile'
}

const props = withDefaults(defineProps<Props>(), {
  errorMessage: '',
  errorCode: '',
  variant: 'desktop',
})

defineEmits<{
  (e: 'revert'): void
  (e: 'retry'): void
  (e: 'abort'): void
  (e: 'dismiss'): void
}>()

const elapsedSeconds = computed(() => {
  // done 阶段定格用 doneElapsedMs，进行中用实时 elapsedMs
  if (props.phase === 'done') return (props.doneElapsedMs / 1000).toFixed(1)
  return (props.elapsedMs / 1000).toFixed(1)
})
const currentModel = computed(() => REWRITE_MODELS[props.modelId])

const visible = computed(() => props.phase !== 'idle')
const isBusy = computed(() => props.phase === 'analyzing' || props.phase === 'streaming')
const phaseLabel = computed(() => {
  if (props.phase === 'analyzing') {
    return props.toolCallCount > 0
      ? `正在分析 · ${props.toolCallCount} 个工具`
      : '正在分析'
  }
  if (props.phase === 'streaming') return '落笔中'
  if (props.phase === 'done') return '已优化'
  if (props.phase === 'aborted') return '已取消'
  if (props.phase === 'error') return props.errorMessage || '改写失败'
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
      <!-- 进行中：旋转点 + 阶段文案 + 取消 -->
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
          </span>
        </span>
        <button type="button" class="ribbon__btn ribbon__btn--ghost" @click="$emit('abort')">
          <Icon name="close" :size="11" />
          <span>取消</span>
        </button>
      </template>

      <!-- 完成：✓ + 还原 / 再来 -->
      <template v-else-if="phase === 'done'">
        <span class="ribbon__check" aria-hidden="true">
          <Icon name="check" :size="12" />
        </span>
        <span class="ribbon__text">
          <span class="ribbon__title">{{ phaseLabel }}</span>
          <span class="ribbon__sub">
            <span class="ribbon__model-pill">{{ currentModel.label }}</span>
            <span class="ribbon__sep">·</span>
            <span class="ribbon__time">{{ elapsedSeconds }}s</span>
          </span>
        </span>
        <span class="ribbon__actions">
          <button type="button" class="ribbon__btn ribbon__btn--ghost" @click="$emit('revert')">
            <Icon name="reset" :size="11" />
            <span>还原</span>
          </button>
          <button type="button" class="ribbon__btn ribbon__btn--ghost" @click="$emit('retry')">
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
          <span class="ribbon__title">{{ phaseLabel }}</span>
        </span>
        <span class="ribbon__actions">
          <button type="button" class="ribbon__btn ribbon__btn--primary" @click="$emit('retry')">
            <Icon name="refresh" :size="11" />
            <span>重试</span>
          </button>
          <button type="button" class="ribbon__btn ribbon__btn--ghost" @click="$emit('dismiss')">
            <Icon name="close" :size="11" />
            <span>关闭</span>
          </button>
        </span>
      </template>

      <!-- 取消后短暂显示 -->
      <template v-else-if="phase === 'aborted'">
        <span class="ribbon__icon-mute" aria-hidden="true">
          <Icon name="info" :size="11" />
        </span>
        <span class="ribbon__text">
          <span class="ribbon__title">已取消，原文已保留</span>
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

.ribbon__sep { opacity: 0.5; }

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

.ribbon__time { white-space: nowrap; }

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

.ribbon__btn--primary:hover { background: rgb(var(--color-ink) / 0.92); }

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

.ribbon-enter-from,
.ribbon-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.ribbon-enter-active,
.ribbon-leave-active {
  transition: opacity 200ms var(--motion-soft), transform 200ms var(--motion-soft);
}

@media (max-width: 480px) {
  .ribbon {
    gap: 0.55rem;
    padding: 0.45rem 0.6rem 0.45rem 0.55rem;
    font-size: 12px;
  }

  /* 移动端只保留主按钮文字 + ghost 按钮文字（再来 / 还原），其它图标足够 */
  .ribbon__btn span { display: inline; }

  .ribbon__title { font-size: 12px; }
  .ribbon__sub { font-size: 10px; }
  .ribbon__model-pill { font-size: 10px; padding: 1px 6px; }
}

@media (prefers-reduced-motion: reduce) {
  .ribbon__spinner span,
  .ribbon-enter-active,
  .ribbon-leave-active {
    animation: none;
    transition: opacity 100ms ease;
  }
}
</style>
