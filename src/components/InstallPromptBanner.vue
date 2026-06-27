<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { useI18n } from '../lib/i18n'

/**
 * PWA install nudge.
 *
 * Two branches:
 *  - iOS Safari (no `beforeinstallprompt`): shows a "Share → Add to Home Screen"
 *    guide overlay. iPadOS 13+ masquerades as macOS, so we also check
 *    `navigator.platform === 'MacIntel'` with touch points.
 *  - Chrome / Edge / Brave (Android & desktop): shows an "Install app" banner
 *    only when `beforeinstallprompt` has fired (`installAvailable`) and the app
 *    isn't already installed.
 *
 * The banner is non-intrusive: it appears after the first successful
 * generation, or 10s after page load as a fallback. Dismissal is persisted to
 * localStorage with a timestamp and suppressed for a week.
 */
interface Props {
  installAvailable: boolean
  installed: boolean
  /** True once the user has completed at least one successful generation. */
  hasGenerated: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'install'): void
}>()

const { t } = useI18n()

const DISMISS_KEY = 'pc:pwa-install-dismissed'
// Re-surface the nudge after a week.
const RESHOW_MS = 7 * 24 * 60 * 60 * 1000
// Fallback delay before first show when no generation has happened yet.
const FALLBACK_DELAY_MS = 10_000

const visible = ref(false)
const keyboardOpen = ref(false)
let keyboardObserver: MutationObserver | undefined

function readKeyboardInset(): number {
  if (typeof document === 'undefined') return 0
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset').trim()
  if (!raw) return 0
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : 0
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iosTouch = /iphone|ipad|ipod/i.test(ua)
  // iPadOS 13+ reports a macOS desktop UA but remains a touch device.
  const ipadMac =
    navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
  return (iosTouch || ipadMac) && !isStandalone()
}

const isIOS = computed(() => detectIOS())

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return true
    return Date.now() - ts < RESHOW_MS
  } catch {
    return false
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    /* storage may be blocked — best effort */
  }
  visible.value = false
}

function shouldShowChrome(): boolean {
  return !isIOS.value && props.installAvailable && !props.installed
}

function maybeShow() {
  if (isStandalone()) return
  if (props.installed) return
  if (isDismissed()) return
  if (isIOS.value) {
    visible.value = true
    return
  }
  if (shouldShowChrome()) visible.value = true
}

let fallbackTimer: number | undefined

onMounted(() => {
  fallbackTimer = window.setTimeout(() => {
    fallbackTimer = undefined
    maybeShow()
  }, FALLBACK_DELAY_MS)

  keyboardOpen.value = readKeyboardInset() > 0
  keyboardObserver = new MutationObserver(() => {
    keyboardOpen.value = readKeyboardInset() > 0
  })
  keyboardObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
})

watch(
  () => props.hasGenerated,
  (val) => {
    if (!val) return
    if (fallbackTimer !== undefined) {
      window.clearTimeout(fallbackTimer)
      fallbackTimer = undefined
    }
    maybeShow()
  },
)

onBeforeUnmount(() => {
  if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer)
  keyboardObserver?.disconnect()
  keyboardObserver = undefined
})

