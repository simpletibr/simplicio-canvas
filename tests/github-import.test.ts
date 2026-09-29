import { describe, expect, it } from 'vitest'
import { normalizeGitHubRepository } from '../src/domain/github-import'

describe('GitHub repository import', () => {
  it('normalizes an HTTPS GitHub repository URL', () => {
    expect(normalizeGitHubRepository('https://github.com/wesleysimplicio/simplicio-loop.git')).toEqual({
      owner: 'wesleysimplicio', repository: 'simplicio-loop', cloneUrl: 'https://github.com/wesleysimplicio/simplicio-loop.git', slug: 'wesleysimplicio/simplicio-loop',
    })
  })

  it('accepts owner/repository shorthand', () => {
    expect(normalizeGitHubRepository('wesleysimplicio/simplicio-loop').slug).toBe('wesleysimplicio/simplicio-loop')
  })

  it.each(['github.com/octo/cat', 'https://github.com/octo/cat/', 'http://www.github.com/octo/cat.git', ' https://github.com/octo/cat '])('accepts what people paste from the address bar: %s', (value) => {
    expect(normalizeGitHubRepository(value)).toMatchObject({ slug: 'octo/cat', cloneUrl: 'https://github.com/octo/cat.git' })
  })

  it.each(['https://gitlab.com/a/b', 'https://github.com/a/b/issues/1', '../private', 'github.com/a'])('rejects unsafe or unsupported input %s', (value) => {
    expect(() => normalizeGitHubRepository(value)).toThrow('GitHub repository')
  })
})
