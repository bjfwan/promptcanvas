import type { IconSet } from './types'

export const systemIcons = {
  sun: {
    paths: [
      'M12 4v2',
      'M12 18v2',
      'M4 12H2',
      'M22 12h-2',
      'M5.6 5.6L4.2 4.2',
      'M19.8 19.8l-1.4-1.4',
      'M5.6 18.4l-1.4 1.4',
      'M19.8 4.2l-1.4 1.4',
      'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    ],
  },
  moon: {
    paths: ['M20 14.5A8 8 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z'],
  },
  command: {
    paths: [
      'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z',
    ],
  },
  history: {
    paths: [
      'M3 12a9 9 0 1 0 3-6.7 L3 8',
      'M3 4v4h4',
      'M12 8v4l3 2',
    ],
  },
  clock: {
    paths: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M12 8v4l3 2'],
  },
  template: {
    paths: ['M4 5h16v4H4z', 'M4 13h7v6H4z', 'M14 13h6v6h-6z'],
  },
  bookmark: {
    paths: ['M6 4h12v17l-6-4-6 4z'],
  },
  trash: {
    paths: [
      'M4 7h16',
      'M9 7V4h6v3',
      'M6 7l1 13h10l1-13',
      'M10 11v6',
      'M14 11v6',
    ],
  },
  plus: {
    paths: ['M12 5v14', 'M5 12h14'],
  },
  minus: {
    paths: ['M5 12h14'],
  },
  more: {
    paths: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  },
  question: {
    paths: ['M9 9a3 3 0 1 1 4 2.8c-.7.4-1 1-1 1.7V14', 'M12 17.5h.01'],
  },
  keyboard: {
    paths: [
      'M3 7h18v10H3z',
      'M7 11h.01',
      'M11 11h.01',
      'M15 11h.01',
      'M19 11h.01',
      'M7 14h10',
    ],
  },
} satisfies IconSet
