import { useState, useEffect, useCallback } from 'react'
import { listTasks } from '../../services/taskApi'
import TaskCard from './TaskCard'
import TaskDetailModal from './TaskDetailModal'
import Select from '../ui/Select'
import ProgressBar from '../ui/ProgressBar'
import { useToast } from '../ui/Toast'

const STATUS_OPTIONS = [
  { value: 'NOT_STARTED', label: 'Chưa bắt đầu' },
  { value: 'IN_PROGRESS', label: 'Đang xử lý' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
]

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Thấp' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HIGH', label: 'Cao' },
  { value: 'URGENT', label: 'Khẩn cấp' },
]

export default function UserTaskBoard() {
  const toast = useToast()

  const [tasks, setTasks] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  const [q, setQ] = useState('')
  const [status, setStatus] = useState(null)
  const [priority, setPriority] = useState(null)

  const [detailId, setDetailId] = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const params = { page, size: 50 }
      if (q) params.q = q
      if (status) params.status = status
      if (priority) params.priority = priority
      const res = await listTasks(params)
      if (res.data?.code === 900) {
        setTasks(res.data.data?.content || [])
        setTotal(res.data.data?.totalElements || 0)
      }
    } catch { toast.error('Lỗi tải task') }
    finally { setLoading(false) }
  }, [page, q, status, priority])

  useEffect(() => { load() }, [load])

  const [searchBuf, setSearchBuf] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setQ(searchBuf); setPage(0) }, 400)
    return () => clearTimeout(t)
  }, [searchBuf])

  // Quick stats
  const active = tasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
  const overdue = active.filter(t => t.deadline && t.deadline < Date.now())
  const done = tasks.filter(t => t.status === 'COMPLETED')
  const avgProgress = active.length ? Math.round(active.reduce((s, t) => s + (t.progress || 0), 0) / active.length) : 0

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <MiniStat icon="📋" label="Tổng" value={total} tone="blue" />
        <MiniStat icon="🔄" label="Đang làm" value={active.length} tone="indigo" />
        <MiniStat icon="✅" label="Hoàn thành" value={done.length} tone="emerald" />
        <MiniStat icon="🔴" label="Quá hạn" value={overdue.length} tone="red" />
      </div>

      {/* Avg progress */}
      {active.length > 0 && (
        <div className="card p-3 mb-4 flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 shrink-0">Tiến độ trung bình</span>
          <ProgressBar value={avgProgress} className="flex-1" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input value={searchBuf} onChange={e => setSearchBuf(e.target.value)} className="input pl-9" placeholder="Tìm task..." />
        </div>
        <Select value={status} onChange={v => { setStatus(v); setPage(0) }} options={STATUS_OPTIONS} placeholder="Trạng thái" clearable className="w-36" size="sm" />
        <Select value={priority} onChange={v => { setPriority(v); setPage(0) }} options={PRIORITY_OPTIONS} placeholder="Ưu tiên" clearable className="w-32" size="sm" />
      </div>

      {/* Task grid */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-gray-400 text-sm">Bạn chưa được giao task nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasks.map(t => (
            <TaskCard key={t.id} task={t} onClick={() => setDetailId(t.id)} />
          ))}
        </div>
      )}

      {detailId && <TaskDetailModal taskId={detailId} onClose={() => setDetailId(null)} onRefresh={load} />}
    </div>
  )
}

function MiniStat({ icon, label, value, tone }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    red: 'bg-red-50 text-red-600 border-red-200',
  }
  return (
    <div className={`rounded-xl border p-3 ${colors[tone] || colors.blue}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] font-semibold opacity-80">{label}</span>
      </div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  )
}
