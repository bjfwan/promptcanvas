import { reactive, computed, watch } from 'vue'
import { t } from '../lib/i18n'

export type PromptTreeAction =
  | 'manual'
  | 'import'
  | 'undo'
  | 'redo'
  | 'reset'
  | 'history-restore'

export interface PromptTreeNode {
  id: string
  parentId: string | null
  prompt: string
  action: PromptTreeAction
  label: string
  createdAt: number
}

interface PromptTreeState {
  nodes: PromptTreeNode[]
  currentId: string | null
}

const STORAGE_KEY = 'promptcanvas:prompt-tree-v1'
const MAX_NODES = 60

function loadInitial(): PromptTreeState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { nodes: [], currentId: null }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.nodes)) {
      return { nodes: [], currentId: null }
    }
    const nodes = parsed.nodes
      .filter((node: unknown): node is PromptTreeNode => Boolean(node && typeof node === 'object'))
      .slice(-MAX_NODES) as PromptTreeNode[]
    return { nodes, currentId: typeof parsed.currentId === 'string' ? parsed.currentId : null }
  } catch {
    return { nodes: [], currentId: null }
  }
}

const state: PromptTreeState = reactive(loadInitial())

watch(
  () => ({ nodes: state.nodes, currentId: state.currentId }),
  (next) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {}
  },
  { deep: true },
)

function makeId() {
  return `pt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function findNode(id: string): PromptTreeNode | undefined {
  return state.nodes.find((node) => node.id === id)
}

function siblingsOf(parentId: string | null) {
  return state.nodes.filter((node) => node.parentId === parentId)
}

function sortedChildren(parentId: string | null) {
  return siblingsOf(parentId).sort((a, b) => a.createdAt - b.createdAt)
}

function ancestorOrder(): PromptTreeNode[] {
  if (!state.currentId) return []
  const out: PromptTreeNode[] = []
  let cursor = findNode(state.currentId)
  while (cursor) {
    out.unshift(cursor)
    cursor = cursor.parentId ? findNode(cursor.parentId) : undefined
  }
  return out
}

function trimNodes() {
  if (state.nodes.length <= MAX_NODES) return
  const keep = new Set<string>()
  const ancestors = ancestorOrder()
  ancestors.forEach((node) => keep.add(node.id))
  while (state.nodes.length > MAX_NODES) {
    const oldest = state.nodes
      .filter((node) => !keep.has(node.id))
      .sort((a, b) => a.createdAt - b.createdAt)[0]
    if (!oldest) break
    state.nodes = state.nodes.filter((node) => node.id !== oldest.id)
  }
}

export function usePromptTree() {
  const currentNode = computed(() => (state.currentId ? findNode(state.currentId) ?? null : null))

  const breadcrumb = computed(() => ancestorOrder())

  const canUndo = computed(() => Boolean(currentNode.value?.parentId))

  const canRedo = computed(() => {
    if (!state.currentId) return false
    return sortedChildren(state.currentId).length > 0
  })

  function commit(args: {
    prompt: string
    action: PromptTreeAction
    label: string
    parentOverride?: string | null
  }): PromptTreeNode {
    const trimmed = args.prompt
    const parentId = args.parentOverride !== undefined ? args.parentOverride : state.currentId
    const node: PromptTreeNode = {
      id: makeId(),
      parentId,
      prompt: trimmed,
      action: args.action,
      label: args.label || labelForAction(args.action),
      createdAt: Date.now(),
    }
    state.nodes = [...state.nodes, node]
    state.currentId = node.id
    trimNodes()
    return node
  }

  function undo(): PromptTreeNode | null {
    const node = currentNode.value
    if (!node?.parentId) return null
    const parent = findNode(node.parentId)
    if (!parent) return null
    state.currentId = parent.id
    return parent
  }

  function redo(): PromptTreeNode | null {
    const id = state.currentId
    if (!id) return null
    const children = sortedChildren(id)
    const next = children[children.length - 1]
    if (!next) return null
    state.currentId = next.id
    return next
  }

  function jumpTo(id: string): PromptTreeNode | null {
    const node = findNode(id)
    if (!node) return null
    state.currentId = node.id
    return node
  }

  function branchFrom(id: string): PromptTreeNode | null {
    const node = findNode(id)
    if (!node) return null
    state.currentId = node.id
    return node
  }

  function clear() {
    state.nodes = []
    state.currentId = null
  }

  function pruneTo(id: string) {
    const node = findNode(id)
    if (!node) return
    const keep = new Set<string>()
    let cursor: PromptTreeNode | undefined = node
    while (cursor) {
      keep.add(cursor.id)
      cursor = cursor.parentId ? findNode(cursor.parentId) : undefined
    }
    state.nodes = state.nodes.filter((n) => keep.has(n.id))
    state.currentId = node.id
  }

  return {
    state,
    nodes: computed(() => state.nodes),
    currentNode,
    breadcrumb,
    canUndo,
    canRedo,
    commit,
    undo,
    redo,
    jumpTo,
    branchFrom,
    clear,
    pruneTo,
  }
}

function labelForAction(action: PromptTreeAction): string {
  switch (action) {
    case 'manual':
      return t('promptTree.manual')
    case 'import':
      return t('promptTree.import')
    case 'undo':
      return t('promptTree.undo')
    case 'redo':
      return t('promptTree.redo')
    case 'reset':
      return t('promptTree.reset')
    case 'history-restore':
      return t('promptTree.historyRestore')
    default:
      return t('promptTree.update')
  }
}
