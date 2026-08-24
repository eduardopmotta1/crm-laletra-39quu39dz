// CRM Laletra Permission System Definitions & Metadata
// Granular permissions grouped by business modules

export interface PermissionDefinition {
  key: string
  label: string
  description: string
  module: PermissionModule
  isCritical?: boolean
}

export type PermissionModule =
  | 'clients'
  | 'attendance'
  | 'whatsapp'
  | 'quotes'
  | 'production'
  | 'financial'
  | 'postsale'
  | 'pending'
  | 'reports'
  | 'settings'

export interface ModuleGroup {
  id: PermissionModule
  title: string
  description: string
  icon: string
  permissions: PermissionDefinition[]
}

export const PERMISSION_MODULES: ModuleGroup[] = [
  {
    id: 'clients',
    title: 'Clientes',
    description: 'Visualização, cadastro e histórico da base de clientes',
    icon: 'Users',
    permissions: [
      {
        key: 'clients_view',
        label: 'Visualizar clientes',
        description: 'Permite acessar a listagem e detalhes básicos de clientes',
        module: 'clients',
      },
      {
        key: 'clients_view_all',
        label: 'Visualizar todos',
        description: 'Pode ver todos os clientes da gráfica',
        module: 'clients',
      },
      {
        key: 'clients_view_own',
        label: 'Visualizar somente próprios',
        description: 'Restrito apenas aos clientes atribuídos a este funcionário',
        module: 'clients',
      },
      {
        key: 'clients_create',
        label: 'Criar clientes',
        description: 'Permite cadastrar novos clientes no CRM',
        module: 'clients',
      },
      {
        key: 'clients_edit',
        label: 'Editar clientes',
        description: 'Permite alterar telefone, nome, email e dados do cliente',
        module: 'clients',
      },
      {
        key: 'clients_delete',
        label: 'Excluir clientes',
        description: 'Exclusão permanente (crítica — preferir arquivamento)',
        module: 'clients',
        isCritical: true,
      },
      {
        key: 'clients_view_phone',
        label: 'Visualizar telefone',
        description: 'Pode ver o número de telefone completo',
        module: 'clients',
      },
      {
        key: 'clients_view_history',
        label: 'Visualizar histórico',
        description: 'Acessar linha do tempo de alterações e atendimentos',
        module: 'clients',
      },
      {
        key: 'clients_view_purchases',
        label: 'Visualizar compras anteriores',
        description: 'Ver histórico de pedidos e compras já realizadas',
        module: 'clients',
      },
      {
        key: 'clients_view_evaluations',
        label: 'Visualizar avaliações',
        description: 'Ver notas e feedbacks recebidos pelo cliente',
        module: 'clients',
      },
    ],
  },
  {
    id: 'attendance',
    title: 'Atendimento & Funil Kanban',
    description: 'Gestão de atendimentos, movimentação do funil de vendas e encerramento',
    icon: 'Kanban',
    permissions: [
      {
        key: 'attendance_view',
        label: 'Visualizar atendimentos',
        description: 'Acessar o funil comercial e cartões do Kanban',
        module: 'attendance',
      },
      {
        key: 'attendance_view_all',
        label: 'Visualizar todos os atendimentos',
        description: 'Ver cartões de toda a equipe',
        module: 'attendance',
      },
      {
        key: 'attendance_view_own',
        label: 'Somente próprios atendimentos',
        description: 'Ver somente cartões sob sua responsabilidade',
        module: 'attendance',
      },
      {
        key: 'attendance_create',
        label: 'Criar atendimento',
        description: 'Iniciar novo atendimento de cliente',
        module: 'attendance',
      },
      {
        key: 'attendance_edit',
        label: 'Editar atendimento',
        description: 'Modificar interesse, anotações e prazos',
        module: 'attendance',
      },
      {
        key: 'attendance_move_kanban',
        label: 'Movimentar Kanban',
        description: 'Arrastar e alterar etapas do funil de vendas',
        module: 'attendance',
      },
      {
        key: 'attendance_archive',
        label: 'Arquivar atendimento',
        description: 'Marcar como venda fechada ou perdida e arquivar',
        module: 'attendance',
      },
      {
        key: 'attendance_reopen',
        label: 'Reabrir atendimento',
        description: 'Reativar atendimento arquivado de volta ao funil',
        module: 'attendance',
      },
      {
        key: 'attendance_view_history',
        label: 'Visualizar histórico do atendimento',
        description: 'Ver transições de etapas e anotações passadas',
        module: 'attendance',
      },
      {
        key: 'attendance_reassign',
        label: 'Atribuir para outro funcionário',
        description: 'Transferir responsabilidade do atendimento',
        module: 'attendance',
      },
    ],
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp Oficial & Mensagens',
    description: 'Conversas diretas pelo WhatsApp Cloud API e envio de templates',
    icon: 'MessageSquare',
    permissions: [
      {
        key: 'whatsapp_view',
        label: 'Visualizar conversas',
        description: 'Abrir gaveta de chat e ver mensagens',
        module: 'whatsapp',
      },
      {
        key: 'whatsapp_view_own',
        label: 'Somente conversas próprias',
        description: 'Ver apenas conversas de clientes atribuídos a você',
        module: 'whatsapp',
      },
      {
        key: 'whatsapp_reply',
        label: 'Responder WhatsApp',
        description: 'Digitar e enviar mensagens na janela de 24h',
        module: 'whatsapp',
      },
      {
        key: 'whatsapp_start_new',
        label: 'Iniciar nova conversa',
        description: 'Disparar WhatsApp para novo número via template',
        module: 'whatsapp',
      },
      {
        key: 'whatsapp_send_files',
        label: 'Enviar arquivos',
        description: 'Enviar anexos, fotos e PDFs pelo chat',
        module: 'whatsapp',
      },
      {
        key: 'whatsapp_use_templates',
        label: 'Usar templates oficiais',
        description: 'Disparar mensagens modelo pré-aprovadas pela Meta',
        module: 'whatsapp',
      },
      {
        key: 'whatsapp_followup',
        label: 'Follow-up WhatsApp',
        description: 'Agendar e disparar lembretes de follow-up',
        module: 'whatsapp',
      },
      {
        key: 'whatsapp_full_history',
        label: 'Histórico completo',
        description: 'Acessar todas as mensagens trocadas sem limite',
        module: 'whatsapp',
      },
    ],
  },
  {
    id: 'quotes',
    title: 'Orçamentos e Vendas',
    description: 'Criação de propostas, valores de orçamento e fechamento de vendas',
    icon: 'FileText',
    permissions: [
      {
        key: 'quotes_view',
        label: 'Visualizar orçamentos',
        description: 'Permite ver propostas comerciais',
        module: 'quotes',
      },
      {
        key: 'quotes_create',
        label: 'Criar orçamentos',
        description: 'Elaborar novo orçamento para o cliente',
        module: 'quotes',
      },
      {
        key: 'quotes_edit',
        label: 'Editar orçamentos',
        description: 'Alterar itens, quantidades e prazos de propostas',
        module: 'quotes',
      },
      {
        key: 'quotes_send',
        label: 'Enviar orçamento',
        description: 'Disparar proposta pelo WhatsApp ou email',
        module: 'quotes',
      },
      {
        key: 'quotes_view_values',
        label: 'Visualizar valores de orçamento',
        description: 'Ver o total em R$ cotado para o cliente',
        module: 'quotes',
      },
      {
        key: 'quotes_view_discounts',
        label: 'Visualizar descontos aplicados',
        description: 'Ver valores de desconto comercial concedido',
        module: 'quotes',
      },
      {
        key: 'quotes_give_discount',
        label: 'Conceder desconto',
        description: 'Aplicar desconto especial no valor da proposta',
        module: 'quotes',
      },
      {
        key: 'quotes_close_sale',
        label: 'Fechar venda',
        description: 'Marcar negociação como Ganha e gerar pedido',
        module: 'quotes',
      },
      {
        key: 'quotes_cancel_sale',
        label: 'Cancelar / Marcar Não Fechou',
        description: 'Registrar motivo de perda do orçamento',
        module: 'quotes',
      },
    ],
  },
  {
    id: 'production',
    title: 'Produção Gráfica',
    description: 'Gestão de pedidos gráficos, etapas, provas digitais e impressão',
    icon: 'Package',
    permissions: [
      {
        key: 'production_view',
        label: 'Visualizar produção',
        description: 'Acessar Kanban de produção gráfica',
        module: 'production',
      },
      {
        key: 'production_view_all',
        label: 'Todos os pedidos',
        description: 'Ver todos os pedidos da gráfica',
        module: 'production',
      },
      {
        key: 'production_view_assigned',
        label: 'Somente atribuídos a mim',
        description: 'Ver apenas pedidos onde você é responsável',
        module: 'production',
      },
      {
        key: 'production_create',
        label: 'Criar pedido de produção',
        description: 'Gerar ordem de serviço de impressão',
        module: 'production',
      },
      {
        key: 'production_edit',
        label: 'Editar pedido de produção',
        description: 'Alterar especificações técnicas e medidas',
        module: 'production',
      },
      {
        key: 'production_move_stages',
        label: 'Movimentar entre etapas',
        description: 'Mudar status (ex: Aguardando Arte → Em Impressão)',
        module: 'production',
      },
      {
        key: 'production_attach_files',
        label: 'Anexar arquivos e artes',
        description: 'Fazer upload de artes prontas e provas',
        module: 'production',
      },
      {
        key: 'production_view_proofs',
        label: 'Visualizar artes/provas',
        description: 'Abrir galeria de versões de artes',
        module: 'production',
      },
      {
        key: 'production_approve_proof',
        label: 'Registrar aprovação de arte',
        description: 'Marcar prova como aprovada pelo cliente',
        module: 'production',
      },
      {
        key: 'production_change_deadline',
        label: 'Alterar prazo de entrega',
        description: 'Mudar data prometida de conclusão',
        module: 'production',
      },
      {
        key: 'production_complete',
        label: 'Concluir pedido',
        description: 'Marcar produção como concluída/pronta para retirada',
        module: 'production',
      },
      {
        key: 'production_archive',
        label: 'Arquivar pedido',
        description: 'Remover pedido concluído do painel ativo',
        module: 'production',
      },
    ],
  },
  {
    id: 'financial',
    title: 'Informações Financeiras',
    description: 'Valores monetários, faturamento, custos e margem de lucro (bloqueável)',
    icon: 'DollarSign',
    permissions: [
      {
        key: 'financial_view_sale_values',
        label: 'Visualizar valor da venda',
        description: 'Ver valores em R$ nos cartões, pedidos e tabelas',
        module: 'financial',
      },
      {
        key: 'financial_view_revenue',
        label: 'Visualizar faturamento total',
        description: 'Ver métricas de receita mensal e ticket médio',
        module: 'financial',
      },
      {
        key: 'financial_view_discounts',
        label: 'Visualizar total de descontos',
        description: 'Ver quanto foi concedido em descontos',
        module: 'financial',
      },
      {
        key: 'financial_view_cost',
        label: 'Visualizar custos de produção',
        description: 'Ver custo de papel, tinta e acabamento',
        module: 'financial',
      },
      {
        key: 'financial_view_margin',
        label: 'Visualizar margem de lucro',
        description: 'Ver rentabilidade percentual e absoluta do pedido',
        module: 'financial',
      },
      {
        key: 'financial_view_reports',
        label: 'Relatórios financeiros',
        description: 'Acessar balanços e relatórios de fluxo financeiro',
        module: 'financial',
      },
    ],
  },
  {
    id: 'postsale',
    title: 'Pós-Venda & Avaliações',
    description: 'Pesquisas de satisfação, NPS, reclamações e recuperação de clientes',
    icon: 'Star',
    permissions: [
      {
        key: 'postsale_view',
        label: 'Visualizar pós-venda',
        description: 'Acessar painel de pós-venda e avaliações',
        module: 'postsale',
      },
      {
        key: 'postsale_execute',
        label: 'Realizar pós-venda',
        description: 'Disparar convites de avaliação e registrar contatos',
        module: 'postsale',
      },
      {
        key: 'postsale_view_evaluations',
        label: 'Ver avaliações dos clientes',
        description: 'Ler notas de 1 a 5 e comentários recebidos',
        module: 'postsale',
      },
      {
        key: 'postsale_view_complaints',
        label: 'Ver reclamações/insatisfação',
        description: 'Acessar painel de clientes insatisfeitos (1 a 3 estrelas)',
        module: 'postsale',
      },
      {
        key: 'postsale_respond_dissatisfied',
        label: 'Responder cliente insatisfeito',
        description: 'Iniciar tratativa de recuperação de cliente',
        module: 'postsale',
      },
      {
        key: 'postsale_mark_resolved',
        label: 'Marcar insatisfação como resolvida',
        description: 'Encerrar caso na Central de Pendências/Pós-venda',
        module: 'postsale',
      },
    ],
  },
  {
    id: 'pending',
    title: 'Central de Pendências',
    description: 'Painel operacional unificado de SLA, prazos, orçamentos e reclamações',
    icon: 'AlertCircle',
    permissions: [
      {
        key: 'pending_access',
        label: 'Acessar Central de Pendências',
        description: 'Permite abrir a Central de Pendências',
        module: 'pending',
      },
      {
        key: 'pending_view_all',
        label: 'Todas as pendências da gráfica',
        description: 'Ver itens de todos os setores e funcionários',
        module: 'pending',
      },
      {
        key: 'pending_view_own',
        label: 'Somente suas pendências',
        description: 'Ver apenas pendências sob sua responsabilidade',
        module: 'pending',
      },
      {
        key: 'pending_view_sector',
        label: 'Pendências do setor',
        description: 'Ver pendências da área comercial ou de produção',
        module: 'pending',
      },
      {
        key: 'pending_claim',
        label: 'Assumir pendência',
        description: 'Puxar uma pendência pendente para você resolver',
        module: 'pending',
      },
      {
        key: 'pending_reassign',
        label: 'Atribuir para outro',
        description: 'Transferir a pendência para outro colaborador',
        module: 'pending',
      },
      {
        key: 'pending_mark_resolved',
        label: 'Marcar como resolvida',
        description: 'Concluir pendência com justificativa de ação tomada',
        module: 'pending',
      },
    ],
  },
  {
    id: 'reports',
    title: 'Relatórios & Exportação',
    description: 'Painéis estatísticos de conversão, tempo de resposta e exportação',
    icon: 'BarChart3',
    permissions: [
      {
        key: 'reports_attendance',
        label: 'Relatório de Atendimentos & SLA',
        description: 'Métricas de tempo de resposta e clientes sem retorno',
        module: 'reports',
      },
      {
        key: 'reports_commercial',
        label: 'Relatório Comercial & Funil',
        description: 'Taxa de conversão, motivos de perda e ticket médio',
        module: 'reports',
      },
      {
        key: 'reports_production',
        label: 'Relatório de Produção & Prazos',
        description: 'Pontualidade de entrega e gargalos de produção',
        module: 'reports',
      },
      {
        key: 'reports_postsale',
        label: 'Relatório de Pós-Venda & NPS',
        description: 'Média de satisfação, qualidade e atendimento',
        module: 'reports',
      },
      {
        key: 'reports_performance',
        label: 'Relatório de Desempenho da Equipe',
        description: 'Produtividade individual de atendentes e impressores',
        module: 'reports',
      },
      {
        key: 'reports_revenue',
        label: 'Relatório de Faturamento',
        description: 'Evolução de faturamento por período e produtos',
        module: 'reports',
      },
      {
        key: 'reports_export',
        label: 'Exportar relatórios (CSV/PDF)',
        description: 'Permite baixar planilhas de dados do CRM',
        module: 'reports',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Configurações & Governança',
    description: 'Administração de colunas, automações, APIs, usuários e logs de auditoria',
    icon: 'Settings',
    permissions: [
      {
        key: 'settings_edit_kanban',
        label: 'Editar colunas Kanban',
        description: 'Alterar nomes, cores e visibilidade das colunas',
        module: 'settings',
      },
      {
        key: 'settings_edit_stages',
        label: 'Criar e excluir etapas',
        description: 'Modificar estrutura de funil comercial e produção',
        module: 'settings',
        isCritical: true,
      },
      {
        key: 'settings_edit_automations',
        label: 'Editar automações e SLA',
        description: 'Alterar tempos de arquivamento e regras de SLA',
        module: 'settings',
      },
      {
        key: 'settings_config_whatsapp',
        label: 'Configurar WhatsApp API',
        description: 'Modificar tokens da Meta, phone ID e webhooks',
        module: 'settings',
        isCritical: true,
      },
      {
        key: 'settings_config_templates',
        label: 'Gerenciar templates WhatsApp',
        description: 'Criar e sincronizar templates oficiais Meta',
        module: 'settings',
      },
      {
        key: 'settings_config_postsale',
        label: 'Configurar pós-venda',
        description: 'Alterar dias de disparo de avaliação e mensagens',
        module: 'settings',
      },
      {
        key: 'settings_config_production',
        label: 'Configurar etapas de produção',
        description: 'Gerenciar etapas e notificações automáticas de produção',
        module: 'settings',
      },
      {
        key: 'settings_manage_users',
        label: 'Gerenciar usuários',
        description: 'Criar, desativar e editar colaboradores',
        module: 'settings',
        isCritical: true,
      },
      {
        key: 'settings_manage_permissions',
        label: 'Gerenciar perfis e permissões',
        description: 'Alterar matriz de permissões e criar perfis',
        module: 'settings',
        isCritical: true,
      },
      {
        key: 'settings_view_logs',
        label: 'Visualizar logs de auditoria',
        description: 'Acessar trilha de auditoria completa e histórico de ações',
        module: 'settings',
      },
    ],
  },
]

export const ALL_PERMISSIONS_KEYS: string[] = PERMISSION_MODULES.flatMap((m) =>
  m.permissions.map((p) => p.key),
)
