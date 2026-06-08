<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import type { IconName } from '../icons'
import type { PromptTreeAction, PromptTreeNode } from '../composables/usePromptTree'

interface Props {
  nodes: PromptTreeNode[]
  currentId: string | null
  canUndo: boolean
  canRedo: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'undo'): void
  (e: 'redo'): void
  (e: 'jump', id: string): void
  (e: 'branch', id: string): void
  (e: 'clear'): void
}>()

const sortedNodes = computed(() => [...props.nodes].sort((a, b) => a.createdAt - b.createdAt))

const actionIcon: Record<PromptTreeAction, IconName> = {
  manual: 'pencil',
  enhance: 'sparkle',
  'lint-fix': 'check',
  'slot-edit': 'sliders',
  'slot-refill': 'refresh',
  import: 'upload',
  undo: 'reset',
  redo: 'arrowRight',
  reset: 'reset',
  'history-restore': 'image',
}

function shortPreview(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= 28) return trimmed
  return `${trimmed.slice(0, 28)}…`
}

function timeLabel(createdAt: number): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(createdAt))
  } catch {
    return ''
  }
}
</script>

<template>
  <section v-if="sortedNodes.length" class="prompt-treeline reveal">
    <div class="prompt-treeline__head">
      <div class="prompt-treeline__title">
        <span class="prompt-treeline__title-icon" aria-hidden="true">
          <Icon name="layers" :size="11" />
        </span>
        <span class="gradient-text">Prompt 树</span>
        <small>{{ sortedNodes.length }} 节点</small>
      </div>
      <div class="prompt-treeline__nav">
        <button
          type="button"
          class="prompt-treeline__btn"
          :disabled="!canUndo"
          aria-label="回到上一个版本"
          @click="emit('undo')"
        >
          <Icon name="arrowUp" :size="11" />
          <span>撤销</span>
        </button>
        <button
          type="button"
          class="prompt-treeline__btn"
          :disabled="!canRedo"
          aria-label="重做"
          @click="emit('redo')"
        >
          <Icon name="arrowRight" :size="11" />
          <span>重做</span>
        </button>
        <button
          type="button"
          class="prompt-treeline__btn"
          aria-label="清空 Prompt 树"
          @click="emit('clear')"
        >
          <Icon name="trash" :size="11" />
          <span>清空</span>
        </button>
      </div>
    </div>
    <div class="prompt-treeline__rail">
      <button
        v-for="node in sortedNodes"
        :key="node.id"
        type="button"
        class="prompt-treeline__node"
        :class="{ 'is-current': node.id === currentId }"
        :title="`${node.label} · ${timeLabel(node.createdAt)}\n${node.prompt}`"
        @click="emit('jump', node.id)"
        @dblclick="emit('branch', node.id)"
      >
        <span class="prompt-treeline__node-icon">
          <Icon :name="actionIcon[node.action] ?? 'pencil'" :size="9" />
        </span>
        <span class="prompt-treeline__node-body">
          <strong>{{ node.label }}</strong>
          <small>{{ shortPreview(node.prompt) }}</small>
        </span>
      </button>
    </div>
    <p class="prompt-treeline__hint">点击跳转 · 双击从该节点分支</p>
  </section>
</template>

<style scoped>
.prompt-treeline {
  margin-top: 0.55rem;
  padding: 0.6rem 0.65rem 0.45rem;
  border-radius: var(--radius-panel);
  border: 1px dashed rgb(var(--color-line) / 0.55);
  background: rgb(var(--color-ivory) / 0.4);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  box-shadow: var(--shadow-inner-glass);
}

.prompt-treeline__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  margin-bottom: 0.42rem;
}

.prompt-treeline__title {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 11px;
  font-weight: 720;
  color: rgb(var(--color-ink));
}

.prompt-treeline__title small {
  font-size: 9px;
  font-weight: 620;
  color: rgb(var(--color-muted));
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.prompt-treeline__nav {
  display: inline-flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.prompt-treeline__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.26rem;
  padding: 0.2rem 0.58rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.5);
  background: rgb(var(--color-ivory) / 0.45);
  backdrop-filter: blur(10px) saturate(1.4);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
  box-shadow: var(--shadow-inner-glass);
  color: rgb(var(--color-muted));
  font-size: 10px;
  font-weight: 660;
  cursor: pointer;
  transition: background 160ms var(--motion-soft), color 160ms var(--motion-soft), border-color 160ms var(--motion-soft), transform 140ms var(--motion-press), box-shadow 160ms var(--motion-soft);
}

.prompt-treeline__btn:not(:disabled):hover {
  border-color: rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-ivory) / 0.65);
  color: rgb(var(--color-ink));
  transform: translateY(-1px);
  box-shadow: var(--shadow-glass-sm);
}

.prompt-treeline__btn:not(:disabled):active {
  transform: translateY(0);
}

.prompt-treeline__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.prompt-treeline__rail {
  display: flex;
  gap: 0.42rem;
  overflow-x: auto;
  padding-bottom: 0.32rem;
  scrollbar-width: thin;
}

.prompt-treeline__node {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  padding: 0.4rem 0.58rem;
  border-radius: var(--radius-panel);
  border: 1px solid rgb(var(--color-line) / 0.45);
  background: rgb(var(--color-ivory) / 0.45);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  box-shadow: var(--shadow-inner-glass);
  color: rgb(var(--color-ink));
  cursor: pointer;
  transition: background 180ms var(--motion-soft), border-color 180ms var(--motion-soft), transform 160ms var(--motion-press), box-shadow 180ms var(--motion-soft);
  text-align: left;
}

.prompt-treeline__node:hover {
  border-color: rgb(var(--color-line-strong) / 0.7);
  background: rgb(var(--color-ivory) / 0.65);
  transform: translateY(-1px);
  box-shadow: var(--shadow-glass-sm);
}

.prompt-treeline__node:active {
  transform: scale(0.98);
}

.prompt-treeline__node.is-current {
  border-color: transparent;
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent);
}

.prompt-treeline__node-icon {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: rgb(var(--color-ivory) / 0.5);
  box-shadow: var(--shadow-inner-glass);
  color: rgb(var(--color-ink));
}

.prompt-treeline__node.is-current .prompt-treeline__node-icon {
  background: rgb(255 255 255 / 0.22);
  color: #fff;
}

.prompt-treeline__node-body {
  display: grid;
  gap: 0.06rem;
  min-width: 0;
}

.prompt-treeline__node-body strong {
  font-size: 10px;
  font-weight: 720;
}

.prompt-treeline__node-body small {
  font-size: 9px;
  opacity: 0.78;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.prompt-treeline__hint {
  margin: 0.32rem 0 0;
  font-size: 9px;
  letter-spacing: 0.04em;
  color: rgb(var(--color-muted));
  text-align: right;
}

@media (prefers-reduced-motion: reduce) {
  .prompt-treeline__btn,
  .prompt-treeline__node {
    transition: none;
  }
}
</style>
