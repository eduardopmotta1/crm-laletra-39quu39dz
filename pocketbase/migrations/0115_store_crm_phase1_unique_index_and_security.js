/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0115: Fase 1 — Integração de Produtos CRM <-> Laletra Store
 *
 * 1. Cria índice único parcial em store_products.quote_product_id:
 *    CREATE UNIQUE INDEX `idx_store_products_quote_product_id_uniq` ON `store_products` (`quote_product_id`) WHERE `quote_product_id` != ''
 *    Garante 1:1 rigoroso entre o produto mestre do CRM (quote_products) e a publicação na loja (store_products).
 *    Validação de dados reais: todas as publicações existentes têm quote_product_id vazio, não gerando conflito.
 *
 * 2. Endurecimento das API Rules da coleção `store_products`:
 *    - listRule / viewRule: Permitir leitura de produtos publicados para qualquer visitante/comprador (ou se autenticado como usuário CRM):
 *      "published = true || @request.auth.collectionName = 'users'"
 *    - createRule / updateRule / deleteRule: Restritos estritamente à equipe CRM autenticada:
 *      "@request.auth.id != '' && @request.auth.collectionName = 'users'"
 *    Compradores da loja (JWT scope 'store_customer' da coleção store_customers) não conseguem criar/editar/excluir produtos.
 *    Checkout, vitrine pública e carrinho continuam lendo perfeitamente produtos publicados (sem quebras).
 *
 * Reversão documentada (down):
 *    Remove o índice único e restaura as API rules anteriores, sem excluir vínculos nem publicações criadas pela equipe.
 */

migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('store_products')
      if (!col) {
        console.warn('[Migration 0115] Coleção store_products não encontrada.')
        return
      }

      // 1. Atualizar API Rules de store_products
      // Visitantes e compradores podem ler produtos publicados; equipe CRM pode ler tudo.
      col.listRule = "published = true || @request.auth.collectionName = 'users'"
      col.viewRule = "published = true || @request.auth.collectionName = 'users'"
      // Apenas equipe CRM (coleção users) pode criar, editar ou excluir publicações
      col.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      col.updateRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
      col.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"

      // 2. Adicionar Índice Único Parcial
      let hasIndex = false
      const indexSql =
        "CREATE UNIQUE INDEX `idx_store_products_quote_product_id_uniq` ON `store_products` (`quote_product_id`) WHERE `quote_product_id` != ''"

      const existingIndexes = col.indexes || []
      for (const idx of existingIndexes) {
        if (
          idx.includes('idx_store_products_quote_product_id_uniq') ||
          (idx.includes('quote_product_id') && idx.toUpperCase().includes('UNIQUE'))
        ) {
          hasIndex = true
          break
        }
      }

      if (!hasIndex) {
        existingIndexes.push(indexSql)
        col.indexes = existingIndexes
      }

      app.save(col)
      console.log(
        '[Migration 0115] Sucesso: API Rules e índice único parcial aplicados em store_products.',
      )
    } catch (err) {
      console.error('[Migration 0115] Erro ao aplicar migração 0115:', err)
      throw err
    }
  },
  (app) => {
    // Reversão documentada (down)
    try {
      const col = app.findCollectionByNameOrId('store_products')
      if (!col) return

      // Restaura rules permissivas anteriores se necessário
      col.listRule = ''
      col.viewRule = ''
      col.createRule = "@request.auth.id != ''"
      col.updateRule = "@request.auth.id != ''"
      col.deleteRule = "@request.auth.id != ''"

      // Remove apenas o índice único parcial sem excluir vínculos nem dados
      col.indexes = (col.indexes || []).filter(
        (idx) => !idx.includes('idx_store_products_quote_product_id_uniq'),
      )

      app.save(col)
      console.log('[Migration 0115 Rollback] Reversão concluída com sucesso.')
    } catch (err) {
      console.warn('[Migration 0115 Rollback] Erro ao reverter migração 0115:', err)
    }
  },
)
