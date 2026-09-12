export type KanbanStage =
  | 'Novo contato'
  | 'Precisa responder'
  | 'Em atendimento'
  | 'Orçamento enviado'
  | 'Aguardando cliente'
  | 'Venda fechada'
  | 'Não fechou'
  | string

export const DEFAULT_KANBAN_STAGES = [
  'Novo contato',
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

export type RoleSlug = 'admin' | 'comercial' | 'producao' | 'custom' | string

export interface Role {
  id: string
  name: string
  slug: RoleSlug
  description?: string
  is_system?: boolean
  color?: string
  permissions: Record<string, boolean>
  created?: string
  updated?: string
}

export interface AuditLog {
  id: string
  user_id?: string
  user_name?: string
  user_email?: string
  action: string
  module?: string
  record_id?: string
  record_title?: string
  details?: string
  previous_value?: any
  new_value?: any
  ip_address?: string
  created: string
  updated: string
  expand?: {
    user_id?: User
  }
}

export interface User {
  id: string
  name: string
  email: string
  avatar?: string
  phone?: string
  role_id?: string
  role_slug?: RoleSlug
  is_active?: boolean
  custom_permissions?: Record<string, boolean>
  expand?: {
    role_id?: Role
  }
  created: string
  updated: string
}

export type RelationshipStatus =
  | 'satisfied'
  | 'dissatisfied'
  | 'in_recovery'
  | 'recovered'
  | 'neutral'

export interface Attendance {
  id: string
  client_id: string
  stage: KanbanStage
  assigned_to?: string
  product_interest?: string
  quote_value?: number
  notes?: string
  source?: string
  is_archived?: boolean
  result?: DealResult
  loss_reason?: string
  closed_at?: string
  archived_at?: string
  last_customer_message_at?: string
  last_company_message_at?: string
  last_archived_deal_id?: string
  expand?: {
    client_id?: Client
    assigned_to?: User
    last_archived_deal_id?: ArchivedDeal
  }
  created: string
  updated: string
}

export interface Client {
  id: string
  name: string
  phone: string
  normalized_phone?: string
  email?: string
  attendance_id?: string
  // Legacy / convenience fields on client
  stage?: KanbanStage
  product_interest?: string
  quote_value?: number
  priority?: Priority
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
  // Permanent customer registration fields
  client_type?: 'pessoa_fisica' | 'pessoa_juridica'
  trade_name?: string
  cpf_cnpj?: string
  birth_date?: string
  secondary_phone?: string
  instagram?: string
  how_found?: string
  is_vip?: boolean
  address_zip?: string
  address_street?: string
  address_number?: string
  address_complement?: string
  address_neighborhood?: string
  address_city?: string
  address_state?: string
  public_token?: string
  created: string
  updated: string
}

export interface PublicClientProfileData {
  name: string
  trade_name?: string
  client_type: 'pessoa_fisica' | 'pessoa_juridica'
  cpf_cnpj?: string
  birth_date?: string
  phone: string
  secondary_phone?: string
  email?: string
  instagram?: string
  how_found?: string
  address_zip?: string
  address_street?: string
  address_number?: string
  address_complement?: string
  address_neighborhood?: string
  address_city?: string
  address_state?: string
}

export type EvaluationStatus = 'pending_contact' | 'in_recovery' | 'resolved' | 'satisfied'

export interface Evaluation {
  id: string
  token: string
  client_id: string
  order_id?: string
  order_number?: string
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
    order_id?: ProductionOrder
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
  order_id?: string
  order_number?: string
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
    order_id?: ProductionOrder
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
  attendance_id?: string
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
    attendance_id?: Attendance
    assigned_to?: User
    closed_by?: User
  }
  created: string
  updated: string
}

export interface StageTransition {
  id: string
  client_id: string
  attendance_id?: string
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
    attendance_id?: Attendance
  }
  created: string
  updated: string
}

export interface Task {
  id: string
  title: string
  description?: string
  client_id: string
  attendance_id?: string
  assigned_to?: string
  due_date: string
  status: 'pendente' | 'concluida' | 'cancelada'
  priority: 'baixa' | 'media' | 'alta'
  expand?: {
    client_id?: Client
    attendance_id?: Attendance
    assigned_to?: User
  }
  created: string
  updated: string
}

