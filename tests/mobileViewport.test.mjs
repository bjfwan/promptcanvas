import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveMobileViewportState } from '../.test-dist/lib/mobileViewport.js'

test('keeps the dock on the keyboard when Android resizes the layout viewport', () => {
  const state = resolveMobileViewportState({
    isDesktop: false,
    keyboardBaselineHeight: 820,
    lastCommittedInset: 0,
    layoutHeight: 470,
    offsetTop: 0,
    viewportWidth: 390,
    visualHeight: 470,
  })

  assert.equal(state.keyboardOpen, true)
  assert.equal(state.keyboardInset, 0)
  assert.equal(state.layoutResizedByKeyboard, true)
  assert.equal(state.viewportHeight, 470)
})

test('lifts the dock only when the visual viewport shrinks over a stable layout viewport', () => {
  const state = resolveMobileViewportState({
    isDesktop: false,
    keyboardBaselineHeight: 820,
    lastCommittedInset: 0,
    layoutHeight: 820,
    offsetTop: 0,
    viewportWidth: 390,
    visualHeight: 470,
  })

  assert.equal(state.keyboardOpen, true)
  assert.equal(state.keyboardInset, 350)
  assert.equal(state.layoutResizedByKeyboard, false)
  assert.equal(state.viewportHeight, 470)
})

test('ignores toolbar and visual viewport noise below the keyboard threshold', () => {
  const state = resolveMobileViewportState({
    isDesktop: false,
    keyboardBaselineHeight: 820,
    lastCommittedInset: 0,
    layoutHeight: 790,
    offsetTop: 0,
    viewportWidth: 390,
    visualHeight: 790,
  })

  assert.equal(state.keyboardOpen, false)
  assert.equal(state.keyboardInset, 0)
  assert.equal(state.layoutResizedByKeyboard, false)
  assert.equal(state.viewportHeight, 790)
})
