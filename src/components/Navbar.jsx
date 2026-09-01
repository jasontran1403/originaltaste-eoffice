import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import MessagePanel from './task/MessagePanel'

function getLinks(role) {
  if (role === 'ADMIN') return [
    { to: '/',        icon: '📊', label: 'Dashboard',   end: true },
    { to: '/tasks',   icon: '📋', label: 'Quản lý Task' },
  ]
  if (role === 'ACCOUNTANT' || role === 'SUPERADMIN') return [
    { to: '/',                icon: '📊', label: 'Kế toán',   end: true },
    { to: '/orders',          icon: '📋', label: 'Đơn hàng' },
    { to: '/sign',            icon: '✍️', label: 'Ký số' },
    { to: '/tasks',           icon: '✅', label: 'Công việc' },
  ]
  // USER
  return [
    { to: '/',      icon: '📋', label: 'Công việc',  end: true },
  ]
}

export default function Navbar() {
  const { clearAuth, auth } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)

  const links = getLinks(auth?.role)

  const linkCls = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors
     ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`

  const logout = () => { clearAuth(); nav('/login') }

  const handleTaskNav = taskId => {
    nav(`/tasks?detail=${taskId}`)
  }

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
      <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center h-14 gap-4 sm:gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-base">🏢</div>
          <span className="font-bold text-gray-900 text-sm hidden sm:block">Văn phòng số</span>
        </div>

        {/* Nav — desktop */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map(({ to, icon, label, end }) => (
            <NavLink key={to} to={to} end={end} className={linkCls}>
              <span>{icon}</span><span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          <MessagePanel onNavigateTask={handleTaskNav} />

          {auth?.role && (
            <span className="hidden lg:inline-flex badge bg-gray-100 text-gray-500 text-[10px]">{auth.role}</span>
          )}
          {auth?.username && (
            <span className="hidden sm:inline text-xs text-gray-500">{auth.username}</span>
          )}
          <button onClick={logout} className="btn-ghost text-gray-500 hover:text-red-600">
            <span>↩</span><span className="hidden sm:inline">Đăng xuất</span>
          </button>

          {/* Hamburger */}
          <button
            onClick={() => setOpen(o => !o)}
            aria-label="Menu"
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            {open ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {open && (
        <nav className="md:hidden border-t border-gray-100 px-4 py-2 flex flex-col gap-1 bg-white">
          {links.map(({ to, icon, label, end }) => (
            <NavLink key={to} to={to} end={end} className={linkCls} onClick={() => setOpen(false)}>
              <span>{icon}</span><span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}
