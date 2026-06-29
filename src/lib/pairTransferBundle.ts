import type { ProviderPreset } from '../storage'
import type { ImageGenerationConfig, ProviderConfig } from '../types'
import { defaultImageGenerationConfig, normalizeImageGenerationConfig } from './imageGenerationDetection.js'

export const PAIR_TRANSFER_KIND = 'promptcanvas.pair-transfer'
export const PAIR_TRANSFER_VERSION = 2
export const PAIR_TRANSFER_DEFAULT_PROXY_URL = 'https://proxy.likeyou.qzz.io'

export type PairTransferSource = 'current' | 'preset'
export type PairTransferDuplicateKind = 'none' | 'exact' | 'endpoint'

export interface PairTransferBundle {
  kind: typeof PAIR_TRANSFER_KIND
  version: typeof PAIR_TRANSFER_VERSION
  createdAt: string
  provider?: ProviderConfig
  providerPresets: ProviderPreset[]
}

export type PairTransferPayload = ProviderConfig | PairTransferBundle

export interface PairTransferCandidate {
  importKey: string
  source: PairTransferSource
  incomingId?: string
  label: string
  presetLabel?: string
  baseUrl: string
  apiKey: string
  proxyUrl: string
  imageGeneration?: ImageGenerationConfig
  duplicateKind: PairTransferDuplicateKind
  duplicateLabel?: string
  canImport: boolean
  selectedByDefault: boolean
}

export interface PairTransferPlan {
  provider?: ProviderConfig
  candidates: PairTransferCandidate[]
  summary: {
    totalCount: number
    newCount: number
    exactDuplicateCount: number
    endpointDuplicateCount: number
  }
}

export interface PairTransferApplyResult {
  presets: ProviderPreset[]
  appliedProvider?: ProviderConfig
  importedCount: number
  skippedExactDuplicateCount: number
}

interface BuildBundleInput {
  currentProvider: ProviderConfig
  providerPresets: ProviderPreset[]
  now?: () => string
}

interface AnalyzePayloadInput {
  currentProvider?: ProviderConfig
  existingPresets: ProviderPreset[]
}

interface ApplySelectionInput {
  plan: PairTransferPlan
  existingPresets: ProviderPreset[]
  selectedKeys: string[]
  createId: () => string
}

interface RelayRecord {
  source: PairTransferSource
  incomingId?: string
  label?: string
  baseUrl: string
  apiKey: string
  proxyUrl: string
  imageGeneration?: ImageGenerationConfig
}

interface ExistingRelay {
  id: string
  label?: string
  baseUrl: string
  apiKey: string
  proxyUrl: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
}

