import React, { useState } from 'react'
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  ListOrdered,
  Paperclip,
  ExternalLink,
  FileImage,
  Send,
  User as UserIcon,
  Calendar,
  Tag,
  Check,
} from 'lucide-react'
import { proceduresService, type ProcedureExecution } from '@/services/procedures'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/context/AuthContext'

interface ExecuteRoutineModalProps {
  open: boolean
  onClose: () => void
  execution: ProcedureExecution | null
  onExecutionCompleted: () => void
}

export default function ExecuteRoutineModal({
  open,
  onClose,
  execution,
  onExecutionCompleted,
}: ExecuteRoutineModalProps) {
  const { user } = useAuth()
  const [notes, setNotes] = useState('')
  const [checkedSteps, setCheckedSteps] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Initialize checked steps from execution or empty
  React.useEffect(() => {
    if (execution) {
      setCheckedSteps(execution.checked_step_ids || [])
      setNotes(execution.notes || '')
    } else {
      setCheckedSteps([])
      setNotes('')
    }
  }, [execution])

  if (!execution || !execution.expand?.procedure_id) return null

  const proc = execution.expand.procedure_id
  const steps = Array.isArray(proc.steps) ? proc.steps : []
  const isCompleted = execution.status === 'Concluído'

  const toggleStep = (stepIdOrIdx: string) => {
    if (isCompleted) return
    setCheckedSteps((prev) =>
      prev.includes(stepIdOrIdx) ? prev.filter((id) => id !== stepIdOrIdx) : [...prev, stepIdOrIdx],
    )
  }

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      toast({ title: 'Usuário não autenticado', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      await proceduresService.completeExecution(execution.id, {
        completedByUserId: user.id,
        completedByName: user.name || user.email,
        notes: notes.trim(),
        checkedStepIds: checkedSteps,
      })

      toast({
        title: 'Procedimento concluído!',
        description: `Rotina "${proc.title}" finalizada com sucesso.`,
      })
      onExecutionCompleted()
      onClose()
    } catch (err: any) {
      console.error('Error completing execution:', err)
      toast({
        title: 'Erro ao concluir procedimento',
        description: err?.message || 'Não foi possível registrar a execução.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Header Hero */}
        <div className="p-6 bg-slate-900 text-white relative">
          <div className="flex items-center justify-between gap-3 mb-2">
            <Badge className="bg-emerald-600 text-white text-[10px] uppercase font-bold tracking-wider">
              {proc.category || proc.expand?.category_id?.name || 'Procedimento'}
            </Badge>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  execution.status === 'Concluído'
                    ? 'bg-emerald-600 text-white border-transparent'
                    : execution.status === 'Atrasado'
                      ? 'bg-rose-600 text-white border-transparent animate-pulse'
                      : 'bg-amber-500 text-white border-transparent'
                }`}
              >
                {execution.status}
              </Badge>
              {execution.scheduled_at && (
                <span className="text-xs font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                  Horário: {execution.scheduled_at}
                </span>
              )}
            </div>
          </div>

          <h2 className="text-xl font-bold leading-tight mt-1">{proc.title}</h2>

          {proc.summary && (
            <p className="text-slate-300 text-xs sm:text-sm mt-2 leading-relaxed">{proc.summary}</p>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-4 pt-3 border-t border-slate-800">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-emerald-400" />
              <span>
                Data da Ocorrência:{' '}
                <strong className="text-white">
                  {new Date(execution.occurrence_date).toLocaleDateString('pt-BR')}
                </strong>
              </span>
            </div>
            {execution.completed_by_name && (
              <div className="flex items-center gap-1.5">
                <UserIcon className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  Concluído por:{' '}
                  <strong className="text-white">{execution.completed_by_name}</strong>
                </span>
              </div>
            )}
            {execution.completed_at && (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  Concluído em:{' '}
                  <strong className="text-white">
                    {new Date(execution.completed_at).toLocaleString('pt-BR')}
                  </strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          {/* Interactive Checklist Steps */}
          {steps.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                  <ListOrdered className="h-4 w-4 text-emerald-600" />
                  Passo a Passo & Checklist de Execução ({steps.length})
                </h3>
                <span className="text-[11px] text-slate-500">
                  {checkedSteps.length} de {steps.length} concluídos
                </span>
              </div>

              <div className="space-y-2">
                {steps.map((st, idx) => {
                  const stepKey = st.id || String(idx)
                  const isChecked = checkedSteps.includes(stepKey)

                  return (
                    <div
                      key={stepKey}
                      onClick={() => !isCompleted && toggleStep(stepKey)}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all text-xs ${
                        isCompleted
                          ? isChecked
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 opacity-70'
                          : isChecked
                            ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 cursor-pointer shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-200 cursor-pointer'
                      }`}
                    >
                      <div className="pt-0.5">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => !isCompleted && toggleStep(stepKey)}
                          disabled={isCompleted}
                          className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <h4
                          className={`font-bold text-xs sm:text-sm ${
                            isChecked
                              ? 'line-through text-slate-500 dark:text-slate-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {idx + 1}. {st.title}
                        </h4>
                        {st.description && (
                          <p className="text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap text-xs">
                            {st.description}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Full Instructions Content if available */}
          {proc.content && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-600" />
                Instruções Detalhadas
              </h3>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
                {proc.content}
              </div>
            </div>
          )}

          {/* Critical Notes */}
          {proc.notes && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5 uppercase text-[11px] tracking-wider text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                Pontos de Atenção & Qualidade
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{proc.notes}</p>
            </div>
          )}

          {/* Completion Form & Observation */}
          {!isCompleted ? (
            <form
              onSubmit={handleComplete}
              className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Observações da Execução (opcional):
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Correia apresentando leve desgaste; tudo nos conformes; peças limpas..."
                  rows={3}
                  className="text-xs bg-white dark:bg-slate-950"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button type="button" variant="outline" size="sm" onClick={onClose}>
                  Fechar sem Concluir
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-sm px-4"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {submitting ? 'Gravando...' : 'Concluir Procedimento'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 space-y-2 text-xs">
              <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <Check className="h-4 w-4" />
                Esta ocorrência foi concluída com sucesso
              </div>
              {execution.notes && (
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Observação registrada:
                  </span>
                  <p className="text-slate-600 dark:text-slate-400 italic mt-0.5">
                    "{execution.notes}"
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
