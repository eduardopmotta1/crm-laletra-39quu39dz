/**
 * PROPOSTA DE MIGRAÇÃO DE SEGURANÇA (FASE 0 — NÃO APLICAR EM PRODUÇÃO AUTOMATICAMENTE)
 *
 * ATENÇÃO: Esta migração documenta e prepara o fechamento rigoroso de regras de API (RLS)
 * das coleções internas do CRM PocketBase.
 *
 * Por exigência das diretrizes da FASE 0:
 * - ESTA MIGRAÇÃO NÃO DEVE SER APLICADA EM PRODUÇÃO ATÉ A REVISÃO COMPLETA DOS IMPACTOS.
 * - Este arquivo serve como blueprint executável quando o cliente desejar migrar as permissões.
 *
 * IMPACTOS IDENTIFICADOS NAS COLEÇÕES:
 * 1. production_orders:
 *    - Atual: viewRule = "" (aberto a anônimos sem restrição). Qualquer usuário anônimo poderia consultar pedidos por ID se conhecesse o ID.
 *    - Proposta: viewRule = "@request.auth.id != ''" (apenas usuários autenticados).
 *    - Impacto nos fluxos públicos: A consulta pública de clientes deve usar EXCLUSIVAMENTE o endpoint protegido
 *      GET /backend/v1/crm/public-production/{tracking_token} que roda via $app (modo superuser no hook).
 *      A tela /acompanhar/:token já utiliza esse endpoint e não quebra.
 *
 * 2. production_proofs:
 *    - Atual: viewRule = "" (anônimo pode ler qualquer prova de arte).
 *    - Proposta: viewRule = "@request.auth.id != ''".
 *    - Impacto nos fluxos públicos: A visualização pública de provas já é servida via hook GET /backend/v1/crm/public-production/{token}
 *      e aprovação via POST /backend/v1/crm/public-proof/{token}/approve. Nenhuma tela pública acessa production_proofs direto via SDK.
 *
 * 3. production_logs:
 *    - Atual: viewRule = "" (anônimo pode ler histórico de produção interno).
 *    - Proposta: viewRule = "@request.auth.id != ''".
 *    - Impacto: 100% interno ao CRM, sem impacto público.
 *
 * 4. production_stages:
 *    - Atual: viewRule = "" (aberto a anônimos).
 *    - Proposta: viewRule = "@request.auth.id != ''".
 *    - Impacto: O hook público de tracking já retorna as etapas visíveis via $app.findRecordsByFilter('production_stages', 'is_visible = true').
 *
 * 5. evaluations:
 *    - Atual: listRule = "", viewRule = "", createRule = "" (aberto a anônimos).
 *    - Proposta: listRule = "@request.auth.id != ''", viewRule = "@request.auth.id != ''", createRule = "@request.auth.id != ''".
 *    - Impacto nos fluxos públicos: O formulário de avaliação pública (/avaliacao/:token) usa os hooks GET /backend/v1/crm/evaluation
 *      e POST /backend/v1/crm/submit-evaluation. Portanto, fechar as regras diretas do PB previne enumeração de notas/clientes por anônimos
 *      e preserva o fluxo normal.
 *
 * 6. users:
 *    - Atual: createRule = "" (anônimo poderia cadastrar usuários).
 *    - Proposta: createRule = "@request.auth.id != '' && @request.auth.role_slug = 'admin'".
 *    - Impacto: Se o CRM tiver cadastro público intencional (/registro), fechar createRule bloquearia novos auto-cadastros,
 *      exigindo convite ou criação por admin.
 *
 * 7. quote_products, quote_materials, quote_additionals:
 *    - Atual: listRule, viewRule = "@request.auth.id != ''" (já protegidos contra anônimos).
 *    - Contém custos internos (cost_price, fixed_cost, min_price). DEVEM PERMANECER 100% PROTEGIDOS E PRIVADOS.
 *    - A loja pública NUNCA consulta estas coleções diretamente, utilizando as novas coleções store_products/store_categories.
 */

// Se for executado no futuro:
/*
migrate((app) => {
  const secureCollections = [
    {
      name: "production_orders",
      viewRule: "@request.auth.id != ''"
    },
    {
      name: "production_proofs",
      viewRule: "@request.auth.id != ''"
    },
    {
      name: "production_logs",
      viewRule: "@request.auth.id != ''"
    },
    {
      name: "production_stages",
      viewRule: "@request.auth.id != ''"
    },
    {
      name: "evaluations",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''"
    },
    {
      name: "users",
      createRule: "@request.auth.id != '' && @request.auth.role_slug = 'admin'"
    }
  ];

  for (const item of secureCollections) {
    try {
      const col = app.findCollectionByNameOrId(item.name);
      if (item.listRule !== undefined) col.listRule = item.listRule;
      if (item.viewRule !== undefined) col.viewRule = item.viewRule;
      if (item.createRule !== undefined) col.createRule = item.createRule;
      app.save(col);
      console.log(`[Fase 0 Security] Coleção ${item.name} regras atualizadas.`);
    } catch (err) {
      console.warn(`[Fase 0 Security] Erro ao aplicar regra em ${item.name}:`, err);
    }
  }
}, (app) => {
  // Revert rules
});
*/
