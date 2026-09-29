import { createContext, useContext } from 'react'
import type { Translate } from './messages'

export interface FlowActions { expand(id: string): void; toggle(id: string): void; t: Translate }

export const FlowActionsContext = createContext<FlowActions>({ expand: () => undefined, toggle: () => undefined, t: (key) => key })
export const useFlowActions = () => useContext(FlowActionsContext)
