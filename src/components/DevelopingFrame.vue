<script setup lang="ts">
import { computed } from 'vue'
import FlipDigits from './FlipDigits.vue'

interface Props {
  /** 0~100 progress estimate (drives the arc sweep). */
  progress: number
  /** Elapsed seconds; rendered through FlipDigits. */
  elapsedSeconds: number
  /** Stage label. */
  stage: string
  /** Optional ETA / remaining label. */
  remainingLabel?: string
  /** First line of meta footer (typically size · style). */
  metaLabel?: string
  /** Second line of meta footer (prompt preview, truncated). */
  promptPreview?: string
  /** Retained for call-site compatibility. */
  ringSize?: number
  /** Compact variant for chat bubbles. */
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

const fillPct = computed(() => Math.max(0, Math.min(100, props.progress)))

/** SVG arc path for progress ring. */
const arcPath = computed(() => {
  const r = 46
  const cx = 50
  const cy = 50
  const angle = (fillPct.value / 100) * 360
  if (angle === 0) return ''
  if (angle >= 359.9) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`
  const rad = ((angle - 90) * Math.PI) / 180
  const x = cx + r * Math.cos(rad)
  const y = cy + r * Math.sin(rad)
  const large = angle > 180 ? 1 : 0
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${x} ${y}`
})
</script>

<template>
  <div class="epulse" :class="{ 'epulse--compact': compact }">
    <!-- Ambient background glow -->
    <div class="epulse__ambient" aria-hidden="true"></div>

    <!-- Floating particles -->
    <div class="epulse__particles" aria-hidden="true">
      <span v-for="i in 8" :key="i" :style="{ '--p': i }"></span>
    </div>

    <!-- Central orb composition -->
    <div class="epulse__center">
      <!-- Progress ring (SVG) -->
      <svg class="epulse__ring" viewBox="0 0 100 100" aria-hidden="true">
        <!-- Track -->
        <circle cx="50" cy="50" r="46" class="epulse__ring-track" />
        <!-- Fill arc -->
        <path v-if="arcPath" :d="arcPath" class="epulse__ring-fill" />
        <!-- Rotating accent dash -->
        <circle cx="50" cy="50" r="40" class="epulse__ring-orbit" />
      </svg>

      <!-- Morphing inner glow -->
      <div class="epulse__orb" aria-hidden="true">
        <div class="epulse__orb-core"></div>
        <div class="epulse__orb-halo"></div>
      </div>

      <!-- Elapsed time -->
      <div class="epulse__time">
        <FlipDigits :value="elapsedSeconds" suffix="s" :pad="2" haptic />
      </div>
    </div>

    <!-- Stage label below orb -->
    <div class="epulse__stage">{{ stage }}</div>

    <!-- Top strip: tag + cancel -->
    <div class="epulse__top">
      <span class="epulse__tag">
        <span class="epulse__tag-dot" aria-hidden="true"></span>
        <span>生成中</span>
      </span>
      <button
        type="button"
        class="epulse__cancel"
        aria-label="取消这次生成"
        @click="$emit('cancel')"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
        <span>取消</span>
      </button>
    </div>

