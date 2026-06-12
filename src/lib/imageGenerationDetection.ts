import type {
  ImageCapabilityPartialSupport,
  ImageCapabilitySupport,
  ImageGenerationApiMode,
  ImageGenerationCapabilityMatrix,
  ImageGenerationConfig,
  ImageGenerationDetectionSource,
  ImageGenerationMode,
  ImageGenerationReturnFormat,
} from '../types'

export interface OpenAIModelEntry {
  id: string
  supported_endpoint_types?: unknown
  endpoint_types?: unknown
  supported_endpoints?: unknown
  endpoints?: unknown
}

export interface ImageGenerationProbeCandidate {
  mode: ImageGenerationApiMode
  endpoint: '/images/generations' | '/responses'
  traditionalModel?: string
  responseModel?: string
  imageToolModel?: string
  stream?: boolean
  returnFormat?: ImageGenerationReturnFormat
  textToImage?: ImageCapabilitySupport | boolean
  imageEdit?: ImageCapabilitySupport | boolean
  responsesTool?: ImageCapabilityPartialSupport
  sseStream?: ImageCapabilitySupport | boolean
  partialPreview?: ImageCapabilitySupport | boolean
  transparentBackground?: ImageCapabilitySupport | boolean
}

export interface ImageGenerationProbeResult {
  ok: boolean
  candidate: ImageGenerationProbeCandidate
}

export const defaultImageGenerationCapabilityMatrix: ImageGenerationCapabilityMatrix = {
  textToImage: 'unsupported',
  imageEdit: 'unsupported',
  responsesTool: 'unsupported',
  sseStream: 'unsupported',
  partialPreview: 'unsupported',
  transparentBackground: 'unsupported',
  generationMode: 'auto',
  returnFormat: 'b64_json',
  traditionalModel: undefined,
  responseModel: undefined,
  imageToolModel: undefined,
}

export const defaultImageGenerationConfig: ImageGenerationConfig = {
  ...defaultImageGenerationCapabilityMatrix,
  mode: 'auto',
}

function isGenerationMode(value: unknown): value is ImageGenerationMode {
  return value === 'images_generations'
    || value === 'responses_tool'
    || value === 'responses_text_data_url'
    || value === 'auto'
}

function isReturnFormat(value: unknown): value is ImageGenerationReturnFormat {
  return value === 'b64_json'
    || value === 'url'
    || value === 'image_generation_call'
    || value === 'output_text_data_url'
}

function supportFromUnknown(
  value: unknown,
  fallback: ImageCapabilitySupport,
): ImageCapabilitySupport {
  if (value === 'supported' || value === true) return 'supported'
  if (value === 'unsupported' || value === false) return 'unsupported'
  return fallback
}

function partialSupportFromUnknown(
  value: unknown,
  fallback: ImageCapabilityPartialSupport,
): ImageCapabilityPartialSupport {
  if (value === 'supported' || value === 'partial' || value === 'unsupported') return value
  if (value === true) return 'supported'
  if (value === false) return 'unsupported'
  return fallback
}

function trimString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function defaultReturnFormatForMode(mode: ImageGenerationMode): ImageGenerationReturnFormat {
  if (mode === 'responses_tool') return 'image_generation_call'
  if (mode === 'responses_text_data_url') return 'output_text_data_url'
  return 'b64_json'
}

