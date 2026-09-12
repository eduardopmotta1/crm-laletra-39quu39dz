import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import AppLayout from '@/components/AppLayout'

// Pages
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import DashboardPage from '@/pages/DashboardPage'
import PendingHubPage from '@/pages/PendingHubPage'
import KanbanPage from '@/pages/KanbanPage'
import ClientsListPage from '@/pages/ClientsListPage'
import TasksPage from '@/pages/TasksPage'
import SettingsPage from '@/pages/SettingsPage'
import WhatsAppTemplatesPage from '@/pages/WhatsAppTemplatesPage'
import ArchivedDealsPage from '@/pages/ArchivedDealsPage'
import PostSalesDashboardPage from '@/pages/PostSalesDashboardPage'
import CustomerRecoveryPage from '@/pages/CustomerRecoveryPage'
import ProductionKanbanPage from '@/pages/ProductionKanbanPage'
import MaterialsPage from '@/pages/MaterialsPage'
import ProductsPage from '@/pages/ProductsPage'
import QuotesListPage from '@/pages/QuotesListPage'
import NewQuotePage from '@/pages/NewQuotePage'
import PublicTrackingPage from '@/pages/PublicTrackingPage'
import PublicEvaluationPage from '@/pages/PublicEvaluationPage'
import PublicQuotePage from '@/pages/PublicQuotePage'
import PublicClientFormPage from '@/pages/PublicClientFormPage'
import ProceduresPage from '@/pages/ProceduresPage'
import NotFound from '@/pages/NotFound'
const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

          {/* Public Customer Evaluation Route (No Auth Required) */}
          <Route path="/avaliacao/:token" element={<PublicEvaluationPage />} />

          {/* Public Production Order Tracking Route (No Auth Required) */}
          <Route path="/acompanhar/:token" element={<PublicTrackingPage />} />

          {/* Public Quote Approval/Change Route (No Auth Required) */}
          <Route path="/orcamento/:token" element={<PublicQuotePage />} />

          {/* Public Client Registration / Profile Route (No Auth Required) */}
          <Route path="/cadastro/:token" element={<PublicClientFormPage />} />

          {/* Protected CRM App Routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<PendingHubPage />} />
            <Route path="/pendencias" element={<PendingHubPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/kanban" element={<KanbanPage />} />
            <Route path="/producao" element={<ProductionKanbanPage />} />
            <Route path="/clientes" element={<ClientsListPage />} />{' '}
            <Route path="/arquivados" element={<ArchivedDealsPage />} />
            <Route path="/pos-venda" element={<PostSalesDashboardPage />} />
            <Route path="/recuperacao" element={<CustomerRecoveryPage />} />
            <Route path="/procedimentos" element={<ProceduresPage />} />
            <Route path="/orcamentos" element={<QuotesListPage />} />
            <Route path="/orcamentos/novo" element={<NewQuotePage />} />
            <Route path="/orcamentos/:quoteId/editar" element={<NewQuotePage />} />
            <Route path="/orcamentos/produtos" element={<ProductsPage />} />
            <Route path="/orcamentos/materiais" element={<MaterialsPage />} />
            <Route path="/templates" element={<WhatsAppTemplatesPage />} />
            <Route path="/tarefas" element={<TasksPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
          </Route>
          {/* 404 Catch All */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
