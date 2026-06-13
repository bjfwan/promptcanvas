import type { IconName } from '../icons'

export interface PromptStarter {
  id: 'productPoster' | 'characterSheet' | 'avatar' | 'sceneConcept'
  icon: IconName
}

export const promptStarters: PromptStarter[] = [
  { id: 'productPoster', icon: 'template' },
  { id: 'characterSheet', icon: 'sparkle' },
  { id: 'avatar', icon: 'camera' },
  { id: 'sceneConcept', icon: 'aperture' },
]
