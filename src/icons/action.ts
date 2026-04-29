import type { IconSet } from './types'

export const actionIcons = {
  download: {
    paths: ['M12 4v12', 'M6 12l6 6 6-6', 'M5 20h14'],
  },
  upload: {
    paths: ['M12 20V8', 'M6 12l6-6 6 6', 'M5 4h14'],
  },
  copy: {
    paths: ['M9 9h11v11H9z', 'M5 5h11v3', 'M5 5v11h3'],
  },
  refresh: {
    paths: [
      'M4 12a8 8 0 0 1 14-5.3',
      'M20 4v5h-5',
      'M20 12a8 8 0 0 1-14 5.3',
      'M4 20v-5h5',
    ],
  },
  reset: {
    paths: ['M4 4v5h5', 'M5 9a8 8 0 1 1 1.5 8'],
  },
  send: {
    paths: ['M5 12L20 4l-7 16-2-7-6-1z'],
  },
  share: {
    paths: [
      'M12 4v12',
      'M7 9l5-5 5 5',
      'M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
    ],
  },
  link: {
    paths: [
      'M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 1 0-5.6-5.6l-1 1',
      'M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 1 0 5.6 5.6l1-1',
    ],
  },
  external: {
    paths: [
      'M14 4h6v6',
      'M11 13l9-9',
      'M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
    ],
  },
} satisfies IconSet
