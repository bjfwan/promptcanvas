<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import StyleSwatch from './StyleSwatch.vue'
import Select, { type SelectOption } from './Select.vue'
import MagicEnhanceMenu from './MagicEnhanceMenu.vue'
import { maxReferenceImages } from '../lib/imagesApi'
import { customModelSentinel, sizeOptions, styleOptions } from '../presets'
import { stylePrompts } from '../lib/imagesApi'
import { useDiscoveredModels } from '../composables/useDiscoveredModels'
import type { ContinuationContext, ImageSize, ImageStyle, ReferenceImageAttachment } from '../types'
import type { EnhanceResult } from '../lib/magicEnhance'

const sizeSelectOptions = computed<SelectOption<ImageSize>[]>(() =>
  sizeOptions.map((option) => ({ value: option.value, label: option.label, hint: option.hint })),
)

const countSelectOptions: SelectOption<number>[] = [
  { value: 1, label: '1 张', hint: '单张专注' },
  { value: 2, label: '2 张', hint: '快速对比' },
  { value: 3, label: '3 张', hint: '一组方案' },
  { value: 4, label: '4 张', hint: '广泛探索' },
]

const discoveredModels = useDiscoveredModels()

const modelChipOptions = computed<SelectOption<string>[]>(() =>
  discoveredModels.mergedModelOptions.value.map((option) => ({
    value: option.value,
    label: option.value === customModelSentinel ? '自定义…' : option.label,
    hint: option.hint,
  })),
)

interface Props {
  isGenerating: boolean
  elapsedSeconds: number
  canGenerate: boolean
  healthOffline: boolean
  referenceImages: ReferenceImageAttachment[]
  layout?: 'panel' | 'sheet'
  continuation?: ContinuationContext | null
  canUndoEnhance?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'panel',
  continuation: null,
  canUndoEnhance: false,
})

const prompt = defineModel<string>('prompt', { required: true })
const stl = defineModel<ImageStyle>('style', { required: true })
const size = defineModel<ImageSize>('size', { required: true })
const count = defineModel<number>('count', { required: true })
const modelChoice = defineModel<string>('modelChoice', { required: true })
const customModel = defineModel<string>('customModel', { required: true })

const emit = defineEmits<{
  (e: 'generate'): void
  (e: 'abort'): void
  (e: 'copy', text: string, message: string): void
  (e: 'clear'): void
  (e: 'open-settings'): void
  (e: 'select-reference-images', files: File[]): void
  (e: 'remove-reference-image', id: string): void
  (e: 'magic-enhance', result: EnhanceResult): void
  (e: 'undo-enhance'): void
  (e: 'cancel-continuation'): void
}>()

const promptRef = ref<HTMLTextAreaElement | null>(null)
const referenceInputRef = ref<HTMLInputElement | null>(null)
const previewOpen = ref(false)
const dragActive = ref(false)
const magicMenuOpen = ref(false)
const magicMenuRef = ref<HTMLElement | null>(null)
let dragDepth = 0

function onDocClick(e: MouseEvent) {
  if (!magicMenuOpen.value) return
  const target = e.target as Node
  if (magicMenuRef.value?.contains(target)) return
  magicMenuOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick, true))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick, true))

const activeStylePrompt = computed(() => stylePrompts[stl.value] ?? '')
const isRawStyle = computed(() => stl.value === 'raw')
const hasReferenceImages = computed(() => props.referenceImages.length > 0)
const canAddReferenceImages = computed(() => props.referenceImages.length < maxReferenceImages)

const promptCount = computed(() => prompt.value.length)
const promptTokens = computed(() => Math.max(1, Math.round(prompt.value.length / 4)))
const promptTone = computed(() => {
  const length = promptCount.value
  if (length < 24) return { label: '稀薄', tone: 'text-muted' }
  if (length < 80) return { label: '聚焦', tone: 'text-forest' }
  if (length < 240) return { label: '丰富', tone: 'text-ink' }
  if (length < 600) return { label: '稠密', tone: 'text-ochre' }
  return { label: '过载', tone: 'text-accent' }
})

