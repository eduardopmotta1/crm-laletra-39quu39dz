export type KanbanStage =
  | 'Novo contato'
  | 'Precisa responder'
  | 'Em atendimento'
  | 'Orçamento enviado'
  | 'Aguardando cliente'
  | 'Venda fechada'
  | 'Não fechou'

export const KANBAN_STAGES: KanbanStage[] = [
  'Novo contato',
  'Precisa responder',
  'Em atendimento',
  'Orçamento enviado',
  'Aguardando cliente',
  'Venda fechada',
  'Não fechou',
]

export type Priority = 'baixa' | 'media' | 'alta' | 'urgente'

export interface User {
  id: string
  name: string
  email: string
  avatar?: string
  created: string
  updated: string
}

export interface Client {
  id: string
  name: string
  phone: string
  email?: string
  stage: KanbanStage
  product_interest?: string
  quote_value?: number
  priority: Priority
  assigned_to?: string
  expand?: {
    assigned_to?: User
  }
  last_message_at?: string
  last_message_direction?: 'inbound' | 'outbound'
  last_message_text?: string
  notes?: string
  next_action?: string
  next_action_date?: string
  created: string
  updated: string
}

export interface Task {
  id: string
  title: string
  description?: string
  client_id: string
  assigned_to?: string
  due_date: string
  status: 'pendente' | 'concluida' | 'cancelada'
  priority: 'baixa' | 'media' | 'alta'
  expand?: {
    client_id?: Client
    assigned_to?: User
  }
  created: string
  updated: string
}

export interface Message {
  id: string
  client_id: string
  direction: 'inbound' | 'outbound'
  message_text: string
  sender_name?: string
  sent_by_user?: string
  whatsapp_message_id?: string
  status?: 'sent' | 'delivered' | 'read' | 'failed'
  created: string
  updated: string
}

export interface SystemSetting {
  id: string
  setting_key: string
  setting_value: string
  description?: string
  created: string
  updated: string
}

export interface SlaConfig {
  urgentHours: number // default 24
  warningHours: number // default 12
  noticeHours: number // default 6
}

export type SlaStatus = 'normal' | 'notice' | 'warning' | 'urgent'

export interface SlaInfo {
  status: SlaStatus
  hoursElapsed: number
  label: string
  colorBadgeClass: string
  colorBorderClass: string
  colorBgClass: string
  colorTextClass: string
}
