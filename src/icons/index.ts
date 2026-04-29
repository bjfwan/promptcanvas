import type { IconCategory, IconDefinition } from './types'
import { actionIcons } from './action'
import { editorIcons } from './editor'
import { mediaIcons } from './media'
import { navigationIcons } from './navigation'
import { statusIcons } from './status'
import { systemIcons } from './system'

export type { IconCategory, IconDefinition } from './types'

export const iconCategories = {
  navigation: navigationIcons,
  action: actionIcons,
  editor: editorIcons,
  media: mediaIcons,
  status: statusIcons,
  system: systemIcons,
} as const

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

export function getIconCategory(name: IconName): IconCategory | undefined {
  return categoryByName.get(name)
}

export function listIconNames(category?: IconCategory): IconName[] {
  if (!category) return Object.keys(iconRegistry) as IconName[]
  return Object.keys(iconCategories[category]) as IconName[]
}
