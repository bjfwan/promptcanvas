<script setup lang="ts" generic="V extends string | number">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import Icon from './Icon.vue'

export interface SelectOption<V extends string | number = string> {
  value: V
  label: string
  hint?: string
  disabled?: boolean
}

interface Props {
  options: SelectOption<V>[]
  placeholder?: string
  ariaLabel?: string
  id?: string
  size?: 'md' | 'sm'
  variant?: 'default' | 'chip'
  align?: 'start' | 'end'
  emptyText?: string
  showHints?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择…',
  size: 'md',
  variant: 'default',
  align: 'start',
  emptyText: '没有可用选项',
  showHints: true,
})

const value = defineModel<V>({ required: true })

const open = ref(false)
const triggerEl = ref<HTMLButtonElement | null>(null)
const listEl = ref<HTMLUListElement | null>(null)
const activeIndex = ref(-1)
const popoverStyle = ref<Record<string, string>>({})
const popoverPlacement = ref<'down' | 'up'>('down')
const generatedId = useId()
const listboxId = computed(() => `${props.id ?? generatedId}-listbox`)

const selected = computed(() => props.options.find((option) => option.value === value.value))
const triggerLabel = computed(() => selected.value?.label ?? props.placeholder)

const heightClass = computed(() => {
  if (props.variant === 'chip') return 'h-7 text-[11px]'
  return props.size === 'sm' ? 'h-10 text-[12px]' : 'h-11 text-[13px]'
})

let outsideClickHandler: ((event: MouseEvent) => void) | null = null
let scrollHandler: (() => void) | null = null
let resizeHandler: (() => void) | null = null
let searchBuffer = ''
let searchTimer: number | null = null

function findIndex(target: V) {
  return props.options.findIndex((option) => option.value === target)
}

function clampIndex(idx: number) {
  if (props.options.length === 0) return -1
  return ((idx % props.options.length) + props.options.length) % props.options.length
}

function nextEnabled(from: number, direction: 1 | -1): number {
  if (props.options.length === 0) return -1
  let cursor = clampIndex(from)
  for (let i = 0; i < props.options.length; i += 1) {
    if (!props.options[cursor].disabled) return cursor
    cursor = clampIndex(cursor + direction)
  }
  return -1
}

function computePosition() {
  const trigger = triggerEl.value
  if (!trigger) return

  const rect = trigger.getBoundingClientRect()
  const viewportH = window.innerHeight
  const spaceBelow = viewportH - rect.bottom
  const spaceAbove = rect.top
  const desiredMax = 320
  const placement: 'down' | 'up' = spaceBelow >= 200 || spaceBelow >= spaceAbove ? 'down' : 'up'
  const maxHeight = Math.min(desiredMax, placement === 'down' ? spaceBelow - 16 : spaceAbove - 16)

  const top = placement === 'down' ? rect.bottom + 6 : 'auto'
  const bottom = placement === 'up' ? viewportH - rect.top + 6 : 'auto'
  const left = props.align === 'end' ? 'auto' : rect.left
  const right = props.align === 'end' ? window.innerWidth - rect.right : 'auto'

  popoverStyle.value = {
    position: 'fixed',
    top: typeof top === 'number' ? `${top}px` : top,
    bottom: typeof bottom === 'number' ? `${bottom}px` : bottom,
    left: typeof left === 'number' ? `${left}px` : left,
    right: typeof right === 'number' ? `${right}px` : right,
    width: `${Math.max(rect.width, 200)}px`,
    maxHeight: `${Math.max(160, maxHeight)}px`,
    zIndex: '70',
  }
  popoverPlacement.value = placement
}