function defaultMatrixForMode(input: {
  mode: ImageGenerationMode
  traditionalModel?: string
  responseModel?: string
  imageToolModel?: string
  stream?: boolean
}): ImageGenerationCapabilityMatrix {
  const roles = {
    traditionalModel: input.traditionalModel,
    responseModel: input.responseModel,
    imageToolModel: input.imageToolModel,
  }

  if (input.mode === 'images_generations') {
    return {
      textToImage: 'supported',
      imageEdit: input.traditionalModel ? 'supported' : 'unsupported',
      responsesTool: 'unsupported',
      sseStream: 'unsupported',
      partialPreview: 'unsupported',
      generationMode: 'images_generations',
      returnFormat: 'b64_json',
      ...roles,
    }
  }

  if (input.mode === 'responses_tool') {
    const streamSupport = input.stream === false ? 'unsupported' : 'supported'
    return {
      textToImage: 'supported',
      imageEdit: 'supported',
      responsesTool: 'supported',
      sseStream: streamSupport,
      partialPreview: streamSupport,
      generationMode: 'responses_tool',
      returnFormat: 'image_generation_call',
      ...roles,
    }
  }

  if (input.mode === 'responses_text_data_url') {
    return {
      textToImage: 'supported',
      imageEdit: input.traditionalModel ? 'supported' : 'unsupported',
      responsesTool: 'partial',
      sseStream: input.stream ? 'supported' : 'unsupported',
      partialPreview: 'unsupported',
      generationMode: 'responses_text_data_url',
      returnFormat: 'output_text_data_url',
      ...roles,
    }
  }

  return {
    ...defaultImageGenerationCapabilityMatrix,
    ...roles,
  }
}

export function buildCapabilityMatrixFromConfig(
  value: ImageGenerationConfig,
): ImageGenerationCapabilityMatrix {
  const config = normalizeImageGenerationConfig(value)
  return {
    textToImage: config.textToImage,
    imageEdit: config.imageEdit,
    responsesTool: config.responsesTool,
    sseStream: config.sseStream,
    partialPreview: config.partialPreview,
    transparentBackground: config.transparentBackground,
    generationMode: config.generationMode,
    returnFormat: config.returnFormat,
    traditionalModel: config.traditionalModel,
    responseModel: config.responseModel,
    imageToolModel: config.imageToolModel,
  }
}

export function normalizeImageGenerationConfig(value: unknown): ImageGenerationConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultImageGenerationConfig }
  }

  const raw = value as Record<string, unknown>
  const mode = isGenerationMode(raw.generationMode)
    ? raw.generationMode
    : (isGenerationMode(raw.mode) ? raw.mode : 'auto')
  const stream = typeof raw.stream === 'boolean' ? raw.stream : undefined
  const traditionalModel = trimString(raw.traditionalModel)
  const responseModel = trimString(raw.responseModel)
  const imageToolModel = trimString(raw.imageToolModel)
  const defaults = defaultMatrixForMode({
    mode,
    traditionalModel,
    responseModel,
    imageToolModel,
    stream,
  })

  const config: ImageGenerationConfig = {
    ...defaults,
    mode,
    generationMode: mode,
    returnFormat: isReturnFormat(raw.returnFormat)
      ? raw.returnFormat
      : defaults.returnFormat,
    textToImage: supportFromUnknown(raw.textToImage, defaults.textToImage),
    imageEdit: supportFromUnknown(raw.imageEdit, defaults.imageEdit),
    responsesTool: partialSupportFromUnknown(raw.responsesTool, defaults.responsesTool),
    sseStream: supportFromUnknown(raw.sseStream, defaults.sseStream),
    partialPreview: supportFromUnknown(raw.partialPreview, defaults.partialPreview),
    transparentBackground: supportFromUnknown(raw.transparentBackground, defaults.transparentBackground ?? 'unsupported'),
    traditionalModel,
    responseModel,
    imageToolModel,
  }
  if (typeof raw.stream === 'boolean') {
    config.stream = raw.stream
  }
  if (typeof raw.detectedAt === 'string' && raw.detectedAt.trim()) {
    config.detectedAt = raw.detectedAt.trim()
  }
  if (raw.detectionSource === 'models_hint' || raw.detectionSource === 'probe') {
    config.detectionSource = raw.detectionSource
  }

  return config
}

