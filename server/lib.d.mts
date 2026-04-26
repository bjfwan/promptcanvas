// 类型声明：让 TypeScript 在 functions/ 中 import server/lib.mjs 时获得完整类型。
// 仅描述对外契约，实际实现见 lib.mjs。

export const allowedSizes: ReadonlySet<string>
export const allowedFormats: ReadonlySet<string>
export const allowedQualities: ReadonlySet<string>
export const mimeTypes: Readonly<Record<'png' | 'jpeg' | 'webp', string>>
export const stylePrompts: Readonly<Record<string, string>>

export interface ValidatedPayload {
  prompt: string
  style: string
  size: string
  count: number
  outputFormat: string
  negativePrompt: string
  quality: string
  creativity: number | null
  seed: string
}

export type ValidatePayloadResult =
  | { error: string; value?: undefined }
  | { error?: undefined; value: ValidatedPayload }

export function isMissingApiKey(apiKey: unknown): boolean
export function validatePayload(body: unknown): ValidatePayloadResult
export function resolveCreativityInstruction(creativity: number | null | undefined): string | null
export function buildPrompt(payload: {
  prompt: string
  style: string
  outputFormat: string
  negativePrompt?: string
  creativity?: number | null
  seed?: string
}): string

export interface NormalizedImage {
  id: string
  url: string | null
  b64Json: string | null
  mimeType: string
  revisedPrompt: string | null
}

export function normalizeImages(response: unknown, outputFormat: string): NormalizedImage[]

export interface ResolvedOpenAIError {
  status: number
  code: 'OPENAI_REQUEST_FAILED' | 'RATE_LIMITED' | 'INVALID_REQUEST'
  message: string
}

export function resolveOpenAIError(error: unknown): ResolvedOpenAIError
