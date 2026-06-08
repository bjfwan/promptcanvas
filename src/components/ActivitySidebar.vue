<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { resolveImageSource } from '../api'
import type { GenerationHistoryItem } from '../types'

interface Props {
  history: GenerationHistoryItem[]
  isGenerating?: boolean
  elapsedSeconds?: number
  promptPreview?: string
  selectedRequestId?: string
}

const props = withDefaults(defineProps<Props>(), {
  isGenerating: false,
  elapsedSeconds: 0,
  promptPreview: '',
  selectedRequestId: '',
})

const emit = defineEmits<{
  (e: 'restore', item: GenerationHistoryItem): void
  (e: 'open-history'): void
  (e: 'view-image', item: GenerationHistoryItem): void
  (e: 'copy', text: string, message: string): void
  (e: 'preview', item: GenerationHistoryItem): void
  (e: 'copy-prompt', item: GenerationHistoryItem): void
  (e: 'reuse-params', item: GenerationHistoryItem): void
  (e: 'remix', item: GenerationHistoryItem): void
  (e: 'regenerate', item: GenerationHistoryItem): void
}>()

const recent = computed(() => props.history.slice(0, 6))

// 单击卡片展开详情，不再直接覆写当前工作。
const expandedId = ref<string>('')

function toggleExpand(item: GenerationHistoryItem) {
  expandedId.value = expandedId.value === item.id ? '' : item.id
}

function hasPreviewableImage(item: GenerationHistoryItem) {
  return !!(item.images && item.images.length && resolveImageSource(item.images[0]))
}

// 列表变化（如新生成）时收起展开，避免错位。
watch(
  () => props.history.map((item) => item.id).join('|'),
  () => {
    expandedId.value = ''
  },
)

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

function previewSrc(item: GenerationHistoryItem): string {
  const first = item.images?.[0]
  return first ? resolveImageSource(first) : ''
}
</script>

<template>
  <aside class="activity-sidebar reveal" style="--reveal-delay: 200ms;">
    <header class="activity-sidebar__head">
      <div>
        <p class="display-eyebrow">03 · Activity</p>
        <h2 class="font-display text-[22px] tracking-tightish">时间线</h2>
      </div>
      <button
        v-if="history.length"
        type="button"
        class="btn-quiet text-[11px]"
        aria-label="查看完整历史"
        @click="emit('open-history')"
      >
        全部
        <Icon name="arrowRight" :size="11" />
      </button>
    </header>

    <ol class="activity-sidebar__list">
      <li v-if="isGenerating" class="activity-sidebar__live">
        <span class="activity-sidebar__live-dot" aria-hidden="true"></span>
        <div class="min-w-0 flex-1">
          <p class="text-[12px] font-semibold text-ink">正在生成 · {{ elapsedSeconds }}s</p>
          <p class="mt-0.5 truncate text-[11px] text-muted">{{ promptPreview || '工作中…' }}</p>
        </div>
      </li>

      <template v-if="recent.length">
        <li
          v-for="(item, index) in recent"
          :key="item.id"
          class="activity-sidebar__item"
          :class="{
            'activity-sidebar__item--active': selectedRequestId && selectedRequestId === item.requestId,
            'activity-sidebar__item--expanded': expandedId === item.id,
          }"
        >
          <span class="activity-sidebar__rail" aria-hidden="true">
            <span class="activity-sidebar__node" :data-index="index"></span>
          </span>

          <div class="activity-sidebar__cell">
            <button
              type="button"
              class="activity-sidebar__card"
              :aria-label="`查看历史详情：${item.prompt.slice(0, 40)}`"
              :aria-expanded="expandedId === item.id"
              @click="toggleExpand(item)"
            >
              <span class="activity-sidebar__thumb" aria-hidden="true">
                <img
                  v-if="previewSrc(item)"
                  :src="previewSrc(item)"
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                <span v-else class="activity-sidebar__thumb-fallback">
                  <Icon name="frame" :size="14" />
                </span>
                <span v-if="item.imageCount > 1" class="activity-sidebar__thumb-count">×{{ item.imageCount }}</span>
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                  <span>{{ formatTime(item.createdAt) }}</span>
                  <span class="text-line">·</span>
                  <span>{{ item.size }}</span>
                  <span v-if="item.referenceImageCount" class="text-line">·</span>
                  <span v-if="item.referenceImageCount" class="text-forest">参考</span>
                  <Icon
                    name="chevronDown"
                    :size="11"
                    class="activity-sidebar__chevron ml-auto"
                    aria-hidden="true"
                  />
                </span>
                <span class="activity-sidebar__prompt">{{ item.prompt }}</span>
              </span>
            </button>

            <div
              v-if="expandedId === item.id"
              class="activity-sidebar__actions"
              role="group"
              aria-label="历史操作"
            >
              <button
                v-if="hasPreviewableImage(item)"
                type="button"
                class="activity-sidebar__chip"
                aria-label="预览这张生成"
                @click.stop="emit('preview', item)"
              >
                <Icon name="search" :size="11" />
                <span>预览</span>
              </button>
              <button
                type="button"
                class="activity-sidebar__chip"
                aria-label="复制提示词到剪贴板"
                @click.stop="emit('copy-prompt', item)"
              >
                <Icon name="copy" :size="11" />
                <span>复制提示词</span>
              </button>
              <button
                type="button"
                class="activity-sidebar__chip"
                aria-label="只套用参数（风格、尺寸、模型），不改提示词"
                @click.stop="emit('reuse-params', item)"
              >
                <Icon name="settings" :size="11" />
                <span>套用参数</span>
              </button>
              <button
                v-if="hasPreviewableImage(item)"
                type="button"
                class="activity-sidebar__chip"
                aria-label="基于这张图接着画"
                @click.stop="emit('remix', item)"
              >
                <Icon name="sparkle" :size="11" />
                <span>接着画</span>
              </button>
              <button
                type="button"
                class="activity-sidebar__chip"
                aria-label="恢复这条历史的全部参数与画布"
                @click.stop="emit('restore', item)"
              >
                <Icon name="refresh" :size="11" />
                <span>恢复到画布</span>
              </button>
              <button
                type="button"
                class="activity-sidebar__chip activity-sidebar__chip--primary"
                aria-label="用这条历史的参数重新生成一次"
                @click.stop="emit('regenerate', item)"
              >
                <Icon name="sparkle" :size="11" />
                <span>重新生成</span>
              </button>
            </div>
          </div>
        </li>
      </template>

      <li v-else-if="!isGenerating" class="activity-sidebar__empty">
        <Icon name="clock" :size="16" class="text-muted" />
        <p class="text-[11px] leading-snug text-muted">
          完成生成后，最近 12 条会出现在这里，单击展开可预览、复制或重新生成。
        </p>
      </li>
    </ol>

    <footer v-if="history.length > recent.length" class="activity-sidebar__foot">
      <button
        type="button"
        class="btn-secondary w-full justify-center text-[12px]"
        @click="emit('open-history')"
      >
        <Icon name="history" :size="13" />
        查看全部 {{ history.length }} 条
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.activity-sidebar {
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  max-height: calc(100dvh - 8.25rem);
  overflow-y: auto;
  border: 1px solid rgb(var(--color-line) / 0.4);
  border-radius: var(--radius-card);
  background: var(--gradient-surface);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  box-shadow: var(--shadow-glass), var(--shadow-inner-glass);
  padding: 1.1rem 1rem;
  scrollbar-gutter: stable;
}

