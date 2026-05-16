<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import FlipDigits from './FlipDigits.vue'

interface Props {
  /** 0 ~ 100 */
  progress: number
  /** Display radius. Stroke is 6px. */
  size?: number
  stage?: string
  elapsedSeconds?: number
}

const props = withDefaults(defineProps<Props>(), {
  size: 184,
  stage: '',
  elapsedSeconds: 0,
})

const RADIUS = 76
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const STAGE_ICONS = ['pencil', 'frame', 'palette', 'sparkle'] as const
const STAGE_LABELS = ['草稿', '上墨', '校色', '收件'] as const

function stageIndex(progress: number) {
  if (progress < 26) return 0
  if (progress < 58) return 1
  if (progress < 84) return 2
  return 3
}

const dashOffset = computed(() => {
  const clamped = Math.max(0, Math.min(100, props.progress))
  return CIRCUMFERENCE * (1 - clamped / 100)
})

const isCompact = computed(() => props.size <= 160)

const stageIcon = computed(() => STAGE_ICONS[stageIndex(props.progress)])

const stageLabel = computed(() => STAGE_LABELS[stageIndex(props.progress)])
</script>

<template>
  <div
    class="progress-ring"
    :style="{ width: `${size}px`, height: `${size}px` }"
    role="progressbar"
    :aria-valuenow="Math.round(progress)"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-label="`生成进度 ${Math.round(progress)}%`"
  >
    <svg viewBox="0 0 200 200" class="progress-ring__svg">
      <circle class="progress-ring__track" cx="100" cy="100" :r="RADIUS" />
      <circle
        class="progress-ring__bar"
        cx="100"
        cy="100"
        :r="RADIUS"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="dashOffset"
      />
      <circle class="progress-ring__head" cx="100" cy="100" :r="RADIUS" />
    </svg>

    <div class="progress-ring__content">
      <div class="progress-ring__icon">
        <Icon :name="stageIcon" :size="20" />
      </div>
      <div class="progress-ring__elapsed" :class="{ 'progress-ring__elapsed--compact': isCompact }">
        <FlipDigits :value="elapsedSeconds" suffix="s" :pad="2" />
      </div>
      <div v-if="stageLabel" class="progress-ring__stage">{{ stageLabel }}</div>
    </div>
  </div>
</template>

<style scoped>
.progress-ring {
  position: relative;
  display: grid;
  place-items: center;
}

.progress-ring__svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.progress-ring__track {
  fill: none;
  stroke: rgb(var(--color-line) / 0.65);
  stroke-width: 6;
}

.progress-ring__bar {
  fill: none;
  stroke: rgb(var(--color-forest));
  stroke-width: 6;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.5s var(--motion-snap);
}

.progress-ring__head {
  fill: none;
  stroke: rgb(var(--color-paper));
  stroke-width: 1.4;
  stroke-dasharray: 6 100;
  stroke-dashoffset: calc(var(--circ, 477) - 3);
  opacity: 0.5;
}

.progress-ring__content {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.3rem;
  text-align: center;
  padding: 0 1.2rem;
}

.progress-ring__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: rgb(var(--color-vellum) / 0.95);
  border: 1px solid rgb(var(--color-line));
  color: rgb(var(--color-forest));
  box-shadow: var(--shadow-inner-paper);
  animation: ring-icon-breathe 2.6s ease-in-out infinite;
}

.progress-ring__elapsed {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 16px;
  font-weight: 300;
  color: rgb(var(--color-ink));
  font-feature-settings: 'tnum';
  letter-spacing: 0;
  line-height: 1;
}

.progress-ring__elapsed--compact {
  font-size: 13px;
}

.progress-ring__stage {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: rgb(var(--color-muted));
}

@keyframes ring-icon-breathe {
  0%, 100% {
    transform: scale(0.96);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.04);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .progress-ring__bar,
  .progress-ring__icon {
    transition: none;
    animation: none;
  }
}
</style>
