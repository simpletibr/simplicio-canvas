import { Handle, type Node, type NodeProps, type NodeTypes } from '@xyflow/react'
import type { CSSProperties } from 'react'
import type { FlowNodeKind } from '../domain/flow-graph'
import { handlePositions, type CardData } from './rf-model'
import { useFlowActions } from './context'

const GLYPHS: Record<FlowNodeKind, string> = {
  entry: '▶', function: 'ƒ', method: 'ƒ', class: '◇', external: '?', file: '▤', group: '▣',
  step: '●', llm_call: '✦', tool: '⚙', command: '$', file_edit: '✎', verify: '✓',
}

export function KindGlyph({ kind }: { kind: FlowNodeKind }) {
  return <span className="glyph" aria-hidden="true">{GLYPHS[kind]}</span>
}

const style = (accent?: string) => ({ '--accent': accent ?? '#8b9aab' }) as CSSProperties

function classes(data: CardData, extra = '') {
  const { node, run } = data
  return ['card', `kind-${node.kind}`, extra, run ? `run-${run.cls}` : '', run?.status && run.status !== 'ok' ? `status-${run.status}` : '', node.status && node.status !== 'ok' && !run ? `status-${node.status}` : ''].filter(Boolean).join(' ')
}

export function CardNode({ id, data }: NodeProps<Node<CardData>>) {
  const { node, vertical, accent } = data
  const { expand, toggle, t } = useFlowActions()
  const handles = handlePositions(vertical)
  const isGroup = node.kind === 'group'
  const status = data.run?.status ?? node.status
  return (
    <div className={classes(data)} style={style(accent)} data-node-id={id}>
      <Handle type="target" position={handles.target} isConnectable={false} />
      <header className="card-head">
        <KindGlyph kind={node.kind} />
        <span className="card-title" title={node.label}>{node.label}</span>
        <span className="card-kind">{t(`kind.${node.kind}` as 'kind.step')}</span>
      </header>
      {node.subtitle ? <div className="card-sub" title={node.subtitle}>{node.subtitle}</div> : null}
      {node.summary ? <p className="card-summary">{node.summary}</p> : null}
      {node.badges?.length || (status && status !== 'ok') ? (
        <div className="card-badges">
          {status && status !== 'ok' ? <span className={`chip chip-${status}`}>{status === 'unknown' ? '? ' : ''}{t(`status.${status}` as 'status.ok')}</span> : null}
          {node.badges?.map((badge) => <span className="chip" key={badge}>{badge}</span>)}
        </div>
      ) : null}
      {isGroup ? <button type="button" className="card-toggle nodrag nopan" aria-label={t('arch.expandOne', { name: node.label })} aria-expanded={false} onClick={(event) => { event.stopPropagation(); toggle(id) }}>▸</button> : null}
      {node.hidden ? <button type="button" className="card-more nodrag nopan" title={t('flow.expand', { count: node.hidden })} aria-label={`${node.label}: ${t('flow.expand', { count: node.hidden })}`} onClick={(event) => { event.stopPropagation(); expand(id) }}>+{node.hidden}</button> : null}
      <Handle type="source" position={handles.source} isConnectable={false} />
    </div>
  )
}

export function GroupNode({ id, data }: NodeProps<Node<CardData>>) {
  const { node, vertical } = data
  const { toggle, t } = useFlowActions()
  const handles = handlePositions(vertical)
  return (
    <div className="group-box" data-node-id={id}>
      <Handle type="target" position={handles.target} isConnectable={false} />
      <header className="group-head">
        <button type="button" className="group-toggle nodrag nopan" aria-label={t('arch.collapseOne', { name: node.label })} aria-expanded onClick={(event) => { event.stopPropagation(); toggle(id) }}>▾</button>
        <span className="group-title">{node.label}/</span>
        <span className="group-count">{node.subtitle}</span>
      </header>
      <Handle type="source" position={handles.source} isConnectable={false} />
    </div>
  )
}

export const nodeTypes: NodeTypes = { card: CardNode, folder: GroupNode }
