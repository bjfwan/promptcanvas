<script setup lang="ts">
import { computed } from 'vue'
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
}>()

const recent = computed(() => props.history.slice(0, 6))

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
          :class="{ 'activity-sidebar__item--active': selectedRequestId && selectedRequestId === item.requestId }"
        >
          <span class="activity-sidebar__rail" aria-hidden="true">
            <span class="activity-sidebar__node" :data-index="index"></span>
          </span>

          <button
            type="button"
            class="activity-sidebar__card"
            :aria-label="`恢复历史：${item.prompt.slice(0, 40)}`"
            @click="emit('restore', item)"
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
              </span>
              <span class="mt-1 block truncate-2 text-[12px] leading-[1.5] text-ink/85">{{ item.prompt }}</span>
            </span>
          </button>
        </li>
      </template>

      <li v-else-if="!isGenerating" class="activity-sidebar__empty">
        <Icon name="clock" :size="16" class="text-muted" />
        <p class="text-[11px] leading-snug text-muted">
          完成生成后，最近 12 条会出现在这里，点击即可一键恢复参数。
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
  border: 1px solid rgb(var(--color-line) / 0.85);
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgb(var(--color-ivory) / 0.7), rgb(var(--color-vellum) / 0.46)),
    rgb(var(--color-vellum) / 0.6);
  box-shadow: var(--shadow-paper-2), var(--shadow-inner-paper);
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
  border-radius: 16px;
  border: 1px solid rgb(var(--color-forest) / 0.34);
  background:
    linear-gradient(135deg, rgb(var(--color-forest) / 0.12), rgb(var(--color-ochre) / 0.08));
  color: rgb(var(--color-ink));
}

.activity-sidebar__live-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: rgb(var(--color-forest));
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
  background: rgb(var(--color-vellum));
  border: 1px solid rgb(var(--color-line-strong));
  transform: translate(-50%, -50%);
  transition: background-color 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.activity-sidebar__item--active .activity-sidebar__node {
  background: rgb(var(--color-ink));
  border-color: rgb(var(--color-ink));
  transform: translate(-50%, -50%) scale(1.18);
}

.activity-sidebar__card {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.65rem;
  border-radius: 14px;
  border: 1px solid transparent;
  background: rgb(var(--color-ivory) / 0.4);
  color: rgb(var(--color-ink));
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, transform 160ms var(--motion-press), box-shadow 180ms ease;
  text-align: left;
  width: 100%;
}

.activity-sidebar__card:hover {
  transform: translateY(-1px);
  border-color: rgb(var(--color-line));
  background: rgb(var(--color-ivory) / 0.7);
  box-shadow: var(--shadow-paper-1);
}

.activity-sidebar__item--active .activity-sidebar__card {
  border-color: rgb(var(--color-ink));
  background: rgb(var(--color-vellum));
  box-shadow: var(--shadow-paper-1);
}

.activity-sidebar__thumb {
  position: relative;
  display: block;
  width: 56px;
  height: 56px;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-paper-soft));
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
  border-radius: 999px;
  background: rgb(var(--color-ink) / 0.78);
  color: rgb(var(--color-paper));
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  letter-spacing: 0.04em;
}

.activity-sidebar__empty {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.85rem;
  border-radius: 14px;
  border: 1px dashed rgb(var(--color-line));
  background: rgb(var(--color-cream) / 0.34);
}

.activity-sidebar__foot {
  margin-top: 0.5rem;
}

@keyframes activity-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgb(var(--color-forest) / 0.5);
    transform: scale(0.9);
  }
  50% {
    box-shadow: 0 0 0 5px rgb(var(--color-forest) / 0);
    transform: scale(1.05);
  }
}

@media (prefers-reduced-motion: reduce) {
  .activity-sidebar__live-dot,
  .activity-sidebar__card {
    animation: none;
    transition: none;
  }
}
</style>
