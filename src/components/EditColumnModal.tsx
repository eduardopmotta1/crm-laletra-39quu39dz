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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Trash2, AlertTriangle, Edit, Palette, Layers, HelpCircle } from 'lucide-react'
import type { KanbanColumn, StageType } from '@/types/crm'
import { columnsService } from '@/services/columns'
import { toast } from '@/hooks/use-toast'

interface EditColumnModalProps {
  isOpen: boolean
  onClose: () => void
  column: KanbanColumn | null
  allColumns: KanbanColumn[]
  onSaved: () => void
}

const COLOR_OPTIONS = [
  { value: 'blue', label: 'Azul', class: 'bg-blue-500' },
  { value: 'cyan', label: 'Ciano', class: 'bg-cyan-500' },
  { value: 'rose', label: 'Rosa / Vermelho', class: 'bg-rose-500' },
  { value: 'amber', label: 'Âmbar / Laranja', class: 'bg-amber-500' },
  { value: 'purple', label: 'Roxo', class: 'bg-purple-500' },
  { value: 'indigo', label: 'Índigo', class: 'bg-indigo-500' },
  { value: 'emerald', label: 'Verde / Esmeralda', class: 'bg-emerald-500' },
  { value: 'slate', label: 'Cinza / Neutro', class: 'bg-slate-500' },
]

export default function EditColumnModal({
  isOpen,
  onClose,
  column,
  allColumns,
  onSaved,
}: EditColumnModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('blue')
  const [stageType, setStageType] = useState<StageType>('intermediate')
  const [isVisible, setIsVisible] = useState(true)
  const [loading, setLoading] = useState(false)

  // Safe delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [moveToStage, setMoveToStage] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    if (column) {
      setName(column.name || '')
      setDescription(column.description || '')
      setColor(column.color || 'blue')
      setStageType(column.stage_type || 'intermediate')
      setIsVisible(column.is_visible !== false)
    } else {
      setName('')
      setDescription('')
      setColor('blue')
      setStageType('intermediate')
      setIsVisible(true)
    }
    setDeleteDialogOpen(false)
    setMoveToStage('')
  }, [column, isOpen])

  if (!isOpen) return null

  const isEditing = Boolean(column?.id)
  const otherColumns = allColumns.filter((c) => c.id !== column?.id)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe um nome visível para a coluna.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      if (isEditing && column) {
        await columnsService.update(column.id, {
          name: name.trim(),
          description: description.trim() || '',
          color,
          stage_type: stageType,
          is_visible: isVisible,
        })
        toast({
          title: 'Coluna atualizada!',
          description: `Coluna "${name}" atualizada. O identificador interno "${column.internal_id}" foi preservado.`,
        })
      } else {
        await columnsService.create({
          name: name.trim(),
          description: description.trim() || '',
          color,
          stage_type: stageType,
          is_visible: isVisible,
          order_index: allColumns.length,
        })
        toast({
          title: 'Coluna criada!',
          description: `Nova etapa "${name}" adicionada ao funil.`,
        })
      }

      onSaved()
      onClose()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Não foi possível gravar as alterações da coluna.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!column) return
    setDeleteLoading(true)
    try {
      const res = await columnsService.safeDelete(column.id, column.name, moveToStage || undefined)
      if (res.success) {
        toast({
          title: 'Coluna removida com segurança',
          description:
            res.movedCount > 0
              ? `A coluna foi excluída e ${res.movedCount} atendimentos foram remanejados para "${moveToStage}".`
              : 'Coluna excluída com sucesso.',
        })
        setDeleteDialogOpen(false)
        onSaved()
        onClose()
      } else {
        toast({
          title: 'Atenção ao excluir',
          description: res.error || 'Não foi possível excluir a coluna.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err?.message || 'Falha ao remover coluna.',
        variant: 'destructive',
      })
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen && !deleteDialogOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Layers className="h-5 w-5 text-emerald-600" />
              {isEditing ? 'Editar Coluna do Kanban' : 'Nova Coluna do Funil'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Personalize o nome visível, cor e descrição da etapa. As automações e regras de SLA
              utilizam o identificador permanente seguro.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {/* Permanent Internal ID indicator */}
            {isEditing && column && (
              <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span className="text-[11px] font-sans font-medium text-slate-500">
                  ID Interno Seguro:
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {column.internal_id}
                </span>
              </div>
            )}

            {/* Display Name */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nome de Exibição da Coluna *
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Esperando retorno"
                required
                className="mt-1 text-xs"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Descrição ou Subtítulo
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Briefing e especificações técnicas"
                className="mt-1 text-xs"
              />
            </div>

            {/* Stage Type */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Tipo da Etapa no Funil
              </label>
              <Select value={stageType} onValueChange={(val: StageType) => setStageType(val)}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Selecione o tipo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="initial">Etapa Inicial (Entrada de novos contatos)</SelectItem>
                  <SelectItem value="intermediate">
                    Etapa Intermediária (Negociação / Atendimento)
                  </SelectItem>
                  <SelectItem value="final">
                    Etapa Final (Conclusão / Venda Fechada / Perdida)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Color selector */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                Cor de Destaque
              </label>
              <div className="grid grid-cols-4 gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className={`flex items-center gap-1.5 p-2 rounded-lg border text-[11px] font-medium transition-all ${
                      color === c.value
                        ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`h-3 w-3 rounded-full shrink-0 ${c.class}`} />
                    <span className="truncate">{c.label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Visibility Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="space-y-0.5">
                <Label htmlFor="column-visible" className="text-xs font-semibold">
                  Exibir esta coluna no Kanban
                </Label>
                <p className="text-[11px] text-slate-500">
                  Se desmarcado, a coluna fica oculta no funil principal.
                </p>
              </div>
              <Switch id="column-visible" checked={isVisible} onCheckedChange={setIsVisible} />
            </div>

            {/* Modal Actions */}
            <DialogFooter className="pt-2 flex flex-row items-center justify-between gap-2">
              {isEditing ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Excluir Coluna
                </Button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  {loading ? 'Salvando...' : 'Salvar Coluna'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Safe Delete & Move Clients Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 text-base">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
              Excluir Coluna com Segurança
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 dark:text-slate-300">
              Para garantir que nenhum cliente ou histórico seja perdido, selecione para qual etapa
              você deseja transferir os atendimentos atualmente vinculados à coluna "
              <strong>{column?.name}</strong>".
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Mover atendimentos existentes para: *
              </label>
              <Select value={moveToStage} onValueChange={setMoveToStage}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Escolha a nova etapa de destino..." />
                </SelectTrigger>
                <SelectContent>
                  {otherColumns.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
              <strong>Proteção do CRM:</strong> Os clientes, mensagens de WhatsApp, orçamentos e
              histórico de transição continuarão totalmente intactos.
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteLoading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteLoading || !moveToStage}
              className="text-xs font-semibold"
            >
              {deleteLoading ? 'Remanejando...' : 'Mover Atendimentos & Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
