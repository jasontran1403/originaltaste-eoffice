import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { login } from '../services/api'
import { useAuth, rememberedUsername } from '../hooks/useAuth'

export default function LoginPage() {
  const [form, setForm] = useState(() => ({ username: rememberedUsername(), password: '' }))
  const [remember, setRemember] = useState(() => !!rememberedUsername())
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const { saveAuth } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true); setErr('')
    try {
      const res = await login(form.username, form.password)
      const d = res.data?.data || res.data
      const token = d?.accessToken
      const role  = d?.role
      if (!token) throw new Error('Không nhận được token')

      const allowed = ['ADMIN', 'SUPERADMIN', 'ACCOUNTANT', 'USER', 'SELLER', 'POS']
      if (!allowed.includes(role)) throw new Error('Tài khoản không có quyền truy cập.')

      saveAuth(token, role, { remember, username: form.username })
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (e) {
      setErr(e.response?.data?.message || e.message)
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-[100svh] w-full bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/30 mb-4">
            <span className="text-3xl">🏢</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Văn phòng số</h1>
          <p className="text-blue-300 text-sm mt-1">Quản lý công việc & vận hành</p>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-blue-200 uppercase tracking-wider mb-2">Tên đăng nhập</label>
              <input type="text" required autoFocus value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))} placeholder="username"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/30 outline-none focus:border-blue-400 focus:bg-white/15 transition-all text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-blue-200 uppercase tracking-wider mb-2">Mật khẩu</label>
              <input type="password" required value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="••••••••"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/30 outline-none focus:border-blue-400 focus:bg-white/15 transition-all text-sm" />
            </div>
            {err && <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">{err}</div>}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="w-4 h-4 rounded accent-blue-500" />
              <span className="text-sm text-blue-100">Ghi nhớ đăng nhập</span>
            </label>
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50 text-sm mt-2 shadow-lg shadow-blue-500/20">
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}