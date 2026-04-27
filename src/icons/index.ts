/**
 * 统一图标注册中心
 *
 * 设计原则：
 * - 24x24 viewBox、currentColor 描边、stroke-linecap/join = round
 * - 默认 strokeWidth = 1.6（在 Icon.vue 中可覆盖）
 * - 多 path 表达，让"缺口/强调点"等细节可独立控制
 * - 按用途分类管理（navigation/action/editor/media/status/system），
 *   既便于维护，也保留扁平化的 IconName 联合类型
 */

import type { IconCategory, IconDefinition } from './types'
import { actionIcons } from './action'
import { editorIcons } from './editor'
import { mediaIcons } from './media'
import { navigationIcons } from './navigation'
import { statusIcons } from './status'
import { systemIcons } from './system'

export type { IconCategory, IconDefinition } from './types'

/** 按分类分组的图标定义，便于 UI 内可视化展示/调试 */
export const iconCategories = {
  navigation: navigationIcons,
  action: actionIcons,
  editor: editorIcons,
  media: mediaIcons,
  status: statusIcons,
  system: systemIcons,
} as const

/** 扁平注册表：name → IconDefinition */
export const iconRegistry = {
  ...navigationIcons,
  ...actionIcons,
  ...editorIcons,
  ...mediaIcons,
  ...statusIcons,
  ...systemIcons,
} as const

export type IconName = keyof typeof iconRegistry

const categoryByName = (() => {
  const map = new Map<IconName, IconCategory>()
  for (const [category, set] of Object.entries(iconCategories) as [
    IconCategory,
    Record<string, IconDefinition>,
  ][]) {
    for (const name of Object.keys(set) as IconName[]) {
      map.set(name, category)
    }
  }
  return map
})()

/** 查询某个图标所属分类（找不到返回 undefined） */
export function getIconCategory(name: IconName): IconCategory | undefined {
  return categoryByName.get(name)
}

/** 列出某分类下所有图标名 */
export function listIconNames(category?: IconCategory): IconName[] {
  if (!category) return Object.keys(iconRegistry) as IconName[]
  return Object.keys(iconCategories[category]) as IconName[]
}
