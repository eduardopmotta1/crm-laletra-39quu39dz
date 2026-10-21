import React, { useRef, useState } from 'react'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { storeService } from '@/services/storeService'
import { useToast } from '@/hooks/use-toast'

interface ImageUploaderProps {
  label: string
  purpose: 'logo' | 'favicon' | 'banner' | 'product' | 'general'
  valueUrl?: string | null
  onChangeUrl: (url: string) => void
  helperText?: string
  accept?: string
  previewAspect?: 'square' | 'video' | 'banner' | 'auto'
}

export default function ImageUploader({
  label,
  purpose,
  valueUrl,
  onChangeUrl,
  helperText,
  accept = 'image/png,image/jpeg,image/webp,image/x-icon',
  previewAspect = 'auto',
}: ImageUploaderProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validação de formato no cliente
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/x-icon',
      'image/vnd.microsoft.icon',
    ]
    if (!allowed.includes(file.type)) {
      toast({
        title: 'Formato inválido',
        description: 'Selecione apenas arquivos JPG, PNG, WebP ou ICO.',
        variant: 'destructive',
      })
      return
    }

    // Validação de tamanho no cliente (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O tamanho máximo permitido é de 10 MB.',
        variant: 'destructive',
      })
      return
    }

    try {
      setUploading(true)
      const res = await storeService.uploadMedia(file, purpose)
      onChangeUrl(res.url)
      toast({
        title: 'Upload concluído!',
        description: `Imagem enviada com sucesso (${file.name}).`,
      })
    } catch (err: any) {
      toast({
        title: 'Erro no upload',
        description: err.message || 'Falha ao processar arquivo.',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onChangeUrl('')
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">{label}</label>
        {valueUrl && (
          <button
            type="button"
            onClick={handleRemove}
            className="text-[11px] text-rose-500 hover:text-rose-600 flex items-center gap-1 font-medium"
          >
            <X className="w-3 h-3" /> Remover imagem
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Preview da Imagem */}
        <div
          className={`relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 overflow-hidden flex items-center justify-center shrink-0 ${
            previewAspect === 'square'
              ? 'w-16 h-16'
              : previewAspect === 'banner'
                ? 'w-32 h-16'
                : 'w-20 h-20'
          }`}
        >
          {uploading ? (
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          ) : valueUrl ? (
            <img src={valueUrl} alt={label} className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
          )}
        </div>

        {/* Botão de Selecionar do Computador */}
        <div className="flex-1 space-y-1">
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="text-xs gap-1.5 h-8 border-slate-300 dark:border-slate-700 hover:border-emerald-500"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              {valueUrl ? 'Substituir Imagem' : 'Upload do Computador'}
            </Button>
            {valueUrl && (
              <span className="text-[11px] text-emerald-600 font-medium">✓ Imagem carregada</span>
            )}
          </div>
          {helperText && <p className="text-[10px] text-slate-400">{helperText}</p>}
        </div>
      </div>
    </div>
  )
}
