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

interface Palette {
  base: string
  accent: string
  ink: string
  highlight: string
}

/** Per-style palette tuned to its mood. Keeps the brand "atelier ledger" feel. */
const palettes: Record<ImageStyle, Palette> = {
  natural:    { base: '#dfe5d0', accent: '#b8c79c', ink: '#365037', highlight: '#fdfaee' },
  poster:     { base: '#ead0ac', accent: '#c5743f', ink: '#7a2a1c', highlight: '#fff7e8' },
  product:    { base: '#f3eedf', accent: '#a89884', ink: '#1a1815', highlight: '#ffffff' },
  portrait:   { base: '#e7c8b6', accent: '#cb7d61', ink: '#5e2316', highlight: '#fbe8db' },
  anime:      { base: '#e8d8a8', accent: '#dca648', ink: '#2c2516', highlight: '#fff4ce' },
  cinematic:  { base: '#1a1c20', accent: '#4a6d76', ink: '#f1ebde', highlight: '#e6a857' },
  logo:       { base: '#fdfaf2', accent: '#d4ccb6', ink: '#181714', highlight: '#181714' },
  interior:   { base: '#dfd1ba', accent: '#9b7e54', ink: '#3d4a39', highlight: '#fbf2dd' },
  raw:        { base: '#efeadf', accent: '#9c9180', ink: '#3a392f', highlight: '#fffdf6' },
}

const palette = computed(() => palettes[props.variant])
const dimension = computed(() => `${props.size}px`)
</script>

