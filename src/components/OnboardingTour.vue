<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { rafThrottle } from '../lib/rafThrottle'
import { useI18n } from '../lib/i18n'

interface Props {
  active: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'finish'): void
  (e: 'dismiss'): void
}>()

interface Step {
  /** Selector that resolves to the spotlight anchor. */
  selector: string
  /** Fallback anchor when the primary selector is missing (e.g., mobile vs desktop). */
  fallbackSelector?: string
  titleKey: string
  bodyKey: string
  /** Where to anchor the tooltip relative to the spotlight box. */
  placement: 'auto' | 'top' | 'bottom' | 'right' | 'left'
}

const { t } = useI18n()

const steps: Step[] = [
  {
    selector: '[data-tour="composer-prompt"]',
    fallbackSelector: '[data-tour="chat-dock"]',
    titleKey: 'onboarding.step1.title',
    bodyKey: 'onboarding.step1.body',
    placement: 'auto',
  },
  {
    selector: '[data-tour="composer-cta"]',
    fallbackSelector: '[data-tour="chat-dock"]',
    titleKey: 'onboarding.step2.title',
    bodyKey: 'onboarding.step2.body',
    placement: 'auto',
  },
  {
    selector: '[data-tour="header-actions"]',
    fallbackSelector: '[data-tour="header-menu"]',
    titleKey: 'onboarding.step3.title',
    bodyKey: 'onboarding.step3.body',
    placement: 'auto',
  },
]

const stepIndex = ref(0)
const targetRect = ref<DOMRect | null>(null)
const PADDING = 10

const currentStep = computed(() => steps[stepIndex.value])

function locate(): HTMLElement | null {
  const step = currentStep.value
  if (!step) return null
  const target = document.querySelector<HTMLElement>(step.selector)
  if (target && target.offsetParent !== null) return target
  if (step.fallbackSelector) {
    const fallback = document.querySelector<HTMLElement>(step.fallbackSelector)
    if (fallback && fallback.offsetParent !== null) return fallback
  }
  return target ?? (step.fallbackSelector ? document.querySelector<HTMLElement>(step.fallbackSelector) : null)
}

function measure() {
  const target = locate()
  if (!target) {
    targetRect.value = null
    return
  }
  targetRect.value = target.getBoundingClientRect()
}

const reposition = rafThrottle(measure)

const cutoutStyle = computed(() => {
  const rect = targetRect.value
  if (!rect) return undefined
  return {
    top: `${rect.top - PADDING}px`,
    left: `${rect.left - PADDING}px`,
    width: `${rect.width + PADDING * 2}px`,
    height: `${rect.height + PADDING * 2}px`,
  }
})

