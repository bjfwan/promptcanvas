<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ApiRequestError, checkHealth, generateImage, resolveImageSource } from './api'
import { promptTemplates, qualityOptions, sizeOptions, styleOptions } from './presets'
import { clearDraft, clearHistory, loadDraft, loadHistory, prependHistory, saveDraft } from './storage'
import type { GeneratedImage, GenerateImageRequest, GenerationHistoryItem, ImageQuality, ImageSize, ImageStyle, PromptTemplate } from './types'

const defaultPrompt = '一只穿着复古宇航服的橘猫，站在月球摄影棚里，像 1970 年代科幻电影海报'
const defaultNegativePrompt = '低清晰度、模糊、水印、错误文字、畸形手指、画面杂乱'

const prompt = ref(defaultPrompt)
const negativePrompt = ref(defaultNegativePrompt)
const style = ref<ImageStyle>('poster')
const size = ref<ImageSize>('1024x1024')
const count = ref(1)
const outputFormat = ref<GenerateImageRequest['outputFormat']>('png')
const quality = ref<ImageQuality>('auto')
const creativity = ref(7)
const seed = ref('')
const images = ref<GeneratedImage[]>([])
const activeImageIndex = ref(0)
const isGenerating = ref(false)
const errorMessage = ref('')
const lastRequestId = ref('')
const elapsedSeconds = ref(0)
const copiedMessage = ref('')
const history = ref<GenerationHistoryItem[]>(loadHistory())
const healthStatus = ref<'checking' | 'online' | 'offline'>('checking')
const healthMessage = ref('正在检查后端连接')
const healthModel = ref('')
const healthRequestId = ref('')

type TabValue = 'compose' | 'result' | 'library'

const tabs: Array<{ value: TabValue; label: string }> = [
  { value: 'compose', label: 'Compose' },
  { value: 'result', label: 'Canvas' },
  { value: 'library', label: 'Library' },
]

const activeTab = ref<TabValue>('compose')

const restoredDraft = loadDraft()

if (restoredDraft) {
  if (typeof restoredDraft.prompt === 'string') prompt.value = restoredDraft.prompt
  if (typeof restoredDraft.negativePrompt === 'string') negativePrompt.value = restoredDraft.negativePrompt
  if (styleOptions.some((option) => option.value === restoredDraft.style)) style.value = restoredDraft.style as ImageStyle
  if (sizeOptions.some((option) => option.value === restoredDraft.size)) size.value = restoredDraft.size as ImageSize
  if (typeof restoredDraft.count === 'number' && Number.isInteger(restoredDraft.count) && restoredDraft.count >= 1 && restoredDraft.count <= 4) count.value = restoredDraft.count
  if (restoredDraft.outputFormat === 'png' || restoredDraft.outputFormat === 'jpeg' || restoredDraft.outputFormat === 'webp') outputFormat.value = restoredDraft.outputFormat
  if (qualityOptions.some((option) => option.value === restoredDraft.quality)) quality.value = restoredDraft.quality as ImageQuality
  if (typeof restoredDraft.creativity === 'number' && restoredDraft.creativity >= 1 && restoredDraft.creativity <= 10) creativity.value = restoredDraft.creativity
  if (typeof restoredDraft.seed === 'string') seed.value = restoredDraft.seed
}

let timerId: number | undefined
let draftSaveTimer: number | undefined

watch(
  [prompt, negativePrompt, style, size, count, outputFormat, quality, creativity, seed],
  () => {
    if (draftSaveTimer) {
      window.clearTimeout(draftSaveTimer)
    }

    draftSaveTimer = window.setTimeout(() => {
      saveDraft({
        prompt: prompt.value,
        negativePrompt: negativePrompt.value,
        style: style.value,
        size: size.value,
        count: count.value,
        outputFormat: outputFormat.value,
        quality: quality.value,
        creativity: creativity.value,
        seed: seed.value,
      })
    }, 400)
  },
)

