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

export type ImageStyle =
  | 'natural'
  | 'poster'
  | 'product'
  | 'portrait'
  | 'anime'
  | 'cinematic'
  | 'logo'
  | 'interior'
  | 'raw'

export type ImageQuality = 'auto' | 'low' | 'medium' | 'high'

export type GenerationMode = 'text' | 'reference'

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
  referenceImages?: ReferenceImageAttachment[]
  baseUrl?: string
  apiKey?: string
}

export interface ProviderConfig {
  baseUrl: string
  apiKey: string
  proxyUrl?: string
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

export interface PromptTemplate {
  id: string
  title: string
  tone: string
  prompt: string
  style: ImageStyle
  size: ImageSize
}

export interface ChatMessageMeta {
  style: ImageStyle
  size: ImageSize
  count: number
  outputFormat: GenerateImageRequest['outputFormat']
  generationMode?: GenerationMode
  model?: string
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
