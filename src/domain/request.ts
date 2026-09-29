/**
 * Reads a free-text request the way `simplicio-loop turbo` does: split it into tasks, find the files it names
 * (the CLI's own path rule) and decide how the tasks relate. Tasks on the same file stay in order; the rest can fan out.
 */
export interface RequestTask { index: number; text: string; files: string[] }
export type RequestKind = 'single' | 'independent' | 'ordered' | 'mixed' | 'queue'
export interface RequestShape {
  kind: RequestKind
  tasks: RequestTask[]
  files: string[]
  /** Task indexes (1-based) grouped by shared files; each group runs in order, groups run independently. */
  lanes: number[][]
  /** For each task, the earlier tasks it must wait for. */
  dependsOn: number[][]
  provider: boolean
  queue: boolean
}

/** Same rule as the turbo CLI: a path token with a code extension. */
const PATH_TOKEN = /(?<![\w/.-])((?:[\w-]+\/)*[\w.-]*\w\.([A-Za-z][A-Za-z0-9]{0,7}))(?![\w/-])/g
const CODE_EXTENSIONS = new Set(['py', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'html', 'htm', 'css', 'scss', 'md', 'json', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'txt', 'go', 'rs', 'java', 'kt', 'rb', 'php', 'cs', 'c', 'h', 'cpp', 'hpp', 'sh', 'sql', 'vue', 'svelte', 'swift', 'dart', 'lua', 'xml'])

const QUEUE_NOUNS = 'issues?|tarefas?|tasks?|tickets?|cards?|bugs?|pull requests?|prs?|itens|items?|chamados?'
const QUEUE_PATTERNS = [
  new RegExp(`\\b(todas?|todos|all|every|each)\\b[^.\\n]{0,40}\\b(${QUEUE_NOUNS})\\b`, 'i'),
  /\b(fila|queue|backlog|kanban|board|quadro)\b/i,
  /\b(drain|esvazie|zere)\b/i,
]
const PROVIDER_PATTERN = /--provider\b|\bopenrouter\b|\bmodo provider\b|\bprovider mode\b|\bvia provider\b/i
const FLAG = /\s--[\w-]+(?:\s+(?:"[^"]*"|'[^']*'|[^\s-][^\s]*))?/g

export function filesIn(text: string): string[] {
  const found: string[] = []
  for (const match of text.matchAll(PATH_TOKEN)) {
    if (CODE_EXTENSIONS.has(match[2].toLowerCase()) && !found.includes(match[1])) found.push(match[1])
  }
  return found
}

function splitTasks(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length > 1) {
    const marker = /^(?:[-*•]|\d+[.)]|\(\d+\))\s+/
    // A first line that ends with a colon only introduces the list.
    const body = /:$/.test(lines[0]) ? lines.slice(1) : lines
    return body.map((line) => line.replace(marker, '').trim()).filter(Boolean)
  }
  const single = lines[0] ?? ''
  const numbered = single.split(/(?:^|\s)\(?\d+[.)]\s+/).map((part) => part.trim()).filter(Boolean)
  if (/(?:^|\s)\(?\d+[.)]\s+\S/.test(single) && numbered.length > 1) return numbered
  return single.split(/\s*;\s*|\s+(?:e depois|e em seguida|depois disso|and then|then|after that)\s+/i).map((part) => part.replace(/^(?:depois|then)[,:]?\s+/i, '').trim()).filter(Boolean)
}

export function analyzeRequest(request: string): RequestShape {
  const provider = PROVIDER_PATTERN.test(request)
  const queue = QUEUE_PATTERNS.some((pattern) => pattern.test(request))
  const cleaned = request.replace(FLAG, '').replace(/\s+--provider\b/gi, '')
  const texts = splitTasks(cleaned.trim())
  const tasks: RequestTask[] = (texts.length ? texts : ['']).map((text, at) => ({ index: at + 1, text, files: filesIn(text) }))

  const dependsOn = tasks.map((task, at) => tasks.slice(0, at).filter((earlier) => earlier.files.some((file) => task.files.includes(file))).map((earlier) => earlier.index))
  // Lanes: tasks connected through shared files (directly or through earlier tasks) run in order in one lane.
  const laneOf = new Map<number, number>()
  const lanes: number[][] = []
  tasks.forEach((task, at) => {
    const parents = dependsOn[at].map((index) => laneOf.get(index)!)
    if (!parents.length) { laneOf.set(task.index, lanes.length); lanes.push([task.index]); return }
    const target = Math.min(...parents)
    for (const other of [...new Set(parents)].filter((lane) => lane !== target)) { for (const index of lanes[other]) laneOf.set(index, target); lanes[target].push(...lanes[other]); lanes[other] = [] }
    lanes[target].push(task.index)
    laneOf.set(task.index, target)
  })
  const compact = lanes.filter((lane) => lane.length).map((lane) => lane.sort((a, b) => a - b))
  const kind: RequestKind = queue ? 'queue' : compact.length === 1 && compact[0].length === 1 ? 'single' : compact.length === 1 ? 'ordered' : compact.some((lane) => lane.length > 1) ? 'mixed' : 'independent'
  return { kind, tasks, files: [...new Set(tasks.flatMap((task) => task.files))], lanes: compact, dependsOn, provider, queue }
}
