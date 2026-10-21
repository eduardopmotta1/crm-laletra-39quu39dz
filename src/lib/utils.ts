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
 * Gera variantes válidas de números de telefone para busca e matching no CRM/WhatsApp.
 * Trata:
 * - Remoção de zero inicial e códigos de operadora legados (ex: 021, 015, 031, 041, etc.)
 * - Preservação do DDD nacional
 * - Variantes com e sem o prefixo internacional 55 (Brasil)
 * - Celulares com e sem o nono dígito (9 dígitos vs 8 dígitos legados)
 * - Preservação de números fixos de 8 dígitos (sem adicionar 9º dígito indevido)
 * - Deduplicação automática via Set
 */
export function getPhoneVariants(rawPhone?: string | null): string[] {
  if (!rawPhone) return []
  const digits = String(rawPhone).replace(/\D/g, '')
  if (!digits || digits.length < 8) return []

  const set = new Set<string>()
  set.add(digits)

  // 1. Extrair número nacional limpo (sem DDI 55, sem zeros e sem código de operadora)
  let national = ''

  if (digits.startsWith('55') && digits.length >= 12) {
    const after55 = digits.substring(2)
    if (after55.startsWith('0')) {
      const matchOp = after55.match(/^0\d{2}([1-9]\d{9,10})$/)
      if (matchOp) {
        national = matchOp[1]
      } else {
        national = after55.replace(/^0+/, '')
      }
    } else {
      national = after55
    }
  } else if (digits.startsWith('0')) {
    // Tratar prefixos de operadora (ex: 021, 015, 031, 041 seguidos de DDD + número)
    const matchOp = digits.match(/^0\d{2}([1-9]\d{9,10})$/)
    if (matchOp) {
      national = matchOp[1]
    } else {
      const withoutZero = digits.replace(/^0+/, '')
      if (withoutZero.startsWith('55') && withoutZero.length >= 12) {
        national = withoutZero.substring(2).replace(/^0+/, '')
      } else {
        national = withoutZero
      }
    }
  } else if (digits.length === 10 || digits.length === 11) {
    national = digits
  }

  // 2. Se temos um número nacional reconhecível (DDD de 2 dígitos + 8 ou 9 dígitos)
  if (national && (national.length === 10 || national.length === 11)) {
    const ddd = national.substring(0, 2)
    const subscriber = national.substring(2)

    set.add(national)
    set.add('55' + national)

    // Se for celular com 9 dígitos (começando com 9 e tamanho 9)
    if (subscriber.length === 9 && subscriber.startsWith('9')) {
      const subscriber8 = subscriber.substring(1)
      const national8 = ddd + subscriber8
      set.add(national8)
      set.add('55' + national8)
    } else if (subscriber.length === 8) {
      // Se for celular legado de 8 dígitos (começando com 6, 7, 8 ou 9)
      const firstDigit = subscriber.charAt(0)
      if (firstDigit >= '6' && firstDigit <= '9') {
        const national9 = ddd + '9' + subscriber
        set.add(national9)
        set.add('55' + national9)
      }
    }
  } else if (national && national.length >= 8) {
    set.add(national)
    if (!national.startsWith('55')) {
      set.add('55' + national)
    }
  }

  // Se os dígitos originais começavam com 0, garantir versão sem zero e com 55
  if (digits.startsWith('0')) {
    const simpleNoZero = digits.replace(/^0+/, '')
    if (simpleNoZero && simpleNoZero.length >= 8) {
      set.add(simpleNoZero)
      if (
        (simpleNoZero.length === 10 || simpleNoZero.length === 11) &&
        !simpleNoZero.startsWith('55')
      ) {
        set.add('55' + simpleNoZero)
      }
    }
  }

  return Array.from(set).filter((v) => Boolean(v && v.length >= 8))
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
