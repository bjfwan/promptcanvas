import { deriveNegativePrompt } from './negativeLib'
import { fillSlot, qualityHints } from './promptFiller'
import { lintPrompt } from './promptLint'
import {
  pickRenderMode,
  SLOT_ORDER,
  slotLabel,
  type EnhanceLevel,
  type EnhanceMode,
  type LintIssue,
  type ModelFamily,
  type PromptContext,
  type PromptDoc,
  type RenderMode,
  type Slot,
  type SlotName,
} from './promptDoc'
import { requiredSlotsFor } from './promptParser'

export interface SlotRecord {
  slot: SlotName
  filled: Slot
  origin: Slot['source']
}

export interface ComposeResult {
  doc: PromptDoc
  finalSlots: SlotRecord[]
  rendered: string
  renderMode: RenderMode
  derivedNegative: string
  preserveList: string[]
  forbidList: string[]
  scoreBefore: number
  scoreAfter: number
  issuesBefore: LintIssue[]
  issuesAfter: LintIssue[]
}

export interface ComposeOptions {
  level: EnhanceLevel
  mode: EnhanceMode
  context?: PromptContext
  forceSlots?: SlotName[]
  axisFocus?: SlotName
  renderModeOverride?: RenderMode
  modelFamily?: ModelFamily
  seed?: string
  slotOverrides?: Partial<Record<SlotName, Slot>>
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function tokenScoreFromText(text: string): number {
  const length = text.length
  if (length < 8) return 8
  if (length < 24) return 45
  if (length < 80) return 72
  if (length < 260) return 92
  if (length < 620) return 86
  return 64
}

export function scoreDoc(doc: PromptDoc): number {
  const slotsFilled = SLOT_ORDER.filter((slot) => doc.slots[slot]?.value).length
  const slotsScore = Math.round((slotsFilled / SLOT_ORDER.length) * 100)
  const lengthScore = tokenScoreFromText(doc.raw)
  const subjectScore = doc.slots.subject?.value ? 90 : 30
  const finishScore = doc.constraints.forbid.length > 0 ? 84 : 48
  const issues = lintPrompt(doc)
  const issuePenalty = issues.reduce((acc, issue) => {
    if (issue.severity === 'error') return acc + 18
    if (issue.severity === 'warning') return acc + 8
    return acc + 2
  }, 0)
  return clamp(
    Math.round(slotsScore * 0.32 + lengthScore * 0.18 + subjectScore * 0.22 + finishScore * 0.18 + 10) - issuePenalty,
    0,
    100,
  )
}

function levelTargetCount(level: EnhanceLevel): number {
  if (level === 'light') return 2
  if (level === 'standard') return 4
  return SLOT_ORDER.length
}

function pushPreserve(list: string[], value: string | undefined) {
  if (!value) return
  const trimmed = value.trim()
  if (!trimmed) return
  if (list.includes(trimmed)) return
  list.push(trimmed)
}

function buildPreserveAndForbid(doc: PromptDoc, context?: PromptContext) {
  const preserve: string[] = []
  const forbid: string[] = [...doc.constraints.forbid]

  for (const slot of SLOT_ORDER) {
    pushPreserve(preserve, doc.slots[slot]?.value)
  }

  if (context?.continuation) {
    for (const slot of SLOT_ORDER) {
      pushPreserve(preserve, context.continuation.slots[slot]?.value)
    }
  }

  if (context?.brand?.enabled) {
    pushPreserve(preserve, context.brand.alwaysInclude)
    if (context.brand.neverInclude.trim()) {
      forbid.push(context.brand.neverInclude.trim())
    }
  }

  return { preserve, forbid }
}

function decideRenderMode(doc: PromptDoc, options: ComposeOptions): RenderMode {
  if (options.renderModeOverride) return options.renderModeOverride
  const family = options.modelFamily ?? doc.meta.modelFamily
  return pickRenderMode(family, doc.meta.intent)
}

function chooseSlotsToFill(doc: PromptDoc, options: ComposeOptions): SlotName[] {
  if (options.forceSlots?.length) return options.forceSlots.slice()
  const required = requiredSlotsFor(doc.meta.intent)
  const missing = required.filter((slot) => !doc.slots[slot]?.value)
  const target = levelTargetCount(options.level)
  const capped = missing.slice(0, target)
  if (options.axisFocus && !capped.includes(options.axisFocus)) {
    capped.unshift(options.axisFocus)
  }
  return capped
}

function ensureMandatorySlots(doc: PromptDoc, baseSlots: SlotName[]): SlotName[] {
  const out = [...baseSlots]
  if (!doc.slots.subject?.value && !out.includes('subject')) out.unshift('subject')
  return out
}

export function compose(doc: PromptDoc, options: ComposeOptions): ComposeResult {
  const issuesBefore = lintPrompt(doc)
  const scoreBefore = scoreDoc(doc)
  const slotsToFill = ensureMandatorySlots(doc, chooseSlotsToFill(doc, options))

  const seed = options.seed ?? doc.raw
  const finalDoc: PromptDoc = {
    ...doc,
    slots: { ...doc.slots },
    constraints: {
      preserve: [...doc.constraints.preserve],
      change: [...doc.constraints.change],
      forbid: [...doc.constraints.forbid],
    },
    meta: { ...doc.meta },
  }
  if (options.slotOverrides) {
    for (const [slot, override] of Object.entries(options.slotOverrides) as Array<[SlotName, Slot]>) {
      if (override?.value) {
        finalDoc.slots[slot] = override
      }
    }
  }
  const finalSlots: SlotRecord[] = []

  for (const slotName of SLOT_ORDER) {
    const existing = finalDoc.slots[slotName]
    if (existing?.value) {
      finalSlots.push({ slot: slotName, filled: existing, origin: existing.source })
      continue
    }
    if (!slotsToFill.includes(slotName)) continue
    const filled = fillSlot({
      doc: finalDoc,
      slot: slotName,
      mode: options.mode,
      context: options.context,
      seed,
    })
    if (filled?.value) {
      finalDoc.slots[slotName] = filled
      finalSlots.push({ slot: slotName, filled, origin: filled.source })
    }
  }

  const { preserve, forbid } = buildPreserveAndForbid(finalDoc, options.context)
  const derivedNegative = deriveNegativePrompt({
    style: finalDoc.meta.styleId,
    subject: finalDoc.meta.subjectType,
    language: finalDoc.meta.language,
    userNegative: forbid.join(finalDoc.meta.language === 'zh' ? '、' : ', '),
  })

  const renderMode = decideRenderMode(finalDoc, options)
  const rendered = renderPrompt(finalDoc, finalSlots, {
    renderMode,
    preserve,
    forbid,
    derivedNegative,
  })

  const finalDocAfter: PromptDoc = { ...finalDoc, raw: rendered }
  const issuesAfter = lintPrompt(finalDocAfter)
  const scoreAfter = scoreDoc(finalDocAfter)

  return {
    doc: finalDoc,
    finalSlots,
    rendered,
    renderMode,
    derivedNegative,
    preserveList: preserve,
    forbidList: forbid,
    scoreBefore,
    scoreAfter,
    issuesBefore,
    issuesAfter,
  }
}

interface RenderArgs {
  renderMode: RenderMode
  preserve: string[]
  forbid: string[]
  derivedNegative: string
}

function renderPrompt(doc: PromptDoc, finalSlots: SlotRecord[], args: RenderArgs): string {
  if (args.renderMode === 'compact') return renderCompact(doc, finalSlots, args)
  if (args.renderMode === 'narrative') return renderNarrative(doc, finalSlots, args)
  return renderStructured(doc, finalSlots, args)
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>()
  return lines
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      if (seen.has(line)) return false
      seen.add(line)
      return true
    })
}