    <!-- Bottom info -->
    <div class="epulse__bottom">
      <div class="epulse__meta-row">
        <p v-if="promptPreview" class="epulse__prompt">{{ promptPreview }}</p>
        <span v-if="remainingLabel" class="epulse__remain">{{ remainingLabel }}</span>
      </div>
      <div class="epulse__progress-row">
        <span v-if="metaLabel" class="epulse__meta">{{ metaLabel }}</span>
        <span class="epulse__pct">{{ Math.round(fillPct) }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.epulse {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  background:
    radial-gradient(ellipse 80% 60% at 50% 45%, rgb(var(--color-forest) / 0.04), transparent 70%),
    linear-gradient(160deg, rgb(var(--color-vellum)) 0%, rgb(var(--color-paper-soft)) 100%);
}

/* ------------------------------------------------------------------
 * Ambient background glow — slow color breathing.
 * ------------------------------------------------------------------ */
.epulse__ambient {
  position: absolute;
  inset: -20%;
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 50%,
    rgb(var(--color-forest) / 0.06) 0%,
    rgb(var(--color-ochre) / 0.03) 40%,
    transparent 70%
  );
  animation: epulse-ambient 8s ease-in-out infinite;
  pointer-events: none;
}

/* ------------------------------------------------------------------
 * Floating particles.
 * ------------------------------------------------------------------ */
.epulse__particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.epulse__particles > span {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgb(var(--color-forest) / 0.35);
  top: 50%;
  left: 50%;
  animation: epulse-particle 6s ease-in-out infinite;
  animation-delay: calc(var(--p) * -0.75s);
}

.epulse__particles > span:nth-child(odd) {
  width: 2px;
  height: 2px;
  background: rgb(var(--color-ochre) / 0.3);
}

/* ------------------------------------------------------------------
 * Center orb area.
 * ------------------------------------------------------------------ */
.epulse__center {
  position: relative;
  width: 140px;
  height: 140px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.epulse--compact .epulse__center {
  width: 110px;
  height: 110px;
}

/* Progress ring SVG */
.epulse__ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.epulse__ring-track {
  fill: none;
  stroke: rgb(var(--color-line) / 0.3);
  stroke-width: 1;
}

.epulse__ring-fill {
  fill: none;
  stroke: rgb(var(--color-forest));
  stroke-width: 2;
  stroke-linecap: round;
  filter: drop-shadow(0 0 4px rgb(var(--color-forest) / 0.4));
  transition: d 0.6s var(--motion-snap);
}

.epulse__ring-orbit {
  fill: none;
  stroke: rgb(var(--color-forest) / 0.15);
  stroke-width: 0.5;
  stroke-dasharray: 3 12;
  animation: epulse-orbit 12s linear infinite;
  transform-origin: center;
}

/* Morphing inner orb */
.epulse__orb {
  position: absolute;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
}

.epulse--compact .epulse__orb {
  width: 44px;
  height: 44px;
}

.epulse__orb-core {
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 35%, rgb(var(--color-forest) / 0.9), rgb(var(--color-forest) / 0.5) 60%, transparent 80%);
  animation: epulse-morph 4s ease-in-out infinite;
  filter: blur(1px);
}

.epulse__orb-halo {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgb(var(--color-forest) / 0.08);
  border: 1px solid rgb(var(--color-forest) / 0.12);
  animation: epulse-breathe 3s ease-in-out infinite;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* Elapsed time positioned below orb */
.epulse__time {
  position: absolute;
  bottom: 8px;
  font-size: 13px;
  font-weight: 400;
  color: rgb(var(--color-ink) / 0.85);
  font-feature-settings: 'tnum';
  letter-spacing: 0.02em;
}

.epulse--compact .epulse__time {
  font-size: 11px;
  bottom: 4px;
}

/* ------------------------------------------------------------------
 * Stage label.
 * ------------------------------------------------------------------ */
.epulse__stage {
  margin-top: 0.75rem;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.28em;
  color: rgb(var(--color-forest) / 0.8);
  animation: epulse-fade-stage 2.4s ease-in-out infinite;
}

.epulse--compact .epulse__stage {
  margin-top: 0.5rem;
  font-size: 9px;
}

/* ------------------------------------------------------------------
 * Top strip.
 * ------------------------------------------------------------------ */
.epulse__top {
  position: absolute;
  inset: 0.9rem 1rem auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}

.epulse--compact .epulse__top {
  inset: 0.55rem 0.6rem auto;
}

.epulse__tag {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgb(var(--color-muted) / 0.7);
}

.epulse__tag-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgb(var(--color-forest));
  animation: epulse-dot 2s ease-in-out infinite;
  box-shadow: 0 0 6px rgb(var(--color-forest) / 0.5);
}

.epulse__cancel {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.6);
  background: rgb(var(--color-vellum) / 0.9);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: rgb(var(--color-muted) / 0.8);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.04em;
  cursor: pointer;
  pointer-events: auto;
  transition:
    color var(--dur-feedback) var(--motion-soft),
    border-color var(--dur-feedback) var(--motion-soft),
    background-color var(--dur-feedback) var(--motion-soft),
    transform var(--dur-feedback) var(--motion-press),
    box-shadow var(--dur-feedback) var(--motion-soft);
  -webkit-tap-highlight-color: transparent;
}