const generateLabel = computed(() => {
  if (!prompt.value.trim()) return '写下提示词以生成'
  if (props.isGenerating) return 'Composing · 点击取消'
  return 'Generate'
})

function handleGenerateClick(event: Event) {
  if (props.isGenerating) {
    event.preventDefault()
    emit('abort')
    return
  }
  if (!props.canGenerate) {
    event.preventDefault()
    return
  }
  // 让 form 的 submit 处理（已经绑定了 emit('generate')）
}

const modelChipLabel = computed(() => {
  if (modelChoice.value === customModelSentinel) {
    const trimmed = customModel.value.trim()
    return trimmed ? `自定义 · ${trimmed}` : '自定义 · 未填写'
  }
  const match = discoveredModels.mergedModelOptions.value.find((option) => option.value === modelChoice.value)
  return match?.label ?? (modelChoice.value || '默认')
})

function focusPrompt() {
  nextTick(() => {
    promptRef.value?.focus()
  })
}

function clearPrompt() {
  prompt.value = ''
  emit('clear')
  focusPrompt()
}

function openReferencePicker() {
  referenceInputRef.value?.click()
}

function onReferenceInputChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const files = input?.files ? Array.from(input.files) : []
  if (files.length) {
    emit('select-reference-images', files)
  }
  if (input) {
    input.value = ''
  }
}

function hasFileDrag(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function imageFilesFrom(dataTransfer: DataTransfer | null) {
  if (!dataTransfer?.files?.length) return []
  return Array.from(dataTransfer.files).filter((file) => file.type.startsWith('image/'))
}

function handleDragEnter(event: DragEvent) {
  if (props.layout !== 'panel' || !hasFileDrag(event)) return
  event.preventDefault()
  dragDepth += 1
  dragActive.value = true
}

function handleDragOver(event: DragEvent) {
  if (props.layout !== 'panel' || !hasFileDrag(event)) return
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = canAddReferenceImages.value ? 'copy' : 'none'
  }
  dragActive.value = true
}

function handleDragLeave() {
  if (!dragActive.value) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) {
    dragActive.value = false
  }
}

function handleReferenceDrop(event: DragEvent) {
  if (props.layout !== 'panel') return
  event.preventDefault()
  dragDepth = 0
  dragActive.value = false
  if (!canAddReferenceImages.value) return
  const files = imageFilesFrom(event.dataTransfer)
  if (files.length) {
    emit('select-reference-images', files)
  }
}

function removeReferenceImage(id: string) {
  emit('remove-reference-image', id)
}

defineExpose({ focusPrompt })

watch(modelChoice, (newValue, oldValue) => {
  if (newValue === customModelSentinel && oldValue !== customModelSentinel) {
    emit('open-settings')
  }
})

watch(
  () => props.layout,
  () => {
    if (props.layout === 'sheet') {
      focusPrompt()
    }
  },
)
</script>