function renderStructured(doc: PromptDoc, finalSlots: SlotRecord[], args: RenderArgs): string {
  const lang = doc.meta.language
  const headers: Record<SlotName, string> = lang === 'zh'
    ? {
      subject: '主体',
      action: '动作',
      environment: '环境',
      lighting: '光位',
      camera: '镜头',
      composition: '构图',
      palette: '色彩',
      material: '材质',
      mood: '氛围',
      styleAnchor: '风格',
    }
    : {
      subject: 'Subject',
      action: 'Action',
      environment: 'Environment',
      lighting: 'Lighting',
      camera: 'Camera',
      composition: 'Composition',
      palette: 'Palette',
      material: 'Material',
      mood: 'Mood',
      styleAnchor: 'Style',
    }

  const lines: string[] = []
  for (const record of finalSlots) {
    const head = headers[record.slot]
    lines.push(`${head}: ${record.filled.value}`)
  }

  const aspectLine = lang === 'zh'
    ? `画幅: ${doc.meta.aspectRatio}`
    : `Aspect: ${doc.meta.aspectRatio}`
  lines.push(aspectLine)

  const qHint = qualityHints(doc.meta.quality, lang)
  if (qHint) {
    lines.push(lang === 'zh' ? `成片度: ${qHint}` : `Finish: ${qHint}`)
  }

  if (args.preserve.length) {
    const head = lang === 'zh' ? '保留' : 'Preserve'
    const value = args.preserve.join(lang === 'zh' ? '；' : '; ')
    lines.push(`${head}: ${value}`)
  }

  if (args.derivedNegative) {
    const head = lang === 'zh' ? '避免' : 'Avoid'
    lines.push(`${head}: ${args.derivedNegative}`)
  }

  return uniqueLines(lines).join('\n')
}

