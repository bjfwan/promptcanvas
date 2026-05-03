import { onUnmounted, ref, type Ref } from 'vue'
import {
  allowedReferenceImageMimeTypes,
  maxReferenceImageSizeBytes,
  maxReferenceImages,
} from '../lib/imagesApi'
import { createId } from '../lib/id'
import type { ReferenceImageAttachment } from '../types'
import type { useToast } from './useToast'

type Toast = ReturnType<typeof useToast>

function resolveReferenceMimeType(file: File): string {
  const explicit = (file.type || '').trim().toLowerCase()
  if (explicit) return explicit

  const lowerName = file.name.toLowerCase()
  if (lowerName.endsWith('.png')) return 'image/png'
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg'
  if (lowerName.endsWith('.webp')) return 'image/webp'
  if (lowerName.endsWith('.gif')) return 'image/gif'
  return ''
}

export function useReferenceImages(deps: { toast: Toast }) {
  const items: Ref<ReferenceImageAttachment[]> = ref([])
  const ownedPreviewUrls = new Set<string>()

  function createAttachment(file: File): ReferenceImageAttachment {
    const previewUrl = URL.createObjectURL(file)
    ownedPreviewUrls.add(previewUrl)

    return {
      id: createId(),
      name: file.name,
      mimeType: resolveReferenceMimeType(file),
      sizeBytes: file.size,
      previewUrl,
      file,
    }
  }

  function cloneAttachment(attachment: ReferenceImageAttachment): ReferenceImageAttachment {
    if (!attachment.file) {
      return {
        ...attachment,
        id: createId(),
      }
    }

    const previewUrl = URL.createObjectURL(attachment.file)
    ownedPreviewUrls.add(previewUrl)

    return {
      ...attachment,
      id: createId(),
      previewUrl,
      file: attachment.file,
    }
  }

  function releaseUrls(list: ReferenceImageAttachment[]) {
    list.forEach((image) => {
      if (!ownedPreviewUrls.has(image.previewUrl)) return
      URL.revokeObjectURL(image.previewUrl)
      ownedPreviewUrls.delete(image.previewUrl)
    })
  }

  function clear() {
    releaseUrls(items.value)
    items.value = []
  }

  function add(files: File[]) {
    if (!files.length) return

    if (items.value.length >= maxReferenceImages) {
      deps.toast.info(`最多添加 ${maxReferenceImages} 张参考图`)
      return
    }

    const remaining = Math.max(0, maxReferenceImages - items.value.length)
    const candidates = files.slice(0, remaining)
    const existingKeys = new Set(
      items.value.map((image) => `${image.name}:${image.sizeBytes}:${image.mimeType}`),
    )
    const accepted: ReferenceImageAttachment[] = []
    const rejected: string[] = []

    for (const file of candidates) {
      const mimeType = resolveReferenceMimeType(file)
      const identity = `${file.name}:${file.size}:${mimeType}`

      if (!allowedReferenceImageMimeTypes.has(mimeType)) {
        rejected.push(`${file.name} 格式不支持`)
        continue
      }

      if (file.size > maxReferenceImageSizeBytes) {
        rejected.push(`${file.name} 超过 ${Math.round(maxReferenceImageSizeBytes / 1024 / 1024)}MB`)
        continue
      }

      if (existingKeys.has(identity)) {
        rejected.push(`${file.name} 已添加过`)
        continue
      }

      existingKeys.add(identity)
      accepted.push(createAttachment(file))
    }

    if (accepted.length) {
      items.value = [...items.value, ...accepted]
      deps.toast.success(`已添加 ${accepted.length} 张参考图`)
    }

    if (files.length > candidates.length) {
      rejected.push(`最多添加 ${maxReferenceImages} 张参考图`)
    }

    if (rejected.length) {
      deps.toast.info(rejected[0], rejected.length > 1 ? `另有 ${rejected.length - 1} 项未加入` : undefined)
    }
  }

  function remove(id: string) {
    const removed = items.value.find((image) => image.id === id)
    if (removed) {
      releaseUrls([removed])
    }
    items.value = items.value.filter((image) => image.id !== id)
  }

  function cloneList(list: ReferenceImageAttachment[]): ReferenceImageAttachment[] {
    return list.map(cloneAttachment)
  }

  onUnmounted(() => {
    ownedPreviewUrls.forEach((url) => {
      URL.revokeObjectURL(url)
    })
    ownedPreviewUrls.clear()
  })

  return { items, add, remove, clear, cloneList }
}
