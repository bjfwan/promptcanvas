<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import { resolveImageSource } from '../api'
import type { GeneratedImage, ImageSize } from '../types'

interface Props {
  images: GeneratedImage[]
  activeImageIndex: number
  isGenerating: boolean
  elapsedSeconds: number
  errorMessage: string
  lastRequestId: string
  size: ImageSize
  styleLabel: string
  promptPreview: string
  hasPrompt: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'select', index: number): void
  (e: 'open-lightbox', index: number): void
  (e: 'download', image: GeneratedImage, index: number): void
  (e: 'open', image: GeneratedImage): void
  (e: 'copy', text: string, message: string): void
  (e: 'export'): void
  (e: 'go-compose'): void
  (e: 'generate'): void
}>()

const activeImage = computed(() => props.images[props.activeImageIndex])
const activeSrc = computed(() => (activeImage.value ? resolveImageSource(activeImage.value) : ''))

const previewFrameClass = computed(() => {
  if (props.size === '1024x1536') return 'aspect-[2/3]'
  if (props.size === '1536x1024') return 'aspect-[3/2]'
  return 'aspect-square'
})

const elapsedLabel = computed(() => `${props.elapsedSeconds.toString().padStart(2, '0')}s`)

const skeletonRow = computed(() => Array.from({ length: Math.max(1, Math.min(props.images.length || 1, 4)) }))
</script>

