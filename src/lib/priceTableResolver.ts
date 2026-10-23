import type {
  PriceTierKey,
  ProductPriceTables,
  PriceTableConfig,
  QuoteProduct,
} from '@/types/quotes'

export interface ClientPriceContext {
  crm_link_status?: 'unlinked' | 'suggested' | 'verified_linked' | 'rejected' | null
  linked_client_price_tier?: PriceTierKey | null
  client_price_tier?: PriceTierKey | null
}

export const PRICE_TIER_LABELS: Record<PriceTierKey, { title: string; subtitle: string }> = {
  preco_1: {
    title: 'Preço 1',
    subtitle: 'Cliente Final (Padrão)',
  },
  preco_2: {
    title: 'Preço 2',
    subtitle: 'Terceirizado',
  },
  preco_3: {
    title: 'Preço 3',
    subtitle: 'Especial',
  },
}

/**
 * Resolve a tabela de preços comercial aplicável conforme regras do negócio:
 * 1. Visitantes e clientes da loja sem vínculo verificado SEMPRE utilizam 'preco_1'
 * 2. Compradores da loja utilizam a tabela do CRM SOMENTE quando crm_link_status = 'verified_linked'
 * 3. No CRM direto, se o cliente possui price_tier configurado ('preco_1' | 'preco_2' | 'preco_3'), utiliza-o
 * 4. Padrão absoluto para qualquer caso ausente/nulo/inválido: 'preco_1'
 */
export function resolveEffectivePriceTier(context?: ClientPriceContext | null): PriceTierKey {
  if (!context) {
    return 'preco_1'
  }

  // Se veio do contexto de loja virtual (store_customers):
  if (context.crm_link_status !== undefined) {
    if (context.crm_link_status === 'verified_linked') {
      const tier = context.linked_client_price_tier || context.client_price_tier
      if (tier === 'preco_2' || tier === 'preco_3') {
        return tier
      }
    }
    // Não verificado, não vinculado, sugerido ou rejeitado: SEMPRE preco_1
    return 'preco_1'
  }

  // Se veio do contexto direto do CRM (clientes):
  const clientTier = context.client_price_tier
  if (clientTier === 'preco_2' || clientTier === 'preco_3') {
    return clientTier
  }

  return 'preco_1'
}

/**
 * Normaliza e obtém as configurações da tabela selecionada para um QuoteProduct:
 * Se o produto não possui a tabela ou o campo específico, herda/comporta-se como Preço 1
 */
export function getProductTierConfig(
  product?: Partial<QuoteProduct> | null,
  tier: PriceTierKey = 'preco_1',
): PriceTableConfig {
  if (!product) {
    return {}
  }

  // Preço 1 base do produto (campos nativos ou tabela preco_1)
  const p1Base: PriceTableConfig = {
    fixed_price:
      product.price_tables?.preco_1?.fixed_price ??
      (typeof product.fixed_price === 'number' ? product.fixed_price : undefined),
    min_price:
      product.price_tables?.preco_1?.min_price ??
      (typeof product.min_price === 'number' ? product.min_price : undefined),
    material_factor: product.price_tables?.preco_1?.material_factor ?? 1,
    acrescimos_factor: product.price_tables?.preco_1?.acrescimos_factor ?? 1,
  }

  if (tier === 'preco_1') {
    return p1Base
  }

  const requestedTierConfig = product.price_tables?.[tier]
  if (!requestedTierConfig) {
    // Tabela ausente = herda comportamento de Preço 1
    return p1Base
  }

  return {
    fixed_price: requestedTierConfig.fixed_price ?? p1Base.fixed_price,
    min_price: requestedTierConfig.min_price ?? p1Base.min_price,
    material_factor: requestedTierConfig.material_factor ?? p1Base.material_factor ?? 1,
    acrescimos_factor: requestedTierConfig.acrescimos_factor ?? p1Base.acrescimos_factor ?? 1,
  }
}

/**
 * Utilitário para cálculo de sugestão automática por multiplicador percentual.
 * Percentual multiplicador é recurso OPCIONAL de preenchimento automático, NUNCA obrigação.
 * Após gerar um preço por percentual, o usuário pode ajustar manualmente o valor absoluto
 * sem que isso afete as outras tabelas.
 */
export function applyTierMultiplier(
  baseValue: number,
  percentageAdjustment: number, // ex: -15 para -15%, +10 para +10%
): number {
  if (!baseValue || isNaN(baseValue)) return 0
  const factor = 1 + percentageAdjustment / 100
  const adjusted = baseValue * factor
  return Number(Math.max(0, adjusted).toFixed(2))
}
