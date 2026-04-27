export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024'

export type ImageStyle =
  | 'natural'
  | 'poster'
  | 'product'
  | 'portrait'
  | 'anime'
  | 'cinematic'
  | 'logo'
  | 'interior'

export type ImageQuality = 'auto' | 'low' | 'medium' | 'high'

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

export interface GenerationHistoryItem extends Omit<GenerateImageRequest, 'apiKey' | 'baseUrl'> {
  id: string
  createdAt: string
  requestId?: string
  imageCount: number
  images?: GeneratedImage[]
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
  model?: string
  quality?: ImageQuality
  creativity?: number
  seed?: string
  negativePrompt?: string
}

export interface ChatUserMessage {
  id: string
  role: 'user'
  content: string
  createdAt: string
  meta: ChatMessageMeta
}

export interface ChatAssistantMessage {
  id: string
  role: 'assistant'
  status: 'pending' | 'success' | 'error'
  createdAt: string
  replyTo: string
  meta: ChatMessageMeta
  images?: GeneratedImage[]
  requestId?: string
  errorMessage?: string
  errorCode?: string
  elapsedSeconds?: number
}

export type ChatMessage = ChatUserMessage | ChatAssistantMessage