export function parseOpenAIModelsResponse(data: unknown): OpenAIModelEntry[] {
  const rawList = Array.isArray((data as { data?: unknown })?.data)
    ? ((data as { data: unknown[] }).data)
    : []

  const entries: OpenAIModelEntry[] = []
  for (const entry of rawList) {
    if (typeof entry === 'string') {
      entries.push({ id: entry })
      continue
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue

    const record = entry as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    if (!id) continue
    entries.push({
      id,
      supported_endpoint_types: record.supported_endpoint_types,
      endpoint_types: record.endpoint_types,
      supported_endpoints: record.supported_endpoints,
      endpoints: record.endpoints,
    })
  }

  return entries
}

export function modelIdsFromEntries(entries: OpenAIModelEntry[]): string[] {
  return entries.map((entry) => entry.id).filter(Boolean)
}

function endpointTokens(value: unknown): string[] {
  if (typeof value === 'string') return [value.toLowerCase()]
  if (Array.isArray(value)) return value.flatMap(endpointTokens)
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(endpointTokens)
  }
  return []
}

function modelEndpointTokens(entry: OpenAIModelEntry): string[] {
  return [
    ...endpointTokens(entry.supported_endpoint_types),
    ...endpointTokens(entry.endpoint_types),
    ...endpointTokens(entry.supported_endpoints),
    ...endpointTokens(entry.endpoints),
  ]
}

function mentionsEndpoint(entry: OpenAIModelEntry, needles: string[]): boolean {
  const tokens = modelEndpointTokens(entry)
  return tokens.some((token) => needles.some((needle) => token.includes(needle)))
}

function uniqueEntries(entries: OpenAIModelEntry[]): OpenAIModelEntry[] {
  const seen = new Set<string>()
  const result: OpenAIModelEntry[] = []
  for (const entry of entries) {
    const id = entry.id.trim()
    const key = id.toLowerCase()
    if (!id || seen.has(key)) continue
    seen.add(key)
    result.push({ ...entry, id })
  }
  return result
}

function rankByPreference(entries: OpenAIModelEntry[], preferences: string[]): string {
  const lowerPreferences = preferences.map((entry) => entry.toLowerCase())
  const ranked = [...entries].sort((a, b) => {
    const aLower = a.id.toLowerCase()
    const bLower = b.id.toLowerCase()
    const aExact = lowerPreferences.indexOf(aLower)
    const bExact = lowerPreferences.indexOf(bLower)
    if (aExact !== -1 || bExact !== -1) {
      if (aExact === -1) return 1
      if (bExact === -1) return -1
      return aExact - bExact
    }

    const aContains = lowerPreferences.findIndex((pref) => aLower.includes(pref))
    const bContains = lowerPreferences.findIndex((pref) => bLower.includes(pref))
    if (aContains !== -1 || bContains !== -1) {
      if (aContains === -1) return 1
      if (bContains === -1) return -1
      return aContains - bContains
    }

    return a.id.localeCompare(b.id)
  })

  return ranked[0]?.id || ''
}

function isLikelyImageModel(id: string): boolean {
  const lower = id.toLowerCase()
  if (lower.includes('embedding') || lower.includes('whisper') || lower.includes('tts')) return false
  return lower.includes('image')
    || lower.includes('dall-e')
    || lower.includes('dalle')
    || lower.includes('flux')
    || lower.includes('imagen')
}

function isLikelyResponseOuterModel(entry: OpenAIModelEntry): boolean {
  const lower = entry.id.toLowerCase()
  return mentionsEndpoint(entry, ['responses'])
    || (isLikelyImageModel(entry.id) && (lower.includes('-chat') || lower.includes('chat')))
}

function isLikelyTraditionalImageModel(entry: OpenAIModelEntry): boolean {
  const lower = entry.id.toLowerCase()
  return mentionsEndpoint(entry, ['images/generations', 'image_generation', 'image-generations'])
    || (isLikelyImageModel(entry.id) && !lower.includes('-chat') && !lower.includes('chat'))
}