function renderNarrative(doc: PromptDoc, finalSlots: SlotRecord[], args: RenderArgs): string {
  const lang = doc.meta.language
  const sentences: string[] = []
  const slotMap = new Map(finalSlots.map((record) => [record.slot, record.filled.value]))

  const subject = slotMap.get('subject') ?? ''
  const action = slotMap.get('action') ?? ''
  const environment = slotMap.get('environment') ?? ''
  const lighting = slotMap.get('lighting') ?? ''
  const camera = slotMap.get('camera') ?? ''
  const composition = slotMap.get('composition') ?? ''
  const palette = slotMap.get('palette') ?? ''
  const material = slotMap.get('material') ?? ''
  const mood = slotMap.get('mood') ?? ''
  const styleAnchor = slotMap.get('styleAnchor') ?? ''

  if (subject) {
    const opener = lang === 'zh' ? '画面主体是' : 'The image features'
    sentences.push(`${opener}${lang === 'zh' ? '' : ' '}${subject}${action ? (lang === 'zh' ? `，${action}` : `, ${action}`) : ''}.`)
  }
  if (environment) {
    sentences.push(lang === 'zh' ? `场景设定在${environment}。` : `The scene is set in ${environment}.`)
  }
  if (lighting) {
    sentences.push(lang === 'zh' ? `光线为${lighting}。` : `Lighting comes as ${lighting}.`)
  }
  if (camera) {
    sentences.push(lang === 'zh' ? `镜头与机位：${camera}。` : `Camera and framing: ${camera}.`)
  }
  if (composition) {
    sentences.push(lang === 'zh' ? `构图采用${composition}。` : `Composition uses ${composition}.`)
  }
  if (material) {
    sentences.push(lang === 'zh' ? `材质特征：${material}。` : `Material rendering: ${material}.`)
  }
  if (palette) {
    sentences.push(lang === 'zh' ? `配色：${palette}。` : `Color palette: ${palette}.`)
  }
  if (mood) {
    sentences.push(lang === 'zh' ? `氛围：${mood}。` : `Mood: ${mood}.`)
  }
  if (styleAnchor) {
    sentences.push(lang === 'zh' ? `整体风格${styleAnchor}。` : `Overall style: ${styleAnchor}.`)
  }
  sentences.push(lang === 'zh' ? `画幅 ${doc.meta.aspectRatio}。` : `Aspect ratio ${doc.meta.aspectRatio}.`)

  if (args.preserve.length) {
    sentences.push(
      lang === 'zh'
        ? `保留：${args.preserve.join('；')}。`
        : `Preserve: ${args.preserve.join('; ')}.`,
    )
  }
  if (args.derivedNegative) {
    sentences.push(
      lang === 'zh'
        ? `避免：${args.derivedNegative}。`
        : `Avoid: ${args.derivedNegative}.`,
    )
  }

  return uniqueLines(sentences).join(' ')
}

function renderCompact(doc: PromptDoc, finalSlots: SlotRecord[], args: RenderArgs): string {
  const lang = doc.meta.language
  const segments = finalSlots.map((record) => record.filled.value)
  segments.push(lang === 'zh' ? `画幅 ${doc.meta.aspectRatio}` : `aspect ${doc.meta.aspectRatio}`)
  const main = segments.filter(Boolean).join(lang === 'zh' ? '，' : ', ')
  const tail = args.derivedNegative
    ? `${lang === 'zh' ? '避免：' : 'avoid: '}${args.derivedNegative}`
    : ''
  return tail ? `${main}${lang === 'zh' ? '，' : ', '}${tail}` : main
}

export function slotDescriptor(record: SlotRecord, language: 'zh' | 'en' = 'zh'): string {
  return `${slotLabel(record.slot, language)} · ${record.filled.value}`
}
