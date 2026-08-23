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
import DashboardPage from '@/pages/DashboardPage'
import KanbanPage from '@/pages/KanbanPage'
import ClientsListPage from '@/pages/ClientsListPage'
import TasksPage from '@/pages/TasksPage'
import SettingsPage from '@/pages/SettingsPage'
import WhatsAppTemplatesPage from '@/pages/WhatsAppTemplatesPage'
import ArchivedDealsPage from '@/pages/ArchivedDealsPage'
import PostSalesDashboardPage from '@/pages/PostSalesDashboardPage'
import CustomerRecoveryPage from '@/pages/CustomerRecoveryPage'
import PublicEvaluationPage from '@/pages/PublicEvaluationPage'
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

          {/* Public Customer Evaluation Route (No Auth Required) */}
          <Route path="/avaliacao/:token" element={<PublicEvaluationPage />} />

          {/* Protected CRM App Routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/kanban" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/kanban" element={<KanbanPage />} />
            <Route path="/clientes" element={<ClientsListPage />} />
            <Route path="/arquivados" element={<ArchivedDealsPage />} />
            <Route path="/pos-venda" element={<PostSalesDashboardPage />} />
            <Route path="/recuperacao" element={<CustomerRecoveryPage />} />
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
