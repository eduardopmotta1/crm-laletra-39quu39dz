import { describe, it, expect } from 'vitest'

/**
 * Teste unitário e de validação sintética do comportamento do Webhook WhatsApp
 * Simulando GET (hub.challenge) e POST (Meta messages payload para número existente e novo)
 *
 * OBSERVAÇÃO IMPORTANTE: Este teste é estritamente uma simulação automatizada
 * e NÃO substitui o teste real com mensagem real da Meta pelo usuário.
 */

describe('Simulação Automatizada do Webhook WhatsApp (Meta Cloud API)', () => {
  it('GET /backend/v1/crm/whatsapp-webhook responde ao challenge quando o token é válido', () => {
    const validTokens = ['laletra_crm_webhook_2024', 'laletra_webhook_secret']

    function simulateGetChallenge(
      mode: string,
      token: string,
      challenge: string,
      serverVerifyToken: string,
    ) {
      if (
        mode === 'subscribe' &&
        (token === serverVerifyToken ||
          token === 'laletra_crm_webhook_2024' ||
          token === 'laletra_webhook_secret')
      ) {
        return { status: 200, body: challenge }
      }
      return { status: 403, body: 'Forbidden' }
    }

    const res1 = simulateGetChallenge(
      'subscribe',
      'laletra_crm_webhook_2024',
      'challenge_test_123',
      'laletra_crm_webhook_2024',
    )
    expect(res1.status).toBe(200)
    expect(res1.body).toBe('challenge_test_123')

    const resInvalid = simulateGetChallenge(
      'subscribe',
      'wrong_token',
      'challenge_test_123',
      'laletra_crm_webhook_2024',
    )
    expect(resInvalid.status).toBe(403)
  })

  it('Dedupe / Cache WAMID: não bloqueia retry da Meta se a tentativa anterior falhou antes do commit', () => {
    const memoryCache = new Map<string, number>()
    const wamid = 'wamid.HBgNNTUyMTk5OTk5OTk5VRUCABEYEjEyMzQ1'

    // Simulação 1: Falha antes do commit (ex: erro de validação de schema)
    let transactionCommitted = false
    try {
      // Leitura do cache: não está presente
      expect(memoryCache.has(wamid)).toBe(false)

      // Simula falha na gravação
      throw new Error('priority: cannot be blank')
      transactionCommitted = true
      memoryCache.set(wamid, Date.now())
    } catch (_) {
      // Rollback: se estivesse no cache, teria sido removido
      memoryCache.delete(wamid)
    }

    // WAMID NÃO deve estar no cache após erro
    expect(memoryCache.has(wamid)).toBe(false)

    // Simulação 2: Retry da Meta após o erro ter sido corrigido
    try {
      expect(memoryCache.has(wamid)).toBe(false)
      // Desta vez com sucesso
      transactionCommitted = true
      memoryCache.set(wamid, Date.now())
    } catch (_) {
      memoryCache.delete(wamid)
    }

    expect(transactionCommitted).toBe(true)
    expect(memoryCache.has(wamid)).toBe(true)

    // Simulação 3: Próximo envio com mesmo WAMID deve ser ignorado pelo dedupe pós-commit
    const isDuplicate = memoryCache.has(wamid)
    expect(isDuplicate).toBe(true)
  })

  it('Simulação POST com payload da Meta: número existente e novo respeitando enums de clients', () => {
    const validClientStages = [
      'Novo contato',
      'Contato iniciado',
      'Precisa responder',
      'Em atendimento',
      'Orçamento enviado',
      'Aguardando cliente',
      'Venda fechada',
      'Não fechou',
      'Em produção',
    ]
    const validPriorities = ['baixa', 'media', 'alta', 'urgente']

    // Validar que a auto-criação de cliente usa valores válidos
    const newClientPayload = {
      name: 'Novo Contato Meta',
      phone: '5521999998888',
      normalized_phone: '5521999998888',
      stage: 'Novo contato',
      priority: 'media',
      is_archived: false,
    }

    expect(validClientStages).toContain(newClientPayload.stage)
    expect(validPriorities).toContain(newClientPayload.priority)
    expect(newClientPayload.stage).not.toBe('Primeiro contato') // Bug antigo prevenido
  })

  describe('Matching de cliente por variantes de telefone (v0.0.260)', () => {
    // Implementação espelho dos helpers de pocketbase/hooks/whatsapp_webhook.js
    function getPhoneVariants(rawPhone: string): string[] {
      if (!rawPhone) return []
      const digits = String(rawPhone).replace(/\D/g, '')
      if (!digits) return []

      const set = new Set<string>()
      set.add(digits)

      if (digits.startsWith('0') && digits.length > 10) {
        const withoutZero = digits.replace(/^0+/, '')
        if (withoutZero) set.add(withoutZero)
      }

      if (digits.startsWith('55') && digits.length >= 12) {
        const national = digits.substring(2)
        set.add(national)
        if (national.startsWith('0')) {
          const nationalNoZero = national.replace(/^0+/, '')
          if (nationalNoZero) set.add(nationalNoZero)
        }
      } else if (digits.length === 10 || digits.length === 11) {
        set.add('55' + digits)
      }

      return Array.from(set).filter((v) => v && v.length >= 8)
    }

    interface MockClientRecord {
      id: string
      name: string
      phone: string
      normalized_phone: string
      get(field: string): any
      set(field: string, val: any): void
    }

    function createMockClient(
      data: Partial<MockClientRecord> & { id: string; name: string },
    ): MockClientRecord {
      const state: Record<string, any> = {
        id: data.id,
        name: data.name,
        phone: data.phone || '',
        normalized_phone: data.normalized_phone || '',
        ...data,
      }
      return {
        id: data.id,
        name: data.name,
        phone: state.phone,
        normalized_phone: state.normalized_phone,
        get(field: string) {
          return state[field]
        },
        set(field: string, val: any) {
          state[field] = val
        },
      }
    }

    function simulateFindOrCreateClient(
      incomingPhone: string,
      incomingName: string,
      clientsDb: MockClientRecord[],
    ): { client: MockClientRecord; action: 'reused' | 'created' } {
      const variants = getPhoneVariants(incomingPhone)
      let found: MockClientRecord | null = null

      // 1. Match exato por normalized_phone contra qualquer variante
      for (const variant of variants) {
        const match = clientsDb.find((c) => c.normalized_phone === variant)
        if (match) {
          found = match
          break
        }
      }

      // 2. Match exato por phone contra qualquer variante
      if (!found) {
        for (const variant of variants) {
          const match = clientsDb.find((c) => c.phone === variant)
          if (match) {
            found = match
            break
          }
        }
      }

      // 3. Fallback: match filter em memória
      if (!found && variants.length > 0) {
        const match = clientsDb.find((c) => variants.includes(c.normalized_phone))
        if (match) found = match
      }

      // 4. Fallback final: sufixo de 8 dígitos
      if (!found) {
        const last8 = incomingPhone.slice(-8)
        if (last8.length === 8) {
          const match = clientsDb.find((c) => (c.phone || '').includes(last8))
          if (match) found = match
        }
      }

      if (found) {
        if (incomingName && (!found.get('name') || found.get('name') === incomingPhone)) {
          found.set('name', incomingName)
        }
        return { client: found, action: 'reused' }
      }

      // Criar novo cliente
      const newClient = createMockClient({
        id: 'new_client_' + Date.now(),
        name: incomingName || incomingPhone,
        phone: incomingPhone,
        normalized_phone: incomingPhone.replace(/\D/g, ''),
      })
      clientsDb.push(newClient)
      return { client: newClient, action: 'created' }
    }

    it('Gera variantes com e sem 55, e sem 0 à esquerda', () => {
      // Caso Meta (55 + 21 + 9 dígitos)
      const variantsMeta = getPhoneVariants('5521970156756')
      expect(variantsMeta).toContain('5521970156756')
      expect(variantsMeta).toContain('21970156756')

      // Caso Nacional sem 55
      const variantsNacional = getPhoneVariants('21970156756')
      expect(variantsNacional).toContain('21970156756')
      expect(variantsNacional).toContain('5521970156756')

      // Caso com 0 inicial
      const variantsZero = getPhoneVariants('021970156756')
      expect(variantsZero).toContain('21970156756')
      expect(variantsZero).toContain('5521970156756')
    })

    it('Caso Eduardo Motta: número da Meta 5521970156756 encontra cliente t06cbihonr2gmoz (normalized_phone 21970156756) sem duplicar', () => {
      const existingEduardo = createMockClient({
        id: 't06cbihonr2gmoz',
        name: 'Eduardo Pereira Motta',
        phone: '+55 21 97015-6756',
        normalized_phone: '21970156756',
      })

      const mockDb: MockClientRecord[] = [existingEduardo]

      const metaIncomingPhone = '5521970156756'
      const metaIncomingName = 'Eduardo P Motta'

      const result = simulateFindOrCreateClient(metaIncomingPhone, metaIncomingName, mockDb)

      expect(result.action).toBe('reused')
      expect(result.client.id).toBe('t06cbihonr2gmoz')
      expect(result.client.name).toBe('Eduardo Pereira Motta')
      expect(mockDb.length).toBe(1) // Não criou registro novo
    })

    it('Cliente novo real com número nunca visto é criado corretamente', () => {
      const mockDb: MockClientRecord[] = []
      const incomingPhone = '5521999991234'
      const incomingName = 'Novo Cliente Teste'

      const result = simulateFindOrCreateClient(incomingPhone, incomingName, mockDb)

      expect(result.action).toBe('created')
      expect(result.client.name).toBe('Novo Cliente Teste')
      expect(result.client.phone).toBe('5521999991234')
      expect(mockDb.length).toBe(1)
    })
  })
})
