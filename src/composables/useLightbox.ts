import { reactive } from 'vue'
import type { GeneratedImage } from '../types'

export type LightboxMode = 'view' | 'edit'

interface LightboxState {
  open: boolean
  images: GeneratedImage[]
  index: number
  mode: LightboxMode
}

const state = reactive<LightboxState>({
  open: false,
  images: [],
  index: 0,
  mode: 'view',
})

export function useLightbox() {
  function open(images: GeneratedImage[], index = 0) {
    if (!images.length) return
    state.images = images
    state.index = Math.max(0, Math.min(index, images.length - 1))
    state.mode = 'view'
    state.open = true
  }

  /** Open in edit (inpaint) mode for a single image. */
  function openForEdit(images: GeneratedImage[], index = 0) {
    if (!images.length) return
    state.images = images
    state.index = Math.max(0, Math.min(index, images.length - 1))
    state.mode = 'edit'
    state.open = true
  }

  function close() {
    state.open = false
    state.mode = 'view'
  }

  function switchToView() {
    state.mode = 'view'
  }

  function switchToEdit() {
    state.mode = 'edit'
  }

  function next() {
    if (!state.images.length) return
    state.index = (state.index + 1) % state.images.length
  }

  function prev() {
    if (!state.images.length) return
    state.index = (state.index - 1 + state.images.length) % state.images.length
  }

  function setIndex(value: number) {
    if (!state.images.length) return
    state.index = Math.max(0, Math.min(value, state.images.length - 1))
  }

  return { state, open, openForEdit, close, switchToView, switchToEdit, next, prev, setIndex }
}
