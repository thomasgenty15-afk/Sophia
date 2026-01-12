export interface CheckupItem {
  id: string
  type: "action" | "vital" | "framework"
  title: string
  description?: string
  tracking_type: "boolean" | "counter"
  target?: number
  unit?: string
}

export interface InvestigationState {
  status: "init" | "checking" | "closing"
  pending_items: CheckupItem[]
  current_item_index: number
  temp_memory: any
}

export type InvestigatorTurnResult = {
  content: string
  investigationComplete: boolean
  newState: any
}



