migrate(
  (app) => {
    // Escopo exclusivo: Correção pontual de dados do caso legado de Roseni Santos da Silva
    // ZERO ALTERAÇÃO DE SCHEMA. APENAS ESCRITA DE DADOS NOS REGISTROS ALVO.
    // Alvos:
    // - Cliente: 3qfex7l7yoecqfx (Roseni Santos da Silva)
    // - Attendance correto/original: dib9x0x8spccmn3
    // - Attendance duplicado/incorreto: 188rk7ksbii7hhu
    // - Pedido: #001864

    // PASSO 1: Validação de segurança estrita pré-escrita
    const order = app.findFirstRecordByData('production_orders', 'order_number', '#001864')
    if (!order) {
      throw new Error('[Migration 0066 ABORTED] Pedido #001864 não encontrado')
    }

    const orderAttendanceId = order.getString('attendance_id')
    const orderIsCompleted = order.getBool('is_completed')

    if (orderAttendanceId !== 'dib9x0x8spccmn3') {
      throw new Error(
        '[Migration 0066 ABORTED] #001864.attendance_id (' +
          orderAttendanceId +
          ') não confere com dib9x0x8spccmn3',
      )
    }

    if (orderIsCompleted === true) {
      throw new Error(
        '[Migration 0066 ABORTED] #001864 já está marcado como concluído (is_completed = true)',
      )
    }

    const nowIso = new Date().toISOString()

    // PASSO 2: Reativar somente o attendance original dib9x0x8spccmn3
    // stage = 'Em produção', is_archived = false, closed_at = '', archived_at = ''
    // Preservar todo o resto (result, quote_value, etc.)
    app
      .db()
      .newQuery(
        "UPDATE attendances SET stage = 'Em produção', is_archived = 0, closed_at = '', archived_at = '', updated = {:now} WHERE id = 'dib9x0x8spccmn3' AND client_id = '3qfex7l7yoecqfx'",
      )
      .bind({ now: nowIso })
      .execute()

    // PASSO 3: Mover mensagens vinculadas ao attendance duplicado 188rk7ksbii7hhu pertencentes a este cliente para dib9x0x8spccmn3
    // Preservar wamid, direction, timestamps, status, anexos, client_id, etc.
    app
      .db()
      .newQuery(
        "UPDATE messages SET attendance_id = 'dib9x0x8spccmn3' WHERE attendance_id = '188rk7ksbii7hhu' AND client_id = '3qfex7l7yoecqfx'",
      )
      .execute()

    // PASSO 4: Arquivar o duplicado 188rk7ksbii7hhu (preservar histórico, NÃO criar archived_deal, NÃO registrar resultado comercial)
    app
      .db()
      .newQuery(
        "UPDATE attendances SET is_archived = 1, closed_at = {:now}, archived_at = {:now}, updated = {:now} WHERE id = '188rk7ksbii7hhu' AND client_id = '3qfex7l7yoecqfx'",
      )
      .bind({ now: nowIso })
      .execute()

    // PASSO 5: Cliente 3qfex7l7yoecqfx: somente o campo stage (espelho operacional) = 'Em produção'
    // Preservar todas as métricas, total_purchases, total_purchase_value, etc.
    app
      .db()
      .newQuery(
        "UPDATE clients SET stage = 'Em produção', updated = {:now} WHERE id = '3qfex7l7yoecqfx'",
      )
      .bind({ now: nowIso })
      .execute()

    console.log(
      '[Migration 0066] Correção pontual de dados executada com sucesso para o caso Roseni Santos da Silva.',
    )
  },
  (app) => {
    // Rollback estrito se necessário
    const revertIso = new Date().toISOString()

    // 1. Reverter cliente stage
    app
      .db()
      .newQuery(
        "UPDATE clients SET stage = 'Venda fechada', updated = {:now} WHERE id = '3qfex7l7yoecqfx'",
      )
      .bind({ now: revertIso })
      .execute()

    // 2. Reverter attendance original
    app
      .db()
      .newQuery(
        "UPDATE attendances SET stage = 'Venda fechada', is_archived = 1, closed_at = '2026-09-15 00:00:00.000Z', archived_at = '2026-09-15 00:00:00.000Z', updated = {:now} WHERE id = 'dib9x0x8spccmn3'",
      )
      .bind({ now: revertIso })
      .execute()

    // 3. Reverter attendance duplicado
    app
      .db()
      .newQuery(
        "UPDATE attendances SET is_archived = 0, closed_at = '', archived_at = '', updated = {:now} WHERE id = '188rk7ksbii7hhu'",
      )
      .bind({ now: revertIso })
      .execute()

    // 4. Reverter as mensagens conhecidas de volta para 188rk7ksbii7hhu
    app
      .db()
      .newQuery(
        "UPDATE messages SET attendance_id = '188rk7ksbii7hhu' WHERE id IN ('0r69xn68yokdyv4', '8trk5bpah8skf29') AND client_id = '3qfex7l7yoecqfx'",
      )
      .execute()
  },
)