<template>
  <form
    class="relative flex flex-col gap-7"
    :class="{ 'pb-2': layout === 'sheet' }"
    @submit.prevent="emit('generate')"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleReferenceDrop"
  >
    <div
      v-if="layout === 'panel' && dragActive"
      class="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-[28px] border-2 border-dashed border-forest/60 bg-vellum/90 p-6 text-center shadow-paper-3 backdrop-blur"
      aria-hidden="true"
    >
      <div class="rounded-3xl border border-line bg-paper/85 px-6 py-5 shadow-paper-2">
        <Icon :name="canAddReferenceImages ? 'upload' : 'warning'" :size="22" class="mx-auto text-forest" />
        <p class="mt-3 font-display text-xl italic text-ink">
          {{ canAddReferenceImages ? '松手添加参考图' : '参考图已达上限' }}
        </p>
        <p class="mt-1 text-[12px] text-muted">
          {{ canAddReferenceImages ? '支持 PNG / JPEG / WEBP / GIF' : `最多 ${maxReferenceImages} 张参考图` }}
        </p>
      </div>
    </div>

    <header v-if="layout === 'panel'" class="space-y-2">
      <p class="display-eyebrow">01 · Compose</p>
      <h1 class="display-h1">写下你想看见的<span class="italic">画面</span></h1>
      <p class="text-[13px] leading-6 text-muted">
        像写一段电影旁白：主体、光线、色调、镜头、情绪。
        下方按你的表达选一个<span class="italic">提示词模板</span>可以一键塑造语气。
      </p>
    </header>

    <div
      v-if="healthOffline"
      class="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/[0.06] px-4 py-3 text-[13px] leading-6 text-accent"
      role="alert"
    >
      <Icon name="warning" :size="16" class="mt-0.5" />
      <span>后端当前不可用。检查连接后再生成图片。</span>
    </div>

    <section class="space-y-2.5">
      <input
        ref="referenceInputRef"
        type="file"
        class="sr-only"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        @change="onReferenceInputChange"
      />

      <Transition name="composer-continuation">
        <div v-if="continuation" class="composer-continuation" role="status" aria-label="正在接着画">
          <span class="composer-continuation__thumb" aria-hidden="true">
            <img :src="continuation.thumbnailUrl" alt="" loading="lazy" decoding="async" />
            <span class="composer-continuation__thumb-mark">
              <Icon name="sparkle" :size="9" />
            </span>
          </span>
          <span class="composer-continuation__body">
            <span class="composer-continuation__title">接着画</span>
            <span class="composer-continuation__sub">
              基于第 {{ continuation.fromImageIndex + 1 }} 张图，告诉它你想改什么
            </span>
          </span>
          <button
            type="button"
            class="composer-continuation__cancel"
            aria-label="取消接着画"
            @click="emit('cancel-continuation')"
          >
            <Icon name="close" :size="12" />
          </button>
        </div>
      </Transition>

      <div class="flex items-center justify-between">
        <label for="prompt-input" class="label inline-flex items-center gap-1.5">
          <Icon name="pencil" :size="12" />
          <span>提示词</span>
        </label>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted transition hover:bg-paper-soft hover:text-ink"
            :disabled="props.referenceImages.length >= maxReferenceImages"
            @click="openReferencePicker"
          >
            <Icon :name="hasReferenceImages ? 'image' : 'upload'" :size="11" />
            <span>{{ hasReferenceImages ? `参考图 ${props.referenceImages.length}` : '参考图' }}</span>
          </button>
          <div ref="magicMenuRef" class="relative">
            <button
              v-if="prompt.length"
              type="button"
              class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-forest/80 transition hover:bg-forest/10 hover:text-forest"
              aria-label="魔法增强提示词"
              @click.stop="magicMenuOpen = !magicMenuOpen"
            >
              <Icon name="sparkle" :size="11" />
              <span>魔法</span>
            </button>
            <Transition name="acc">
              <MagicEnhanceMenu
                v-if="magicMenuOpen"
                :prompt="prompt"
                :style="stl"
                class="absolute right-0 top-full mt-2"
                @enhance="(result: EnhanceResult) => { emit('magic-enhance', result); magicMenuOpen = false }"
                @close="magicMenuOpen = false"
              />
            </Transition>
          </div>
          <button
            v-if="props.canUndoEnhance"
            type="button"
            class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-accent/70 transition hover:bg-accent/10 hover:text-accent"
            @click="emit('undo-enhance')"
          >
            <Icon name="reset" :size="11" />
            <span>撤销魔法</span>
          </button>
          <button
            v-if="prompt.length"
            type="button"
            class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted transition hover:bg-paper-soft hover:text-ink"
            @click="emit('copy', prompt, '已复制提示词')"
          >
            <Icon name="copy" :size="11" />
            <span>复制</span>
          </button>
          <button
            v-if="prompt.length"
            type="button"
            class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted transition hover:bg-paper-soft hover:text-ink"
            @click="clearPrompt"
          >
            <Icon name="eraser" :size="11" />
            <span>清空</span>
          </button>
        </div>
      </div>
      <div class="relative" @click="promptRef?.focus()">
        <textarea
          id="prompt-input"
          ref="promptRef"
          v-model="prompt"
          :rows="layout === 'sheet' ? 5 : 6"
          maxlength="1200"
          class="field-textarea pb-12 pr-3"
          placeholder="一张极简咖啡品牌海报，暖色调，自然光，留白充足"
          autocomplete="off"
          spellcheck="false"
          @click.stop="promptRef?.focus()"
        ></textarea>
        <div class="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
          <span class="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-paper/85 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted backdrop-blur">
            <Icon name="layers" :size="10" />
            模型
          </span>
          <Select
            v-model="modelChoice"
            :options="modelChipOptions"
            variant="chip"
            align="end"
            aria-label="选择生成模型"
            class="pointer-events-auto"
            :placeholder="modelChipLabel"
          />
        </div>
      </div>
      <div
        v-if="hasReferenceImages"
        class="rounded-2xl border border-line bg-vellum/70 p-3"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            <Icon name="image" :size="10" />
            <span>参考图 {{ props.referenceImages.length }} / {{ maxReferenceImages }}</span>
          </p>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-muted transition hover:bg-paper-soft hover:text-ink"
            :disabled="props.referenceImages.length >= maxReferenceImages"
            @click="openReferencePicker"
          >
            <Icon name="upload" :size="11" />
            <span>继续添加</span>
          </button>
        </div>

        <div class="flex flex-wrap gap-2">
          <div
            v-for="image in props.referenceImages"
            :key="image.id"
            class="group relative h-24 w-24 overflow-hidden rounded-2xl border border-line bg-paper-soft"
          >
            <img
              :src="image.previewUrl"
              :alt="image.name"
              loading="lazy"
              decoding="async"
              class="h-full w-full object-cover"
            />
            <button
              type="button"
              class="absolute right-1.5 top-1.5 inline-grid h-6 w-6 place-items-center rounded-full bg-ink/75 text-paper opacity-0 transition group-hover:opacity-100"
              :aria-label="`移除参考图 ${image.name}`"
              @click="removeReferenceImage(image.id)"
            >
              <Icon name="close" :size="11" />
            </button>
            <span class="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-ink/80 to-transparent px-2 pb-1 pt-4 text-[10px] font-medium text-paper">
              {{ image.name }}
            </span>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between text-[11px]">
        <p class="flex items-center gap-2">
          <span class="font-mono uppercase tracking-[0.2em]" :class="promptTone.tone">{{ promptTone.label }}</span>
          <span class="font-mono text-muted/70">~{{ promptTokens }} tokens</span>
        </p>
        <p class="font-mono text-[10px] tabular-nums text-muted">{{ promptCount }} / 1200</p>
      </div>
      <p class="text-[10px] leading-snug text-muted">
        需要负面提示词、Seed、质量等高级参数？
        <button
          type="button"
          class="inline-flex items-center gap-1 text-ink underline-offset-2 hover:underline"
          @click="emit('open-settings')"
        >
          <Icon name="sliders" :size="11" />
          <span>打开设置</span>
        </button>。
      </p>
    </section>

    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <label class="label inline-flex items-center gap-1.5">
          <Icon name="swatch" :size="12" />
          <span>提示词模板</span>
        </label>
        <span class="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{{ styleOptions.length }} 预设</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="item in styleOptions"
          :key="item.value"
          type="button"
          class="group relative flex items-center gap-3 rounded-2xl border bg-cream p-2.5 text-left transition"
          :class="
            stl === item.value
              ? 'border-ink bg-ink text-paper shadow-paper-2'
              : 'border-line text-ink hover:border-line-strong hover:bg-paper-soft'
          "
          :aria-pressed="stl === item.value"
          @click="stl = item.value"
        >
          <StyleSwatch :variant="item.value" :active="stl === item.value" />
          <span class="min-w-0 flex-1">
            <span class="block text-[13px] font-medium leading-tight">{{ item.label }}</span>
            <span
              class="mt-0.5 block text-[11px] leading-snug"
              :class="stl === item.value ? 'text-paper/65' : 'text-muted'"
            >
              {{ item.accent }}
            </span>
          </span>
        </button>
      </div>

      <button
        type="button"
        class="flex w-full items-center justify-between rounded-2xl border border-line bg-cream/50 px-3 py-2.5 text-left text-[12px] transition hover:border-line-strong hover:bg-paper-soft"
        :aria-expanded="previewOpen"
        @click="previewOpen = !previewOpen"
      >
        <span class="flex items-center gap-2">
          <Icon name="info" :size="12" class="text-muted" />
          <span class="text-ink">
            <span v-if="isRawStyle">已选 「不套模板」：原样发送</span>
            <span v-else>生图时会拼接的「风格指引」</span>
          </span>
        </span>
        <Icon
          name="chevronDown"
          :size="12"
          class="text-muted transition"
          :class="previewOpen ? 'rotate-180' : ''"
        />
      </button>
      <Transition name="acc">
        <div
          v-if="previewOpen"
          class="rounded-2xl border border-line bg-vellum/70 p-3 text-[12px] leading-[1.7]"
        >
          <p v-if="isRawStyle" class="flex items-center gap-2 text-forest">
            <Icon name="check" :size="12" />
            <span>不附加任何风格指引。你输入什么就发什么。</span>
          </p>
          <template v-else>
            <p class="mb-2 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              <Icon name="sparkle" :size="10" />
              <span>被并到提示词后的原文</span>
            </p>
            <p class="whitespace-pre-wrap break-words text-ink/85">{{ activeStylePrompt }}</p>
            <p class="mt-2 text-[10px] leading-snug text-muted">
              不满意？选「不套模板」跳过这一段，或直接在上方提示词里写你自己的镜头/光位/材质。
            </p>
          </template>
        </div>
      </Transition>
    </section>

    <section class="grid gap-4 sm:grid-cols-2">
      <div>
        <label class="label mb-2 inline-flex items-center gap-1.5" for="comp-size">
          <Icon name="ratio" :size="12" />
          <span>尺寸</span>
        </label>
        <Select
          id="comp-size"
          v-model="size"
          :options="sizeSelectOptions"
          aria-label="选择图片尺寸"
        />
      </div>
      <div>
        <label class="label mb-2 inline-flex items-center gap-1.5" for="comp-count">
          <Icon name="layers" :size="12" />
          <span>数量</span>
        </label>
        <Select
          id="comp-count"
          v-model="count"
          :options="countSelectOptions"
          aria-label="选择生成数量"
        />
      </div>
    </section>

    <div
      v-if="layout === 'panel'"
      class="sticky bottom-0 -mx-4 border-t border-line/80 bg-paper/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0 lg:backdrop-blur-none"
    >
      <button
        type="submit"
        :disabled="!isGenerating && !canGenerate"
        class="btn-primary group relative w-full overflow-hidden px-5 py-4 text-sm shadow-paper-2 disabled:shadow-paper-1"
        :class="{ 'btn-primary--busy': isGenerating }"
        aria-keyshortcuts="Meta+Enter Control+Enter"
        @click="handleGenerateClick"
      >
        <span class="flex w-full items-center justify-between gap-3">
          <span class="flex items-center gap-3">
            <Icon
              :name="isGenerating ? 'close' : 'lightning'"
              :size="14"
              :class="isGenerating ? '' : ''"
            />
            <span class="font-display text-base italic">{{ generateLabel }}</span>
            <span v-if="isGenerating" class="font-mono text-[11px] tabular-nums text-paper/70">{{ elapsedSeconds }}s</span>
          </span>
          <span v-if="!isGenerating" class="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-paper/65 sm:inline" aria-hidden="true">⌘ ↵</span>
        </span>
        <span
          v-if="isGenerating"
          class="pointer-events-none absolute inset-y-0 -inset-x-1/2 bg-gradient-to-r from-transparent via-paper/15 to-transparent animate-progress-sweep"
          aria-hidden="true"
        ></span>
      </button>
    </div>

    <div v-else class="sticky bottom-0 -mx-5 border-t border-line/70 bg-paper/95 px-5 pb-2 pt-3 backdrop-blur">
      <button
        type="submit"
        :disabled="!isGenerating && !canGenerate"
        class="btn-primary group relative w-full overflow-hidden px-5 py-4 text-sm shadow-paper-2 disabled:shadow-paper-1"
        :class="{ 'btn-primary--busy': isGenerating }"
        @click="handleGenerateClick"
      >
        <span class="flex w-full items-center justify-between gap-3">
          <span class="flex items-center gap-3">
            <Icon :name="isGenerating ? 'close' : 'lightning'" :size="14" />
            <span class="font-display text-base italic">{{ generateLabel }}</span>
            <span v-if="isGenerating" class="font-mono text-[11px] tabular-nums text-paper/70">{{ elapsedSeconds }}s</span>
          </span>
        </span>
        <span
          v-if="isGenerating"
          class="pointer-events-none absolute inset-y-0 -inset-x-1/2 bg-gradient-to-r from-transparent via-paper/15 to-transparent animate-progress-sweep"
          aria-hidden="true"
        ></span>
      </button>
    </div>
  </form>
