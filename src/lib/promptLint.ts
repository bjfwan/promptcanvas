import type { ImageStyle } from '../types'
import type { LintIssue, PromptDoc, SlotName } from './promptDoc'

const photoTokens = /(?:35mm|50mm|85mm|100mm|24mm|f\/[\d.]+|hasselblad|leica|canon|sony|nikon|arri|cinestill|kodak)/i

const vectorTokens = /(?:flat vector|vector mark|cel-?shaded|illustration|插画|矢量|平面图形)/i

const photoRealTokens = /(?:photoreal\w*|photograph\w*|纪实|写实|摄影)/i

const dayTokens = /(?:noon|midday|sunny day|正午|中午|烈日|阳光普照)/i

const nightTokens = /(?:night|midnight|neon|霓虹|深夜|午夜)/i

const groupTokens = /(?:crowd|group|swarm|一群|众多|多个|许多)/i

const singularTokens = /(?:a single|one of|alone|独自|单独|孤独|唯一)/i

const detailFatigue = /(?:highly detailed|ultra[- ]?detailed|hyper[- ]?detailed|extreme detail|超精细|极致细节)/gi

function styleConflictsWithPhoto(style: ImageStyle): boolean {
  return style === 'logo' || style === 'anime'
}

function tokenCount(text: string): number {
  if (!text) return 0
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  const ascii = text.replace(/[\u4e00-\u9fff]/g, ' ').trim().split(/\s+/).filter(Boolean).length
  return Math.round(cjk * 1.3 + ascii * 1.3)
}

export function tokenEstimate(text: string): number {
  return tokenCount(text)
}

function pushIssue(list: LintIssue[], issue: LintIssue) {
  list.push(issue)
}

export function lintPrompt(doc: PromptDoc): LintIssue[] {
  const issues: LintIssue[] = []
  const raw = doc.raw

  const stylePhotoConflict = styleConflictsWithPhoto(doc.meta.styleId)
  if (stylePhotoConflict && photoTokens.test(raw)) {
    pushIssue(issues, {
      id: 'style-photo-conflict',
      severity: 'error',
      slot: 'styleAnchor',
      message: '当前风格与摄影术语冲突',
      hint: '已选 Logo / 动画风格，请去掉 35mm、Leica 这类摄影描述',
      fix: {
        kind: 'remove-pattern',
        label: '去掉摄影术语',
        removePatterns: [
          '\\b35\\s*mm\\b',
          '\\b50\\s*mm\\b',
          '\\b85\\s*mm\\b',
          '\\b100\\s*mm\\b',
          '\\b24\\s*mm\\b',
          '\\bf\\/?[0-9]+(?:\\.[0-9]+)?\\b',
          'Hasselblad|Leica|Canon|Sony|Nikon|ARRI|Cinestill|Kodak',
        ],
      },
    })
  }

  if (vectorTokens.test(raw) && photoRealTokens.test(raw)) {
    pushIssue(issues, {
      id: 'vector-vs-photo',
      severity: 'error',
      slot: 'styleAnchor',
      message: '矢量插画与真实摄影同时出现',
      hint: '保留一种媒介：要么扁平矢量，要么写实摄影',
      fix: {
        kind: 'pick-one-of',
        label: '二选一',
        options: [
          { id: 'keep-vector', label: '保留矢量插画，去掉摄影', remove: ['photoreal\\w*', 'photograph\\w*', '纪实', '写实', '摄影'] },
          { id: 'keep-photo', label: '保留写实摄影，去掉插画', remove: ['flat vector', 'vector mark', 'cel-?shaded', 'illustration', '插画', '矢量', '平面图形'] },
        ],
      },
    })
  }

  if (dayTokens.test(raw) && nightTokens.test(raw)) {
    pushIssue(issues, {
      id: 'time-conflict',
      severity: 'warning',
      slot: 'lighting',
      message: '同时描述了白天与夜晚',
      hint: '挑一个时间段，避免模型摇摆',
      fix: {
        kind: 'pick-one-of',
        label: '二选一',
        options: [
          { id: 'keep-day', label: '保留白天', remove: ['night', 'midnight', 'neon', '霓虹', '深夜', '午夜'] },
          { id: 'keep-night', label: '保留夜晚', remove: ['noon', 'midday', 'sunny day', '正午', '中午', '烈日', '阳光普照'] },
        ],
      },
    })
  }

  if (singularTokens.test(raw) && groupTokens.test(raw)) {
    pushIssue(issues, {
      id: 'count-conflict',
      severity: 'warning',
      slot: 'subject',
      message: '主体数量描述自相矛盾',
      hint: '是单个主体还是一群？请明确',
      fix: {
        kind: 'pick-one-of',
        label: '二选一',
        options: [
          { id: 'keep-single', label: '保留单个主体', remove: ['crowd', 'group', 'swarm', '一群', '众多', '多个', '许多'] },
          { id: 'keep-group', label: '保留群像', remove: ['a single', 'one of', 'alone', '独自', '单独', '孤独', '唯一'] },
        ],
      },
    })
  }

  const fatigue = raw.match(detailFatigue)
  if (fatigue && fatigue.length >= 3) {
    pushIssue(issues, {
      id: 'detail-fatigue',
      severity: 'warning',
      message: '反复堆叠 "highly detailed" 反而稀释权重',
      hint: '保留一处即可，把 token 留给更具体的描述',
      fix: {
        kind: 'remove-pattern',
        label: '清理重复的细节修饰',
        removePatterns: [
          'highly detailed',
          'ultra[- ]?detailed',
          'hyper[- ]?detailed',
          'extreme detail',
          '超精细',
          '极致细节',
        ],
      },
    })
  }

  if (!doc.slots.subject?.value) {
    pushIssue(issues, {
      id: 'missing-subject',
      severity: 'error',
      slot: 'subject',
      message: '没识别到明确主体',
      hint: '先用一句话说清楚画面里"谁/什么"',
    })
  }

  const requiredEarlySlots: SlotName[] = ['lighting', 'composition']
  for (const slot of requiredEarlySlots) {
    if (!doc.slots[slot]?.value) {
      pushIssue(issues, {
        id: `missing-${slot}`,
        severity: 'info',
        slot,
        message: slot === 'lighting' ? '缺少光位描述' : '缺少构图描述',
        hint: slot === 'lighting' ? '加一句光源方向或时间' : '说一下视角、机位或留白',
        fix: {
          kind: 'set-slot-from-vocab',
          label: '一键补齐',
          slot,
        },
      })
    }
  }

  const tokens = tokenCount(raw)
  if (tokens > 700) {
    pushIssue(issues, {
      id: 'too-long',
      severity: 'warning',
      message: `预估 ${tokens} tokens，已经偏长`,
      hint: '收紧重复描述，把权重留给主体',
    })
  } else if (tokens > 0 && tokens < 12) {
    pushIssue(issues, {
      id: 'too-short',
      severity: 'info',
      message: '提示词过短，模型自由发挥空间大',
      hint: '至少补出主体 + 环境 + 一种镜头/光线',
    })
  }

  return issues
}

export function lintSummary(issues: LintIssue[]): { errors: number; warnings: number; infos: number } {
  return issues.reduce(
    (acc, issue) => {
      if (issue.severity === 'error') acc.errors += 1
      else if (issue.severity === 'warning') acc.warnings += 1
      else acc.infos += 1
      return acc
    },
    { errors: 0, warnings: 0, infos: 0 },
  )
}