watch(activeTab, () => {
  if (typeof window !== 'undefined' && window.innerWidth < 1024) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
})

const selectedStyle = computed(() => styleOptions.find((item) => item.value === style.value))
const selectedSize = computed(() => sizeOptions.find((item) => item.value === size.value))
const trimmedPrompt = computed(() => prompt.value.trim())
const canGenerate = computed(() => trimmedPrompt.value.length >= 4 && !isGenerating.value)
const activeImage = computed(() => images.value[activeImageIndex.value])
const activeImageSource = computed(() => activeImage.value ? resolveImageSource(activeImage.value) : '')
const previewFrameClass = computed(() => {
  if (size.value === '1024x1536') {
    return 'aspect-[2/3]'
  }

  if (size.value === '1536x1024') {
    return 'aspect-[3/2]'
  }

  return 'aspect-square'
})

function createId() {
  if ('randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildPayload(): GenerateImageRequest {
  return {
    prompt: trimmedPrompt.value,
    style: style.value,
    size: size.value,
    count: count.value,
    outputFormat: outputFormat.value,
    negativePrompt: negativePrompt.value.trim() || undefined,
    quality: quality.value,
    creativity: creativity.value,
    seed: seed.value.trim() || undefined,
  }
}

async function handleGenerate() {
  if (!canGenerate.value) {
    return
  }

  const payload = buildPayload()
  isGenerating.value = true
  errorMessage.value = ''
  copiedMessage.value = ''
  images.value = []
  activeImageIndex.value = 0
  lastRequestId.value = ''
  elapsedSeconds.value = 0

  timerId = window.setInterval(() => {
    elapsedSeconds.value += 1
  }, 1000)

  try {
    const result = await generateImage(payload)

    images.value = result.images
    lastRequestId.value = result.requestId || ''
    activeTab.value = 'result'
    history.value = prependHistory({
      ...payload,
      id: createId(),
      createdAt: new Date().toISOString(),
      requestId: result.requestId,
      imageCount: result.images.length,
    })
  } catch (error) {
    if (error instanceof ApiRequestError) {
      errorMessage.value = error.requestId ? `${error.message}（请求 ID：${error.requestId}）` : error.message
      lastRequestId.value = error.requestId || ''
    } else {
      errorMessage.value = error instanceof Error ? error.message : '生成失败，请稍后重试。'
    }
  } finally {
    isGenerating.value = false

    if (timerId) {
      window.clearInterval(timerId)
      timerId = undefined
    }
  }
}

async function downloadImage(image: GeneratedImage, index: number) {
  const source = resolveImageSource(image)

  if (!source) {
    errorMessage.value = '这张图片没有可下载地址。'
    return
  }

  const extension = image.mimeType?.split('/')[1] || outputFormat.value
  const filename = `promptcanvas-${Date.now()}-${index + 1}.${extension}`

  try {
    const response = await fetch(source)
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
    anchor.href = source
    anchor.download = filename
    anchor.target = '_blank'
    anchor.click()
  }
}

function applyTemplate(template: PromptTemplate) {
  prompt.value = template.prompt
  style.value = template.style
  size.value = template.size
  errorMessage.value = ''
  activeTab.value = 'compose'
}

function restoreHistory(item: GenerationHistoryItem) {
  prompt.value = item.prompt
  style.value = item.style
  size.value = item.size
  count.value = item.count
  outputFormat.value = item.outputFormat
  negativePrompt.value = item.negativePrompt || ''
  quality.value = item.quality || 'auto'
  creativity.value = item.creativity ?? 7
  seed.value = item.seed || ''
  errorMessage.value = ''
  activeTab.value = 'compose'
}

function resetDraft() {
  clearDraft()
  prompt.value = defaultPrompt
  negativePrompt.value = defaultNegativePrompt
  style.value = 'poster'
  size.value = '1024x1024'
  count.value = 1
  outputFormat.value = 'png'
  quality.value = 'auto'
  creativity.value = 7
  seed.value = ''
  errorMessage.value = ''
}

function clearLocalHistory() {
  clearHistory()
  history.value = []
}

function openImage(image: GeneratedImage) {
  const source = resolveImageSource(image)

  if (!source) {
    errorMessage.value = '这张图片没有可打开地址。'
    return
  }

  window.open(source, '_blank', 'noopener,noreferrer')
}

async function copyToClipboard(text: string, message: string) {
  if (!text.trim()) {
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    copiedMessage.value = message
    window.setTimeout(() => {
      copiedMessage.value = ''
    }, 1800)
  } catch {
    errorMessage.value = '复制失败，请手动复制。'
  }
}

function exportCurrentConfig() {
  const payload = buildPayload()
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = objectUrl
  anchor.download = `promptcanvas-config-${Date.now()}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

async function refreshHealth() {
  healthStatus.value = 'checking'
  healthMessage.value = '正在检查后端连接'

  try {
    const health = await checkHealth()

    healthStatus.value = 'online'
    healthModel.value = health.model || ''
    healthRequestId.value = health.requestId || ''
    healthMessage.value = health.model ? `后端在线 · ${health.model}` : '后端在线'
  } catch (error) {
    healthStatus.value = 'offline'
    healthModel.value = ''

    if (error instanceof ApiRequestError) {
      healthRequestId.value = error.requestId || ''
      healthMessage.value = error.message
      return
    }

    healthRequestId.value = ''
    healthMessage.value = '无法连接后端，请确认服务是否启动。'
  }
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    void handleGenerate()
  }
}

onMounted(() => {
  refreshHealth()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)

  if (timerId) {
    window.clearInterval(timerId)
    timerId = undefined
  }

  if (draftSaveTimer) {
    window.clearTimeout(draftSaveTimer)
    draftSaveTimer = undefined
  }
})
</script>

<template>
  <div class="min-h-dvh bg-paper text-ink">
    <header class="sticky top-0 z-30 border-b border-line/80 bg-paper/85 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div class="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-10 lg:py-4">
        <div class="flex items-center gap-3">
          <span class="grid h-9 w-9 place-items-center rounded-full border border-ink/25 font-display text-base">P</span>
          <div class="leading-tight">
            <p class="font-display text-[17px] tracking-tightish">Prompt<span class="italic text-accent">Canvas</span></p>
            <p class="mt-0.5 hidden text-[10px] uppercase tracking-[0.24em] text-muted sm:block">image studio · v0.1</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] transition sm:py-1.5"
            :class="{
              'border-line text-muted': healthStatus === 'checking',
              'border-line bg-cream text-ink hover:border-ink/40': healthStatus === 'online',
              'border-accent/40 bg-accent/[0.08] text-accent': healthStatus === 'offline',
            }"
            :title="healthMessage"
            :aria-label="`后端状态：${healthStatus === 'checking' ? '检查中' : healthStatus === 'online' ? '在线' : '离线'}。点击重新检查。`"
            @click="refreshHealth"
          >
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="{
                'motion-safe:animate-pulse bg-muted/60': healthStatus === 'checking',
                'bg-ink': healthStatus === 'online',
                'bg-accent': healthStatus === 'offline',
              }"
              aria-hidden="true"
            ></span>
            <span class="hidden sm:inline">{{ healthStatus === 'checking' ? '检查中' : healthStatus === 'online' ? '在线' : '离线' }}</span>
          </button>
          <button type="button" class="rounded-full border border-line bg-cream px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted transition hover:border-ink/30 hover:text-ink sm:py-1.5" aria-label="重置表单为默认值" @click="resetDraft">
            重置
          </button>
        </div>
      </div>

      <nav class="flex items-stretch border-t border-line/60 lg:hidden">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          class="relative flex-1 py-3 text-[11px] font-medium uppercase tracking-[0.22em] transition"
          :class="activeTab === tab.value ? 'text-ink' : 'text-muted'"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
          <span v-if="activeTab === tab.value" class="absolute bottom-0 left-1/2 h-[2px] w-7 -translate-x-1/2 bg-ink"></span>
        </button>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:grid lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)_minmax(280px,320px)] lg:gap-10 lg:px-10 lg:pt-10">
      <section class="space-y-7" :class="{ 'hidden lg:block': activeTab !== 'compose' }">
        <header class="space-y-2">
          <p class="label">01 · Compose</p>
          <h1 class="font-display text-3xl leading-[1.05] tracking-tightish lg:text-[2.5rem]">写下你想看见的<span class="italic">画面</span></h1>
        </header>

        <form class="space-y-6" @submit.prevent="handleGenerate">
          <div v-if="healthStatus === 'offline'" class="rounded-md border border-accent/30 bg-accent/[0.06] px-4 py-3 text-[13px] leading-6 text-accent">
            后端当前不可用。检查连接后再生成图片。
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between">
              <label for="prompt" class="label">提示词</label>
              <button type="button" class="text-[11px] font-medium text-muted transition hover:text-ink" @click="copyToClipboard(prompt, '已复制')">
                {{ copiedMessage || '复制' }}
              </button>
            </div>
            <textarea
              id="prompt"
              v-model="prompt"
              rows="6"
              maxlength="1200"
              class="field-textarea"
              placeholder="一张极简咖啡品牌海报，暖色调，自然光，留白充足"
            ></textarea>
            <p class="mt-1.5 text-right font-mono text-[10px] tabular-nums text-muted">{{ prompt.length }} / 1200</p>
          </div>

          <div>
            <p class="label mb-3">风格</p>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="item in styleOptions"
                :key="item.value"
                type="button"
                class="rounded-md border px-3 py-2.5 text-left transition"
                :class="style === item.value ? 'border-ink bg-ink text-cream' : 'border-line bg-cream text-ink hover:border-ink/40'"
                @click="style = item.value"
              >
                <span class="block text-[13px] font-medium">{{ item.label }}</span>
                <span class="mt-0.5 block text-[11px]" :class="style === item.value ? 'text-cream/65' : 'text-muted'">{{ item.accent }}</span>
              </button>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-3">
            <div>
              <label class="label mb-2">尺寸</label>
              <select v-model="size" class="field-select">
                <option v-for="item in sizeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </div>
            <div>
              <label class="label mb-2">数量</label>
              <select v-model.number="count" class="field-select">
                <option v-for="n in 4" :key="n" :value="n">{{ n }} 张</option>
              </select>
            </div>
            <div>
              <label class="label mb-2">格式</label>
              <select v-model="outputFormat" class="field-select">
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
                <option value="webp">WEBP</option>
              </select>
            </div>
          </div>

          <details class="group border-t border-line pt-5">
            <summary class="flex cursor-pointer list-none items-center justify-between">
              <span class="label">Advanced · 可选</span>
              <span class="text-[11px] text-muted transition group-open:rotate-180">▾</span>
            </summary>
            <div class="mt-4 space-y-4">
              <div>
                <label class="label mb-2">负面提示词</label>
                <textarea v-model="negativePrompt" rows="2" maxlength="400" class="field-textarea" placeholder="不想出现的元素，例如：模糊、水印"></textarea>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="label mb-2">质量</label>
                  <select v-model="quality" class="field-select">
                    <option v-for="item in qualityOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                </div>
                <div>
                  <label class="label mb-2">Seed</label>
                  <input v-model="seed" class="field-input" placeholder="可选" autocomplete="off" spellcheck="false" />
                </div>
              </div>
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <span class="label">创意强度</span>
                  <span class="font-mono text-[11px] tabular-nums text-ink">{{ creativity }} / 10</span>
                </div>
                <input v-model.number="creativity" type="range" min="1" max="10" step="1" class="w-full accent-ink" />
              </div>
            </div>
          </details>

          <div class="sticky bottom-0 -mx-4 border-t border-line/80 bg-paper/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0 lg:backdrop-blur-none">
            <button
              type="submit"
              :disabled="!canGenerate"
              class="flex w-full items-center justify-between rounded-md bg-ink px-5 py-4 text-sm font-medium text-cream transition hover:bg-accent disabled:cursor-not-allowed disabled:bg-ink/40"
              aria-keyshortcuts="Meta+Enter Control+Enter"
            >
              <span class="flex items-center gap-3">
                <span class="font-display text-base italic">{{ isGenerating ? 'Composing' : 'Generate' }}</span>
                <span v-if="isGenerating" class="font-mono text-[11px] tabular-nums text-cream/70">{{ elapsedSeconds }}s</span>
              </span>
              <span class="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-cream/65 sm:inline" aria-hidden="true">⌘ ↵</span>
            </button>
          </div>
        </form>
      </section>

      <section class="mt-10 lg:mt-0" :class="{ 'hidden lg:block': activeTab !== 'result' }">
        <header class="mb-5 flex items-end justify-between gap-4">
          <div class="space-y-2">
            <p class="label">02 · Canvas</p>
            <h2 class="font-display text-3xl leading-[1.05] tracking-tightish lg:text-[2.5rem]">画布</h2>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-1.5">
            <span class="chip">{{ selectedStyle?.label }}</span>
            <span class="chip font-mono">{{ size }}</span>
            <span v-if="lastRequestId" class="chip font-mono normal-case tracking-normal">{{ lastRequestId.slice(0, 12) }}</span>
          </div>
        </header>

        <div v-if="errorMessage" class="mb-5 rounded-md border border-accent/30 bg-accent/[0.06] px-4 py-3 text-[13px] leading-6 text-accent">
          {{ errorMessage }}
        </div>

        <div v-if="isGenerating" class="grid place-items-center rounded-xl border border-line bg-cream py-24 text-center" role="status" aria-live="polite">
          <div>
            <div class="mx-auto mb-6 h-px w-14 motion-safe:animate-pulse bg-ink" aria-hidden="true"></div>
            <p class="font-display text-2xl italic tracking-tightish">composing</p>
            <p class="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">{{ elapsedSeconds }}s elapsed</p>
          </div>
        </div>

        <div v-else-if="activeImage" class="space-y-5">
          <div class="overflow-hidden rounded-xl border border-line bg-cream">
            <div class="grid place-items-center bg-paper p-3 sm:p-5" :class="previewFrameClass">
              <img :src="activeImageSource" alt="生成图片" loading="lazy" decoding="async" class="h-full max-h-[70vh] w-full object-contain" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" class="result-button" @click="downloadImage(activeImage, activeImageIndex)">下载</button>
            <button type="button" class="result-button" @click="openImage(activeImage)">打开</button>
            <button type="button" class="result-button" @click="copyToClipboard(activeImage.revisedPrompt || prompt, '已复制')">复制提示词</button>
            <button type="button" class="result-button" @click="exportCurrentConfig">导出 JSON</button>
          </div>

          <div v-if="images.length > 1" class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            <button
              v-for="(image, index) in images"
              :key="image.id || index"
              type="button"
              class="shrink-0 overflow-hidden rounded-md border bg-cream p-1 transition"
              :class="activeImageIndex === index ? 'border-ink' : 'border-line hover:border-ink/40'"
              @click="activeImageIndex = index"
            >
              <img :src="resolveImageSource(image)" alt="" loading="lazy" decoding="async" class="aspect-square w-16 rounded-sm object-cover sm:w-20" />
            </button>
          </div>

          <div v-if="activeImage.revisedPrompt" class="rounded-md border border-line bg-cream/60 p-4">
            <p class="label mb-2">Revised prompt</p>
            <p class="text-[13px] leading-6 text-ink/75">{{ activeImage.revisedPrompt }}</p>
          </div>
        </div>

        <div v-else class="grid place-items-center rounded-xl border border-dashed border-line bg-cream/40 py-20 text-center sm:py-24">
          <div class="max-w-sm px-6">
            <p class="font-display text-3xl italic tracking-tightish text-muted">an empty canvas</p>
            <p class="mt-3 text-[13px] leading-6 text-muted">写下提示词，或者从库里选一个模板，然后点击 Generate。</p>
            <button type="button" class="mt-6 inline-flex items-center gap-2 rounded-md border border-line bg-cream px-4 py-2.5 text-[13px] font-medium text-ink transition hover:border-ink/40 lg:hidden" @click="activeTab = 'compose'">
              去写提示词 <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>

      <aside class="mt-10 space-y-8 lg:mt-0" :class="{ 'hidden lg:block': activeTab !== 'library' }">
        <section>
          <header class="mb-4 space-y-2">
            <p class="label">03 · Templates</p>
            <h3 class="font-display text-2xl tracking-tightish">提示词模板</h3>
          </header>
          <div class="space-y-2">
            <button
              v-for="template in promptTemplates"
              :key="template.id"
              type="button"
              class="block w-full rounded-md border border-line bg-cream/60 p-3.5 text-left transition hover:border-ink/40 hover:bg-cream"
              @click="applyTemplate(template)"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="text-[13px] font-medium text-ink">{{ template.title }}</span>
                <span class="font-mono text-[10px] uppercase tracking-wider text-muted">{{ template.style }}</span>
              </div>
              <p class="mt-1 text-[11px] text-muted">{{ template.tone }}</p>
              <p class="mt-2 line-clamp-2 text-[12px] leading-5 text-ink/70">{{ template.prompt }}</p>
            </button>
          </div>
        </section>

        <section>
          <header class="mb-4 flex items-end justify-between">
            <div class="space-y-2">
              <p class="label">04 · History</p>
              <h3 class="font-display text-2xl tracking-tightish">最近生成</h3>
            </div>
            <button v-if="history.length" type="button" class="text-[11px] font-medium text-muted transition hover:text-accent" @click="clearLocalHistory">
              清空
            </button>
          </header>

          <div v-if="history.length" class="space-y-2">
            <button
              v-for="item in history"
              :key="item.id"
              type="button"
              class="block w-full rounded-md border border-line bg-cream/60 p-3.5 text-left transition hover:border-ink/40 hover:bg-cream"
              @click="restoreHistory(item)"
            >
              <div class="flex items-center justify-between">
                <span class="font-mono text-[10px] uppercase tracking-wider text-muted">{{ formatDate(item.createdAt) }}</span>
                <span class="font-mono text-[10px] text-muted">×{{ item.imageCount }}</span>
              </div>
              <p class="mt-1.5 line-clamp-2 text-[12px] leading-5 text-ink/80">{{ item.prompt }}</p>
              <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
                <span>{{ item.style }}</span>
                <span class="text-line">·</span>
                <span class="font-mono">{{ item.size }}</span>
              </div>
            </button>
          </div>
          <p v-else class="rounded-md border border-dashed border-line bg-cream/40 px-4 py-5 text-[12px] leading-5 text-muted">
            生成成功后，最近 8 条参数会保存在浏览器本地。
          </p>
        </section>

        <section class="border-t border-line pt-6 text-[12px] leading-6 text-muted">
          <p>前端请求 <code class="rounded bg-cream px-1.5 py-0.5 font-mono text-[11px] text-ink">POST /api/images/generate</code>。</p>
          <p class="mt-2">所有数据保留在你的浏览器和后端之间。</p>
          <p v-if="healthRequestId" class="mt-3 font-mono text-[10px] tracking-wider">last req · {{ healthRequestId }}</p>
        </section>
      </aside>
    </main>

    <footer class="border-t border-line/70 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center font-mono text-[10px] uppercase tracking-[0.24em] text-muted">
      crafted local · {{ new Date().getFullYear() }}
    </footer>
  </div>
</template>
