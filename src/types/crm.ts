export type KanbanStage =
  | 'Novo contato'
  | 'Contato iniciado'
  | 'Precisa responder'
  | 'Em atendimento'
  | 'Orçamento enviado'
  | 'Aguardando cliente'
  | 'Venda fechada'
  | 'Não fechou'
  | string

export const DEFAULT_KANBAN_STAGES = [
  'Novo contato',
  'Contato iniciado',
  'Precisa responder',
  'Em atendimento',
  'Orçamento enviado',
  'Aguardando cliente',
  'Venda fechada',
  'Não fechou',
]

export const KANBAN_STAGES = DEFAULT_KANBAN_STAGES

export type StageType = 'initial' | 'intermediate' | 'final'

export interface KanbanColumn {
  id: string
  internal_id: string
  name: string
  description?: string
  color?: string
  order_index: number
  is_visible: boolean
  stage_type: StageType
  created?: string
  updated?: string
}

export type Priority = 'baixa' | 'media' | 'alta' | 'urgente'

export interface User {
  id: string
  name: string
  email: string
  avatar?: string
  created: string
  updated: string
}

export type RelationshipStatus =
  | 'satisfied'
  | 'dissatisfied'
  | 'in_recovery'
  | 'recovered'
  | 'neutral'

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
    last_archived_deal_id?: ArchivedDeal
  }
  is_archived?: boolean
  has_returned?: boolean
  reopened_at?: string
  closed_at?: string
  last_archived_deal_id?: string
  relationship_status?: RelationshipStatus
  total_purchases?: number
  total_purchase_value?: number
  first_purchase_date?: string
  last_purchase_date?: string
  last_message_at?: string
  last_message_direction?: 'inbound' | 'outbound'
  last_message_text?: string
  notes?: string
  next_action?: string
  next_action_date?: string
  created: string
  updated: string
}

export type EvaluationStatus = 'pending_contact' | 'in_recovery' | 'resolved' | 'satisfied'

export interface Evaluation {
  id: string
  token: string
  client_id: string
  attendance_id?: string
  attendance_deal_id?: string
  overall_rating: number
  service_rating?: number
  quality_rating?: number
  delivery_rating?: number
  comment?: string
  status?: EvaluationStatus
  resolved?: boolean
  resolved_at?: string
  resolved_notes?: string
  resolved_by?: string
  expand?: {
    client_id?: Client
    attendance_id?: ArchivedDeal
    resolved_by?: User
  }
  created: string
  updated: string
}

export type PostSaleStatus = 'pending' | 'sent' | 'completed' | 'cancelled'

export interface PostSale {
  id: string
  client_id: string
  attendance_id?: string
  scheduled_date: string
  sent_date?: string
  status: PostSaleStatus
  task_id?: string
  evaluation_token?: string
  channel?: string
  notes?: string
  expand?: {
    client_id?: Client
    attendance_id?: ArchivedDeal
    task_id?: Task
  }
  created: string
  updated: string
}

export interface PostSaleConfig {
  enabled: boolean
  delayDays: number // 1, 3, 7 or custom
  autoTask: boolean
  whatsappTemplate: string
  customMessage: string
}

export type DealResult = 'Venda fechada' | 'Venda perdida'

export interface ArchivedDeal {
  id: string
  client_id: string
  client_name: string
  client_phone: string
  client_email?: string
  result: DealResult
  loss_reason?: string
  loss_category?: string
  product_interest?: string
  quote_value?: number
  closed_at: string
  assigned_to?: string
  closed_by?: string
  final_notes?: string
  duration_days?: number
  expand?: {
    client_id?: Client
    assigned_to?: User
    closed_by?: User
  }
  created: string
  updated: string
}

export interface StageTransition {
  id: string
  client_id: string
  from_stage?: string
  to_stage: string
  from_stage_id?: string
  to_stage_id?: string
  change_type: 'manual' | 'automatic'
  user_id?: string
  user_name?: string
  notes?: string
  expand?: {
    user_id?: User
    client_id?: Client
  }
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

export interface WhatsAppTemplate {
  id: string
  name: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  language: string
  status: 'APPROVED' | 'PENDING' | 'REJECTED'
  body: string
  variables?: string[]
  meta_template_id?: string
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

export interface AutoArchiveConfig {
  enabled: boolean
  wonHours: number
  lostHours: number
}

export interface SlaConfig {
  urgentMinutes: number // default 1440 (24h)
  warningMinutes: number // default 720 (12h)
  noticeMinutes: number // default 360 (6h)
  urgentHours?: number
  warningHours?: number
  noticeHours?: number
}

export type SlaStatus = 'normal' | 'notice' | 'warning' | 'urgent'

export interface SlaInfo {
  status: SlaStatus
  minutesElapsed: number
  hoursElapsed?: number
  label: string
  colorBadgeClass: string
  colorBorderClass: string
  colorBgClass: string
  colorTextClass: string
}

/**
 * Checks if a client is within the Meta 24-hour service window
 * (Customer sent an inbound message less than 24h ago).
 */
export function isWithin24HourWindow(
  lastMessageAt?: string,
  lastMessageDirection?: 'inbound' | 'outbound',
): boolean {
  if (!lastMessageAt || lastMessageDirection !== 'inbound') {
    return false
  }
  const messageTime = new Date(lastMessageAt).getTime()
  const now = Date.now()
  const diffHours = (now - messageTime) / (1000 * 60 * 60)
  return diffHours <= 24
}
