import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  SlidersHorizontal,
  Trash2,
  Plus,
  MessageSquare,
  Sparkles,
  Layers,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import type { ProductionStage } from '@/types/crm'
import { productionStagesService } from '@/services/productionStages'
import { toast } from '@/hooks/use-toast'

interface ProductionStageManagerModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

const COLOR_OPTIONS = [
  { value: 'blue', label: 'Azul' },
  { value: 'emerald', label: 'Verde' },
  { value: 'amber', label: 'Amarelo' },
  { value: 'rose', label: 'Vermelho' },
  { value: 'purple', label: 'Roxo' },
  { value: 'indigo', label: 'Índigo' },
  { value: 'cyan', label: 'Ciano' },
  { value: 'slate', label: 'Cinza' },
]

export default function ProductionStageManagerModal({
  isOpen,
  onClose,
  onSaved,
}: ProductionStageManagerModalProps) {
  const [stages, setStages] = useState<ProductionStage[]>([])
  const [loading, setLoading] = useState(false)
  const [editingStage, setEditingStage] = useState<ProductionStage | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [moveOrdersTo, setMoveOrdersTo] = useState<string>('order_received')

  // Form states for stage editing/creation
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('blue')
  const [isVisible, setIsVisible] = useState(true)
  const [autoNotify, setAutoNotify] = useState(false)
  const [template, setTemplate] = useState('')

  const loadStages = async () => {
    const list = await productionStagesService.getAll()
    setStages(list)
  }

  useEffect(() => {
    if (isOpen) {
      loadStages()
      setEditingStage(null)
      setDeleteTargetId(null)
    }
  }, [isOpen])

  const handleStartEdit = (st: ProductionStage) => {
    setEditingStage(st)
    setName(st.name)
    setDescription(st.description || '')
    setColor(st.color || 'blue')
    setIsVisible(st.is_visible !== false)
    setAutoNotify(st.auto_notify_whatsapp || false)
    setTemplate(st.whatsapp_message_template || '')
  }

  const handleStartCreate = () => {
    setEditingStage({
      id: '',
      internal_id: `custom_${Date.now()}`,
      name: '',
      description: '',
      color: 'blue',
      order_index: stages.length,
      is_visible: true,
      auto_notify_whatsapp: false,
      whatsapp_message_template: '',
    })
    setName('')
    setDescription('')
    setColor('blue')
    setIsVisible(true)
    setAutoNotify(false)
    setTemplate('')
  }

  const handleSaveStage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    try {
      if (editingStage?.id) {
        // Update
        await productionStagesService.update(editingStage.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          color,
          is_visible: isVisible,
          auto_notify_whatsapp: autoNotify,
          whatsapp_message_template: template.trim() || undefined,
        })
        toast({ title: 'Etapa atualizada com sucesso!' })
      } else {
        // Create
        await productionStagesService.create({
          internal_id: `stage_${Date.now()}`,
          name: name.trim(),
          description: description.trim() || undefined,
          color,
          order_index: stages.length,
          is_visible: isVisible,
          auto_notify_whatsapp: autoNotify,
          whatsapp_message_template: template.trim() || undefined,
        })
        toast({ title: 'Nova etapa criada com sucesso!' })
      }
      setEditingStage(null)
      await loadStages()
      onSaved()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar etapa',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const newStages = [...stages]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newStages.length) return

    const temp = newStages[index]
    newStages[index] = newStages[targetIndex]
    newStages[targetIndex] = temp

    setStages(newStages)
    const orderedIds = newStages.map((s) => s.id)
    await productionStagesService.reorder(orderedIds)
    onSaved()
  }

  const handleDeleteStage = async (stage: ProductionStage) => {
    setLoading(true)
    try {
      const res = await productionStagesService.safeDelete(
        stage.id,
        stage.internal_id,
        moveOrdersTo,
      )
      if (!res.success) {
        toast({
          title: 'Não foi possível excluir',
          description: res.error,
          variant: 'destructive',
        })
        return
      }
      toast({
        title: 'Etapa removida',
        description: `Etapa "${stage.name}" excluída. ${res.movedCount} pedidos foram remanejados.`,
      })
      setDeleteTargetId(null)
      await loadStages()
      onSaved()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white text-base">
            <SlidersHorizontal className="h-5 w-5 text-emerald-600" />
            Configurar Etapas do Kanban de Produção
          </DialogTitle>
          <DialogDescription className="text-xs">
            Personalize nomes, ordem, cores e regras de notificação automática no WhatsApp para cada
            etapa da produção gráfica.
          </DialogDescription>
        </DialogHeader>

        {editingStage ? (
          // Stage Form
          <form onSubmit={handleSaveStage} className="space-y-4 pt-1">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {editingStage.id ? `Editar: ${editingStage.name}` : 'Criar Nova Etapa'}
                </span>
                {editingStage.internal_id && (
                  <span className="font-mono text-[10px] text-slate-400">
                    ID interno: {editingStage.internal_id}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Nome da Etapa *
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Arte em preparação"
                    className="mt-1 text-xs bg-white dark:bg-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Cor Visual
                  </label>
                  <Select value={color} onValueChange={setColor}>
                    <SelectTrigger className="mt-1 text-xs bg-white dark:bg-slate-900">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {COLOR_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Descrição Curta
                </label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Diagramação e provas digitais para o cliente"
                  className="mt-1 text-xs bg-white dark:bg-slate-900"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                    Visível no Kanban
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Desative para ocultar temporariamente esta coluna da esteira
                  </span>
                </div>
                <Switch checked={isVisible} onCheckedChange={setIsVisible} />
              </div>

              {/* Automated WhatsApp Notifications on this stage */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                      Disparar Aviso Automático no WhatsApp
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Envia mensagem instantânea ao cliente quando o pedido for movido para esta
                      etapa
                    </span>
                  </div>
                  <Switch checked={autoNotify} onCheckedChange={setAutoNotify} />
                </div>

                {autoNotify && (
                  <div className="pt-2 space-y-1">
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block text-[11px]">
                      Mensagem / Template do WhatsApp
                    </label>
                    <Textarea
                      value={template}
                      onChange={(e) => setTemplate(e.target.value)}
                      placeholder="Olá, {{nome}}! Seu pedido #{{pedido}} entrou em produção..."
                      rows={3}
                      className="text-xs bg-white dark:bg-slate-900 resize-none font-sans"
                    />
                    <span className="text-[10px] text-slate-400 block">
                      Variáveis disponíveis: <code>{'{{nome}}'}</code>, <code>{'{{pedido}}'}</code>,{' '}
                      <code>{'{{link_acompanhamento}}'}</code>, <code>{'{{codigo_rastreio}}'}</code>
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingStage(null)}
              >
                Voltar à Lista
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Salvar Etapa
              </Button>
            </div>
          </form>
        ) : (
          // Stages List
          <div className="space-y-3 pt-1">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-500">
                {stages.length} etapas cadastradas na ordem da esteira
              </span>
              <Button
                size="sm"
                onClick={handleStartCreate}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar Etapa
              </Button>
            </div>

            <div className="space-y-2">
              {stages.map((st, index) => (
                <div
                  key={st.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-xs gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMoveOrder(index, 'up')}
                        className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={index === stages.length - 1}
                        onClick={() => handleMoveOrder(index, 'down')}
                        className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white truncate">
                          {st.name}
                        </span>
                        {!st.is_visible && (
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">
                            Oculta
                          </span>
                        )}
                        {st.auto_notify_whatsapp && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5">
                            <MessageSquare className="h-2.5 w-2.5" />
                            WhatsApp Ativo
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{st.internal_id}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartEdit(st)}
                      className="text-xs h-7 px-2.5"
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTargetId(st.id)}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-7 px-2"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Delete Confirmation Box */}
            {deleteTargetId && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 space-y-2 text-xs">
                <span className="font-bold text-rose-900 dark:text-rose-200 block">
                  Excluir Etapa:
                </span>
                <p className="text-rose-700 dark:text-rose-300">
                  Se existirem pedidos nesta etapa, escolha para onde eles devem ser movidos:
                </p>
                <Select value={moveOrdersTo} onValueChange={setMoveOrdersTo}>
                  <SelectTrigger className="text-xs bg-white dark:bg-slate-900">
                    <SelectValue placeholder="Mover pedidos para..." />
                  </SelectTrigger>
                  <SelectContent>
                    {stages
                      .filter((s) => s.id !== deleteTargetId)
                      .map((s) => (
                        <SelectItem key={s.internal_id} value={s.internal_id}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <div className="flex justify-end gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setDeleteTargetId(null)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      const targetStage = stages.find((s) => s.id === deleteTargetId)
                      if (targetStage) handleDeleteStage(targetStage)
                    }}
                  >
                    Confirmar Exclusão
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