function ensureActiveVisible() {
  nextTick(() => {
    const list = listEl.value
    if (!list) return
    const item = list.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`)
    if (item) {
      item.scrollIntoView({ block: 'nearest' })
    }
  })
}

function bindOutside() {
  outsideClickHandler = (event: MouseEvent) => {
    const target = event.target as Node
    if (triggerEl.value?.contains(target)) return
    if (listEl.value?.contains(target)) return
    closePopover()
  }
  scrollHandler = () => {
    if (!open.value) return
    computePosition()
  }
  resizeHandler = () => {
    if (!open.value) return
    computePosition()
  }
  document.addEventListener('mousedown', outsideClickHandler, true)
  window.addEventListener('scroll', scrollHandler, true)
  window.addEventListener('resize', resizeHandler)
}

function unbindOutside() {
  if (outsideClickHandler) document.removeEventListener('mousedown', outsideClickHandler, true)
  if (scrollHandler) window.removeEventListener('scroll', scrollHandler, true)
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
  outsideClickHandler = null
  scrollHandler = null
  resizeHandler = null
}

function openPopover() {
  if (open.value) return
  open.value = true
  activeIndex.value = nextEnabled(findIndex(value.value) >= 0 ? findIndex(value.value) : 0, 1)
  nextTick(() => {
    computePosition()
    ensureActiveVisible()
  })
  bindOutside()
}

function closePopover(returnFocus = true) {
  if (!open.value) return
  open.value = false
  unbindOutside()
  if (returnFocus) {
    nextTick(() => {
      triggerEl.value?.focus()
    })
  }
}

function toggle() {
  if (open.value) closePopover()
  else openPopover()
}

function commit(option: SelectOption<V>) {
  if (option.disabled) return
  value.value = option.value
  closePopover()
}

function onTriggerKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowUp':
    case 'Enter':
    case ' ':
      event.preventDefault()
      openPopover()
      break
    case 'Home':
      event.preventDefault()
      openPopover()
      activeIndex.value = nextEnabled(0, 1)
      ensureActiveVisible()
      break
    case 'End':
      event.preventDefault()
      openPopover()
      activeIndex.value = nextEnabled(props.options.length - 1, -1)
      ensureActiveVisible()
      break
  }
}

function onListKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      activeIndex.value = nextEnabled(activeIndex.value + 1, 1)
      ensureActiveVisible()
      break
    case 'ArrowUp':
      event.preventDefault()
      activeIndex.value = nextEnabled(activeIndex.value - 1, -1)
      ensureActiveVisible()
      break
    case 'Home':
      event.preventDefault()
      activeIndex.value = nextEnabled(0, 1)
      ensureActiveVisible()
      break
    case 'End':
      event.preventDefault()
      activeIndex.value = nextEnabled(props.options.length - 1, -1)
      ensureActiveVisible()
      break
    case 'Enter':
    case ' ': {
      event.preventDefault()
      const option = props.options[activeIndex.value]
      if (option) commit(option)
      break
    }
    case 'Escape':
    case 'Tab':
      event.preventDefault()
      closePopover()
      break
    default:
      if (event.key.length === 1 && /\S/.test(event.key)) {
        searchBuffer += event.key.toLowerCase()
        if (searchTimer) window.clearTimeout(searchTimer)
        searchTimer = window.setTimeout(() => {
          searchBuffer = ''
        }, 600)
        const match = props.options.findIndex(
          (option) => !option.disabled && option.label.toLowerCase().startsWith(searchBuffer),
        )
        if (match >= 0) {
          activeIndex.value = match
          ensureActiveVisible()
        }
      }
  }
}

watch(
  () => value.value,
  () => {
    if (open.value) {
      activeIndex.value = nextEnabled(findIndex(value.value), 1)
    }
  },
)

onBeforeUnmount(() => {
  unbindOutside()
  if (searchTimer) window.clearTimeout(searchTimer)
})
</script>

<template>
  <div :class="['relative', variant === 'chip' ? 'inline-block w-auto' : 'inline-block w-full']">
    <button
      :id="id"
      ref="triggerEl"
      type="button"
      role="combobox"
      :aria-haspopup="'listbox'"
      :aria-expanded="open"
      :aria-controls="listboxId"
      :aria-label="ariaLabel"
      class="select-trigger group"
      :class="[
        heightClass,
        variant === 'chip' ? 'select-trigger--chip' : '',
        open ? 'is-open' : '',
        selected ? 'has-value' : 'is-placeholder',
      ]"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span class="select-trigger__label">{{ triggerLabel }}</span>
      <Icon
        name="chevronDown"
        :size="13"
        class="select-trigger__caret"
        :class="{ 'rotate-180': open }"
        aria-hidden="true"
      />
    </button>

    <Teleport to="body">
      <Transition name="select-pop">
        <div
          v-if="open"
          class="select-popover"
          :class="popoverPlacement === 'up' ? 'select-popover--up' : 'select-popover--down'"
          :style="popoverStyle"
        >
          <ul
            :id="listboxId"
            ref="listEl"
            role="listbox"
            tabindex="-1"
            :aria-activedescendant="activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined"
            class="select-list"
            @keydown="onListKeydown"
          >
            <li
              v-for="(option, index) in options"
              :id="`${listboxId}-opt-${index}`"
              :key="String(option.value)"
              role="option"
              :aria-selected="option.value === value"
              :aria-disabled="option.disabled || undefined"
              :data-index="index"
              :data-active="activeIndex === index || undefined"
              :data-selected="option.value === value || undefined"
              :data-disabled="option.disabled || undefined"
              class="select-option"
              @mouseenter="activeIndex = index"
              @click="commit(option)"
            >
              <span class="select-option__check" aria-hidden="true">
                <Icon
                  v-if="option.value === value"
                  name="check"
                  :size="13"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="select-option__label">{{ option.label }}</span>
                <span v-if="option.hint && showHints" class="select-option__hint">{{ option.hint }}</span>
              </span>
            </li>
            <li v-if="!options.length" class="select-option select-option--empty">
              <span class="text-muted">{{ emptyText }}</span>
            </li>
          </ul>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.select-trigger {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  gap: 0.5rem;
  padding: 0 2.25rem 0 0.875rem;
  border-radius: 0.625rem;
  border: 1px solid #dfd3bf; /* line */
  background: rgba(250, 243, 230, 0.65); /* cream/65 */
  color: #1a1612; /* ink */
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 180ms ease, transform 160ms ease;
}

.select-trigger:hover {
  border-color: #c8b89a;
  background: #faf3e6;
}

.select-trigger:focus-visible {
  outline: none;
  border-color: #1a1612;
  box-shadow: 0 0 0 3px rgba(26, 22, 18, 0.12);
}

.select-trigger.is-open {
  border-color: #1a1612;
  background: #f1e9dc; /* paper */
  box-shadow: 0 1px 0 rgba(26, 22, 18, 0.04), 0 0 0 3px rgba(26, 22, 18, 0.08);
}

.select-trigger.is-placeholder {
  color: #6c6357; /* muted */
}

.select-trigger--chip {
  width: auto;
  min-width: 0;
  max-width: 100%;
  border-radius: 999px;
  padding: 0 1.75rem 0 0.625rem;
  background: rgba(253, 248, 237, 0.85);
  border-color: #c8b89a;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.select-trigger--chip:hover {
  background: #faf3e6;
  border-color: #1a1612;
}

.select-trigger--chip.is-open {
  background: #1a1612;
  color: #faf3e6;
  border-color: #1a1612;
  box-shadow: 0 1px 0 rgba(26, 22, 18, 0.04), 0 0 0 3px rgba(26, 22, 18, 0.12);
}

.select-trigger--chip .select-trigger__label {
  font-size: 11px;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
  letter-spacing: 0.04em;
  text-transform: none;
}

.select-trigger--chip .select-trigger__caret {
  right: 0.55rem;
}

.select-trigger__label {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.select-trigger__caret {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: #6c6357;
  transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), color 160ms ease;
}

.select-trigger:hover .select-trigger__caret,
.select-trigger.is-open .select-trigger__caret {
  color: #1a1612;
}

.select-trigger__caret.rotate-180 {
  transform: translateY(-50%) rotate(180deg);
}

.select-popover {
  border-radius: 0.875rem;
  background: rgba(250, 243, 230, 0.98);
  border: 1px solid #c8b89a;
  box-shadow:
    0 1px 0 rgba(26, 22, 18, 0.04),
    0 28px 56px -20px rgba(26, 22, 18, 0.32),
    0 12px 24px -16px rgba(26, 22, 18, 0.18);
  overflow: hidden;
  backdrop-filter: blur(8px);
  transform-origin: var(--pop-origin, top center);
}

.select-popover--down {
  --pop-origin: top center;
}

.select-popover--up {
  --pop-origin: bottom center;
}

.select-list {
  max-height: inherit;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0.375rem;
  margin: 0;
  list-style: none;
  outline: none;
  scrollbar-width: thin;
  scrollbar-color: rgba(26, 22, 18, 0.22) transparent;
}

.select-list::-webkit-scrollbar {
  width: 6px;
}

.select-list::-webkit-scrollbar-thumb {
  background: rgba(26, 22, 18, 0.22);
  border-radius: 999px;
}

.select-option {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.55rem 0.625rem;
  border-radius: 10px;
  cursor: pointer;
  color: #1a1612;
  transition: background-color 140ms ease, color 140ms ease;
  user-select: none;
}

.select-option[data-active] {
  background: rgba(26, 22, 18, 0.06);
}

.select-option[data-selected] {
  background: #1a1612;
  color: #faf3e6;
}

.select-option[data-selected][data-active] {
  background: #1a1612;
}

.select-option[data-disabled] {
  cursor: not-allowed;
  color: #6c6357;
  opacity: 0.55;
}

.select-option--empty {
  cursor: default;
  padding: 0.75rem 0.5rem;
  text-align: center;
  font-size: 12px;
  color: #6c6357;
}

.select-option__check {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  margin-top: 1px;
  width: 16px;
  height: 16px;
  color: inherit;
  opacity: 0.9;
}

.select-option__label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.25;
  letter-spacing: 0.005em;
}

.select-option__hint {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.35;
  color: currentColor;
  opacity: 0.6;
}

.select-option[data-selected] .select-option__hint {
  opacity: 0.7;
}

.select-pop-enter-from,
.select-pop-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
}

.select-popover--up.select-pop-enter-from,
.select-popover--up.select-pop-leave-to {
  transform: scale(0.96) translateY(4px);
}

.select-pop-enter-active {
  transition: opacity 180ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.select-pop-leave-active {
  transition: opacity 140ms ease-out, transform 160ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .select-pop-enter-active,
  .select-pop-leave-active {
    transition: opacity 120ms ease;
    transform: none !important;
  }

  .select-trigger__caret {
    transition: none;
  }
}
</style>
