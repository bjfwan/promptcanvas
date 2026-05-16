<script setup lang="ts">
import ProgressRing from './ProgressRing.vue'
import FlipDigits from './FlipDigits.vue'

interface Props {
  /** 0~100 progress estimate (drives the ProgressRing arc). */
  progress: number
  /** Elapsed seconds; rendered through FlipDigits at the top-right. */
  elapsedSeconds: number
  /** Stage label echoed at top-left (草稿 / 上墨 / 校色 / 收件 etc.). */
  stage: string
  /** Optional ETA / remaining label (e.g. 约 8s / 即将出图 / 已超出预估…). */
  remainingLabel?: string
  /** First line of meta footer (typically size · style). */
  metaLabel?: string
  /** Second line of meta footer (typically prompt preview, truncated). */
  promptPreview?: string
  /** Inner ring size. Defaults to 200, ChatBubble passes 148. */
  ringSize?: number
  /** Compact variant tightens vertical padding for chat bubbles. */
  compact?: boolean
}

withDefaults(defineProps<Props>(), {
  remainingLabel: '',
  metaLabel: '',
  promptPreview: '',
  ringSize: 200,
  compact: false,
})

defineEmits<{
  (e: 'cancel'): void
}>()
</script>

<template>
  <div class="dev-frame" :class="{ 'dev-frame--compact': compact }">
    <!-- Layer 1 · paper-tinted base. Inherits surrounding paper variables. -->
    <div class="dev-frame__bg" aria-hidden="true"></div>

    <!-- Layer 2 · skeleton blocks with Krea-style long shimmer. -->
    <div class="dev-frame__skel" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </div>

    <!-- Layer 3 · forest baseline rising slowly bottom→top. -->
    <div class="dev-frame__baseline" aria-hidden="true"></div>

    <!-- Layer 4 · progress ring core. -->
    <div class="dev-frame__core">
      <ProgressRing
        :progress="progress"
        :elapsed-seconds="elapsedSeconds"
        :stage="stage"
        :size="ringSize"
      />
    </div>

    <!-- Layer 5 · meta + cancel. -->
    <div class="dev-frame__meta">
      <div class="dev-frame__meta-top">
        <span class="dev-frame__stage">
          <span class="dev-frame__stage-dot" aria-hidden="true"></span>
          <span>{{ stage }}</span>
        </span>
        <FlipDigits :value="elapsedSeconds" suffix="s" :pad="2" haptic />
      </div>

      <div class="dev-frame__meta-bottom">
        <p v-if="promptPreview" class="dev-frame__prompt">
          {{ promptPreview }}
        </p>
        <div class="dev-frame__meta-end">
          <span v-if="remainingLabel" class="dev-frame__remain">
            <span class="dev-frame__remain-dot" aria-hidden="true"></span>
            <span>{{ remainingLabel }}</span>
          </span>
          <span v-if="metaLabel" class="dev-frame__meta-label">{{ metaLabel }}</span>
        </div>
      </div>
    </div>

    <button
      type="button"
      class="dev-frame__cancel"
      aria-label="取消这次生成"
      @click="$emit('cancel')"
    >
      <span aria-hidden="true">×</span>
      <span>取消</span>
    </button>
  </div>
</template>

<style scoped>
.dev-frame {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  isolation: isolate;
}

.dev-frame__bg {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgb(var(--color-vellum) / 0.7), rgb(var(--color-paper-soft) / 0.42)),
    rgb(var(--color-paper-soft));
  pointer-events: none;
}

/* ------------------------------------------------------------------
 * Skeleton: 4 blocks composed like a photographic frame
 * (subject + 2 side blocks + a footer band).
 * ------------------------------------------------------------------ */
.dev-frame__skel {
  position: absolute;
  inset: 8%;
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  grid-template-rows: 1fr 0.7fr 0.5fr;
  gap: 0.6rem;
  pointer-events: none;
}

.dev-frame__skel > span {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background:
    /* Krea-style long shimmer: -50% → 150% travel, 70% bright zone, ease-in-out. */
    linear-gradient(
      90deg,
      rgb(var(--color-forest) / 0) 0%,
      rgb(var(--color-forest) / 0) 30%,
      rgb(var(--color-vellum) / 0.85) 50%,
      rgb(var(--color-forest) / 0) 70%,
      rgb(var(--color-forest) / 0) 100%
    ),
    rgb(var(--color-forest) / 0.06);
  background-size: 200% 100%, 100% 100%;
  background-repeat: no-repeat;
  animation: dev-shimmer 2.4s ease-in-out infinite;
  border: 1px solid rgb(var(--color-forest) / 0.08);
}

.dev-frame__skel > span:nth-child(1) {
  grid-column: 1;
  grid-row: 1 / 3;
  animation-delay: 0s;
}

.dev-frame__skel > span:nth-child(2) {
  grid-column: 2;
  grid-row: 1;
  animation-delay: 0.32s;
}

