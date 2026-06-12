<script setup lang="ts">
import { computed } from 'vue'
import FlipDigits from './FlipDigits.vue'
import { useI18n } from '../lib/i18n'

interface Props {
  /** 0~100 progress estimate (drives the progress rail). */
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
  /** Optional partial image preview from streaming Responses events. */
  previewUrl?: string
  /** Retained for call-site compatibility. */
  ringSize?: number
  /** Compact variant for chat bubbles. */
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  remainingLabel: '',
  metaLabel: '',
  promptPreview: '',
  previewUrl: '',
  ringSize: 200,
  compact: false,
})
const { t } = useI18n()

defineEmits<{
  (e: 'cancel'): void
}>()

const fillPct = computed(() => Math.max(0, Math.min(100, props.progress)))
const previewClarity = computed(() => Math.max(0, Math.min(1, (fillPct.value - 60) / 36)))
const epulseStyle = computed<Record<string, string>>(() => ({
  '--epulse-progress': `${fillPct.value}%`,
  '--epulse-preview-blur': `${Math.round(14 - previewClarity.value * 10)}px`,
  '--epulse-preview-opacity': `${0.42 + previewClarity.value * 0.2}`,
  '--epulse-preview-scale': `${1.08 - previewClarity.value * 0.035}`,
  '--epulse-preview-overlay-alpha': `${0.82 - previewClarity.value * 0.28}`,
}))
</script>

<template>
  <div
    class="epulse"
    :class="{ 'epulse--compact': compact }"
    :style="epulseStyle"
  >
    <div class="epulse__ambient" aria-hidden="true"></div>
    <div v-if="previewUrl" class="epulse__preview" aria-hidden="true">
      <img :src="previewUrl" alt="" />
      <span></span>
    </div>

    <div class="epulse__center">
      <div class="epulse__gradient-orb" aria-hidden="true"></div>
      <div class="epulse__time">
        <FlipDigits :value="elapsedSeconds" suffix="s" :pad="2" haptic />
      </div>
    </div>

    <div class="epulse__stage">{{ stage }}</div>

    <div class="epulse__top">
      <span class="epulse__tag">
        <span class="epulse__tag-dot" aria-hidden="true"></span>
        <span>{{ t('generation.status') }}</span>
      </span>
      <button
        type="button"
        class="epulse__cancel"
        :aria-label="t('canvas.pending.cancel')"
        @click="$emit('cancel')"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
        <span>{{ t('canvas.pending.cancelLabel') }}</span>
      </button>
    </div>

    <div class="epulse__bottom">
      <div class="epulse__meta-row">
        <p v-if="promptPreview" class="epulse__prompt">{{ promptPreview }}</p>
        <span v-if="remainingLabel" class="epulse__remain">{{ remainingLabel }}</span>
      </div>
      <div class="epulse__progress-row">
        <span v-if="metaLabel" class="epulse__meta">{{ metaLabel }}</span>
        <span class="epulse__progress-track" aria-hidden="true">
          <span></span>
        </span>
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
  --epulse-mint: rgb(var(--color-accent) / 0.18);
  --epulse-blush: rgb(var(--color-clay) / 0.09);
  background:
    radial-gradient(90% 70% at 18% 74%, var(--epulse-mint), transparent 62%),
    radial-gradient(74% 58% at 84% 12%, var(--epulse-blush), transparent 64%),
    linear-gradient(128deg, rgb(var(--color-surface-raised) / 0.96), rgb(var(--color-vellum) / 0.72) 46%, rgb(var(--color-surface-raised) / 0.94));
  background-size: 170% 170%;
  animation: epulse-gradient 8.5s ease-in-out infinite;
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}

.epulse__ambient {
  position: absolute;
  inset: -18%;
  z-index: 0;
  background:
    radial-gradient(circle at 34% 42%, rgb(var(--color-accent) / 0.12), transparent 34%),
    radial-gradient(circle at 68% 54%, rgb(var(--color-clay) / 0.07), transparent 38%);
  filter: blur(32px);
  opacity: 0.86;
  transform: translate3d(0, 0, 0);
  animation: epulse-ambient 10s var(--motion-soft) infinite;
  pointer-events: none;
}

.epulse__preview {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
}

.epulse__preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(var(--epulse-preview-blur, 14px)) saturate(1.14);
  opacity: var(--epulse-preview-opacity, 0.46);
  transform: scale(var(--epulse-preview-scale, 1.08));
  transition:
    filter 700ms var(--motion-snap),
    opacity 700ms var(--motion-snap),
    transform 700ms var(--motion-snap);
}

.epulse__preview span {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgb(var(--color-surface-raised) / 0.3), rgb(var(--color-surface-raised) / var(--epulse-preview-overlay-alpha, 0.82))),
    radial-gradient(circle at 50% 45%, transparent, rgb(var(--color-vellum) / 0.58) 68%);
  transition: background 700ms var(--motion-snap);
}