</template>

<style scoped>
.acc-enter-from,
.acc-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  max-height: 0;
}
.acc-enter-to,
.acc-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 1000px;
}
.acc-enter-active,
.acc-leave-active {
  transition: opacity 0.24s ease-out, transform 0.24s ease-out, max-height 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
  overflow: hidden;
}

.composer-continuation {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.6rem;
  border-radius: 18px;
  border: 1px solid rgb(var(--color-accent) / 0.32);
  background: linear-gradient(180deg, rgb(var(--color-accent) / 0.06), rgb(var(--color-accent) / 0.03));
  box-shadow: 0 6px 18px -14px rgb(var(--color-accent) / 0.55);
}

.composer-continuation__thumb {
  position: relative;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgb(var(--color-line-strong) / 0.6);
  background: rgb(var(--color-paper-soft));
  box-shadow: 0 6px 14px -10px rgb(var(--color-ink) / 0.35);
}

.composer-continuation__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.composer-continuation__thumb-mark {
  position: absolute;
  top: -3px;
  right: -3px;
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: rgb(var(--color-accent));
  color: rgb(var(--color-paper));
  border: 1.5px solid rgb(var(--color-vellum));
}

.composer-continuation__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  line-height: 1.2;
}

.composer-continuation__title {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgb(var(--color-accent));
}

