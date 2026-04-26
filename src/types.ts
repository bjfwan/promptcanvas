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

export interface GenerationHistoryItem extends GenerateImageRequest {
  id: string
  createdAt: string
  requestId?: string
  imageCount: number
}

export interface PromptTemplate {
  id: string
  title: string
  tone: string
  prompt: string
  style: ImageStyle
  size: ImageSize
}
