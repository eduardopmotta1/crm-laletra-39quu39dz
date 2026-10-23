# Plano de Migração e Arquitetura: 3 Tabelas de Preços Comerciais (Etapa 1)

Documento de Especificação Técnica, Segurança, Validação e Procedimento Operacional  
**Projeto:** CRM Laletra + LaLetra Store  
**Arquivo Executável da Migração:** `pocketbase/migrations/0118_add_commercial_price_tables_stage1.js`  
**Endpoint Administrativo de Execução Controlada:** `POST /backend/v1/crm/admin/etapa1-price-tables/execute`  
**Status da Execução:** **PENDENTE / PREPARAÇÃO (NÃO EXECUTADA)**

---

## (a) Justificativa do Número da Migração (0118 vs 0116/0117)

O plano inicial da Etapa 1 previa o número 0116 para esta alteração. No entanto, durante a inspeção do histórico ativo do banco de dados PocketBase e das migrações já aplicadas (`list_migrations`), constatou-se que os ordinais anteriores já estavam definitivamente ocupados:

1. **`0116_create_store_settings_and_subcategories.js`**: aplicado para suportar categorias hierárquicas (`parent_id`), banners responsivos e as coleções `store_settings` e `store_media_uploads`.
2. **`0117_store_crm_phase1_unique_index_and_security.js`**: aplicado para o índice único e regras de segurança da Fase 1 da loja virtual.
3. **`0118_add_commercial_price_tables_stage1.js`**: próximo ordinal sequencial estritamente livre para a Etapa 1 das 3 Tabelas de Preços.

> **Importante:** Qualquer tentativa de registrar uma migração reutilizando os ordinais 0116 ou 0117 resultaria em colisão de versão ou ignorância pelo mecanismo de migração do PocketBase, corrompendo o controle de versionamento do schema. Por essa razão técnica imperativa, o arquivo executável definitivo é **`0118_add_commercial_price_tables_stage1.js`**.

---

## (b) Campos Definitivos e Endurecimento de API Rules

A Etapa 1 introduz novos campos e endurece regras de acesso em duas coleções centrais:

### 1. Coleção `quote_products` (Produtos Mestre do CRM)

- **`sku`** (`text`, opcional):
  - Código identificador comercial/logístico do produto.
  - **Índice Único Parcial:** `CREATE UNIQUE INDEX idx_quote_products_sku_uniq ON quote_products (sku) WHERE sku != ''`. Garante que dois produtos não compartilhem o mesmo SKU preenchido, mas permite múltiplos produtos sem SKU durante a fase de transição.
- **`category_id`** (`relation` → `store_categories`, `maxSelect: 1`, opcional):
  - Vinculação direta da taxonomia do produto com a categoria da loja virtual.
- **`price_tables`** (`json`, `maxSize: 50000`, opcional):
  - Estrutura hierárquica contendo as 3 tabelas de preços (`preco_1`, `preco_2`, `preco_3`).
- **Endurecimento de API Rules em `quote_products`:**
  - `listRule`: `@request.auth.id != ''`
  - `viewRule`: `@request.auth.id != ''`
  - `createRule`: `@request.auth.id != '' && @request.auth.collectionName = 'users'`
  - `updateRule`: `@request.auth.id != '' && @request.auth.collectionName = 'users'`
  - `deleteRule`: `@request.auth.id != '' && @request.auth.collectionName = 'users'`
  - _Garantia:_ Clientes da loja (`store_customers`) e visitantes anônimos não possuem qualquer permissão de escrita sobre o catálogo mestre de produtos.

### 2. Coleção `clients` (Clientes do CRM)

- **`price_tier`** (`select`: `['preco_1', 'preco_2', 'preco_3']`, `maxSelect: 1`, padrão `'preco_1'`):
  - Define a qual tabela comercial o cliente pertence:
    - `preco_1`: Cliente Final (Tabela padrão);
    - `preco_2`: Terceirizado / Revenda / Parceiro gráfico;
    - `preco_3`: Especial / Corporativo / Volume diferenciado.
- **Endurecimento de API Rules em `clients`:**
  - `updateRule`: `@request.auth.id != '' && @request.auth.collectionName = 'users' && (@request.body.price_tier:changed = false || @request.auth.role_slug = 'admin' || @request.auth.role_slug = 'gerente')`
  - _Garantia de Segurança:_ Somente usuários internos com os perfis **`admin`** ou **`gerente`** podem alterar o campo `price_tier`. Atendentes, vendedores e operadores de produção podem editar outros dados cadastrais do cliente (endereço, telefone, observações), mas são barrados com status **403 Forbidden** se tentarem modificar `price_tier`. Compradores da loja (`store_customers`) ou chamadas públicas não autenticadas são bloqueados por padrão.

---

## (c) Estrutura JSON das 3 Tabelas (`price_tables`)

A estrutura gravada no campo `price_tables` de `quote_products` é definida da seguinte forma:

