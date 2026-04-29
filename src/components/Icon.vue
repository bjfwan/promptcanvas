<script setup lang="ts">
import { computed } from 'vue'
import { iconRegistry, type IconDefinition, type IconName } from '../icons'

interface Props {
  name: IconName
  strokeWidth?: number | string
  decorative?: boolean
  label?: string
  size?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  size: 18,
  strokeWidth: 1.6,
  decorative: true,
})

const fallback: IconDefinition = { paths: [] }

const definition = computed<IconDefinition>(() => {
  const def = iconRegistry[props.name] as IconDefinition | undefined
  if (!def) {
    if (import.meta.env.DEV) {
      console.warn(`[Icon] 未注册的图标名：${props.name as string}`)
    }
    return fallback
  }
  return def
})

const viewBox = computed(() => definition.value.viewBox ?? '0 0 24 24')

const dimensions = computed(() => {
  const value = typeof props.size === 'number' ? `${props.size}` : props.size
  return { width: value, height: value }
})

const ariaProps = computed(() => {
  if (props.decorative && !props.label) {
    return { 'aria-hidden': 'true' as const, focusable: 'false' as const }
  }

  return {
    role: 'img' as const,
    'aria-label': props.label ?? props.name,
  }
})
</script>

<template>
  <svg
    :width="dimensions.width"
    :height="dimensions.height"
    :viewBox="viewBox"
    fill="none"
    :stroke-width="strokeWidth"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    v-bind="ariaProps"
    class="shrink-0 transition-transform duration-200"
  >
    <path v-for="(d, idx) in definition.paths" :key="idx" :d="d" vector-effect="non-scaling-stroke" />
  </svg>
</template>
