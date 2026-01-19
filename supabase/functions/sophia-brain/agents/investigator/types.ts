export interface CheckupItem {
  id: string
  type: "action" | "vital" | "framework"
  title: string
  description?: string
  tracking_type: "boolean" | "counter"
  target?: number
  current?: number
  unit?: string
  // Habitudes: planification optionnelle (jours) + contexte de bilan
  scheduled_days?: string[]
  is_scheduled_day?: boolean
  day_scope?: "today" | "yesterday"
  is_habit?: boolean
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



