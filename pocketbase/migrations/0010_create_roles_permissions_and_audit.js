/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // 1. Create 'roles' collection (Perfis de acesso predefinidos e customizados)
    const rolesCollection = new Collection({
      name: 'roles',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'slug', type: 'text', required: true },
        { name: 'description', type: 'text', required: false },
        { name: 'is_system', type: 'bool', required: false },
        { name: 'color', type: 'text', required: false },
        { name: 'permissions', type: 'json', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_roles_slug ON roles (slug)'],
    })
    app.save(rolesCollection)

    // 2. Create 'audit_logs' collection
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    const auditLogsCollection = new Collection({
      name: 'audit_logs',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: null, // Immutable logs
      deleteRule: null, // Immutable logs
      fields: [
        {
          name: 'user_id',
          type: 'relation',
          collectionId: usersCol.id,
          maxSelect: 1,
          required: false,
        },
        { name: 'user_name', type: 'text', required: false },
        { name: 'user_email', type: 'text', required: false },
        { name: 'action', type: 'text', required: true }, // e.g. login, client_updated, quote_created, discount_granted, stage_changed, order_created, user_updated, permission_changed, etc.
        { name: 'module', type: 'text', required: false }, // clients, attendance, whatsapp, quotes, production, financial, postsale, pending, reports, settings, users
        { name: 'record_id', type: 'text', required: false },
        { name: 'record_title', type: 'text', required: false },
        { name: 'details', type: 'text', required: false },
        { name: 'previous_value', type: 'json', required: false },
        { name: 'new_value', type: 'json', required: false },
        { name: 'ip_address', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_audit_action ON audit_logs (action)',
        'CREATE INDEX idx_audit_user ON audit_logs (user_id)',
        'CREATE INDEX idx_audit_created ON audit_logs (created DESC)',
      ],
    })
    app.save(auditLogsCollection)

    // 3. Add fields to users collection: role_id, role_slug, is_active, custom_permissions
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!users.fields.getByName('role_id')) {
      users.fields.add(
        new RelationField({
          name: 'role_id',
          type: 'relation',
          collectionId: rolesCollection.id,
          maxSelect: 1,
          required: false,
        }),
      )
    }
    if (!users.fields.getByName('role_slug')) {
      users.fields.add(
        new TextField({
          name: 'role_slug',
          type: 'text',
          required: false,
        }),
      )
    }
    if (!users.fields.getByName('is_active')) {
      users.fields.add(
        new BoolField({
          name: 'is_active',
          type: 'bool',
          required: false,
        }),
      )
    }
    if (!users.fields.getByName('custom_permissions')) {
      users.fields.add(
        new JSONField({
          name: 'custom_permissions',
          type: 'json',
          required: false,
        }),
      )
    }
    if (!users.fields.getByName('phone')) {
      users.fields.add(
        new TextField({
          name: 'phone',
          type: 'text',
          required: false,
        }),
      )
    }
    app.save(users)

    // 4. Seed initial default roles
    // Standard permission keys:
    // clients_view, clients_view_all, clients_view_own, clients_create, clients_edit, clients_delete, clients_view_phone, clients_view_history, clients_view_purchases, clients_view_evaluations
    // attendance_view, attendance_view_all, attendance_view_own, attendance_create, attendance_edit, attendance_move_kanban, attendance_archive, attendance_reopen, attendance_view_history, attendance_reassign
    // whatsapp_view, whatsapp_view_own, whatsapp_reply, whatsapp_start_new, whatsapp_send_files, whatsapp_use_templates, whatsapp_followup, whatsapp_full_history
    // quotes_view, quotes_create, quotes_edit, quotes_send, quotes_view_values, quotes_view_discounts, quotes_give_discount, quotes_close_sale, quotes_cancel_sale
    // production_view, production_view_all, production_view_assigned, production_create, production_edit, production_move_stages, production_attach_files, production_view_proofs, production_approve_proof, production_change_deadline, production_complete, production_archive
    // financial_view_sale_values, financial_view_revenue, financial_view_discounts, financial_view_cost, financial_view_margin, financial_view_reports
    // postsale_view, postsale_execute, postsale_view_evaluations, postsale_view_complaints, postsale_respond_dissatisfied, postsale_mark_resolved
    // pending_access, pending_view_all, pending_view_own, pending_view_sector, pending_claim, pending_reassign, pending_mark_resolved
    // reports_attendance, reports_commercial, reports_production, reports_postsale, reports_performance, reports_revenue, reports_export
    // settings_edit_kanban, settings_edit_stages, settings_edit_automations, settings_config_whatsapp, settings_config_templates, settings_config_postsale, settings_config_production, settings_manage_users, settings_manage_permissions, settings_view_logs

    const allPermissionsList = [
      'clients_view',
      'clients_view_all',
      'clients_view_own',
      'clients_create',
      'clients_edit',
      'clients_delete',
      'clients_view_phone',
      'clients_view_history',
      'clients_view_purchases',
      'clients_view_evaluations',
      'attendance_view',
      'attendance_view_all',
      'attendance_view_own',
      'attendance_create',
      'attendance_edit',
      'attendance_move_kanban',
      'attendance_archive',
      'attendance_reopen',
      'attendance_view_history',
      'attendance_reassign',
      'whatsapp_view',
      'whatsapp_view_own',
      'whatsapp_reply',
      'whatsapp_start_new',
      'whatsapp_send_files',
      'whatsapp_use_templates',
      'whatsapp_followup',
      'whatsapp_full_history',
      'quotes_view',
      'quotes_create',
      'quotes_edit',
      'quotes_send',
      'quotes_view_values',
      'quotes_view_discounts',
      'quotes_give_discount',
      'quotes_close_sale',
      'quotes_cancel_sale',
      'production_view',
      'production_view_all',
      'production_view_assigned',
      'production_create',
      'production_edit',
      'production_move_stages',
      'production_attach_files',
      'production_view_proofs',
      'production_approve_proof',
      'production_change_deadline',
      'production_complete',
      'production_archive',
      'financial_view_sale_values',
      'financial_view_revenue',
      'financial_view_discounts',
      'financial_view_cost',
      'financial_view_margin',
      'financial_view_reports',
      'postsale_view',
      'postsale_execute',
      'postsale_view_evaluations',
      'postsale_view_complaints',
      'postsale_respond_dissatisfied',
      'postsale_mark_resolved',
      'pending_access',
      'pending_view_all',
      'pending_view_own',
      'pending_view_sector',
      'pending_claim',
      'pending_reassign',
      'pending_mark_resolved',
      'reports_attendance',
      'reports_commercial',
      'reports_production',
      'reports_postsale',
      'reports_performance',
      'reports_revenue',
      'reports_export',
      'settings_edit_kanban',
      'settings_edit_stages',
      'settings_edit_automations',
      'settings_config_whatsapp',
      'settings_config_templates',
      'settings_config_postsale',
      'settings_config_production',
      'settings_manage_users',
      'settings_manage_permissions',
      'settings_view_logs',
    ]

    const adminPermissions = {}
    allPermissionsList.forEach((k) => {
      adminPermissions[k] = true
    })

    const commercialPermissions = {
      clients_view: true,
      clients_view_all: true,
      clients_view_own: true,
      clients_create: true,
      clients_edit: true,
      clients_delete: false,
      clients_view_phone: true,
      clients_view_history: true,
      clients_view_purchases: true,
      clients_view_evaluations: true,
      attendance_view: true,
      attendance_view_all: true,
      attendance_view_own: true,
      attendance_create: true,
      attendance_edit: true,
      attendance_move_kanban: true,
      attendance_archive: true,
      attendance_reopen: true,
      attendance_view_history: true,
      attendance_reassign: true,
      whatsapp_view: true,
      whatsapp_view_own: true,
      whatsapp_reply: true,
      whatsapp_start_new: true,
      whatsapp_send_files: true,
      whatsapp_use_templates: true,
      whatsapp_followup: true,
      whatsapp_full_history: true,
      quotes_view: true,
      quotes_create: true,
      quotes_edit: true,
      quotes_send: true,
      quotes_view_values: true,
      quotes_view_discounts: true,
      quotes_give_discount: true,
      quotes_close_sale: true,
      quotes_cancel_sale: true,
      production_view: true,
      production_view_all: false,
      production_view_assigned: true,
      production_create: true,
      production_edit: false,
      production_move_stages: false,
      production_attach_files: true,
      production_view_proofs: true,
      production_approve_proof: false,
      production_change_deadline: false,
      production_complete: false,
      production_archive: false,
      financial_view_sale_values: true,
      financial_view_revenue: false,
      financial_view_discounts: true,
      financial_view_cost: false,
      financial_view_margin: false,
      financial_view_reports: false,
      postsale_view: true,
      postsale_execute: true,
      postsale_view_evaluations: true,
      postsale_view_complaints: true,
      postsale_respond_dissatisfied: true,
      postsale_mark_resolved: false,
      pending_access: true,
      pending_view_all: false,
      pending_view_own: true,
      pending_view_sector: true,
      pending_claim: true,
      pending_reassign: true,
      pending_mark_resolved: true,
      reports_attendance: true,
      reports_commercial: true,
      reports_production: false,
      reports_postsale: true,
      reports_performance: false,
      reports_revenue: false,
      reports_export: false,
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

    const productionPermissions = {
      clients_view: false,
      clients_view_all: false,
      clients_view_own: false,
      clients_create: false,
      clients_edit: false,
      clients_delete: false,
      clients_view_phone: false,
      clients_view_history: false,
      clients_view_purchases: false,
      clients_view_evaluations: false,
      attendance_view: false,
      attendance_view_all: false,
      attendance_view_own: false,
      attendance_create: false,
      attendance_edit: false,
      attendance_move_kanban: false,
      attendance_archive: false,
      attendance_reopen: false,
      attendance_view_history: false,
      attendance_reassign: false,
      whatsapp_view: false,
      whatsapp_view_own: false,
      whatsapp_reply: false,
      whatsapp_start_new: false,
      whatsapp_send_files: false,
      whatsapp_use_templates: false,
      whatsapp_followup: false,
      whatsapp_full_history: false,
      quotes_view: false,
      quotes_create: false,
      quotes_edit: false,
      quotes_send: false,
      quotes_view_values: false,
      quotes_view_discounts: false,
      quotes_give_discount: false,
      quotes_close_sale: false,
      quotes_cancel_sale: false,
      production_view: true,
      production_view_all: true,
      production_view_assigned: true,
      production_create: false,
      production_edit: true,
      production_move_stages: true,
      production_attach_files: true,
      production_view_proofs: true,
      production_approve_proof: true,
      production_change_deadline: true,
      production_complete: true,
      production_archive: false,
      financial_view_sale_values: false,
      financial_view_revenue: false,
      financial_view_discounts: false,
      financial_view_cost: false,
      financial_view_margin: false,
      financial_view_reports: false,
      postsale_view: false,
      postsale_execute: false,
      postsale_view_evaluations: false,
      postsale_view_complaints: false,
      postsale_respond_dissatisfied: false,
      postsale_mark_resolved: false,
      pending_access: true,
      pending_view_all: false,
      pending_view_own: true,
      pending_view_sector: true,
      pending_claim: true,
      pending_reassign: false,
      pending_mark_resolved: true,
      reports_attendance: false,
      reports_commercial: false,
      reports_production: true,
      reports_postsale: false,
      reports_performance: false,
      reports_revenue: false,
      reports_export: false,
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

    const customPermissions = {
      ...commercialPermissions,
    }

    // Seed Admin Role
    const adminRole = new Record(rolesCollection)
    adminRole.set('name', 'Administrador')
    adminRole.set('slug', 'admin')
    adminRole.set(
      'description',
      'Acesso completo irrestrito a todas as áreas, financeiro, configurações e auditoria.',
    )
    adminRole.set('is_system', true)
    adminRole.set('color', 'emerald')
    adminRole.set('permissions', adminPermissions)
    app.save(adminRole)

    // Seed Comercial Role
    const commRole = new Record(rolesCollection)
    commRole.set('name', 'Atendimento / Comercial')
    commRole.set('slug', 'comercial')
    commRole.set(
      'description',
      'Atendimento de clientes, WhatsApp, orçamentos, funil de vendas e pedidos.',
    )
    commRole.set('is_system', true)
    commRole.set('color', 'blue')
    commRole.set('permissions', commercialPermissions)
    app.save(commRole)

    // Seed Produção Role
    const prodRole = new Record(rolesCollection)
    prodRole.set('name', 'Produção')
    prodRole.set('slug', 'producao')
    prodRole.set(
      'description',
      'Acesso aos pedidos de produção, etapas gráficas, artes e prazos. Valores e financeiro bloqueados.',
    )
    prodRole.set('is_system', true)
    prodRole.set('color', 'amber')
    prodRole.set('permissions', productionPermissions)
    app.save(prodRole)

    // Seed Personalizado Role
    const customRole = new Record(rolesCollection)
    customRole.set('name', 'Personalizado')
    customRole.set('slug', 'custom')
    customRole.set('description', 'Modelo inicial flexível para criar cargos sob medida.')
    customRole.set('is_system', false)
    customRole.set('color', 'purple')
    customRole.set('permissions', customPermissions)
    app.save(customRole)

    // Link existing users to roles and activate them
    try {
      const adminUser = app.findAuthRecordByEmail('_pb_users_auth_', 'eduardopmotta1@gmail.com')
      adminUser.set('role_id', adminRole.id)
      adminUser.set('role_slug', 'admin')
      adminUser.set('is_active', true)
      adminUser.set('custom_permissions', adminPermissions)
      app.save(adminUser)
    } catch (_) {}

    try {
      const agentUser = app.findAuthRecordByEmail('_pb_users_auth_', 'atendimento@grafica.com')
      agentUser.set('role_id', commRole.id)
      agentUser.set('role_slug', 'comercial')
      agentUser.set('is_active', true)
      agentUser.set('custom_permissions', commercialPermissions)
      app.save(agentUser)
    } catch (_) {}

    // Create demo Production user: producao@grafica.com
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'producao@grafica.com')
    } catch (_) {
      const prodUser = new Record(users)
      prodUser.setEmail('producao@grafica.com')
      prodUser.setPassword('Skip@Pass')
      prodUser.setVerified(true)
      prodUser.set('name', 'Carlos Produção & Impressão')
      prodUser.set('role_id', prodRole.id)
      prodUser.set('role_slug', 'producao')
      prodUser.set('is_active', true)
      prodUser.set('custom_permissions', productionPermissions)
      app.save(prodUser)
    }
  },
  (app) => {
    try {
      const auditLogs = app.findCollectionByNameOrId('audit_logs')
      app.delete(auditLogs)
    } catch (_) {}
    try {
      const roles = app.findCollectionByNameOrId('roles')
      app.delete(roles)
    } catch (_) {}
  },
)
