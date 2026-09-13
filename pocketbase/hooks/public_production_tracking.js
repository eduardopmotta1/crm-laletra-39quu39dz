/**
 * Hook para consulta pública do acompanhamento de produção por tracking_token.
 * NÃO requer autenticação.
 * Endpoint: GET /backend/v1/crm/public-production/{tracking_token}
 *
 * Regras e Segurança:
 * 1. Recebe exclusivamente tracking_token na rota (sem filtros arbitrários, sem order_id ou client_id).
 * 2. Busca production_order com acesso privilegiado do backend ($app).
 * 3. Se não existir → HTTP 404.
 * 4. Retorna APENAS dados seguros para o cliente:
 *    - Pedido: order_number, stage_internal_id, stage_name, created, expected_date (promised_deadline / estimated_delivery_date),
 *              tracking_code, requires_art_approval, art_approved, art_approved_at, product, description, delivery_type, client_name.
 *    - NÃO RETORNAR: total_value, custo, margem, quote_id, attendance_id, client_id, assigned_to,
 *                    sales_rep_id, production_rep_id, deal_origin_id, notas internas (notes).
 * 5. Provas de Arte (production_proofs do pedido):
 *    - Apenas daquele pedido: id, version_number, status, proof_file (nomes e URLs seguras de arquivo),
 *      proof_url, client_comment, feedback_notes, created, approved_at.
 *    - NÃO RETORNAR: sent_by, internal user ids, auditoria interna.
 * 6. Etapas visíveis para a timeline pública:
 *    - id, internal_id, name, description, order_index, color.
 */
