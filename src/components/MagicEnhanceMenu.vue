<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import {
  analyzePrompt,
  enhanceDimensions,
  enhanceLevelMeta,
  enhancePrompt,
  enhanceSingleDimension,
  getMissingLabel,
  type EnhanceDimension,
  type EnhanceLevel,
  type EnhanceResult,
} from '../lib/magicEnhance'
import type { ImageStyle } from '../types'

interface Props {
  prompt: string
  style: ImageStyle
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
})

const emit = defineEmits<{
  (e: 'enhance', result: EnhanceResult): void
  (e: 'close'): void
}>()

const selectedLevel = ref<EnhanceLevel>('standard')

const analysis = computed(() => analyzePrompt(props.prompt))
const missingDimensions = computed(() => analysis.value.missing)
const missingHint = computed(() => getMissingLabel(missingDimensions.value))

const hasMissing = computed(() => missingDimensions.value.length > 0)
const canEnhance = computed(() => props.prompt.trim().length > 0 && hasMissing.value)

const levelKeys: EnhanceLevel[] = ['light', 'standard', 'heavy']

function handleLevelEnhance() {
  if (!canEnhance.value) return
  const result = enhancePrompt(props.prompt, props.style, selectedLevel.value)
  emit('enhance', result)
  emit('close')
}

function handleDimensionClick(dim: EnhanceDimension) {
  if (!props.prompt.trim()) return
  const result = enhanceSingleDimension(props.prompt, props.style, dim)
  emit('enhance', result)
  emit('close')
}
</script>

<template>
  <div class="magic-menu" :class="{ 'magic-menu--compact': compact }">
    <div class="magic-menu__header">
      <Icon name="sparkle" :size="14" class="text-forest" />
      <span class="magic-menu__title">魔法增强</span>
    </div>

    <p v-if="!prompt.trim()" class="magic-menu__empty">先写点什么，我再施展魔法</p>

    <template v-else>
      <p class="magic-menu__hint">{{ missingHint }}</p>

      <div v-if="hasMissing" class="magic-menu__dimensions">
        <button
          v-for="dim in missingDimensions"
          :key="dim"
          type="button"
          class="magic-menu__dim-chip"
          @click="handleDimensionClick(dim)"
        >
          <Icon :name="enhanceDimensions.find(d => d.id === dim)?.icon ?? 'sparkle'" :size="12" />
          <span>{{ enhanceDimensions.find(d => d.id === dim)?.label }}</span>
        </button>
      </div>

      <div v-if="hasMissing" class="magic-menu__levels">
        <button
          v-for="key in levelKeys"
          :key="key"
          type="button"
          class="magic-menu__level-btn"
          :class="{ 'magic-menu__level-btn--active': selectedLevel === key }"
          @click="selectedLevel = key"
        >
          <span class="magic-menu__level-label">{{ enhanceLevelMeta[key].label }}</span>
          <span class="magic-menu__level-hint">{{ enhanceLevelMeta[key].hint }}</span>
        </button>
      </div>

      <button
        type="button"
        class="magic-menu__apply"
        :disabled="!canEnhance"
        @click="handleLevelEnhance"
      >
        <Icon name="sparkle" :size="13" />
        <span>{{ hasMissing ? `按「${enhanceLevelMeta[selectedLevel].label}」增强` : '提示词已完整' }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.magic-menu {
  min-width: 220px;
  max-width: 280px;
  padding: 0.6rem;
  border-radius: 18px;
  border: 1px solid rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-paper));
  box-shadow:
    0 12px 32px -12px rgb(var(--color-ink) / 0.28),
    0 4px 12px -4px rgb(var(--color-ink) / 0.12);
  z-index: 50;
}

.magic-menu--compact {
  min-width: 200px;
  max-width: 260px;
  padding: 0.5rem;
  border-radius: 16px;
}

.magic-menu__header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.4rem;
  margin-bottom: 0.35rem;
}

.magic-menu__title {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--color-ink));
}

.magic-menu__empty {
  padding: 0.5rem 0.4rem;
  font-size: 12px;
  color: rgb(var(--color-muted));
  line-height: 1.5;
}

.magic-menu__hint {
  padding: 0 0.4rem;
  margin-bottom: 0.5rem;
  font-size: 11px;
  color: rgb(var(--color-muted));
  line-height: 1.5;
}

.magic-menu__dimensions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0 0.15rem;
  margin-bottom: 0.55rem;
}

.magic-menu__dim-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.8);
  background: rgb(var(--color-cream));
  color: rgb(var(--color-ink) / 0.8);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 140ms ease;
  -webkit-tap-highlight-color: transparent;
}

.magic-menu__dim-chip:hover {
  background: rgb(var(--color-vellum));
  border-color: rgb(var(--color-ink) / 0.3);
  color: rgb(var(--color-ink));
}

.magic-menu__dim-chip:active {
  transform: scale(0.95);
}

.magic-menu__levels {
  display: flex;
  gap: 0.3rem;
  padding: 0 0.15rem;
  margin-bottom: 0.55rem;
}

.magic-menu__level-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  padding: 0.35rem 0.3rem;
  border-radius: 12px;
  border: 1px solid rgb(var(--color-line) / 0.6);
  background: transparent;
  cursor: pointer;
  transition: all 140ms ease;
  -webkit-tap-highlight-color: transparent;
}

.magic-menu__level-btn:hover {
  background: rgb(var(--color-cream));
  border-color: rgb(var(--color-line-strong));
}

.magic-menu__level-btn--active {
  background: rgb(var(--color-ink));
  border-color: rgb(var(--color-ink));
}

.magic-menu__level-btn--active .magic-menu__level-label {
  color: rgb(var(--color-paper));
}

.magic-menu__level-btn--active .magic-menu__level-hint {
  color: rgb(var(--color-paper) / 0.6);
}

.magic-menu__level-label {
  font-size: 12px;
  font-weight: 600;
  color: rgb(var(--color-ink));
}

.magic-menu__level-hint {
  font-size: 9px;
  color: rgb(var(--color-muted));
  white-space: nowrap;
}

.magic-menu__apply {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.55rem 0.8rem;
  border-radius: 12px;
  border: none;
  background: rgb(var(--color-forest));
  color: rgb(var(--color-paper));
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 160ms ease;
  -webkit-tap-highlight-color: transparent;
}

.magic-menu__apply:hover:not(:disabled) {
  filter: brightness(1.08);
}

.magic-menu__apply:active:not(:disabled) {
  transform: scale(0.98);
}

.magic-menu__apply:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
