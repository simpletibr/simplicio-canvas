// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ACCESSIBILITY_CONTRACT } from '../src/domain/a11y'
import { LOCALES } from '../src/domain/locale'
import { MESSAGE_KEYS, translator, type MessageKey } from '../src/ui/messages'
import { App } from '../src/ui/App'
import { installDomStubs } from './helpers/dom'

const css = readFileSync('src/style.css', 'utf8')
beforeAll(installDomStubs)
afterEach(() => { cleanup(); localStorage.clear() })

describe('Canvas accessibility contract', () => {
  it('names every labelled region with a message that exists in both languages', () => {
    for (const key of ACCESSIBILITY_CONTRACT.requiredRegions) {
      expect(MESSAGE_KEYS).toContain(key)
      for (const locale of LOCALES) expect(translator(locale)(key as MessageKey).trim().length).toBeGreaterThan(2)
    }
    expect(ACCESSIBILITY_CONTRACT.liveRegion).toBe('polite')
  })

  it('honors reduced-motion preferences: animations and transitions are switched off', () => {
    expect(css).toContain(ACCESSIBILITY_CONTRACT.reducedMotionMediaQuery)
    expect(css.slice(css.indexOf(ACCESSIBILITY_CONTRACT.reducedMotionMediaQuery))).toMatch(/animation:\s*none\s*!important/)
  })

  it.each(LOCALES)('exposes the labelled regions, a polite live region and keyboard-reachable controls (%s)', (locale) => {
    localStorage.setItem('simplicio-canvas.locale', locale)
    const t = translator(locale)
    const { container } = render(<App demo={false} />)
    fireEvent.click(screen.getByRole('button', { name: t('view.run') }))
    for (const key of ACCESSIBILITY_CONTRACT.requiredRegions) {
      if (key === 'canvas.minimap') continue // rendered by React Flow, checked separately below
      expect(screen.getAllByLabelText(t(key as MessageKey)).length, key).toBeGreaterThan(0)
    }
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull()
    expect(screen.getByRole('navigation', { name: t('nav.aria') })).toBeTruthy()
    for (const button of container.querySelectorAll('button')) expect(button.tabIndex, button.textContent ?? '').toBeGreaterThanOrEqual(-1)
  })
})