const tooltipStyle = computed(() => {
  const rect = targetRect.value
  if (!rect) return undefined

  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 768
  const tooltipMaxWidth = Math.min(360, viewportW - 32)
  const tooltipApproxHeight = 168
  const gap = 16

  const spaceBelow = viewportH - rect.bottom
  const spaceAbove = rect.top
  const placeBelow = spaceBelow >= tooltipApproxHeight + gap || spaceBelow >= spaceAbove

  let top = placeBelow ? rect.bottom + gap : Math.max(16, rect.top - tooltipApproxHeight - gap)
  // clamp inside viewport
  top = Math.max(16, Math.min(top, viewportH - tooltipApproxHeight - 16))

  const desiredLeft = rect.left + rect.width / 2 - tooltipMaxWidth / 2
  const left = Math.max(16, Math.min(desiredLeft, viewportW - tooltipMaxWidth - 16))

  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${tooltipMaxWidth}px`,
  }
})

function next() {
  if (stepIndex.value >= steps.length - 1) {
    emit('finish')
    return
  }
  stepIndex.value += 1
  void nextTick(measure)
}

function back() {
  if (stepIndex.value <= 0) return
  stepIndex.value -= 1
  void nextTick(measure)
}

function skip() {
  emit('dismiss')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    skip()
  } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
    event.preventDefault()
    next()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    back()
  }
}

watch(
  () => props.active,
  (active) => {
    if (active) {
      stepIndex.value = 0
      void nextTick(measure)
      window.addEventListener('keydown', onKeydown, { capture: true })
      window.addEventListener('resize', reposition, { passive: true })
      window.addEventListener('scroll', reposition, { capture: true, passive: true })
    } else {
      window.removeEventListener('keydown', onKeydown, { capture: true })
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, { capture: true })
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (props.active) void nextTick(measure)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, { capture: true })
  window.removeEventListener('resize', reposition)
  window.removeEventListener('scroll', reposition, { capture: true })
  reposition.cancel()
})

const totalSteps = steps.length
</script>

<template>
  <Teleport to="body">
    <Transition name="onboarding-fade">
      <div
        v-if="active"
        class="onboarding"
        role="dialog"
        aria-modal="true"
        :aria-label="t('onboarding.step', { current: stepIndex + 1, total: totalSteps })"
      >
        <!-- Layered scrim with a hole over the target -->
        <div class="onboarding__scrim" aria-hidden="true">
          <div
            v-if="cutoutStyle"
            class="onboarding__cutout"
            :style="cutoutStyle"
          ></div>
        </div>

        <!-- Tooltip -->
        <Transition name="onboarding-pop" mode="out-in">
          <div
            v-if="targetRect"
            :key="stepIndex"
            class="onboarding__tooltip"
            :style="tooltipStyle"
          >
            <p class="onboarding__step">
              {{ t('onboarding.step', { current: stepIndex + 1, total: totalSteps }) }}
            </p>
            <h3 class="onboarding__title">{{ t(currentStep.titleKey) }}</h3>
            <p class="onboarding__body">{{ t(currentStep.bodyKey) }}</p>

            <div class="onboarding__progress" aria-hidden="true">
              <span
                v-for="(_, i) in steps"
                :key="i"
                class="onboarding__progress-dot"
                :class="{ 'onboarding__progress-dot--filled': i <= stepIndex }"
              ></span>
            </div>

            <div class="onboarding__actions">
              <button type="button" class="onboarding__skip" @click="skip">
                {{ t('onboarding.skip') }}
              </button>
              <span class="onboarding__nav">
                <button
                  v-if="stepIndex > 0"
                  type="button"
                  class="onboarding__back"
                  @click="back"
                  :aria-label="t('onboarding.back')"
                >
                  <Icon name="arrowLeft" :size="14" />
                  {{ t('onboarding.back') }}
                </button>
                <button
                  type="button"
                  class="onboarding__next"
                  @click="next"
                >
                  <span>{{ stepIndex === totalSteps - 1 ? t('onboarding.finish') : t('onboarding.next') }}</span>
                  <Icon name="arrowRight" :size="14" />
                </button>
              </span>
            </div>
          </div>
        </Transition>

        <!-- Fallback: if no target ever resolves, show centered fallback -->
        <div
          v-if="!targetRect"
          class="onboarding__tooltip onboarding__tooltip--centered"
        >
          <p class="onboarding__step">{{ t('onboarding.step', { current: stepIndex + 1, total: totalSteps }) }}</p>
          <h3 class="onboarding__title">{{ t(currentStep.titleKey) }}</h3>
          <p class="onboarding__body">{{ t(currentStep.bodyKey) }}</p>
          <div class="onboarding__actions">
            <button type="button" class="onboarding__skip" @click="skip">{{ t('onboarding.skip') }}</button>
            <button type="button" class="onboarding__next" @click="next">
              {{ stepIndex === totalSteps - 1 ? t('onboarding.finish') : t('onboarding.next') }}
              <Icon name="arrowRight" :size="14" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.onboarding {
  position: fixed;
  inset: 0;
  z-index: 80;
  pointer-events: auto;
}

.onboarding__scrim {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 0.42);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  pointer-events: auto;
}

.onboarding__cutout {
  position: absolute;
  border-radius: 18px;
  background: transparent;
  /* Big outer shadow paints the dark scrim; the box itself stays transparent
   * which produces a clean cutout — no clip-path edge aliasing. */
  box-shadow:
    0 0 0 9999px rgb(0 0 0 / 0.5),
    0 0 0 2px rgb(var(--color-paper) / 0.45),
    0 0 36px rgb(var(--color-paper) / 0.18) inset;
  transition: top 360ms cubic-bezier(0.2, 0.8, 0.2, 1),
              left 360ms cubic-bezier(0.2, 0.8, 0.2, 1),
              width 360ms cubic-bezier(0.2, 0.8, 0.2, 1),
              height 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
}

.onboarding__tooltip {
  position: fixed;
  z-index: 81;
  border-radius: var(--radius-card);
  background: var(--gradient-surface);
  border: 1px solid rgb(var(--color-line) / 0.3);
  backdrop-filter: blur(calc(var(--glass-blur) * 1.4)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 1.4)) saturate(var(--glass-saturate));
  color: rgb(var(--color-ink));
  padding: 1rem 1.05rem 0.85rem;
  box-shadow: var(--shadow-glass-xl), var(--shadow-inner-glass);
  transition: top 320ms cubic-bezier(0.2, 0.8, 0.2, 1), left 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.onboarding__tooltip--centered {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(360px, calc(100vw - 32px));
}

.onboarding__step {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgb(var(--color-muted));
  margin: 0 0 0.4rem;
}

.onboarding__title {
  margin: 0 0 0.5rem;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 22px;
  letter-spacing: -0.005em;
  font-style: italic;
  color: rgb(var(--color-ink));
}

.onboarding__body {
  margin: 0 0 0.85rem;
  font-size: 13px;
  line-height: 1.55;
  color: rgb(var(--color-ink) / 0.78);
}

.onboarding__progress {
  display: flex;
  gap: 0.32rem;
  margin: 0 0 0.85rem;
}

.onboarding__progress-dot {
  width: 14px;
  height: 4px;
  border-radius: 999px;
  background: rgb(var(--color-line));
  transition: background-color 220ms ease, width 220ms ease;
}

.onboarding__progress-dot--filled {
  background: var(--gradient-primary);
  width: 22px;
}

.onboarding__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.onboarding__nav {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.onboarding__skip,
.onboarding__back {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  padding: 0.46rem 0.7rem;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: rgb(var(--color-muted));
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: color 140ms ease, background-color 140ms ease;
}

.onboarding__skip:hover,
.onboarding__back:hover {
  color: rgb(var(--color-ink));
  background: rgb(var(--color-ivory) / 0.55);
}

.onboarding__next {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  padding: 0.5rem 0.85rem;
  border-radius: 12px;
  border: 0;
  background: var(--gradient-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent);
  transition: transform 160ms var(--motion-press), box-shadow 200ms var(--motion-soft);
}

.onboarding__next:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-glass-lg), 0 0 28px -6px rgb(var(--color-accent) / 0.4);
}

.onboarding__next:active {
  transform: translateY(0);
}

.onboarding-fade-enter-from,
.onboarding-fade-leave-to {
  opacity: 0;
}

.onboarding-fade-enter-active,
.onboarding-fade-leave-active {
  transition: opacity 0.28s ease;
}

.onboarding-pop-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}

.onboarding-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

.onboarding-pop-enter-active,
.onboarding-pop-leave-active {
  transition: opacity 0.22s ease-out, transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .onboarding__cutout,
  .onboarding__tooltip,
  .onboarding-fade-enter-active,
  .onboarding-fade-leave-active,
  .onboarding-pop-enter-active,
  .onboarding-pop-leave-active {
    transition: none;
  }
}
</style>
