import React, { useState, useEffect } from 'react'
import {
  FolderTree,
  Plus,
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  Archive,
  RotateCcw,
  Check,
  X,
  AlertCircle,
  Tag,
  ShieldAlert,
  Power,
} from 'lucide-react'
import { proceduresService, type ProcedureCategoryRecord } from '@/services/procedures'
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
import { Switch } from '@/components/ui/switch'
import { toast } from '@/hooks/use-toast'

interface ManageCategoriesModalProps {
  open: boolean
  onClose: () => void
  onCategoriesUpdated: () => void
}

export default function ManageCategoriesModal({
  open,
  onClose,
  onCategoriesUpdated,
}: ManageCategoriesModalProps) {
  const [categories, setCategories] = useState<ProcedureCategoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)

  // New category state
  const [newCatName, setNewCatName] = useState('')
  const [creating, setCreating] = useState(false)

  // Editing category state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  useEffect(() => {
    if (open) {
      loadCategories()
    }
  }, [open, showArchived])

  const loadCategories = async () => {
    setLoading(true)
    try {
      const list = await proceduresService.getCategoriesList(showArchived)
      setCategories(list)
    } catch (err) {
      console.error('Error loading categories:', err)
      toast({
        title: 'Erro ao carregar categorias',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) {
      toast({ title: 'Digite o nome da categoria', variant: 'destructive' })
      return
    }

    setCreating(true)
    try {
      await proceduresService.createCategory({
        name: newCatName.trim(),
        order_index: categories.length + 1,
      })
      toast({
        title: 'Categoria criada!',
        description: `"${newCatName.trim()}" cadastrada com sucesso.`,
      })
      setNewCatName('')
      loadCategories()
      onCategoriesUpdated()
    } catch (err: any) {
      toast({
        title: 'Erro ao criar categoria',
        description: err?.message || 'Verifique se já não existe uma categoria com este nome.',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const handleStartEdit = (cat: ProcedureCategoryRecord) => {
    setEditingId(cat.id)
    setEditingName(cat.name)
  }

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) {
      toast({ title: 'Nome não pode ser vazio', variant: 'destructive' })
      return
    }

    try {
      await proceduresService.updateCategory(id, { name: editingName.trim() })
      toast({ title: 'Categoria atualizada!' })
      setEditingId(null)
      loadCategories()
      onCategoriesUpdated()
    } catch (err) {
      toast({ title: 'Erro ao renomear categoria', variant: 'destructive' })
    }
  }

  const handleToggleActive = async (cat: ProcedureCategoryRecord) => {
    try {
      const newActive = !cat.is_active
      await proceduresService.updateCategory(cat.id, { is_active: newActive })
      toast({
        title: newActive ? 'Categoria ativada' : 'Categoria desativada',
      })
      loadCategories()
      onCategoriesUpdated()
    } catch (err) {
      toast({ title: 'Erro ao atualizar status', variant: 'destructive' })
    }
  }

  const handleToggleArchive = async (cat: ProcedureCategoryRecord) => {
    try {
      if (cat.is_archived) {
        await proceduresService.reactivateCategory(cat.id)
        toast({ title: 'Categoria restaurada do arquivo' })
      } else {
        await proceduresService.archiveCategory(cat.id)
        toast({ title: 'Categoria arquivada com sucesso' })
      }
      loadCategories()
      onCategoriesUpdated()
    } catch (err) {
      toast({ title: 'Erro ao arquivar/restaurar categoria', variant: 'destructive' })
    }
  }

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === categories.length - 1)
    ) {
      return
    }

    const newCategories = [...categories]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const [moved] = newCategories.splice(index, 1)
    newCategories.splice(targetIndex, 0, moved)

    setCategories(newCategories)

    const ids = newCategories.map((c) => c.id)
    await proceduresService.reorderCategories(ids)
    onCategoriesUpdated()
  }

  const handleDeleteCategory = async (cat: ProcedureCategoryRecord) => {
    const result = await proceduresService.deleteCategory(cat.id)
    if (result.success) {
      toast({ title: 'Categoria excluída com sucesso' })
      loadCategories()
      onCategoriesUpdated()
    } else if (result.blocked) {
      toast({
        title: 'Exclusão impedida',
        description: result.message,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Erro ao excluir categoria',
        description: result.message,
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
            <FolderTree className="h-5 w-5 text-emerald-600" />
            Gerenciar Categorias de Procedimentos
          </DialogTitle>
          <DialogDescription className="text-xs">
            Crie, renomeie, ordene e ative/desative categorias. Categorias em uso por POPs são
            protegidas contra exclusão acidental.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Create category row */}
          <form
            onSubmit={handleCreateCategory}
            className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            <Input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Nome da nova categoria (ex: Pré-Impressão, Corte Laser)..."
              className="text-xs bg-white dark:bg-slate-950"
            />
            <Button
              type="submit"
              disabled={creating || !newCatName.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 px-3 shrink-0 font-semibold"
            >
              <Plus className="h-4 w-4 mr-1" />
              Criar Categoria
            </Button>
          </form>

          {/* Archived toggle */}
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-slate-500 font-medium">
              Total: {categories.length} categoria(s)
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
              className="text-xs h-7 text-slate-600 dark:text-slate-400"
            >
              <Archive className="h-3.5 w-3.5 mr-1" />
              {showArchived ? 'Ocultar Arquivadas' : 'Exibir Arquivadas'}
            </Button>
          </div>

          {/* Categories List */}
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Carregando categorias cadastradas...
            </div>
          ) : categories.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 border rounded-xl">
              Nenhuma categoria encontrada.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {categories.map((cat, index) => {
                const isEditing = editingId === cat.id
                const isArchived = cat.is_archived
                const isActive = cat.is_active !== false

                return (
                  <div
                    key={cat.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                      isArchived
                        ? 'bg-slate-100/70 dark:bg-slate-900/40 opacity-60 border-dashed'
                        : !isActive
                          ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40'
                          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-xs'
                    }`}
                  >
                    {/* Left: Reorder & Name */}
                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                      <div className="flex flex-col">
                        <button
                          type="button"
                          disabled={index === 0 || isArchived}
                          onClick={() => handleMoveOrder(index, 'up')}
                          className="h-4 w-4 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-20"
                          title="Mover para cima"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={index === categories.length - 1 || isArchived}
                          onClick={() => handleMoveOrder(index, 'down')}
                          className="h-4 w-4 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-20"
                          title="Mover para baixo"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>

                      <span className="font-mono text-[10px] text-slate-400 w-5 text-center">
                        #{index + 1}
                      </span>

                      {isEditing ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="text-xs h-7 bg-white dark:bg-slate-900"
                            autoFocus
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSaveEdit(cat.id)}
                            className="h-7 w-7 p-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingId(null)}
                            className="h-7 w-7 p-0 text-slate-400"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                            {cat.name}
                          </span>
                          {!isActive && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 text-amber-600 border-amber-300"
                            >
                              Inativa
                            </Badge>
                          )}
                          {isArchived && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 text-slate-400 border-slate-300"
                            >
                              Arquivada
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    {!isEditing && (
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Toggle Active Switch */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(cat)}
                          className={`h-7 px-2 text-[11px] ${
                            isActive
                              ? 'text-emerald-700 hover:bg-emerald-50'
                              : 'text-amber-700 hover:bg-amber-50'
                          }`}
                          title={isActive ? 'Desativar categoria' : 'Ativar categoria'}
                        >
                          <Power className="h-3.5 w-3.5 mr-1" />
                          {isActive ? 'Ativa' : 'Desativada'}
                        </Button>

                        {/* Edit Name */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(cat)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800"
                          title="Renomear Categoria"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>

                        {/* Archive / Reactivate */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleArchive(cat)}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
                          title={isArchived ? 'Restaurar do arquivo' : 'Arquivar Categoria'}
                        >
                          {isArchived ? (
                            <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Archive className="h-3.5 w-3.5" />
                          )}
                        </Button>

                        {/* Delete permanently (protected) */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCategory(cat)}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          title="Excluir Categoria (apenas se não estiver em uso)"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              <strong>Proteção de Integridade:</strong> Cada categoria possui um identificador
              interno único. Renomear uma categoria atualiza instantaneamente a visualização de
              todos os POPs vinculados, e categorias vinculadas a POPs são protegidas contra
              exclusão permanente.
            </span>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Concluir & Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
