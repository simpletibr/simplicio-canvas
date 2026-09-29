// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import providerRun from '../fixtures/traces/turbo-provider.run.json?raw'
import { translator } from '../src/ui/messages'
import { App } from '../src/ui/App'
import { installDomStubs, installFileText } from './helpers/dom'

beforeAll(() => { installDomStubs(); installFileText() })
afterEach(() => { cleanup(); localStorage.clear() })

const t = translator('en')
const openView = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const simulate = (request: string) => {
  openView(t('view.run'))
  fireEvent.change(screen.getByLabelText(t('run.request')), { target: { value: request } })
  fireEvent.click(screen.getByRole('button', { name: t('run.simulate') }))
}
const stepList = () => within(screen.getByRole('list', { name: t('run.steps') })).getAllByRole('listitem')

describe('static views', () => {
  it('opens on the bundled example with its entry points and the first flow drawn', () => {
    render(<App demo={false} />)
    const side = screen.getByRole('complementary', { name: t('side.aria') })
    for (const name of ['simplicio-loop', 'simplicio-loop-mcp', 'simplicio_turbo', 'simplicio_survey']) expect(within(side).getByRole('button', { name: new RegExp(`^${name}\\s`) })).toBeTruthy()
    const canvas = screen.getByRole('main', { name: t('canvas.aria') })
    expect(within(canvas).getByText('run_turbo_command')).toBeTruthy()
    expect(canvas.querySelectorAll('.react-flow__node').length).toBeGreaterThan(8)
  })

  it('shows what a node does when it is clicked: summary, signature, calls and source', () => {
    render(<App demo={false} />)
    fireEvent.click(within(screen.getByRole('main', { name: t('canvas.aria') })).getByText('run_turbo_command'))
    const details = screen.getByRole('complementary', { name: t('details.aria') })
    expect(within(details).getByText('Survey the repository, plan each task, apply the plans and verify the result.')).toBeTruthy()
    expect(within(details).getByText('def run_turbo_command(argv)')).toBeTruthy()
    expect(within(details).getByRole('button', { name: 'parse_options' })).toBeTruthy()
    expect(details.querySelector('.code-line.hl')?.textContent).toContain('def run_turbo_command')
  })

  it('switches entry point and expands a node to show its calls', () => {
    render(<App demo={false} />)
    const canvas = screen.getByRole('main', { name: t('canvas.aria') })
    expect(within(canvas).queryByText('mentioned_paths')).toBeNull()
    fireEvent.click(within(canvas).getByRole('button', { name: /build_tasks.*Show 2 more/ }))
    expect(within(canvas).getByText('mentioned_paths')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('complementary', { name: t('side.aria') })).getByRole('button', { name: /^simplicio_survey\s/ }))
    expect(within(canvas).getByText('simplicio_survey')).toBeTruthy()
  })

  it('draws the architecture with collapsible folders', () => {
    render(<App demo={false} />)
    openView(t('view.architecture'))
    const canvas = screen.getByRole('main', { name: t('canvas.aria') })
    expect(within(canvas).getByText('turbo_cli.py')).toBeTruthy()
    fireEvent.click(within(canvas).getByRole('button', { name: 'Collapse folder simplicio_loop' }))
    expect(within(canvas).queryByText('turbo_cli.py')).toBeNull()
    fireEvent.click(within(canvas).getByRole('button', { name: 'Expand folder simplicio_loop' }))
    expect(within(canvas).getByText('turbo_cli.py')).toBeTruthy()
  })

  it('exports the current view as Mermaid text', () => {
    render(<App demo={false} />)
    fireEvent.click(screen.getByRole('button', { name: t('export.mermaid') }))
    const dialog = screen.getByRole('dialog', { name: t('mermaid.title') })
    const text = (within(dialog).getByRole('textbox') as HTMLTextAreaElement).value
    expect(text.startsWith('flowchart LR')).toBe(true)
    expect(text).toContain('simplicio-loop')
    fireEvent.click(within(dialog).getByRole('button', { name: t('common.close') }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('simulation', () => {
  it('walks a request through the simplicio-loop flow, step by step, with an explanation for each step', () => {
    render(<App demo={false} />)
    simulate('adicione um campo telefone no cadastro.html')
    expect(stepList()).toHaveLength(9)
    const details = screen.getByRole('complementary', { name: t('details.aria') })
    expect(within(details).getByRole('heading', { name: 'Skill invoked' })).toBeTruthy()
    expect(within(details).getByText(t('explain.what'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('player.next') }))
    expect(within(details).getByRole('heading', { name: /simplicio-loop "<request>"/ })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('list', { name: t('run.steps') })).getByRole('button', { name: /Failed\? The model fixes the plan/ }))
    expect(details.querySelector('.unknown-note')?.textContent).toContain(t('run.unknown'))
  })

  it('reads the request: queue and provider mode change the path', () => {
    render(<App demo={false} />)
    simulate('resolva todas as issues')
    expect(stepList()).toHaveLength(18)
    expect(screen.getByText(t('run.readAs', { shape: t('run.shape.queue') }))).toBeTruthy()
    fireEvent.change(screen.getByLabelText(t('run.request')), { target: { value: 'add x to app.py --provider openrouter' } })
    fireEvent.click(screen.getByRole('button', { name: t('run.simulate') }))
    expect(within(screen.getByRole('list', { name: t('run.steps') })).getByText('Model call (OpenRouter)')).toBeTruthy()
  })

  it('walks the call graph of a project entry point', () => {
    render(<App demo={false} />)
    openView(t('view.run'))
    fireEvent.change(screen.getByLabelText(t('run.flow')), { target: { value: 'console_script:simplicio-loop' } })
    fireEvent.change(screen.getByLabelText(t('run.request')), { target: { value: 'turbo add a field' } })
    fireEvent.click(screen.getByRole('button', { name: t('run.simulate') }))
    const names = stepList().map((item) => item.textContent ?? '')
    expect(names.length).toBeGreaterThan(10)
    expect(names[0]).toContain('simplicio-loop')
    expect(names.some((name) => name.includes('run_turbo_command'))).toBe(true)
  })

  it('drives the player with the keyboard and the transport buttons', () => {
    render(<App demo={false} />)
    simulate('adicione um campo telefone no cadastro.html')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(within(screen.getByRole('list', { name: t('run.steps') })).getAllByRole('button')[2].getAttribute('aria-current')).toBe('step')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(within(screen.getByRole('list', { name: t('run.steps') })).getAllByRole('button')[1].getAttribute('aria-current')).toBe('step')
    fireEvent.click(screen.getByRole('button', { name: t('player.restart') }))
    expect(within(screen.getByRole('list', { name: t('run.steps') })).getAllByRole('button')[0].getAttribute('aria-current')).toBe('step')
    fireEvent.click(screen.getByRole('button', { name: t('player.play') }))
    expect(screen.getByRole('button', { name: t('player.pause') }).getAttribute('aria-pressed')).toBe('true')
  })

  it('writes the explanations in the selected language and re-simulates when the language changes', async () => {
    render(<App demo={false} />)
    simulate('adicione um campo telefone no cadastro.html')
    fireEvent.change(screen.getByRole('combobox', { name: t('locale.aria') }), { target: { value: 'pt-BR' } })
    const pt = translator('pt-BR')
    await waitFor(() => expect(screen.getByText(pt('explain.what'))).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'Skill invocada' })).toBeTruthy()
    expect(screen.getByRole('button', { name: pt('view.run') })).toBeTruthy()
  })
})

describe('real runs', () => {
  it('replays a bundled sample and shows every LLM call with tokens, latency and the run total', () => {
    render(<App demo={false} />)
    openView(t('view.run'))
    fireEvent.click(screen.getByRole('button', { name: t('run.real') }))
    fireEvent.change(screen.getByLabelText(t('run.samples')), { target: { value: 'turbo-provider' } })
    const steps = stepList()
    expect(steps).toHaveLength(11)
    fireEvent.click(within(steps[2]).getByRole('button'))
    const details = screen.getByRole('complementary', { name: t('details.aria') })
    expect(within(details).getByRole('heading', { name: /Model call 1/ })).toBeTruthy()
    expect(within(details).getByText('deepseek/deepseek-v4.1-flash')).toBeTruthy()
    expect(within(details).getByText('DeepInfra')).toBeTruthy()
    expect(within(details).getAllByText(/\$0\.001884/).length).toBeGreaterThan(0)
    expect(within(details).getByRole('region', { name: t('summary.title') })).toBeTruthy()
    expect(within(details).getByText(t('run.sampleBadge'))).toBeTruthy()
  })

  it('loads a turbo-run document from a file and rejects a file that is not a trace', async () => {
    render(<App demo={false} />)
    openView(t('view.run'))
    fireEvent.click(screen.getByRole('button', { name: t('run.real') }))
    const input = document.querySelector('.file-btn input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['this is not json'], 'notes.txt', { type: 'text/plain' })] } })
    expect((await screen.findByRole('alert')).textContent).toMatch(/not a valid trace/i)
    fireEvent.change(input, { target: { files: [new File([providerRun], 'run.json', { type: 'application/json' })] } })
    await waitFor(() => expect(stepList()).toHaveLength(11))
  })

  it('loads a generic JSONL trace dropped on the page', async () => {
    render(<App demo={false} />)
    const jsonl = ['{"id":"a","kind":"step","name":"Handle request","start":0,"end":2}', '{"id":"b","parent":"a","kind":"llm_call","name":"Summarize","start":0.5,"end":1.5,"attrs":{"model":"m","prompt_tokens":10,"completion_tokens":3,"prompt_preview":"hello","response_preview":"hi"}}'].join('\n')
    const file = new File([jsonl], 'mine.jsonl')
    fireEvent.drop(window, { dataTransfer: { files: [file], types: ['Files'] } })
    await waitFor(() => expect(stepList()).toHaveLength(2))
    fireEvent.click(within(stepList()[1]).getByRole('button'))
    const details = screen.getByRole('complementary', { name: t('details.aria') })
    expect(within(details).getByText('hello')).toBeTruthy()
    expect(within(details).getByText('hi')).toBeTruthy()
  })
})

describe('read-only demo', () => {
  it('disables importing from GitHub or a folder but still replays samples and simulates', () => {
    render(<App demo />)
    expect((screen.getByLabelText(t('github.aria')) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: t('github.analyze') }) as HTMLButtonElement).disabled).toBe(true)
    expect((document.querySelector('.actions input[type=file]') as HTMLInputElement).disabled).toBe(true)
    simulate('resolva todas as issues')
    expect(stepList()).toHaveLength(18)
    fireEvent.click(screen.getByRole('button', { name: t('run.real') }))
    expect(document.querySelector('.file-btn input')).not.toBeNull()
  })
})