export interface Message {
  id: string
  client_id: string
  attendance_id?: string
  direction: 'inbound' | 'outbound'
  message_text: string
  sender_name?: string
  sent_by_user?: string
  whatsapp_message_id?: string
  status?: 'sent' | 'delivered' | 'read' | 'failed'
  file?: string
  file_name?: string
  file_size?: number
  file_type?: string
  expand?: {
    client_id?: Client
    attendance_id?: Attendance
    sent_by_user?: User
  }
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

export interface AutomationConfig {
  // Cliente aguardando resposta
  waitingResponseAltaMinutes: number // default 15
  waitingResponseUrgenteMinutes: number // default 60
  // Orçamento sem retorno
  quoteNoReturnAltaDays: number // default 1
  quoteNoReturnUrgenteDays: number // default 3
  // Follow-up vencido
  followupOverdueUrgenteDays: number // default 2
  // Arte aguardando aprovação
  proofWaitingAltaDays: number // default 1
  proofWaitingUrgenteDays: number // default 2
  // Pedido atrasado
  orderOverdueUrgenteDays: number // default 1
  // Cliente insatisfeito
  dissatisfiedUrgenteHours: number // default 24
  // Pós-venda pendente
  postSaleAltaDays: number // default 1
  postSaleUrgenteDays: number // default 3
  // Modo de execução (informativo, não afeta lógica)
  executionModes: Record<string, 'event' | 'page_load' | 'visual'>
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

// ----------------------------------------------------
// Production Module Types
// ----------------------------------------------------

export type ProductionStageInternalId =
  | 'order_received'
  | 'awaiting_info'
  | 'art_preparation'
  | 'awaiting_approval'
  | 'approved'
  | 'in_production'
  | 'ready'
  | 'shipped'
  | 'completed'
  | string

export interface ProductionStage {
  id: string
  internal_id: ProductionStageInternalId
  name: string
  description?: string
  color?: string
  order_index: number
  is_visible: boolean
  auto_notify_whatsapp?: boolean
  whatsapp_message_template?: string
  created?: string
  updated?: string
}

export type ProductionDeliveryType = 'retirada' | 'envio' | 'entrega_propria'

export interface ProductionOrder {
  id: string
  order_number: string // e.g. #001842
  tracking_token: string
  client_id: string
  attendance_id?: string
  quote_id?: string
  client_name: string
  client_phone: string
  client_email?: string
  deal_origin_id?: string
  sale_date?: string
  product: string
  description?: string
  quantity?: number
  dimensions?: string
  total_value?: number
  sales_rep_id?: string
  production_rep_id?: string
  promised_deadline?: string
  estimated_delivery_date?: string
  completed_at?: string
  delivery_type?: ProductionDeliveryType
  tracking_code?: string
  notes?: string
  attachments?: string[]
  requires_art_approval?: boolean
  art_approved?: boolean
  art_approved_at?: string
  approved_proof_id?: string
  stage_id?: string
  stage_internal_id: ProductionStageInternalId
  stage_name: string
  priority?: Priority
  is_completed?: boolean
  is_archived?: boolean
  expand?: {
    client_id?: Client
    attendance_id?: Attendance
    quote_id?: any
    deal_origin_id?: ArchivedDeal
    sales_rep_id?: User
    production_rep_id?: User
    stage_id?: ProductionStage
    approved_proof_id?: ProductionProof
  }
  created: string
  updated: string
}

export interface ProductionLog {
  id: string
  order_id: string
  from_stage_id?: string
  from_stage_name?: string
  to_stage_id: string
  to_stage_name: string
  user_id?: string
  user_name?: string
  change_type: 'manual' | 'automatic'
  notes?: string
  whatsapp_sent?: boolean
  whatsapp_status?: 'nao_enviado' | 'enviado' | 'entregue' | 'falhou'
  whatsapp_message?: string
  expand?: {
    order_id?: ProductionOrder
    user_id?: User
  }
  created: string
  updated: string
}

export interface ProductionProof {
  id: string
  order_id: string
  version_number?: number
  proof_url?: string
  proof_file?: string[]
  sent_at?: string
  sent_by?: string
  status: 'aguardando_aprovacao' | 'aprovado' | 'alteracao_solicitada'
  feedback_notes?: string
  client_comment?: string
  approved_at?: string
  approved_by_contact?: string
  expand?: {
    order_id?: ProductionOrder
    sent_by?: User
  }
  created: string
  updated: string
}

export interface ProductionDeadlineStatus {
  status: 'normal' | 'due_today' | 'due_tomorrow' | 'overdue' | 'completed' | 'no_date'
  daysRemaining?: number
  label: string
  badgeClass: string
  cardBorderClass: string
}

// ----------------------------------------------------
// Central de Pendências Types
// ----------------------------------------------------

export type PendingCategory =
  | 'clients_waiting_response' // Clientes aguardando resposta WhatsApp
  | 'overdue_attendances' // Atendimentos atrasados (SLA geral sem ação)
  | 'quotes_waiting_return' // Orçamentos aguardando retorno
  | 'overdue_followups' // Follow-ups vencidos ou para hoje
  | 'proofs_waiting_approval' // Artes aguardando aprovação
  | 'orders_overdue' // Pedidos atrasados na produção
  | 'orders_due_today' // Pedidos que vencem hoje
  | 'first_contact'
  | 'client_reply'
  | 'quote_followup'
  | 'commercial_followup'
  | 'task_overdue'
  | 'procedure_delayed'
  | 'production_delayed'
  | 'proof_approval'
  | 'post_sale'
  | 'inactive_client'
  | (string & {})
  | 'orders_due_tomorrow' // Pedidos que vencem amanhã
  | 'pending_post_sales' // Pós-vendas pendentes
  | 'dissatisfied_clients' // Clientes insatisfeitos (nota <= 3 ou reclamação aberta)

export type PendingPriority = 'baixa' | 'normal' | 'alta' | 'urgente'

export interface PendingItem {
  id: string
  category: PendingCategory
  categoryLabel?: string
  title: string
  subtitle?: string
  description?: string
  priority: PendingPriority
  createdAt: string
  referenceDate?: string
  waitingTimeFormatted?: string
  waitingTimeMinutes?: number
  slaMinutes?: number
  isDelayed?: boolean
  dueDate?: string
  assignedToId?: string
  assignedToName?: string
  assignedToAvatar?: string

