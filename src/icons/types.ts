/**
 * 图标系统类型定义
 *
 * 所有图标统一使用 24x24 viewBox、currentColor 描边、
 * round line cap/join。每个图标由若干 path "d" 字符串组成，
 * 便于多段独立绘制（如缺口、强调点）。
 */

export type IconCategory =
  | 'navigation'
  | 'action'
  | 'editor'
  | 'media'
  | 'status'
  | 'system'

export interface IconDefinition {
  /** SVG path "d" 字符串数组；按数组顺序绘制 */
  paths: string[]
  /** 可选 viewBox，缺省 "0 0 24 24" */
  viewBox?: string
}

export type IconSet<Names extends string = string> = Record<Names, IconDefinition>