.activity-sidebar::-webkit-scrollbar {
  width: 6px;
}

.activity-sidebar::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgb(var(--color-line-strong) / 0.55);
}

.activity-sidebar__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;
}

.activity-sidebar__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.activity-sidebar__live {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.7rem 0.85rem;
  margin-bottom: 0.45rem;
  border-radius: var(--radius-panel);
  border: 1px solid rgb(var(--color-accent) / 0.3);
  background:
    linear-gradient(135deg, rgb(var(--color-accent) / 0.12), rgb(var(--color-blueprint) / 0.08));
  backdrop-filter: blur(10px) saturate(1.4);
  -webkit-backdrop-filter: blur(10px) saturate(1.4);
  box-shadow: var(--shadow-inner-glass);
  color: rgb(var(--color-ink));
}

.activity-sidebar__live-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--gradient-primary);
  flex-shrink: 0;
  animation: activity-pulse 1.4s ease-in-out infinite;
}

.activity-sidebar__item {
  position: relative;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: stretch;
  gap: 0.45rem;
  padding-bottom: 0.4rem;
}

.activity-sidebar__cell {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}

.activity-sidebar__rail {
  position: relative;
  display: block;
  height: 100%;
}

.activity-sidebar__rail::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgb(var(--color-line) / 0.7);
  transform: translateX(-50%);
}

.activity-sidebar__item:first-child .activity-sidebar__rail::before {
  top: 18px;
}

.activity-sidebar__item:last-child .activity-sidebar__rail::before {
  bottom: 50%;
}

.activity-sidebar__node {
  position: absolute;
  top: 18px;
  left: 50%;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: rgb(var(--color-ivory) / 0.8);
  border: 1px solid rgb(var(--color-line-strong) / 0.7);
  transform: translate(-50%, -50%);
  transition: background-color 160ms ease, border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}

.activity-sidebar__item--active .activity-sidebar__node {
  background: var(--gradient-primary);
  border-color: rgb(var(--color-accent) / 0.5);
  box-shadow: var(--shadow-glow-accent);
  transform: translate(-50%, -50%) scale(1.18);
}

