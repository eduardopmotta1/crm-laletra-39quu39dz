migrate(
  (app) => {
    const collection = new Collection({
      name: 'procedures',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'title', type: 'text', required: true },
        {
          name: 'category',
          type: 'select',
          required: true,
          values: [
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
          ],
          maxSelect: 1,
        },
        { name: 'summary', type: 'text' },
        { name: 'content', type: 'text' },
        { name: 'steps', type: 'json' },
        { name: 'notes', type: 'text' },
        {
          name: 'reviewer_id',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'reviewer_name', type: 'text' },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['Rascunho', 'Ativo', 'Em revisão', 'Arquivado'],
          maxSelect: 1,
        },
        { name: 'last_reviewed_at', type: 'date' },
        { name: 'version', type: 'text' },
        {
          name: 'attachments',
          type: 'file',
          maxSelect: 5,
          maxSize: 20971520,
          mimeTypes: [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/svg+xml',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ],
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_procedures_cat ON procedures (category)',
        'CREATE INDEX idx_procedures_status ON procedures (status)',
        'CREATE INDEX idx_procedures_title ON procedures (title)',
      ],
    })

    app.save(collection)

    // Seed initial standard procedures
    const initialProcedures = [
      {
        title: 'Padrão de Fechamento e Envio de Arquivos para Impressão',
        category: 'Design / Arte',
        summary:
          'Diretrizes e checklist técnico para conferência de sangria, cores CMYK e fontes antes da gravação de matriz ou envio para RIP.',
        content:
          'Instruções obrigatórias para arte finalistas:\n- Sempre converter todas as fontes em curvas (Ctrl+Shift+O no Illustrator / Ctrl+Q no Corel).\n- Utilizar espaço de cor CMYK padrão Fogra39 ou Coated Gracol.\n- Conferir sangria mínima de 3mm para materiais gráficos em papel e 15mm para lonas com ilhós.\n- Imagens em resolução mínima de 300 DPI em escala real 1:1.\n- Salvar PDF/X-1a ou PDF/X-4 de alta qualidade.',
        notes:
          'Nunca enviar arquivos em RGB diretamente para os RIPs de impressão solvente ou UV para evitar distorção de tonalidades críticas da marca.',
        version: '1.0',
        status: 'Ativo',
        reviewer_name: 'Administração',
        last_reviewed_at: new Date().toISOString().split('T')[0],
        steps: [
          {
            title: 'Conferir dimensões',
            description:
              'Verificar se as dimensões no documento batem exatamente com a Ordem de Serviço.',
          },
          {
            title: 'Converter em curvas',
            description: 'Certificar que nenhuma fonte está em modo de texto editável.',
          },
          {
            title: 'Checar modo de cor',
            description: 'Garantir que todas as paletas e bitmaps estejam em CMYK.',
          },
          {
            title: 'Adicionar sangria e marcas',
            description: 'Aplicar sangra de 3mm e marcas de corte se for para guilhotina.',
          },
          {
            title: 'Exportar PDF/X',
            description: 'Exportar padrão PDF/X-1a e anexar à O.S. de produção.',
          },
        ],
      },
      {
        title: 'Procedimento Padrão de Atendimento via WhatsApp Oficial',
        category: 'Atendimento',
        summary:
          'Boas práticas de acolhimento, resposta rápida dentro do SLA e qualificação de pedidos de clientes.',
        content:
          'Regras de excelência no atendimento gráfico:\n1. Responder mensagens novas em até 10 minutos (SLA Verificado).\n2. Identificar se o cliente já possui arte pronta ou necessita de criação/ajuste.\n3. Solicitar medidas exatas (largura x altura em metros ou cm), quantidade e tipo de acabamento.\n4. Gerar o orçamento diretamente pelo CRM e enviar o link oficial da proposta.',
        notes:
          'Sempre manter tom cortês, objetivo e confirmar os prazos de produção acordados antes de fechar a negociação.',
        version: '1.0',
        status: 'Ativo',
        reviewer_name: 'Gerência Comercial',
        last_reviewed_at: new Date().toISOString().split('T')[0],
        steps: [
          {
            title: 'Saudação inicial',
            description:
              'Cumprimentar com o nome do cliente e mensagem de acolhimento personalizada.',
          },
          {
            title: 'Briefing do produto',
            description:
              'Perguntar tipo de material, medidas, quantidade e onde será aplicado/usado.',
          },
          {
            title: 'Cálculo no CRM',
            description: 'Lançar os produtos no módulo de Orçamentos do CRM Laletra.',
          },
          {
            title: 'Envio de proposta',
            description: 'Disparar link oficial do orçamento com valores e prazos.',
          },
          {
            title: 'Follow-up',
            description: 'Agendar tarefa de follow-up em até 24 horas se o cliente não responder.',
          },
        ],
      },
      {
        title: 'Checklist de Limpeza e Manutenção Preventiva da Plotter',
        category: 'Manutenção',
        summary:
          'Rotina diária e semanal de limpeza das cabeças de impressão, capping, wipers e alinhamento.',
        content:
          'Rotina essencial para preservação dos cabeçotes de impressão:\n- Início do dia: realizar teste de bicos (Nozzle Check) antes de iniciar qualquer trabalho pesado.\n- Se houver falha nos bicos: efetuar limpeza leve (Normal Clean) e repetir o teste.\n- Fim do dia: limpar ao redor da cabeça com cotonete especial sem fiapos e solvente específico.\n- Higienizar o wiper de borracha e a estação de capping.\n- Nunca deixar a cabeça exposta sem estar travada no capping.',
        notes:
          'Utilizar somente solvente de limpeza compatível fornecido pelo fabricante da tinta. Nunca tocar a superfície dos nozzles com força.',
        version: '1.1',
        status: 'Ativo',
        reviewer_name: 'Responsável Produção',
        last_reviewed_at: new Date().toISOString().split('T')[0],
        steps: [
          {
            title: 'Teste de bicos',
            description:
              'Imprimir padrão de nozzle check e conferir integridade das 4 cores (CMYK).',
          },
          {
            title: 'Limpeza de wiper',
            description: 'Retirar excesso de tinta seca acumulada na lâmina de borracha.',
          },
          {
            title: 'Limpeza do capping',
            description:
              'Umedecer esponja de vedação com flush limpo para garantir sucção correta.',
          },
          {
            title: 'Verificação de tintas',
            description:
              'Conferir se os níveis de bulk ink estão acima de 30% antes de impressões longas.',
          },
        ],
      },
    ]

    try {
      const savedCol = app.findCollectionByNameOrId('procedures')
      for (const proc of initialProcedures) {
        const record = new Record(savedCol)
        record.set('title', proc.title)
        record.set('category', proc.category)
        record.set('summary', proc.summary)
        record.set('content', proc.content)
        record.set('notes', proc.notes)
        record.set('steps', proc.steps)
        record.set('version', proc.version)
        record.set('status', proc.status)
        record.set('reviewer_name', proc.reviewer_name)
        record.set('last_reviewed_at', proc.last_reviewed_at)
        app.save(record)
      }
    } catch (e) {
      console.log('Error seeding initial procedures:', e)
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('procedures')
      app.delete(collection)
    } catch (_) {}
  },
)
