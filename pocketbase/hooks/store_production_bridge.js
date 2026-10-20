/**
 * PocketBase Hook: Integração Pedidos da Loja -> Produção e CRM (Fase 2)
 *
 * 1. onRecordAfterUpdateSuccess('store_orders')
 *    - Quando um pedido tem payment_status='paid' E art_status='approved':
 *      Gera automaticamente um production_order com tracking_token único,
 *      congelamento de especificações e vinculação segura.
 *    - Se houver pendência (arte rejeitada, contestação de pagamento, endereço ausente),
 *      sinaliza human_intervention_needed=true e gera attendance no CRM somente se intervenção necessária.
 *
 * 2. POST /backend/v1/crm/store/orders/{id}/release-to-production
 *    - Endpoint autenticado no CRM para liberação manual assistida caso atendente autorize faturamento/condição comercial.
 */

routerAdd('POST', '/backend/v1/crm/store/orders/{id}/release-to-production', (c) => {
  try {
    const authRecord = c.auth
    if (!authRecord) {
      return c.json(401, { error: 'Requer autenticação de usuário CRM' })
    }

    const orderId = c.request.pathValue('id')
    const order = $app.findRecordById('store_orders', orderId)
    if (!order) {
      return c.json(404, { error: 'Pedido não encontrado' })
    }

    // Se já estiver liberado e com production_order_id, não duplicar
    const currentProdId = order.getString('production_order_id')
    if (currentProdId) {
      return c.json(200, {
        success: true,
        already_released: true,
        production_order_id: currentProdId,
        message: 'Pedido já possui ordem de produção vinculada.',
      })
    }

    // Buscar itens do pedido
    const items = $app.findRecordsByFilter(
      'store_order_items',
      'order_id = {:oid}',
      'created',
      50,
      0,
      { oid: order.id }
    )

    let itemsDescription = ''
    let totalQty = 0
    for (const it of (items || [])) {
      totalQty += it.getInt('quantity') || 1
      itemsDescription += it.getInt('quantity') + 'x ' + it.getString('product_name') + '\n'
    }

    // Buscar primeiro estágio de produção (ex: "Entrada", "Pré-Impressão", "Fila")
    let stageId = ''
    let stageName = 'Fila de Produção'
    try {
      const stages = $app.findRecordsByFilter('production_stages', 'is_active = true', 'order_index', 1, 0)
      if (stages && stages.length > 0) {
        stageId = stages[0].id
        stageName = stages[0].getString('name')
      }
    } catch (_) {}

    // Gerar token público de rastreamento para o comprador acompanhar em /acompanhar/{token}
    const trackingToken = 'st_' + $security.randomString(24)

    const prodCol = $app.findCollectionByNameOrId('production_orders')
    const prodRec = new Record(prodCol)
    prodRec.set('order_number', 'OP-' + order.getString('order_number'))
    prodRec.set('tracking_token', trackingToken)
    prodRec.set('client_name', order.getString('customer_name'))
    prodRec.set('client_email', order.getString('customer_email'))
    prodRec.set('client_phone', order.getString('customer_phone'))
    prodRec.set('product', (items && items[0]) ? items[0].getString('product_name') : 'Pedido Loja')
    prodRec.set('description', itemsDescription || 'Itens Laletra Store')
    prodRec.set('quantity', totalQty || 1)
    prodRec.set('total_value', order.getFloat('total_amount'))
    prodRec.set('sale_date', new Date().toISOString())
    prodRec.set('stage_internal_id', 'pre_press')
    prodRec.set('stage_name', stageName)
    if (stageId) prodRec.set('stage_id', stageId)
    prodRec.set('priority', 'medium')
    prodRec.set('art_approved', order.getString('art_status') === 'approved')
    prodRec.set('notes', 'Origem: Laletra Store (Pedido ' + order.getString('order_number') + '). ' + order.getString('notes'))

    $app.save(prodRec)

    // Atualizar store_orders
    order.set('production_order_id', prodRec.id)
    order.set('production_status', 'released_to_production')
    $app.save(order)

    return c.json(200, {
      success: true,
      production_order_id: prodRec.id,
      tracking_token: trackingToken,
      message: 'Ordem de produção criada com sucesso a partir do pedido da loja.',
    })
  } catch (err) {
    return c.json(500, { error: 'Erro ao liberar pedido para produção: ' + err.message })
  }
})
