import { useState, useEffect } from 'react'
import { createTask, updateTask, getAssignableUsers, getCategories } from '../../services/taskApi'
import DatePicker from '../ui/DatePicker'
import Select from '../ui/Select'
import { useToast } from '../ui/Toast'

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Thấp' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HIGH', label: 'Cao' },
  { value: 'URGENT', label: 'Khẩn cấp' },
]

export default function TaskForm({ task, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!task

  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [requirements, setRequirements] = useState(task?.requirements || '')
  const [priority, setPriority] = useState(task?.priority || 'MEDIUM')
  const [category, setCategory] = useState(task?.category || '')
  const [deadline, setDeadline] = useState(task?.deadline || null)
  const [assigneeIds, setAssigneeIds] = useState(task?.assignees?.map(a => a.userId) || [])
  const [status, setStatus] = useState(task?.status || 'NOT_STARTED')

  const [users, setUsers] = useState([])
  const [categories, setCats] = useState([])
  const [saving, setSaving] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)

  useEffect(() => {
    getAssignableUsers().then(r => {
      if (r.data?.code === 900) setUsers(r.data.data || [])
    }).catch(() => {})
    getCategories().then(r => {
      if (r.data?.code === 900) setCats(r.data.data || [])
    }).catch(() => {})
  }, [])

  const userOptions = users.map(u => ({
    value: u.id,
    label: `${u.fullName || u.username} (${u.role})`,
  }))

  const catOptions = [
    ...categories.map(c => ({ value: c, label: c })),
    { value: '__new__', label: '+ Thêm danh mục mới' },
  ]

  const handleCatChange = v => {
    if (v === '__new__') { setShowNewCat(true); return }
    setCategory(v)
  }

  const addNewCat = () => {
    if (newCat.trim()) {
      setCategory(newCat.trim())
      if (!categories.includes(newCat.trim())) setCats(prev => [...prev, newCat.trim()])
    }
    setShowNewCat(false)
    setNewCat('')
  }

  const handleSubmit = async () => {
    if (!title.trim()) { toast.warning('Vui lòng nhập tên task'); return }

    try {
      setSaving(true)
      const data = { title, description, requirements, priority, category: category || null, deadline, assigneeIds }

      let res
      if (isEdit) {
        res = await updateTask(task.id, { ...data, status })
      } else {
        res = await createTask(data)
      }

      if (res.data?.code === 900) {
        toast.success(isEdit ? 'Đã cập nhật task' : 'Đã tạo task mới')
        onSaved?.()
        onClose?.()
      } else {
        toast.error(res.data?.message || 'Lỗi lưu task')
      }
    } catch { toast.error('Lỗi kết nối') }
    finally { setSaving(false) }
  }

  const STATUS_OPTIONS = [
    { value: 'NOT_STARTED', label: 'Chưa bắt đầu' },
    { value: 'IN_PROGRESS', label: 'Đang thực hiện' },
    { value: 'COMPLETED', label: 'Hoàn thành' },
    { value: 'CANCELLED', label: 'Đã hủy' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Chỉnh sửa task' : 'Tạo task mới'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Tên task <span className="text-red-500">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="Nhập tên nhiệm vụ..." />
          </div>

          {/* Category + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Danh mục</label>
              {showNewCat ? (
                <div className="flex gap-1.5">
                  <input value={newCat} onChange={e => setNewCat(e.target.value)} className="input flex-1" placeholder="Tên mới..." autoFocus onKeyDown={e => e.key === 'Enter' && addNewCat()} />
                  <button onClick={addNewCat} className="btn-primary px-2 py-1 text-xs">OK</button>
                </div>
              ) : (
                <Select value={category} onChange={handleCatChange} options={catOptions} placeholder="Chọn..." clearable searchable />
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Độ ưu tiên</label>
              <Select value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Hạn chót</label>
            <DatePicker value={deadline} onChange={setDeadline} placeholder="Chọn ngày (tùy chọn)" clearable />
          </div>

          {/* Assignees */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Giao cho</label>
            <Select value={assigneeIds} onChange={setAssigneeIds} options={userOptions} multiple searchable placeholder="Chọn người thực hiện..." />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Mô tả</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="input min-h-[80px]" placeholder="Mô tả chi tiết về task..." />
          </div>

          {/* Requirements */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Yêu cầu</label>
            <textarea value={requirements} onChange={e => setRequirements(e.target.value)} className="input min-h-[60px]" placeholder="Yêu cầu cụ thể cần hoàn thành..." />
          </div>

          {/* Status (edit only) */}
          {isEdit && (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Trạng thái</label>
              <Select value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button onClick={handleSubmit} disabled={saving} className="btn-primary flex-1 justify-center">
              {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo task'}
            </button>
            <button onClick={onClose} className="btn-secondary">Hủy</button>
          </div>
        </div>
      </div>
    </div>
  )
}