.dev-frame__skel > span:nth-child(3) {
  grid-column: 2;
  grid-row: 2;
  animation-delay: 0.6s;
}

.dev-frame__skel > span:nth-child(4) {
  grid-column: 1 / 3;
  grid-row: 3;
  animation-delay: 0.86s;
}

/* ------------------------------------------------------------------
 * Forest baseline rising bottom → top, in sync with --dur-stage cycle.
 * ------------------------------------------------------------------ */
.dev-frame__baseline {
  position: absolute;
  left: 6%;
  right: 6%;
  bottom: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgb(var(--color-forest) / 0.4) 22%,
    rgb(var(--color-forest)) 50%,
    rgb(var(--color-forest) / 0.4) 78%,
    transparent 100%
  );
  animation: dev-rise var(--dur-stage) linear infinite;
  pointer-events: none;
}

/* ------------------------------------------------------------------
 * Core: ring centered absolutely so meta layer can reflow above/below.
 * ------------------------------------------------------------------ */
.dev-frame__core {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.dev-frame__core :deep(.progress-ring) {
  pointer-events: auto;
}

/* ------------------------------------------------------------------
 * Meta strip: top stage + flip digits, bottom prompt + remaining.
 * ------------------------------------------------------------------ */
.dev-frame__meta {
  position: absolute;
  inset: 1.05rem 1.2rem;
  display: grid;
  grid-template-rows: auto 1fr auto;
  pointer-events: none;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgb(var(--color-muted) / 0.78);
}

.dev-frame--compact .dev-frame__meta {
  inset: 0.7rem 0.85rem;
}

.dev-frame__meta-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.dev-frame__stage {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.dev-frame__stage-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: rgb(var(--color-forest));
  box-shadow: 0 0 0 0 rgb(var(--color-forest) / 0.5);
  animation: dev-stage-pulse 1.6s ease-in-out infinite;
}

.dev-frame__meta-bottom {
  grid-row: 3;
  display: grid;
  gap: 0.35rem;
  font-size: 9px;
  letter-spacing: 0.2em;
  color: rgb(var(--color-muted) / 0.6);
}

.dev-frame__prompt {
  font-family: 'Fraunces', Georgia, serif;
  font-style: italic;
  font-size: 13px;
  line-height: 1.35;
  letter-spacing: 0;
  text-transform: none;
  color: rgb(var(--color-ink) / 0.78);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
  max-width: min(58%, 24rem);
}

.dev-frame--compact .dev-frame__prompt {
  font-size: 12px;
  -webkit-line-clamp: 1;
  max-width: 70%;
}

.dev-frame__meta-end {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
}

.dev-frame__remain {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  text-transform: none;
  letter-spacing: 0.04em;
  color: rgb(var(--color-ink) / 0.78);
  font-feature-settings: 'tnum';
}

.dev-frame__remain-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgb(var(--color-forest));
  animation: dev-stage-pulse 1.8s ease-in-out infinite;
}

.dev-frame__meta-label {
  opacity: 0.7;
}

/* ------------------------------------------------------------------
 * Cancel chip — paper button, accent on hover.
 * ------------------------------------------------------------------ */
.dev-frame__cancel {
  position: absolute;
  right: 1rem;
  top: 1rem;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.32rem 0.62rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-vellum) / 0.86);
  color: rgb(var(--color-muted));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.04em;
  cursor: pointer;
  pointer-events: auto;
  transition: color var(--dur-feedback) var(--motion-soft),
    border-color var(--dur-feedback) var(--motion-soft),
    background-color var(--dur-feedback) var(--motion-soft),
    transform var(--dur-feedback) var(--motion-press);
  -webkit-tap-highlight-color: transparent;
}

.dev-frame--compact .dev-frame__cancel {
  right: 0.65rem;
  top: 0.65rem;
  padding: 0.26rem 0.55rem;
  font-size: 9px;
}

.dev-frame__cancel:hover {
  color: rgb(var(--color-accent));
  border-color: rgb(var(--color-accent) / 0.45);
  background: rgb(var(--color-accent) / 0.08);
}

.dev-frame__cancel:active {
  transform: scale(0.96);
}

.dev-frame__cancel span:first-child {
  font-size: 1.1em;
  line-height: 1;
}

@keyframes dev-stage-pulse {
  0%, 100% {
    transform: scale(0.86);
    box-shadow: 0 0 0 0 rgb(var(--color-forest) / 0.45);
  }
  50% {
    transform: scale(1.06);
    box-shadow: 0 0 0 6px rgb(var(--color-forest) / 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dev-frame__skel > span {
    animation: none;
    background:
      linear-gradient(90deg, rgb(var(--color-vellum) / 0.45), rgb(var(--color-vellum) / 0.45)),
      rgb(var(--color-forest) / 0.06);
  }

  .dev-frame__baseline {
    animation: none;
    bottom: 50%;
    opacity: 0.6;
  }

  .dev-frame__stage-dot,
  .dev-frame__remain-dot {
    animation: none;
  }
}
</style>