<template>
  <span
    class="style-swatch"
    :class="active ? 'style-swatch--active' : ''"
    :style="{ width: dimension, height: dimension, background: palette.base }"
    :aria-hidden="true"
  >
    <span
      class="style-swatch__sheen"
      :style="{ background: `radial-gradient(circle at 30% 22%, ${palette.highlight}99, transparent 56%)` }"
    ></span>

    <svg
      viewBox="0 0 32 32"
      fill="none"
      class="style-swatch__art"
      :stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <!-- Natural · 远山 + 太阳 + 草地 -->
      <template v-if="variant === 'natural'">
        <circle :cx="22" :cy="9" :r="3" :fill="palette.accent" />
        <path d="M3 22 L11 14 L17 19 L22 15 L29 22" :stroke="palette.ink" :fill="palette.accent" fill-opacity="0.55" />
        <path d="M3 22 H29" :stroke="palette.ink" />
        <path d="M5 26 q3 -2 6 0 q3 -2 6 0 q3 -2 6 0" :stroke="palette.ink" stroke-opacity="0.45" />
      </template>

      <!-- Poster · 标题 + 主体几何 + 留白横线 -->
      <template v-else-if="variant === 'poster'">
        <rect x="5" y="4" width="22" height="24" rx="2" :stroke="palette.ink" />
        <circle :cx="16" :cy="13" :r="4" :fill="palette.accent" />
        <path d="M11 21 H21" :stroke="palette.ink" />
        <path d="M9 24.5 H23" :stroke="palette.ink" stroke-opacity="0.55" />
      </template>

      <!-- Product · 瓶子 + 桌面阴影 -->
      <template v-else-if="variant === 'product'">
        <path d="M13 6 H19 L19 11 Q23 13 23 19 L23 24 Q23 26 21 26 L11 26 Q9 26 9 24 L9 19 Q9 13 13 11 Z"
              :stroke="palette.ink" :fill="palette.accent" fill-opacity="0.32" />
        <path d="M14 16 H18" :stroke="palette.ink" stroke-opacity="0.45" />
        <ellipse :cx="16" :cy="28" :rx="9" :ry="1" :fill="palette.ink" fill-opacity="0.18" />
      </template>

      <!-- Portrait · 头像剪影 + 项圈 -->
      <template v-else-if="variant === 'portrait'">
        <circle :cx="16" :cy="12" :r="4.5" :stroke="palette.ink" :fill="palette.accent" fill-opacity="0.5" />
        <path d="M7.5 26 Q7.5 19 16 19 Q24.5 19 24.5 26 Z" :stroke="palette.ink" :fill="palette.accent" fill-opacity="0.3" />
        <path d="M14 12 Q14 13 14.4 13.4 M18 12 Q18 13 17.6 13.4" :stroke="palette.ink" />
      </template>

      <!-- Anime · 大眼睛 + 发梢 -->
      <template v-else-if="variant === 'anime'">
        <path d="M5 14 Q9 4 16 4 Q23 4 27 14 L27 21 Q24 19 21 21 L21 26 L11 26 L11 21 Q8 19 5 21 Z"
              :stroke="palette.ink" :fill="palette.accent" fill-opacity="0.42" />
        <ellipse :cx="12" :cy="17" :rx="2" :ry="2.4" :fill="palette.ink" />
        <ellipse :cx="20" :cy="17" :rx="2" :ry="2.4" :fill="palette.ink" />
        <circle :cx="12.6" :cy="16.4" :r="0.55" :fill="palette.highlight" />
        <circle :cx="20.6" :cy="16.4" :r="0.55" :fill="palette.highlight" />
      </template>

      <!-- Cinematic · 宽银幕 + 黑边 + 高光 -->
      <template v-else-if="variant === 'cinematic'">
        <rect x="3" y="3" width="26" height="26" rx="2" :fill="palette.base" />
        <rect x="3" y="3" width="26" height="6" :fill="palette.ink" />
        <rect x="3" y="23" width="26" height="6" :fill="palette.ink" />
        <path d="M9 16 L17 11 L23 19" :stroke="palette.ink" :fill="palette.accent" fill-opacity="0.7" />
        <circle :cx="22" :cy="13" :r="1.6" :fill="palette.highlight" />
      </template>

      <!-- Logo · 几何 monogram (P) -->
      <template v-else-if="variant === 'logo'">
        <rect x="4" y="4" width="24" height="24" rx="3" :stroke="palette.ink" stroke-width="1.6" />
        <path d="M11 22 V10 H17 Q21 10 21 14 Q21 18 17 18 H11" :stroke="palette.ink" stroke-width="1.8" />
      </template>

      <!-- Interior · 房间 + 椅子 + 立灯 -->
      <template v-else-if="variant === 'interior'">
        <path d="M3 24 H29" :stroke="palette.ink" />
        <path d="M5 24 V11 L16 4 L27 11 V24" :stroke="palette.ink" :fill="palette.accent" fill-opacity="0.22" />
        <rect x="11" y="17" width="6" height="7" :stroke="palette.ink" :fill="palette.highlight" fill-opacity="0.4" />
        <path d="M21 24 V14 M19.5 14 L22.5 14 M21 14 L21 11 Q21 9 23 9" :stroke="palette.ink" />
      </template>

      <!-- Raw · 文本行 markdown 感 -->
      <template v-else-if="variant === 'raw'">
        <path d="M5 8 H22" :stroke="palette.ink" stroke-width="1.6" />
        <path d="M5 13 H27" :stroke="palette.ink" stroke-opacity="0.6" />
        <path d="M5 17 H24" :stroke="palette.ink" stroke-opacity="0.45" />
        <path d="M5 21 H19" :stroke="palette.ink" stroke-opacity="0.32" />
        <path d="M5 25 H14" :stroke="palette.ink" stroke-opacity="0.22" />
      </template>
    </svg>
  </span>
</template>

<style scoped>
.style-swatch {
  position: relative;
  display: inline-block;
  overflow: hidden;
  flex-shrink: 0;
  border-radius: 8px;
  border: 1px solid rgb(var(--color-line) / 0.5);
  box-shadow: var(--shadow-inner-glass), var(--shadow-glass-sm);
  transition: transform 220ms var(--motion-press), box-shadow 220ms var(--motion-soft), border-color 220ms ease;
}

.style-swatch::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.45);
}

.style-swatch:hover {
  transform: translateY(-1px) scale(1.02);
  box-shadow: var(--shadow-inner-glass), var(--shadow-glass);
}

.style-swatch--active {
  border-color: rgb(var(--color-accent) / 0.55);
  box-shadow: var(--shadow-inner-glass), var(--shadow-glow-accent);
  transform: scale(1.05);
}

.style-swatch__sheen {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.95;
  mix-blend-mode: screen;
}

.style-swatch__art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 12%;
}

@media (prefers-reduced-motion: reduce) {
  .style-swatch {
    transition: none;
  }
}
</style>