  // Entity context
  clientId?: string
  attendanceId?: string
  clientName: string
  clientPhone: string
  clientEmail?: string
  productInterest?: string
  quoteValue?: number
  currentStage?: string

  // Specific entity references
  orderId?: string
  orderNumber?: string
  proofId?: string
  taskId?: string
  evaluationId?: string
  evaluationRating?: number
  evaluationComment?: string
  postSaleId?: string

  // Raw object for fast operations
  originalData?: any
}

export interface PendingResolutionRecord {
  id: string
  category: PendingCategory | string
  item_id: string
  item_title?: string
  client_id?: string
  attendance_id?: string
  client_name?: string
  assigned_to?: string
  assigned_name?: string
  resolved_by?: string
  resolved_by_name?: string
  action_taken?: string
  notes?: string
  item_created_at?: string
  resolved_at?: string
  resolution_time_minutes?: number
  initial_priority?: string
  created: string
  updated: string
}

export interface EfficiencyMetrics {
  averageResolutionMinutes?: number
  resolvedToday?: number
  resolvedThisWeek?: number
  totalResolved?: number
  byPriority?: Record<string, number>
  avgFirstResponseMinutes?: number
  totalOverdueAttendances?: number
  resolvedTodayCount?: number
  avgResolutionMinutes?: number
  percentResponsesOnTime?: number
  percentOrdersDeliveredOnTime?: number
  percentFollowupsCompleted?: number
  totalPendingCount?: number
  totalUrgentCount?: number
  totalHighCount?: number
}

/**
 * Checks if an interaction is within the Meta 24-hour service window.
 * Business Rule:
 * - Reference is the last customer inbound message timestamp (attendance.last_customer_message_at).
 * - Outbound replies from the company do NOT alter or close the 24-hour customer window.
 * - If last_customer_message_at is provided, direction is implicitly inbound.
 * - Fallback: uses client lastMessageAt and lastMessageDirection when attendance timestamp is absent.
 */
export function isWithin24HourWindow(
  lastMessageAt?: string,
  lastMessageDirection?: 'inbound' | 'outbound',
  options?: {
    lastCustomerMessageAt?: string
    referenceTime?: string | number | Date
  },
): boolean {
  const customerTimestamp =
    options?.lastCustomerMessageAt ||
    (lastMessageDirection === 'inbound' ? lastMessageAt : undefined)

  if (!customerTimestamp) {
    return false
  }

  const messageTime = new Date(customerTimestamp).getTime()
  if (isNaN(messageTime) || messageTime <= 0) {
    return false
  }

  const refTime = options?.referenceTime ? new Date(options.referenceTime).getTime() : Date.now()
  if (isNaN(refTime)) {
    return false
  }

  const diffMs = refTime - messageTime
  // Janela válida se a mensagem foi no passado recente (até 24 horas) ou mesmo timestamp futuro por drift pequeno de relógio (>= 0)
  const diffHours = diffMs / (1000 * 60 * 60)

  return diffHours >= 0 && diffHours <= 24
}
