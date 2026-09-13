/**
 * Utilitários para manuseio, combinação, decomposição e exibição do campo `due_date` de Follow-up (tarefas).
 *
 * Regras do sistema:
 * - O banco (PocketBase DateField) suporta datetime nativo (ex: '2026-09-14 10:30:00.000Z' ou ISO).
 * - Registros legados possuem hora '00:00:00.000Z' (ou apenas 'YYYY-MM-DD'). Devem ser tratados como legado SEM horário (exibidos apenas com data).
 * - Novos follow-ups combinam data (YYYY-MM-DD) e hora (HH:mm) em datetime completo.
 */

/**
 * Combina data (YYYY-MM-DD) e hora (HH:mm) para armazenamento completo no PocketBase.
 * Retorna ISO string ou string com datetime completo.
 * Exemplo: combineDateAndTimeForStorage('2026-09-14', '10:30') => '2026-09-14T10:30:00.000Z' (ou local/UTC seguro)
 */
export function combineDateAndTimeForStorage(datePart: string, timePart?: string): string {
  const cleanDate = (datePart || '').trim().replace('T', ' ').split(' ')[0]
  if (!cleanDate) return ''

  const cleanTime = (timePart || '').trim()
  if (!cleanTime) {
    // Se não informou hora, preserva dia com meia-noite
    return `${cleanDate} 00:00:00.000Z`
  }

  // timePart formato HH:mm ou HH:mm:ss
  const timePieces = cleanTime.split(':')
  const hours = timePieces[0].padStart(2, '0')
  const minutes = (timePieces[1] || '00').padStart(2, '0')
  const seconds = (timePieces[2] || '00').padStart(2, '0')

  // Criamos o objeto Date no horário local para gerar timestamp UTC ISO confiável
  const [year, month, day] = cleanDate.split('-').map(Number)
  if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
    const localDate = new Date(
      year,
      month - 1,
      day,
      Number(hours),
      Number(minutes),
      Number(seconds),
    )
    if (!isNaN(localDate.getTime())) {
      return localDate.toISOString()
    }
  }

  return `${cleanDate} ${hours}:${minutes}:${seconds}.000Z`
}

/**
 * Decompõe um due_date vindo do banco/PocketBase em { date: 'YYYY-MM-DD', time: 'HH:mm', hasTime: boolean }.
 * Se a hora for 00:00:00 (ou não existir hora no registro legado), hasTime é false e time é ''.
 */
export function parseTaskDueDate(dueDate?: string | null): {
  date: string
  time: string
  hasTime: boolean
} {
  if (!dueDate || typeof dueDate !== 'string') {
    return { date: '', time: '', hasTime: false }
  }

  const trimmed = dueDate.trim()
  if (!trimmed) {
    return { date: '', time: '', hasTime: false }
  }

  // Tenta extrair date e time
  // Formatos comuns: '2026-09-14 10:30:00.000Z', '2026-09-14T10:30:00.000Z', '2026-09-14'
  let datePart = ''
  let timePart = ''

  if (trimmed.includes('T')) {
    const parts = trimmed.split('T')
    datePart = parts[0]
    timePart = parts[1] || ''
  } else if (trimmed.includes(' ')) {
    const parts = trimmed.split(' ')
    datePart = parts[0]
    timePart = parts[1] || ''
  } else {
    datePart = trimmed
  }

  // Valida data YYYY-MM-DD
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart)
  if (!dateMatch) {
    // Tenta via Date
    const d = new Date(trimmed)
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      datePart = `${year}-${month}-${day}`
    } else {
      return { date: '', time: '', hasTime: false }
    }
  }

  // Checar se possui hora diferente de 00:00(:00)
  // Atenção ao timezone: se foi gravado como UTC ISO, reconstruir horário local
  const parsedDate = new Date(trimmed)
  if (!isNaN(parsedDate.getTime())) {
    // Pegar horas e minutos locais
    const hours = parsedDate.getHours()
    const minutes = parsedDate.getMinutes()
    const seconds = parsedDate.getSeconds()

    // Checar se é registro legado (00:00:00 no horário UTC ou local)
    // Se a string original contiver "00:00:00" ou apenas a data YYYY-MM-DD
    const isLegacyMidnight =
      !timePart ||
      timePart.startsWith('00:00:00') ||
      trimmed.endsWith('00:00:00.000Z') ||
      trimmed.endsWith('00:00:00Z')

    if (isLegacyMidnight) {
      return {
        date: datePart,
        time: '',
        hasTime: false,
      }
    }

    const timeFormatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    return {
      date: datePart,
      time: timeFormatted,
      hasTime: true,
    }
  }

  return { date: datePart, time: '', hasTime: false }
}

/**
 * Formata um due_date de follow-up para exibição amigável:
 * - Legado (sem hora ou 00:00:00): apenas data "DD/MM/YYYY" (ex: 14/09/2026)
 * - Com hora: "DD/MM/YYYY às HH:mm" (ex: 14/09/2026 às 10:30)
 */
export function formatFollowUpDateTime(dueDate?: string | null): string {
  if (!dueDate) return '-'

  const parsed = parseTaskDueDate(dueDate)
  if (!parsed.date) return '-'

  const [year, month, day] = parsed.date.split('-')
  const dateStr = `${day}/${month}/${year}`

  if (parsed.hasTime && parsed.time) {
    return `${dateStr} às ${parsed.time}`
  }

  return dateStr
}
