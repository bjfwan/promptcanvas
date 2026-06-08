<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import FlipDigits from './FlipDigits.vue'

interface Props {
  /** 0~100 progress estimate (drives the ledger ruler fill). */
  progress: number
  /** Elapsed seconds; rendered through FlipDigits in the developing disc. */
  elapsedSeconds: number
  /** Stage label echoed at top-left / under the disc. */
  stage: string
  /** Optional ETA / remaining label (e.g. 约 8s / 即将出图 / 已超出预估…). */
  remainingLabel?: string
  /** First line of meta footer (typically size · style). */
  metaLabel?: string
  /** Second line of meta footer (typically prompt preview, truncated). */
  promptPreview?: string
  /** Retained for call-site compatibility; layout now scales via `compact`. */
  ringSize?: number
  /** Compact variant tightens everything for chat bubbles. */
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  remainingLabel: '',
  metaLabel: '',
  promptPreview: '',
  ringSize: 200,
  compact: false,
})

defineEmits<{
  (e: 'cancel'): void
}>()

const STAGE_ICONS = ['pencil', 'frame', 'palette', 'sparkle'] as const

const stageIcon = computed(() => {
  const p = props.progress
  if (p < 26) return STAGE_ICONS[0]
  if (p < 58) return STAGE_ICONS[1]
  if (p < 84) return STAGE_ICONS[2]
  return STAGE_ICONS[3]
})

const fillPct = computed(() => Math.max(0, Math.min(100, props.progress)))
</script>

<template>
  <div class="dev" :class="{ 'dev--compact': compact }">
    <!-- Paper base -->
    <div class="dev__paper" aria-hidden="true"></div>

    <!-- Latent image: a photo surfacing in the developer tray, cell by cell. -->
    <div class="dev__latent" aria-hidden="true">
      <span v-for="i in 12" :key="i" :style="{ '--i': i }"></span>
    </div>

    <!-- Developer wash drifting bottom → top. -->
    <div class="dev__wash" aria-hidden="true"></div>

    <!-- Top strip: developing tag + cancel. -->
    <div class="dev__top">
      <span class="dev__tag">
        <span class="dev__tag-dot" aria-hidden="true"></span>
        <span>显影中</span>
      </span>
      <button
        type="button"
        class="dev__cancel"
        aria-label="取消这次生成"
        @click="$emit('cancel')"
      >
        <span aria-hidden="true">×</span>
        <span>取消</span>
      </button>
    </div>

    <!-- Center: spinning developer disc + stage glyph + elapsed. -->
    <div class="dev__core">
      <div class="dev__disc" aria-hidden="true"></div>
      <div class="dev__glyph">
        <Icon :name="stageIcon" :size="compact ? 18 : 22" />
      </div>
      <div class="dev__elapsed">
        <FlipDigits :value="elapsedSeconds" suffix="s" :pad="2" haptic />
      </div>
      <div class="dev__stage">{{ stage }}</div>
    </div>

    <!-- Bottom: ledger ruler carrying real progress + meta. -->
    <div class="dev__rail">
      <div class="dev__rail-head">
        <p v-if="promptPreview" class="dev__prompt">{{ promptPreview }}</p>
        <span v-if="remainingLabel" class="dev__remain">{{ remainingLabel }}</span>
      </div>

      <div class="dev__ruler">
        <div class="dev__ruler-ticks"></div>
        <div class="dev__ruler-fill" :style="{ width: `${fillPct}%` }">
          <span class="dev__ruler-head" aria-hidden="true"></span>
        </div>
      </div>

      <div class="dev__rail-foot">
        <span v-if="metaLabel" class="dev__meta">{{ metaLabel }}</span>
        <span class="dev__pct">{{ Math.round(fillPct) }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dev {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  isolation: isolate;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.dev__paper {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 90% at 50% 8%, rgb(var(--color-vellum) / 0.7), transparent 60%),
    linear-gradient(180deg, rgb(var(--color-vellum) / 0.66), rgb(var(--color-paper-soft) / 0.4)),
    rgb(var(--color-paper-soft));
  pointer-events: none;
}

/* ------------------------------------------------------------------
 * Latent image — 4×3 cells surfacing in a diagonal wave.
 * ------------------------------------------------------------------ */
.dev__latent {
  position: absolute;
  inset: 7%;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 0.5rem;
  pointer-events: none;
}

.dev__latent > span {
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgb(var(--color-forest) / 0.16), rgb(var(--color-forest) / 0.04));
  border: 1px solid rgb(var(--color-forest) / 0.07);
  opacity: 0.08;
  animation: dev-latent 3.4s ease-in-out infinite;
  animation-delay: calc(var(--i) * -0.26s);
  will-change: opacity, filter, transform;
}

/* ------------------------------------------------------------------
 * Developer wash — soft luminous band drifting upward.
 * ------------------------------------------------------------------ */
.dev__wash {
  position: absolute;
  left: 0;
  right: 0;
  height: 55%;
  bottom: -55%;
  background: linear-gradient(
    0deg,
    transparent 0%,
    rgb(var(--color-forest) / 0.05) 30%,
    rgb(var(--color-vellum) / 0.28) 50%,
    rgb(var(--color-forest) / 0.05) 70%,
    transparent 100%
  );
  animation: dev-wash var(--dur-stage) linear infinite;
  pointer-events: none;
  mix-blend-mode: plus-lighter;
}

/* ------------------------------------------------------------------
 * Top strip.
 * ------------------------------------------------------------------ */