export function inferImageGenerationConfigFromModels(
  entries: OpenAIModelEntry[],
  options?: {
    detectedAt?: string
    detectionSource?: ImageGenerationDetectionSource
  },
): ImageGenerationConfig {
  const models = uniqueEntries(entries)
  const responseOuterCandidates = models.filter(isLikelyResponseOuterModel)
  const traditionalCandidates = models.filter(isLikelyTraditionalImageModel)

  const responseModel = rankByPreference(responseOuterCandidates, [
    'gpt-image-2-chat',
    'gpt-image-2-chat-priority',
    'gpt-image-2-chat-codex',
    'gpt-image-1-chat',
  ])
  const imageToolModel = rankByPreference(traditionalCandidates, [
    'gpt-image-2',
    'gpt-image-1',
    'dall-e-3',
    'dall-e-2',
  ])
  const traditionalModel = rankByPreference(traditionalCandidates, [
    'gpt-image-2',
    'gpt-image-1',
    'dall-e-3',
    'dall-e-2',
  ])

  const metadata = {
    detectedAt: options?.detectedAt,
    detectionSource: options?.detectionSource ?? 'models_hint',
  }

  if (responseModel && imageToolModel) {
    return normalizeImageGenerationConfig({
      mode: 'responses_tool',
      responseModel,
      imageToolModel,
      traditionalModel: traditionalModel || undefined,
      stream: true,
      ...metadata,
    })
  }

  if (traditionalModel) {
    return normalizeImageGenerationConfig({
      mode: 'images_generations',
      traditionalModel,
      stream: false,
      ...metadata,
    })
  }

  return normalizeImageGenerationConfig({
    mode: 'auto',
    ...metadata,
  })
}

export function buildImageGenerationProbeCandidates(
  config: ImageGenerationConfig,
): ImageGenerationProbeCandidate[] {
  const candidates: ImageGenerationProbeCandidate[] = []
  if (config.responseModel && config.imageToolModel) {
    const stream = config.stream ?? true
    candidates.push({
      mode: 'responses_tool',
      endpoint: '/responses',
      responseModel: config.responseModel,
      imageToolModel: config.imageToolModel,
      stream,
      returnFormat: 'image_generation_call',
      responsesTool: 'supported',
      sseStream: stream,
      partialPreview: stream,
    })
  } else if (config.traditionalModel) {
    candidates.push({
      mode: 'responses_text_data_url',
      endpoint: '/responses',
      responseModel: config.responseModel || config.traditionalModel,
      traditionalModel: config.traditionalModel,
      stream: true,
      returnFormat: 'output_text_data_url',
      responsesTool: 'partial',
      partialPreview: false,
    })
  }
  if (config.traditionalModel) {
    candidates.push({
      mode: 'images_generations',
      endpoint: '/images/generations',
      traditionalModel: config.traditionalModel,
      stream: false,
      returnFormat: 'b64_json',
      responsesTool: 'unsupported',
      partialPreview: false,
    })
  }
  return candidates
}

export async function detectImageGenerationConfig(input: {
  models: OpenAIModelEntry[]
  detectedAt?: string
  probe?: (candidate: ImageGenerationProbeCandidate) => Promise<ImageGenerationProbeResult>
}): Promise<ImageGenerationConfig> {
  const hinted = inferImageGenerationConfigFromModels(input.models, {
    detectedAt: input.detectedAt,
    detectionSource: 'models_hint',
  })

  if (!input.probe) return hinted

  for (const candidate of buildImageGenerationProbeCandidates(hinted)) {
    const result = await input.probe(candidate)
    if (result.ok) {
      return normalizeImageGenerationConfig({
        ...hinted,
        mode: result.candidate.mode,
        generationMode: result.candidate.mode,
        traditionalModel: result.candidate.traditionalModel ?? hinted.traditionalModel,
        responseModel: result.candidate.responseModel ?? hinted.responseModel,
        imageToolModel: result.candidate.imageToolModel ?? hinted.imageToolModel,
        stream: result.candidate.stream,
        returnFormat: result.candidate.returnFormat,
        textToImage: result.candidate.textToImage,
        imageEdit: result.candidate.imageEdit,
        responsesTool: result.candidate.responsesTool,
        sseStream: result.candidate.sseStream,
        partialPreview: result.candidate.partialPreview,
        transparentBackground: result.candidate.transparentBackground,
        detectedAt: input.detectedAt,
        detectionSource: 'probe',
      })
    }
  }

  return hinted
}
