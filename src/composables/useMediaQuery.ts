import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(typeof window !== 'undefined' ? window.matchMedia(query).matches : false)
  let mediaQuery: MediaQueryList | null = null

  function sync() {
    matches.value = mediaQuery?.matches ?? false
  }

  onMounted(() => {
    if (typeof window === 'undefined') return
    mediaQuery = window.matchMedia(query)
    sync()
    mediaQuery.addEventListener('change', sync)
  })

  onBeforeUnmount(() => {
    mediaQuery?.removeEventListener('change', sync)
    mediaQuery = null
  })

  return computed(() => matches.value)
}
