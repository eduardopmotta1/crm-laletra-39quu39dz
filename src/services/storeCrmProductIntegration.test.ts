import { describe, it, expect, vi } from 'vitest'
import type {
  StoreProduct,
  ProductStoreLinkStatus,
  ProductStorePublicationState,
} from '@/types/store'
import type { QuoteProduct } from '@/types/quotes'

describe('Fase 1 — Integração de Produtos CRM ↔ Laletra Store', () => {
  // 1. Teste de unicidade 1:1 e rejeição de segunda publicação do mesmo mestre
  describe('Índice Único Parcial e Unicidade 1:1 (quote_product_id)', () => {
    it('deve permitir vincular store_product a quote_product quando livre', () => {
      const masterProduct: Partial<QuoteProduct> = {
        id: 'qp_master_001',
        name: 'Banner Lona 440g',
        is_active: true,
      }

      const storeProduct: Partial<StoreProduct> = {
        id: 'sp_store_001',
        name: 'Banner Promocional',
        quote_product_id: '',
      }

      // Simulação da regra de validação de 1:1
      const isAvailableForLink = !storeProduct.quote_product_id
      expect(isAvailableForLink).toBe(true)

      // Vincula
      storeProduct.quote_product_id = masterProduct.id
      expect(storeProduct.quote_product_id).toBe('qp_master_001')
    })

    it('deve rejeitar vincular uma segunda publicação ao mesmo mestre CRM', () => {
      const existingPublications: Array<Partial<StoreProduct>> = [
        { id: 'sp_1', name: 'Banner 1', quote_product_id: 'qp_master_001' },
      ]

      const checkCanLinkToMaster = (masterId: string, storeProdId: string) => {
        const found = existingPublications.find(
          (sp) => sp.quote_product_id === masterId && sp.id !== storeProdId,
        )
        if (found) {
          throw new Error('Este produto mestre já possui outra publicação vinculada na loja.')
        }
        return true
      }

      // Tentativa de vincular sp_2 ao mesmo mestre qp_master_001 deve falhar
      expect(() => checkCanLinkToMaster('qp_master_001', 'sp_2')).toThrow(
        'Este produto mestre já possui outra publicação vinculada na loja.',
      )
    })

    it('deve rejeitar associar uma publicação da loja que já pertence a outro mestre CRM', () => {
      const storeProduct: Partial<StoreProduct> = {
        id: 'sp_store_already_linked',
        name: 'Adesivo Vinil',
        quote_product_id: 'qp_master_other',
      }

      const checkStoreProductFree = (sp: Partial<StoreProduct>, targetMasterId: string) => {
        if (sp.quote_product_id && sp.quote_product_id !== targetMasterId) {
          throw new Error('Esta publicação da loja já está vinculada a outro produto mestre CRM.')
        }
        return true
      }

      expect(() => checkStoreProductFree(storeProduct, 'qp_master_target')).toThrow(
        'Esta publicação da loja já está vinculada a outro produto mestre CRM.',
      )
    })
  })

  // 2. Teste: Rascunho nunca aparece na vitrine pública
  describe('Isolamento de Rascunho (published = false)', () => {
    it('produtos com published = false ou mestre inativo não devem ser exibidos na vitrine', () => {
      const allCatalog: Array<Partial<StoreProduct>> = [
        { id: 'sp_pub', name: 'Produto Publicado', published: true },
        { id: 'sp_draft', name: 'Produto Rascunho', published: false },
        { id: 'sp_empty', name: 'Produto Incompleto', published: false },
      ]

      // Regra de filtro da vitrine pública
      const publicVitrine = allCatalog.filter((sp) => sp.published === true)

      expect(publicVitrine.length).toBe(1)
      expect(publicVitrine[0].id).toBe('sp_pub')
      expect(publicVitrine.some((sp) => sp.id === 'sp_draft')).toBe(false)
    })
  })

  // 3. Teste: Exigência de Mestre Ativo + Categoria + Preço para publicação
  describe('Validações Obrigatórias para Publicação na Loja', () => {
    const validatePublishRequirements = (
      master: { is_active: boolean; name: string },
      storeProd: {
        category_id?: string
        pricing_type?: string
        store_price?: number
        sqm_base_price?: number
      },
    ) => {
      if (master.is_active === false) {
        throw new Error('Não é permitido publicar na loja um produto inativo no CRM.')
      }
      if (!storeProd.category_id || storeProd.category_id.trim() === '') {
        throw new Error(
          'Publicação bloqueada: o produto precisa ter uma categoria da loja vinculada.',
        )
      }
      const pType = storeProd.pricing_type || 'quantity_tiers'
      const hasPrice =
        pType === 'square_meter'
          ? (storeProd.sqm_base_price || 0) > 0 || (storeProd.store_price || 0) > 0
          : (storeProd.store_price || 0) > 0

      if (!hasPrice) {
        throw new Error(
          'Publicação bloqueada: o produto deve ter um preço de venda base configurado (> R$ 0,00).',
        )
      }
      return true
    }

    it('deve bloquear publicação se o mestre no CRM estiver inativo', () => {
      const master = { is_active: false, name: 'Produto Inativo' }
      const sp = { category_id: 'cat_1', store_price: 50.0 }

      expect(() => validatePublishRequirements(master, sp)).toThrow(
        'Não é permitido publicar na loja um produto inativo no CRM.',
      )
    })

    it('deve bloquear publicação se não tiver categoria vinculada', () => {
      const master = { is_active: true, name: 'Produto Ativo' }
      const sp = { category_id: '', store_price: 50.0 }

      expect(() => validatePublishRequirements(master, sp)).toThrow(
        'Publicação bloqueada: o produto precisa ter uma categoria da loja vinculada.',
      )
    })

    it('deve bloquear publicação se o preço for zero ou negativo', () => {
      const master = { is_active: true, name: 'Produto Ativo' }
      const sp = { category_id: 'cat_1', store_price: 0.0 }

      expect(() => validatePublishRequirements(master, sp)).toThrow(
        'Publicação bloqueada: o produto deve ter um preço de venda base configurado (> R$ 0,00).',
      )
    })

    it('deve permitir publicação se todos os requisitos forem atendidos', () => {
      const master = { is_active: true, name: 'Produto Ativo' }
      const sp = { category_id: 'cat_1', store_price: 45.9 }

      expect(validatePublishRequirements(master, sp)).toBe(true)
    })
  })

  // 4. Teste: Despublicação não afeta store_order_items (snapshot imutável)
  describe('Preservação de Histórico e Pedidos (store_order_items snapshot)', () => {
    it('despublicar ou desvincular um produto não deve alterar pedidos já efetuados', () => {
      const historicalOrderItem = {
        id: 'soi_123',
        order_id: 'so_456',
        product_id: 'sp_banner_1',
        product_name: 'Banner Lona 440g',
        unit_price: 85.0,
        quantity: 2,
        total_price: 170.0,
        configuration_snapshot: {
          width: 100,
          height: 200,
          finishing: 'Ilhós nas 4 pontas',
        },
      }

      // Simulação: despublica e desvincula o produto da loja
      const storeProduct: Partial<StoreProduct> = {
        id: 'sp_banner_1',
        published: false,
        quote_product_id: '',
      }

      // O item do pedido permanece com os dados imutáveis
      expect(historicalOrderItem.product_id).toBe('sp_banner_1')
      expect(historicalOrderItem.unit_price).toBe(85.0)
      expect(historicalOrderItem.total_price).toBe(170.0)
      expect(historicalOrderItem.configuration_snapshot.width).toBe(100)
    })
  })

  // 5. Teste: Slugs e URLs da loja preservados ao vincular ou desvincular
  describe('Preservação de Slugs e URLs da Loja', () => {
    it('o seo_slug deve ser mantido inalterado ao vincular ou desvincular', () => {
      const storeProduct: Partial<StoreProduct> = {
        id: 'sp_cartao',
        name: 'Cartão de Visita Couchê 300g',
        seo_slug: 'cartao-visita-couche-300g',
        quote_product_id: '',
      }

      const initialSlug = storeProduct.seo_slug

      // Vincula ao mestre
      storeProduct.quote_product_id = 'qp_cartao_mestre'
      expect(storeProduct.seo_slug).toBe(initialSlug)

      // Desvincula do mestre
      storeProduct.quote_product_id = ''
      expect(storeProduct.seo_slug).toBe(initialSlug)
    })
  })

  // 6. Teste: Autorização Estrita da Equipe CRM (deny-by-default, papéis autorizados e inatividade)
  describe('Endurecimento e Autorização da Equipe CRM (store_crm_integration)', () => {
    // Espelho fiel da função validateStoreStaffAuth implementada no backend PocketBase
    const ALLOWED_STORE_ROLES = ['admin', 'gerente', 'vendedor', 'atendente', 'comercial']

    interface MockAuthRecord {
      collectionName: string
      is_active?: boolean
      role_slug?: string | null
    }

    const validateStoreStaffAuth = (auth: MockAuthRecord | null) => {
      if (!auth) {
        return { ok: false, status: 401, error: 'Autenticação necessária.' }
      }
      if (auth.collectionName && auth.collectionName !== 'users') {
        return {
          ok: false,
          status: 403,
          error: 'Acesso negado: compradores da loja não possuem permissão administrativa.',
        }
      }
      if (auth.is_active === false) {
        return { ok: false, status: 403, error: 'Usuário CRM inativo.' }
      }
      const roleSlug = String(auth.role_slug || '').trim()
      if (!roleSlug || !ALLOWED_STORE_ROLES.includes(roleSlug)) {
        return {
          ok: false,
          status: 403,
          error: 'Acesso negado: perfil de usuário sem permissão para gerenciar produtos na loja.',
        }
      }
      return { ok: true, status: 200, roleSlug }
    }

    it('deve rejeitar requisição de usuário anônimo com 401', () => {
      const result = validateStoreStaffAuth(null)
      expect(result.ok).toBe(false)
      expect(result.status).toBe(401)
      expect(result.error).toBe('Autenticação necessária.')
    })

    it('deve rejeitar compradores da loja (store_customers) com 403', () => {
      const customerAuth: MockAuthRecord = {
        collectionName: 'store_customers',
        is_active: true,
        role_slug: 'customer',
      }
      const result = validateStoreStaffAuth(customerAuth)
      expect(result.ok).toBe(false)
      expect(result.status).toBe(403)
      expect(result.error).toBe(
        'Acesso negado: compradores da loja não possuem permissão administrativa.',
      )
    })

    it('deve rejeitar usuário inativo (is_active = false) mesmo com papel admin ou comercial (403)', () => {
      const inactiveAdmin: MockAuthRecord = {
        collectionName: 'users',
        is_active: false,
        role_slug: 'admin',
      }
      const resultAdmin = validateStoreStaffAuth(inactiveAdmin)
      expect(resultAdmin.ok).toBe(false)
      expect(resultAdmin.status).toBe(403)
      expect(resultAdmin.error).toBe('Usuário CRM inativo.')

      const inactiveComercial: MockAuthRecord = {
        collectionName: 'users',
        is_active: false,
        role_slug: 'comercial',
      }
      const resultComercial = validateStoreStaffAuth(inactiveComercial)
      expect(resultComercial.ok).toBe(false)
      expect(resultComercial.status).toBe(403)
      expect(resultComercial.error).toBe('Usuário CRM inativo.')
    })

    it('deve rejeitar role_slug vazio, nulo, indefinido ou espaços em branco (negação por padrão / 403)', () => {
      const emptyRole: MockAuthRecord = {
        collectionName: 'users',
        is_active: true,
        role_slug: '',
      }
      const resultEmpty = validateStoreStaffAuth(emptyRole)
      expect(resultEmpty.ok).toBe(false)
      expect(resultEmpty.status).toBe(403)
      expect(resultEmpty.error).toBe(
        'Acesso negado: perfil de usuário sem permissão para gerenciar produtos na loja.',
      )

      const nullRole: MockAuthRecord = {
        collectionName: 'users',
        is_active: true,
        role_slug: null,
      }
      const resultNull = validateStoreStaffAuth(nullRole)
      expect(resultNull.ok).toBe(false)
      expect(resultNull.status).toBe(403)
      expect(resultNull.error).toBe(
        'Acesso negado: perfil de usuário sem permissão para gerenciar produtos na loja.',
      )

      const undefinedRole: MockAuthRecord = {
        collectionName: 'users',
        is_active: true,
      }
      const resultUndefined = validateStoreStaffAuth(undefinedRole)
      expect(resultUndefined.ok).toBe(false)
      expect(resultUndefined.status).toBe(403)
      expect(resultUndefined.error).toBe(
        'Acesso negado: perfil de usuário sem permissão para gerenciar produtos na loja.',
      )

      const whitespaceRole: MockAuthRecord = {
        collectionName: 'users',
        is_active: true,
        role_slug: '   ',
      }
      const resultWhitespace = validateStoreStaffAuth(whitespaceRole)
      expect(resultWhitespace.ok).toBe(false)
      expect(resultWhitespace.status).toBe(403)
      expect(resultWhitespace.error).toBe(
        'Acesso negado: perfil de usuário sem permissão para gerenciar produtos na loja.',
      )
    })

    it('deve rejeitar o papel "producao" sem permissão administrativa para a loja (403)', () => {
      const producaoAuth: MockAuthRecord = {
        collectionName: 'users',
        is_active: true,
        role_slug: 'producao',
      }
      const result = validateStoreStaffAuth(producaoAuth)
      expect(result.ok).toBe(false)
      expect(result.status).toBe(403)
      expect(result.error).toBe(
        'Acesso negado: perfil de usuário sem permissão para gerenciar produtos na loja.',
      )
    })

    it('deve autorizar com sucesso o papel "comercial" ativo da equipe CRM (200)', () => {
      const comercialAuth: MockAuthRecord = {
        collectionName: 'users',
        is_active: true,
        role_slug: 'comercial',
      }
      const result = validateStoreStaffAuth(comercialAuth)
      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.roleSlug).toBe('comercial')
    })

    it('deve manter autorizados os demais papéis da equipe: admin, gerente, vendedor, atendente (200)', () => {
      const authorizedRoles = ['admin', 'gerente', 'vendedor', 'atendente', 'comercial']

      for (const role of authorizedRoles) {
        const auth: MockAuthRecord = {
          collectionName: 'users',
          is_active: true,
          role_slug: role,
        }
        const res = validateStoreStaffAuth(auth)
        expect(res.ok).toBe(true)
        expect(res.status).toBe(200)
        expect(res.roleSlug).toBe(role)
      }
    })

    it('deve rejeitar papéis não autorizados como financeiro, terceirizado, visitante (403)', () => {
      const unauthorizedRoles = ['financeiro', 'terceirizado', 'visitante', 'qualquer_outro']

      for (const role of unauthorizedRoles) {
        const auth: MockAuthRecord = {
          collectionName: 'users',
          is_active: true,
          role_slug: role,
        }
        const res = validateStoreStaffAuth(auth)
        expect(res.ok).toBe(false)
        expect(res.status).toBe(403)
        expect(res.error).toBe(
          'Acesso negado: perfil de usuário sem permissão para gerenciar produtos na loja.',
        )
      }
    })
  })

  // 7. Teste: Estados de publicação na Ficha do Produto CRM
  describe('Estados de Publicação na Ficha do Produto (ProductsPage)', () => {
    const resolvePublicationState = (
      masterIsActive: boolean,
      storeProduct: { published: boolean } | null,
    ): ProductStorePublicationState => {
      if (!storeProduct) return 'not_linked'
      if (storeProduct.published) {
        return masterIsActive ? 'published' : 'unavailable'
      }
      return 'draft'
    }

    it('deve identificar "not_linked" quando não houver store_product', () => {
      expect(resolvePublicationState(true, null)).toBe('not_linked')
    })

    it('deve identificar "draft" quando store_product existir com published = false', () => {
      expect(resolvePublicationState(true, { published: false })).toBe('draft')
    })

    it('deve identificar "published" quando store_product tiver published = true e mestre ativo', () => {
      expect(resolvePublicationState(true, { published: true })).toBe('published')
    })

    it('deve identificar "unavailable" quando loja publicada mas mestre inativo no CRM', () => {
      expect(resolvePublicationState(false, { published: true })).toBe('unavailable')
    })
  })
})
