import React, { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { StoreArtOption, StoreArtPricingConfig } from '@/types/store'
import { UploadCloud, Clock, Palette, CheckCircle, FileCheck, AlertCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface ArtOptionSelectorProps {
  itemId: string
  artOption: StoreArtOption
  artNotes?: string
  artFileName?: string
  artPricing: StoreArtPricingConfig | null
  onChange: (option: StoreArtOption, notes?: string, fileName?: string) => void
  onFileSelect?: (file: File) => void
}

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'cdr', 'ai', 'eps', 'zip']
const MAX_SIZE_MB = 30

export const ArtOptionSelector: React.FC<ArtOptionSelectorProps> = ({
  itemId,
  artOption,
  artNotes = '',
  artFileName,
  artPricing,
  onChange,
  onFileSelect,
}) => {
  const [localNotes, setLocalNotes] = useState(artNotes)
  const [localFileName, setLocalFileName] = useState(artFileName || '')

  const creationFee = artPricing?.base_creation_fee ?? 45.0
  const extraDays = artPricing?.lead_time_extra_days ?? 2

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      const ext = (file.name.split('.').pop() || '').toLowerCase()

      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        toast({
          title: 'Formato não suportado',
          description: `Extensão .${ext} inválida. Aceitamos: PDF, JPG, PNG, CDR, AI, EPS e ZIP.`,
          variant: 'destructive',
        })
        return
      }

      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        toast({
          title: 'Arquivo muito grande',
          description: `O limite máximo permitido é ${MAX_SIZE_MB}MB.`,
          variant: 'destructive',
        })
        return
      }

      setLocalFileName(file.name)
      onChange('send_ready', localNotes, file.name)
      if (onFileSelect) {
        onFileSelect(file)
      }
      toast({
        title: 'Arquivo anexado!',
        description: `${file.name} foi validado e vinculado ao item.`,
      })
    }
  }

  const handleNotesBlur = () => {
    onChange(artOption, localNotes, localFileName)
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-blue-600" />
          Como você enviará a arte deste produto?
        </Label>
        {artOption === 'request_creation' && (
          <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700">
            +R$ {creationFee.toFixed(2)} (+{extraDays} dias)
          </Badge>
        )}
      </div>

      <RadioGroup
        value={artOption}
        onValueChange={(val) => {
          const opt = val as StoreArtOption
          onChange(opt, localNotes, localFileName)
        }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-2"
      >
        {/* Opção A: Enviar arte pronta */}
        <label
          htmlFor={`art_ready_${itemId}`}
          className={`p-2.5 rounded-lg border flex flex-col justify-between cursor-pointer transition-all ${
            artOption === 'send_ready'
              ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-medium'
              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
          }`}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="send_ready" id={`art_ready_${itemId}`} />
            <span className="font-semibold text-xs">Enviar Arte Pronta</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 pl-6">PDF, CDR, AI, JPG ou PNG</span>
        </label>

        {/* Opção B: Enviar depois */}
        <label
          htmlFor={`art_later_${itemId}`}
          className={`p-2.5 rounded-lg border flex flex-col justify-between cursor-pointer transition-all ${
            artOption === 'send_later'
              ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-medium'
              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
          }`}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="send_later" id={`art_later_${itemId}`} />
            <span className="font-semibold text-xs">Enviar Arte Depois</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 pl-6">
            Finalize e anexe no painel da conta
          </span>
        </label>

        {/* Opção C: Criar arte pela LaLetra */}
        <label
          htmlFor={`art_create_${itemId}`}
          className={`p-2.5 rounded-lg border flex flex-col justify-between cursor-pointer transition-all ${
            artOption === 'request_creation'
              ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-medium'
              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
          }`}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="request_creation" id={`art_create_${itemId}`} />
            <span className="font-semibold text-xs">Criar pela LaLetra</span>
          </div>
          <span className="text-[11px] text-emerald-600 font-medium mt-1 pl-6">
            +R$ {creationFee.toFixed(2)} (+{extraDays} dias)
          </span>
        </label>
      </RadioGroup>

      {/* Bloco condicional para OPÇÃO A: Enviar Arte Pronta */}
      {artOption === 'send_ready' && (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                <UploadCloud className="w-3.5 h-3.5 text-blue-600" />
                Upload do arquivo de arte
              </p>
              <p className="text-[11px] text-slate-500">
                Formatos aceitos: PDF/X-1a, CDR, AI, JPG, PNG (máx. {MAX_SIZE_MB}MB)
              </p>
            </div>
            <div>
              <input
                type="file"
                id={`file_input_${itemId}`}
                className="hidden"
                accept=".pdf,.cdr,.ai,.eps,.jpg,.jpeg,.png,.zip"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById(`file_input_${itemId}`)?.click()}
                className="text-xs h-7"
              >
                <UploadCloud className="w-3 h-3 mr-1" />
                {localFileName ? 'Trocar Arquivo' : 'Selecionar Arquivo'}
              </Button>
            </div>
          </div>

          {localFileName ? (
            <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-[11px]">
              <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium truncate flex-1">{localFileName}</span>
              <span className="text-emerald-700 font-semibold shrink-0">
                Pronto para conferência
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              Você pode anexar o arquivo agora ou concluir o pedido e enviá-lo depois no painel.
            </p>
          )}

          <div>
            <Label className="text-[11px] text-slate-600 block mb-1">
              Instruções técnicas para este item (sangria, pantone, acabamento):
            </Label>
            <Textarea
              placeholder="Ex: Corte especial conforme traçado da camada vermelha..."
              rows={2}
              value={localNotes}
              onChange={(e) => setLocalNotes(e.target.value)}
              onBlur={handleNotesBlur}
              className="text-xs"
            />
          </div>
        </div>
      )}

      {/* Bloco condicional para OPÇÃO B: Enviar Arte Depois */}
      {artOption === 'send_later' && (
        <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-amber-900 text-xs space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Você poderá enviar a arte posteriormente
          </p>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            O pedido será registrado com status de arte <strong>Pendente de Envio</strong>. Você
            poderá acessar o painel do cliente (<strong>/loja/conta</strong>) a qualquer momento
            para fazer o upload.
            <br />
            <em>
              Aviso importante: A produção permanecerá aguardando o envio e a aprovação técnica da
              arte.
            </em>
          </p>
        </div>
      )}

      {/* Bloco condicional para OPÇÃO C: Criar pela LaLetra */}
      {artOption === 'request_creation' && (
        <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg text-blue-950 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-blue-600" />
              Criação Profissional de Arte pela Equipe LaLetra
            </p>
            <span className="font-bold text-blue-700">+R$ {creationFee.toFixed(2)}</span>
          </div>
          <p className="text-[11px] text-slate-600">
            {artPricing?.description ||
              'Nossos designers criarão o layout personalizado do seu material.'}
            <br />
            Prazo adicional para criação: <strong>+{extraDays} dias úteis</strong> para
            desenvolvimento e aprovação da prova técnica.
          </p>
          <div>
            <Label className="text-[11px] text-slate-700 font-semibold block mb-1">
              Descreva sua ideia, textos e referências visuais:
            </Label>
            <Textarea
              placeholder="Ex: Gostaria de um cartão de visitas minimalista na cor preta e dourada, com logo no centro, WhatsApp (11) 99999-9999 e instagram @minhamarca..."
              rows={3}
              value={localNotes}
              onChange={(e) => setLocalNotes(e.target.value)}
              onBlur={handleNotesBlur}
              className="text-xs bg-white"
            />
          </div>
          <p className="text-[10px] text-slate-500">
            A prova técnica será enviada para você aprovar ou solicitar ajustes no painel do cliente
            antes de entrar em produção.
          </p>
        </div>
      )}
    </div>
  )
}
export default ArtOptionSelector
