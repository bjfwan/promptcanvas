<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useLightbox } from '../composables/useLightbox'
import { resolveImageSource } from '../api'
import Icon from './Icon.vue'

const lightbox = useLightbox()
const zoom = ref(false)
const touchStartX = ref<number | null>(null)

const activeImage = computed(() => lightbox.state.images[lightbox.state.index])
const activeSrc = computed(() => (activeImage.value ? resolveImageSource(activeImage.value) : ''))
const counter = computed(() =>
  lightbox.state.images.length > 1 ? `${lightbox.state.index + 1} / ${lightbox.state.images.length}` : '',
)

function handleKey(event: KeyboardEvent) {
  if (!lightbox.state.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    lightbox.close()
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    lightbox.next()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    lightbox.prev()
  } else if (event.key === ' ') {
    event.preventDefault()
    zoom.value = !zoom.value
  }
}

watch(
  () => lightbox.state.open,
  (isOpen) => {
    if (typeof document === 'undefined') return

    document.body.style.overflow = isOpen ? 'hidden' : ''
    if (isOpen) {
      window.addEventListener('keydown', handleKey)
      zoom.value = false
    } else {
      window.removeEventListener('keydown', handleKey)
    }
  },
  { immediate: true },
)

watch(() => lightbox.state.index, () => {
  zoom.value = false
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKey)
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
  }
})

function startTouch(event: TouchEvent) {
  touchStartX.value = event.touches[0]?.clientX ?? null
}

function endTouch(event: TouchEvent) {
  if (touchStartX.value === null) return
  const endX = event.changedTouches[0]?.clientX ?? touchStartX.value
  const delta = endX - touchStartX.value
  touchStartX.value = null
  if (Math.abs(delta) < 60) return
  if (delta < 0) lightbox.next()
  else lightbox.prev()
}

async function copyPrompt() {
  if (!activeImage.value?.revisedPrompt) return
  try {
    await navigator.clipboard.writeText(activeImage.value.revisedPrompt)
  } catch {
    /* swallow */
  }
}

async function downloadCurrent() {
  if (!activeImage.value || !activeSrc.value) return
  const ext = activeImage.value.mimeType?.split('/')[1] || 'png'
  const filename = `promptcanvas-${Date.now()}.${ext}`

  try {
    const response = await fetch(activeSrc.value)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    const anchor = document.createElement('a')
    anchor.href = activeSrc.value
    anchor.download = filename
    anchor.target = '_blank'
    anchor.click()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="lb-fade">
      <div
        v-if="lightbox.state.open"
        class="fixed inset-0 z-lightbox flex flex-col bg-ink/90 text-paper backdrop-blur"
        role="dialog"
        aria-modal="true"
        aria-label="图片详情"
        @click="lightbox.close"
      >
        <header class="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top,0px),1rem)]" @click.stop>
          <div class="flex items-center gap-2 text-paper/85">
            <span class="grid h-7 w-7 place-items-center rounded-full border border-paper/25 font-display text-sm">P</span>
            <span class="font-mono text-[10px] uppercase tracking-[0.24em]">{{ counter || 'Canvas · 1' }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="grid h-10 w-10 place-items-center rounded-full border border-paper/20 text-paper transition hover:bg-paper/10"
              :aria-pressed="zoom"
              aria-label="切换缩放"
              @click="zoom = !zoom"
            >
              <Icon :name="zoom ? 'shrink' : 'expand'" :size="16" />
            </button>
            <button
              type="button"
              class="grid h-10 w-10 place-items-center rounded-full border border-paper/20 text-paper transition hover:bg-paper/10"
              aria-label="下载图片"
              @click="downloadCurrent"
            >
              <Icon name="download" :size="16" />
            </button>
            <button
              type="button"
              class="grid h-10 w-10 place-items-center rounded-full border border-paper/20 text-paper transition hover:bg-paper/10"
              aria-label="关闭详情"
              @click="lightbox.close"
            >
              <Icon name="close" :size="16" />
            </button>
          </div>
        </header>

        <div
          class="relative flex-1 select-none overflow-hidden"
          @click.stop
          @touchstart="startTouch"
          @touchend="endTouch"
        >
          <Transition name="lb-zoom">
            <img
              v-if="activeSrc"
              :key="lightbox.state.index"
              :src="activeSrc"
              alt="生成图片详情"
              loading="eager"
              decoding="async"
              class="absolute inset-0 m-auto max-h-full max-w-full object-contain p-3 transition duration-300 sm:p-8"
              :class="zoom ? 'scale-150 cursor-zoom-out' : 'scale-100 cursor-zoom-in'"
              @click="zoom = !zoom"
            />
          </Transition>

          <button
            v-if="lightbox.state.images.length > 1"
            type="button"
            class="absolute left-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-paper/20 bg-ink/40 text-paper transition hover:bg-paper/15"
            aria-label="上一张"
            @click="lightbox.prev"
          >
            <Icon name="arrowLeft" :size="18" />
          </button>
          <button
            v-if="lightbox.state.images.length > 1"
            type="button"
            class="absolute right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-paper/20 bg-ink/40 text-paper transition hover:bg-paper/15"
            aria-label="下一张"
            @click="lightbox.next"
          >
            <Icon name="arrowRight" :size="18" />
          </button>
        </div>

        <footer class="px-4 pb-[max(env(safe-area-inset-bottom,0px),1rem)] pt-2" @click.stop>
          <div
            v-if="activeImage?.revisedPrompt"
            class="mx-auto max-w-3xl rounded-2xl border border-paper/15 bg-paper/5 px-4 py-3 text-[12px] leading-5 text-paper/75 backdrop-blur"
          >
            <div class="mb-1 flex items-center justify-between">
              <p class="font-mono text-[10px] uppercase tracking-[0.24em] text-paper/55">Revised prompt</p>
              <button
                type="button"
                class="font-mono text-[10px] uppercase tracking-[0.18em] text-paper/65 transition hover:text-paper"
                @click="copyPrompt"
              >
                复制
              </button>
            </div>
            <p class="truncate-2">{{ activeImage.revisedPrompt }}</p>
          </div>
          <p
            v-if="lightbox.state.images.length > 1"
            class="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-paper/55"
          >
            ← →&nbsp;切换 · Space 缩放 · Esc 关闭
          </p>
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lb-fade-enter-from,
.lb-fade-leave-to {
  opacity: 0;
}
.lb-fade-enter-active,
.lb-fade-leave-active {
  transition: opacity 0.24s ease-out;
}

.lb-zoom-enter-from {
  opacity: 0;
  transform: scale(0.96);
}
.lb-zoom-leave-to {
  opacity: 0;
  transform: scale(1.04);
}
.lb-zoom-enter-active,
.lb-zoom-leave-active {
  transition: opacity 0.32s ease-out, transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}
</style>
