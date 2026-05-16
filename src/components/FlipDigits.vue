<script setup lang="ts">
import { computed, watch } from 'vue'
import { useVibration } from '../composables/useVibration'

interface Props {
  /** Numeric value to display, padded to `pad` digits. */
  value: number
  /** Suffix appended after the digits (rendered statically). */
  suffix?: string
  /** Minimum digit count, padded with leading zeros. */
  pad?: number
  /** Emit a 1ms haptic tap on each value change (mobile only). */
  haptic?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  suffix: '',
  pad: 2,
  haptic: false,
})

const { vibrate } = useVibration()

const digits = computed(() => {
  const safe = Math.max(0, Math.floor(props.value || 0))
  const padded = safe.toString().padStart(props.pad, '0')
  return padded.split('')
})

watch(
  () => props.value,
  (next, prev) => {
    if (!props.haptic) return
    if (typeof prev !== 'number' || next === prev) return
    vibrate('tap')
  },
)
</script>

<template>
  <span class="flip-digits" aria-hidden="true">
    <span v-for="(d, i) in digits" :key="i" class="flip-digits__cell">
      <Transition name="flip">
        <span :key="d" class="flip-digits__char">{{ d }}</span>
      </Transition>
    </span>
    <span v-if="suffix" class="flip-digits__suffix">{{ suffix }}</span>
    <span class="sr-only">{{ value }}{{ suffix }}</span>
  </span>
</template>

<style scoped>
.flip-digits {
  display: inline-flex;
  align-items: baseline;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-feature-settings: 'tnum';
  letter-spacing: 0;
  line-height: 1;
}

.flip-digits__cell {
  position: relative;
  display: inline-block;
  width: 0.62em;
  height: 1em;
  overflow: hidden;
  vertical-align: baseline;
}

.flip-digits__char {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  will-change: transform, opacity;
}

.flip-digits__suffix {
  margin-left: 0.06em;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Split-flap style transition. */
.flip-enter-active,
.flip-leave-active {
  transition: transform var(--dur-transition) var(--motion-snap), opacity var(--dur-transition) var(--motion-snap);
}

.flip-enter-from {
  transform: translateY(100%);
  opacity: 0;
}

.flip-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .flip-enter-active,
  .flip-leave-active {
    transition: opacity var(--dur-feedback) ease;
  }

  .flip-enter-from,
  .flip-leave-to {
    transform: none;
  }
}
</style>