.epulse__center,
.epulse__stage,
.epulse__top,
.epulse__bottom {
  z-index: 2;
}

.epulse__center {
  position: relative;
  width: min(38%, 210px);
  min-width: 128px;
  height: min(38%, 210px);
  min-height: 128px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.epulse--compact .epulse__center {
  width: 116px;
  min-width: 116px;
  height: 116px;
  min-height: 116px;
}

.epulse__gradient-orb {
  position: absolute;
  width: 108px;
  height: 108px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 34% 30%, rgb(255 255 255 / 0.82), transparent 22%),
    radial-gradient(circle at 50% 54%, rgb(var(--color-accent) / 0.44), transparent 48%),
    radial-gradient(circle at 68% 66%, rgb(var(--color-blueprint) / 0.22), transparent 68%),
    radial-gradient(circle, rgb(var(--color-clay) / 0.1), transparent 78%);
  filter: blur(18px) saturate(1.22);
  opacity: 0.92;
  transform: translate3d(-22px, 10px, 0) scale(1);
  animation:
    epulse-orb-drift 5.4s var(--motion-soft) infinite,
    epulse-orb-gradient 7.2s ease-in-out infinite;
  mix-blend-mode: multiply;
  will-change: transform, filter, opacity;
}

.epulse--compact .epulse__gradient-orb {
  width: 82px;
  height: 82px;
  filter: blur(15px) saturate(1.18);
}

.epulse__time {
  position: relative;
  z-index: 1;
  font-size: 13px;
  font-weight: 700;
  color: rgb(var(--color-accent));
  font-feature-settings: 'tnum';
  letter-spacing: 0.02em;
  text-shadow: 0 1px 12px rgb(var(--color-surface-raised) / 0.86);
}

.epulse--compact .epulse__time {
  font-size: 12px;
}

.epulse__stage {
  margin-top: 0.45rem;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.22em;
  color: rgb(var(--color-accent) / 0.82);
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
  background: var(--gradient-primary);
  animation: epulse-dot 2s ease-in-out infinite;
  box-shadow: 0 0 6px rgb(var(--color-accent) / 0.5);
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
  flex: 0 1 auto;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(var(--color-muted) / 0.6);
}

.epulse__progress-track {
  position: relative;
  flex: 1 1 80px;
  min-width: 44px;
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(var(--color-ink) / 0.08);
}

.epulse__progress-track span {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--epulse-progress);
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    rgb(var(--color-accent)),
    rgb(var(--color-blueprint) / 0.92),
    rgb(var(--color-clay) / 0.58)
  );
  background-size: 180% 100%;
  animation: epulse-progress-gradient 2.4s ease-in-out infinite;
  transition: width 640ms var(--motion-snap);
}

.epulse__pct {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  font-feature-settings: 'tnum';
  color: rgb(var(--color-accent) / 0.9);
  letter-spacing: 0.02em;
}

/* ------------------------------------------------------------------
 * Keyframes.
 * ------------------------------------------------------------------ */
@keyframes epulse-gradient {
  0%, 100% {
    background-position: 0% 54%;
  }
  50% {
    background-position: 100% 46%;
  }
}

@keyframes epulse-ambient {
  0%, 100% {
    transform: translate3d(-1%, 1%, 0) scale(1);
    opacity: 0.72;
  }
  45% {
    transform: translate3d(2%, -1.5%, 0) scale(1.05);
    opacity: 0.96;
  }
  72% {
    transform: translate3d(-2%, -0.5%, 0) scale(0.98);
    opacity: 0.84;
  }
}

@keyframes epulse-orb-drift {
  0%, 100% {
    transform: translate3d(-24px, 12px, 0) scale(0.96);
  }
  36% {
    transform: translate3d(18px, -18px, 0) scale(1.1);
  }
  68% {
    transform: translate3d(28px, 16px, 0) scale(1.02);
  }
}

@keyframes epulse-orb-gradient {
  0%, 100% {
    filter: blur(18px) saturate(1.12);
    opacity: 0.84;
  }
  50% {
    filter: blur(21px) saturate(1.38);
    opacity: 0.96;
  }
}

@keyframes epulse-progress-gradient {
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

@keyframes epulse-dot {
  0%, 100% {
    opacity: 0.5;
    transform: scale(0.8);
    box-shadow: 0 0 4px rgb(var(--color-accent) / 0.3);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
    box-shadow: 0 0 8px rgb(var(--color-accent) / 0.6);
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
  .epulse,
  .epulse__ambient,
  .epulse__gradient-orb,
  .epulse__tag-dot,
  .epulse__progress-track span {
    animation: none;
  }

  .epulse__gradient-orb {
    transform: translate3d(0, 0, 0);
  }

  .epulse__stage {
    animation: none;
    opacity: 0.85;
  }

  .epulse__progress-track span {
    transition: none;
  }
}
</style>
