import { useState, useEffect, useCallback, useRef } from 'react'
import { listTasks, updateTask, getCategories, getAssignableUsers } from '../../services/taskApi'
import TaskCard from './TaskCard'
import TaskForm from './TaskForm'
import TaskDetailModal from './TaskDetailModal'
import Select from '../ui/Select'
import { useToast } from '../ui/Toast'

const COLUMNS = [
  { key: 'NOT_STARTED', label: 'Todo',        icon: '📋', color: 'border-t-gray-400',    bg: 'bg-gray-50/50' },
  { key: 'IN_PROGRESS', label: 'Đang xử lý', icon: '🔄', color: 'border-t-blue-500',    bg: 'bg-blue-50/30' },
  { key: 'COMPLETED',   label: 'Hoàn thành',  icon: '✅', color: 'border-t-emerald-500', bg: 'bg-emerald-50/30' },
  { key: 'PAUSED',      label: 'Tạm dừng',    icon: '⏸', color: 'border-t-amber-400',   bg: 'bg-amber-50/30' },
]

export default function AdminKanbanBoard() {
  const toast = useToast()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortAsc, setSortAsc] = useState(false) // false = newest first
  const prevTasksRef = useRef('') // for detecting changes

  // Filters
  const [q, setQ] = useState('')
  const [priority, setPriority] = useState(null)
  const [category, setCategory] = useState(null)
  const [assigneeId, setAssigneeId] = useState(null)
  const [cats, setCats] = useState([])
  const [users, setUsers] = useState([])

  // Modals
  const [showForm, setShowForm] = useState(false)
  const [editTask, setEditTask] = useState(null)
  const [detailId, setDetailId] = useState(null)

  useEffect(() => {
    getCategories().then(r => { if (r.data?.code === 900) setCats(r.data.data || []) }).catch(()=>{})
    getAssignableUsers().then(r => { if (r.data?.code === 900) setUsers(r.data.data || []) }).catch(()=>{})
  }, [])

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const params = { size: 200 }
      if (q) params.q = q
      if (priority) params.priority = priority
      if (category) params.category = category
      if (assigneeId) params.assigneeId = assigneeId
      const res = await listTasks(params)
      if (res.data?.code === 900) {
        const newTasks = res.data.data?.content || []
        const sig = JSON.stringify(newTasks.map(t => `${t.id}:${t.status}:${t.progress}`))
        if (sig !== prevTasksRef.current) {
          prevTasksRef.current = sig
          setTasks(newTasks)
        }
      }
    } catch {}
    finally { if (!silent) setLoading(false) }
  }, [q, priority, category, assigneeId])

  useEffect(() => { load() }, [load])

  // Polling every 5s for real-time feel
  useEffect(() => {
    const interval = setInterval(() => load(true), 5000)
    return () => clearInterval(interval)
  }, [load])

  // Debounce search
  const [searchBuf, setSearchBuf] = useState('')
  useEffect(() => { const t = setTimeout(() => setQ(searchBuf), 400); return () => clearTimeout(t) }, [searchBuf])

  const handlePauseResume = async (task) => {
    const newStatus = task.status === 'PAUSED' ? 'IN_PROGRESS' : 'PAUSED'
    try {
      await updateTask(task.id, { status: newStatus })
      toast.success(newStatus === 'PAUSED' ? 'Đã tạm dừng task' : 'Đã mở lại task')
      load()
    } catch { toast.error('Lỗi') }
  }

  const sorted = (arr) => {
    const s = [...arr]
    s.sort((a, b) => sortAsc ? a.createdAt - b.createdAt : b.createdAt - a.createdAt)
    return s
  }

  const catOpts = cats.map(c => ({ value: c, label: c }))
  const userOpts = users.map(u => ({ value: u.id, label: u.fullName || u.username }))

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Quản lý Task</h2>
          <p className="text-xs text-gray-500 mt-0.5">{tasks.length} task · Cập nhật tự động</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSortAsc(s => !s)}
            className="btn-ghost text-gray-500 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5">
            {sortAsc ? '↑ Cũ nhất' : '↓ Mới nhất'}
          </button>
          <button onClick={() => { setEditTask(null); setShowForm(true) }} className="btn-primary shrink-0">
            + Tạo task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[160px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <input value={searchBuf} onChange={e => setSearchBuf(e.target.value)} className="input pl-9" placeholder="Tìm task..." />
        </div>
        <Select value={priority} onChange={setPriority}
          options={[{value:'LOW',label:'Thấp'},{value:'MEDIUM',label:'TB'},{value:'HIGH',label:'Cao'},{value:'URGENT',label:'Khẩn'}]}
          placeholder="Ưu tiên" clearable className="w-28" size="sm" />
        <Select value={category} onChange={setCategory} options={catOpts} placeholder="Danh mục" clearable searchable className="w-32" size="sm" />
        <Select value={assigneeId} onChange={setAssigneeId} options={userOpts} placeholder="Người" clearable searchable className="w-36" size="sm" />
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex items-center justify-center h-60"><div className="spinner" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map(col => {
            const colTasks = sorted(tasks.filter(t => t.status === col.key))
            return (
              <div key={col.key} className={`rounded-2xl border-t-[3px] ${col.color} ${col.bg} border border-gray-200/80 min-h-[300px]`}>
                {/* Column header */}
                <div className="flex items-center justify-between px-3.5 py-3 border-b border-gray-200/60">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{col.icon}</span>
                    <span className="text-sm font-bold text-gray-800">{col.label}</span>
                    <span className="w-5 h-5 rounded-full bg-gray-200 text-[10px] font-bold text-gray-600 flex items-center justify-center">
                      {colTasks.length}
                    </span>
                  </div>
                </div>

                {/* Cards */}
                <div className="p-2 space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto">
                  {colTasks.length === 0 && (
                    <p className="text-center text-xs text-gray-400 py-8">Trống</p>
                  )}
                  {colTasks.map(t => (
                    <div key={t.id} className="task-enter">
                      <TaskCard task={t} onClick={() => setDetailId(t.id)} compact />
                      {/* Pause/Resume button for active tasks */}
                      {(t.status === 'IN_PROGRESS' || t.status === 'PAUSED' || t.status === 'NOT_STARTED') && (
                        <div className="flex justify-end mt-1 px-1">
                          {t.status !== 'PAUSED' ? (
                            <button onClick={e => { e.stopPropagation(); handlePauseResume(t) }}
                              className="text-[10px] text-amber-600 hover:text-amber-700 font-medium">⏸ Pause</button>
                          ) : (
                            <button onClick={e => { e.stopPropagation(); handlePauseResume(t) }}
                              className="text-[10px] text-blue-600 hover:text-blue-700 font-medium">▶ Resume</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && <TaskForm task={editTask} onClose={() => setShowForm(false)} onSaved={load} />}
      {detailId && <TaskDetailModal taskId={detailId} onClose={() => setDetailId(null)} isAdmin onRefresh={load} />}
    </div>
  )
}