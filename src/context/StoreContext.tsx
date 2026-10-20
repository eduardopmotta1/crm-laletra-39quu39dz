import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { StoreCartItem, StoreCustomerProfile, StoreArtOption } from '@/types/store'
import { storeService } from '@/services/storeService'

interface StoreContextType {
  cart: StoreCartItem[]
  cartCount: number
  cartSubtotal: number
  isRevalidatingCart: boolean
  revalidateCartWithServer: () => Promise<void>
  addToCart: (item: Omit<StoreCartItem, 'cart_item_id'>) => void
  updateQuantity: (cartItemId: string, newQuantity: number) => void
  updateCartItemArtOption: (
    cartItemId: string,
    artOption: StoreArtOption,
    artNotes?: string,
    artFileName?: string,
    artCreationFee?: number,
  ) => void
  removeFromCart: (cartItemId: string) => void
  clearCart: () => void
  // Cliente autenticado da loja
  customer: StoreCustomerProfile | null
  customerToken: string | null
  setCustomerSession: (customer: StoreCustomerProfile | null, token: string | null) => void
  logoutCustomer: () => void
  refreshCustomerProfile: () => Promise<void>
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

const CART_STORAGE_KEY = 'laletra_store_cart_v2'
const CUSTOMER_TOKEN_KEY = 'laletra_store_token'
const CUSTOMER_DATA_KEY = 'laletra_store_customer'

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<StoreCartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch (_) {
      return []
    }
  })

  const [customerToken, setCustomerToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CUSTOMER_TOKEN_KEY)
    } catch (_) {
      return null
    }
  })

  const [customer, setCustomer] = useState<StoreCustomerProfile | null>(() => {
    try {
      const saved = localStorage.getItem(CUSTOMER_DATA_KEY)
      return saved ? JSON.parse(saved) : null
    } catch (_) {
      return null
    }
  })

  const [isRevalidatingCart, setIsRevalidatingCart] = useState(false)

  // Revalidação de preços exclusivamente no servidor
  const revalidateCartWithServer = useCallback(async () => {
    if (cart.length === 0) return
    try {
      setIsRevalidatingCart(true)
      const itemsPayload = cart.map((it) => ({
        product_id: it.product_id,
        quantity: it.quantity,
        width: it.width,
        height: it.height,
        selected_options: it.selected_options,
        selected_finishings: it.selected_finishings,
        art_option: it.art_option,
        art_notes: it.art_notes,
      }))

      const res = await storeService.validateCartOnServer(itemsPayload)
      if (res && res.success && Array.isArray(res.items)) {
        setCart((prev) =>
          prev.map((item, idx) => {
            const serverItem = res.items[idx]
            if (serverItem && serverItem.product_id === item.product_id) {
              return {
                ...item,
                unit_price: serverItem.unit_price,
                total_price: serverItem.total_price,
                lead_time_days: serverItem.lead_time_days ?? item.lead_time_days,
              }
            }
            return item
          }),
        )
      }
    } catch (err) {
      console.warn('Erro ao revalidar carrinho no servidor:', err)
    } finally {
      setIsRevalidatingCart(false)
    }
  }, [cart])

  // Revalidar carrinho com o servidor ao inicializar se houver itens no localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY)
      const parsed = saved ? JSON.parse(saved) : []
      if (parsed.length > 0) {
        storeService
          .validateCartOnServer(
            parsed.map((it: any) => ({
              product_id: it.product_id,
              quantity: it.quantity,
              width: it.width,
              height: it.height,
              selected_options: it.selected_options,
              selected_finishings: it.selected_finishings,
              art_option: it.art_option,
              art_notes: it.art_notes,
            })),
          )
          .then((res) => {
            if (res && res.success && Array.isArray(res.items)) {
              setCart((prev) =>
                prev.map((item, idx) => {
                  const serverItem = res.items[idx]
                  if (serverItem && serverItem.product_id === item.product_id) {
                    return {
                      ...item,
                      unit_price: serverItem.unit_price,
                      total_price: serverItem.total_price,
                      lead_time_days: serverItem.lead_time_days ?? item.lead_time_days,
                    }
                  }
                  return item
                }),
              )
            }
          })
          .catch(() => {})
      }
    } catch {
      /* intentionally ignored */
    }
  }, [])

  // Sincronizar carrinho com localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
    } catch {
      /* intentionally ignored */
    }
  }, [cart])

  // Buscar perfil atualizado quando houver token
  useEffect(() => {
    if (customerToken) {
      storeService
        .getCustomerProfile(customerToken)
        .then((res) => {
          if (res?.customer) {
            setCustomer(res.customer)
            localStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(res.customer))
          }
        })
        .catch(() => {
          // Token inválido ou expirado
          logoutCustomer()
        })
    }
  }, [customerToken])

  const addToCart = (newItem: Omit<StoreCartItem, 'cart_item_id'>) => {
    setCart((prev) => {
      // Verificar se o item já existe com exatamente as mesmas especificações
      const existingIndex = prev.findIndex(
        (it) =>
          it.product_id === newItem.product_id &&
          it.width === newItem.width &&
          it.height === newItem.height &&
          JSON.stringify(it.selected_options) === JSON.stringify(newItem.selected_options) &&
          JSON.stringify(it.selected_finishings) === JSON.stringify(newItem.selected_finishings),
      )

      if (existingIndex > -1) {
        const updated = [...prev]
        const current = updated[existingIndex]
        const newQty = current.quantity + newItem.quantity
        const newTotal = Number((current.unit_price * newQty).toFixed(2))
        updated[existingIndex] = {
          ...current,
          quantity: newQty,
          total_price: newTotal,
        }
        return updated
      }

      const generatedId = `cart_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      return [...prev, { ...newItem, cart_item_id: generatedId }]
    })
  }

  const updateQuantity = (cartItemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(cartItemId)
      return
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.cart_item_id === cartItemId) {
          const total = Number((item.unit_price * newQuantity).toFixed(2))
          return { ...item, quantity: newQuantity, total_price: total }
        }
        return item
      }),
    )
  }

  const updateCartItemArtOption = (
    cartItemId: string,
    artOption: StoreArtOption,
    artNotes?: string,
    artFileName?: string,
    artCreationFee?: number,
  ) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.cart_item_id === cartItemId) {
          return {
            ...item,
            art_option: artOption,
            art_notes: artNotes !== undefined ? artNotes : item.art_notes,
            art_file_name: artFileName !== undefined ? artFileName : item.art_file_name,
            art_creation_fee: artCreationFee !== undefined ? artCreationFee : item.art_creation_fee,
          }
        }
        return item
      }),
    )
  }

  const removeFromCart = (cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.cart_item_id !== cartItemId))
  }

  const clearCart = () => {
    setCart([])
    try {
      localStorage.removeItem(CART_STORAGE_KEY)
    } catch {
      /* intentionally ignored */
    }
  }

  const setCustomerSession = (cust: StoreCustomerProfile | null, token: string | null) => {
    setCustomer(cust)
    setCustomerToken(token)
    if (token && cust) {
      localStorage.setItem(CUSTOMER_TOKEN_KEY, token)
      localStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(cust))
    } else {
      localStorage.removeItem(CUSTOMER_TOKEN_KEY)
      localStorage.removeItem(CUSTOMER_DATA_KEY)
    }
  }

  const logoutCustomer = () => {
    setCustomer(null)
    setCustomerToken(null)
    localStorage.removeItem(CUSTOMER_TOKEN_KEY)
    localStorage.removeItem(CUSTOMER_DATA_KEY)
  }

  const refreshCustomerProfile = async () => {
    if (!customerToken) return
    try {
      const res = await storeService.getCustomerProfile(customerToken)
      if (res?.customer) {
        setCustomer(res.customer)
        localStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(res.customer))
      }
    } catch {
      /* intentionally ignored */
    }
  }

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const cartSubtotal = Number(cart.reduce((sum, item) => sum + item.total_price, 0).toFixed(2))

  return (
    <StoreContext.Provider
      value={{
        cart,
        cartCount,
        cartSubtotal,
        isRevalidatingCart,
        revalidateCartWithServer,
        addToCart,
        updateQuantity,
        updateCartItemArtOption,
        removeFromCart,
        clearCart,
        customer,
        customerToken,
        setCustomerSession,
        logoutCustomer,
        refreshCustomerProfile,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export const useStore = () => {
  const context = useContext(StoreContext)
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider')
  }
  return context
}
