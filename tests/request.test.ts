import { describe, expect, it } from 'vitest'
import { analyzeRequest } from '../src/domain/request'

describe('request analysis', () => {
  it('treats one sentence as one task and picks the named file as its target', () => {
    const shape = analyzeRequest('adicione um campo telefone no cadastro.html')
    expect(shape).toMatchObject({ kind: 'single', provider: false, queue: false })
    expect(shape.tasks).toEqual([{ index: 1, text: 'adicione um campo telefone no cadastro.html', files: ['cadastro.html'] }])
    expect(shape.files).toEqual(['cadastro.html'])
    expect(shape.lanes).toEqual([[1]])
  })

  it('splits numbered items into independent tasks when they name different files', () => {
    const shape = analyzeRequest('1) adicione telefone no cadastro.html 2) corrija o teste em tests/test_api.py')
    expect(shape.kind).toBe('independent')
    expect(shape.tasks.map((task) => task.files)).toEqual([['cadastro.html'], ['tests/test_api.py']])
    expect(shape.lanes).toEqual([[1], [2]])
  })

  it('splits bullet lines and lines separated by newlines, dropping an introductory line', () => {
    const shape = analyzeRequest('Faça o seguinte:\n- criar utils/mask.js\n- ajustar app.js')
    expect(shape.tasks.map((task) => task.text)).toEqual(['criar utils/mask.js', 'ajustar app.js'])
    expect(shape.kind).toBe('independent')
  })

  it('keeps tasks that touch the same file in order', () => {
    const shape = analyzeRequest('adicione validação em app.py; depois renomeie a função em app.py')
    expect(shape.kind).toBe('ordered')
    expect(shape.tasks).toHaveLength(2)
    expect(shape.lanes).toEqual([[1, 2]])
    expect(shape.dependsOn).toEqual([[], [1]])
  })

  it('mixes lanes: independent files run in separate lanes, tasks on one file stay together', () => {
    const shape = analyzeRequest('- ajustar a.py\n- ajustar b.py\n- testar a.py')
    expect(shape.kind).toBe('mixed')
    expect(shape.lanes).toEqual([[1, 3], [2]])
  })

  it('recognises queue requests in Portuguese and English', () => {
    for (const text of ['resolva todas as issues', 'feche todas as issues abertas', 'fix all open issues', 'clear the CI queue', 'esvazie o backlog', 'drain the Jira board']) {
      expect(analyzeRequest(text), text).toMatchObject({ kind: 'queue', queue: true })
    }
    expect(analyzeRequest('adicione um campo no cadastro.html').queue).toBe(false)
  })

  it('detects an explicit provider mode and removes the flag from the task text', () => {
    const shape = analyzeRequest('adicione telefone no cadastro.html --provider openrouter')
    expect(shape).toMatchObject({ provider: true, kind: 'single' })
    expect(shape.tasks[0].text).toBe('adicione telefone no cadastro.html')
    expect(analyzeRequest('use o modo provider para editar app.py').provider).toBe(true)
    expect(analyzeRequest('edit app.py via openrouter').provider).toBe(true)
  })

  it('strips other command-line flags such as --verify from the task text', () => {
    const shape = analyzeRequest('corrigir app.py --verify "pytest -q"')
    expect(shape.tasks[0].text).toBe('corrigir app.py')
  })

  it('only counts real code files: sentences, versions and abbreviations are not files', () => {
    expect(analyzeRequest('e.g. atualizar a versão 1.2.3 e fechar.').files).toEqual([])
    expect(analyzeRequest('ajustar src/app/main.ts, README.md e Makefile.').files).toEqual(['src/app/main.ts', 'README.md'])
  })

  it('handles an empty request as a single task with no files', () => {
    expect(analyzeRequest('   ')).toMatchObject({ kind: 'single', files: [] })
    expect(analyzeRequest('   ').tasks).toEqual([{ index: 1, text: '', files: [] }])
  })
})
