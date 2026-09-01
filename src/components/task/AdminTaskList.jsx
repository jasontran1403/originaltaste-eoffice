import { useState, useEffect, useCallback } from 'react'
import { listTasks, deleteTask, getCategories, getAssignableUsers } from '../../services/taskApi'
import TaskCard from './TaskCard'
import TaskForm from './TaskForm'
import TaskDetailModal from './TaskDetailModal'
import Select from '../ui/Select'
import DatePicker from '../ui/DatePicker'
import { useToast } from '../ui/Toast'

const STATUS_OPTIONS = [
  { value: 'NOT_STARTED', label: 'Chưa bắt đầu' },
  { value: 'IN_PROGRESS', label: 'Đang xử lý' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'CANCELLED', label: 'Đã hủy' },
]

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Thấp' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HIGH', label: 'Cao' },
  { value: 'URGENT', label: 'Khẩn cấp' },
]

export default function AdminTaskList() {
  const toast = useToast()

  const [tasks, setTasks] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filters
  const [q, setQ] = useState('')
  const [status, setStatus] = useState(null)
  const [priority, setPriority] = useState(null)
  const [category, setCategory] = useState(null)
  const [assigneeId, setAssigneeId] = useState(null)
  const [dateRange, setDateRange] = useState({ from: null, to: null })

  const [categories, setCats] = useState([])
  const [users, setUsers] = useState([])

  // Modals
  const [showForm, setShowForm] = useState(false)
  const [editTask, setEditTask] = useState(null)
  const [detailId, setDetailId] = useState(null)

  useEffect(() => {
    getCategories().then(r => { if (r.data?.code === 900) setCats(r.data.data || []) }).catch(() => {})
    getAssignableUsers().then(r => { if (r.data?.code === 900) setUsers(r.data.data || []) }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const params = { page, size: 20 }
      if (q) params.q = q
      if (status) params.status = status
      if (priority) params.priority = priority
      if (category) params.category = category
      if (assigneeId) params.assigneeId = assigneeId
      if (dateRange.from) params.from = dateRange.from
      if (dateRange.to) params.to = dateRange.to

      const res = await listTasks(params)
      if (res.data?.code === 900) {
        setTasks(res.data.data?.content || [])
        setTotal(res.data.data?.totalElements || 0)
      }
    } catch { toast.error('Lỗi tải danh sách task') }
    finally { setLoading(false) }
  }, [page, q, status, priority, category, assigneeId, dateRange])

  useEffect(() => { load() }, [load])

  // Debounce search
  const [searchBuf, setSearchBuf] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setQ(searchBuf); setPage(0) }, 400)
    return () => clearTimeout(t)
  }, [searchBuf])

  const handleDelete = async id => {
    if (!confirm('Xóa task này?')) return
    try {
      await deleteTask(id)
      toast.success('Đã xóa')
      load()
    } catch { toast.error('Lỗi xóa') }
  }

  const catOptions = categories.map(c => ({ value: c, label: c }))
  const userOptions = users.map(u => ({ value: u.id, label: u.fullName || u.username }))

  const totalPages = Math.ceil(total / 20)

  return (
    <div>
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Quản lý Task</h2>
          <p className="text-xs text-gray-500 mt-0.5">{total} task</p>
        </div>
        <button onClick={() => { setEditTask(null); setShowForm(true) }} className="btn-primary shrink-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          Tạo task mới
        </button>
      </div>

      {/* Filters */}
      <div className="card p-3 mb-4">
        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              value={searchBuf}
              onChange={e => setSearchBuf(e.target.value)}
              className="input pl-9"
              placeholder="Tìm tên task..."
            />
          </div>

          <Select value={status} onChange={v => { setStatus(v); setPage(0) }} options={STATUS_OPTIONS} placeholder="Trạng thái" clearable className="w-36" size="sm" />
          <Select value={priority} onChange={v => { setPriority(v); setPage(0) }} options={PRIORITY_OPTIONS} placeholder="Ưu tiên" clearable className="w-32" size="sm" />
          <Select value={category} onChange={v => { setCategory(v); setPage(0) }} options={catOptions} placeholder="Danh mục" clearable searchable className="w-36" size="sm" />
          <Select value={assigneeId} onChange={v => { setAssigneeId(v); setPage(0) }} options={userOptions} placeholder="Người thực hiện" clearable searchable className="w-44" size="sm" />
          <DatePicker value={dateRange} onChange={v => { setDateRange(v); setPage(0) }} mode="range" placeholder="Khoảng ngày" clearable className="w-52" />
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-gray-400 text-sm">Không có task nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {tasks.map(t => (
            <TaskCard key={t.id} task={t} onClick={() => setDetailId(t.id)} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span className="text-sm text-gray-500 px-3">{page + 1} / {totalPages}</span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      )}

      {/* Modals */}
      {showForm && <TaskForm task={editTask} onClose={() => setShowForm(false)} onSaved={load} />}
      {detailId && <TaskDetailModal taskId={detailId} onClose={() => setDetailId(null)} isAdmin onRefresh={load} />}
    </div>
  )
}