```json
{
  "preco_1": {
    "fixed_price": 60.0,
    "min_price": 30.0,
    "material_factor": 1.0,
    "acrescimos_factor": 1.0
  },
  "preco_2": {
    "fixed_price": 45.0,
    "min_price": 25.0,
    "material_factor": 0.75,
    "acrescimos_factor": 0.85
  },
  "preco_3": {
    "fixed_price": 52.0,
    "min_price": 28.0,
    "material_factor": 0.85,
    "acrescimos_factor": 0.9
  }
}
```

### Princípio da Independência Estrita e Multiplicador Opcional:

1. **Preços Independentes:** Cada tabela possui seus próprios valores absolutos (`fixed_price`, `min_price`).
2. **Multiplicadores são Apenas Sugestão Opcional de Preenchimento Inicial:** O operador de cadastro pode utilizar um botão de sugestão (ex: "aplicar -25% em Preço 2" ou "aplicar -15% em Preço 3"). A função utilitária `applyTierMultiplier(base, -25)` gera o valor numérico sugerido.
3. **Ajuste Manual Posterior Sem Impacto Cruzado:** Uma vez preenchido o campo na interface, o valor pode ser livremente editado para cima ou para baixo (ex: de R$ 45,00 para R$ 47,50) sem recalcular nem modificar os preços de `preco_1` ou `preco_3`.

---

## (d) Exemplos Práticos de Cálculo no Motor Existente

O motor de cálculo (`src/lib/quoteCalculator.ts`) opera sobre a tabela resolvida pelo cliente (`src/lib/priceTableResolver.ts`), sem duplicar fórmulas ou criar lógicas paralelas.

### Exemplo 1: Produto por Metro Quadrado (`calc_rule = 'm2'`)

- **Produto:** Lona Frontlight 440g
  - `preco_1`: R$ 60,00/m², Preço Mínimo: R$ 30,00
  - `preco_2`: R$ 45,00/m², Preço Mínimo: R$ 25,00
  - `preco_3`: R$ 52,00/m², Preço Mínimo: R$ 28,00
- **Pedido:** 2 peças de 2,00m × 1,50m (Área unitária: 3,00 m² | Área total: 6,00 m²)

| Tabela                     | Preço/m² | Preço Unitário (3m²) | Quantidade | Preço Total   | Preço Mínimo Aplicado?     |
| :------------------------- | :------- | :------------------- | :--------- | :------------ | :------------------------- |
| **Preço 1 (Final)**        | R$ 60,00 | R$ 180,00            | 2          | **R$ 360,00** | Não (R$ 180,00 > R$ 30,00) |
| **Preço 2 (Terceirizado)** | R$ 45,00 | R$ 135,00            | 2          | **R$ 270,00** | Não (R$ 135,00 > R$ 25,00) |
| **Preço 3 (Especial)**     | R$ 52,00 | R$ 156,00            | 2          | **R$ 312,00** | Não (R$ 156,00 > R$ 28,00) |

_Cenário de Peça Reduzida (Preço Mínimo):_  
Peça de 10cm × 10cm (0,01 m²):

- No Preço 1: 0,01 × R$ 60 = R$ 0,60 → Trava de `min_price` eleva para **R$ 30,00**.
- No Preço 2: 0,01 × R$ 45 = R$ 0,45 → Trava de `min_price` eleva para **R$ 25,00**.
- No Preço 3: 0,01 × R$ 52 = R$ 0,52 → Trava de `min_price` eleva para **R$ 28,00**.

### Exemplo 2: Produto de Preço Fixo por Unidade (`calc_rule = 'preco_fixo'`)

- **Produto:** Crachá PVC com Presilha
  - `preco_1`: R$ 25,00 unitário
  - `preco_2`: R$ 18,00 unitário
  - `preco_3`: R$ 21,00 unitário
- **Pedido:** 10 unidades

| Tabela                     | Preço Unitário | Quantidade | Total de Venda |
| :------------------------- | :------------- | :--------- | :------------- |
| **Preço 1 (Final)**        | R$ 25,00       | 10         | **R$ 250,00**  |
| **Preço 2 (Terceirizado)** | R$ 18,00       | 10         | **R$ 180,00**  |
| **Preço 3 (Especial)**     | R$ 21,00       | 10         | **R$ 210,00**  |

---

## (e) Estratégia para os 42+ Produtos Existentes

1. **Campos Nulos / Ausentes:**
   - Nenhum produto existente terá seus dados sobrescritos ou preenchidos automaticamente por script de migração.
   - O campo `price_tables` inicia como `null` / vazio para os produtos já cadastrados.
2. **Fallback Seguro no Código (`getProductTierConfig`):**
   - Quando um produto não possui a tabela ou o campo específico configurado em `price_tables`, o motor assume automaticamente os valores legados já existentes (`fixed_price` e `min_price` do produto base), comportando-se como **Preço 1 em todas as tabelas**.
