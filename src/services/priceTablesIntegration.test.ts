import { describe, it, expect } from 'vitest'
import type { QuoteProduct, QuoteMaterial, QuoteAdditional } from '@/types/quotes'
import type { Client } from '@/types/crm'
import {
  resolveEffectivePriceTier,
  getProductTierConfig,
  applyTierMultiplier,
} from '@/lib/priceTableResolver'
import { calculateQuoteItem } from '@/lib/quoteCalculator'

describe('Etapa 1 — 3 Tabelas de Preços Comerciais (Preparação e Regras de Negócio)', () => {
  // 1. Estrutura das Tabelas: P1 (Cliente Final), P2 (Terceirizado), P3 (Especial) independentes
  describe('1. Estrutura e Independência das 3 Tabelas de Preços', () => {
    it('deve armazenar configurações de preços independentes para p1, p2 e p3', () => {
      const product: Partial<QuoteProduct> = {
        id: 'prod_banner_01',
        name: 'Banner Lona 440g',
        calc_rule: 'm2',
        fixed_price: 65.0, // Base Preço 1
        min_price: 35.0,
        price_tables: {
          preco_1: { fixed_price: 65.0, min_price: 35.0 },
          preco_2: { fixed_price: 48.0, min_price: 25.0 }, // Terceirizado com desconto
          preco_3: { fixed_price: 55.0, min_price: 30.0 }, // Especial
        },
      }

      const p1Config = getProductTierConfig(product, 'preco_1')
      const p2Config = getProductTierConfig(product, 'preco_2')
      const p3Config = getProductTierConfig(product, 'preco_3')

      expect(p1Config.fixed_price).toBe(65.0)
      expect(p2Config.fixed_price).toBe(48.0)
      expect(p3Config.fixed_price).toBe(55.0)

      expect(p1Config.min_price).toBe(35.0)
      expect(p2Config.min_price).toBe(25.0)
      expect(p3Config.min_price).toBe(30.0)
    })

    it('deve permitir override manual em uma tabela sem afetar nenhuma das outras tabelas', () => {
      const product: Partial<QuoteProduct> = {
        id: 'prod_adesivo_01',
        name: 'Adesivo Vinil Brilho',
        calc_rule: 'm2',
        fixed_price: 70.0,
        price_tables: {
          preco_1: { fixed_price: 70.0, min_price: 40.0 },
          preco_2: { fixed_price: 50.0, min_price: 30.0 },
          preco_3: { fixed_price: 60.0, min_price: 35.0 },
        },
      }

      // Usuário ajusta manualmente apenas Preço 2 (Terceirizado) para 52.50
      const updatedTables = {
        ...product.price_tables,
        preco_2: {
          ...product.price_tables!.preco_2,
          fixed_price: 52.5,
        },
      }
      product.price_tables = updatedTables

      const p1 = getProductTierConfig(product, 'preco_1')
      const p2 = getProductTierConfig(product, 'preco_2')
      const p3 = getProductTierConfig(product, 'preco_3')

      // Preço 2 foi alterado isoladamente
      expect(p2.fixed_price).toBe(52.5)
      // Preço 1 e Preço 3 permanecem intocados
      expect(p1.fixed_price).toBe(70.0)
      expect(p3.fixed_price).toBe(60.0)
    })

    it('quando tabela ou campo estiver ausente, deve herdar e comportar-se como Preço 1', () => {
      // Produto legado sem price_tables configurado (ex: os 42+ produtos existentes)
      const legacyProduct: Partial<QuoteProduct> = {
        id: 'prod_legado',
        name: 'Placa PS 2mm',
        calc_rule: 'm2',
        fixed_price: 110.0,
        min_price: 50.0,
      }

      const p1 = getProductTierConfig(legacyProduct, 'preco_1')
      const p2 = getProductTierConfig(legacyProduct, 'preco_2')
      const p3 = getProductTierConfig(legacyProduct, 'preco_3')

      // Tanto p1 quanto p2 e p3 herdam os valores base do Preço 1
      expect(p1.fixed_price).toBe(110.0)
      expect(p2.fixed_price).toBe(110.0)
      expect(p3.fixed_price).toBe(110.0)
      expect(p1.min_price).toBe(50.0)
      expect(p2.min_price).toBe(50.0)
      expect(p3.min_price).toBe(50.0)
    })
  })

  // 2. Preenchimento Automático por Multiplicador Percentual (Recurso Opcional)
  describe('2. Multiplicador Percentual Opcional vs Ajuste Manual Isolado', () => {
    it('deve aplicar percentual apenas como sugestão de preenchimento e permitir ajuste fino manual posterior', () => {
      const basePrice = 100.0 // Preço 1

      // Sugestão de Preço 2 Terceirizado: -25%
      const suggestedP2 = applyTierMultiplier(basePrice, -25)
      expect(suggestedP2).toBe(75.0)

      // Sugestão de Preço 3 Especial: -10%
      const suggestedP3 = applyTierMultiplier(basePrice, -10)
      expect(suggestedP3).toBe(90.0)

      // Equipe resolve arredondar ou negociar Preço 2 para 72.00 e Preço 3 para 88.00
      const manualP2 = 72.0
      const manualP3 = 88.0

      const productTables = {
        preco_1: { fixed_price: basePrice },
        preco_2: { fixed_price: manualP2 },
        preco_3: { fixed_price: manualP3 },
      }

      expect(productTables.preco_1.fixed_price).toBe(100.0)
      expect(productTables.preco_2.fixed_price).toBe(72.0)
      expect(productTables.preco_3.fixed_price).toBe(88.0)
    })
  })

  // 3. Resolução da Tabela de Preços por Cliente e Vínculo
  describe('3. Resolução da Tabela por Perfil e Vínculo do Cliente', () => {
    it('deve retornar Preço 1 por padrão para cliente sem price_tier ou indefinido', () => {
      const clientWithoutTier: Partial<Client> = {
        id: 'cli_1',
        name: 'Cliente Novo',
      }
      expect(resolveEffectivePriceTier({ client_price_tier: clientWithoutTier.price_tier })).toBe(
        'preco_1',
      )
    })

    it('deve respeitar a tabela configurada no cadastro do cliente (Preço 2 ou Preço 3)', () => {
      expect(resolveEffectivePriceTier({ client_price_tier: 'preco_2' })).toBe('preco_2')
      expect(resolveEffectivePriceTier({ client_price_tier: 'preco_3' })).toBe('preco_3')
    })

    it('visitantes da loja virtual SEMPRE utilizam Preço 1', () => {
      // Visitante anônimo da loja (sem login, sem vínculo)
      const visitorTier = resolveEffectivePriceTier(null)
      expect(visitorTier).toBe('preco_1')
    })

    it('comprador da loja NÃO verificado (unlinked, suggested, rejected) SEMPRE utiliza Preço 1', () => {
      // Status unlinked
      expect(
        resolveEffectivePriceTier({
          crm_link_status: 'unlinked',
          linked_client_price_tier: 'preco_2', // Mesmo que haja um ID tentado, se não está verificado, bloqueia
        }),
      ).toBe('preco_1')

      // Status suggested
      expect(
        resolveEffectivePriceTier({
          crm_link_status: 'suggested',
          linked_client_price_tier: 'preco_3',
        }),
      ).toBe('preco_1')

      // Status rejected
      expect(
        resolveEffectivePriceTier({
          crm_link_status: 'rejected',
          linked_client_price_tier: 'preco_2',
        }),
      ).toBe('preco_1')
    })

    it('comprador da loja com vínculo VERIFICADO (verified_linked) recebe a tabela associada ao cliente do CRM', () => {
      // Cliente verificado pela equipe que é Terceirizado (Preço 2)
      const tierForVerifiedTerceirizado = resolveEffectivePriceTier({
        crm_link_status: 'verified_linked',
        linked_client_price_tier: 'preco_2',
      })
      expect(tierForVerifiedTerceirizado).toBe('preco_2')

      // Cliente verificado Especial (Preço 3)
      const tierForVerifiedEspecial = resolveEffectivePriceTier({
        crm_link_status: 'verified_linked',
        linked_client_price_tier: 'preco_3',
      })
      expect(tierForVerifiedEspecial).toBe('preco_3')

      // Se verificado mas o cadastro no CRM está com Preço 1, recebe Preço 1
      const tierForVerifiedPadrao = resolveEffectivePriceTier({
        crm_link_status: 'verified_linked',
        linked_client_price_tier: 'preco_1',
      })
      expect(tierForVerifiedPadrao).toBe('preco_1')
    })
  })

  // 4. Integração com o Motor de Cálculo de Orçamentos (quoteCalculator.ts)
  describe('4. Motor de Cálculo Preservado com Diferenciação por Tabela', () => {
    it('produto calculado por m² deve aplicar o preço por m² da tabela selecionada sem criar fórmulas paralelas', () => {
      const product: QuoteProduct = {
        id: 'prod_lona_front',
        name: 'Lona Frontlight 440g',
        category: 'Comunicação Visual',
        calc_rule: 'm2',
        fixed_price: 60.0, // R$ 60/m² no Preço 1
        min_price: 30.0,
        is_active: true,
        created: '2026-01-01',
        updated: '2026-01-01',
        price_tables: {
          preco_1: { fixed_price: 60.0, min_price: 30.0 },
          preco_2: { fixed_price: 45.0, min_price: 25.0 }, // R$ 45/m² Terceirizado
          preco_3: { fixed_price: 52.0, min_price: 28.0 }, // R$ 52/m² Especial
        },
      }

      const dimensions = { width: 2.0, height: 1.5, quantity: 2 } // 3m² por peça, 6m² total

      // Cálculo no Preço 1 (Cliente Final)
      const itemP1 = calculateQuoteItem({
        product,
        ...dimensions,
        priceTier: 'preco_1',
      })
      // 3m² * R$ 60 = R$ 180 unitário; 2 peças = R$ 360
      expect(itemP1.applied_unit_price).toBe(180.0)
      expect(itemP1.item_total_sale).toBe(360.0)
      expect(itemP1.applied_price_tier).toBe('preco_1')

      // Cálculo no Preço 2 (Terceirizado)
      const itemP2 = calculateQuoteItem({
        product,
        ...dimensions,
        priceTier: 'preco_2',
      })
      // 3m² * R$ 45 = R$ 135 unitário; 2 peças = R$ 270
      expect(itemP2.applied_unit_price).toBe(135.0)
      expect(itemP2.item_total_sale).toBe(270.0)
      expect(itemP2.applied_price_tier).toBe('preco_2')

      // Cálculo no Preço 3 (Especial)
      const itemP3 = calculateQuoteItem({
        product,
        ...dimensions,
        priceTier: 'preco_3',
      })
      // 3m² * R$ 52 = R$ 156 unitário; 2 peças = R$ 312
      expect(itemP3.applied_unit_price).toBe(156.0)
      expect(itemP3.item_total_sale).toBe(312.0)
      expect(itemP3.applied_price_tier).toBe('preco_3')
    })

    it('produto de preço fixo (unidade) deve aplicar o fixed_price correspondente à tabela', () => {
      const product: QuoteProduct = {
        id: 'prod_cracha',
        name: 'Crachá PVC com Cordão',
        category: 'Identificação',
        calc_rule: 'preco_fixo',
        fixed_price: 25.0,
        min_price: 15.0,
        is_active: true,
        created: '2026-01-01',
        updated: '2026-01-01',
        price_tables: {
          preco_1: { fixed_price: 25.0 },
          preco_2: { fixed_price: 18.0 },
          preco_3: { fixed_price: 21.0 },
        },
      }

      const p1Res = calculateQuoteItem({ product, quantity: 10, priceTier: 'preco_1' })
      expect(p1Res.applied_unit_price).toBe(25.0)
      expect(p1Res.item_total_sale).toBe(250.0)

      const p2Res = calculateQuoteItem({ product, quantity: 10, priceTier: 'preco_2' })
      expect(p2Res.applied_unit_price).toBe(18.0)
      expect(p2Res.item_total_sale).toBe(180.0)

      const p3Res = calculateQuoteItem({ product, quantity: 10, priceTier: 'preco_3' })
      expect(p3Res.applied_unit_price).toBe(21.0)
      expect(p3Res.item_total_sale).toBe(210.0)
    })

    it('deve respeitar a trava de min_price específica de cada tabela quando a peça for muito pequena', () => {
      const product: QuoteProduct = {
        id: 'prod_placa_pequena',
        name: 'Plaquinha Identificadora',
        category: 'Sinalização',
        calc_rule: 'm2',
        fixed_price: 100.0, // R$ 100/m²
        min_price: 20.0, // Mínimo P1: R$ 20
        is_active: true,
        created: '2026-01-01',
        updated: '2026-01-01',
        price_tables: {
          preco_1: { fixed_price: 100.0, min_price: 20.0 },
          preco_2: { fixed_price: 80.0, min_price: 14.0 }, // Mínimo P2: R$ 14
          preco_3: { fixed_price: 90.0, min_price: 17.0 }, // Mínimo P3: R$ 17
        },
      }

      // Peça de 10cm x 10cm (0.01 m²) -> Preço bruto seria:
      // P1: 0.01 * 100 = R$ 1.00 -> Abaixo de 20.00 -> Aplica min_price 20.00
      // P2: 0.01 * 80  = R$ 0.80 -> Abaixo de 14.00 -> Aplica min_price 14.00
      // P3: 0.01 * 90  = R$ 0.90 -> Abaixo de 17.00 -> Aplica min_price 17.00
      const dim = { width: 0.1, height: 0.1, quantity: 1 }

      const itemP1 = calculateQuoteItem({ product, ...dim, priceTier: 'preco_1' })
      expect(itemP1.is_min_price_applied).toBe(true)
      expect(itemP1.applied_unit_price).toBe(20.0)

      const itemP2 = calculateQuoteItem({ product, ...dim, priceTier: 'preco_2' })
      expect(itemP2.is_min_price_applied).toBe(true)
      expect(itemP2.applied_unit_price).toBe(14.0)

      const itemP3 = calculateQuoteItem({ product, ...dim, priceTier: 'preco_3' })
      expect(itemP3.is_min_price_applied).toBe(true)
      expect(itemP3.applied_unit_price).toBe(17.0)
    })
  })

  // 5. Testes de Segurança de Permissão e Endurecimento de API Rules
  describe('5. Simulação de Segurança de API Rules (pocketbase)', () => {
    // Espelho da regra de clientes: apenas admin/gerente podem alterar price_tier
    const checkCanUpdateClientPriceTier = (caller: {
      role_slug?: string
      collectionName?: string
    }) => {
      if (!caller || caller.collectionName !== 'users') {
        throw new Error('403: Acesso negado. Apenas equipe CRM pode gerenciar clientes.')
      }
      const allowedRoles = ['admin', 'gerente']
      if (!caller.role_slug || !allowedRoles.includes(caller.role_slug)) {
        throw new Error(
          '403: Apenas administradores e gerentes podem alterar a tabela de preços do cliente.',
        )
      }
      return true
    }

    it('deve autorizar alteração de price_tier por admin ou gerente', () => {
      expect(checkCanUpdateClientPriceTier({ collectionName: 'users', role_slug: 'admin' })).toBe(
        true,
      )
      expect(checkCanUpdateClientPriceTier({ collectionName: 'users', role_slug: 'gerente' })).toBe(
        true,
      )
    })

    it('deve bloquear alteração de price_tier por vendedor, atendente ou produção (403)', () => {
      expect(() =>
        checkCanUpdateClientPriceTier({ collectionName: 'users', role_slug: 'vendedor' }),
      ).toThrow('403: Apenas administradores e gerentes')

      expect(() =>
        checkCanUpdateClientPriceTier({ collectionName: 'users', role_slug: 'atendente' }),
      ).toThrow('403: Apenas administradores e gerentes')

      expect(() =>
        checkCanUpdateClientPriceTier({ collectionName: 'users', role_slug: 'producao' }),
      ).toThrow('403: Apenas administradores e gerentes')
    })

    it('deve bloquear compradores da loja virtual de alterar campos no CRM (403)', () => {
      expect(() =>
        checkCanUpdateClientPriceTier({ collectionName: 'store_customers', role_slug: 'customer' }),
      ).toThrow('403: Acesso negado. Apenas equipe CRM')
    })
  })
})
