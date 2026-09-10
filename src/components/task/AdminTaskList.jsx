import { useState, useEffect, useCallback } from 'react'
import { listTasks, deleteTask, getCategories, getAssignableUsers, reassignTask } from '../../services/taskApi'
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
  const [reassignTaskData, setReassignTaskData] = useState(null)

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
          <p className="text-xs text-gray-500 mt-0.5">{total} task (chỉ task do admin tạo)</p>
        </div>
        <button onClick={() => { setEditTask(null); setShowForm(true) }} className="btn-primary shrink-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          Tạo task mới
        </button>
      </div>

      {/* Filters */}
      <div className="card p-3 mb-4">
        <div className="flex flex-wrap gap-2">
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
            <div key={t.id} className="relative group">
              <TaskCard task={t} onClick={() => setDetailId(t.id)} />
              {/* Admin actions overlay */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
                <button
                  onClick={e => { e.stopPropagation(); setReassignTaskData(t) }}
                  className="w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center text-blue-600 hover:bg-blue-50"
                  title="Đổi người xử lý"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v4l2.5 1.5M11 6a5 5 0 11-10 0 5 5 0 0110 0z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setEditTask(t); setShowForm(true) }}
                  className="w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center text-gray-600 hover:bg-gray-50"
                  title="Sửa"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M7.5 1.5l1 1-5.5 5.5H2V7L7.5 1.5z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(t.id) }}
                  className="w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center text-red-500 hover:bg-red-50"
                  title="Xóa"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3h6M3.5 3V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5V3M4 4.5v2.5M6 4.5v2.5M3 3l.5 5h3l.5-5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
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
      {reassignTaskData && (
        <ReassignModal
          task={reassignTaskData}
          users={users}
          onClose={() => setReassignTaskData(null)}
          onSaved={() => { setReassignTaskData(null); load() }}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// REASSIGN MODAL (#2)
// ═══════════════════════════════════════════════════════════════════
function ReassignModal({ task, users, onClose, onSaved }) {
  const toast = useToast()
  const [ids, setIds] = useState(task.assignees?.map(a => a.userId) || [])
  const [saving, setSaving] = useState(false)

  const userOpts = users.map(u => ({
    value: u.id,
    label: `${u.fullName || u.username} (${u.role})`
  }))

  const handleSave = async () => {
    if (ids.length === 0) { toast.warning('Chọn ít nhất 1 người'); return }
    try {
      setSaving(true)
      const res = await reassignTask(task.id, { assigneeIds: ids })
      if (res.data?.code === 900) {
        toast.success('Đã cập nhật người xử lý')
        onSaved?.()
      } else toast.error(res.data?.message || 'Lỗi')
    } catch { toast.error('Lỗi kết nối') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">Đổi người xử lý</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[300px]">{task.title}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400">✕</button>
        </div>

        <div className="mb-4">
          <label className="label-sm">Người thực hiện</label>
          <Select value={ids} onChange={setIds} options={userOpts} multiple searchable placeholder="Chọn người..." />
        </div>

        {/* Current assignees */}
        {task.assignees?.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-gray-500 font-semibold mb-1">Hiện tại:</p>
            <div className="flex flex-wrap gap-1">
              {task.assignees.map(a => (
                <span key={a.userId} className="badge bg-blue-50 text-blue-700 text-xs">{a.fullName || a.username}</span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? 'Đang lưu...' : 'Cập nhật'}
          </button>
          <button onClick={onClose} className="btn-secondary">Hủy</button>
        </div>
      </div>
    </div>
  )
}