.epulse__cancel:hover {
  color: rgb(var(--color-accent));
  border-color: rgb(var(--color-accent) / 0.35);
  background: rgb(var(--color-accent) / 0.06);
  box-shadow: 0 2px 8px -2px rgb(var(--color-accent) / 0.2);
}

.epulse__cancel:active {
  transform: scale(0.94);
}

/* ------------------------------------------------------------------
 * Bottom info area.
 * ------------------------------------------------------------------ */
.epulse__bottom {
  position: absolute;
  inset: auto 1.1rem 0.9rem;
  display: grid;
  gap: 0.4rem;
  pointer-events: none;
}

.epulse--compact .epulse__bottom {
  inset: auto 0.6rem 0.55rem;
  gap: 0.3rem;
}

.epulse__meta-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.6rem;
}

.epulse__prompt {
  margin: 0;
  font-family: 'Fraunces', Georgia, serif;
  font-style: italic;
  font-size: 12px;
  line-height: 1.4;
  color: rgb(var(--color-ink) / 0.6);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 65%;
}

.epulse--compact .epulse__prompt {
  font-size: 11px;
  -webkit-line-clamp: 1;
}

.epulse__remain {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.03em;
  color: rgb(var(--color-ink) / 0.6);
  font-feature-settings: 'tnum';
}

.epulse--compact .epulse__remain {
  font-size: 9px;
}

.epulse__progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.epulse__meta {
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(var(--color-muted) / 0.6);
}

.epulse__pct {
  font-size: 10px;
  font-weight: 600;
  font-feature-settings: 'tnum';
  color: rgb(var(--color-forest) / 0.9);
  letter-spacing: 0.02em;
}

/* ------------------------------------------------------------------
 * Keyframes.
 * ------------------------------------------------------------------ */
@keyframes epulse-ambient {
  0%, 100% {
    transform: scale(1) rotate(0deg);
    opacity: 0.7;
  }
  33% {
    transform: scale(1.05) rotate(2deg);
    opacity: 1;
  }
  66% {
    transform: scale(0.95) rotate(-1deg);
    opacity: 0.8;
  }
}

@keyframes epulse-particle {
  0% {
    transform: translate(0, 0) scale(0);
    opacity: 0;
  }
  10% {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
  100% {
    transform:
      translate(
        calc(cos(calc(var(--p) * 45deg)) * 80px),
        calc(sin(calc(var(--p) * 45deg)) * 80px)
      )
      scale(0);
    opacity: 0;
  }
}

@keyframes epulse-orbit {
  to {
    transform: rotate(360deg);
  }
}

@keyframes epulse-morph {
  0%, 100% {
    border-radius: 50%;
    transform: scale(0.9) rotate(0deg);
  }
  25% {
    border-radius: 42% 58% 62% 38% / 45% 55% 45% 55%;
    transform: scale(1) rotate(5deg);
  }
  50% {
    border-radius: 55% 45% 38% 62% / 58% 42% 58% 42%;
    transform: scale(0.95) rotate(-3deg);
  }
  75% {
    border-radius: 48% 52% 55% 45% / 40% 60% 40% 60%;
    transform: scale(1.02) rotate(2deg);
  }
}

@keyframes epulse-breathe {
  0%, 100% {
    transform: scale(1);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.08);
    opacity: 1;
  }
}

@keyframes epulse-dot {
  0%, 100% {
    opacity: 0.5;
    transform: scale(0.8);
    box-shadow: 0 0 4px rgb(var(--color-forest) / 0.3);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
    box-shadow: 0 0 8px rgb(var(--color-forest) / 0.6);
  }
}

@keyframes epulse-fade-stage {
  0%, 100% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
}

/* ------------------------------------------------------------------
 * Reduced motion: keep things calm.
 * ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .epulse__ambient,
  .epulse__orb-core,
  .epulse__orb-halo,
  .epulse__ring-orbit,
  .epulse__tag-dot {
    animation: none;
  }

  .epulse__particles {
    display: none;
  }

  .epulse__stage {
    animation: none;
    opacity: 0.85;
  }

  .epulse__ring-fill {
    transition: none;
  }
}
</style>
