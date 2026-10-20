export interface ShippingQuoteRequest {
  destination_zip: string
  subtotal: number
  total_weight_kg?: number
  items_count?: number
}

export interface ShippingQuoteOption {
  code: string
  name: string
  carrier: 'pickup' | 'local_delivery' | 'correios' | 'melhor_envio'
  service_name: string
  price: number
  estimated_days: number
  available: boolean
  unavailable_reason?: string
  description: string
  is_free?: boolean
}

export interface ShippingStrategy {
  readonly carrier: 'pickup' | 'local_delivery' | 'correios' | 'melhor_envio'
  isConfigured(): boolean
  calculateQuote(request: ShippingQuoteRequest): Promise<ShippingQuoteOption[]>
}

/**
 * Estratégia 1: Retirada no balcão da gráfica (sempre ativa e gratuita)
 */
export class PickupShippingStrategy implements ShippingStrategy {
  readonly carrier = 'pickup' as const

  isConfigured(): boolean {
    return true
  }

  async calculateQuote(_request: ShippingQuoteRequest): Promise<ShippingQuoteOption[]> {
    return [
      {
        code: 'pickup_store',
        name: 'Retirada no Balcão da Gráfica',
        carrier: 'pickup',
        service_name: 'Balcão LaLetra',
        price: 0.0,
        estimated_days: 0,
        available: true,
        description: 'Retire diretamente na nossa unidade sem nenhum custo de frete.',
        is_free: true,
      },
    ]
  }
}

/**
 * Estratégia 2: Entrega Local Própria (regra com taxa configurável e frete grátis promocional)
 */
export class LocalDeliveryShippingStrategy implements ShippingStrategy {
  readonly carrier = 'local_delivery' as const

  private standardFee: number
  private freeThreshold: number

  constructor(options?: { standardFee?: number; freeThreshold?: number }) {
    this.standardFee = options?.standardFee ?? 25.0
    this.freeThreshold = options?.freeThreshold ?? 350.0
  }

  isConfigured(): boolean {
    return true
  }

  async calculateQuote(request: ShippingQuoteRequest): Promise<ShippingQuoteOption[]> {
    const isFree = request.subtotal >= this.freeThreshold
    const price = isFree ? 0.0 : this.standardFee

    return [
      {
        code: 'local_standard',
        name: 'Entrega Própria LaLetra',
        carrier: 'local_delivery',
        service_name: 'Entrega Padrão Gráfica',
        price: Number(price.toFixed(2)),
        estimated_days: 2,
        available: true,
        description: isFree
          ? `Frete Grátis promocional (pedidos acima de R$ ${this.freeThreshold.toFixed(2)})`
          : `Entrega rápida em endereço cadastrado por R$ ${this.standardFee.toFixed(2)}`,
        is_free: isFree,
      },
    ]
  }
}

/**
 * Estratégia 3: Correios (Preparada para PAC / SEDEX, porém INATIVA sem credenciais reais)
 * REGRA RIGOROSA: Não gerar cotações simuladas ou fictícias em pedidos de produção.
 */
export class CorreiosShippingStrategy implements ShippingStrategy {
  readonly carrier = 'correios' as const
  private apiKey?: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey
  }

  isConfigured(): boolean {
    // Só está configurado se houver token/credencial de API configurada no ambiente
    return Boolean(this.apiKey && this.apiKey.trim().length > 0)
  }

  async calculateQuote(_request: ShippingQuoteRequest): Promise<ShippingQuoteOption[]> {
    if (!this.isConfigured()) {
      return [
        {
          code: 'correios_pac',
          name: 'Correios PAC',
          carrier: 'correios',
          service_name: 'PAC',
          price: 0,
          estimated_days: 0,
          available: false,
          unavailable_reason:
            'Serviço dos Correios indisponível no momento (integração aguarda credencial no painel admin).',
          description: 'Cotação oficial indisponível.',
        },
        {
          code: 'correios_sedex',
          name: 'Correios SEDEX',
          carrier: 'correios',
          service_name: 'SEDEX',
          price: 0,
          estimated_days: 0,
          available: false,
          unavailable_reason:
            'Serviço dos Correios indisponível no momento (integração aguarda credencial no painel admin).',
          description: 'Cotação oficial indisponível.',
        },
      ]
    }

    // Quando configurado com API real, implementa chamada HTTP para os Correios
    return []
  }
}

/**
 * Estratégia 4: Melhor Envio (Preparada para gateway de frete multi-transportadora, INATIVA sem credencial)
 * REGRA RIGOROSA: Não usar valores fictícios.
 */
export class MelhorEnvioShippingStrategy implements ShippingStrategy {
  readonly carrier = 'melhor_envio' as const
  private apiToken?: string

  constructor(apiToken?: string) {
    this.apiToken = apiToken
  }

  isConfigured(): boolean {
    return Boolean(this.apiToken && this.apiToken.trim().length > 0)
  }

  async calculateQuote(_request: ShippingQuoteRequest): Promise<ShippingQuoteOption[]> {
    if (!this.isConfigured()) {
      return [
        {
          code: 'melhor_envio_gateway',
          name: 'Melhor Envio (Jadlog / Azul Cargo)',
          carrier: 'melhor_envio',
          service_name: 'Multi-transportadoras',
          price: 0,
          estimated_days: 0,
          available: false,
          unavailable_reason:
            'Integração Melhor Envio desativada (aguarda credencial de API em produção).',
          description: 'Cotação dinâmica indisponível sem token ativo.',
        },
      ]
    }

    return []
  }
}

/**
 * Gerenciador de Fretes da Loja
 */
export class ShippingManager {
  private strategies: ShippingStrategy[]

  constructor(strategies?: ShippingStrategy[]) {
    this.strategies = strategies || [
      new PickupShippingStrategy(),
      new LocalDeliveryShippingStrategy(),
      new CorreiosShippingStrategy(undefined),
      new MelhorEnvioShippingStrategy(undefined),
    ]
  }

  /**
   * Retorna apenas as opções disponíveis e cotadas legitimamente para checkout
   */
  async getAvailableShippingOptions(request: ShippingQuoteRequest): Promise<ShippingQuoteOption[]> {
    const allQuotes: ShippingQuoteOption[] = []

    for (const strategy of this.strategies) {
      try {
        const quotes = await strategy.calculateQuote(request)
        for (const q of quotes) {
          // Só retorna para o usuário final as opções que estão ativas e com disponibilidade real
          if (q.available && q.price >= 0) {
            allQuotes.push(q)
          }
        }
      } catch (err) {
        console.warn(`Erro ao calcular cotação para estratégia ${strategy.carrier}:`, err)
      }
    }

    return allQuotes
  }

  /**
   * Retorna todas as opções (incluindo diagnósticos de inativas para telas administrativas)
   */
  async getAllShippingDiagnostics(request: ShippingQuoteRequest): Promise<ShippingQuoteOption[]> {
    const allQuotes: ShippingQuoteOption[] = []
    for (const strategy of this.strategies) {
      const quotes = await strategy.calculateQuote(request)
      allQuotes.push(...quotes)
    }
    return allQuotes
  }
}

export const shippingManager = new ShippingManager()
