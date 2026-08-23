import React, { createContext, useContext, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import type { User } from '@/types/crm'

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>
  register: (
    name: string,
    email: string,
    pass: string,
  ) => Promise<{ success: boolean; error?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    return (pb.authStore.record as unknown as User) || null
  })
  const [token, setToken] = useState<string | null>(() => pb.authStore.token || null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Listen for auth store changes
    const unsubscribe = pb.authStore.onChange((tokenVal, model) => {
      setToken(tokenVal)
      setUser((model as unknown as User) || null)
    })

    // Auto check current validity
    if (pb.authStore.isValid && pb.authStore.record) {
      setUser(pb.authStore.record as unknown as User)
      setToken(pb.authStore.token)
    }
    setIsLoading(false)

    return () => {
      unsubscribe()
    }
  }, [])

  const login = async (email: string, pass: string) => {
    try {
      const authData = await pb.collection('users').authWithPassword(email.trim(), pass)
      setUser(authData.record as unknown as User)
      setToken(authData.token)
      return { success: true }
    } catch (err: any) {
      console.error('Login error:', err)
      return {
        success: false,
        error:
          err?.data?.message ||
          err?.message ||
          'Email ou senha incorretos. Verifique suas credenciais.',
      }
    }
  }

  const register = async (name: string, email: string, pass: string) => {
    try {
      // Create user
      await pb.collection('users').create({
        name: name.trim(),
        email: email.trim(),
        password: pass,
        passwordConfirm: pass,
        verified: true,
      })
      // Automatically log in
      const authData = await pb.collection('users').authWithPassword(email.trim(), pass)
      setUser(authData.record as unknown as User)
      setToken(authData.token)
      return { success: true }
    } catch (err: any) {
      console.error('Registration error:', err)
      const msg =
        err?.data?.data?.email?.message ||
        err?.data?.message ||
        err?.message ||
        'Erro ao criar conta.'
      return { success: false, error: msg }
    }
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
    setToken(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
