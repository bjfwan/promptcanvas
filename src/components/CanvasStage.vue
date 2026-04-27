<script setup lang="ts">
import { computed, ref } from 'vue'
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
  modelLabel?: string
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
const revealedImageKeys = ref<Record<string, boolean>>({})

const orient = computed<'portrait' | 'landscape' | 'square'>(() => {
  if (props.size === '1024x1536') return 'portrait'
  if (props.size === '1536x1024') return 'landscape'
  return 'square'
})

const elapsedLabel = computed(() => `${props.elapsedSeconds.toString().padStart(2, '0')}s`)

function imageSource(image: GeneratedImage) {
  return resolveImageSource(image)
}

function imageStateKey(image: GeneratedImage, index: number) {
  return `${image.id || index}:${imageSource(image)}`
}

function markImageReady(image: GeneratedImage, index: number) {
  revealedImageKeys.value[imageStateKey(image, index)] = true
}

function isImageReady(image: GeneratedImage, index: number) {
  return !!revealedImageKeys.value[imageStateKey(image, index)]
}
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

    <div
      v-if="isGenerating"
      class="canvas-frame canvas-scan canvas-grid surface-2 bg-paper-soft"
      :data-orient="orient"
      role="status"
      aria-live="polite"
    >
      <div class="absolute inset-0 grid grid-rows-[auto_1fr_auto] p-5 sm:p-6">
        <div class="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          <span class="inline-flex items-center gap-1.5">
            <Icon name="sparkle" :size="11" class="animate-breathe" />
            composing
          </span>
          <span class="tabular-nums">{{ elapsedLabel }}</span>
        </div>

        <div class="grid place-items-center">
          <div class="relative grid h-24 w-24 place-items-center sm:h-28 sm:w-28">
            <span class="halo-pulse absolute inset-0 rounded-full border border-line-strong/35" aria-hidden="true"></span>
            <span
              class="halo-pulse absolute inset-3 rounded-full border border-line/60"
              style="animation-delay: 0.6s"
              aria-hidden="true"
            ></span>
            <span
              class="halo-pulse absolute inset-6 rounded-full border border-line/40"
              style="animation-delay: 1.2s"
              aria-hidden="true"
            ></span>
            <Icon name="sparkle" :size="18" class="text-ink/65" />
          </div>
          <div class="mt-5 flex items-center gap-1.5" aria-hidden="true">
            <span class="ink-dot"></span>
            <span class="ink-dot"></span>
            <span class="ink-dot"></span>
          </div>
        </div>

        <div class="space-y-2.5">
          <p class="font-display text-[15px] italic leading-snug tracking-tightish text-ink/85 truncate-2 sm:text-base">
            {{ promptPreview || 'untitled draft' }}
          </p>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            <span>{{ size }}</span>
            <span class="text-line">·</span>
            <span>{{ styleLabel }}</span>
            <template v-if="modelLabel">
              <span class="text-line">·</span>
              <span class="truncate normal-case tracking-normal">{{ modelLabel }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="activeImage" class="space-y-5">
      <div class="canvas-frame surface-2 group bg-paper-soft" :data-orient="orient">
        <button
          type="button"
          class="absolute inset-0 grid place-items-center p-3 transition focus-visible:outline-none sm:p-5"
          aria-label="放大查看图片"
          @click="emit('open-lightbox', activeImageIndex)"
        >
          <div
            v-if="!isImageReady(activeImage, activeImageIndex)"
            class="canvas-image-placeholder absolute inset-0"
            aria-hidden="true"
          >
            <div class="canvas-image-placeholder__glow"></div>
            <div class="canvas-image-placeholder__loader">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
          <img
            :src="activeSrc"
            alt="生成图片"
            loading="eager"
            fetchpriority="high"
            decoding="async"
            class="max-h-full max-w-full rounded-xl object-contain shadow-paper-1 transition duration-500 will-change-transform group-hover:scale-[1.01]"
            :class="isImageReady(activeImage, activeImageIndex) ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.01]'"
            @load="markImageReady(activeImage, activeImageIndex)"
            @error="markImageReady(activeImage, activeImageIndex)"
          />
        </button>

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
            :src="imageSource(image)"
            alt=""
            :loading="Math.abs(activeImageIndex - index) <= 1 ? 'eager' : 'lazy'"
            :fetchpriority="activeImageIndex === index ? 'high' : 'auto'"
            decoding="async"
            class="aspect-square w-16 rounded-md object-cover sm:w-20"
            @load="markImageReady(image, index)"
            @error="markImageReady(image, index)"
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

    <div
      v-else
      class="canvas-frame surface-1 border-dashed bg-cream/60"
      :data-orient="orient"
    >
      <div class="absolute inset-0 grid place-items-center text-center">
        <div class="max-w-md px-6">
          <div
            class="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full border border-line-strong/60 bg-vellum text-ink shadow-inner-paper"
            aria-hidden="true"
          >
            <Icon name="frame" :size="20" />
          </div>
          <p class="font-display text-2xl italic tracking-tightish text-ink/85 sm:text-3xl">an empty canvas</p>
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
    </div>
  </section>
</template>

<style scoped>
.canvas-image-placeholder {
  display: grid;
  place-items: center;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(253, 248, 237, 0.94), rgba(241, 233, 220, 0.62));
}

.canvas-image-placeholder__glow {
  position: absolute;
  width: min(44%, 220px);
  height: min(44%, 220px);
  border-radius: 999px;
  background: radial-gradient(circle, rgba(253, 248, 237, 0.96), rgba(253, 248, 237, 0) 70%);
  filter: blur(8px);
}

.canvas-image-placeholder__loader {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0.7rem 0.95rem;
  border-radius: 999px;
  background: rgba(253, 248, 237, 0.88);
  box-shadow: 0 24px 40px -30px rgba(26, 22, 18, 0.5);
}

.canvas-image-placeholder__loader span {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(26, 22, 18, 0.58);
  animation: canvas-image-loader 1.15s ease-in-out infinite;
}

.canvas-image-placeholder__loader span:nth-child(2) {
  animation-delay: 0.14s;
}

.canvas-image-placeholder__loader span:nth-child(3) {
  animation-delay: 0.28s;
}

@keyframes canvas-image-loader {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }

  50% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .canvas-image-placeholder__loader span,
  .canvas-frame img {
    animation: none;
    transition: none;
  }
}
</style>
