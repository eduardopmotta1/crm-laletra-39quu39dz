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

/**
 * Normaliza datas (em especial birth_date do PocketBase) para o formato 'YYYY-MM-DD'
 * esperado por campos <input type="date">.
 * Preserva exatamente o ano, mês e dia originais sem conversão de timezone.
 *
 * Suporta formatos:
 * - "1991-09-10 00:00:00.000Z" (PocketBase DateField com espaço)
 * - "1991-09-10T00:00:00.000Z" (ISO 8601 com T)
 * - "1991-09-10" (já em formato canônico YYYY-MM-DD)
 * - "0991-09-10 00:00:00.000Z" (ou anos de 4 dígitos quaisquer)
 * - Vazio / nulo / indefinido -> devolve string vazia ''
 */
export function normalizeDateInput(rawDate?: string | null): string {
  if (!rawDate || typeof rawDate !== 'string') return ''
  const trimmed = rawDate.trim()
  if (!trimmed) return ''

  // parsing compatível replace('T', ' ').split(' ')[0].trim()
  const datePart = trimmed.replace('T', ' ').split(' ')[0].trim()

  // Se já bate no padrão de data YYYY-MM-DD (aceitando 4 dígitos no ano), retorna
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart)
  if (match) {
    return datePart
  }

  return ''
}

/**
 * Normaliza uma data vinda do input date HTML ("YYYY-MM-DD") para envio ao PocketBase.
 * PocketBase DateField aceita string vazia '' para limpar o campo, ou timestamp UTC canônico
 * "YYYY-MM-DD 00:00:00.000Z" preservando o dia exato sem conversão de fuso horário.
 */
export function normalizeDateForStorage(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string') return ''
  const clean = dateStr.trim().replace('T', ' ').split(' ')[0].trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean)
  if (!match) return ''
  return `${clean} 00:00:00.000Z`
}
