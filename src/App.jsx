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

/**
 * Văn phòng số — vps.domain.com
 *
 * Login → role-based redirect:
 *   ADMIN      → /          (admin dashboard)
 *   ACCOUNTANT → /          (accountant dashboard)
 *   USER       → /          (user tasks)
 *
 * Mọi role đều thấy /tasks (công việc được giao).
 * ADMIN thấy thêm quản lý task.
 * ACCOUNTANT thấy thêm đơn hàng + ký số.
 */

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
  if (auth.role === 'ADMIN') return <AdminDashboardPage />
  if (auth.role === 'ACCOUNTANT' || auth.role === 'SUPERADMIN') return <DashboardPage />
  return <UserTaskPage />
}

function TasksPage() {
  const { auth } = useAuth()
  if (auth?.role === 'ADMIN') return <AdminTaskListPage />
  return <UserTaskPage />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/" element={<Protected><AppLayout /></Protected>}>
          <Route index element={<RoleIndex />} />

          {/* Shared: task views */}
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