.composer-continuation__sub {
  margin-top: 2px;
  font-size: 12px;
  color: rgb(var(--color-ink) / 0.78);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.composer-continuation__cancel {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgb(var(--color-paper) / 0.6);
  color: rgb(var(--color-muted));
  border: 1px solid rgb(var(--color-line) / 0.7);
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease, transform 140ms ease;
}

.composer-continuation__cancel:hover {
  background: rgb(var(--color-paper));
  color: rgb(var(--color-accent));
  border-color: rgb(var(--color-accent) / 0.4);
}

.composer-continuation__cancel:active {
  transform: scale(0.95);
}

.composer-continuation-enter-from,
.composer-continuation-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  max-height: 0;
}

.composer-continuation-enter-to,
.composer-continuation-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 96px;
}

.composer-continuation-enter-active,
.composer-continuation-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease, max-height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
  overflow: hidden;
}

.btn-primary--busy {
  background: linear-gradient(135deg, rgb(var(--color-ink)), rgb(var(--color-ink) / 0.88));
  cursor: pointer;
}

.btn-primary--busy:hover {
  background: linear-gradient(135deg, rgb(var(--color-accent)), rgb(var(--color-accent) / 0.88));
}

@media (prefers-reduced-motion: reduce) {
  .acc-enter-active,
  .acc-leave-active,
  .composer-continuation-enter-active,
  .composer-continuation-leave-active,
  .composer-continuation__cancel {
    transition: none;
  }
}
</style>
