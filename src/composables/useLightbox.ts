import { reactive } from 'vue'
import type { GeneratedImage } from '../types'

interface LightboxState {
  open: boolean
  images: GeneratedImage[]
  index: number
}

const state = reactive<LightboxState>({
  open: false,
  images: [],
  index: 0,
})

export function useLightbox() {
  function open(images: GeneratedImage[], index = 0) {
    if (!images.length) return
    state.images = images
    state.index = Math.max(0, Math.min(index, images.length - 1))
    state.open = true
  }

  function close() {
    state.open = false
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

  return { state, open, close, next, prev, setIndex }
}
