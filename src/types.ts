export type ImageSize =
  | '1024x1024'
  | '1024x1536'
  | '1536x1024'
  | '2048x2048'
  | '2048x3072'
  | '3072x2048'
  | '4096x4096'
  | '4096x6144'
  | '6144x4096'

export type ResolutionTier = '1k' | '2k' | '4k'

export type ImageStyle = 'raw'

export type ImageQuality = 'auto' | 'low' | 'medium' | 'high'

export type GenerationMode = 'text' | 'reference'

export type ImageGenerationApiMode =
  | 'images_generations'
  | 'responses_tool'
  | 'responses_text_data_url'

export type ImageGenerationMode = 'auto' | ImageGenerationApiMode

export type ImageGenerationDetectionSource = 'models_hint' | 'probe'

export type ModelSelectionMode = 'auto' | 'none' | 'explicit'

export type ImageCapabilitySupport = 'supported' | 'unsupported'

export type ImageCapabilityPartialSupport = ImageCapabilitySupport | 'partial'

export type ImageGenerationReturnFormat =
  | 'b64_json'
  | 'url'
  | 'image_generation_call'
  | 'output_text_data_url'

export interface ImageGenerationCapabilityMatrix {
  textToImage: ImageCapabilitySupport
  imageEdit: ImageCapabilitySupport
  responsesTool: ImageCapabilityPartialSupport
  sseStream: ImageCapabilitySupport
  partialPreview: ImageCapabilitySupport
  transparentBackground?: ImageCapabilitySupport
  generationMode: ImageGenerationMode
  returnFormat: ImageGenerationReturnFormat
  traditionalModel?: string
  responseModel?: string
  imageToolModel?: string
}

export interface ImageGenerationConfig extends ImageGenerationCapabilityMatrix {
  /** Backward-compatible alias for generationMode. */
  mode: ImageGenerationMode
  stream?: boolean
  detectedAt?: string
  detectionSource?: ImageGenerationDetectionSource
}

export interface ReferenceImageAttachment {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  previewUrl: string
  file?: File
}

export interface GenerateImageRequest {
  prompt: string
  style: ImageStyle
  size: ImageSize
  count: number
  outputFormat: 'png' | 'jpeg' | 'webp'
  negativePrompt?: string
  quality?: ImageQuality
  creativity?: number
  seed?: string
  model?: string
  modelSelection?: ModelSelectionMode
  transparentBackground?: boolean
  /**
   * Transport mode for OpenAI-compatible image generation.
   * `images_generations` uses /images/generations (and /images/edits for references).
   * `responses_tool` uses /responses with the image_generation tool.
   */
  mode?: ImageGenerationApiMode
  /** Responses API model, e.g. gpt-image-2-chat. */
  responseModel?: string
  /** image_generation tool model, e.g. gpt-image-2. */
  imageToolModel?: string
  /** Whether /responses should request SSE streaming. */
  stream?: boolean
  /** User-facing stage-preview preference. Adapter may ignore when unsupported. */
  partialPreview?: boolean
  /** Number of partial previews to request from Responses image tools. */
  partialImages?: number
  /** User-facing streaming wait preference. Adapters that cannot stream ignore it. */
  streamingWait?: boolean
  referenceImages?: ReferenceImageAttachment[]
  /**
   * PNG mask for inpainting. Black = keep, white = edit.
   * Sent as the `mask` field on /images/edits when present.
   * Responses-based image models also accept a data URL or bare base64 string.
   * Requires exactly one referenceImage as the source image.
   */
  inpaintMask?: Blob | string
  baseUrl?: string
  apiKey?: string
}

export interface ProviderConfig {
  baseUrl: string
  apiKey: string
  proxyUrl?: string
  imageGeneration: ImageGenerationConfig
}

export interface GeneratedImage {
  id?: string
  url?: string | null
  b64Json?: string | null
  mimeType?: string | null
  revisedPrompt?: string | null
  storageKey?: string | null
}

export interface GenerateImageResponse {
  requestId?: string
  images: GeneratedImage[]
  usage?: {
    model?: string
  }
}

export interface HealthResponse {
  ok: boolean
  model?: string
  requestId?: string
}

export interface ApiErrorResponse {
  error?: {
    code?: string
    message?: string
  }
  requestId?: string
}

export interface GenerationHistoryItem extends Omit<GenerateImageRequest, 'apiKey' | 'baseUrl' | 'referenceImages'> {
  id: string
  createdAt: string
  requestId?: string
  imageCount: number
  referenceImageCount?: number
  images?: GeneratedImage[]
  /** Total wall-clock seconds the generation actually took. Used to learn ETAs. */
  elapsedSeconds?: number
}

export interface ChatMessageMeta {
  style: ImageStyle
  size: ImageSize
  count: number
  outputFormat: GenerateImageRequest['outputFormat']
  generationMode?: GenerationMode
  model?: string
  modelSelection?: ModelSelectionMode
  transparentBackground?: boolean
  partialPreview?: boolean
  streamingWait?: boolean
  quality?: ImageQuality
  creativity?: number
  seed?: string
  negativePrompt?: string
  referenceImageCount?: number
}

export interface ContinuationContext {
  fromMessageId: string
  fromImageId?: string
  fromImageIndex: number
  thumbnailUrl: string
  promptPreview: string
}

export interface ChatUserMessage {
  id: string
  role: 'user'
  content: string
  createdAt: string
  meta: ChatMessageMeta
  referenceImages?: ReferenceImageAttachment[]
  continuedFrom?: ContinuationContext
}

export interface ChatProgressOverride {
  /** Replaces the heuristic stage label (e.g. "下载图片", "等待上游"). */
  stage?: string
  /** Replaces the heuristic remaining label (e.g. "已收 1.2 / 2.4 MB"). */
  remainingLabel?: string
  /** Replaces the heuristic progress estimate when real stream progress exists. */
  progress?: number
  /** Optional blurred preview shown while the final image is still rendering. */
  previewUrl?: string
}

export interface ChatAssistantMessage {
  id: string
  role: 'assistant'
  status: 'pending' | 'success' | 'error'
  content?: string
  createdAt: string
  replyTo: string
  meta: ChatMessageMeta
  images?: GeneratedImage[]
  requestId?: string
  errorMessage?: string
  errorCode?: string
  elapsedSeconds?: number
  /** Live override for stage/remaining label driven by real network progress. */
  progressOverride?: ChatProgressOverride
}

export type ChatMessage = ChatUserMessage | ChatAssistantMessage
