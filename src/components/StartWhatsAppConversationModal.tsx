import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MessageSquare,
  Send,
  Phone,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  Layers,
  Clock,
} from 'lucide-react'
import type { Client, WhatsAppTemplate } from '@/types/crm'
import type { Quote } from '@/types/quotes'
import pb from '@/lib/pocketbase/client'
import { whatsappService } from '@/services/whatsapp'
import { attendancesService } from '@/services/attendances'
import { quotesService } from '@/services/quotes'
import {
  whatsappTemplatesService,
  extractVariablesFromBody,
  renderTemplatePreview,
} from '@/services/whatsappTemplates'
import { formatCurrency, formatQuoteItemsSummary } from '@/lib/sla'
import { toast } from '@/hooks/use-toast'

interface StartWhatsAppConversationModalProps {
  isOpen: boolean
  onClose: () => void
  client: Client | null
  initialQuote?: Quote | null
  initialTemplateName?: string
  onSuccess?: (updatedClient: Client) => void
}

export default function StartWhatsAppConversationModal({
  isOpen,
  onClose,
  client,
  initialQuote,
  initialTemplateName,
  onSuccess,
}: StartWhatsAppConversationModalProps) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({})
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [sending, setSending] = useState(false)

  // Target stage after starting conversation
  const [targetStage, setTargetStage] = useState<
    'Contato iniciado' | 'Aguardando cliente' | 'Orçamento enviado'
  >(initialQuote ? 'Orçamento enviado' : 'Contato iniciado')

  useEffect(() => {
    if (isOpen) {
      loadApprovedTemplates()
    }
  }, [isOpen, initialQuote, initialTemplateName])

  const loadApprovedTemplates = async () => {
    setLoadingTemplates(true)
    try {
      const list = await whatsappTemplatesService.getApproved()
      setTemplates(list)
      if (list.length > 0) {
        let chosen = list[0]

        if (initialQuote || initialTemplateName === 'envio_orcamento_express') {
          const orcTpl = list.find((t) => t.name === 'envio_orcamento_express')
          if (orcTpl) {
            chosen = orcTpl
            setTargetStage('Orçamento enviado')
          }
        } else if (initialTemplateName) {
          const matched = list.find((t) => t.name === initialTemplateName)
          if (matched) chosen = matched
        } else {
          // Início de conversa padrão: dar preferência para o template inicial de contato
          const firstContactTpl = list.find((t) => t.name === 'primeiro_contato_lead')
          if (firstContactTpl) chosen = firstContactTpl
          setTargetStage('Contato iniciado')
        }

        setSelectedTemplateId(chosen.id)
        initVarsForTemplate(chosen, client, initialQuote)
      }
    } catch (err) {
      console.error('Error loading approved templates:', err)
    } finally {
      setLoadingTemplates(false)
    }
  }

  // When client, quote, or template selection changes, auto-fill variables
  const initVarsForTemplate = (
    tpl: WhatsAppTemplate,
    targetClient: Client | null,
    targetQuote?: Quote | null,
  ) => {
    const vars = tpl.variables || extractVariablesFromBody(tpl.body)
    const initialMap: Record<string, string> = {}

    const clientFirstName = targetClient?.name ? targetClient.name.split(' ')[0] : ''
    const clientFullName = targetClient?.name || ''

    // Se temos um quote selecionado, o produto e o valor DEVEM vir estritamente de quote.items e quote.total
    const quoteProductSummary = targetQuote ? formatQuoteItemsSummary(targetQuote.items) : ''
    const quoteValueFormatted = targetQuote
      ? formatCurrency(
          targetQuote.final_total !== undefined && targetQuote.final_total !== null
            ? targetQuote.final_total
            : targetQuote.total_sale || 0,
        )
      : ''

    // Para início de conversa sem orçamento real:
    // Produto é opcional / genérico ("nossos serviços gráficos") e nunca orçamento vinculado
    const fallbackProduct = 'nossos serviços gráficos'
    const fallbackQuote = 'sob consulta'

    vars.forEach((v) => {
      const lower = v.toLowerCase()
      if (lower.includes('nome') || lower === '1') {
        initialMap[v] = clientFirstName || clientFullName
      } else if (lower.includes('produto') || lower.includes('servico') || lower === '2') {
        // Se temos um quote real, usar estritamente o resumo dos itens do quote
        initialMap[v] = quoteProductSummary || fallbackProduct
      } else if (lower.includes('orcamento') || lower.includes('valor') || lower === '3') {
        // Se temos um quote real, usar estritamente o total do quote
        initialMap[v] = quoteValueFormatted || fallbackQuote
      } else if (lower.includes('empresa') || lower.includes('grafica')) {
        initialMap[v] = 'Gráfica Laletra'
      } else {
        initialMap[v] = ''
      }
    })

    setTemplateVars(initialMap)
  }

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId)
    const found = templates.find((t) => t.id === templateId)
    if (found) {
      initVarsForTemplate(found, client, initialQuote)
      if (found.name === 'envio_orcamento_express') {
        setTargetStage('Orçamento enviado')
      }
    }
  }

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)
  const currentVarsList = selectedTemplate
    ? selectedTemplate.variables || extractVariablesFromBody(selectedTemplate.body)
    : []

  const renderedBody = selectedTemplate
    ? renderTemplatePreview(selectedTemplate.body, templateVars)
    : ''

  // Validate phone
  const cleanPhone = client?.phone ? client.phone.replace(/[^0-9]/g, '') : ''
  const hasValidPhone = Boolean(cleanPhone && cleanPhone.length >= 8)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!client) return

    if (!hasValidPhone) {
      toast({
        title: 'Número inválido',
        description: 'O cliente não possui um número de WhatsApp cadastrado.',
        variant: 'destructive',
      })
      return
    }

    if (!selectedTemplate) {
      toast({
        title: 'Selecione um template',
        description: 'Escolha um modelo de mensagem aprovado para iniciar o contato.',
        variant: 'destructive',
      })
      return
    }

    setSending(true)
    try {
      // 1. Resolve canonical client if target client is a merged/consolidated record
      let targetClientId = client.id
      if (client.notes) {
        const match = client.notes.match(/\[DUPLICADO_CONSOLIDADO\s*->\s*([a-zA-Z0-9_-]+)\]/i)
        if (match && match[1]) {
          targetClientId = match[1]
        }
      }

      // 2. Disparar template
      const res = await whatsappService.sendTemplateMessage({
        clientId: targetClientId,
        templateName: selectedTemplate.name,
        templateLanguage: selectedTemplate.language || 'pt_BR',
        templateVariables: templateVars,
        renderedText: renderedBody,
        changeStageTo: targetStage,
      })

      if (res.success) {
        // Se foi o envio de um orçamento específico, atualizar status do quote para 'enviado'
        if (initialQuote && initialQuote.id) {
          try {
            await quotesService.updateStatus(initialQuote.id, 'enviado')
          } catch (qErr) {
            console.warn('Erro ao atualizar status do orçamento após template:', qErr)
          }
        }

        // 3. Garantir que se o cliente não possuía attendance ativo ou estava arquivado,
        // criamos/reativamos o attendance para este ciclo de conversa
        try {
          const activeAtts = await pb.collection('attendances').getList(1, 1, {
            filter: `client_id = "${targetClientId}" && is_archived != true`,
            sort: '-created',
            requestKey: null,
          })

          if (activeAtts.items.length === 0) {
            // Cria attendance ativo para o client existente sem exigir produto
            await attendancesService.createForClient(targetClientId, {
              stage: targetStage as any,
              product_interest: targetQuote
                ? formatQuoteItemsSummary(targetQuote.items)
                : client.product_interest || '',
              assigned_to: client.assigned_to || '',
              source: 'whatsapp_outbound_template',
            })
          } else {
            // Atualiza etapa do atendimento ativo
            await attendancesService.updateStage(activeAtts.items[0].id, targetStage as any, {
              notes: `Template de WhatsApp enviado: ${selectedTemplate.name}`,
            })
          }
        } catch (attErr) {
          console.warn('Error verifying active attendance on start chat:', attErr)
        }

        toast({
          title: '💬 Conversa Iniciada no WhatsApp!',
          description: `Mensagem enviada com sucesso para ${client.name}. Etapa atualizada para "${targetStage}".`,
        })
        if (onSuccess && res.client) {
          onSuccess({
            ...client,
            stage: res.client.stage || targetStage,
            last_message_at: res.client.last_message_at || new Date().toISOString().split('T')[0],
            last_message_direction: 'outbound',
            last_message_text: renderedBody,
          })
        }
        window.dispatchEvent(new CustomEvent('crm-client-updated'))
        onClose()
      } else {
        toast({
          title: 'Erro ao enviar mensagem',
          description: res.error || 'Não foi possível disparar o template da Meta.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Falha no disparo',
        description: err?.message || 'Erro de comunicação ao enviar template.',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  if (!client) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
                Iniciar conversa no WhatsApp
              </DialogTitle>
              <DialogDescription className="text-xs">
                Dispare uma mensagem oficial para <strong>{client.name}</strong> usando um template
                aprovado.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!hasValidPhone ? (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 space-y-3 my-2">
            <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-semibold text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Telefone de WhatsApp não cadastrado
            </div>
            <p className="text-xs text-rose-600 dark:text-rose-400">
              Este cliente não possui um número de telefone válido registrado. Edite o cadastro do
              cliente e informe o telefone com DDD antes de iniciar o atendimento pelo WhatsApp.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs text-rose-700 border-rose-300"
            >
              Fechar e Cadastrar Telefone
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-4 pt-1">
            {/* Client Info Strip */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {client.name}
                </span>
                <span className="text-slate-400">•</span>
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <Phone className="h-3 w-3" />
                  {client.phone}
                </span>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {client.stage}
              </Badge>
            </div>

            {/* Template Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-emerald-600" />
                  Template Aprovado (Meta Cloud API) *
                </label>
                {loadingTemplates && (
                  <span className="text-[10px] text-slate-400 animate-pulse">Carregando...</span>
                )}
              </div>
              <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Selecione um template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{tpl.name}</span>
                        <span className="text-[10px] text-slate-400">({tpl.category})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Variables Inputs */}
            {currentVarsList.length > 0 && (
              <div className="space-y-2.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                    Variáveis do Template (Auto-preenchidas)
                  </span>
                  <span className="text-[10px] text-emerald-600 font-medium">
                    {currentVarsList.length} campos dinâmicos
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {currentVarsList.map((v) => (
                    <div key={v}>
                      <label className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {`{{${v}}}`}
                      </label>
                      <Input
                        value={templateVars[v] || ''}
                        onChange={(e) => setTemplateVars({ ...templateVars, [v]: e.target.value })}
                        placeholder={`Valor para {{${v}}}`}
                        className="h-8 text-xs mt-0.5"
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live Rendered WhatsApp Message Preview */}
            {selectedTemplate && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Prévia da Mensagem que o Cliente Receberá:
                </span>
                <div className="p-3.5 rounded-2xl bg-[#efeae2]/60 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800">
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 shadow-sm leading-relaxed whitespace-pre-wrap rounded-tl-none border border-slate-100 dark:border-slate-700">
                    {renderedBody}
                    <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 mt-1">
                      <span>Agora</span>
                      <span className="text-emerald-600 font-bold">✓✓</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Stage Transition Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5 text-emerald-600" />
                  Mover cliente para a etapa:
                </label>
                <Select value={targetStage} onValueChange={(val: any) => setTargetStage(val)}>
                  <SelectTrigger className="mt-1 text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Contato iniciado">
                      🔵 Contato iniciado (Recomendado)
                    </SelectItem>
                    <SelectItem value="Aguardando cliente">🟣 Aguardando cliente</SelectItem>
                    <SelectItem value="Orçamento enviado">📄 Orçamento enviado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col justify-end text-[11px] text-slate-500">
                <span>
                  Quando o cliente responder via WhatsApp, ele será movido{' '}
                  <strong>automaticamente</strong> para "Precisa responder".
                </span>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={sending}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={sending || !selectedTemplate}
                className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]"
              >
                {sending ? (
                  <>
                    <Clock className="h-4 w-4 mr-1.5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1.5" />
                    Iniciar Conversa
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
