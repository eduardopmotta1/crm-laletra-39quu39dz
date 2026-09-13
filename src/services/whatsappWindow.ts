import pb from '@/lib/pocketbase/client'
import type { Message } from '@/types/crm'

/**
 * Serviço de Janela de Atendimento 24h WhatsApp Meta
 *
 * Espelho frontend da lógica backend implementada em:
 * pocketbase/hooks/production_status_notify.js
 *
 * REGRAS OFICIAIS:
 * 1. A fonte final de verdade é a última mensagem INBOUND real do cliente em `messages`,
 *    mesmo que pertença a um atendimento arquivado/anterior e mesmo que client.last_message_direction seja 'outbound'.
 * 2. Mensagens outbound (enviadas pela gráfica) NUNCA fecham, reiniciam ou invalidam a janela de 24h.
 * 3. client.last_message_at NUNCA é usado como fonte de inbound quando last_message_direction === 'outbound'.
 * 4. Janela válida: 0 <= (now - lastInboundAt) <= 24h.
 */

export interface LastInboundOptions {
  /**
   * Timestamp candidato direto (ex: attendance.last_customer_message_at)
   */
  attendanceLastCustomerMessageAt?: string | null
  /**
   * Array opcional de mensagens já carregadas localmente no componente.
   * Se fornecido e contiver inbound válida, pode ser usado para enriquecer/evitar requisição imediata.
   */
  localMessages?: Message[]
  /**
   * Se true, pula a consulta de rede em `messages` (usado quando já temos mensagens locais completas).
   */
  skipRemoteFetch?: boolean
}

/**
 * Helper síncrono para escolher o timestamp mais recente entre candidatos conhecidos
 */
export function selectMostRecentIso(
  ...timestamps: Array<string | null | undefined>
): string | null {
  let bestEpoch = -Infinity
  let bestIso: string | null = null

  for (const item of timestamps) {
    if (!item || typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed) continue
    const epoch = new Date(trimmed).getTime()
    if (!isNaN(epoch) && epoch > 0 && epoch > bestEpoch) {
      bestEpoch = epoch
      bestIso = trimmed
    }
  }

  return bestIso
}

/**
 * Busca e resolve o timestamp ISO da última mensagem inbound real do cliente.
 *
 * Lógica:
 * (a) candidato = attendance.last_customer_message_at se existir e for válido;
 * (b) buscar em `messages` a última inbound do mesmo client_id SEM filtrar por attendance
 *     (direction='inbound', sort '-created');
 * (c) retornar o timestamp MAIS RECENTE entre os dois.
 *     client.last_message_at não deve ser usado como fonte de inbound quando direction='outbound'.
 */
export async function lastInboundAt(
  clientId: string,
  attendanceId?: string | null,
  options?: LastInboundOptions,
): Promise<string | null> {
  let candidateAttendanceIso: string | null = null

  // (a) Candidato 1: attendance.last_customer_message_at (se passado por options ou se buscado)
  if (options?.attendanceLastCustomerMessageAt) {
    const raw = options.attendanceLastCustomerMessageAt.trim()
    const epoch = new Date(raw).getTime()
    if (!isNaN(epoch) && epoch > 0) {
      candidateAttendanceIso = raw
    }
  } else if (attendanceId) {
    try {
      const att = await pb.collection('attendances').getOne(attendanceId, {
        fields: 'id,last_customer_message_at',
        requestKey: null,
      })
      if (att && att.last_customer_message_at) {
        const raw = String(att.last_customer_message_at).trim()
        const epoch = new Date(raw).getTime()
        if (!isNaN(epoch) && epoch > 0) {
          candidateAttendanceIso = raw
        }
      }
    } catch {
      // Ignora falha na busca do attendance individual
    }
  }

  // Verificar se há mensagens locais fornecidas
  let localInboundIso: string | null = null
  if (options?.localMessages && Array.isArray(options.localMessages)) {
    for (const msg of options.localMessages) {
      if (msg.direction === 'inbound') {
        const t = new Date(msg.created).getTime()
        if (!isNaN(t) && t > 0) {
          if (!localInboundIso || t > new Date(localInboundIso).getTime()) {
            localInboundIso = msg.created
          }
        }
      }
    }
  }

  let remoteInboundIso: string | null = null

  // (b) Candidato 2: buscar em messages a última inbound do mesmo client_id SEM filtrar por attendance
  if (clientId && !options?.skipRemoteFetch) {
    try {
      const inbounds = await pb.collection<Message>('messages').getList(1, 1, {
        filter: `client_id = "${clientId}" && direction = "inbound"`,
        sort: '-created',
        requestKey: null,
      })
      if (inbounds.items.length > 0 && inbounds.items[0].created) {
        remoteInboundIso = inbounds.items[0].created
      }
    } catch (err) {
      console.warn('[whatsappWindow] Erro ao buscar última mensagem inbound em messages:', err)
    }
  }

  // (c) Retornar o timestamp MAIS RECENTE entre todos os candidatos válidos
  return selectMostRecentIso(candidateAttendanceIso, localInboundIso, remoteInboundIso)
}

/**
 * Helper síncrono puro para cálculo da janela 24h a partir de um timestamp inbound e referenceTime.
 * Janela válida: 0 <= (refTime - lastInboundTime) <= 24h.
 */
export function isTimestampWithin24h(
  inboundTimestamp?: string | null,
  referenceTime?: string | number | Date,
): boolean {
  if (!inboundTimestamp || typeof inboundTimestamp !== 'string') {
    return false
  }

  const messageTime = new Date(inboundTimestamp.trim()).getTime()
  if (isNaN(messageTime) || messageTime <= 0) {
    return false
  }

  const refTime = referenceTime ? new Date(referenceTime).getTime() : Date.now()
  if (isNaN(refTime)) {
    return false
  }

  const diffMs = refTime - messageTime
  const diffHours = diffMs / (1000 * 60 * 60)

  // 0 <= (now - lastInboundAt) <= 24h
  return diffHours >= 0 && diffHours <= 24
}
