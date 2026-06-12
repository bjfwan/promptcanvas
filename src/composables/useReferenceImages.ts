import { onUnmounted, shallowRef, type Ref } from 'vue'
import {
  allowedReferenceImageMimeTypes,
  maxReferenceImageSizeBytes,
  maxReferenceImages,
} from '../lib/imagesApi'
import { createId } from '../lib/id'
import { t } from '../lib/i18n'
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
  const items: Ref<ReferenceImageAttachment[]> = shallowRef([])
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

  function trackPreviewUrl(url: string) {
    if (/^blob:/i.test(url)) {
      ownedPreviewUrls.add(url)
    }
  }

  function clear() {
    releaseUrls(items.value)
    items.value = []
  }

  function add(files: File[]) {
    if (!files.length) return

    if (items.value.length >= maxReferenceImages) {
      deps.toast.info(t('reference.limit', { max: maxReferenceImages }))
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
        rejected.push(t('reference.unsupported', { name: file.name }))
        continue
      }

      if (file.size > maxReferenceImageSizeBytes) {
        rejected.push(t('reference.tooLarge', {
          name: file.name,
          max: Math.round(maxReferenceImageSizeBytes / 1024 / 1024),
        }))
        continue
      }

      if (existingKeys.has(identity)) {
        rejected.push(t('reference.duplicate', { name: file.name }))
        continue
      }

      existingKeys.add(identity)
      accepted.push(createAttachment(file))
    }

    if (accepted.length) {
      items.value = [...items.value, ...accepted]
      deps.toast.success(t('reference.added', { count: accepted.length }))
    }

    if (files.length > candidates.length) {
      rejected.push(t('reference.limit', { max: maxReferenceImages }))
    }

    if (rejected.length) {
      deps.toast.info(
        rejected[0],
        rejected.length > 1 ? t('reference.moreRejected', { count: rejected.length - 1 }) : undefined,
      )
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

  return { items, add, remove, clear, cloneList, release: releaseUrls, trackPreviewUrl }
}
