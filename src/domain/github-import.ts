export interface GitHubRepository {
  owner: string
  repository: string
  cloneUrl: string
  slug: string
}

export function normalizeGitHubRepository(input: string): GitHubRepository {
  // Accept what people paste from the address bar: with or without scheme and www., with a trailing slash or .git.
  const value = input.trim().replace(/\/+$/, '').replace(/\.git$/, '')
  const match = value.match(/^(?:(?:https?:\/\/)?(?:www\.)?github\.com\/)?([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)$/)
  if (!match) throw new Error('Enter a valid public GitHub repository as owner/repository or https://github.com/owner/repository')
  const [, owner, repository] = match
  if (owner === '.' || owner === '..' || repository === '.' || repository === '..') throw new Error('Enter a valid public GitHub repository')
  const slug = `${owner}/${repository}`
  return { owner, repository, slug, cloneUrl: `https://github.com/${slug}.git` }
}

export function githubContentsUrl(owner: string, repository: string, filePath: string) {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodeURIComponent(filePath)}`
}
