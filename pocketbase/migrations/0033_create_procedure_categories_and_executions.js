migrate(
  (app) => {
    // 1. Create procedure_categories collection
    const categoriesCol = new Collection({
      name: 'procedure_categories',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'order_index', type: 'number' },
        { name: 'is_active', type: 'bool' },
        { name: 'is_archived', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_proc_cat_name ON procedure_categories (name)',
        'CREATE INDEX idx_proc_cat_order ON procedure_categories (order_index)',
        'CREATE INDEX idx_proc_cat_active ON procedure_categories (is_active)',
        'CREATE INDEX idx_proc_cat_archived ON procedure_categories (is_archived)',
      ],
    })
    app.save(categoriesCol)

    const savedCategoriesCol = app.findCollectionByNameOrId('procedure_categories')

    // Seed default categories with real internal IDs and order
    const initialCategories = [
      'Atendimento',
      'Comercial',
      'Orçamentos',
      'Design / Arte',
      'Produção',
      'Impressão',
      'Sublimação',
      'Acabamento',
      'Expedição',
      'Administrativo',
      'Organização e Limpeza',
      'Manutenção',
      'Outros',
    ]

    const seededCategoryMap = {}
    initialCategories.forEach((catName, index) => {
      const record = new Record(savedCategoriesCol)
      record.set('name', catName)
      record.set('order_index', index + 1)
      record.set('is_active', true)
      record.set('is_archived', false)
      app.save(record)
      seededCategoryMap[catName] = record.id
    })

    // 2. Add recurrence fields and category_id relation to procedures collection
    const proceduresCol = app.findCollectionByNameOrId('procedures')

    if (!proceduresCol.fields.getByName('category_id')) {
      proceduresCol.fields.add(
        new RelationField({
          name: 'category_id',
          collectionId: savedCategoriesCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }

    if (!proceduresCol.fields.getByName('is_recurring')) {
      proceduresCol.fields.add(
        new BoolField({
          name: 'is_recurring',
        }),
      )
    }

    if (!proceduresCol.fields.getByName('recurrence_frequency')) {
      proceduresCol.fields.add(
        new SelectField({
          name: 'recurrence_frequency',
          values: ['daily', 'weekdays', 'specific_days', 'weekly', 'monthly', 'custom_interval'],
          maxSelect: 1,
        }),
      )
    }

    if (!proceduresCol.fields.getByName('recurrence_time')) {
      proceduresCol.fields.add(
        new TextField({
          name: 'recurrence_time',
        }),
      )
    }

    if (!proceduresCol.fields.getByName('tolerance_minutes')) {
      proceduresCol.fields.add(
        new NumberField({
          name: 'tolerance_minutes',
        }),
      )
    }

    if (!proceduresCol.fields.getByName('assignee_type')) {
      proceduresCol.fields.add(
        new SelectField({
          name: 'assignee_type',
          values: ['user', 'multiple_users', 'role', 'all'],
          maxSelect: 1,
        }),
      )
    }

    if (!proceduresCol.fields.getByName('assigned_user_ids')) {
      proceduresCol.fields.add(
        new JSONField({
          name: 'assigned_user_ids',
        }),
      )
    }

    if (!proceduresCol.fields.getByName('assigned_role_slug')) {
      proceduresCol.fields.add(
        new TextField({
          name: 'assigned_role_slug',
        }),
      )
    }

    if (!proceduresCol.fields.getByName('recurrence_days_of_week')) {
      proceduresCol.fields.add(
        new JSONField({
          name: 'recurrence_days_of_week',
        }),
      )
    }

    if (!proceduresCol.fields.getByName('recurrence_interval_days')) {
      proceduresCol.fields.add(
        new NumberField({
          name: 'recurrence_interval_days',
        }),
      )
    }

    app.save(proceduresCol)

    // Backfill category_id for existing procedures based on their category text
    try {
      const existingProcedures = app.findRecordsByFilter('procedures', '', '', 500, 0)
      for (const proc of existingProcedures) {
        const catName = proc.get('category')
        if (catName && seededCategoryMap[catName]) {
          proc.set('category_id', seededCategoryMap[catName])
          app.save(proc)
        }
      }
    } catch (e) {
      console.log('Error backfilling category_id:', e)
    }

    // 3. Create procedure_executions collection
    const executionsCol = new Collection({
      name: 'procedure_executions',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'procedure_id',
          type: 'relation',
          collectionId: proceduresCol.id,
          cascadeDelete: false,
          maxSelect: 1,
          required: true,
        },
        { name: 'occurrence_date', type: 'date', required: true },
        { name: 'scheduled_at', type: 'text' },
        { name: 'tolerance_minutes', type: 'number' },
        {
          name: 'assigned_to_user_id',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'assigned_role_slug', type: 'text' },
        {
          name: 'status',
          type: 'select',
          values: ['Pendente', 'Concluído', 'Atrasado'],
          maxSelect: 1,
          required: true,
        },
        { name: 'completed_at', type: 'date' },
        {
          name: 'completed_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'completed_by_name', type: 'text' },
        { name: 'notes', type: 'text' },
        { name: 'checked_step_ids', type: 'json' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_proc_exec_proc ON procedure_executions (procedure_id)',
        'CREATE INDEX idx_proc_exec_date ON procedure_executions (occurrence_date)',
        'CREATE INDEX idx_proc_exec_status ON procedure_executions (status)',
        'CREATE INDEX idx_proc_exec_user ON procedure_executions (assigned_to_user_id)',
        'CREATE INDEX idx_proc_exec_role ON procedure_executions (assigned_role_slug)',
      ],
    })

    app.save(executionsCol)
  },
  (app) => {
    try {
      const executionsCol = app.findCollectionByNameOrId('procedure_executions')
      app.delete(executionsCol)
    } catch (_) {}

    try {
      const categoriesCol = app.findCollectionByNameOrId('procedure_categories')
      app.delete(categoriesCol)
    } catch (_) {}
  },
)
