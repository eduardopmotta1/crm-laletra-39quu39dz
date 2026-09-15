import pb from '@/lib/pocketbase/client'
import type { Client } from '@/types/crm'
import { clientsService } from './clients'
import { lastInboundAt, isTimestampWithin24h } from './whatsappWindow'
import { whatsappService } from './whatsapp'

export interface CheckRegistrationLinkWindowOptions {
  attendanceId?: string | null
  attendanceLastCustomerMessageAt?: string | null
  referenceTime?: string | number | Date
}

export interface SendRegistrationLinkWhatsAppOptions {
  client: Client
  attendanceId?: string | null
  messageText?: string
  referenceTime?: string | number | Date
}

export interface SendRegistrationLinkWhatsAppResult {
  success: boolean
  error?: string
  within24h: boolean
  resolvedInboundIso: string | null
  linkUrl: string
  messageSent?: string
  response?: any
}

/**
 * Mensagem padrão para envio do link de atualização/preenchimento cadastral.
 */
export function defaultRequestRegistrationLinkMessage(linkUrl: string): string {
  return `Olá! Para mantermos seu cadastro atualizado, por favor preencha seus dados neste link:\n\n${linkUrl}\n\nÉ rapidinho e ajuda a agilizar seus próximos pedidos.`
}

/**
 * Garante que o cliente possua um public_token gerado e retorna a URL pública final.
 * Reutiliza estritamente clientsService.ensurePublicToken + getPublicClientUrl (mesma estratégia existente).
 */
export async function ensureRegistrationLinkForClient(client: Client): Promise<{
  token: string
  url: string
  updatedClient: Client
}> {
  let activeToken = client.public_token || ''
  let currentClient = client

  if (!activeToken || activeToken.trim() === '') {
    const updated = await clientsService.ensurePublicToken(client)
    if (updated.public_token) {
      activeToken = updated.public_token
      currentClient = updated
    }
  }

  const url = activeToken
    ? clientsService.getPublicClientUrl({ public_token: activeToken, id: currentClient.id })
    : ''

  return {
    token: activeToken,
    url,
    updatedClient: currentClient,
  }
}

/**
 * Consulta e verifica a Janela Oficial de 24h Meta utilizando a REGRA GLOBAL COMPLETA:
 * - lastInboundAt(clientId, attendanceId, options)
 * - isTimestampWithin24h(resolvedInboundIso, referenceTime)
 *
 * REGRAS METICULOSAMENTE PRESERVADAS:
 * 1. A fonte final de verdade é a última mensagem INBOUND real do cliente em `messages`,
 *    inclusive em atendimentos arquivados.
 * 2. Outbounds posteriores da gráfica NUNCA fecham nem reiniciam a janela.
 * 3. Se não houver inbound ou a última for > 24h, a janela é considerada FECHADA.
 */
export async function checkRegistrationLinkWindow(
  clientId: string,
  options?: CheckRegistrationLinkWindowOptions,
): Promise<{
  isOpen: boolean
  resolvedInboundIso: string | null
}> {
  if (!clientId) {
    return { isOpen: false, resolvedInboundIso: null }
  }

  try {
    const resolvedInboundIso = await lastInboundAt(clientId, options?.attendanceId || null, {
      attendanceLastCustomerMessageAt: options?.attendanceLastCustomerMessageAt || null,
    })
    const isOpen = isTimestampWithin24h(resolvedInboundIso, options?.referenceTime)
    return {
      isOpen,
      resolvedInboundIso,
    }
  } catch (err) {
    console.warn('[clientRegistrationLink] Erro ao consultar janela 24h:', err)
    return { isOpen: false, resolvedInboundIso: null }
  }
}

/**
 * Dispara o envio do link de atualização/cadastro via WhatsApp:
 * 1. Assegura que o cliente tem token e link público.
 * 2. Valida a Janela de 24h via regra global (lastInboundAt + isTimestampWithin24h).
 *    Se estiver fechada, BLOQUEIA o envio freeform e retorna erro claro sobre Template Oficial.
 * 3. Se aberta, resolve atendimento ativo (se necessário) e envia via whatsappService.sendMessage.
 */
export async function sendRegistrationLinkViaWhatsApp(
  options: SendRegistrationLinkWhatsAppOptions,
): Promise<SendRegistrationLinkWhatsAppResult> {
  const { client, messageText, referenceTime } = options

  if (!client || !client.id) {
    return {
      success: false,
      error: 'Cliente não identificado.',
      within24h: false,
      resolvedInboundIso: null,
      linkUrl: '',
    }
  }

  // 1. Garantir token e link
  const linkData = await ensureRegistrationLinkForClient(client)
  const url = linkData.url
  if (!url) {
    return {
      success: false,
      error: 'Link de cadastro não gerado.',
      within24h: false,
      resolvedInboundIso: null,
      linkUrl: '',
    }
  }

  // 2. Verificar janela de 24h
  const windowCheck = await checkRegistrationLinkWindow(client.id, {
    attendanceId: options.attendanceId,
    attendanceLastCustomerMessageAt: (client as any).last_customer_message_at || null,
    referenceTime,
  })

  if (!windowCheck.isOpen) {
    return {
      success: false,
      error:
        'Não é possível enviar mensagem livre fora da janela de 24h. Utilize um Template Oficial aprovado pela Meta para iniciar uma nova conversa.',
      within24h: false,
      resolvedInboundIso: windowCheck.resolvedInboundIso,
      linkUrl: url,
    }
  }

  // 3. Montar texto e resolver attendance ativo se não fornecido
  const textToSend = messageText?.trim() || defaultRequestRegistrationLinkMessage(url)
  let attId = options.attendanceId || null

  if (!attId && client.id) {
    try {
      const atts = await pb.collection('attendances').getList(1, 1, {
        filter: `client_id = "${client.id}" && is_archived != true`,
        sort: '-created',
        requestKey: null,
      })
      if (atts.items.length > 0) {
        attId = atts.items[0].id
      }
    } catch {
      /* non-fatal */
    }
  }

  try {
    const res = await whatsappService.sendMessage({
      clientId: client.id,
      attendanceId: attId || undefined,
      messageText: textToSend,
    })

    if (!res.success || res.error) {
      return {
        success: false,
        error: res.error || 'Falha ao enviar mensagem de solicitação de cadastro.',
        within24h: true,
        resolvedInboundIso: windowCheck.resolvedInboundIso,
        linkUrl: url,
        messageSent: textToSend,
        response: res,
      }
    }

    return {
      success: true,
      within24h: true,
      resolvedInboundIso: windowCheck.resolvedInboundIso,
      linkUrl: url,
      messageSent: textToSend,
      response: res,
    }
  } catch (err: any) {
    console.error('[clientRegistrationLink] Erro no envio WhatsApp:', err)
    return {
      success: false,
      error: err?.message || 'Não foi possível enviar a mensagem pelo WhatsApp. Tente novamente.',
      within24h: true,
      resolvedInboundIso: windowCheck.resolvedInboundIso,
      linkUrl: url,
      messageSent: textToSend,
    }
  }
}

export const clientRegistrationLinkService = {
  defaultMessage: defaultRequestRegistrationLinkMessage,
  ensureLinkForClient: ensureRegistrationLinkForClient,
  checkWindow: checkRegistrationLinkWindow,
  sendViaWhatsApp: sendRegistrationLinkViaWhatsApp,
}