function normalizeCredential(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeProviderConfig(value: unknown): ProviderConfig | null {
  if (!isRecord(value)) return null

  const baseUrl = normalizeUrl(value.baseUrl)
  const apiKey = normalizeCredential(value.apiKey)
  if (!baseUrl || !apiKey) return null

  const proxyUrl = normalizeUrl(value.proxyUrl) || PAIR_TRANSFER_DEFAULT_PROXY_URL
  const imageGeneration = normalizeImageGenerationConfig(value.imageGeneration)

  return { baseUrl, apiKey, proxyUrl, imageGeneration }
}

function normalizePreset(value: unknown): ProviderPreset | null {
  if (!isRecord(value)) return null

  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : ''
  const baseUrl = normalizeUrl(value.baseUrl)
  const apiKey = normalizeCredential(value.apiKey)
  if (!baseUrl || !apiKey) return null

  const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim() : undefined
  const proxyUrl = normalizeUrl(value.proxyUrl) || PAIR_TRANSFER_DEFAULT_PROXY_URL

  return { id, label, baseUrl, apiKey, proxyUrl }
}

function relayFromProvider(provider: ProviderConfig): RelayRecord {
  return {
    source: 'current',
    label: undefined,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    proxyUrl: provider.proxyUrl || PAIR_TRANSFER_DEFAULT_PROXY_URL,
    imageGeneration: provider.imageGeneration,
  }
}

function relayFromPreset(preset: ProviderPreset): RelayRecord {
  return {
    source: 'preset',
    incomingId: preset.id,
    label: preset.label,
    baseUrl: preset.baseUrl,
    apiKey: preset.apiKey,
    proxyUrl: preset.proxyUrl || PAIR_TRANSFER_DEFAULT_PROXY_URL,
  }
}

function exactFingerprint(value: { baseUrl: string; apiKey: string; proxyUrl?: string }): string {
  return [
    normalizeUrl(value.baseUrl).toLowerCase(),
    normalizeCredential(value.apiKey),
    normalizeUrl(value.proxyUrl) || PAIR_TRANSFER_DEFAULT_PROXY_URL,
  ].join('\n')
}

function endpointFingerprint(value: { baseUrl: string }): string {
  return normalizeUrl(value.baseUrl).toLowerCase()
}

function existingLabel(value: ExistingRelay): string {
  return value.label?.trim() || value.baseUrl
}

function shortKey(source: PairTransferSource, index: number, relay: RelayRecord): string {
  const id = relay.incomingId ? relay.incomingId.replace(/\s+/g, '-') : ''
  return `${source}:${id || index}:${endpointFingerprint(relay)}`
}

function normalizePayload(payload: PairTransferPayload | unknown): {
  provider?: ProviderConfig
  presets: ProviderPreset[]
} {
  if (isRecord(payload) && payload.kind === PAIR_TRANSFER_KIND) {
    const provider = normalizeProviderConfig(payload.provider)
    const presets = Array.isArray(payload.providerPresets)
      ? payload.providerPresets.map(normalizePreset).filter((preset): preset is ProviderPreset => Boolean(preset))
      : []
    return { provider: provider ?? undefined, presets }
  }

  const provider = normalizeProviderConfig(payload)
  return { provider: provider ?? undefined, presets: [] }
}

function normalizeExisting(input: AnalyzePayloadInput): ExistingRelay[] {
  const relays: ExistingRelay[] = input.existingPresets
    .map((preset) => normalizePreset(preset))
    .filter((preset): preset is ProviderPreset => Boolean(preset))
    .map((preset) => ({
      id: preset.id,
      label: preset.label,
      baseUrl: preset.baseUrl,
      apiKey: preset.apiKey,
      proxyUrl: preset.proxyUrl || PAIR_TRANSFER_DEFAULT_PROXY_URL,
    }))

  const currentProvider = normalizeProviderConfig(input.currentProvider)
  if (currentProvider) {
    relays.push({
      id: 'current',
      label: 'Current config',
      baseUrl: currentProvider.baseUrl,
      apiKey: currentProvider.apiKey,
      proxyUrl: currentProvider.proxyUrl || PAIR_TRANSFER_DEFAULT_PROXY_URL,
    })
  }

  return relays
}

function existingFromCandidate(candidate: PairTransferCandidate, id: string): ExistingRelay {
  return {
    id,
    label: candidate.label,
    baseUrl: candidate.baseUrl,
    apiKey: candidate.apiKey,
    proxyUrl: candidate.proxyUrl || PAIR_TRANSFER_DEFAULT_PROXY_URL,
  }
}

function createCandidate(relay: RelayRecord, index: number, existing: ExistingRelay[]): PairTransferCandidate {
  const exact = existing.find((item) => exactFingerprint(item) === exactFingerprint(relay))
  const endpoint = exact
    ? undefined
    : existing.find((item) => endpointFingerprint(item) === endpointFingerprint(relay))
  const duplicateKind: PairTransferDuplicateKind = exact ? 'exact' : endpoint ? 'endpoint' : 'none'
  const canImport = duplicateKind !== 'exact'

  return {
    importKey: shortKey(relay.source, index, relay),
    source: relay.source,
    incomingId: relay.incomingId,
    label: relay.source === 'current' ? 'Current config' : relay.label?.trim() || relay.baseUrl,
    presetLabel: relay.source === 'preset' ? relay.label?.trim() || undefined : undefined,
    baseUrl: relay.baseUrl,
    apiKey: relay.apiKey,
    proxyUrl: relay.proxyUrl || PAIR_TRANSFER_DEFAULT_PROXY_URL,
    imageGeneration: relay.imageGeneration,
    duplicateKind,
    duplicateLabel: exact ? existingLabel(exact) : endpoint ? existingLabel(endpoint) : undefined,
    canImport,
    selectedByDefault: duplicateKind === 'none',
  }
}

export function buildPairTransferBundle(input: BuildBundleInput): PairTransferBundle {
  const provider = normalizeProviderConfig(input.currentProvider) ?? {
    baseUrl: '',
    apiKey: '',
    proxyUrl: PAIR_TRANSFER_DEFAULT_PROXY_URL,
    imageGeneration: { ...defaultImageGenerationConfig },
  }
  const providerPresets = input.providerPresets
    .map(normalizePreset)
    .filter((preset): preset is ProviderPreset => Boolean(preset))

  return {
    kind: PAIR_TRANSFER_KIND,
    version: PAIR_TRANSFER_VERSION,
    createdAt: input.now?.() ?? new Date().toISOString(),
    provider,
    providerPresets,
  }
}

export function analyzePairTransferPayload(
  payload: PairTransferPayload | unknown,
  input: AnalyzePayloadInput,
): PairTransferPlan {
  const normalized = normalizePayload(payload)
  const relays = [
    ...(normalized.provider ? [relayFromProvider(normalized.provider)] : []),
    ...normalized.presets.map(relayFromPreset),
  ]
  const comparisonPool = normalizeExisting(input)
  const candidates = relays.map((relay, index) => {
    const candidate = createCandidate(relay, index, comparisonPool)
    comparisonPool.push(existingFromCandidate(candidate, candidate.importKey))
    return candidate
  })

  return {
    provider: normalized.provider,
    candidates,
    summary: {
      totalCount: candidates.length,
      newCount: candidates.filter((candidate) => candidate.duplicateKind === 'none').length,
      exactDuplicateCount: candidates.filter((candidate) => candidate.duplicateKind === 'exact').length,
      endpointDuplicateCount: candidates.filter((candidate) => candidate.duplicateKind === 'endpoint').length,
    },
  }
}

export function defaultPairTransferSelection(plan: PairTransferPlan): string[] {
  return plan.candidates
    .filter((candidate) => candidate.selectedByDefault && candidate.canImport)
    .map((candidate) => candidate.importKey)
}

export function applyPairTransferSelection(input: ApplySelectionInput): PairTransferApplyResult {
  const selected = new Set(input.selectedKeys)
  const presets = input.existingPresets
    .map(normalizePreset)
    .filter((preset): preset is ProviderPreset => Boolean(preset))
  const seenExact = new Set(presets.map(exactFingerprint))
  let importedCount = 0
  let skippedExactDuplicateCount = 0
  let appliedProvider: ProviderConfig | undefined

  for (const candidate of input.plan.candidates) {
    if (!selected.has(candidate.importKey)) continue

    if (candidate.source === 'current') {
      appliedProvider = {
        baseUrl: candidate.baseUrl,
        apiKey: candidate.apiKey,
        proxyUrl: candidate.proxyUrl || PAIR_TRANSFER_DEFAULT_PROXY_URL,
        imageGeneration: normalizeImageGenerationConfig(candidate.imageGeneration),
      }
    }

    const fingerprint = exactFingerprint(candidate)
    if (!candidate.canImport || seenExact.has(fingerprint)) {
      skippedExactDuplicateCount += 1
      continue
    }

    seenExact.add(fingerprint)
    presets.push({
      id: input.createId(),
      label: candidate.source === 'preset' ? candidate.presetLabel : undefined,
      baseUrl: candidate.baseUrl,
      apiKey: candidate.apiKey,
      proxyUrl: candidate.proxyUrl || PAIR_TRANSFER_DEFAULT_PROXY_URL,
    })
    importedCount += 1
  }

  return {
    presets,
    appliedProvider,
    importedCount,
    skippedExactDuplicateCount,
  }
}
