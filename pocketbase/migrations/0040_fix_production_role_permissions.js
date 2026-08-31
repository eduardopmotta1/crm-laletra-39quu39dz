/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // Definir as permissões completas e corretas do papel de Produção
    const productionPermissions = {
      // Clientes
      clients_view: true,
      clients_create: false,
      clients_edit: false,
      clients_delete: false,
      clients_export: false,

      // Atendimentos / Mensagens
      attendance_view: false,
      attendance_view_all: false,
      attendance_view_own: false,
      attendance_create: false,
      attendance_edit: false,
      attendance_reassign: false,
      attendance_reopen: false,
      attendance_archive: false,
      attendance_move_kanban: false,

      // WhatsApp (BLOCO 40G-D: reply=true, send_files=true, view=false, view_own=false)
      whatsapp_view: false,
      whatsapp_view_own: false,
      whatsapp_reply: true,
      whatsapp_send_files: true,
      whatsapp_start_new: false,
      whatsapp_send_audio: false,
      whatsapp_use_templates: false,

      // Orçamentos
      quotes_view: false,
      quotes_view_all: false,
      quotes_view_own: false,
      quotes_create: false,
      quotes_edit: false,
      quotes_delete: false,
      quotes_approve: false,
      quotes_reopen: false,
      quotes_send_client: false,
      quotes_view_financial: false,
      quotes_apply_discount: false,

      // Pedidos / Produção
      production_view: true,
      production_create: false,
      production_edit: true,
      production_advance_stage: true,
      production_retreat_stage: false,
      production_finish: true,
      production_cancel: false,
      production_reopen: false,
      production_view_financial: false,
      production_attach_files: true,
      production_view_history: true,

      // Pós-Venda
      postsale_view: false,
      postsale_start: false,
      postsale_send_survey: false,
      postsale_handle_dissatisfaction: false,

      // Cadastros
      catalogs_view: true,
      catalogs_create: false,
      catalogs_edit: false,
      catalogs_delete: false,

      // Configurações
      settings_view: false,
      settings_edit_kanban: false,
      settings_edit_stages: false,
      settings_edit_automations: false,
      settings_config_whatsapp: false,
      settings_config_templates: false,
      settings_config_postsale: false,
      settings_config_production: false,
      settings_manage_users: false,
      settings_manage_permissions: false,
      settings_view_logs: false,
    }

    const permsJson = JSON.stringify(productionPermissions)

    // 1. Atualizar o papel de Produção via SQL direto para garantir persistência correta do campo JSON
    app
      .db()
      .newQuery("UPDATE roles SET permissions = {:perms} WHERE slug = 'producao'")
      .bind({ perms: permsJson })
      .execute()

    // 2. Atualizar todos os usuários vinculados ao papel Produção via SQL direto
    app
      .db()
      .newQuery(
        "UPDATE users SET custom_permissions = {:perms} WHERE role_slug = 'producao' OR email = 'producao@grafica.com'",
      )
      .bind({ perms: permsJson })
      .execute()
  },
  (app) => {
    // Reverter whatsapp_reply e whatsapp_send_files para false
    const productionPermissionsRevert = {
      clients_view: true,
      clients_create: false,
      clients_edit: false,
      clients_delete: false,
      clients_export: false,
      attendance_view: false,
      attendance_view_all: false,
      attendance_view_own: false,
      attendance_create: false,
      attendance_edit: false,
      attendance_reassign: false,
      attendance_reopen: false,
      attendance_archive: false,
      attendance_move_kanban: false,
      whatsapp_view: false,
      whatsapp_view_own: false,
      whatsapp_reply: false,
      whatsapp_send_files: false,
      whatsapp_start_new: false,
      whatsapp_send_audio: false,
      whatsapp_use_templates: false,
      quotes_view: false,
      quotes_view_all: false,
      quotes_view_own: false,
      quotes_create: false,
      quotes_edit: false,
      quotes_delete: false,
      quotes_approve: false,
      quotes_reopen: false,
      quotes_send_client: false,
      quotes_view_financial: false,
      quotes_apply_discount: false,
      production_view: true,
      production_create: false,
      production_edit: true,
      production_advance_stage: true,
      production_retreat_stage: false,
      production_finish: true,
      production_cancel: false,
      production_reopen: false,
      production_view_financial: false,
      production_attach_files: true,
      production_view_history: true,
      postsale_view: false,
      postsale_start: false,
      postsale_send_survey: false,
      postsale_handle_dissatisfaction: false,
      catalogs_view: true,
      catalogs_create: false,
      catalogs_edit: false,
      catalogs_delete: false,
      settings_view: false,
      settings_edit_kanban: false,
      settings_edit_stages: false,
      settings_edit_automations: false,
      settings_config_whatsapp: false,
      settings_config_templates: false,
      settings_config_postsale: false,
      settings_config_production: false,
      settings_manage_users: false,
      settings_manage_permissions: false,
      settings_view_logs: false,
    }
    const revertJson = JSON.stringify(productionPermissionsRevert)
    app
      .db()
      .newQuery("UPDATE roles SET permissions = {:perms} WHERE slug = 'producao'")
      .bind({ perms: revertJson })
      .execute()
    app
      .db()
      .newQuery(
        "UPDATE users SET custom_permissions = {:perms} WHERE role_slug = 'producao' OR email = 'producao@grafica.com'",
      )
      .bind({ perms: revertJson })
      .execute()
  },
)
