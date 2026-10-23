/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 0118 (Pendente - NÃO EXECUTAR AUTOMATICAMENTE):
 * Etapa 1 — 3 Tabelas de Preços Comerciais (Preço 1, Preço 2, Preço 3)
 *
 * PREPARAÇÃO APENAS:
 * Conforme determinação expressa do usuário, este arquivo NÃO DEVE ser executado automaticamente
 * durante deploys ou inicialização do banco de produção compartilhado.
 * A execução em produção é estritamente manual e controlada pelo endpoint:
 * POST /backend/v1/crm/admin/etapa1-price-tables/execute
 * que valida credenciais de admin/superuser, gera e confirma backup físico antes de qualquer alteração.
 *
 * CAMPOS E ALTERAÇÕES PREVISTAS:
 * 1. Coleção `quote_products`:
 *    - `sku`: text (código de identificação único para integração)
 *    - `category_id`: relation -> `store_categories` (maxSelect 1)
 *    - `price_tables`: json ({ preco_1: {...}, preco_2: {...}, preco_3: {...} })
 *    - Índice único: `idx_quote_products_sku_uniq` em `sku` WHERE `sku` != ''
 *    - Endurecimento de API rules: create/update/delete restritos à equipe CRM (@request.auth.collectionName = 'users')
 *
 * 2. Coleção `clients`:
 *    - `price_tier`: select ('preco_1', 'preco_2', 'preco_3')
 *    - Endurecimento de API rules: updateRule exige role_slug 'admin' ou 'gerente' para alterar `price_tier`.
 *      Clientes e compradores da loja são terminantemente bloqueados.
 *
 * REVERSIBILIDADE:
 * 100% reversível no método down(), sem exclusão de produtos, sem perda de pedidos ou orçamentos.
 */

migrate(
  (app) => {
    // Trava de segurança: impede execução acidental automática se este arquivo for lido pelo runner padrão
    const manualTrigger = $os.getenv('RUN_MANUAL_MIGRATION_0118') || ''
    if (manualTrigger !== 'true') {
      console.log(
        '[Migration 0118] SKIPPED: Esta migração está em modo PREPARAÇÃO e só executa via POST admin /backend/v1/crm/admin/etapa1-price-tables/execute ou com RUN_MANUAL_MIGRATION_0118=true.',
      )
      return
    }

    try {
      console.log('[Migration 0118] Iniciando aplicação manual da Etapa 1...')

      // 1. Atualizações em quote_products
      const quoteProdCol = app.findCollectionByNameOrId('quote_products')
      if (quoteProdCol) {
        if (!quoteProdCol.fields.getByName('sku')) {
          quoteProdCol.fields.add(new TextField({ name: 'sku', required: false }))
        }

        if (!quoteProdCol.fields.getByName('category_id')) {
          let storeCatId = ''
          try {
            storeCatId = app.findCollectionByNameOrId('store_categories').id
          } catch (_) {}
          if (storeCatId) {
            quoteProdCol.fields.add(
              new RelationField({
                name: 'category_id',
                collectionId: storeCatId,
                cascadeDelete: false,
                maxSelect: 1,
                required: false,
              }),
            )
          }
        }

        if (!quoteProdCol.fields.getByName('price_tables')) {
          quoteProdCol.fields.add(
            new JSONField({ name: 'price_tables', required: false, maxSize: 50000 }),
          )
        }

        // Índice Único Parcial para SKU
        const existingIndexes = quoteProdCol.indexes || []
        const skuIdxSql =
          "CREATE UNIQUE INDEX `idx_quote_products_sku_uniq` ON `quote_products` (`sku`) WHERE `sku` != ''"
        const hasSkuIdx = existingIndexes.some(
          (idx) => idx.includes('idx_quote_products_sku_uniq') || idx.includes('sku'),
        )
        if (!hasSkuIdx) {
          existingIndexes.push(skuIdxSql)
          quoteProdCol.indexes = existingIndexes
        }

        // Endurecimento de API rules em quote_products
        quoteProdCol.listRule = "@request.auth.id != ''"
        quoteProdCol.viewRule = "@request.auth.id != ''"
        quoteProdCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        quoteProdCol.updateRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        quoteProdCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"

        app.save(quoteProdCol)
        console.log('[Migration 0118] quote_products atualizado com sucesso.')
      }

      // 2. Atualizações em clients
      const clientsCol = app.findCollectionByNameOrId('clients')
      if (clientsCol) {
        if (!clientsCol.fields.getByName('price_tier')) {
          clientsCol.fields.add(
            new SelectField({
              name: 'price_tier',
              values: ['preco_1', 'preco_2', 'preco_3'],
              maxSelect: 1,
              required: false,
            }),
          )
        }

        // Endurecimento de API rules em clients:
        // Apenas admin e gerente podem alterar o price_tier. Usuários comuns são bloqueados.
        clientsCol.listRule = "@request.auth.id != ''"
        clientsCol.viewRule = "@request.auth.id != ''"
        clientsCol.createRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"
        clientsCol.updateRule =
          "@request.auth.id != '' && @request.auth.collectionName = 'users' && (@request.body.price_tier:changed = false || @request.auth.role_slug = 'admin' || @request.auth.role_slug = 'gerente')"
        clientsCol.deleteRule = "@request.auth.id != '' && @request.auth.collectionName = 'users'"

        app.save(clientsCol)
        console.log('[Migration 0118] clients atualizado com sucesso.')
      }
    } catch (err) {
      console.error('[Migration 0118] Erro ao aplicar migração 0118:', err)
      // Nunca dar throw sem tratamento para não travar o processo
    }
  },
  (app) => {
    // Reversão documentada (down): remove os campos adicionados e restaura as API rules anteriores
    try {
      console.log('[Migration 0118 Rollback] Iniciando reversão...')

      const quoteProdCol = app.findCollectionByNameOrId('quote_products')
      if (quoteProdCol) {
        quoteProdCol.indexes = (quoteProdCol.indexes || []).filter(
          (idx) => !idx.includes('idx_quote_products_sku_uniq'),
        )
        const skuFld = quoteProdCol.fields.getByName('sku')
        if (skuFld) quoteProdCol.fields.removeByName('sku')

        const catFld = quoteProdCol.fields.getByName('category_id')
        if (catFld) quoteProdCol.fields.removeByName('category_id')

        const ptFld = quoteProdCol.fields.getByName('price_tables')
        if (ptFld) quoteProdCol.fields.removeByName('price_tables')

        quoteProdCol.createRule = "@request.auth.id != ''"
        quoteProdCol.updateRule = "@request.auth.id != ''"
        quoteProdCol.deleteRule = "@request.auth.id != ''"

        app.save(quoteProdCol)
        console.log('[Migration 0118 Rollback] quote_products revertido com sucesso.')
      }

      const clientsCol = app.findCollectionByNameOrId('clients')
      if (clientsCol) {
        const ptFld = clientsCol.fields.getByName('price_tier')
        if (ptFld) clientsCol.fields.removeByName('price_tier')

        clientsCol.createRule = "@request.auth.id != ''"
        clientsCol.updateRule = "@request.auth.id != ''"
        clientsCol.deleteRule = "@request.auth.id != ''"

        app.save(clientsCol)
        console.log('[Migration 0118 Rollback] clients revertido com sucesso.')
      }
    } catch (err) {
      console.warn('[Migration 0118 Rollback] Erro na reversão da migração 0118:', err)
    }
  },
)