3. **Preenchimento Manual Assistido:**
   - A equipe comercial configurará os preços especiais de forma gradual e controlada, acessando a tela de edição de produtos (`ProductsPage`), revisando margens e salvando as tabelas individualmente.

---

## (f) Validação de Preço Mínimo e Custos

- **Regra de Lucratividade:** O preço de venda de qualquer tabela não pode ficar abaixo do custo do produto ou insumos base (`baseUnitCost + totalAdditionalsCost`).
- **Validação de Preço Mínimo (`min_price`):**
  - Cada tabela pode ter seu `min_price` ajustado (ex: Preço 1 = R$ 30,00; Preço 2 = R$ 20,00).
  - Caso o cálculo dimensional resulte em valor inferior ao `min_price` configurado para a tabela selecionada, o motor aplica o `min_price` como preço unitário final e sinaliza a flag `is_min_price_applied = true`.

---

## (g) Procedimento de Backup Verificável

Seguindo a memória técnica do projeto e as lições consolidadas na Etapa 3:

- O método `$app.createBackup()` **falha** se invocado no contexto direto de uma migração do PocketBase.
- O backup DEVE ser disparado exclusivamente via requisição HTTP autenticada contra o endpoint nativo:

  ```http
  POST /api/backups
  Authorization: <PB_SUPERUSER_TOKEN>
  Content-Type: application/json

  { "name": "pb_backup_etapa1_price_tables_YYYYMMDDHHMMSS.zip" }
  ```

- **Verificação no Filesystem:** O hook `pocketbase/hooks/etapa1_price_tables_execution.js` valida fisicamente se o arquivo existe via `$app.newBackupsFilesystem().exists(backupName)` e se possui tamanho (`size > 0`).
- **Fail-Hard:** Caso o backup não seja criado ou a confirmação no filesystem falhe, o endpoint aborta imediatamente a operação com erro HTTP 500, sem aplicar qualquer modificação no banco de dados.

---

## (h) Procedimento de Rollback

A migração foi projetada para ser **100% reversível e segura**:

1. O método `down(app)` da migração 0118 remove o índice único parcial `idx_quote_products_sku_uniq`.
2. Remove os campos novos:
   - `sku`, `category_id`, `price_tables` de `quote_products`;
   - `price_tier` de `clients`.
3. Restaura as API rules originais de `quote_products` e `clients`.
4. **Preservação de Dados Transacionais:** Nenhum registro de orçamento (`quotes`), itens de orçamentos, pedidos (`production_orders`) ou conversas é tocado ou excluído na reversão.

---

## (i) Riscos de Segurança e Mitigações

| Risco Identificado                       | Vetor de Ataque / Falha                                                                            | Mitigação Implementada                                                                                                                                                                         |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manipulação de Tabela pelo Navegador** | Cliente da loja tenta enviar `price_tier: 'preco_2'` via formulário público ou script no DevTools. | `resolveEffectivePriceTier` ignora qualquer parâmetro do cliente; validação estrita no backend; compradores só acessam Preço 2/3 se o cadastro possuir `crm_link_status == 'verified_linked'`. |
| **Elevação de Privilégio no CRM**        | Vendedor ou atendente tenta reclassificar um cliente para obter desconto não autorizado.           | API Rule em `clients` bloqueia com **403 Forbidden** qualquer alteração de `price_tier` originada por perfis diferentes de `admin` e `gerente`.                                                |
| **Colisão de SKU**                       | Cadastro de dois produtos distintos com o mesmo código SKU.                                        | Índice único parcial `idx_quote_products_sku_uniq` no banco rejeita duplicatas ativas no ato da gravação.                                                                                      |
| **Execução Acidental em Deploy**         | O runner automático do Skip aplicar a migração antes da hora.                                      | Trava de segurança no cabeçalho da migration 0118 verifica `$os.getenv('RUN_MANUAL_MIGRATION_0118') == 'true'`; por padrão, o runner apenas pula a execução com mensagem de log informativa.   |

---

## (j) Critérios de Autorização para Execução

Para que a migração seja executada em ambiente real de produção, os seguintes critérios devem ser expressamente atendidos e aprovados pelo usuário:

1. **Aprovação Explícita do Usuário:** Autorização formal via chat para execução da Etapa 1.
2. **Ambiente com Superuser Configurado:** Verificação de que `PB_SUPERUSER_TOKEN` está configurado para a emissão do backup físico.
3. **Execução Unicamente via Endpoint Controlado:** Acionamento manual via `POST /backend/v1/crm/admin/etapa1-price-tables/execute` (ou definição pontual da flag `RUN_MANUAL_MIGRATION_0118=true`).
4. **Inspeção do Relatório:** Verificação da resposta JSON com status `SUCCESS` e conferência do log em `system_settings.etapa1_price_tables_report`.
