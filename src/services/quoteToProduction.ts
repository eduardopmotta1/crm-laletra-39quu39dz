import type { Quote, QuoteCalculationItem } from '@/types/quotes'
import type { ProductionDeliveryType, Priority, ProductionOrder } from '@/types/crm'
import { productionService } from '@/services/production'
import { dealsService } from '@/services/deals'
import { formatCurrency, formatDimension } from '@/lib/sla'
import pb from '@/lib/pocketbase/client'

export interface QuoteItemsProductionSnapshot {
  productSummary: string
  descriptionSummary: string
  totalQuantity: number
  dimensionsSummary: string
  totalValue: number
}

/**
 * Extracts pure, snapshot data directly from quote.items and quote.total
 * WITHOUT recalculating or querying the current catalog prices/materials.
 */
export function extractProductionOrderDataFromQuote(quote: Quote): QuoteItemsProductionSnapshot {
  const items: QuoteCalculationItem[] = Array.isArray(quote.items) ? quote.items : []
  const totalValue =
    quote.final_total !== undefined &&
    quote.final_total !== null &&
    !isNaN(Number(quote.final_total))
      ? Number(quote.final_total)
      : Number(quote.total_sale || 0)

  if (items.length === 0) {
    return {
      productSummary: 'Orçamento sem itens discriminados',
      descriptionSummary: quote.notes || '',
      totalQuantity: 1,
      dimensionsSummary: '',
      totalValue,
    }
  }

  // 1. Build Product Summary (e.g. "Banner Premium" or "3x Banner Premium, 1x Cartão de Visita")
  const productNames = items.map((it) => {
    const qty = it.quantity && it.quantity > 1 ? `${it.quantity}x ` : ''
    return `${qty}${it.product_name || 'Item'}`.trim()
  })
  const productSummary = productNames.join(', ')

  // 2. Build Technical Description Summary from exact snapshot items
  const descLines: string[] = []
  items.forEach((it, idx) => {
    const title = `${idx + 1}. ${it.product_name || 'Produto'}`
    const details: string[] = []

    if (it.quantity) {
      details.push(`Quantidade: ${it.quantity}`)
    }

    // Dimensions
    if (it.width && it.height && it.width > 0 && it.height > 0) {
      details.push(
        `Medidas: ${formatDimension(it.width)} x ${formatDimension(it.height)} m (${it.total_area || (it.width * it.height * it.quantity).toFixed(2)} m²)`,
      )
    } else if (it.linear_meters && it.linear_meters > 0) {
      details.push(`Medidas: ${formatDimension(it.linear_meters)} m lineares`)
    }

    // Material
    if (it.material_name) {
      details.push(`Material: ${it.material_name}`)
    }

    // Additionals / Acabamentos
    if (Array.isArray(it.additionals) && it.additionals.length > 0) {
      const adds = it.additionals
        .map((a) => (a.quantity && a.quantity > 1 ? `${a.name} (${a.quantity} un)` : a.name))
        .filter(Boolean)
      if (adds.length > 0) {
        details.push(`Acabamentos/Adicionais: ${adds.join(', ')}`)
      }
    }

    // Item Unit / Total values
    const unitVal = it.applied_unit_price || it.calculated_unit_price || 0
    const totalItemVal =
      it.item_total_sale !== undefined && it.item_total_sale !== null
        ? it.item_total_sale
        : unitVal * (it.quantity || 1)
    details.push(
      `Valor Unit: ${formatCurrency(unitVal)} | Total Item: ${formatCurrency(totalItemVal)}`,
    )

    if (it.notes && it.notes.trim()) {
      details.push(`Observação do item: ${it.notes.trim()}`)
    }

    descLines.push(`${title}\n  - ${details.join('\n  - ')}`)
  })

  // 3. Dimensions Summary
  const dimensionsList = items
    .map((it) => {
      if (it.width && it.height && it.width > 0 && it.height > 0) {
        return `${formatDimension(it.width)}x${formatDimension(it.height)}m`
      }
      if (it.linear_meters && it.linear_meters > 0) {
        return `${formatDimension(it.linear_meters)}m`
      }
      return null
    })
    .filter(Boolean)
  const dimensionsSummary = dimensionsList.join(', ')

  // 4. Total Quantity
  const totalQuantity = items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0)

  return {
    productSummary,
    descriptionSummary: descLines.join('\n\n'),
    totalQuantity: totalQuantity > 0 ? totalQuantity : 1,
    dimensionsSummary,
    totalValue,
  }
}

export interface CreateOrderFromQuoteOptions {
  quote: Quote
  promisedDeadline?: string
  salesRepId?: string
  productionRepId?: string
  priority?: Priority
  deliveryType?: ProductionDeliveryType
  trackingCode?: string
  productionNotes?: string
  attachments?: File[]
}

