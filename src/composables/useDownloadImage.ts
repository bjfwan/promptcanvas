import type { Ref } from 'vue'
import { resolveImageSource } from '../api'
import type { GeneratedImage } from '../types'
import type { useProviderConfig } from './useProviderConfig'
import type { useToast } from './useToast'

type Toast = ReturnType<typeof useToast>
type ProviderStore = ReturnType<typeof useProviderConfig>

async function fetchAsBlob(url: string, headers?: Record<string, string>): Promise<Blob | null> {
  try {
    const response = await fetch(url, { headers })
    if (!response.ok) return null
    return await response.blob()
  } catch {
    return null
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

export function useDownloadImage(deps: {
  provider: ProviderStore
  toast: Toast
  outputFormat: Ref<string>
}) {
  async function download(image: GeneratedImage, index: number) {
    const source = resolveImageSource(image)

    if (!source) {
      deps.toast.error('这张图片没有可下载地址')
      return
    }

    if (source.startsWith('data:')) {
      const response = await fetch(source)
      const blob = await response.blob()
      const ext = (image.mimeType?.split('/')[1] || deps.outputFormat.value).split(';')[0]
      triggerBlobDownload(blob, `promptcanvas-${Date.now()}-${index + 1}.${ext}`)
      deps.toast.success('图片已下载')
      return
    }

    const extension = image.mimeType?.split('/')[1] || deps.outputFormat.value
    const filename = `promptcanvas-${Date.now()}-${index + 1}.${extension}`

    const direct = await fetchAsBlob(source)
    if (direct) {
      triggerBlobDownload(direct, filename)
      deps.toast.success('图片已下载', filename)
      return
    }

    const proxyUrl = (deps.provider.snapshot().proxyUrl || '').trim().replace(/\/+$/, '')
    if (proxyUrl) {
      try {
        const u = new URL(source)
        const upstreamBase = `${u.protocol}//${u.host}`
        const proxiedUrl = `${proxyUrl}${u.pathname}${u.search}`
        const viaProxy = await fetchAsBlob(proxiedUrl, { 'X-Upstream-Base': upstreamBase })
        if (viaProxy) {
          triggerBlobDownload(viaProxy, filename)
          deps.toast.success('图片已下载（经代理）', filename)
          return
        }
      } catch {}
    }

    try {
      const anchor = document.createElement('a')
      anchor.href = source
      anchor.download = filename
      anchor.target = '_blank'
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      deps.toast.info('已在新标签打开', '原站不允许跨域下载，可右键图片另存为')
    } catch {
      window.open(source, '_blank', 'noopener,noreferrer')
    }
  }

  return { download }
}