.dev__top {
  position: absolute;
  inset: 1rem 1.1rem auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}

.dev--compact .dev__top {
  inset: 0.65rem 0.7rem auto;
}

.dev__tag {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 10px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: rgb(var(--color-muted) / 0.8);
}

.dev__tag-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: rgb(var(--color-forest));
  animation: dev-pulse 1.6s ease-in-out infinite;
}

.dev__cancel {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-vellum) / 0.86);
  color: rgb(var(--color-muted));
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

.dev--compact .dev__cancel {
  padding: 0.24rem 0.5rem;
  font-size: 9px;
}

.dev__cancel:hover {
  color: rgb(var(--color-accent));
  border-color: rgb(var(--color-accent) / 0.45);
  background: rgb(var(--color-accent) / 0.08);
}

.dev__cancel:active {
  transform: scale(0.96);
}

.dev__cancel span:first-child {
  font-size: 1.1em;
  line-height: 1;
}

/* ------------------------------------------------------------------
 * Center developer disc.
 * ------------------------------------------------------------------ */
.dev__core {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 0.32rem;
  pointer-events: none;
  text-align: center;
}

.dev__disc {
  grid-row: 1;
  grid-column: 1;
  width: 64px;
  height: 64px;
  border-radius: 999px;
  background: conic-gradient(
    from 0deg,
    rgb(var(--color-forest) / 0) 0deg,
    rgb(var(--color-forest) / 0) 140deg,
    rgb(var(--color-forest) / 0.5) 300deg,
    rgb(var(--color-forest)) 360deg
  );
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
  animation: dev-spin 2.4s linear infinite;
}

.dev--compact .dev__disc {
  width: 54px;
  height: 54px;
}

.dev__glyph {
  grid-row: 1;
  grid-column: 1;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: rgb(var(--color-vellum) / 0.95);
  border: 1px solid rgb(var(--color-line));
  color: rgb(var(--color-forest));
  box-shadow: var(--shadow-inner-paper);
  animation: dev-breathe 2.6s ease-in-out infinite;
}

.dev--compact .dev__glyph {
  width: 34px;
  height: 34px;
}

.dev__elapsed {
  font-size: 16px;
  font-weight: 300;
  color: rgb(var(--color-ink));
  font-feature-settings: 'tnum';
  line-height: 1;
  margin-top: 0.55rem;
}

.dev--compact .dev__elapsed {
  font-size: 13px;
  margin-top: 0.4rem;
}

.dev__stage {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: rgb(var(--color-muted));
}

.dev--compact .dev__stage {
  font-size: 9px;
}

/* ------------------------------------------------------------------
 * Bottom ledger ruler.
 * ------------------------------------------------------------------ */
.dev__rail {
  position: absolute;
  inset: auto 1.2rem 1.05rem;
  display: grid;
  gap: 0.5rem;
  pointer-events: none;
}

.dev--compact .dev__rail {
  inset: auto 0.7rem 0.65rem;
  gap: 0.35rem;
}

.dev__rail-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.7rem;
}

.dev__prompt {
  margin: 0;
  font-family: 'Fraunces', Georgia, serif;
  font-style: italic;
  font-size: 13px;
  line-height: 1.35;
  color: rgb(var(--color-ink) / 0.78);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 64%;
}

.dev--compact .dev__prompt {
  font-size: 12px;
  -webkit-line-clamp: 1;
}

.dev__remain {
  flex-shrink: 0;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgb(var(--color-ink) / 0.78);
  font-feature-settings: 'tnum';
}

.dev--compact .dev__remain {
  font-size: 9px;
}

.dev__ruler {
  position: relative;
  height: 4px;
  border-radius: 999px;
  background: rgb(var(--color-line) / 0.55);
  overflow: hidden;
}

.dev__ruler-ticks {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    90deg,
    rgb(var(--color-paper-soft) / 0.9) 0 1px,
    transparent 1px 9px
  );
  opacity: 0.5;
}

.dev__ruler-fill {
  position: relative;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgb(var(--color-forest) / 0.55), rgb(var(--color-forest)));
  transition: width 0.5s var(--motion-snap);
}

.dev__ruler-head {
  position: absolute;
  right: 0;
  top: 50%;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: rgb(var(--color-forest));
  transform: translate(50%, -50%);
  box-shadow: 0 0 6px rgb(var(--color-forest) / 0.6);
}

.dev__rail-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--color-muted) / 0.7);
}

.dev__pct {
  font-feature-settings: 'tnum';
  color: rgb(var(--color-ink) / 0.7);
}

/* ------------------------------------------------------------------
 * Keyframes.
 * ------------------------------------------------------------------ */
@keyframes dev-latent {
  0%, 100% {
    opacity: 0.07;
    filter: blur(3px);
    transform: scale(0.97);
  }
  45% {
    opacity: 0.5;
    filter: blur(0);
    transform: scale(1);
  }
}

@keyframes dev-wash {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(-210%);
  }
}

@keyframes dev-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes dev-breathe {
  0%, 100% {
    transform: scale(0.96);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.04);
    opacity: 1;
  }
}

@keyframes dev-pulse {
  0%, 100% {
    transform: scale(0.8);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.1);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dev__latent > span {
    animation: none;
    opacity: 0.32;
    filter: none;
  }

  .dev__wash {
    display: none;
  }

  .dev__disc,
  .dev__glyph,
  .dev__tag-dot {
    animation: none;
  }

  .dev__ruler-fill {
    transition: none;
  }
}
</style>