function handleInstall() {
  visible.value = false
  emit('install')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="install-pop">
      <aside
        v-if="visible && !keyboardOpen"
        class="install-banner"
        role="dialog"
        aria-live="polite"
        :aria-label="t('install.banner.title')"
      >
        <button
          type="button"
          class="install-banner__close"
          :aria-label="t('install.banner.dismiss')"
          @click="dismiss"
        >
          <Icon name="close" :size="14" />
        </button>

        <!-- iOS Safari: no native install prompt, guide the user. -->
        <template v-if="isIOS">
          <div class="install-banner__body install-banner__body--ios">
            <div class="install-banner__heading">
              <span class="install-banner__icon" aria-hidden="true">
                <Icon name="download" :size="14" />
              </span>
              <div class="install-banner__copy">
                <strong>{{ t('install.banner.title') }}</strong>
                <p>{{ t('install.banner.body') }}</p>
              </div>
            </div>
            <ol class="install-steps">
              <li>
                <span class="install-step__badge" aria-hidden="true">
                  <Icon name="share" :size="13" />
                </span>
                <span>{{ t('install.ios.step1') }}</span>
              </li>
              <li>
                <span class="install-step__badge" aria-hidden="true">
                  <Icon name="plus" :size="13" />
                </span>
                <span>{{ t('install.ios.step2') }}</span>
              </li>
            </ol>
          </div>
        </template>

        <!-- Chrome / Edge / Brave: trigger the deferred prompt. -->
        <template v-else>
          <div class="install-banner__body">
            <span class="install-banner__icon" aria-hidden="true">
              <Icon name="download" :size="14" />
            </span>
            <div class="install-banner__copy">
              <strong>{{ t('install.banner.title') }}</strong>
              <p>{{ t('install.banner.body') }}</p>
            </div>
          </div>
          <div class="install-banner__actions">
            <button
              type="button"
              class="install-banner__action"
              @click="handleInstall"
            >
              <Icon name="download" :size="13" />
              <span>{{ t('install.banner.action') }}</span>
            </button>
          </div>
        </template>

        <button
          type="button"
          class="install-banner__dismiss"
          @click="dismiss"
        >
          {{ t('install.banner.dismiss') }}
        </button>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Glass language mirrors `.chat-action-chip` (ChatBubble.vue): translucent
 * ivory surface, frosted blur, inner-glass shadow. */
.install-banner {
  position: fixed;
  right: max(env(safe-area-inset-right, 0px), 1rem);
  bottom: max(env(safe-area-inset-bottom, 0px), 1rem);
  z-index: 60;
  display: grid;
  gap: 0.7rem;
  width: min(360px, calc(100vw - 2rem));
  padding: 0.95rem 1rem 0.85rem;
  border-radius: var(--radius-card, 16px);
  border: 1px solid rgb(var(--color-line) / 0.6);
  background: rgb(var(--color-ivory) / 0.62);
  backdrop-filter: blur(14px) saturate(1.5);
  -webkit-backdrop-filter: blur(14px) saturate(1.5);
  box-shadow: var(--shadow-glass), var(--shadow-inner-glass);
  color: rgb(var(--color-ink));
}

.install-banner__close {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: inline-grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-line) / 0.5);
  background: rgb(var(--color-surface-raised) / 0.7);
  color: rgb(var(--color-muted));
  transition: color 140ms ease, background-color 140ms ease;
}

.install-banner__close:hover {
  color: rgb(var(--color-ink));
  background: rgb(var(--color-surface-raised));
}

.install-banner__body {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
}

.install-banner__body--ios {
  flex-direction: column;
  gap: 0.6rem;
}

.install-banner__heading {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
}

.install-banner__icon {
  display: inline-grid;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 9px;
  border: 1px solid rgb(var(--color-line) / 0.6);
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: var(--shadow-glow-accent);
}

.install-banner__copy {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.install-banner__copy strong {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
}

.install-banner__copy p {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: rgb(var(--color-muted));
}

.install-steps {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.install-steps li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 11.5px;
  line-height: 1.4;
  color: rgb(var(--color-ink) / 0.86);
}

.install-step__badge {
  display: inline-grid;
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 8px;
  border: 1px solid rgb(var(--color-line) / 0.6);
  background: rgb(var(--color-surface-raised) / 0.85);
  color: rgb(var(--color-action));
  box-shadow: var(--shadow-inner-glass);
}

.install-banner__actions {
  display: flex;
  justify-content: flex-end;
}

.install-banner__action {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.95rem;
  min-height: 34px;
  border-radius: 999px;
  border: 1px solid rgb(var(--color-action) / 0.5);
  background: var(--gradient-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  box-shadow: var(--shadow-glass);
  transition: transform 140ms var(--motion-press), box-shadow 160ms ease;
}

.install-banner__action:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-glass), var(--shadow-glow-accent);
}

.install-banner__action:active {
  transform: translateY(1px);
}

.install-banner__dismiss {
  justify-self: start;
  padding: 0.25rem 0.1rem;
  border: 0;
  background: transparent;
  color: rgb(var(--color-muted));
  font-size: 11px;
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: rgb(var(--color-line-strong) / 0.4);
}

.install-banner__dismiss:hover {
  color: rgb(var(--color-ink));
}

.install-pop-enter-from,
.install-pop-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

.install-pop-enter-active,
.install-pop-leave-active {
  transition: opacity 0.26s ease, transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .install-pop-enter-active,
  .install-pop-leave-active {
    transition: none;
  }
}

@media (max-width: 639px) {
  .install-banner {
    right: 0.75rem;
    left: 0.75rem;
    width: auto;
    bottom: max(env(safe-area-inset-bottom, 0px), 0.75rem);
  }
}
</style>
