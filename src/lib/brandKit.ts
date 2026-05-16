import { EMPTY_BRAND_KIT, type BrandKit } from './promptDoc'

export { EMPTY_BRAND_KIT }
export type { BrandKit }

const brandKitKey = 'promptcanvas:brand-kit-v1'

export function loadBrandKit(): BrandKit {
  try {
    const raw = localStorage.getItem(brandKitKey)
    if (!raw) return { ...EMPTY_BRAND_KIT }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...EMPTY_BRAND_KIT }
    }
    const candidate = parsed as Partial<BrandKit>
    return {
      enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : false,
      alwaysInclude: typeof candidate.alwaysInclude === 'string' ? candidate.alwaysInclude : '',
      neverInclude: typeof candidate.neverInclude === 'string' ? candidate.neverInclude : '',
      signaturePalette: typeof candidate.signaturePalette === 'string' ? candidate.signaturePalette : '',
      signatureCamera: typeof candidate.signatureCamera === 'string' ? candidate.signatureCamera : '',
      signatureLighting: typeof candidate.signatureLighting === 'string' ? candidate.signatureLighting : '',
    }
  } catch {
    return { ...EMPTY_BRAND_KIT }
  }
}

export function saveBrandKit(kit: BrandKit) {
  try {
    localStorage.setItem(brandKitKey, JSON.stringify(kit))
  } catch {}
}

export function clearBrandKit() {
  try {
    localStorage.removeItem(brandKitKey)
  } catch {}
}

export function brandKitHasContent(kit: BrandKit): boolean {
  return Boolean(
    kit.alwaysInclude.trim()
      || kit.neverInclude.trim()
      || kit.signaturePalette.trim()
      || kit.signatureCamera.trim()
      || kit.signatureLighting.trim(),
  )
}
