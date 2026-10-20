import React, { useState, useEffect } from 'react'
import { storeService } from '@/services/storeService'
import { pb } from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/hooks/use-toast'
import {
  ShoppingBag,
  Search,
  RefreshCw,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  Truck,
  UserCheck,
  ShieldCheck,
  ArrowRight,
  Clock,
  ExternalLink,
} from 'lucide-react'

export const StoreOrdersCrmPage: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Modal de Detalhes
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [orderDetails, setOrderDetails] = useState<any | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [isReleasing, setIsReleasing] = useState(false)

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const list = await storeService.adminGetStoreOrders()
      setOrders(list || [])
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar pedidos da loja',
        description: err?.message || 'Falha ao buscar registros.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  const handleOpenDetails = async (orderId: string) => {
    setSelectedOrderId(orderId)
    try {
      setLoadingDetails(true)
      const data = await storeService.adminGetStoreOrderDetails(orderId)
      setOrderDetails(data)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar detalhes do pedido',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setLoadingDetails(false)
    }
  }

  const handleApproveArt = async (artId: string) => {
    try {
      await storeService.adminReviewArt(artId, 'approved')
      if (selectedOrderId) {
        await storeService.adminUpdateOrderStatus(selectedOrderId, { art_status: 'approved' })
        const updated = await storeService.adminGetStoreOrderDetails(selectedOrderId)
        setOrderDetails(updated)
      }
      toast({
        title: 'Arte técnica aprovada!',
        description: 'O status da arte foi atualizado para Aprovada.',
      })
      fetchOrders()
    } catch (err: any) {
      toast({
        title: 'Erro ao aprovar arte',
        description: err?.message,
        variant: 'destructive',
      })
    }
  }

  const handleRejectArt = async (artId: string) => {
    const reason = prompt('Informe o motivo da recusa técnica da arte:')
    if (!reason) return

    try {
      await storeService.adminReviewArt(artId, 'rejected', reason)
      if (selectedOrderId) {
        await storeService.adminUpdateOrderStatus(selectedOrderId, {
          art_status: 'rejected',
          human_intervention_needed: true,
          human_intervention_reason: `Arte recusada: ${reason}`,
        })
        const updated = await storeService.adminGetStoreOrderDetails(selectedOrderId)
        setOrderDetails(updated)
      }
      toast({
        title: 'Arte recusada',
        description: 'Sinalizada intervenção humana e motivo registrado.',
      })
      fetchOrders()
    } catch (err: any) {
      toast({
        title: 'Erro ao recusar arte',
        description: err?.message,
        variant: 'destructive',
      })
    }
  }

  const handleReleaseToProduction = async () => {
    if (!selectedOrderId) return
    try {
      setIsReleasing(true)
      const res = await pb.send(
        `/backend/v1/crm/store/orders/${selectedOrderId}/release-to-production`,
        {
          method: 'POST',
        },
      )

      if (res && res.success) {
        toast({
          title: 'Pedido liberado para produção!',
          description: `Ordem de Produção criada com sucesso (OP vinculada: ${res.production_order_id}).`,
        })
        const updated = await storeService.adminGetStoreOrderDetails(selectedOrderId)
        setOrderDetails(updated)
        fetchOrders()
      }
    } catch (err: any) {
      toast({
        title: 'Falha na liberação para produção',
        description: err?.message || 'Erro ao comunicar com a esteira.',
        variant: 'destructive',
      })
    } finally {
      setIsReleasing(false)
    }
  }

  // Vínculo Seguro de Cliente CRM (Nunca auto-merge indiscriminado)
  const handleConfirmCrmLink = async (customerId: string, clientCrmId: string) => {
    try {
      await storeService.adminVerifyLinkStoreCustomer(customerId, clientCrmId, true)
      toast({
        title: 'Vínculo confirmado com segurança!',
        description: `Comprador associado com validação humana ao cliente CRM ${clientCrmId}.`,
      })
      if (selectedOrderId) {
        const updated = await storeService.adminGetStoreOrderDetails(selectedOrderId)
        setOrderDetails(updated)
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao vincular',
        description: err?.message,
        variant: 'destructive',
      })
    }
  }

  const filteredOrders = orders.filter((o) => {
    const matchSearch =
      o.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer_email?.toLowerCase().includes(searchTerm.toLowerCase())

    if (!matchSearch) return false
    if (filterStatus === 'pending_payment') return o.payment_status === 'pending'
    if (filterStatus === 'paid') return o.payment_status === 'paid'
    if (filterStatus === 'art_pending')
      return o.art_status === 'uploaded' || o.art_status === 'pending_upload'
    if (filterStatus === 'intervention') return o.human_intervention_needed === true
    return true
  })

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Pedidos da Loja Virtual
            </h1>
            <Badge variant="outline" className="text-blue-700 bg-blue-50 border-blue-200">
              Laletra Store Fase 2
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Gestão integrada dos pedidos recebidos na loja, conferência de arte, aprovação
            financeira e liberação para produção.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOrders} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row gap-3 my-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <Input
            placeholder="Buscar por número do pedido, cliente ou e-mail..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filterStatus === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('all')}
          >
            Todos ({orders.length})
          </Button>
          <Button
            variant={filterStatus === 'paid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('paid')}
          >
            Pagos
          </Button>
          <Button
            variant={filterStatus === 'pending_payment' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('pending_payment')}
          >
            Aguardando Pgto
          </Button>
          <Button
            variant={filterStatus === 'art_pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('art_pending')}
          >
            Arte Pendente
          </Button>
          <Button
            variant={filterStatus === 'intervention' ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus('intervention')}
          >
            Intervenção Humana
          </Button>
        </div>
      </div>

      {/* Tabela de Pedidos */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70">
                <TableHead className="font-semibold">Pedido</TableHead>
                <TableHead className="font-semibold">Data</TableHead>
                <TableHead className="font-semibold">Comprador</TableHead>
                <TableHead className="font-semibold">Valor Total</TableHead>
                <TableHead className="font-semibold">Pagamento</TableHead>
                <TableHead className="font-semibold">Arte</TableHead>
                <TableHead className="font-semibold">Produção</TableHead>
                <TableHead className="text-right font-semibold">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
                    Carregando pedidos da loja...
                  </TableCell>
                </TableRow>
              ) : filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-slate-500">
                    <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    Nenhum pedido encontrado com os filtros aplicados.
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((o) => (
                  <TableRow key={o.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-bold text-slate-900">
                      {o.order_number}
                      {o.human_intervention_needed && (
                        <span className="ml-2 inline-flex items-center text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-normal">
                          Pendente Atendimento
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {new Date(o.created).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-semibold text-slate-800">{o.customer_name}</div>
                      <div className="text-[11px] text-slate-400">{o.customer_phone}</div>
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900 text-sm">
                      R$ {Number(o.total_amount || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={o.payment_status === 'paid' ? 'default' : 'secondary'}
                        className="text-[11px]"
                      >
                        {o.payment_status === 'paid' ? 'Pago' : 'Pendente'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          o.art_status === 'approved'
                            ? 'default'
                            : o.art_status === 'rejected'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="text-[11px]"
                      >
                        {o.art_status === 'approved'
                          ? 'Aprovada'
                          : o.art_status === 'uploaded'
                            ? 'Enviada'
                            : o.art_status === 'rejected'
                              ? 'Recusada'
                              : 'Aguardando'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-600">
                        {o.production_status === 'released_to_production'
                          ? 'Liberado'
                          : o.production_status === 'in_production'
                            ? 'Em Produção'
                            : 'Aguardando Liberação'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenDetails(o.id)}
                        className="h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de Detalhes Completos do Pedido */}
      <Dialog open={!!selectedOrderId} onOpenChange={(open) => !open && setSelectedOrderId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              Pedido {orderDetails?.order?.order_number}
              <Badge
                variant={orderDetails?.order?.payment_status === 'paid' ? 'default' : 'secondary'}
              >
                {orderDetails?.order?.payment_status === 'paid' ? 'Pago' : 'Aguardando Pagamento'}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Dados técnicos, conferência de arquivos de arte e vínculo com CRM.
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="py-12 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
              Carregando dados completos...
            </div>
          ) : orderDetails ? (
            <div className="space-y-6 py-2">
              {/* Informações do Comprador & Vínculo CRM */}
              <div className="bg-slate-50 p-4 rounded-lg space-y-2 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="font-semibold text-slate-800 text-sm">Dados do Comprador:</span>
                  <span className="text-slate-500">
                    ID Loja: {orderDetails.order.customer_id || 'Visitante'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                  <p>
                    <strong>Nome:</strong> {orderDetails.order.customer_name}
                  </p>
                  <p>
                    <strong>E-mail:</strong> {orderDetails.order.customer_email}
                  </p>
                  <p>
                    <strong>Telefone:</strong> {orderDetails.order.customer_phone}
                  </p>
                  <p>
                    <strong>Documento:</strong>{' '}
                    {orderDetails.order.customer_document || 'Não informado'}
                  </p>
                  <p>
                    <strong>Forma de Envio:</strong>{' '}
                    {orderDetails.order.delivery_method === 'pickup' ? 'Balcão Grátis' : 'Entrega'}
                  </p>
                </div>

                {/* Vínculo seguro com CRM */}
                {orderDetails.order.expand?.customer_id && (
                  <div className="pt-2 border-t border-slate-200 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Status no CRM:</span>
                      <Badge variant="outline" className="text-[11px]">
                        {orderDetails.order.expand.customer_id.crm_link_status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {orderDetails.order.expand.customer_id.crm_link_notes}
                    </p>
                    {orderDetails.order.expand.customer_id.crm_link_status === 'suggested' && (
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                          onClick={() =>
                            handleConfirmCrmLink(
                              orderDetails.order.customer_id,
                              orderDetails.order.expand.customer_id.linked_client_id,
                            )
                          }
                        >
                          <UserCheck className="w-3.5 h-3.5 mr-1" />
                          Confirmar Vínculo Sugerido
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Itens do Pedido */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">
                  Itens e Especificações Congeladas
                </h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs">Produto</TableHead>
                        <TableHead className="text-xs">Qtd</TableHead>
                        <TableHead className="text-xs">Dimensões</TableHead>
                        <TableHead className="text-xs">Unitário</TableHead>
                        <TableHead className="text-xs text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderDetails.items?.map((it: any) => (
                        <TableRow key={it.id}>
                          <TableCell className="text-xs font-medium text-slate-900">
                            {it.product_name}
                          </TableCell>
                          <TableCell className="text-xs">{it.quantity}</TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {it.width && it.height ? `${it.width} x ${it.height} cm` : 'Padrão'}
                          </TableCell>
                          <TableCell className="text-xs">
                            R$ {Number(it.unit_price).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-right">
                            R$ {Number(it.total_price).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Arquivos de Arte Enviados */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">
                  Conferência de Arte Técnica
                </h3>
                {orderDetails.arts?.length === 0 ? (
                  <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded border">
                    Nenhum arquivo de arte enviado pelo comprador até o momento.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {orderDetails.arts?.map((art: any) => (
                      <div
                        key={art.id}
                        className="p-3 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-slate-900">
                              {art.original_filename}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              Enviado em {new Date(art.created).toLocaleString('pt-BR')}
                            </p>
                            {art.rejection_reason && (
                              <p className="text-[11px] text-red-600 mt-1">
                                <strong>Motivo da recusa:</strong> {art.rejection_reason}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant={
                              art.status === 'approved'
                                ? 'default'
                                : art.status === 'rejected'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                            className="text-xs"
                          >
                            {art.status === 'approved'
                              ? 'Aprovada'
                              : art.status === 'rejected'
                                ? 'Recusada'
                                : 'Recebida'}
                          </Badge>

                          {art.status !== 'approved' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs text-emerald-700 hover:bg-emerald-50"
                              onClick={() => handleApproveArt(art.id)}
                            >
                              <CheckCircle className="w-3.5 h-3.5 mr-1" />
                              Aprovar
                            </Button>
                          )}
                          {art.status !== 'rejected' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs text-red-700 hover:bg-red-50"
                              onClick={() => handleRejectArt(art.id)}
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              Recusar
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status de Liberação para Produção */}
              <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    Esteira de Produção
                  </span>
                  <Badge variant="outline" className="text-xs bg-white text-blue-800">
                    {orderDetails.order.production_status}
                  </Badge>
                </div>

                {orderDetails.order.production_order_id ? (
                  <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    Ordem de Produção já vinculada ({orderDetails.order.production_order_id}).
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600">
                      Liberação condicionada a: Pagamento confirmado + Arte técnica aprovada (ou
                      autorização comercial do atendente).
                    </p>
                    <Button
                      size="sm"
                      onClick={handleReleaseToProduction}
                      disabled={isReleasing}
                      className="bg-blue-600 hover:bg-blue-700 text-xs"
                    >
                      <ArrowRight className="w-3.5 h-3.5 mr-1" />
                      {isReleasing ? 'Liberando...' : 'Liberar para Fila de Produção'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedOrderId(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default StoreOrdersCrmPage
