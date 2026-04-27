import type { IconSet } from './types'

/**
 * 方向、跳转、关闭一类的图标
 */
export const navigationIcons = {
  arrowRight: {
    paths: ['M5 12h14', 'M13 6l6 6-6 6'],
  },
  arrowLeft: {
    paths: ['M19 12H5', 'M11 6l-6 6 6 6'],
  },
  arrowUp: {
    paths: ['M12 19V5', 'M6 11l6-6 6 6'],
  },
  arrowDown: {
    paths: ['M12 5v14', 'M6 13l6 6 6-6'],
  },
  arrowUpRight: {
    paths: ['M7 17L17 7', 'M9 7h8v8'],
  },
  chevronLeft: {
    paths: ['M15 6l-6 6 6 6'],
  },
  chevronRight: {
    paths: ['M9 6l6 6-6 6'],
  },
  chevronUp: {
    paths: ['M6 15l6-6 6 6'],
  },
  chevronDown: {
    paths: ['M6 9l6 6 6-6'],
  },
  close: {
    paths: ['M6 6l12 12', 'M18 6L6 18'],
  },
  menu: {
    paths: ['M4 7h16', 'M4 12h16', 'M4 17h10'],
  },
} satisfies IconSet