.activity-sidebar__card {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.65rem;
  border-radius: var(--radius-panel);
  border: 1px solid rgb(var(--color-line) / 0.35);
  background: rgb(var(--color-ivory) / 0.35);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  color: rgb(var(--color-ink));
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, transform 160ms var(--motion-press), box-shadow 180ms ease;
  text-align: left;
  width: 100%;
}

.activity-sidebar__card:hover {
  transform: translateY(-1px);
  border-color: rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-ivory) / 0.6);
  box-shadow: var(--shadow-glass-sm), var(--shadow-inner-glass);
}

.activity-sidebar__item--active .activity-sidebar__card {
  border-color: rgb(var(--color-accent) / 0.45);
  background: rgb(var(--color-ivory) / 0.7);
  box-shadow: var(--shadow-glow-accent), var(--shadow-inner-glass);
}

.activity-sidebar__thumb {
  position: relative;
  display: block;
  width: 56px;
  height: 56px;
  overflow: hidden;
  border-radius: var(--radius-field);
  border: 1px solid rgb(var(--color-line) / 0.5);
  background: rgb(var(--color-ivory) / 0.4);
  box-shadow: var(--shadow-inner-glass);
}

.activity-sidebar__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.activity-sidebar__thumb-fallback {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: rgb(var(--color-muted));
}

.activity-sidebar__thumb-count {
  position: absolute;
  bottom: 3px;
  right: 3px;
  padding: 0.05rem 0.32rem;
  border-radius: 5px;
  background: rgb(var(--color-ink) / 0.55);
  color: rgb(var(--color-paper));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  letter-spacing: 0.04em;
  backdrop-filter: blur(8px) saturate(1.4);
  -webkit-backdrop-filter: blur(8px) saturate(1.4);
}

.activity-sidebar__empty {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.85rem;
  border-radius: var(--radius-panel);
  border: 1px dashed rgb(var(--color-line) / 0.7);
  background: rgb(var(--color-ivory) / 0.3);
  backdrop-filter: blur(8px) saturate(1.3);
  -webkit-backdrop-filter: blur(8px) saturate(1.3);
}

.activity-sidebar__foot {
  margin-top: 0.5rem;
}

.activity-sidebar__chevron {
  color: rgb(var(--color-muted));
  transition: transform 180ms var(--motion-soft), color 160ms ease;
  flex-shrink: 0;
}

.activity-sidebar__item--expanded .activity-sidebar__chevron {
  transform: rotate(180deg);
  color: rgb(var(--color-ink));
}

.activity-sidebar__item--expanded .activity-sidebar__card {
  border-color: rgb(var(--color-line-strong) / 0.5);
  background: rgb(var(--color-ivory) / 0.7);
  box-shadow: var(--shadow-glass-sm), var(--shadow-inner-glass);
}

.activity-sidebar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 0.55rem 0.6rem 0.6rem;
  border-radius: var(--radius-panel);
  border: 1px solid rgb(var(--color-line) / 0.4);
  border-top: 1px dashed rgb(var(--color-line) / 0.6);
  background: rgb(var(--color-ivory) / 0.4);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  box-shadow: var(--shadow-inner-glass);
  animation: activity-actions-in 220ms var(--motion-soft);
}

.activity-sidebar__chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 9px;
  border-radius: 6px;
  border: 1px solid rgb(var(--color-line) / 0.5);
  background: rgb(var(--color-ivory) / 0.5);
  color: rgb(var(--color-ink));
  font-size: 10.5px;
  font-weight: 500;
  cursor: pointer;
  backdrop-filter: blur(8px) saturate(1.4);
  -webkit-backdrop-filter: blur(8px) saturate(1.4);
  box-shadow: var(--shadow-inner-glass);
  transition:
    background-color 140ms var(--motion-soft),
    border-color 140ms var(--motion-soft),
    color 140ms var(--motion-soft),
    box-shadow 140ms var(--motion-soft),
    transform 140ms var(--motion-press);
  -webkit-tap-highlight-color: transparent;
}

.activity-sidebar__chip::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: inherit;
}

.activity-sidebar__chip:hover {
  background: rgb(var(--color-ivory) / 0.7);
  border-color: rgb(var(--color-line-strong) / 0.6);
  box-shadow: var(--shadow-glass-sm);
}

.activity-sidebar__chip:active {
  transform: scale(0.96);
}

.activity-sidebar__chip--primary {
  margin-left: auto;
  background: var(--gradient-primary);
  border: none;
  color: #fff;
  box-shadow: var(--shadow-glow-accent);
}

.activity-sidebar__chip--primary:hover {
  background: var(--gradient-primary);
  box-shadow: var(--shadow-glow-accent), var(--shadow-glass-sm);
}

@keyframes activity-actions-in {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.activity-sidebar__prompt {
  display: block;
  margin-top: 4px;
  max-height: calc(1.5em * 3);
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: rgb(var(--color-ink) / 0.85);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
 