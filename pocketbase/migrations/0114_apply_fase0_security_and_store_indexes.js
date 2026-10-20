/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0114:
 * 1. Aplica as regras de segurança auditadas na Fase 0 (anteriormente propostas em 0112):
 *    - production_orders: list/view/create/update/delete restritos a usuários autenticados (@request.auth.id != '')
 *    - production_stages: list/view restritos a usuários autenticados (@request.auth.id != '')
 *    - production_logs: list/view/create/update/delete restritos a usuários autenticados (@request.auth.id != '')
 *    - production_proofs: list/view/create/update/delete restritos a usuários autenticados (@request.auth.id != '')
 *    - evaluations: list/view/create/update/delete restritos a usuários autenticados (@request.auth.id != '')
 *    - users: createRule restrito a administradores autenticados (@request.auth.id != '' && @request.auth.role_slug = 'admin')
 *
 * 2. Garante integridade e idempotência estrita da Fase 2 da Laletra Store:
 *    - Índice UNIQUE em client_request_id na coleção store_orders para impedir duplicidade de pedidos por duplo clique/retry.
 *    - Índice em store_orders por customer_id e payment_status.
 */

migrate(
  (app) => {
    // 1. production_orders
    try {
      const col = app.findCollectionByNameOrId('production_orders')
      col.listRule = "@request.auth.id != ''"
      col.viewRule = "@request.auth.id != ''"
      col.createRule = "@request.auth.id != ''"
      col.updateRule = "@request.auth.id != ''"
      col.deleteRule = "@request.auth.id != ''"
      app.save(col)
    } catch (e) {
      console.warn('[Migration 0114] Erro ao atualizar regras de production_orders:', e)
    }

    // 2. production_stages
    try {
      const col = app.findCollectionByNameOrId('production_stages')
      col.listRule = "@request.auth.id != ''"
      col.viewRule = "@request.auth.id != ''"
      app.save(col)
    } catch (e) {
      console.warn('[Migration 0114] Erro ao atualizar regras de production_stages:', e)
    }

    // 3. production_logs
    try {
      const col = app.findCollectionByNameOrId('production_logs')
      col.listRule = "@request.auth.id != ''"
      col.viewRule = "@request.auth.id != ''"
      col.createRule = "@request.auth.id != ''"
      col.updateRule = "@request.auth.id != ''"
      col.deleteRule = "@request.auth.id != ''"
      app.save(col)
    } catch (e) {
      console.warn('[Migration 0114] Erro ao atualizar regras de production_logs:', e)
    }

    // 4. production_proofs
    try {
      const col = app.findCollectionByNameOrId('production_proofs')
      col.listRule = "@request.auth.id != ''"
      col.viewRule = "@request.auth.id != ''"
      col.createRule = "@request.auth.id != ''"
      col.updateRule = "@request.auth.id != ''"
      col.deleteRule = "@request.auth.id != ''"
      app.save(col)
    } catch (e) {
      console.warn('[Migration 0114] Erro ao atualizar regras de production_proofs:', e)
    }

    // 5. evaluations
    try {
      const col = app.findCollectionByNameOrId('evaluations')
      col.listRule = "@request.auth.id != ''"
      col.viewRule = "@request.auth.id != ''"
      col.createRule = "@request.auth.id != ''"
      col.updateRule = "@request.auth.id != ''"
      col.deleteRule = "@request.auth.id != ''"
      app.save(col)
    } catch (e) {
      console.warn('[Migration 0114] Erro ao atualizar regras de evaluations:', e)
    }

    // 6. users: restringe criação apenas a admin autenticado
    try {
      const col = app.findCollectionByNameOrId('users')
      col.createRule = "@request.auth.id != '' && @request.auth.role_slug = 'admin'"
      app.save(col)
    } catch (e) {
      console.warn('[Migration 0114] Erro ao atualizar regras de users:', e)
    }

    // 7. store_orders: garantir índice UNIQUE em client_request_id
    try {
      const ordersCol = app.findCollectionByNameOrId('store_orders')
      // Cria índice único se ainda não existir
      let hasUniqueIndex = false
      for (const idx of ordersCol.indexes) {
        if (idx.includes('client_request_id') && idx.toUpperCase().includes('UNIQUE')) {
          hasUniqueIndex = true
          break
        }
      }
      if (!hasUniqueIndex) {
        ordersCol.indexes.push(
          'CREATE UNIQUE INDEX idx_store_orders_req_id_uniq ON store_orders (client_request_id)',
        )
        ordersCol.indexes.push('CREATE INDEX idx_store_orders_cust ON store_orders (customer_id)')
        ordersCol.indexes.push(
          'CREATE INDEX idx_store_orders_pay_stat ON store_orders (payment_status)',
        )
        app.save(ordersCol)
      }
    } catch (e) {
      console.warn('[Migration 0114] Erro ao adicionar índices em store_orders:', e)
    }
  },
  (app) => {
    // Rollback (reversão se necessário)
    try {
      const colUsers = app.findCollectionByNameOrId('users')
      colUsers.createRule = ''
      app.save(colUsers)
    } catch (_) {}
  },
)
