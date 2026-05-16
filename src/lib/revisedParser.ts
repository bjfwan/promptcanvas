import type { ImageQuality, ImageStyle } from '../types'
import { parsePrompt } from './promptParser'
import type { PromptDoc, SlotName } from './promptDoc'
import { inferEnhanceIntent } from './magicEnhance'

const sectionHeaders: Array<{ slot: SlotName; pattern: RegExp }> = [
  { slot: 'subject', pattern: /^(?:subject|主体)[:：]\s*/i },
  { slot: 'action', pattern: /^(?:action|动作)[:：]\s*/i },
  { slot: 'environment', pattern: /^(?:environment|scene|环境|场景)[:：]\s*/i },
  { slot: 'lighting', pattern: /^(?:lighting|light|光位|光线|光影)[:：]\s*/i },
  { slot: 'camera', pattern: /^(?:camera|lens|镜头)[:：]\s*/i },
  { slot: 'composition', pattern: /^(?:composition|framing|构图)[:：]\s*/i },
  { slot: 'palette', pattern: /^(?:palette|colors?|色彩|配色)[:：]\s*/i },
  { slot: 'material', pattern: /^(?:material|texture|材质)[:：]\s*/i },
  { slot: 'mood', pattern: /^(?:mood|atmosphere|氛围)[:：]\s*/i },
  { slot: 'styleAnchor', pattern: /^(?:style|风格)[:：]\s*/i },
]

export function reverseParseRevisedPrompt(args: {
  revisedPrompt: string
  style: ImageStyle
  size: string
  quality?: ImageQuality
  hasReferenceImages?: boolean
  modelName?: string
  count?: number
}): PromptDoc {
  const intent = inferEnhanceIntent(args.style, args.hasReferenceImages)
  const trimmed = args.revisedPrompt.trim()
  const doc = parsePrompt({
    prompt: trimmed,
    style: args.style,
    size: args.size,
    quality: args.quality ?? 'auto',
    intent,
    modelName: args.modelName,
    count: args.count,
  })

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    for (const { slot, pattern } of sectionHeaders) {
      const match = line.match(pattern)
      if (match) {
        const value = line.slice(match[0].length).trim()
        if (value) {
          doc.slots[slot] = { value, source: 'inferred', confidence: 0.85 }
        }
        break
      }
    }
  }

  return doc
}

export function docToPlainPrompt(doc: PromptDoc): string {
  const subject = doc.slots.subject?.value ?? ''
  const action = doc.slots.action?.value ?? ''
  const environment = doc.slots.environment?.value ?? ''
  const others = (Object.keys(doc.slots) as SlotName[])
    .filter((slot) => !['subject', 'action', 'environment'].includes(slot))
    .map((slot) => doc.slots[slot]?.value ?? '')
    .filter(Boolean)
  const lang = doc.meta.language
  const sep = lang === 'zh' ? '，' : ', '
  return [subject, action, environment, ...others].filter(Boolean).join(sep)
}
