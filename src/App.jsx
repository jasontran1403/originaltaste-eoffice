import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'

import AppLayout from './layouts/AppLayout'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'

// Accountant pages
import DashboardPage from './pages/accountant/DashboardPage'
import ESignPage from './pages/accountant/ESignPage'
import OrderListPage from './pages/OrderListPage'

// Admin pages
import { AdminDashboardPage, AdminTaskListPage } from './pages/admin/AdminPages'

// User pages
import UserTaskPage from './pages/user/UserTaskPage'

// Public pages (no auth)
import ExnessPage from './pages/ExnessPage'

/**
 * vps.domain.com
 *
 * Role routing:
 *   ADMIN / SUPERADMIN   → manager dashboard + kanban board
 *   ACCOUNTANT           → kế toán dashboard + đơn hàng + ký số + task được giao
 *   USER / SELLER / POS  → task được giao
 */

const MANAGER_ROLES = ['ADMIN', 'SUPERADMIN']
const ACCOUNTANT_ROLES = ['ACCOUNTANT']
const WORKER_ROLES = ['USER', 'SELLER', 'POS'] // + ACCOUNTANT cũng thấy task

function Protected({ children, allow }) {
  const { auth } = useAuth()
  const loc = useLocation()
  if (!auth) return <Navigate to="/login" state={{ from: loc }} replace />
  if (allow && !allow.includes(auth.role)) return <NotFoundPage />
  return children
}

function RoleIndex() {
  const { auth } = useAuth()
  if (!auth) return <Navigate to="/login" replace />
  if (MANAGER_ROLES.includes(auth.role)) return <AdminDashboardPage />
  if (ACCOUNTANT_ROLES.includes(auth.role)) return <DashboardPage />
  return <UserTaskPage />
}

function TasksPage() {
  const { auth } = useAuth()
  if (MANAGER_ROLES.includes(auth?.role)) return <AdminTaskListPage />
  return <UserTaskPage />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Public pages - no auth required */}
        <Route path="/exness" element={<ExnessPage />} />

        <Route path="/" element={<Protected><AppLayout /></Protected>}>
          <Route index element={<RoleIndex />} />
          <Route path="tasks" element={<TasksPage />} />

          {/* Accountant-only */}
          <Route path="orders" element={
            <Protected allow={['ACCOUNTANT', 'SUPERADMIN']}><OrderListPage /></Protected>
          } />
          <Route path="sign" element={
            <Protected allow={['ACCOUNTANT', 'SUPERADMIN']}><ESignPage /></Protected>
          } />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