routerAdd('GET', '/backend/v1/crm/public-production/{tracking_token}', (c) => {
  let token = ''
  try {
    token = c.request.pathValue('tracking_token')
    if (!token || token.trim() === '') {
      return c.json(400, { error: 'Token de acompanhamento inválido ou não fornecido.' })
    }

    // 1. Buscar production_order exclusivamente por tracking_token com acesso privilegiado do backend
    const orders = $app.findRecordsByFilter(
      'production_orders',
      'tracking_token = {:token}',
      '-created',
      1,
      0,
      { token: token.trim() },
    )

    if (!orders || orders.length === 0) {
      return c.json(404, { error: 'Pedido não localizado para este link de acompanhamento.' })
    }

    const order = orders[0]
    const orderId = order.id

    // 2. Buscar etapas de produção visíveis para compor a timeline pública da página
    let publicStages = []
    try {
      const stagesRecords = $app.findRecordsByFilter(
        'production_stages',
        'is_visible = true',
        'order_index',
        100,
        0,
      )

      if (stagesRecords && stagesRecords.length > 0) {
        publicStages = stagesRecords.map((st) => ({
          id: st.id,
          internal_id: st.getString('internal_id') || '',
          name: st.getString('name') || '',
          description: st.getString('description') || '',
          order_index: st.getInt('order_index') || 0,
          color: st.getString('color') || '',
        }))
      }
    } catch (stagesErr) {
      console.warn('[PublicProductionTracking] Erro ao carregar etapas de produção:', stagesErr)
    }

    // 3. Buscar histórico de provas de arte estritamente vinculadas a este pedido
    let publicProofs = []
    try {
      const proofsRecords = $app.findRecordsByFilter(
        'production_proofs',
        'order_id = {:orderId}',
        'version_number',
        100,
        0,
        { orderId: orderId },
      )

      if (proofsRecords && proofsRecords.length > 0) {
        const proofsCollection = $app.findCollectionByNameOrId('production_proofs')
        const collectionIdOrName = proofsCollection ? proofsCollection.id : 'production_proofs'

        // Determinar a URL base absoluta do backend PocketBase
        // Preferência para PB_INSTANCE_URL ou appUrl configurado no sistema
        let pbHost = $os.getenv('PB_INSTANCE_URL') || ''
        if (!pbHost) {
          try {
            const settings = $app.settings()
            if (settings && settings.meta && settings.meta.appUrl) {
              pbHost = settings.meta.appUrl
            }
          } catch (_) {}
        }
        if (!pbHost) {
          pbHost = 'https://crm-grafica-whatsapp-7b1a5.shrd00.internal.goskip.dev'
        }
        const cleanPbHost = pbHost.replace(/\/+$/, '')

        publicProofs = proofsRecords.map((prf) => {
          // Extrair arquivos de prova (proof_file pode ser string ou array)
          let fileList = []
          try {
            const rawFile = prf.get('proof_file')
            if (typeof rawFile === 'string' && rawFile.trim() !== '') {
              fileList = [rawFile.trim()]
            } else if (Array.isArray(rawFile)) {
              fileList = rawFile.filter((f) => typeof f === 'string' && f.trim() !== '')
            }
          } catch (_) {
            const strFile = prf.getString('proof_file')
            if (strFile) {
              fileList = [strFile]
            }
          }

          // Montar lista de arquivos com URL ABSOLUTA direta do PocketBase
          // Formato: https://<pocketbase-host>/api/files/<collection-id>/<record-id>/<filename>
          const filesWithUrls = fileList.map((fileName) => ({
            name: fileName,
            url: `${cleanPbHost}/api/files/${collectionIdOrName}/${prf.id}/${fileName}`,
          }))

          return {
            id: prf.id,
            version_number: prf.getInt('version_number') || 1,
            status: prf.getString('status') || 'aguardando_aprovacao',
            proof_file: fileList,
            files: filesWithUrls,
            proof_url: prf.getString('proof_url') || '',
            feedback_notes: prf.getString('feedback_notes') || '',
            client_comment: prf.getString('client_comment') || '',
            created: prf.getString('created') || '',
            sent_at: prf.getString('sent_at') || '',
            approved_at: prf.getString('approved_at') || '',
            decision_at: prf.getString('approved_at') || '',
          }
        })
      }
    } catch (proofsErr) {
      console.warn('[PublicProductionTracking] Erro ao carregar provas de arte:', proofsErr)
    }

    // 4. Montar payload do pedido contendo estritamente dados permitidos para o cliente público
    const safeOrderData = {
      id: order.id,
      order_number: order.getString('order_number') || '',
      tracking_token: order.getString('tracking_token') || '',
      client_name: order.getString('client_name') || '',
      product: order.getString('product') || '',
      description: order.getString('description') || '',
      delivery_type: order.getString('delivery_type') || 'retirada',
      tracking_code: order.getString('tracking_code') || '',
      expected_date:
        order.getString('promised_deadline') || order.getString('estimated_delivery_date') || '',
      promised_deadline: order.getString('promised_deadline') || '',
      estimated_delivery_date: order.getString('estimated_delivery_date') || '',
      stage_internal_id: order.getString('stage_internal_id') || 'order_received',
      stage_name: order.getString('stage_name') || 'Pedido recebido',
      requires_art_approval: order.getBool('requires_art_approval') === true,
      art_approved: order.getBool('art_approved') === true,
      art_approved_at: order.getString('art_approved_at') || '',
      approved_proof_id: order.getString('approved_proof_id') || '',
      is_completed: order.getBool('is_completed') === true,
      created: order.getString('created') || '',
    }

    return c.json(200, {
      success: true,
      data: {
        order: safeOrderData,
        stages: publicStages,
        proofs: publicProofs,
      },
    })
  } catch (err) {
    const maskedToken = token ? token.substring(0, 4) + '...' + token.slice(-4) : 'nenhum'
    console.error(
      `[PublicProductionTracking] Token: ${maskedToken} | Erro: ${err && err.message ? err.message : String(err)}`,
    )
    return c.json(500, {
      error: 'Não foi possível carregar o acompanhamento do pedido. Tente novamente mais tarde.',
    })
  }
})
