import { useState, useEffect, useRef } from 'react'
import { createTask, updateTask, getAssignableUsers, getCategories, createPersonalTask, updatePersonalTask } from '../../services/taskApi'
import DatePicker from '../ui/DatePicker'
import Select from '../ui/Select'
import { useToast } from '../ui/Toast'

const PRI_OPTS = [
  { value: 'LOW', label: '🟢 Thấp' },
  { value: 'MEDIUM', label: '🔵 Trung bình' },
  { value: 'HIGH', label: '🟠 Cao' },
  { value: 'URGENT', label: '🔴 Khẩn cấp' },
]

/**
 * Input số tỷ lệ % — click tự select all, không scroll wheel
 */
function WeightInput({ value, onChange, min = 1, max = 100, className = '', disabled = false }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const prevent = e => e.preventDefault()
    el.addEventListener('wheel', prevent, { passive: false })
    return () => el.removeEventListener('wheel', prevent)
  }, [])

  return (
    <input
      ref={ref}
      type="number"
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      onChange={e => {
        let v = parseInt(e.target.value, 10)
        if (isNaN(v)) v = min
        onChange(Math.max(min, Math.min(max, v)))
      }}
      onFocus={e => e.target.select()}
      className={`text-center text-xs border border-gray-200 rounded-md py-1 outline-none focus:border-blue-500 tabular-nums ${className} ${disabled ? 'bg-gray-100 text-gray-400' : ''}`}
    />
  )
}

