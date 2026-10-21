import React, { useState } from 'react'
import {
  Save,
  RotateCcw,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Palette,
  Layout,
  Share2,
  FileText,
  Phone,
  HelpCircle,
  ExternalLink,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import ImageUploader from '@/components/store/ImageUploader'
import StoreFooter from '@/components/store/StoreFooter'
import type {
  StoreFooterSettings,
  StoreFooterColumn,
  StoreFooterLinkItem,
  StoreFooterSocialLink,
  StoreCategory,
} from '@/types/store'
import { DEFAULT_STORE_FOOTER_SETTINGS, sanitizeFooterUrl } from '@/lib/storeFooterDefaults'

interface StoreFooterEditorTabProps {
  footer: StoreFooterSettings
  onChangeFooter: (footer: StoreFooterSettings) => void
  onSave: () => Promise<void>
  saving: boolean
  categories: StoreCategory[]
}

export default function StoreFooterEditorTab({
  footer,
  onChangeFooter,
  onSave,
  saving,
  categories,
}: StoreFooterEditorTabProps) {
  const [subTab, setSubTab] = useState<'content' | 'columns' | 'social' | 'colors' | 'preview'>(
    'content',
  )

  // Modal para Adicionar / Editar Coluna
  const [columnDialogOpen, setColumnDialogOpen] = useState(false)
  const [editingColumn, setEditingColumn] = useState<StoreFooterColumn | null>(null)

  // Modal para Adicionar / Editar Link em uma Coluna
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [activeColIdForLink, setActiveColIdForLink] = useState<string | null>(null)
  const [editingLink, setEditingLink] = useState<StoreFooterLinkItem | null>(null)

  // Modal para Adicionar / Editar Rede Social
  const [socialDialogOpen, setSocialDialogOpen] = useState(false)
  const [editingSocial, setEditingSocial] = useState<StoreFooterSocialLink | null>(null)

  const handleResetDefaults = () => {
    if (
      confirm('Deseja restaurar todas as configurações do rodapé para o padrão oficial da Laletra?')
    ) {
      onChangeFooter({ ...DEFAULT_STORE_FOOTER_SETTINGS })
    }
  }

  // Helpers para manipulação de colunas
  const handleOpenAddColumn = () => {
    const nextOrder = ((footer.columns?.length || 0) + 1) * 10
    setEditingColumn({
      id: `col-${Date.now()}`,
      title: 'Nova Coluna',
      type: 'links',
      order_index: nextOrder,
      is_visible: true,
      text_content: '',
      links: [],
    })
    setColumnDialogOpen(true)
  }

  const handleOpenEditColumn = (col: StoreFooterColumn) => {
    setEditingColumn({ ...col })
    setColumnDialogOpen(true)
  }

  const handleSaveColumnModal = () => {
    if (!editingColumn) return
    const exists = footer.columns?.some((c) => c.id === editingColumn.id)
    let updatedCols: StoreFooterColumn[]
    if (exists) {
      updatedCols = footer.columns.map((c) => (c.id === editingColumn.id ? editingColumn : c))
    } else {
      updatedCols = [...(footer.columns || []), editingColumn]
    }
    onChangeFooter({
      ...footer,
      columns: updatedCols,
    })
    setColumnDialogOpen(false)
  }

  const handleDeleteColumn = (colId: string) => {
    if (!confirm('Deseja remover esta coluna do rodapé?')) return
    onChangeFooter({
      ...footer,
      columns: footer.columns.filter((c) => c.id !== colId),
    })
  }

  const handleMoveColumn = (index: number, direction: 'up' | 'down') => {
    const sorted = [...footer.columns].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= sorted.length) return

    const temp = sorted[index]
    sorted[index] = sorted[targetIndex]
    sorted[targetIndex] = temp

    // Reatribuir order_index sequencial
    const updated = sorted.map((col, idx) => ({
      ...col,
      order_index: (idx + 1) * 10,
    }))

    onChangeFooter({
      ...footer,
      columns: updated,
    })
  }

  const handleToggleColumnVisibility = (colId: string) => {
    onChangeFooter({
      ...footer,
      columns: footer.columns.map((c) =>
        c.id === colId ? { ...c, is_visible: !c.is_visible } : c,
      ),
    })
  }

  // Helpers para links dentro de uma coluna
  const handleOpenAddLink = (colId: string) => {
    setActiveColIdForLink(colId)
    setEditingLink({
      id: `link-${Date.now()}`,
      label: 'Novo Link',
      href: '/loja',
      icon: 'link',
      target_blank: false,
    })
    setLinkDialogOpen(true)
  }

  const handleOpenEditLink = (colId: string, item: StoreFooterLinkItem) => {
    setActiveColIdForLink(colId)
    setEditingLink({ ...item })
    setLinkDialogOpen(true)
  }

  const handleSaveLinkModal = () => {
    if (!editingLink || !activeColIdForLink) return
    const safeHref = sanitizeFooterUrl(editingLink.href)
    const normalizedLink = { ...editingLink, href: safeHref }

    const updatedCols = footer.columns.map((col) => {
      if (col.id !== activeColIdForLink) return col
      const links = col.links || []
      const exists = links.some((l) => l.id === normalizedLink.id)
      return {
        ...col,
        links: exists
          ? links.map((l) => (l.id === normalizedLink.id ? normalizedLink : l))
          : [...links, normalizedLink],
      }
    })

    onChangeFooter({ ...footer, columns: updatedCols })
    setLinkDialogOpen(false)
  }

  const handleDeleteLink = (colId: string, linkId: string) => {
    const updatedCols = footer.columns.map((col) => {
      if (col.id !== colId) return col
      return {
        ...col,
        links: (col.links || []).filter((l) => l.id !== linkId),
      }
    })
    onChangeFooter({ ...footer, columns: updatedCols })
  }

  // Helpers para Redes Sociais
  const handleOpenAddSocial = () => {
    setEditingSocial({
      id: `soc-${Date.now()}`,
      platform: 'instagram',
      label: 'Instagram',
      url: 'https://instagram.com/laletragrafica',
      is_visible: true,
    })
    setSocialDialogOpen(true)
  }

  const handleOpenEditSocial = (item: StoreFooterSocialLink) => {
    setEditingSocial({ ...item })
    setSocialDialogOpen(true)
  }

  const handleSaveSocialModal = () => {
    if (!editingSocial) return
    const safeUrl = sanitizeFooterUrl(editingSocial.url)
    const normalized = { ...editingSocial, url: safeUrl }

    const exists = footer.social_links?.some((s) => s.id === normalized.id)
    const updated = exists
      ? footer.social_links.map((s) => (s.id === normalized.id ? normalized : s))
      : [...(footer.social_links || []), normalized]

    onChangeFooter({ ...footer, social_links: updated })
    setSocialDialogOpen(false)
  }

  const handleDeleteSocial = (id: string) => {
    onChangeFooter({
      ...footer,
      social_links: footer.social_links.filter((s) => s.id !== id),
    })
  }

  const handleToggleSocialVisibility = (id: string) => {
    onChangeFooter({
      ...footer,
      social_links: footer.social_links.map((s) =>
        s.id === id ? { ...s, is_visible: !s.is_visible } : s,
      ),
    })
  }

  const sortedColumns = [...(footer.columns || [])].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  )

  return (
    <div className="space-y-6">
      {/* Barra de Ações Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Layout className="w-4 h-4 text-emerald-600" />
            Editor Completo do Rodapé (Fase 5C — Etapa 1)
          </h3>
          <p className="text-xs text-slate-500">
            Personalize 100% das informações, colunas, links, redes sociais, cores e visibilidade
            sem mexer no código.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            className="text-xs gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restaurar Padrão
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={onSave}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Gravando...' : 'Salvar Rodapé'}
          </Button>
        </div>
      </div>

      {/* Sub-Abas do Editor do Rodapé */}
      <Tabs value={subTab} onValueChange={(v: any) => setSubTab(v)} className="space-y-4">
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="content" className="text-xs font-semibold gap-1.5 py-1.5">
            <FileText className="w-3.5 h-3.5 text-blue-600" /> Dados Institucionais
          </TabsTrigger>
          <TabsTrigger value="columns" className="text-xs font-semibold gap-1.5 py-1.5">
            <Layout className="w-3.5 h-3.5 text-purple-600" /> Colunas & Links (
            {footer.columns?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="social" className="text-xs font-semibold gap-1.5 py-1.5">
            <Share2 className="w-3.5 h-3.5 text-pink-600" /> Redes Sociais (
            {footer.social_links?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="colors" className="text-xs font-semibold gap-1.5 py-1.5">
            <Palette className="w-3.5 h-3.5 text-amber-600" /> Cores & Aparência
          </TabsTrigger>
          <TabsTrigger value="preview" className="text-xs font-semibold gap-1.5 py-1.5">
            <Eye className="w-3.5 h-3.5 text-emerald-600" /> Pré-visualização ao Vivo
          </TabsTrigger>
        </TabsList>

        {/* ========================================================
            SUB-ABA 1: DADOS INSTITUCIONAIS & VISIBILIDADE GLOBAL
        ======================================================== */}
        <TabsContent value="content" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Card className="lg:col-span-8 border-slate-200 dark:border-slate-800">
              <CardHeader className="p-5 pb-3 border-b">
                <CardTitle className="text-sm font-bold">Identidade & Contato do Rodapé</CardTitle>
                <CardDescription className="text-xs">
                  Valores oficiais exibidos no rodapé público.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {/* Upload Logo do Rodapé */}
                <ImageUploader
                  label="Logotipo Específico do Rodapé (Opcional)"
                  purpose="logo"
                  valueUrl={footer.logo_url}
                  onChangeUrl={(url) => onChangeFooter({ ...footer, logo_url: url })}
                  helperText="Se vazio, exibe o logo padrão ou ícone estilizado da marca."
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold">Nome da Empresa</Label>
                    <Input
                      className="mt-1 text-xs"
                      value={footer.company_name}
                      onChange={(e) => onChangeFooter({ ...footer, company_name: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">WhatsApp de Atendimento</Label>
                    <Input
                      className="mt-1 text-xs font-mono"
                      value={footer.whatsapp}
                      onChange={(e) => onChangeFooter({ ...footer, whatsapp: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Telefone Comercial</Label>
                    <Input
                      className="mt-1 text-xs font-mono"
                      value={footer.phone}
                      onChange={(e) => onChangeFooter({ ...footer, phone: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">E-mail Comercial</Label>
                    <Input
                      className="mt-1 text-xs"
                      value={footer.email}
                      onChange={(e) => onChangeFooter({ ...footer, email: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Horários de Atendimento</Label>
                  <Input
                    className="mt-1 text-xs"
                    value={footer.business_hours}
                    onChange={(e) => onChangeFooter({ ...footer, business_hours: e.target.value })}
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Endereço Físico / Comercial</Label>
                  <Input
                    className="mt-1 text-xs"
                    value={footer.address}
                    onChange={(e) => onChangeFooter({ ...footer, address: e.target.value })}
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Descrição Institucional</Label>
                  <Textarea
                    className="mt-1 text-xs h-20"
                    value={footer.description}
                    onChange={(e) => onChangeFooter({ ...footer, description: e.target.value })}
                  />
                </div>

                <div className="pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold">
                      Texto de Direitos Autorais (Copyright)
                    </Label>
                    <Input
                      className="mt-1 text-xs"
                      value={footer.copyright}
                      onChange={(e) => onChangeFooter({ ...footer, copyright: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">
                      Links Legais (Termos & Privacidade)
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Rótulo Termos"
                        className="text-xs"
                        value={footer.terms_label}
                        onChange={(e) => onChangeFooter({ ...footer, terms_label: e.target.value })}
                      />
                      <Input
                        placeholder="URL Termos (/loja)"
                        className="text-xs font-mono"
                        value={footer.terms_url}
                        onChange={(e) => onChangeFooter({ ...footer, terms_url: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Rótulo Privacidade"
                        className="text-xs"
                        value={footer.privacy_label}
                        onChange={(e) =>
                          onChangeFooter({ ...footer, privacy_label: e.target.value })
                        }
                      />
                      <Input
                        placeholder="URL Privacidade (/loja)"
                        className="text-xs font-mono"
                        value={footer.privacy_url}
                        onChange={(e) => onChangeFooter({ ...footer, privacy_url: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Configurações de Visibilidade por Elemento */}
            <Card className="lg:col-span-4 border-slate-200 dark:border-slate-800">
              <CardHeader className="p-4 pb-2 border-b">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Exibição / Ocultação de Elementos
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {[
                  { key: 'show_logo', label: 'Logotipo do Rodapé' },
                  { key: 'show_company_name', label: 'Nome da Empresa' },
                  { key: 'show_description', label: 'Descrição Institucional' },
                  { key: 'show_columns', label: 'Colunas de Conteúdo' },
                  { key: 'show_social_links', label: 'Barra de Redes Sociais' },
                  { key: 'show_copyright', label: 'Texto de Copyright' },
                  { key: 'show_legal_links', label: 'Links de Termos / Privacidade' },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 cursor-pointer text-xs"
                  >
                    <span className="font-medium">{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean((footer.visibility as any)[key])}
                      onChange={(e) =>
                        onChangeFooter({
                          ...footer,
                          visibility: {
                            ...footer.visibility,
                            [key]: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </label>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ========================================================
            SUB-ABA 2: COLUNAS & LINKS CRUD COM ORDENAÇÃO
        ======================================================== */}
        <TabsContent value="columns" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold">Colunas do Rodapé</h4>
              <p className="text-xs text-slate-500">
                Adicione, remova, edite o tipo e reordene as colunas exibidas na grade do rodapé.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleOpenAddColumn}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
            >
              <Plus className="w-4 h-4" /> Nova Coluna
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedColumns.map((col, idx) => (
              <Card
                key={col.id}
                className={`border transition-all ${
                  col.is_visible
                    ? 'border-slate-200 dark:border-slate-800'
                    : 'border-slate-200/50 opacity-60 bg-slate-50/50'
                }`}
              >
                <CardHeader className="p-4 pb-2 border-b flex flex-row items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <CardTitle className="text-xs font-bold">{col.title}</CardTitle>
                      <span className="text-[10px] text-slate-400 capitalize">
                        Tipo: {col.type === 'categories' ? 'Categorias do Banco' : col.type}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Botões Mover */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={idx === 0}
                      onClick={() => handleMoveColumn(idx, 'up')}
                      className="h-7 w-7 p-0"
                      title="Mover para esquerda/cima"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={idx === sortedColumns.length - 1}
                      onClick={() => handleMoveColumn(idx, 'down')}
                      className="h-7 w-7 p-0"
                      title="Mover para direita/baixo"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>

                    {/* Visibilidade */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleColumnVisibility(col.id)}
                      className="h-7 w-7 p-0"
                      title={col.is_visible ? 'Ocultar Coluna' : 'Exibir Coluna'}
                    >
                      {col.is_visible ? (
                        <Eye className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </Button>

                    {/* Editar Coluna */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEditColumn(col)}
                      className="text-[11px] h-7 px-2"
                    >
                      Editar
                    </Button>

                    {/* Excluir Coluna */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteColumn(col.id)}
                      className="h-7 w-7 p-0 text-rose-500 hover:text-rose-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-3">
                  {col.type === 'text' && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 whitespace-pre-line">
                      {col.text_content || 'Nenhum texto informado.'}
                    </p>
                  )}

                  {col.type === 'categories' && (
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between">
                      <span>Categorias geradas dinamicamente do banco de dados</span>
                      <Badge variant="outline" className="text-[10px]">
                        {categories.length} ativas
                      </Badge>
                    </div>
                  )}

                  {col.type === 'contact' && (
                    <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <p>• WhatsApp: {footer.whatsapp || 'Padrão'}</p>
                      <p>• Telefone: {footer.phone || 'Padrão'}</p>
                      <p>• E-mail: {footer.email || 'Padrão'}</p>
                    </div>
                  )}

                  {/* Gerenciamento de Links na Coluna */}
                  {(col.type === 'links' || col.type === 'contact') && (
                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Links da Coluna ({col.links?.length || 0})
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenAddLink(col.id)}
                          className="text-[11px] h-6 px-2 text-emerald-600 hover:text-emerald-700"
                        >
                          <Plus className="w-3 h-3 mr-1" /> Adicionar Link
                        </Button>
                      </div>

                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {(col.links || []).map((lnk) => (
                          <div
                            key={lnk.id}
                            className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 text-xs"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className="font-medium truncate">{lnk.label}</span>
                              <span className="text-[10px] text-slate-400 font-mono truncate">
                                {lnk.href}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEditLink(col.id, lnk)}
                                className="h-6 px-1.5 text-[10px]"
                              >
                                Editar
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteLink(col.id, lnk.id)}
                                className="h-6 w-6 p-0 text-rose-500 hover:text-rose-700"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        {(!col.links || col.links.length === 0) && (
                          <p className="text-[11px] text-slate-400 italic">
                            Nenhum link adicionado ainda nesta coluna.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ========================================================
            SUB-ABA 3: REDES SOCIAIS CRUD
        ======================================================== */}
        <TabsContent value="social" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold">Redes Sociais & Canais</h4>
              <p className="text-xs text-slate-500">
                Configure os ícones e links que aparecem na barra social do rodapé.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleOpenAddSocial}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
            >
              <Plus className="w-4 h-4" /> Adicionar Rede Social
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {(footer.social_links || []).map((s) => (
              <Card
                key={s.id}
                className={`border p-4 space-y-3 ${
                  s.is_visible
                    ? 'border-slate-200 dark:border-slate-800'
                    : 'border-slate-200/50 opacity-60 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize text-[10px]">
                      {s.platform}
                    </Badge>
                    <span className="text-xs font-bold">{s.label}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleSocialVisibility(s.id)}
                      className="h-7 w-7 p-0"
                    >
                      {s.is_visible ? (
                        <Eye className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSocial(s.id)}
                      className="h-7 w-7 p-0 text-rose-500 hover:text-rose-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-slate-500 truncate" title={s.url}>
                  {s.url}
                </div>

                <div className="pt-2 border-t flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEditSocial(s)}
                    className="text-xs h-7"
                  >
                    Editar Link
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ========================================================
            SUB-ABA 4: CORES DO RODAPÉ (Color Pickers)
        ======================================================== */}
        <TabsContent value="colors" className="space-y-4">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="p-5 pb-3 border-b">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Palette className="w-4 h-4 text-emerald-600" />
                Cores do Rodapé
              </CardTitle>
              <CardDescription className="text-xs">
                Ajuste o esquema cromático exclusivo do rodapé (fundo, títulos, textos e links).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {/* Cor de Fundo */}
                <div>
                  <Label className="text-xs font-semibold">Cor de Fundo do Rodapé</Label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <input
                      type="color"
                      value={footer.colors.bg_color}
                      onChange={(e) =>
                        onChangeFooter({
                          ...footer,
                          colors: { ...footer.colors, bg_color: e.target.value },
                        })
                      }
                      className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                    />
                    <Input
                      className="text-xs font-mono"
                      value={footer.colors.bg_color}
                      onChange={(e) =>
                        onChangeFooter({
                          ...footer,
                          colors: { ...footer.colors, bg_color: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>

                {/* Cor dos Títulos */}
                <div>
                  <Label className="text-xs font-semibold">Cor dos Títulos de Colunas</Label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <input
                      type="color"
                      value={footer.colors.title_color}
                      onChange={(e) =>
                        onChangeFooter({
                          ...footer,
                          colors: { ...footer.colors, title_color: e.target.value },
                        })
                      }
                      className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                    />
                    <Input
                      className="text-xs font-mono"
                      value={footer.colors.title_color}
                      onChange={(e) =>
                        onChangeFooter({
                          ...footer,
                          colors: { ...footer.colors, title_color: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>

                {/* Cor dos Textos Normais */}
                <div>
                  <Label className="text-xs font-semibold">Cor dos Textos Gerais</Label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <input
                      type="color"
                      value={footer.colors.text_color}
                      onChange={(e) =>
                        onChangeFooter({
                          ...footer,
                          colors: { ...footer.colors, text_color: e.target.value },
                        })
                      }
                      className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                    />
                    <Input
                      className="text-xs font-mono"
                      value={footer.colors.text_color}
                      onChange={(e) =>
                        onChangeFooter({
                          ...footer,
                          colors: { ...footer.colors, text_color: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>

                {/* Cor dos Links */}
                <div>
                  <Label className="text-xs font-semibold">Cor dos Links</Label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <input
                      type="color"
                      value={footer.colors.link_color}
                      onChange={(e) =>
                        onChangeFooter({
                          ...footer,
                          colors: { ...footer.colors, link_color: e.target.value },
                        })
                      }
                      className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                    />
                    <Input
                      className="text-xs font-mono"
                      value={footer.colors.link_color}
                      onChange={(e) =>
                        onChangeFooter({
                          ...footer,
                          colors: { ...footer.colors, link_color: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>

                {/* Cor de Destaque / Hover */}
                <div>
                  <Label className="text-xs font-semibold">Cor de Destaque / Hover</Label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <input
                      type="color"
                      value={footer.colors.link_hover_color}
                      onChange={(e) =>
                        onChangeFooter({
                          ...footer,
                          colors: { ...footer.colors, link_hover_color: e.target.value },
                        })
                      }
                      className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                    />
                    <Input
                      className="text-xs font-mono"
                      value={footer.colors.link_hover_color}
                      onChange={(e) =>
                        onChangeFooter({
                          ...footer,
                          colors: { ...footer.colors, link_hover_color: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>

                {/* Cor das Linhas Divisórias */}
                <div>
                  <Label className="text-xs font-semibold">Cor das Bordas / Divisórias</Label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <input
                      type="color"
                      value={footer.colors.border_color}
                      onChange={(e) =>
                        onChangeFooter({
                          ...footer,
                          colors: { ...footer.colors, border_color: e.target.value },
                        })
                      }
                      className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                    />
                    <Input
                      className="text-xs font-mono"
                      value={footer.colors.border_color}
                      onChange={(e) =>
                        onChangeFooter({
                          ...footer,
                          colors: { ...footer.colors, border_color: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========================================================
            SUB-ABA 5: PRÉ-VISUALIZAÇÃO AO VIVO
        ======================================================== */}
        <TabsContent value="preview" className="space-y-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
            <span>
              <strong>Pré-visualização em Tempo Real:</strong> Esta simulação renderiza exatamente
              como o rodapé aparecerá para os clientes na loja pública (/loja).
            </span>
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={onSave}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 ml-4 shrink-0"
            >
              <Save className="w-3.5 h-3.5" /> Salvar Rodapé
            </Button>
          </div>

          <div className="rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-800 shadow-lg">
            <StoreFooter footer={footer} categories={categories} previewMode={true} />
          </div>
        </TabsContent>
      </Tabs>

      {/* ========================================================
          MODAL: EDITAR / CRIAR COLUNA
      ======================================================== */}
      <Dialog open={columnDialogOpen} onOpenChange={setColumnDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingColumn?.id ? 'Configurar Coluna do Rodapé' : 'Nova Coluna'}
            </DialogTitle>
          </DialogHeader>

          {editingColumn && (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs font-semibold">Título da Coluna *</Label>
                <Input
                  className="mt-1 text-xs"
                  value={editingColumn.title}
                  onChange={(e) => setEditingColumn({ ...editingColumn, title: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Tipo da Coluna</Label>
                <Select
                  value={editingColumn.type}
                  onValueChange={(val: any) => setEditingColumn({ ...editingColumn, type: val })}
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="links">Lista de Links Personalizados</SelectItem>
                    <SelectItem value="categories">
                      Categorias Dinâmicas (Direto do Banco)
                    </SelectItem>
                    <SelectItem value="text">Texto Livre / Institucional</SelectItem>
                    <SelectItem value="contact">Informações de Atendimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editingColumn.type === 'text' && (
                <div>
                  <Label className="text-xs font-semibold">Texto da Coluna</Label>
                  <Textarea
                    className="mt-1 text-xs h-24"
                    value={editingColumn.text_content || ''}
                    onChange={(e) =>
                      setEditingColumn({
                        ...editingColumn,
                        text_content: e.target.value,
                      })
                    }
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingColumn.is_visible}
                  onChange={(e) =>
                    setEditingColumn({ ...editingColumn, is_visible: e.target.checked })
                  }
                  className="rounded text-emerald-600"
                />
                <span>Coluna Visível no Rodapé</span>
              </label>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setColumnDialogOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveColumnModal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              Salvar Coluna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================
          MODAL: EDITAR / CRIAR LINK DENTRO DE UMA COLUNA
      ======================================================== */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingLink?.id ? 'Configurar Link' : 'Novo Link'}
            </DialogTitle>
          </DialogHeader>

          {editingLink && (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs font-semibold">Rótulo / Texto do Link *</Label>
                <Input
                  className="mt-1 text-xs"
                  value={editingLink.label}
                  onChange={(e) => setEditingLink({ ...editingLink, label: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Destino (URL ou Rota interna) *</Label>
                <Input
                  className="mt-1 text-xs font-mono"
                  placeholder="/loja, https://... ou /orcamentos/novo"
                  value={editingLink.href}
                  onChange={(e) => setEditingLink({ ...editingLink, href: e.target.value })}
                />
                <span className="text-[10px] text-slate-400">
                  Rotas internas iniciam com / (ex: /loja). Links externos iniciam com https://
                </span>
              </div>

              <div>
                <Label className="text-xs font-semibold">Ícone Opcional</Label>
                <Select
                  value={editingLink.icon || 'none'}
                  onValueChange={(val) =>
                    setEditingLink({
                      ...editingLink,
                      icon: val === 'none' ? '' : val,
                    })
                  }
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem ícone</SelectItem>
                    <SelectItem value="truck">Caminhão (Entrega / Frete)</SelectItem>
                    <SelectItem value="shield">Escudo (Garantia / Segurança)</SelectItem>
                    <SelectItem value="card">Cartão de Crédito</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="mail">E-mail</SelectItem>
                    <SelectItem value="clock">Relógio / Horário</SelectItem>
                    <SelectItem value="map">Localização / Mapa</SelectItem>
                    <SelectItem value="file">Arquivo / Documento</SelectItem>
                    <SelectItem value="user">Usuário / Conta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(editingLink.target_blank)}
                  onChange={(e) =>
                    setEditingLink({ ...editingLink, target_blank: e.target.checked })
                  }
                  className="rounded text-emerald-600"
                />
                <span>Abrir em nova aba (target="_blank")</span>
              </label>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLinkDialogOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveLinkModal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              Salvar Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================
          MODAL: EDITAR / CRIAR REDE SOCIAL
      ======================================================== */}
      <Dialog open={socialDialogOpen} onOpenChange={setSocialDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Configurar Rede Social</DialogTitle>
          </DialogHeader>

          {editingSocial && (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs font-semibold">Plataforma</Label>
                <Select
                  value={editingSocial.platform}
                  onValueChange={(val: any) =>
                    setEditingSocial({
                      ...editingSocial,
                      platform: val,
                      label:
                        val === 'instagram'
                          ? 'Instagram'
                          : val === 'facebook'
                            ? 'Facebook'
                            : val === 'whatsapp'
                              ? 'WhatsApp'
                              : val === 'linkedin'
                                ? 'LinkedIn'
                                : val === 'youtube'
                                  ? 'YouTube'
                                  : val === 'x'
                                    ? 'X (Twitter)'
                                    : editingSocial.label,
                    })
                  }
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="x">X / Twitter</SelectItem>
                    <SelectItem value="custom">Outro Canal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Rótulo Exibido *</Label>
                <Input
                  className="mt-1 text-xs"
                  value={editingSocial.label}
                  onChange={(e) => setEditingSocial({ ...editingSocial, label: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">URL Completa *</Label>
                <Input
                  className="mt-1 text-xs font-mono"
                  placeholder="https://instagram.com/..."
                  value={editingSocial.url}
                  onChange={(e) => setEditingSocial({ ...editingSocial, url: e.target.value })}
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingSocial.is_visible}
                  onChange={(e) =>
                    setEditingSocial({ ...editingSocial, is_visible: e.target.checked })
                  }
                  className="rounded text-emerald-600"
                />
                <span>Ícone Visível no Rodapé</span>
              </label>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSocialDialogOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveSocialModal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              Salvar Rede Social
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
