export type IconCategory =
  | 'navigation'
  | 'action'
  | 'editor'
  | 'media'
  | 'status'
  | 'system'

export interface IconDefinition {
  paths: string[]
  viewBox?: string
}

export type IconSet<Names extends string = string> = Record<Names, IconDefinition>
