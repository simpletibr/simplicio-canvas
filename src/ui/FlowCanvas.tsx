import { Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, useReactFlow, useStore, type Node, type NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { FlowGraph } from '../domain/flow-graph'
import type { Layout } from '../domain/layout'
import { FlowActionsContext } from './context'
import type { Translate } from './messages'
import { nodeTypes } from './nodes'
import { toReactFlow, type CardData } from './rf-model'
import type { RunState } from './run-state'

export interface FlowCanvasProps {
  graph: FlowGraph | null
  layout: Layout | null
  runState?: RunState
  selectedId: string | null
  onSelect(id: string | null): void
  onExpand(id: string): void
  onToggle(id: string): void
  draggable: boolean
  follow: boolean
  reducedMotion: boolean
  t: Translate
  empty: ReactNode
}

/** Keeps the active replay node in view. Lives inside <ReactFlow> to reach the viewport. */
function FollowCamera({ activeId, layout, enabled, reduced }: { activeId?: string; layout: Layout; enabled: boolean; reduced: boolean }) {
  const flow = useReactFlow()
  const { viewportInitialized } = flow
  // The pane can still be settling when the first step is centred; centre again once its real size is known.
  const paneHeight = useStore((state) => state.height)
  const paneWidth = useStore((state) => state.width)
  useEffect(() => {
    if (!enabled || !activeId || !viewportInitialized || !paneHeight || !paneWidth) return
    const box = layout.positions.get(activeId)
    if (!box) return
    void flow.setCenter(box.x + box.width / 2, box.y + box.height / 2, { zoom: Math.max(flow.getZoom(), 0.8), duration: reduced ? 0 : 450 })
  }, [activeId, enabled, viewportInitialized, paneHeight, paneWidth, flow, layout, reduced])
  return null
}

export function FlowCanvas(props: FlowCanvasProps) {
  const { graph, layout, runState, selectedId, onSelect, onExpand, onToggle, draggable, follow, reducedMotion, t, empty } = props
  const [overrides, setOverrides] = useState<Map<string, { x: number; y: number }>>(new Map())
  useEffect(() => setOverrides(new Map()), [graph?.id])

  const model = useMemo(() => (graph && layout ? toReactFlow(graph, layout, { runState, overrides, draggable, selectedId, reducedMotion }) : null), [graph, layout, runState, overrides, draggable, selectedId, reducedMotion])
  const actions = useMemo(() => ({ expand: onExpand, toggle: onToggle, t }), [onExpand, onToggle, t])

  const onNodesChange = useCallback((changes: NodeChange<Node<CardData>>[]) => {
    const moved = changes.filter((change): change is Extract<NodeChange<Node<CardData>>, { type: 'position' }> => change.type === 'position' && change.position !== undefined)
    if (!moved.length) return
    setOverrides((current) => { const next = new Map(current); for (const change of moved) next.set(change.id, change.position!); return next })
  }, [])

  if (!graph || !layout || !model || !graph.nodes.length) return <div className="canvas-empty" role="status">{empty}</div>
  return (
    <FlowActionsContext.Provider value={actions}>
      <ReactFlow
        key={graph.id} nodes={model.nodes} edges={model.edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
        onNodeClick={(_event, node) => onSelect(node.id)} onPaneClick={() => onSelect(null)}
        fitView={!(runState && follow)} fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }} minZoom={0.1} maxZoom={2} colorMode="dark"
        nodesDraggable={draggable} nodesConnectable={false} edgesFocusable={false} deleteKeyCode={null} selectionKeyCode={null}
        proOptions={{ hideAttribution: false }} aria-label={t('canvas.aria')}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#1c2b29" />
        <MiniMap pannable zoomable style={{ width: 150, height: 100 }} ariaLabel={t('canvas.minimap')} nodeColor={(node) => String((node.data as CardData | undefined)?.accent ?? '#8b9aab')} maskColor="rgba(7,16,15,0.72)" />
        <Controls showInteractive={false} />
        {overrides.size ? <Panel position="top-right"><button type="button" className="btn small" onClick={() => setOverrides(new Map())}>{t('canvas.relayout')}</button></Panel> : null}
        {runState ? <FollowCamera activeId={runState.activeNode} layout={layout} enabled={follow} reduced={reducedMotion} /> : null}
        {graph.truncated ? <Panel position="bottom-left"><span className="chip chip-error">{t('canvas.truncated', { count: graph.nodes.length })}</span></Panel> : null}
      </ReactFlow>
    </FlowActionsContext.Provider>
  )
}
