/* General utility functions (exposes cn) */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges multiple class names into a single string
 * @param inputs - Array of class names
 * @returns Merged class names
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normaliza número de telefone (em especial formato brasileiro)
 * para busca, indexação e comparação única de identidade.
 * Trata: espaços, +, parênteses, hífens, prefixo 55 internacional e DDD.
 *
 * Exemplos equivalentes:
 * - (21) 99640-5255 -> 21996405255
 * - 21 99640-5255   -> 21996405255
 * - 5521996405255   -> 21996405255
 * - +55 21 99640-5255 -> 21996405255
 */
export function normalizePhone(rawPhone?: string | null): string {
  if (!rawPhone) return ''
  let digits = rawPhone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.substring(2)
  }
  return digits
}
