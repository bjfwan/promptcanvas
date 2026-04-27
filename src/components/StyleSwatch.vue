<script setup lang="ts">
import { computed } from 'vue'
import type { ImageStyle } from '../types'

interface Props {
  variant: ImageStyle
  active?: boolean
  size?: number
}

const props = withDefaults(defineProps<Props>(), {
  size: 32,
  active: false,
})

// 每种风格用一组色彩 + 几何符号承载视觉记忆
const palettes: Record<ImageStyle, { fill: string; stroke: string; mark: string }> = {
  natural: { fill: '#dfe5d4', stroke: '#7c8b66', mark: 'M3 16c4-3 8 1 12-2s4-3 6-2' },
  poster: { fill: '#f4d8b6', stroke: '#9a3a1c', mark: 'M5 4h14v16H5z M9 8h6 M9 12h6 M9 16h4' },
  product: { fill: '#ece4d3', stroke: '#3a3128', mark: 'M6 18h12 M8 18l2-9h4l2 9 M10 9l2-3 2 3' },
  portrait: { fill: '#efd2c4', stroke: '#7a2c14', mark: 'M12 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M5 21a7 7 0 0 1 14 0' },
  anime: { fill: '#fce6c2', stroke: '#c2872d', mark: 'M5 8l3-3 4 3 4-3 3 3 M5 8v10h14V8 M9 13l2 2 4-4' },
  cinematic: { fill: '#1a1612', stroke: '#f1e9dc', mark: 'M4 6h16v12H4z M8 6v12 M16 6v12' },
  logo: { fill: '#faf3e6', stroke: '#1a1612', mark: 'M5 12h14 M12 5v14 M7 7l10 10 M17 7L7 17' },
  interior: { fill: '#e8d8c0', stroke: '#2f4a2f', mark: 'M4 20h16 M6 20V8l6-4 6 4v12 M10 20v-7h4v7' },
  raw: { fill: '#f1e9dc', stroke: '#6c6357', mark: 'M5 8h14 M5 12h10 M5 16h7' },
}

const palette = computed(() => palettes[props.variant])
const dimension = computed(() => `${props.size}px`)
</script>

<template>
  <span
    class="relative inline-block overflow-hidden rounded-lg border transition"
    :class="active ? 'border-paper/30 shadow-inner-paper' : 'border-line-strong/60'"
    :style="{ width: dimension, height: dimension, background: palette.fill }"
    :aria-hidden="true"
  >
    <span
      class="absolute inset-0 opacity-90"
      :style="{ background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.6), transparent 55%)` }"
    ></span>
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      :stroke="palette.stroke"
      class="absolute inset-0 m-auto"
      :style="{ width: '70%', height: '70%' }"
    >
      <path :d="palette.mark" />
    </svg>
  </span>
</template>
