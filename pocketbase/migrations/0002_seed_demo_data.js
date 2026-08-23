migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // Seed main admin user
    let adminUser
    try {
      adminUser = app.findAuthRecordByEmail('_pb_users_auth_', 'eduardopmotta1@gmail.com')
    } catch (_) {
      adminUser = new Record(users)
      adminUser.setEmail('eduardopmotta1@gmail.com')
      adminUser.setPassword('Skip@Pass')
      adminUser.setVerified(true)
      adminUser.set('name', 'Eduardo Motta')
      app.save(adminUser)
    }

    // Seed secondary agent user for team demo
    let agentUser
    try {
      agentUser = app.findAuthRecordByEmail('_pb_users_auth_', 'atendimento@grafica.com')
    } catch (_) {
      agentUser = new Record(users)
      agentUser.setEmail('atendimento@grafica.com')
      agentUser.setPassword('Skip@Pass')
      agentUser.setVerified(true)
      agentUser.set('name', 'Mariana Atendimento')
      app.save(agentUser)
    }

    // 1. Settings default
    const settingsCol = app.findCollectionByNameOrId('system_settings')
    const defaultSettings = [
      {
        key: 'sla_urgent_hours',
        value: '24',
        desc: 'Tempo de resposta crítico (Vermelho) em horas',
      },
      {
        key: 'sla_warning_hours',
        value: '12',
        desc: 'Tempo de resposta alerta (Laranja) em horas',
      },
      { key: 'sla_notice_hours', value: '6', desc: 'Tempo de resposta atenção (Amarelo) em horas' },
      {
        key: 'whatsapp_phone_number_id',
        value: '109283746592019',
        desc: 'Phone Number ID da Meta Cloud API',
      },
      { key: 'whatsapp_business_account_id', value: '982736154820931', desc: 'WABA ID' },
      {
        key: 'whatsapp_access_token',
        value: 'EAAX...DEMO_TOKEN',
        desc: 'Access Token da Meta Graph API',
      },
      {
        key: 'whatsapp_display_phone',
        value: '+55 (11) 98765-4321',
        desc: 'Número de atendimento exibido aos clientes',
      },
      { key: 'company_name', value: 'Gráfica & Print Express', desc: 'Nome da Gráfica' },
    ]

    for (let s of defaultSettings) {
      try {
        app.findFirstRecordByData('system_settings', 'setting_key', s.key)
      } catch (_) {
        const rec = new Record(settingsCol)
        rec.set('setting_key', s.key)
        rec.set('setting_value', s.value)
        rec.set('description', s.desc)
        app.save(rec)
      }
    }

    // 2. Demo Clients
    const clientsCol = app.findCollectionByNameOrId('clients')
    const now = new Date()

    // Helper to get ISO date string offset by hours
    const hoursAgo = (h) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString()
    const daysFromNow = (d) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000).toISOString()

    const demoClients = [
      {
        name: 'Ana Carolina Ribeiro - Café & Flor',
        phone: '+55 11 99881-2233',
        email: 'contato@cafeflor.com.br',
        stage: 'Precisa responder',
        product_interest: '1.000 Panfletos Couché 115g 4x4 + 500 Cartões de Visita',
        quote_value: 480.0,
        priority: 'urgente',
        assigned_to: adminUser.id,
        last_message_at: hoursAgo(30), // 30h ago -> Vermelho (> 24h)
        last_message_direction: 'inbound',
        last_message_text:
          'Olá! Gostaria de saber se vocês conseguem entregar os panfletos até sexta-feira para nossa inauguração?',
        notes:
          'Cliente urgente para inauguração de cafeteria nova no centro. Pediu amostra de verniz localizado.',
        next_action: 'Responder com urgência e confirmar prazo de produção expressa',
        next_action_date: daysFromNow(0),
      },
      {
        name: 'Dr. Marcelo Sampaio - Clínica Integrada',
        phone: '+55 11 98765-4321',
        email: 'marcelo@sampaioodonto.com.br',
        stage: 'Precisa responder',
        product_interest: '2.000 Receituários Carbonados + Pastas com Bolsa Personalizadas',
        quote_value: 1250.0,
        priority: 'alta',
        assigned_to: agentUser.id,
        last_message_at: hoursAgo(14), // 14h ago -> Laranja (> 12h)
        last_message_direction: 'inbound',
        last_message_text:
          'Boa noite! Conseguem me mandar o orçamento das pastas de prontuário com o acabamento laminado fosco?',
        notes:
          'Clínica odontológica reformando a identidade visual. Potencial para pedidos recorrentes mensais.',
        next_action: 'Calcular tabela de atacado e enviar proposta em PDF',
        next_action_date: daysFromNow(1),
      },
      {
        name: 'Restaurante Sabor Brasil - Gerente Lucas',
        phone: '+55 11 97654-3210',
        email: 'gerencia@saborbrasil.com.br',
        stage: 'Precisa responder',
        product_interest:
          '50 Cardápios Wire-o PVC Cristal + 2.000 Jogos Americanos em Papel Offset',
        quote_value: 890.0,
        priority: 'media',
        assigned_to: adminUser.id,
        last_message_at: hoursAgo(7), // 7h ago -> Amarelo (> 6h)
        last_message_direction: 'inbound',
        last_message_text:
          'Olá, vocês fazem impressão em PVC lavável para cardápio de restaurante?',
        notes: 'Menu de inverno. Necessita de laminação grossa ou PVC para resistir a líquidos.',
        next_action: 'Enviar fotos de cardápios já feitos no WhatsApp',
        next_action_date: daysFromNow(1),
      },
      {
        name: 'Beatriz Nogueira - Bella Boutique',
        phone: '+55 11 96543-2109',
        email: 'contato@bellaboutique.com',
        stage: 'Novo contato',
        product_interest: '500 Sacolas de Papel Kraft Personalizadas + 1.000 Tags com Hot Stamping',
        quote_value: 2300.0,
        priority: 'alta',
        assigned_to: adminUser.id,
        last_message_at: hoursAgo(2), // Recente
        last_message_direction: 'inbound',
        last_message_text:
          'Olá, vi o trabalho de vocês no Instagram! Vocês produzem sacolas kraft para loja de roupas?',
        notes:
          'Chegou pelo Instagram / WhatsApp Link direto. Pediu catálogo de tamanhos de sacolas.',
        next_action: 'Qualificar quantidade e enviar gabarito para envio da arte',
        next_action_date: daysFromNow(0),
      },
      {
        name: 'Agência Move Digital - Tiago Santos',
        phone: '+55 11 95432-1098',
        email: 'tiago@movedigital.ag',
        stage: 'Em atendimento',
        product_interest:
          'Kit Boas-Vindas Corporativo: Cadernos capa dura, canetas laser e adesivos vinil',
        quote_value: 3750.0,
        priority: 'alta',
        assigned_to: adminUser.id,
        last_message_at: hoursAgo(3),
        last_message_direction: 'outbound',
        last_message_text:
          'Oi Tiago, conferimos as artes dos cadernos! Estão todas em CMYK e alta resolução. Já estamos montando o layout.',
        notes:
          'Agência parceira. Pedido de 200 kits onboarding corporativo. Orçamento em fase final de aprovação com a diretoria.',
        next_action: 'Enviar prova digital 3D dos mockups',
        next_action_date: daysFromNow(1),
      },
      {
        name: 'Escola Futuro Brilhante - Profa. Regina',
        phone: '+55 11 94321-0987',
        email: 'financeiro@futurobrilhante.edu.br',
        stage: 'Em atendimento',
        product_interest: '800 Agendas Escolares 2025 personalizadas com wire-o e elástico',
        quote_value: 9600.0,
        priority: 'urgente',
        assigned_to: agentUser.id,
        last_message_at: hoursAgo(5),
        last_message_direction: 'outbound',
        last_message_text:
          'Professora Regina, o modelo de miolo da agenda que enviamos ficou aprovado pela coordenação?',
        notes: 'Grande volume anual. Fechamento programado para esta semana.',
        next_action: 'Agendar visita com mostruário físico de miolo e capas',
        next_action_date: daysFromNow(2),
      },
      {
        name: 'Engenharia & Obras Martins - Eng. Ricardo',
        phone: '+55 11 93210-9876',
        email: 'ricardo@martinseng.com.br',
        stage: 'Orçamento enviado',
        product_interest:
          'Plotagem de 45 Projetos A0 + 20 Jogos de Plantas Dobradas e 10 Placas de Obra em ACM',
        quote_value: 1850.0,
        priority: 'media',
        assigned_to: adminUser.id,
        last_message_at: hoursAgo(18),
        last_message_direction: 'outbound',
        last_message_text:
          'Eng. Ricardo, enviamos a proposta formal nº 4021 com frete incluso para o canteiro de obras. Ficamos no aguardo da aprovação!',
        notes:
          'Proposta enviada por e-mail e resumo detalhado no WhatsApp. Prazo de validade 7 dias.',
        next_action:
          'Fazer follow-up de orçamento via WhatsApp e checar se precisam de nota faturada',
        next_action_date: daysFromNow(1),
      },
      {
        name: 'Festas & Sonhos Buffet - Camila Neves',
        phone: '+55 11 92109-8765',
        email: 'camila@festasesonhos.com',
        stage: 'Aguardando cliente',
        product_interest: "5.000 Rótulos Adesivos Vinil à Prova D'água com Meio-Corte",
        quote_value: 620.0,
        priority: 'baixa',
        assigned_to: agentUser.id,
        last_message_at: hoursAgo(40), // 40h ago
        last_message_direction: 'outbound',
        last_message_text:
          'Olá Camila! Conseguiu verificar com sua equipe a arte final dos adesivos transparentes?',
        notes: 'Cliente aguardando aprovação interna do novo design de embalagem para lançamento.',
        next_action: 'Mandar lembrete amigável oferecendo ajuda com o ajuste da sangria',
        next_action_date: daysFromNow(2),
      },
      {
        name: 'Imobiliária Prime House - Corretor Fábio',
        phone: '+55 11 91098-7654',
        email: 'fabio@primehouse.com.br',
        stage: 'Venda fechada',
        product_interest: "30 Faixas de Lona 440g com Ilhós 'Vende-se' + 2.000 Folhetos 15x21cm",
        quote_value: 1450.0,
        priority: 'alta',
        assigned_to: adminUser.id,
        last_message_at: hoursAgo(8),
        last_message_direction: 'inbound',
        last_message_text:
          'Comprovante do PIX 50% enviado! Podem rodar a impressão conforme combinado.',
        notes:
          'Venda aprovada! PIX confirmado. Pedido encaminhado para a pré-impressão e fila de CTP.',
        next_action: 'Avisar expedição e gerar ordem de produção OP #1094',
        next_action_date: daysFromNow(0),
      },
      {
        name: 'StartFit Suplementos - Marcos Vinicius',
        phone: '+55 11 90987-6543',
        email: 'marcos@startfit.com.br',
        stage: 'Venda fechada',
        product_interest: '10.000 Envelopes com Verniz Total + Caixas Personalizadas Microondulado',
        quote_value: 4850.0,
        priority: 'alta',
        assigned_to: agentUser.id,
        last_message_at: hoursAgo(12),
        last_message_direction: 'outbound',
        last_message_text:
          'Perfeito Marcos! As caixas entraram em acabamento e corte/vinco hoje pela manhã.',
        notes: 'Cliente recorrente. Produção a todo vapor com entrega agendada para sexta-feira.',
        next_action: 'Enviar código de rastreio/aviso de envio quando sair com motoboy',
        next_action_date: daysFromNow(3),
      },
      {
        name: 'Academia Iron Gym - Prof. Daniel',
        phone: '+55 11 99123-4567',
        email: 'contato@irongym.com.br',
        stage: 'Não fechou',
        product_interest: '3 Banners Roll-up com estrutura de alumínio',
        quote_value: 720.0,
        priority: 'baixa',
        assigned_to: agentUser.id,
        last_message_at: hoursAgo(72),
        last_message_direction: 'inbound',
        last_message_text:
          'Obrigado pelo retorno, mas adiamos o evento e não vamos conseguir rodar os banners agora.',
        notes: 'Evento cancelado. Retomar contato daqui a 60 dias para promoções de verão.',
        next_action: 'Programar contato futuro para evento de final de ano',
        next_action_date: daysFromNow(30),
      },
    ]

    const createdClients = []
    for (let c of demoClients) {
      try {
        const existing = app.findFirstRecordByData('clients', 'phone', c.phone)
        createdClients.push(existing)
      } catch (_) {
        const rec = new Record(clientsCol)
        rec.set('name', c.name)
        rec.set('phone', c.phone)
        rec.set('email', c.email)
        rec.set('stage', c.stage)
        rec.set('product_interest', c.product_interest)
        rec.set('quote_value', c.quote_value)
        rec.set('priority', c.priority)
        rec.set('assigned_to', c.assigned_to)
        rec.set('last_message_at', c.last_message_at)
        rec.set('last_message_direction', c.last_message_direction)
        rec.set('last_message_text', c.last_message_text)
        rec.set('notes', c.notes)
        rec.set('next_action', c.next_action)
        rec.set('next_action_date', c.next_action_date)
        app.save(rec)
        createdClients.push(rec)
      }
    }

    // 3. Demo Follow-up Tasks
    const tasksCol = app.findCollectionByNameOrId('tasks')
    const demoTasks = [
      {
        title: 'Confirmar prazo expresso de 48h para os panfletos do Café & Flor',
        description: 'Checar com o setor de offset e CTP se a máquina tem janela para quinta-feira',
        client_index: 0,
        due_date: daysFromNow(0),
        status: 'pendente',
        priority: 'alta',
        assigned_to: adminUser.id,
      },
      {
        title: 'Enviar PDF com opções de faca especial para Pastas de Odonto',
        description: 'Dr. Marcelo pediu opção com bolsa para colocar exames de raio-X panorâmicos',
        client_index: 1,
        due_date: daysFromNow(1),
        status: 'pendente',
        priority: 'alta',
        assigned_to: agentUser.id,
      },
      {
        title: 'Enviar fotos de cardápios laminados para o Restaurante Sabor Brasil',
        description: 'Tirar foto do mostruário de cantos arredondados e wire-o preto',
        client_index: 2,
        due_date: daysFromNow(1),
        status: 'pendente',
        priority: 'media',
        assigned_to: adminUser.id,
      },
      {
        title: 'Enviar gabarito de sacola M e G para Bella Boutique',
        description: 'PDF com linhas de vinco e margens de segurança para arte',
        client_index: 3,
        due_date: daysFromNow(0),
        status: 'pendente',
        priority: 'alta',
        assigned_to: adminUser.id,
      },
      {
        title: 'Follow-up da proposta #4021 - Plantas de Engenharia',
        description: 'Ligar ou mandar áudio no WhatsApp perguntando se aceitam faturamento 28 DDL',
        client_index: 6,
        due_date: daysFromNow(2),
        status: 'pendente',
        priority: 'media',
        assigned_to: adminUser.id,
      },
      {
        title: 'Conferir comprovante de entrada e emitir OP #1094 Imobiliária Prime House',
        description: 'Concluído com sucesso na expedição',
        client_index: 8,
        due_date: daysFromNow(-1),
        status: 'concluida',
        priority: 'alta',
        assigned_to: adminUser.id,
      },
    ]

    for (let t of demoTasks) {
      const targetClient = createdClients[t.client_index]
      if (!targetClient) continue

      try {
        app.findFirstRecordByData('tasks', 'title', t.title)
      } catch (_) {
        const taskRec = new Record(tasksCol)
        taskRec.set('title', t.title)
        taskRec.set('description', t.description)
        taskRec.set('client_id', targetClient.id)
        taskRec.set('assigned_to', t.assigned_to)
        taskRec.set('due_date', t.due_date)
        taskRec.set('status', t.status)
        taskRec.set('priority', t.priority)
        app.save(taskRec)
      }
    }

    // 4. Demo Messages for clients with conversation history
    const messagesCol = app.findCollectionByNameOrId('messages')
    if (createdClients[0]) {
      const m1 = new Record(messagesCol)
      m1.set('client_id', createdClients[0].id)
      m1.set('direction', 'inbound')
      m1.set(
        'message_text',
        'Boa tarde! Vocês fazem panfleto promocional para inauguração de cafeteria?',
      )
      m1.set('created', hoursAgo(32))
      app.save(m1)

      const m2 = new Record(messagesCol)
      m2.set('client_id', createdClients[0].id)
      m2.set('direction', 'inbound')
      m2.set(
        'message_text',
        'Olá! Gostaria de saber se vocês conseguem entregar os panfletos até sexta-feira para nossa inauguração?',
      )
      m2.set('created', hoursAgo(30))
      app.save(m2)
    }

    if (createdClients[1]) {
      const m3 = new Record(messagesCol)
      m3.set('client_id', createdClients[1].id)
      m3.set('direction', 'inbound')
      m3.set(
        'message_text',
        'Boa noite! Conseguem me mandar o orçamento das pastas de prontuário com o acabamento laminado fosco?',
      )
      m3.set('created', hoursAgo(14))
      app.save(m3)
    }
  },
  (app) => {
    // down migration
  },
)
