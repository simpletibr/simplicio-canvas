/**
 * The bundled example: a small, synthetic snapshot that mirrors the shape of the `simplicio-loop turbo` pipeline
 * (fixtures/example/simplicio-loop) plus the slim artifacts of a real `simplicio-mapper scan` of it
 * (fixtures/example/mapper, regenerated with `npm run fixtures`). It is representative demo content, not the real source.
 */
import type { SourceFileInput } from './domain/analyzer'
import type { MapperArtifacts } from './domain/mapper'
import callGraph from '../fixtures/example/mapper/call-graph.json'
import projectMap from '../fixtures/example/mapper/project-map.json'
import symbolIndex from '../fixtures/example/mapper/symbol-index.json'

const PREFIX = '../fixtures/example/simplicio-loop/'
const sources = import.meta.glob('../fixtures/example/simplicio-loop/**/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const EXAMPLE_NAME = 'simplicio-loop (bundled snapshot)'
export const EXAMPLE_FILES: SourceFileInput[] = Object.entries(sources)
  .map(([key, content]) => ({ path: key.slice(PREFIX.length), content, size: content.length }))
  .sort((a, b) => a.path.localeCompare(b.path))
export const EXAMPLE_ARTIFACTS: MapperArtifacts = { projectMap, callGraph, symbolIndex }
