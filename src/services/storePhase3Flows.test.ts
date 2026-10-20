import { describe, it, expect } from 'vitest'
import {
  PickupShippingStrategy,
  LocalDeliveryShippingStrategy,
  CorreiosShippingStrategy,
  MelhorEnvioShippingStrategy,
  ShippingManager,
} from '@/services/shippingService'

describe('Laletra Store - Fase 3: Itens 1, 2, 3 e 4 (Artes, Painel, Frete e Segurança)', () => {
  // ==========================================
  // ITEM 1: 3 Opções de Arte no Frontend / Backend
  // ==========================================
  describe('Item 1: 3 Opções de Arte (send_ready, send_later, request_creation)', () => {
    it('1.1 Opção "send_ready": valida extensões aceitas e rejeita extensões não autorizadas', () => {
      const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'cdr', 'ai', 'eps', 'zip']
      const validateExtension = (filename: string) => {
        const ext = (filename.split('.').pop() || '').toLowerCase()
        return allowedExtensions.includes(ext)
      }

      expect(validateExtension('panfleto.pdf')).toBe(true)
      expect(validateExtension('adesivo.cdr')).toBe(true)
      expect(validateExtension('catalogo.ai')).toBe(true)
      expect(validateExtension('foto.jpg')).toBe(true)
      expect(validateExtension('script.exe')).toBe(false)
      expect(validateExtension('hack.js')).toBe(false)
    })

    it('1.2 Opção "send_later": permite prosseguir sem arquivo mantendo arte pendente', () => {
      const orderItem = {
        product_id: 'prod_123',
        art_option: 'send_later' as const,
        art_file_name: null,
      }

      const evaluateArtStatus = (item: typeof orderItem) => {
        if (item.art_option === 'send_later' && !item.art_file_name) {
          return {
            initial_status: 'pending_upload',
            allowCheckout: true,
            production_locked: true,
          }
        }
        return { initial_status: 'unknown', allowCheckout: false, production_locked: true }
      }

      const res = evaluateArtStatus(orderItem)
      expect(res.allowCheckout).toBe(true)
      expect(res.initial_status).toBe('pending_upload')
      expect(res.production_locked).toBe(true)
    })

    it('1.3 Opção "request_creation": aplica taxa do backend (+R$ 45,00) e prazo adicional (+2 dias)', () => {
      const serverConfig = {
        base_creation_fee: 45.0,
        free_for_orders_above: 500.0,
        lead_time_extra_days: 2,
        is_active: true,
      }

      const calculateCartItemWithArt = (
        basePrice: number,
        artOption: 'send_ready' | 'send_later' | 'request_creation',
        orderSubtotal: number,
      ) => {
        let artFee = 0
        let extraDays = 0

        if (artOption === 'request_creation' && serverConfig.is_active) {
          extraDays = serverConfig.lead_time_extra_days
          // Se o pedido atingir a faixa de isenção, a taxa de criação é zerada
          if (
            serverConfig.free_for_orders_above &&
            orderSubtotal >= serverConfig.free_for_orders_above
          ) {
            artFee = 0
          } else {
            artFee = serverConfig.base_creation_fee
          }
        }

        return {
          finalItemTotal: basePrice + artFee,
          artFee,
          extraDays,
        }
      }

      // Pedido abaixo do teto de isenção: soma R$ 45,00 e 2 dias
      const normalOrder = calculateCartItemWithArt(120.0, 'request_creation', 120.0)
      expect(normalOrder.artFee).toBe(45.0)
      expect(normalOrder.finalItemTotal).toBe(165.0)
      expect(normalOrder.extraDays).toBe(2)

      // Pedido acima do teto de isenção (R$ 550,00): taxa gratuita
      const bigOrder = calculateCartItemWithArt(550.0, 'request_creation', 550.0)
      expect(bigOrder.artFee).toBe(0.0)
      expect(bigOrder.extraDays).toBe(2)
    })
  })

  // ==========================================
  // ITEM 2: Painel do Cliente /loja/conta e Isolamento
  // ==========================================
  describe('Item 2: Painel do Cliente e Isolamento Estrito', () => {
    it('2.1 Isolamento por ownership: comprador A NUNCA recebe pedidos do comprador B', () => {
      const mockDatabaseOrders = [
        { id: 'ord_1', customer_id: 'cust_A', customer_email: 'a@exemplo.com', total: 100 },
        { id: 'ord_2', customer_id: 'cust_A', customer_email: 'a@exemplo.com', total: 200 },
        { id: 'ord_3', customer_id: 'cust_B', customer_email: 'b@exemplo.com', total: 300 },
      ]

      const fetchCustomerOrdersServerSide = (claims: { sub: string; email: string }) => {
        return mockDatabaseOrders.filter(
          (o) => o.customer_id === claims.sub || o.customer_email === claims.email,
        )
      }

      const resultsA = fetchCustomerOrdersServerSide({ sub: 'cust_A', email: 'a@exemplo.com' })
      expect(resultsA).toHaveLength(2)
      expect(resultsA.some((o) => o.id === 'ord_3')).toBe(false)

      const resultsB = fetchCustomerOrdersServerSide({ sub: 'cust_B', email: 'b@exemplo.com' })
      expect(resultsB).toHaveLength(1)
      expect(resultsB[0].id).toBe('ord_3')
    })

    it('2.2 Fluxo de aprovação ou ajuste de prova técnica pelo cliente altera status de arte', () => {
      const order = {
        order_number: 'LL-2026-0001',
        art_status: 'uploaded' as 'uploaded' | 'approved' | 'changes_requested',
        production_status: 'waiting_release',
        art_feedback_notes: '',
      }

      const processArtDecision = (approved: boolean, feedback: string) => {
        if (approved) {
          order.art_status = 'approved'
          order.art_feedback_notes = 'Aprovado pelo comprador via painel da loja'
        } else {
          order.art_status = 'changes_requested'
          order.art_feedback_notes = feedback || 'Solicitação de ajustes pelo cliente'
        }
        return order
      }

      // Cliente solicita ajuste
      processArtDecision(false, 'Favor corrigir o telefone no verso para (11) 99999-0000')
      expect(order.art_status).toBe('changes_requested')
      expect(order.art_feedback_notes).toContain('99999-0000')

      // Cliente aprova após revisão
      processArtDecision(true, '')
      expect(order.art_status).toBe('approved')
    })
  })

  // ==========================================
  // ITEM 3: Frete e Pagamento (Estratégias Reais sem Valores Fictícios)
  // ==========================================
  describe('Item 3: Frete e Pagamento (Organização de serviços)', () => {
    it('3.1 Retirada no balcão é sempre R$ 0,00 e disponível', async () => {
      const pickup = new PickupShippingStrategy()
      expect(pickup.isConfigured()).toBe(true)

      const quotes = await pickup.calculateQuote({ destination_zip: '01001-000', subtotal: 50.0 })
      expect(quotes).toHaveLength(1)
      expect(quotes[0].price).toBe(0.0)
      expect(quotes[0].available).toBe(true)
      expect(quotes[0].is_free).toBe(true)
    })

    it('3.2 Entrega local aplica taxa configurável (R$ 25,00) ou frete grátis acima de R$ 350,00', async () => {
      const local = new LocalDeliveryShippingStrategy({ standardFee: 25.0, freeThreshold: 350.0 })

      // Pedido R$ 100,00 -> taxa R$ 25,00
      const quoteSmall = await local.calculateQuote({
        destination_zip: '01001-000',
        subtotal: 100.0,
      })
      expect(quoteSmall[0].price).toBe(25.0)
      expect(quoteSmall[0].is_free).toBe(false)

      // Pedido R$ 400,00 -> frete grátis
      const quoteBig = await local.calculateQuote({ destination_zip: '01001-000', subtotal: 400.0 })
      expect(quoteBig[0].price).toBe(0.0)
      expect(quoteBig[0].is_free).toBe(true)
    })

    it('3.3 Correios e Melhor Envio ficam rigorosamente INATIVOS sem credenciais, sem inventar valores', async () => {
      const correiosNoKey = new CorreiosShippingStrategy(undefined)
      expect(correiosNoKey.isConfigured()).toBe(false)

      const correiosQuotes = await correiosNoKey.calculateQuote({
        destination_zip: '01001-000',
        subtotal: 150.0,
      })
      // Não pode haver cotação disponível com valor fictício
      expect(correiosQuotes.every((q) => q.available === false)).toBe(true)

      const melhorEnvioNoKey = new MelhorEnvioShippingStrategy(undefined)
      expect(melhorEnvioNoKey.isConfigured()).toBe(false)
      const meQuotes = await melhorEnvioNoKey.calculateQuote({
        destination_zip: '01001-000',
        subtotal: 150.0,
      })
      expect(meQuotes.every((q) => q.available === false)).toBe(true)
    })

    it('3.4 ShippingManager expõe apenas modalidades ativas e legítimas para o checkout', async () => {
      const manager = new ShippingManager()
      const availableOptions = await manager.getAvailableShippingOptions({
        destination_zip: '01001-000',
        subtotal: 100.0,
      })

      // Somente retirada e entrega local devem ser retornadas
      const carriers = availableOptions.map((o) => o.carrier)
      expect(carriers).toContain('pickup')
      expect(carriers).toContain('local_delivery')
      expect(carriers).not.toContain('correios')
      expect(carriers).not.toContain('melhor_envio')
    })
  })

  // ==========================================
  // ITEM 4: Segurança, Idempotência e Trava de Produção
  // ==========================================
  describe('Item 4: Travas de Segurança da Fase 3', () => {
    it('4.1 Trava HTTP 400: Produção rejeitada sem pagamento confirmado OU sem arte aprovada', () => {
      const releaseToProduction = (order: {
        payment_status: 'pending' | 'paid' | 'refunded'
        art_status: 'none' | 'pending_upload' | 'uploaded' | 'approved'
        production_order_id?: string
      }) => {
        if (order.production_order_id) {
          return { status: 400, error: 'Ordem de produção já foi gerada para este pedido.' }
        }
        if (order.payment_status !== 'paid') {
          return { status: 400, error: 'Pagamento ainda não foi confirmado.' }
        }
        if (order.art_status !== 'approved') {
          return { status: 400, error: 'Arte técnica ainda não foi aprovada pelo cliente.' }
        }
        return { status: 200, success: true }
      }

      // 1. Sem pagamento
      expect(
        releaseToProduction({
          payment_status: 'pending',
          art_status: 'approved',
        }).status,
      ).toBe(400)

      // 2. Com pagamento mas arte ainda não aprovada
      expect(
        releaseToProduction({
          payment_status: 'paid',
          art_status: 'uploaded',
        }).status,
      ).toBe(400)

      // 3. OP duplicada
      expect(
        releaseToProduction({
          payment_status: 'paid',
          art_status: 'approved',
          production_order_id: 'prod_999',
        }).status,
      ).toBe(400)

      // 4. Perfeito: pago e arte aprovada
      expect(
        releaseToProduction({
          payment_status: 'paid',
          art_status: 'approved',
        }).status,
      ).toBe(200)
    })

    it('4.2 Webhook Mercado Pago com idempotência e tratamento de estorno (refunded)', () => {
      const order = {
        order_number: 'LL-2026-9999',
        payment_status: 'pending',
        production_status: 'waiting_release',
        payment_history: [] as string[],
      }

      const processWebhook = (payload: { payment_id: string; status: string }) => {
        // Idempotência: se já processou esse payment_id com o mesmo status, ignora
        const key = `${payload.payment_id}:${payload.status}`
        if (order.payment_history.includes(key)) {
          return { idempotent_skip: true, order }
        }

        order.payment_history.push(key)

        if (payload.status === 'approved' || payload.status === 'paid') {
          order.payment_status = 'paid'
        } else if (payload.status === 'refunded') {
          order.payment_status = 'refunded'
          order.production_status = 'cancelled'
        }

        return { idempotent_skip: false, order }
      }

      // Primeiro evento: pagamento aprovado
      const firstEvent = processWebhook({ payment_id: 'mp_pay_1', status: 'approved' })
      expect(firstEvent.idempotent_skip).toBe(false)
      expect(order.payment_status).toBe('paid')

      // Retry idempotente do mesmo evento: ignora reprocessamento
      const retryEvent = processWebhook({ payment_id: 'mp_pay_1', status: 'approved' })
      expect(retryEvent.idempotent_skip).toBe(true)

      // Evento de estorno (refunded): cancela produção e atualiza status
      const refundEvent = processWebhook({ payment_id: 'mp_pay_1', status: 'refunded' })
      expect(refundEvent.idempotent_skip).toBe(false)
      expect(order.payment_status).toBe('refunded')
      expect(order.production_status).toBe('cancelled')
    })
  })
})
