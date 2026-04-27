<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import Select, { type SelectOption } from './Select.vue'
import { customModelSentinel, modelOptions, qualityOptions } from '../presets'
import { useProviderConfig } from '../composables/useProviderConfig'
import type { GenerateImageRequest, ImageQuality } from '../types'

type OutputFormat = NonNullable<GenerateImageRequest['outputFormat']>

interface Props {
  open: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'export'): void
  (e: 'reset'): void
  (e: 'reset-provider'): void
}>()

const negativePrompt = defineModel<string>('negativePrompt', { required: true })
const outputFormat = defineModel<OutputFormat>('outputFormat', { required: true })
const quality = defineModel<ImageQuality>('quality', { required: true })
const creativity = defineModel<number>('creativity', { required: true })
const seed = defineModel<string>('seed', { required: true })
const modelChoice = defineModel<string>('modelChoice', { required: true })
const customModel = defineModel<string>('customModel', { required: true })

const provider = useProviderConfig()
const showApiKey = ref(false)

function handleResetProvider() {
  provider.reset()
  showApiKey.value = false
  emit('reset-provider')
}

const formatOptions: SelectOption<OutputFormat>[] = [
  { value: 'png', label: 'PNG', hint: '无损 · 支持透明' },
  { value: 'jpeg', label: 'JPEG', hint: '体积小 · 通用' },
  { value: 'webp', label: 'WEBP', hint: '现代 · 平衡' },
]

const qualitySelectOptions = computed<SelectOption<ImageQuality>[]>(() =>
  qualityOptions.map((option) => ({ value: option.value, label: option.label })),
)

const modelSelectOptions = computed<SelectOption<string>[]>(() =>
  modelOptions.map((option) => ({ value: option.value, label: option.label, hint: option.hint })),
)

const isCustomModel = computed(() => modelChoice.value === customModelSentinel)

function close() {
  emit('update:open', false)
}

function rollSeed() {
  const next = Math.floor(Math.random() * 1_000_000)
  seed.value = String(next).padStart(6, '0')
}

function handleKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

