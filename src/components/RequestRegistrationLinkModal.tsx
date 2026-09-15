import React, { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Link2,
  Copy,
  Check,
  MessageSquare,
  Clock,
  AlertTriangle,
  Send,
  ExternalLink,
  Sparkles,
} from 'lucide-react'
import type { Client } from '@/types/crm'
import { toast } from '@/hooks/use-toast'
import {
  clientRegistrationLinkService,
  defaultRequestRegistrationLinkMessage,
} from '@/services/clientRegistrationLink'

export interface RequestRegistrationLinkModalProps {
  isOpen: boolean
  onClose: () => void
  client: Client | null
  attendanceId?: string | null
  phoneOverride?: string
  /**
   * Chamado quando o usuário opta por abrir o fluxo de Template Oficial
   * caso a janela de 24h esteja fechada.
   */
  onOpenTemplateModal?: () => void
  /**
   * Callback disparado quando a mensagem for enviada com sucesso pelo WhatsApp.
   */
  onSuccess?: () => void
  /**
   * Callback disparado quando o link é gerado / atualizado no cliente.
   */
  onClientTokenGenerated?: (token: string) => void
}

export default function RequestRegistrationLinkModal({
  isOpen,
  onClose,
  client,
  attendanceId,
  phoneOverride,
  onOpenTemplateModal,
  onSuccess,
  onClientTokenGenerated,
}: RequestRegistrationLinkModalProps) {
  const [publicUrl, setPublicUrl] = useState<string>('')
  const [copiedLink, setCopiedLink] = useState(false)
  const [isCheckingWindow, setIsCheckingWindow] = useState(false)
  const [isWindowOpen, setIsWindowOpen] = useState(false)
  const [messageDraft, setMessageDraft] = useState<string>('')
  const [isEditingMessage, setIsEditingMessage] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const effectivePhone = phoneOverride || client?.phone || ''
  const clientName = client?.name || 'Cliente'

  // Ao abrir o modal, carrega o link/token e verifica a janela 24h SEM enviar mensagem automaticamente
  const initModalData = useCallback(async () => {
    if (!client || !client.id) return

    setIsCheckingWindow(true)
    setCopiedLink(false)
    setIsEditingMessage(false)

    try {
      // 1. Assegurar token/link público do cliente
      const linkResult = await clientRegistrationLinkService.ensureLinkForClient(client)
      const url = linkResult.url
      setPublicUrl(url)
      setMessageDraft(defaultRequestRegistrationLinkMessage(url))

      if (linkResult.token && linkResult.token !== client.public_token) {
        if (onClientTokenGenerated) {
          onClientTokenGenerated(linkResult.token)
        }
      }

      // 2. Verificar janela 24h com a regra global (lastInboundAt + isTimestampWithin24h)
      const windowCheck = await clientRegistrationLinkService.checkWindow(client.id, {
        attendanceId: attendanceId || null,
        attendanceLastCustomerMessageAt: (client as any).last_customer_message_at || null,
      })

      setIsWindowOpen(windowCheck.isOpen)
    } catch (err) {
      console.warn('[RequestRegistrationLinkModal] Erro ao carregar dados do link:', err)
      setIsWindowOpen(false)
    } finally {
      setIsCheckingWindow(false)
    }
  }, [client, attendanceId, onClientTokenGenerated])

  useEffect(() => {
    if (isOpen && client) {
      initModalData()
    } else if (!isOpen) {
      setPublicUrl('')
      setCopiedLink(false)
      setIsWindowOpen(false)
      setMessageDraft('')
      setIsEditingMessage(false)
      setIsSending(false)
    }
  }, [isOpen, client, initModalData])

  const handleCopyLink = async () => {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopiedLink(true)
      toast({
        title: 'Link copiado com sucesso!',
        description: 'Envie o link para o cliente completar ou revisar os dados cadastrais.',
      })
      setTimeout(() => setCopiedLink(false), 3000)
    } catch {
      toast({
        title: 'Não foi possível copiar',
        description: 'Selecione e copie o link manualmente.',
        variant: 'destructive',
      })
    }
  }

  const handleSendViaWhatsApp = async () => {
    if (!client || !client.id) return
    if (!publicUrl) {
      toast({
        title: 'Link de cadastro não gerado',
        description: 'Não foi possível encontrar o link de cadastro deste cliente.',
        variant: 'destructive',
      })
      return
    }

    setIsSending(true)
    try {
      const result = await clientRegistrationLinkService.sendViaWhatsApp({
        client,
        attendanceId: attendanceId || null,
        messageText: messageDraft.trim() || defaultRequestRegistrationLinkMessage(publicUrl),
      })

      if (!result.success) {
        toast({
          title: result.within24h ? 'Erro ao enviar pelo WhatsApp' : 'Janela de 24h fechada',
          description: result.error || 'Não foi possível enviar a mensagem.',
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Link enviado pelo WhatsApp!',
        description: `O link de cadastro foi enviado com sucesso para ${clientName}.`,
      })
      window.dispatchEvent(new CustomEvent('crm-client-updated'))
      if (onSuccess) {
        onSuccess()
      }
      onClose()
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar pelo WhatsApp',
        description:
          err?.message || 'Não foi possível enviar a mensagem pelo WhatsApp. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-600" />
            Solicitar atualização de cadastro
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Dados resumidos do cliente */}
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between">
            <div>
              <span className="text-slate-500 block text-[11px]">Cliente</span>
              <strong className="text-slate-800 dark:text-slate-100">{clientName}</strong>
            </div>
            {effectivePhone && (
              <div className="text-right">
                <span className="text-slate-500 block text-[11px]">WhatsApp</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {effectivePhone}
                </span>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Envie o link público exclusivo abaixo para o cliente. Ao acessar, ele poderá visualizar,
            corrigir e completar os próprios dados cadastrais e de endereço de forma autônoma e
            segura.
          </p>

          {/* Input do link com botão copiar */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Link Público do Cliente:
            </label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={publicUrl}
                placeholder={isCheckingWindow ? 'Gerando link...' : ''}
                className="font-mono text-xs bg-slate-50 dark:bg-slate-900 select-all"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                type="button"
                size="sm"
                onClick={handleCopyLink}
                disabled={!publicUrl}
                className="bg-blue-600 hover:bg-blue-700 text-white shrink-0 font-semibold text-xs gap-1.5"
              >
                {copiedLink ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar link
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Seção de Envio pelo WhatsApp com verificação da Janela de 24h */}
          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                Enviar pelo WhatsApp do Cliente
              </label>
              {effectivePhone && (
                <span className="text-[11px] font-mono text-slate-500">{effectivePhone}</span>
              )}
            </div>

            {isCheckingWindow ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5 animate-spin text-slate-400" />
                <span>Verificando janela de 24h do WhatsApp...</span>
              </div>
            ) : !isWindowOpen ? (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-xs space-y-2">
                <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Janela de 24h fechada.</p>
                    <p className="text-amber-800 dark:text-amber-300 text-[11px] mt-0.5 leading-relaxed">
                      Não é permitido enviar mensagem de texto livre fora da janela de 24 horas.
                      Para iniciar uma conversa com este cliente, utilize um Template Oficial
                      aprovado pela Meta ou copie o link acima manualmente.
                    </p>
                  </div>
                </div>
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[10px] text-amber-700 dark:text-amber-400">
                    Regra oficial Meta / WhatsApp Cloud API
                  </span>
                  {onOpenTemplateModal && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        onClose()
                        onOpenTemplateModal()
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-3 gap-1 font-semibold"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Template Oficial
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Janela de 24h ativa • Mensagem pronta para disparo
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingMessage((prev) => !prev)}
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 text-[11px] font-semibold hover:underline"
                  >
                    {isEditingMessage ? 'Concluir edição' : 'Editar texto'}
                  </button>
                </div>

                {isEditingMessage ? (
                  <Textarea
                    value={messageDraft}
                    onChange={(e) => setMessageDraft(e.target.value)}
                    rows={4}
                    className="text-xs bg-white dark:bg-slate-900 resize-none font-sans"
                    placeholder="Digite a mensagem que acompanhará o link..."
                  />
                ) : (
                  <div className="p-3 rounded-xl bg-[#d9fdd3]/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 text-xs text-slate-800 dark:text-slate-100 whitespace-pre-wrap font-sans leading-relaxed shadow-inner max-h-36 overflow-y-auto">
                    {messageDraft || defaultRequestRegistrationLinkMessage(publicUrl)}
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isSending || !publicUrl}
                    onClick={handleSendViaWhatsApp}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold gap-1.5 shadow-xs"
                  >
                    {isSending ? (
                      <>
                        <Clock className="h-3.5 w-3.5 animate-spin" />
                        <span>Enviando pelo WhatsApp...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>Enviar pelo WhatsApp</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-400 text-[11px]">
              Token reutilizável e exclusivo deste cliente.
            </span>
            {publicUrl && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold inline-flex items-center gap-1 hover:underline text-xs"
              >
                Abrir link <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
