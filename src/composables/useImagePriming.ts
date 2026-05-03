import { resolveImageSource } from '../api'
import type { GeneratedImage } from '../types'

export function useImagePriming() {
  const primedOrigins = new Set<string>()

  function primeOrigin(src: string) {
    if (typeof document === 'undefined' || /^(data|blob):/i.test(src)) return

    try {
      const url = new URL(src, window.location.href)
      if (primedOrigins.has(url.origin)) return

      primedOrigins.add(url.origin)

      const dnsPrefetch = document.createElement('link')
      dnsPrefetch.rel = 'dns-prefetch'
      dnsPrefetch.href = url.origin
      document.head.appendChild(dnsPrefetch)

      const preconnect = document.createElement('link')
      preconnect.rel = 'preconnect'
      preconnect.href = url.origin
      preconnect.crossOrigin = 'anonymous'
      document.head.appendChild(preconnect)
    } catch {
      return
    }
  }

  function primeSource(src: string, fetchPriority: 'high' | 'auto') {
    if (typeof window === 'undefined' || !src) return

    primeOrigin(src)

    const preloader = new Image() as HTMLImageElement & {
      fetchPriority?: 'high' | 'low' | 'auto'
    }

    preloader.decoding = 'async'
    if ('fetchPriority' in preloader) {
      preloader.fetchPriority = fetchPriority
    }
    preloader.src = src

    if (typeof preloader.decode === 'function') {
      void preloader.decode().catch(() => undefined)
    }
  }

  function primeGeneratedImages(list: GeneratedImage[]) {
    list.slice(0, 3).forEach((image, index) => {
      const src = resolveImageSource(image)
      if (!src) return
      primeSource(src, index === 0 ? 'high' : 'auto')
    })
  }

  return { primeGeneratedImages, primeSource, primeOrigin }
}