watch(
  () => props.open,
  (open) => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) window.addEventListener('keydown', handleKey)
    else window.removeEventListener('keydown', handleKey)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKey)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dlg-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-sheet flex items-center justify-center px-4 py-6"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        @click.self="close"
      >
        <div class="scrim" aria-hidden="true" @click="close"></div>

        <Transition name="dlg-zoom">
          <div
            v-if="open"
            class="relative flex w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-line-strong bg-vellum text-ink shadow-paper-3"
          >
            <header class="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
              <div>
                <p class="display-eyebrow">Settings · 设置</p>
                <h2 class="mt-1.5 font-display text-2xl tracking-tightish">生成偏好</h2>
              </div>
              <button type="button" class="icon-btn-sm" aria-label="关闭" @click="close">
                <Icon name="close" :size="14" />
              </button>
            </header>

            <div class="max-h-[70dvh] space-y-5 overflow-y-auto px-6 py-5">
              <section
                class="rounded-2xl border border-line bg-paper-soft/60 p-4"
                :class="!provider.isConfigured.value && 'ring-1 ring-amber-400/40'"
              >
                <div class="mb-3 flex items-center justify-between gap-2">
                  <div class="flex flex-col">
                    <span class="display-eyebrow text-[10px]">Provider · 服务商</span>
                    <span class="mt-1 text-[13px] font-medium text-ink">API 端点 与 凭据</span>
                  </div>
                  <span
                    class="inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]"
                    :class="provider.isConfigured.value
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'"
                  >
                    <Icon :name="provider.isConfigured.value ? 'check' : 'warning'" :size="11" />
                    <span>{{ provider.isConfigured.value ? '已配置' : '未配置' }}</span>
                  </span>
                </div>

                <p class="mb-3 text-[11px] leading-[1.6] text-muted">
                  凭据只保存在你浏览器的 localStorage，刷新后仍在；不会写入任何服务端数据库。Network 面板里仍可见，截图分享请遮蔽。
                </p>

                <div class="space-y-3">
                  <div>
                    <label class="label mb-1.5 inline-flex items-center gap-1.5" for="set-base-url">
                      <Icon name="link" :size="12" />
                      <span>API 端点</span>
                    </label>
                    <input
                      id="set-base-url"
                      v-model="provider.state.baseUrl"
                      type="url"
                      class="field-input font-mono text-[12px]"
                      placeholder="https://api.openai.com/v1"
                      autocomplete="off"
                      spellcheck="false"
                      maxlength="200"
                    />
                    <p class="mt-1 text-[10px] leading-[1.5] text-muted">
                      OpenAI 官方 <code class="font-mono">https://api.openai.com/v1</code>，第三方网关填它给的 base URL（含 <code class="font-mono">/v1</code>）。
                    </p>
                  </div>

                  <div>
                    <label class="label mb-1.5 inline-flex items-center gap-1.5" for="set-api-key">
                      <Icon name="lightning" :size="12" />
                      <span>API Key</span>
                    </label>
                    <div class="relative flex items-center gap-2">
                      <input
                        id="set-api-key"
                        v-model="provider.state.apiKey"
                        :type="showApiKey ? 'text' : 'password'"
                        class="field-input pr-10 font-mono text-[12px]"
                        placeholder="sk-..."
                        autocomplete="off"
                        spellcheck="false"
                        maxlength="200"
                      />
                      <button
                        type="button"
                        class="absolute right-1.5 top-1/2 inline-grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-paper-soft hover:text-ink"
                        :aria-label="showApiKey ? '隐藏 API Key' : '显示 API Key'"
                        :aria-pressed="showApiKey"
                        @click="showApiKey = !showApiKey"
                      >
                        <Icon :name="showApiKey ? 'eyeOff' : 'eye'" :size="14" />
                      </button>
                    </div>
                  </div>
                </div>

                <div class="mt-3 flex items-center justify-end">
                  <button
                    type="button"
                    class="btn-quiet text-[11px]"
                    :disabled="!provider.state.apiKey && !provider.state.baseUrl"
                    @click="handleResetProvider"
                  >
                    <Icon name="trash" :size="12" />
                    清除凭据
                  </button>
                </div>
              </section>

              <section>
                <label class="label mb-2 inline-flex items-center gap-1.5" for="set-neg">
                  <Icon name="eyeOff" :size="12" />
                  <span>负面提示词</span>
                </label>
                <textarea
                  id="set-neg"
                  v-model="negativePrompt"
                  rows="2"
                  maxlength="400"
                  class="field-textarea"
                  placeholder="不想出现的元素，例如：模糊、水印"
                ></textarea>
              </section>

              <section>
                <label class="label mb-2 inline-flex items-center gap-1.5" for="set-model">
                  <Icon name="settings" :size="12" />
                  <span>模型</span>
                </label>
                <Select
                  id="set-model"
                  v-model="modelChoice"
                  :options="modelSelectOptions"
                  aria-label="选择生成模型"
                />
                <input
                  v-if="isCustomModel"
                  v-model="customModel"
                  type="text"
                  class="field-input mt-2 font-mono text-[12px]"
                  placeholder="例如 dall-e-3、flux-pro 等中转站支持的模型名"
                  autocomplete="off"
                  spellcheck="false"
                  maxlength="64"
                />
              </section>

              <section class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="label mb-2 inline-flex items-center gap-1.5" for="set-quality">
                    <Icon name="star" :size="12" />
                    <span>质量</span>
                  </label>
                  <Select
                    id="set-quality"
                    v-model="quality"
                    :options="qualitySelectOptions"
                    aria-label="选择质量"
                  />
                </div>
                <div>
                  <label class="label mb-2 inline-flex items-center gap-1.5" for="set-format">
                    <Icon name="image" :size="12" />
                    <span>输出格式</span>
                  </label>
                  <Select
                    id="set-format"
                    v-model="outputFormat"
                    :options="formatOptions"
                    aria-label="选择输出格式"
                  />
                </div>
              </section>

              <section>
                <label class="label mb-2 inline-flex items-center gap-1.5" for="set-seed">
                  <Icon name="dice" :size="12" />
                  <span>Seed</span>
                </label>
                <div class="relative flex items-center gap-2">
                  <input
                    id="set-seed"
                    v-model="seed"
                    class="field-input pr-12"
                    placeholder="留空 = 随机"
                    autocomplete="off"
                    spellcheck="false"
                    inputmode="numeric"
                  />
                  <button
                    type="button"
                    class="absolute right-1.5 top-1/2 inline-grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-paper-soft hover:text-ink"
                    aria-label="生成随机 seed"
                    @click="rollSeed"
                  >
                    <Icon name="dice" :size="14" />
                  </button>
                </div>
              </section>

              <section>
                <div class="mb-2 flex items-center justify-between">
                  <span class="label inline-flex items-center gap-1.5">
                    <Icon name="lightning" :size="12" />
                    <span>创意强度</span>
                  </span>
                  <span class="font-mono text-[11px] tabular-nums text-ink">{{ creativity }} / 10</span>
                </div>
                <input
                  v-model.number="creativity"
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  class="w-full accent-ink"
                  aria-label="创意强度"
                />
                <div class="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                  <span>稳健</span>
                  <span>大胆</span>
                </div>
              </section>
            </div>

            <footer
              class="flex flex-col-reverse items-stretch gap-2 border-t border-line bg-vellum/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <button
                type="button"
                class="btn-quiet justify-start gap-2 text-[12px]"
                @click="emit('reset')"
              >
                <Icon name="reset" :size="13" />
                重置全部参数
              </button>
              <button
                type="button"
                class="btn-ghost text-[12px]"
                @click="emit('export')"
              >
                <Icon name="download" :size="13" />
                导出当前参数为 JSON
              </button>
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dlg-fade-enter-from,
.dlg-fade-leave-to {
  opacity: 0;
}
.dlg-fade-enter-active,
.dlg-fade-leave-active {
  transition: opacity 0.24s ease-out;
}

.dlg-zoom-enter-from {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
}
.dlg-zoom-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
.dlg-zoom-enter-active,
.dlg-zoom-leave-active {
  transition: opacity 0.24s ease-out, transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}
</style>
