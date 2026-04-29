import type { IconSet } from './types'

export const mediaIcons = {
  image: {
    paths: [
      'M4 5h16v14H4z',
      'M4 16l5-5 4 4 3-3 4 4',
      'M9 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
    ],
  },
  layers: {
    paths: [
      'M12 4l9 5-9 5-9-5 9-5z',
      'M3 14l9 5 9-5',
      'M3 19l9 5 9-5',
    ],
  },
  expand: {
    paths: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  },
  shrink: {
    paths: ['M9 4v5H4', 'M15 4v5h5', 'M9 20v-5H4', 'M15 20v-5h5'],
  },
  zoomIn: {
    paths: [
      'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z',
      'M8 11h6',
      'M11 8v6',
      'M16 16l5 5',
    ],
  },
  zoomOut: {
    paths: [
      'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z',
      'M8 11h6',
      'M16 16l5 5',
    ],
  },
  ratio: {
    paths: [
      'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
      'M4 9h16',
      'M9 4v16',
    ],
  },
  frame: {
    paths: ['M4 4h16v16H4z', 'M8 8h8v8H8z'],
  },
  focus: {
    paths: [
      'M4 8V5a1 1 0 0 1 1-1h3',
      'M16 4h3a1 1 0 0 1 1 1v3',
      'M20 16v3a1 1 0 0 1-1 1h-3',
      'M8 20H5a1 1 0 0 1-1-1v-3',
      'M12 12h.01',
    ],
  },
  camera: {
    paths: [
      'M4 8h3l1.5-2h7L17 8h3v11H4z',
      'M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    ],
  },
} satisfies IconSet
