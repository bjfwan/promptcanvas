<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import { analysePrompt, type InsightDim } from '../lib/promptInsights'

interface Props {
  prompt: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'pick', dim: InsightDim): void
}>()

const insights = computed(() => analysePrompt(props.prompt))

const matchedCount = computed(() => insights.value.filter((entry) => entry.matched).length)

function handlePick(dim: InsightDim, matched: boolean) {
  if (matched) return
  emit('pick', dim)
}
</script>

<template>
  <div class="prompt-insights" v-if="prompt.trim().length >= 4">
    <div class="prompt-insights__head">
      <span class="display-eyebrow">Coverage</span>
      <span class="prompt-insights__count">{{ matchedCount }} / {{ insights.length }}</span>
    </div>
    <div class="prompt-insights__chips">
      <button
        v-for="entry in insights"
        :key="entry.dim.id"
        type="button"
        class="prompt-insights__chip"
        :class="[
          `prompt-insights__chip--${entry.dim.tone}`,
          entry.matched ? 'prompt-insights__chip--on' : 'prompt-insights__chip--off',
        ]"
        :aria-pressed="entry.matched"
        :title="entry.dim.hint"
        @click="handlePick(entry.dim.id, entry.matched)"
      >
        <Icon
          :name="entry.matched ? 'check' : 'plus'"
          :size="11"
          class="prompt-insights__chip-icon"
        />
        <span>{{ entry.dim.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.prompt-insights {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.prompt-insights__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.prompt-insights__count {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: rgb(var(--color-muted));
}

.prompt-insights__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.32rem;
}

.prompt-insights__chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  height: 26px;
  padding: 0 0.6rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.85);
  background: rgb(var(--color-vellum) / 0.7);
  color: rgb(var(--color-muted));
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: border-color 160ms var(--motion-soft), background-color 160ms var(--motion-soft), color 160ms ease, transform 140ms var(--motion-press);
}

.prompt-insights__chip:hover {
  transform: translateY(-1px);
}

.prompt-insights__chip--off:hover {
  border-color: rgb(var(--color-line-strong));
  background: rgb(var(--color-ivory) / 0.85);
  color: rgb(var(--color-ink));
}

.prompt-insights__chip--off {
  border-style: dashed;
}

.prompt-insights__chip--on {
  cursor: default;
  background: var(--chip-on-bg);
  border-color: var(--chip-on-border);
  color: var(--chip-on-fg);
}

.prompt-insights__chip--on:hover {
  transform: none;
}

.prompt-insights__chip-icon {
  flex-shrink: 0;
}

.prompt-insights__chip--forest    { --chip-on-bg: rgb(var(--color-forest) / 0.14);    --chip-on-border: rgb(var(--color-forest) / 0.4);    --chip-on-fg: rgb(var(--color-forest)); }
.prompt-insights__chip--accent    { --chip-on-bg: rgb(var(--color-accent) / 0.12);    --chip-on-border: rgb(var(--color-accent) / 0.4);    --chip-on-fg: rgb(var(--color-accent)); }
.prompt-insights__chip--ochre     { --chip-on-bg: rgb(var(--color-ochre) / 0.16);     --chip-on-border: rgb(var(--color-ochre) / 0.42);    --chip-on-fg: rgb(var(--color-ochre)); }
.prompt-insights__chip--blueprint { --chip-on-bg: rgb(var(--color-blueprint) / 0.16); --chip-on-border: rgb(var(--color-blueprint) / 0.42); --chip-on-fg: rgb(var(--color-blueprint)); }
.prompt-insights__chip--sage      { --chip-on-bg: rgb(var(--color-sage) / 0.34);      --chip-on-border: rgb(var(--color-sage) / 0.5);      --chip-on-fg: rgb(var(--color-forest)); }
.prompt-insights__chip--clay      { --chip-on-bg: rgb(var(--color-clay) / 0.18);      --chip-on-border: rgb(var(--color-clay) / 0.42);     --chip-on-fg: rgb(var(--color-clay)); }

@media (prefers-reduced-motion: reduce) {
  .prompt-insights__chip {
    transition: none;
  }
}
</style>
