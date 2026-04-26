<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiRequestError, checkHealth, generateImage, resolveImageSource } from './api'
import { promptTemplates, qualityOptions, sizeOptions, styleOptions } from './presets'
import { clearHistory, loadHistory, prependHistory } from './storage'
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

let timerId: number | undefined

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
}

function resetDraft() {
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

onMounted(() => {
  refreshHealth()
})
</script>

<template>
  <main class="min-h-screen overflow-hidden bg-paper text-ink">
    <div class="pointer-events-none fixed inset-0 opacity-80">
      <div class="absolute -left-32 top-16 h-80 w-80 rounded-full bg-clay/25 blur-3xl"></div>
      <div class="absolute right-0 top-0 h-[30rem] w-[30rem] rounded-full bg-brass/20 blur-3xl"></div>
      <div class="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-moss/15 blur-3xl"></div>
    </div>

    <section class="relative mx-auto grid min-h-screen w-full max-w-[1500px] gap-6 px-4 py-6 lg:px-6 xl:grid-cols-[420px_minmax(0,1fr)_340px]">
      <aside class="rounded-[2rem] border border-ink/10 bg-white/50 p-5 shadow-panel backdrop-blur-xl lg:p-6">
        <div class="mb-7 flex items-start justify-between gap-4">
          <div>
            <p class="mb-2 text-xs font-bold uppercase tracking-[0.38em] text-clay">PromptCanvas</p>
            <h1 class="font-display text-4xl leading-none tracking-tight text-ink md:text-5xl">AI 图片生成工作台</h1>
          </div>
          <button type="button" class="rounded-full border border-ink/10 bg-paper/80 px-4 py-2 text-xs font-bold text-ink/60 transition hover:bg-white" @click="resetDraft">
            重置
          </button>
        </div>

        <form class="space-y-5" @submit.prevent="handleGenerate">
          <div v-if="healthStatus === 'offline'" class="rounded-2xl border border-clay/20 bg-clay/10 p-4 text-sm leading-6 text-ink/65">
            后端当前不可用。你仍然可以编辑提示词和参数，但生成图片前需要先启动或修复后端服务。
          </div>

          <label class="block">
            <div class="mb-3 flex items-center justify-between gap-3">
              <span class="text-sm font-bold text-ink/80">提示词</span>
              <button type="button" class="text-xs font-bold text-clay transition hover:text-ink" @click="copyToClipboard(prompt, '提示词已复制')">
                复制
              </button>
            </div>
            <textarea
              v-model="prompt"
              rows="8"
              maxlength="1200"
              class="w-full resize-none rounded-[1.5rem] border border-ink/10 bg-paper/70 p-5 text-base leading-7 outline-none transition focus:border-clay/60 focus:bg-white focus:shadow-glow"
              placeholder="描述你想生成的画面，例如：一张极简咖啡品牌海报，暖色调，自然光，留白充足"
            ></textarea>
            <div class="mt-2 flex items-center justify-between text-xs text-ink/45">
              <span>{{ copiedMessage || '支持中文或英文，建议写清主体、环境、光线、构图。' }}</span>
              <span>{{ prompt.length }}/1200</span>
            </div>
          </label>

          <section>
            <div class="mb-3 flex items-end justify-between gap-3">
              <span class="text-sm font-bold text-ink/80">风格预设</span>
              <span class="text-xs text-ink/50">{{ selectedStyle?.description }}</span>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <button
                v-for="item in styleOptions"
                :key="item.value"
                type="button"
                class="rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-panel"
                :class="style === item.value ? 'border-clay bg-clay text-white' : 'border-ink/10 bg-white/55 text-ink'"
                @click="style = item.value"
              >
                <span class="mb-2 inline-flex rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">{{ item.accent }}</span>
                <span class="block text-sm font-bold">{{ item.label }}</span>
                <span class="mt-1 block text-xs opacity-70">{{ item.description }}</span>
              </button>
            </div>
          </section>

          <section class="rounded-[1.5rem] border border-ink/10 bg-white/45 p-4">
            <div class="mb-4 flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-bold text-ink/80">基础参数</p>
                <p class="mt-1 text-xs text-ink/45">{{ selectedSize?.hint }}</p>
              </div>
              <span class="rounded-full bg-ink px-3 py-1 text-xs font-bold text-paper">{{ size }}</span>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <label class="block md:col-span-2">
                <span class="mb-2 block text-xs font-bold text-ink/60">尺寸</span>
                <select v-model="size" class="field-select">
                  <option v-for="item in sizeOptions" :key="item.value" :value="item.value">{{ item.label }} · {{ item.hint }}</option>
                </select>
              </label>

              <label class="block">
                <span class="mb-2 block text-xs font-bold text-ink/60">数量</span>
                <select v-model.number="count" class="field-select">
                  <option :value="1">1 张</option>
                  <option :value="2">2 张</option>
                  <option :value="3">3 张</option>
                  <option :value="4">4 张</option>
                </select>
              </label>

              <label class="block">
                <span class="mb-2 block text-xs font-bold text-ink/60">格式</span>
                <select v-model="outputFormat" class="field-select">
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WEBP</option>
                </select>
              </label>
            </div>
          </section>

          <details class="group rounded-[1.5rem] border border-ink/10 bg-white/40 p-4">
            <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-ink/80">
              高级参数
              <span class="rounded-full bg-ink/5 px-3 py-1 text-xs text-ink/50 group-open:bg-clay group-open:text-white">可选</span>
            </summary>

            <div class="mt-4 space-y-4">
              <label class="block">
                <span class="mb-2 block text-xs font-bold text-ink/60">负面提示词</span>
                <textarea v-model="negativePrompt" rows="3" maxlength="400" class="field-textarea" placeholder="不想要的内容，例如：模糊、水印、错误文字"></textarea>
              </label>

              <div class="grid gap-4 md:grid-cols-2">
                <label class="block">
                  <span class="mb-2 block text-xs font-bold text-ink/60">质量</span>
                  <select v-model="quality" class="field-select">
                    <option v-for="item in qualityOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                </label>

                <label class="block">
                  <span class="mb-2 block text-xs font-bold text-ink/60">Seed</span>
                  <input v-model="seed" class="field-input" placeholder="可选，便于复现" />
                </label>
              </div>

              <label class="block">
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-xs font-bold text-ink/60">创意强度</span>
                  <span class="text-xs font-bold text-clay">{{ creativity }}/10</span>
                </div>
                <input v-model.number="creativity" type="range" min="1" max="10" step="1" class="w-full accent-clay" />
              </label>
            </div>
          </details>

          <button
            type="submit"
            :disabled="!canGenerate"
            class="group relative w-full overflow-hidden rounded-full bg-ink px-6 py-4 text-base font-bold text-paper shadow-panel transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span class="absolute inset-0 translate-x-[-120%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition duration-700 group-hover:translate-x-[120%]"></span>
            <span class="relative">{{ isGenerating ? `正在生成 · ${elapsedSeconds}s` : '生成图片' }}</span>
          </button>
        </form>
      </aside>

      <section class="relative flex min-h-[720px] flex-col rounded-[2rem] border border-ink/10 bg-ink p-4 text-paper shadow-panel md:p-6">
        <div class="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="mb-2 text-xs font-bold uppercase tracking-[0.32em] text-brass">Generation Preview</p>
            <h2 class="font-display text-4xl leading-none md:text-6xl">生成结果</h2>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full border border-white/10 px-3 py-1.5 text-xs text-paper/60">{{ selectedStyle?.label }}</span>
            <span class="rounded-full border border-white/10 px-3 py-1.5 text-xs text-paper/60">{{ size }}</span>
            <span v-if="lastRequestId" class="rounded-full border border-white/10 px-3 py-1.5 text-xs text-paper/60">{{ lastRequestId }}</span>
          </div>
        </div>

        <div v-if="errorMessage" class="mb-5 rounded-2xl border border-red-300/30 bg-red-500/15 p-4 text-sm text-red-100">
          {{ errorMessage }}
        </div>

        <div v-if="isGenerating" class="grid flex-1 place-items-center rounded-[1.5rem] border border-white/10 bg-white/[0.03]">
          <div class="text-center">
            <div class="mx-auto mb-5 h-16 w-16 animate-spin rounded-full border-2 border-paper/20 border-t-brass"></div>
            <p class="font-display text-4xl">正在构图</p>
            <p class="mx-auto mt-3 max-w-md text-sm leading-6 text-paper/55">后端正在调用 OpenAI。复杂提示词、更多数量或高质量参数可能需要更久。</p>
          </div>
        </div>

        <div v-else-if="activeImage" class="flex flex-1 flex-col gap-4">
          <div class="grid flex-1 place-items-center rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-3 md:p-5">
            <div class="max-h-[62vh] w-full max-w-3xl overflow-hidden rounded-[1.25rem] bg-paper/10" :class="previewFrameClass">
              <img :src="activeImageSource" alt="生成图片" class="h-full w-full object-contain" />
            </div>
          </div>

          <div class="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div class="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
              <p class="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-brass">Revised Prompt</p>
              <p class="text-sm leading-6 text-paper/65">{{ activeImage.revisedPrompt || prompt }}</p>
            </div>

            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-72 lg:grid-cols-2">
              <button type="button" class="result-button" @click="downloadImage(activeImage, activeImageIndex)">下载</button>
              <button type="button" class="result-button" @click="openImage(activeImage)">打开</button>
              <button type="button" class="result-button" @click="copyToClipboard(activeImage.revisedPrompt || prompt, '提示词已复制')">复制</button>
              <button type="button" class="result-button" @click="exportCurrentConfig">导出</button>
            </div>
          </div>

          <div v-if="images.length > 1" class="grid grid-cols-4 gap-3">
            <button
              v-for="(image, index) in images"
              :key="image.id || index"
              type="button"
              class="overflow-hidden rounded-2xl border bg-white/[0.04] p-1 transition hover:-translate-y-0.5"
              :class="activeImageIndex === index ? 'border-brass' : 'border-white/10'"
              @click="activeImageIndex = index"
            >
              <img :src="resolveImageSource(image)" alt="生成图片缩略图" class="aspect-square w-full rounded-xl object-cover" />
            </button>
          </div>
        </div>

        <div v-else class="grid flex-1 place-items-center rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
          <div>
            <div class="mx-auto mb-6 grid h-28 w-28 place-items-center rounded-full border border-white/10 bg-paper/10 text-5xl">✦</div>
            <p class="font-display text-4xl">等待第一张图</p>
            <p class="mx-auto mt-4 max-w-md text-sm leading-6 text-paper/55">在左侧输入提示词，或者从右侧模板开始。生成完成后，图片会出现在这里。</p>
          </div>
        </div>
      </section>

      <aside class="space-y-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:pr-1">
        <section class="rounded-[2rem] border border-ink/10 bg-white/50 p-5 shadow-panel backdrop-blur-xl">
          <div class="mb-4 flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-bold uppercase tracking-[0.28em] text-clay">Backend status</p>
              <h3 class="mt-2 font-display text-3xl leading-none">连接状态</h3>
            </div>
            <span
              class="mt-1 rounded-full px-3 py-1 text-xs font-bold"
              :class="{
                'bg-brass/20 text-ink': healthStatus === 'checking',
                'bg-moss text-white': healthStatus === 'online',
                'bg-clay text-white': healthStatus === 'offline',
              }"
            >
              {{ healthStatus === 'checking' ? '检查中' : healthStatus === 'online' ? '在线' : '离线' }}
            </span>
          </div>

          <p class="text-sm leading-6 text-ink/60">{{ healthMessage }}</p>
          <p v-if="healthRequestId" class="mt-2 text-xs text-ink/40">请求 ID：{{ healthRequestId }}</p>

          <button type="button" class="mt-4 w-full rounded-full border border-ink/10 bg-paper px-4 py-3 text-sm font-bold text-ink transition hover:bg-white" @click="refreshHealth">
            重新检查
          </button>
        </section>

        <section class="rounded-[2rem] border border-ink/10 bg-white/50 p-5 shadow-panel backdrop-blur-xl">
          <div class="mb-4">
            <p class="text-xs font-bold uppercase tracking-[0.28em] text-clay">Prompt kits</p>
            <h3 class="mt-2 font-display text-3xl leading-none">提示词模板</h3>
          </div>

          <div class="space-y-3">
            <button
              v-for="template in promptTemplates"
              :key="template.id"
              type="button"
              class="w-full rounded-[1.25rem] border border-ink/10 bg-paper/60 p-4 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-panel"
              @click="applyTemplate(template)"
            >
              <div class="mb-2 flex items-center justify-between gap-3">
                <span class="text-sm font-bold">{{ template.title }}</span>
                <span class="rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-paper">{{ template.style }}</span>
              </div>
              <p class="mb-2 text-xs font-bold text-clay">{{ template.tone }}</p>
              <p class="line-clamp-2 text-xs leading-5 text-ink/55">{{ template.prompt }}</p>
            </button>
          </div>
        </section>

        <section class="rounded-[2rem] border border-ink/10 bg-ink p-5 text-paper shadow-panel">
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-bold uppercase tracking-[0.28em] text-brass">Local history</p>
              <h3 class="mt-2 font-display text-3xl leading-none">生成历史</h3>
            </div>
            <button v-if="history.length" type="button" class="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-paper/60 transition hover:bg-white hover:text-ink" @click="clearLocalHistory">
              清空
            </button>
          </div>

          <div v-if="history.length" class="space-y-3">
            <button
              v-for="item in history"
              :key="item.id"
              type="button"
              class="w-full rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.08]"
              @click="restoreHistory(item)"
            >
              <div class="mb-2 flex items-center justify-between gap-3">
                <span class="text-xs font-bold text-brass">{{ formatDate(item.createdAt) }}</span>
                <span class="text-xs text-paper/45">{{ item.imageCount }} 张</span>
              </div>
              <p class="line-clamp-2 text-sm leading-6 text-paper/75">{{ item.prompt }}</p>
              <div class="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider text-paper/50">
                <span>{{ item.style }}</span>
                <span>{{ item.size }}</span>
                <span>{{ item.outputFormat }}</span>
              </div>
            </button>
          </div>

          <div v-else class="rounded-[1.25rem] border border-dashed border-white/15 p-5 text-sm leading-6 text-paper/55">
            生成成功后，前端会在浏览器本地保存最近 8 条参数记录，方便你重新编辑。
          </div>
        </section>

        <section class="rounded-[2rem] border border-ink/10 bg-white/50 p-5 shadow-panel backdrop-blur-xl">
          <p class="mb-2 text-sm font-bold text-ink/80">后端对接提醒</p>
          <p class="text-sm leading-6 text-ink/55">前端请求 <code class="rounded bg-ink/10 px-1.5 py-0.5">POST /api/images/generate</code>。新增的负面提示词、质量、创意强度、Seed 都是可选字段，后端可以先忽略。</p>
          <button type="button" class="mt-4 w-full rounded-full bg-ink px-4 py-3 text-sm font-bold text-paper transition hover:-translate-y-0.5 hover:bg-clay" @click="exportCurrentConfig">
            导出当前参数
          </button>
        </section>
      </aside>
    </section>
  </main>
</template>