export default function TaskForm({ task, onClose, onSaved, isPersonal = false }) {
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
  const [sequential, setSequential] = useState(task?.sequentialSubtasks || false)

  // Sub-items
  const [subItems, setSubItems] = useState(
    task?.subItems?.length ? task.subItems.map(s => ({
      title: s.title, weight: s.weight,
      assigneeId: s.assigneeId || null, assigneeName: s.assigneeName || ''
    }))
    : []
  )
  const [newSub, setNewSub] = useState('')

  const [users, setUsers] = useState([])
  const [cats, setCats] = useState([])
  const [saving, setSaving] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)

  useEffect(() => {
    if (!isPersonal) {
      getAssignableUsers().then(r => { if (r.data?.code === 900) setUsers(r.data.data || []) }).catch(()=>{})
    }
    getCategories().then(r => { if (r.data?.code === 900) setCats(r.data.data || []) }).catch(()=>{})
  }, [isPersonal])

  const totalWeight = subItems.reduce((s, i) => s + (i.weight || 0), 0)
  const remainingWeight = 100 - totalWeight

  // ── Sub-item logic (yêu cầu #5) ──
  // Khi thêm đầu mục: tự gán weight = remaining
  const addSub = () => {
    if (!newSub.trim()) return
    if (remainingWeight <= 0) { toast.warning('Đã hết trọng số (100%)'); return }
    const w = remainingWeight
    setSubItems(prev => [...prev, { title: newSub.trim(), weight: w, assigneeId: null, assigneeName: '' }])
    setNewSub('')
  }

  const removeSub = idx => {
    setSubItems(prev => {
      const next = prev.filter((_, i) => i !== idx)
      // Tự điều chỉnh weight cho item cuối nếu tổng < 100
      if (next.length > 0) {
        const currentTotal = next.reduce((s, i) => s + i.weight, 0)
        if (currentTotal < 100) {
          const last = next.length - 1
          next[last] = { ...next[last], weight: next[last].weight + (100 - currentTotal) }
        }
      }
      return next
    })
  }

  /**
   * Logic cập nhật weight (yêu cầu #5):
   * - Max 100, min 1
   * - Khi nhập weight cho item[i], item[i+1] tự điều chỉnh = phần còn lại
   * - Nếu tổng i items trước = 100, không hiện item tiếp theo
   */
  const updateSubWeight = (idx, w) => {
    setSubItems(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], weight: w }

      // Tính tổng weight từ item 0 đến idx
      const sumBefore = next.slice(0, idx + 1).reduce((s, i) => s + i.weight, 0)

      if (idx < next.length - 1) {
        // Có item sau → tự điều chỉnh weight item sau
        const remaining = 100 - sumBefore
        if (remaining > 0) {
          // Phân phối remaining cho các item sau
          const afterCount = next.length - idx - 1
          const totalAfterExceptLast = next.slice(idx + 1, -1).reduce((s, i) => s + i.weight, 0)
          const lastRemaining = Math.max(1, remaining - totalAfterExceptLast)
          next[next.length - 1] = { ...next[next.length - 1], weight: lastRemaining }
        } else if (remaining <= 0) {
          // Xóa bớt items sau nếu đã đủ 100
          return next.slice(0, idx + 1)
        }
      }

      return next
    })
  }

  const updateSubAssignee = (idx, userId) => {
    const u = users.find(x => x.id === userId)
    setSubItems(prev => prev.map((s, i) =>
      i === idx ? { ...s, assigneeId: userId || null, assigneeName: u ? (u.fullName || u.username) : '' } : s
    ))
  }

  const handleCatChange = v => {
    if (v === '__new__') { setShowNewCat(true); return }
    setCategory(v)
  }
  const addCat = () => {
    if (newCat.trim()) { setCategory(newCat.trim()); if (!cats.includes(newCat.trim())) setCats(p => [...p, newCat.trim()]) }
    setShowNewCat(false); setNewCat('')
  }

  const handleSubmit = async () => {
    if (!title.trim()) { toast.warning('Vui lòng nhập tên task'); return }
    if (subItems.length > 0 && totalWeight !== 100) { toast.warning(`Tổng trọng số phải = 100% (hiện: ${totalWeight}%)`); return }

    try {
      setSaving(true)
      const data = {
        title, description, requirements, priority,
        category: category || null, deadline,
        assigneeIds: isPersonal ? [] : assigneeIds,
        sequentialSubtasks: sequential,
        subItems: subItems.length > 0 ? subItems : null,
      }
      let res
      if (isPersonal) {
        if (isEdit) res = await updatePersonalTask(task.id, { ...data, status })
        else res = await createPersonalTask(data)
      } else {
        if (isEdit) res = await updateTask(task.id, { ...data, status })
        else res = await createTask(data)
      }

      if (res.data?.code === 900) {
        toast.success(isEdit ? 'Đã cập nhật task' : 'Đã tạo task mới')
        onSaved?.(); onClose?.()
      } else toast.error(res.data?.message || 'Lỗi')
    } catch { toast.error('Lỗi kết nối') }
    finally { setSaving(false) }
  }

  const userOpts = users.map(u => ({ value: u.id, label: `${u.fullName || u.username} (${u.role})` }))
  const catOpts = [...cats.map(c => ({ value: c, label: c })), { value: '__new__', label: '+ Thêm mới' }]

  // User options cho sub-item assignee (chỉ từ assigneeIds đã chọn)
  const subAssigneeOpts = [
    { value: '', label: '— Ai cũng được —' },
    ...users.filter(u => assigneeIds.includes(u.id)).map(u => ({
      value: u.id, label: u.fullName || u.username
    }))
  ]

  const STATUS_OPTS = [
    { value: 'NOT_STARTED', label: 'Chưa bắt đầu' },
    { value: 'IN_PROGRESS', label: 'Đang thực hiện' },
    { value: 'PAUSED', label: 'Tạm dừng' },
    { value: 'COMPLETED', label: 'Hoàn thành' },
    { value: 'CANCELLED', label: 'Đã hủy' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[5vh] overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl p-5 sm:p-6 animate-fade-in my-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Chỉnh sửa task' : isPersonal ? 'Tạo task cá nhân' : 'Tạo task mới'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400">✕</button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="label-sm">Tên task <span className="text-red-500">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="Nhập tên nhiệm vụ..." />
          </div>

          {/* Category + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-sm">Danh mục</label>
              {showNewCat ? (
                <div className="flex gap-1.5">
                  <input value={newCat} onChange={e => setNewCat(e.target.value)} className="input flex-1" placeholder="Tên..." autoFocus onKeyDown={e => e.key==='Enter' && addCat()} />
                  <button onClick={addCat} className="btn-primary px-2 py-1 text-xs">OK</button>
                </div>
              ) : (
                <Select value={category} onChange={handleCatChange} options={catOpts} placeholder="Chọn..." clearable searchable />
              )}
            </div>
            <div>
              <label className="label-sm">Độ ưu tiên</label>
              <Select value={priority} onChange={setPriority} options={PRI_OPTS} />
            </div>
          </div>

          {/* Deadline with time */}
          <div>
            <label className="label-sm">Hạn chót (ngày + giờ)</label>
            <DatePicker value={deadline} onChange={setDeadline} showTime placeholder="Chọn ngày giờ (tùy chọn)" clearable portal />
          </div>

          {/* Assignees — chỉ hiện khi không phải task cá nhân */}
          {!isPersonal && (
            <div>
              <label className="label-sm">Giao cho</label>
              <Select value={assigneeIds} onChange={setAssigneeIds} options={userOpts} multiple searchable placeholder="Chọn người thực hiện..." />
            </div>
          )}

          {/* Sub-items */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label-sm mb-0">Đầu mục công việc</label>
              <span className={`text-[10px] font-bold tabular-nums ${totalWeight === 100 ? 'text-emerald-600' : totalWeight > 100 ? 'text-red-600' : 'text-gray-400'}`}>
                {totalWeight}/100%
              </span>
            </div>

            {/* Existing subs */}
            {subItems.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {subItems.map((s, i) => {
                  // Tính max cho weight: tổng weight các items khác + remaining
                  const othersWeight = subItems.reduce((sum, item, j) => j === i ? sum : sum + item.weight, 0)
                  const maxW = 100 - othersWeight
                  const isLast = i === subItems.length - 1
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100">
                      <span className="text-xs text-gray-500 font-bold w-5 text-center">{i+1}</span>
                      <span className="flex-1 text-sm text-gray-800 truncate">{s.title}</span>

                      {/* Assignee per sub-item (chỉ khi có nhiều assignee & không phải personal) */}
                      {!isPersonal && assigneeIds.length > 1 && (
                        <select
                          value={s.assigneeId || ''}
                          onChange={e => updateSubAssignee(i, e.target.value ? +e.target.value : null)}
                          className="text-[10px] border border-gray-200 rounded-md py-1 px-1 outline-none focus:border-blue-500 max-w-[90px] truncate"
                        >
                          {subAssigneeOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      )}

                      <WeightInput
                        value={s.weight}
                        min={1}
                        max={maxW}
                        onChange={w => updateSubWeight(i, w)}
                        disabled={isLast && subItems.length > 1}
                        className="w-14"
                      />
                      <span className="text-[10px] text-gray-400">%</span>
                      <button onClick={() => removeSub(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add new sub — chỉ hiện khi tổng < 100 */}
            {totalWeight < 100 && (
              <div className="flex gap-1.5">
                <input value={newSub} onChange={e => setNewSub(e.target.value)}
                  className="input flex-1" placeholder="Tên đầu mục..."
                  onKeyDown={e => e.key === 'Enter' && addSub()} />
                <span className="self-center text-xs text-gray-400 font-bold tabular-nums w-10 text-center">{remainingWeight}%</span>
                <button onClick={addSub} className="btn-primary px-2.5 py-1 text-xs shrink-0">+</button>
              </div>
            )}

            {/* Sequential toggle */}
            {subItems.length > 1 && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={sequential} onChange={e => setSequential(e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600" />
                <span className="text-xs text-gray-600">Phải hoàn thành theo thứ tự</span>
              </label>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="label-sm">Mô tả</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="input min-h-[60px]" placeholder="Mô tả chi tiết..." />
          </div>

          {/* Requirements */}
          <div>
            <label className="label-sm">Yêu cầu</label>
            <textarea value={requirements} onChange={e => setRequirements(e.target.value)} className="input min-h-[50px]" placeholder="Yêu cầu cụ thể..." />
          </div>

          {/* Status (edit) */}
          {isEdit && (
            <div>
              <label className="label-sm">Trạng thái</label>
              <Select value={status} onChange={setStatus} options={STATUS_OPTS} />
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