export const quoteToProductionService = {
  /**
   * Checks if a production order already exists for this exact quote.id or quote.code
   */
  async findExistingOrderForQuote(quoteId: string, quoteCode?: string) {
    return await productionService.getByQuoteId(quoteId, quoteCode)
  },

  /**
   * Transforms an approved Quote into a ProductionOrder with full validation,
   * immutable quote values and safe duplicate prevention.
   */
  async createProductionOrderFromQuote(options: CreateOrderFromQuoteOptions) {
    const { quote } = options

    // 1. Re-validate quote from backend to guarantee exact current status is 'aprovado'
    const freshQuote = await pb.collection('quotes').getOne<Quote>(quote.id, {
      expand: 'client_id,attendance_id,user_id',
    })

    if (!freshQuote) {
      throw new Error(`Orçamento #${quote.code || quote.id} não foi encontrado no sistema.`)
    }

    if (freshQuote.status !== 'aprovado') {
      throw new Error(
        `Apenas orçamentos com status "Aprovado" podem ser convertidos em pedido de produção. Status atual: "${freshQuote.status}".`,
      )
    }

    // 2. Prevent duplicate creation by checking if a production order is already linked to this quote.id / code
    const existingOrder = await this.findExistingOrderForQuote(freshQuote.id, freshQuote.code)
    if (existingOrder) {
      // Confirm that the existing order matches the quote and attendance context before archiving
      const matchesQuote =
        existingOrder.quote_id === freshQuote.id ||
        existingOrder.notes?.includes(`[QUOTE_ID:${freshQuote.id}]`) ||
        existingOrder.description?.includes(`[QUOTE_ID:${freshQuote.id}]`) ||
        (freshQuote.code &&
          (existingOrder.notes?.includes(`[ORC:${freshQuote.code}]`) ||
            existingOrder.description?.includes(`[ORC:${freshQuote.code}]`)))

      const matchesClient =
        !freshQuote.client_id ||
        !existingOrder.client_id ||
        existingOrder.client_id === freshQuote.client_id

      const matchesAttendance =
        !freshQuote.attendance_id ||
        !existingOrder.attendance_id ||
        existingOrder.attendance_id === freshQuote.attendance_id

      if (matchesQuote && matchesClient && matchesAttendance && freshQuote.attendance_id) {
        try {
          const existingAtt = await pb.collection('attendances').getOne(freshQuote.attendance_id)
          if (existingAtt && !existingAtt.is_archived) {
            const snapshot = extractProductionOrderDataFromQuote(freshQuote)
            await dealsService.completeAndArchive({
              attendanceId: freshQuote.attendance_id,
              clientId: freshQuote.client_id || existingAtt.client_id,
              result: 'Venda fechada',
              quoteValue: snapshot.totalValue,
              productInterest: snapshot.productSummary,
              finalNotes: `Atendimento arquivado automaticamente após validação de pedido de produção existente (${existingOrder.order_number}) para o orçamento ${freshQuote.code}.`,
            })
          }
        } catch (archiveErr) {
          console.warn('Falha ao arquivar atendimento para pedido existente:', archiveErr)
        }
      }

      return {
        isExisting: true,
        order: existingOrder,
        message: `Pedido já criado anteriormente: ${existingOrder.order_number}`,
      }
    }

    // 3. Extract exact snapshot data from quote
    const snapshot = extractProductionOrderDataFromQuote(freshQuote)

    // Build internal notes carrying the quote link tag for compatibility
    const trackingTag = `[QUOTE_ID:${freshQuote.id}] [ORC:${freshQuote.code}]`
    const combinedNotes = [
      options.productionNotes?.trim() || '',
      freshQuote.notes?.trim() ? `Obs. comercial do orçamento: ${freshQuote.notes.trim()}` : '',
      `Origem: Orçamento ${freshQuote.code} aprovado em ${freshQuote.approved_at ? new Date(freshQuote.approved_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')}. ${trackingTag}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    // 4. Create the Production Order using productionService.create
    // Handles race condition & unique constraint on quote_id or order_number gracefully
    let createdOrder: ProductionOrder | null = null
    try {
      createdOrder = await productionService.create({
        clientId: freshQuote.client_id || '',
        attendanceId: freshQuote.attendance_id || undefined,
        quoteId: freshQuote.id,
        clientName: freshQuote.client_name,
        clientPhone: freshQuote.client_phone || '',
        clientEmail: freshQuote.client_email || undefined,
        product: snapshot.productSummary,
        description: snapshot.descriptionSummary,
        quantity: snapshot.totalQuantity,
        dimensions: snapshot.dimensionsSummary || undefined,
        totalValue: snapshot.totalValue,
        salesRepId:
          options.salesRepId || freshQuote.user_id || pb.authStore.record?.id || undefined,
        productionRepId: options.productionRepId || undefined,
        promisedDeadline: options.promisedDeadline,
        deliveryType: options.deliveryType || 'retirada',
        priority: options.priority || 'media',
        notes: combinedNotes,
        attachments: options.attachments,
      })
    } catch (createErr: any) {
      // Check if another concurrent request created the order for this quote first
      const quoteError = createErr?.data?.quote_id || createErr?.response?.data?.quote_id
      const isQuoteUniqueConflict =
        createErr?.status === 400 &&
        (quoteError?.code === 'validation_not_unique' ||
          (typeof quoteError?.message === 'string' &&
            quoteError.message.toLowerCase().includes('unique')))

      if (isQuoteUniqueConflict || createErr?.status === 400) {
        const raceWinnerOrder = await this.findExistingOrderForQuote(freshQuote.id, freshQuote.code)
        if (raceWinnerOrder) {
          return {
            isExisting: true,
            order: raceWinnerOrder,
            message: `Pedido já criado anteriormente: ${raceWinnerOrder.order_number}`,
          }
        }
      }

      throw createErr
    }

    // 5. Confirm that the production order record was genuinely created and fetch it
    const confirmedOrder = await pb
      .collection('production_orders')
      .getOne<ProductionOrder>(createdOrder.id)

    if (!confirmedOrder || !confirmedOrder.id) {
      throw new Error(
        'Falha na confirmação da criação do pedido de produção no banco de dados. O atendimento não foi arquivado.',
      )
    }

    // 6. Confirm links: quote_id (official source), client_id, and attendance_id
    const orderHasQuoteLink =
      confirmedOrder.quote_id === freshQuote.id ||
      (confirmedOrder.notes && confirmedOrder.notes.includes(`[QUOTE_ID:${freshQuote.id}]`)) ||
      (confirmedOrder.description &&
        confirmedOrder.description.includes(`[QUOTE_ID:${freshQuote.id}]`))

    if (!orderHasQuoteLink) {
      throw new Error(
        'Falha na validação do vínculo do pedido de produção com o orçamento (quote_id). O atendimento não foi arquivado.',
      )
    }

    if (freshQuote.client_id && confirmedOrder.client_id !== freshQuote.client_id) {
      throw new Error(
        'Falha na validação do vínculo do pedido de produção com o cliente (client_id). O atendimento não foi arquivado.',
      )
    }

    if (freshQuote.attendance_id && confirmedOrder.attendance_id !== freshQuote.attendance_id) {
      throw new Error(
        'Falha na validação do vínculo do pedido de produção com o atendimento comercial (attendance_id). O atendimento não foi arquivado.',
      )
    }

    // 7. SOMENTE APÓS CONFIRMAÇÃO DO PEDIDO DE PRODUÇÃO: Arquivar o atendimento comercial
    // Localizado EXCLUSIVAMENTE por freshQuote.attendance_id
    if (freshQuote.attendance_id) {
      try {
        await dealsService.completeAndArchive({
          attendanceId: freshQuote.attendance_id,
          clientId: freshQuote.client_id,
          result: 'Venda fechada',
          quoteValue: snapshot.totalValue,
          productInterest: snapshot.productSummary,
          finalNotes: `Atendimento concluído e arquivado automaticamente após a criação confirmada do pedido de produção ${confirmedOrder.order_number} vinculado ao orçamento ${freshQuote.code}.`,
        })
      } catch (archiveErr: any) {
        console.error(
          `Erro ao arquivar atendimento ${freshQuote.attendance_id} após criação do pedido ${confirmedOrder.order_number}:`,
          archiveErr,
        )
      }
    }

    // 8. Register audit log
    try {
      const currentUser = pb.authStore.record
      await pb.collection('audit_logs').create({
        user_id: currentUser ? currentUser.id : null,
        user_name: currentUser ? currentUser.name || currentUser.email || '' : '',
        user_email: currentUser ? currentUser.email || '' : '',
        action: 'gerar_pedido_producao',
        module: 'production',
        record_id: confirmedOrder.id,
        record_title: confirmedOrder.order_number,
        details: `Pedido de produção ${confirmedOrder.order_number} gerado com sucesso a partir do orçamento aprovado ${freshQuote.code} (Valor: ${formatCurrency(snapshot.totalValue)}). Atendimento comercial ${freshQuote.attendance_id || 'N/A'} arquivado após sucesso.`,
        previous_value: {
          quote_id: freshQuote.id,
          quote_code: freshQuote.code,
          quote_status: freshQuote.status,
        },
        new_value: {
          order_id: confirmedOrder.id,
          order_number: confirmedOrder.order_number,
          client_id: freshQuote.client_id,
          attendance_id: freshQuote.attendance_id,
          total_value: snapshot.totalValue,
        },
        ip_address: '',
      })
    } catch (auditErr) {
      console.warn('Falha ao registrar audit_log de geração do pedido:', auditErr)
    }

    return {
      isExisting: false,
      order: confirmedOrder,
      message: `Pedido ${confirmedOrder.order_number} criado com sucesso!`,
    }
  },
}