<template>
  <section class="space-y-5">
    <header class="flex items-end justify-between gap-4">
      <div class="space-y-2">
        <p class="display-eyebrow">02 · Canvas</p>
        <h2 class="display-h2">画布</h2>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-1.5">
        <span class="chip">{{ styleLabel }}</span>
        <span class="chip font-mono">{{ size }}</span>
        <span
          v-if="lastRequestId"
          class="chip cursor-pointer font-mono normal-case tracking-normal hover:border-line-strong"
          :title="`点击复制完整 request id: ${lastRequestId}`"
          @click="emit('copy', lastRequestId, '已复制 request id')"
        >
          {{ lastRequestId.slice(0, 12) }}…
        </span>
      </div>
    </header>

    <div
      v-if="errorMessage"
      class="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/[0.06] px-4 py-3 text-[13px] leading-6 text-accent"
      role="alert"
    >
      <Icon name="warning" :size="16" class="mt-0.5" />
      <span>{{ errorMessage }}</span>
    </div>

    <!-- Generating skeleton -->
    <div
      v-if="isGenerating"
      class="space-y-4"
      role="status"
      aria-live="polite"
    >
      <div class="surface-2 relative overflow-hidden p-3 sm:p-4" :class="previewFrameClass">
        <div class="skeleton h-full w-full rounded-xl"></div>
        <div
          class="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between text-[10px] uppercase tracking-[0.22em] text-muted sm:inset-x-4 sm:top-4"
        >
          <span class="font-mono">composing</span>
          <span class="font-mono tabular-nums">{{ elapsedLabel }}</span>
        </div>
        <div class="absolute inset-x-0 bottom-4 grid place-items-center text-center">
          <p class="font-display text-xl italic tracking-tightish text-ink">{{ promptPreview || 'untitled draft' }}</p>
          <p class="mt-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">{{ size }} · {{ styleLabel }}</p>
        </div>
      </div>

      <div v-if="skeletonRow.length > 1" class="grid grid-cols-4 gap-2">
        <div v-for="(_, idx) in skeletonRow" :key="idx" class="skeleton aspect-square rounded-lg"></div>
      </div>
    </div>

    <!-- Result -->
    <div v-else-if="activeImage" class="space-y-5">
      <div class="surface-2 group relative overflow-hidden">
        <button
          type="button"
          class="block w-full text-left transition focus-visible:outline-none"
          aria-label="放大查看图片"
          @click="emit('open-lightbox', activeImageIndex)"
        >
          <div class="grid place-items-center bg-paper-soft p-3 sm:p-5" :class="previewFrameClass">
            <img
              :src="activeSrc"
              alt="生成图片"
              loading="lazy"
              decoding="async"
              class="h-full max-h-[72vh] w-full rounded-lg object-contain shadow-paper-1 transition duration-500 group-hover:scale-[1.01]"
            />
          </div>
        </button>

        <!-- Hover toolbar (desktop) -->
        <div
          class="pointer-events-none absolute right-3 top-3 hidden translate-y-1 gap-1.5 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 sm:flex"
        >
          <button
            type="button"
            class="pointer-events-auto inline-grid h-9 w-9 place-items-center rounded-full border border-line bg-vellum/95 text-ink shadow-paper-2 backdrop-blur transition hover:bg-paper"
            aria-label="放大"
            @click.stop="emit('open-lightbox', activeImageIndex)"
          >
            <Icon name="zoomIn" :size="14" />
          </button>
          <button
            type="button"
            class="pointer-events-auto inline-grid h-9 w-9 place-items-center rounded-full border border-line bg-vellum/95 text-ink shadow-paper-2 backdrop-blur transition hover:bg-paper"
            aria-label="新窗口打开"
            @click.stop="emit('open', activeImage)"
          >
            <Icon name="link" :size="14" />
          </button>
          <button
            type="button"
            class="pointer-events-auto inline-grid h-9 w-9 place-items-center rounded-full border border-line bg-vellum/95 text-ink shadow-paper-2 backdrop-blur transition hover:bg-paper"
            aria-label="下载"
            @click.stop="emit('download', activeImage, activeImageIndex)"
          >
            <Icon name="download" :size="14" />
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" class="result-button" @click="emit('download', activeImage, activeImageIndex)">
          <Icon name="download" :size="14" />
          下载
        </button>
        <button type="button" class="result-button" @click="emit('open-lightbox', activeImageIndex)">
          <Icon name="zoomIn" :size="14" />
          放大
        </button>
        <button
          type="button"
          class="result-button"
          @click="emit('copy', activeImage.revisedPrompt || promptPreview, '已复制提示词')"
        >
          <Icon name="copy" :size="14" />
          复制提示词
        </button>
        <button type="button" class="result-button" @click="emit('export')">
          <Icon name="share" :size="14" />
          导出参数
        </button>
      </div>

      <div
        v-if="images.length > 1"
        class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [&::-webkit-scrollbar]:h-1.5"
        aria-label="图片缩略图"
        role="listbox"
      >
        <button
          v-for="(image, index) in images"
          :key="image.id || index"
          type="button"
          class="shrink-0 overflow-hidden rounded-xl border bg-cream p-1 transition"
          :class="
            activeImageIndex === index
              ? 'border-ink shadow-paper-2'
              : 'border-line hover:border-line-strong'
          "
          :aria-selected="activeImageIndex === index"
          role="option"
          @click="emit('select', index)"
        >
          <img
            :src="resolveImageSource(image)"
            alt=""
            loading="lazy"
            decoding="async"
            class="aspect-square w-16 rounded-md object-cover sm:w-20"
          />
        </button>
      </div>

      <div
        v-if="activeImage.revisedPrompt"
        class="surface-1 p-4 reveal"
      >
        <div class="mb-2 flex items-center justify-between">
          <p class="display-eyebrow">Revised prompt</p>
          <button
            type="button"
            class="font-mono text-[10px] uppercase tracking-[0.18em] text-muted transition hover:text-ink"
            @click="emit('copy', activeImage.revisedPrompt!, '已复制提示词')"
          >
            复制
          </button>
        </div>
        <p class="text-[13px] leading-6 text-ink/80">{{ activeImage.revisedPrompt }}</p>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="surface-1 grid place-items-center border-dashed bg-cream/60 py-16 text-center sm:py-24"
    >
      <div class="max-w-md px-6">
        <div
          class="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full border border-line-strong/60 bg-vellum text-ink shadow-inner-paper"
          aria-hidden="true"
        >
          <Icon name="frame" :size="20" />
        </div>
        <p class="font-display text-3xl italic tracking-tightish text-ink/85">an empty canvas</p>
        <p class="mt-3 text-[13px] leading-6 text-muted">
          写下提示词，或者从右侧"模板"里选一个起点，然后点击 Generate。
        </p>

        <div class="mt-6 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center">
          <button
            v-if="hasPrompt"
            type="button"
            class="btn-primary px-5"
            @click="emit('generate')"
          >
            <Icon name="lightning" :size="14" />
            <span>立即生成</span>
          </button>
          <button
            v-else
            type="button"
            class="btn-ghost px-4 lg:hidden"
            @click="emit('go-compose')"
          >
            <Icon name="textCursor" :size="14" />
            去写提示词
            <Icon name="arrowRight" :size="14" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
